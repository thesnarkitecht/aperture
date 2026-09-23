/**
 * Frame pipeline:
 *   1. Scene        → HDR (RGBA16F, MSAA) + float depth texture. Opaque surfaces only, unfogged.
 *   2. Clouds       → volumetric raymarch at reduced resolution (inscatter RGB + transmittance A).
 *   3. Composite    → sky, sun disk, cirrus, aerial perspective from depth, depth-aware cloud upsample.
 *   4. Overlay      → soft particles (cloud wisps, mist) drawn over the composite.
 *   5. Bloom + god rays (radial blur of the unoccluded sun).
 *   6. Final        → exposure, filmic tonemap, colour grade, vignette, grain, sRGB.
 */
import * as THREE from 'three';
import { FullscreenQuad, passMaterial } from './FullscreenQuad';
import { G } from './ShaderLib';
import type { Quality } from '../core/Settings';
import type { NoiseSet } from './NoiseTextures';

const CLOUD_FRAG = /* glsl */ `
precision highp float;
precision highp sampler3D;
varying vec2 vUv;
uniform sampler2D uDepth;
uniform sampler3D uShape;
uniform sampler3D uDetail;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec2 uRes;
uniform float uFrame;
uniform int uSteps;
uniform int uLightSteps;
uniform float uDetailOn;
#include <aw_common>
#include <aw_atmosphere>
#include <aw_clouds>

const float SHAPE_SCALE = 1.0 / 2200.0;
const float DETAIL_SCALE = 1.0 / 190.0;

float cloudDensity(vec3 p, bool detail, float lod) {
  float tower;
  float cov = aw_cloudCoverage(p.xz, tower);
  if (cov < 0.02) return 0.0;
  if (p.y < uCloudLayer.x || p.y > uCloudLayer.y + 300.0) return 0.0;
  vec3 q = p + vec3(uCloudWind.x, 0.0, uCloudWind.y);
  vec4 s = textureLod(uShape, q * SHAPE_SCALE, lod);
  // Billowing tops: the column height follows the low-frequency shape noise.
  vec4 sl = textureLod(uShape, vec3(q.x, 0.0, q.z) * SHAPE_SCALE * 0.55, lod + 1.0);
  float top = aw_cloudTop(cov, tower) + (sl.r - 0.45) * 420.0;
  float hf = (p.y - uCloudLayer.x) / max(top - uCloudLayer.x, 60.0);
  if (hf <= 0.0 || hf >= 1.0) return 0.0;
  float prof = smoothstep(0.0, 0.1, hf) * smoothstep(1.0, 0.35 - tower * 0.2, hf);
  float fbm = s.g * 0.625 + s.b * 0.25 + s.a * 0.125;
  float base = clamp(aw_remap(s.r, fbm - 1.0, 1.0, 0.0, 1.0), 0.0, 1.0);
  float c = clamp(aw_remap(base * prof, 1.0 - cov, 1.0, 0.0, 1.0), 0.0, 1.0);
  if (c <= 0.0) return 0.0;
  if (detail) {
    vec3 dq = q * DETAIL_SCALE + vec3(0.0, uTime * 0.01, 0.0);
    vec4 d = textureLod(uDetail, dq, 0.0);
    float dfbm = d.r * 0.625 + d.g * 0.25 + d.b * 0.125;
    float m = mix(dfbm, 1.0 - dfbm, clamp(hf * 6.0, 0.0, 1.0));
    c = clamp(aw_remap(c, m * 0.32, 1.0, 0.0, 1.0), 0.0, 1.0);
  }
  return c * mix(0.9, 1.25, cov);
}

void main() {
  vec2 uv = vUv;
  float depth = texture(uDepth, uv).r;
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 wp = uInvViewProj * ndc;
  wp /= wp.w;
  vec3 ro = uCamPos;
  vec3 rd = normalize(wp.xyz - ro);
  float sceneDist = depth >= 1.0 ? 1e7 : length(wp.xyz - ro);

  float yMin = uCloudLayer.x;
  float yMax = uCloudLayer.y + 300.0;
  float t0, t1;
  if (abs(rd.y) < 1e-5) { t0 = 0.0; t1 = 1e7; }
  else {
    float ta = (yMin - ro.y) / rd.y;
    float tb = (yMax - ro.y) / rd.y;
    t0 = max(0.0, min(ta, tb));
    t1 = max(ta, tb);
  }
  if (ro.y > yMin && ro.y < yMax) t0 = 0.0;
  t1 = min(t1, min(sceneDist, 60000.0));
  if (t1 <= t0 || t1 < 0.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

  float mu = dot(rd, uSunDir);
  float phase = mix(aw_hg(mu, 0.75), aw_hg(mu, -0.2), 0.35) * 4.0 * AW_PI;
  float jitter = aw_ign(gl_FragCoord.xy + uFrame * 5.588);

  vec3 skyTop = aw_sky(vec3(0.0, 1.0, 0.0)) * 1.2 + vec3(0.05, 0.05, 0.08);
  vec3 skyHor = aw_sky(normalize(vec3(-uSunDir.x, 0.05, -uSunDir.z)));

  float T = 1.0;
  vec3 L = vec3(0.0);
  float t = t0;
  float span = t1 - t0;
  float baseStep = clamp(span / float(uSteps), 6.0, 900.0);
  float weightedT = 0.0;
  float wsum = 0.0;
  for (int i = 0; i < 160; i++) {
    if (i >= uSteps || t >= t1 || T < 0.02) break;
    float dt = max(baseStep, t * 0.012) * (i == 0 ? jitter + 0.1 : 1.0);
    vec3 p = ro + rd * (t + dt * 0.5);
    float lod = clamp(log2(1.0 + t / 3500.0), 0.0, 4.0);
    float dens = cloudDensity(p, uDetailOn > 0.5 && t < 9000.0, lod);
    if (dens > 0.003) {
      // Light march towards the sun.
      float od = 0.0;
      float ls = 22.0;
      vec3 lp = p;
      for (int j = 0; j < 8; j++) {
        if (j >= uLightSteps) break;
        lp += uSunDir * ls;
        od += cloudDensity(lp, false, lod + 1.0) * ls;
        ls *= 1.9;
      }
      // Long-range occlusion along the sun ray through the rest of the deck.
      float far = 0.0;
      for (int j = 1; j <= 3; j++) {
        vec3 fp = p + uSunDir * (float(j) * 900.0);
        float tw;
        float cv = aw_cloudCoverage(fp.xz, tw);
        far += step(fp.y, aw_cloudTop(cv, tw)) * smoothstep(0.5, 0.85, cv);
      }
      float sigma = 0.075;
      float hf = clamp((p.y - uCloudLayer.x) / (uCloudLayer.y - uCloudLayer.x), 0.0, 1.0);
      vec3 sunL = vec3(0.0);
      float att = 1.0, contrib = 1.0, pa = 1.0;
      for (int o = 0; o < 3; o++) {
        float ph = mix(aw_hg(mu, 0.75 * pa), aw_hg(mu, -0.2 * pa), 0.35) * 4.0 * AW_PI;
        sunL += contrib * exp(-od * sigma * att - far * 1.1 * att) * ph;
        att *= 0.35; contrib *= 0.55; pa *= 0.6;
      }
      // Stylised cloud lighting: a crisp lit/shadow split, warm peach-white light, lavender
      // shade, a pink terminator and a thin silver lining towards the sun.
      float tl = exp(-od * sigma - far * 1.1);
      float band = smoothstep(0.16, 0.3, tl);
      float term = smoothstep(0.05, 0.16, tl) * (1.0 - smoothstep(0.16, 0.34, tl));
      vec3 litC = uSunColor * vec3(1.0, 0.95, 0.9) * 0.4;
      vec3 shadeC = mix(vec3(0.62, 0.58, 0.95), vec3(1.0, 0.86, 1.15), hf) * mix(0.62, 1.0, hf);
      vec3 S = mix(shadeC, litC, band) + uSunColor * vec3(1.0, 0.5, 0.55) * term * 0.1
             + uSunColor * sunL * 0.035 * band;
      float ext = dens * sigma;
      float Tr = exp(-ext * dt);
      vec3 Sint = S * (1.0 - Tr);
      // Aerial perspective on each sample.
      vec3 aT = aw_aerialT(ro, rd, t);
      vec3 fogC = aw_fogColor(rd, ro.y);
      Sint = Sint * aT + fogC * (1.0 - aT) * (1.0 - Tr);
      L += T * Sint;
      weightedT += t * T * (1.0 - Tr);
      wsum += T * (1.0 - Tr);
      T *= Tr;
    }
    t += dt;
  }
  gl_FragColor = vec4(L, T);
}`;

const COMPOSITE_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uDepth;
uniform sampler2D uClouds;
uniform vec2 uCloudTexel;
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform float uSunSize;
uniform sampler2D uNoise2D;
uniform vec2 uNearFar;
uniform vec2 uTexel;
#include <aw_common>
#include <aw_atmosphere>

vec3 cirrus(vec3 ro, vec3 rd) {
  if (rd.y <= 0.0) return vec3(0.0);
  float h = 6500.0 - ro.y;
  float t = h / rd.y;
  vec2 p = ro.xz + rd.xz * t;
  vec2 q = p * vec2(1.0 / 26000.0, 1.0 / 9000.0) + vec2(uTime * 0.0006, 0.0);
  float n = texture(uNoise2D, q).r * 0.6 + texture(uNoise2D, q * 3.1 + 0.3).b * 0.4;
  float streak = texture(uNoise2D, p * vec2(1.0 / 60000.0, 1.0 / 5000.0)).a;
  float d = smoothstep(0.5, 0.85, n) * smoothstep(0.25, 0.7, streak);
  float fade = smoothstep(0.0, 0.08, rd.y) * exp(-t / 90000.0);
  float mu = dot(rd, uSunDir);
  vec3 lit = uSunColor * vec3(1.0, 0.62, 0.55) * (0.1 + 0.6 * aw_hg(mu, 0.6));
  vec3 base = aw_sky(rd) * 1.35;
  return (lit * 0.45 + base * 0.5) * d * fade;
}

void main() {
  vec2 uv = vUv;
  vec4 sc = texture(uScene, uv);
  float depth = texture(uDepth, uv).r;
  vec4 ndc = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 wp = uInvViewProj * ndc;
  wp /= wp.w;
  vec3 ro = uCamPos;
  vec3 rd = normalize(wp.xyz - ro);
  vec3 col;
  float mask = sc.a;
  if (depth >= 1.0) {
    col = aw_sky(rd);
    float mu = dot(rd, uSunDir);
    float cosR = cos(uSunSize);
    if (mu > cosR) {
      float r = sqrt(max(0.0, 1.0 - (1.0 - mu) / (1.0 - cosR)));
      col += uSunColor * 55.0 * (0.45 + 0.55 * pow(r, 0.6));
    }
    col += uSunColor * pow(max(mu, 0.0), 1200.0) * 3.0;
    col += cirrus(ro, rd);
    mask = 1.0;
  } else {
    float dist = length(wp.xyz - ro);
    // Ink outline: darken silhouettes where the depth steps away sharply behind a surface.
    float zc = uNearFar.x * uNearFar.y / (uNearFar.y - depth * (uNearFar.y - uNearFar.x));
    float jump = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(i == 0 ? 1.0 : i == 1 ? -1.0 : 0.0, i == 2 ? 1.0 : i == 3 ? -1.0 : 0.0) * uTexel;
      float dn = texture(uDepth, uv + o).r;
      float zn = uNearFar.x * uNearFar.y / (uNearFar.y - dn * (uNearFar.y - uNearFar.x));
      jump = max(jump, (zn - zc) / zc);
    }
    float ink = smoothstep(0.06, 0.25, jump) * (1.0 - smoothstep(60.0, 400.0, zc));
    vec3 base = mix(sc.rgb, sc.rgb * vec3(0.28, 0.22, 0.3), ink * 0.85);
    col = aw_applyAerial(base, ro, rd, dist);
  }

  // Depth-aware upsample of the low-resolution clouds.
  vec4 c = texture(uClouds, uv);
  col = col * c.a + c.rgb;
  gl_FragColor = vec4(col, mask);
}`;

const BLOOM_DOWN = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uPrefilter;
vec3 pre(vec3 c) {
  if (uPrefilter < 0.5) return c;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(1.2, 5.0, l);
  return min(c * (0.12 + 0.88 * k), vec3(60.0));
}
void main() {
  vec2 t = uTexel;
  vec3 a = texture(uSrc, vUv + t * vec2(-2, 2)).rgb;
  vec3 b = texture(uSrc, vUv + t * vec2(0, 2)).rgb;
  vec3 c = texture(uSrc, vUv + t * vec2(2, 2)).rgb;
  vec3 d = texture(uSrc, vUv + t * vec2(-2, 0)).rgb;
  vec3 e = texture(uSrc, vUv).rgb;
  vec3 f = texture(uSrc, vUv + t * vec2(2, 0)).rgb;
  vec3 g = texture(uSrc, vUv + t * vec2(-2, -2)).rgb;
  vec3 h = texture(uSrc, vUv + t * vec2(0, -2)).rgb;
  vec3 i = texture(uSrc, vUv + t * vec2(2, -2)).rgb;
  vec3 j = texture(uSrc, vUv + t * vec2(-1, 1)).rgb;
  vec3 k = texture(uSrc, vUv + t * vec2(1, 1)).rgb;
  vec3 l = texture(uSrc, vUv + t * vec2(-1, -1)).rgb;
  vec3 m = texture(uSrc, vUv + t * vec2(1, -1)).rgb;
  vec3 o = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  gl_FragColor = vec4(pre(o), 1.0);
}`;

const BLOOM_UP = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uPrev;
uniform vec2 uTexel;
uniform float uRadius;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = texture(uSrc, vUv + vec2(-t.x, t.y)).rgb + texture(uSrc, vUv + vec2(t.x, t.y)).rgb
    + texture(uSrc, vUv + vec2(-t.x, -t.y)).rgb + texture(uSrc, vUv + vec2(t.x, -t.y)).rgb
    + 2.0 * (texture(uSrc, vUv + vec2(0.0, t.y)).rgb + texture(uSrc, vUv + vec2(0.0, -t.y)).rgb
    + texture(uSrc, vUv + vec2(t.x, 0.0)).rgb + texture(uSrc, vUv + vec2(-t.x, 0.0)).rgb)
    + 4.0 * texture(uSrc, vUv).rgb;
  gl_FragColor = vec4(texture(uPrev, vUv).rgb + s / 16.0, 1.0);
}`;

const RAYS_MASK = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uDepth;
uniform vec2 uSunUV;
uniform float uAspect;
void main() {
  float d = texture(uDepth, vUv).r;
  vec3 c = texture(uSrc, vUv).rgb;
  float l = dot(c, vec3(0.3, 0.5, 0.2));
  vec2 dv = (vUv - uSunUV) * vec2(uAspect, 1.0);
  float fall = exp(-dot(dv, dv) * 5.0);
  float sky = d >= 1.0 ? 1.0 : 0.0;
  gl_FragColor = vec4(c * smoothstep(0.8, 6.0, l) * sky * fall, 1.0);
}`;

const RAYS_BLUR = /* glsl */ `
varying vec2 vUv;
uniform sampler2D uSrc;
uniform vec2 uSunUV;
uniform float uLength;
void main() {
  vec2 dir = (uSunUV - vUv) * uLength / 40.0;
  vec3 acc = vec3(0.0);
  float w = 1.0, ws = 0.0;
  vec2 p = vUv;
  for (int i = 0; i < 40; i++) {
    acc += texture(uSrc, p).rgb * w;
    ws += w;
    w *= 0.965;
    p += dir;
  }
  gl_FragColor = vec4(acc / ws, 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSrc;
uniform sampler2D uBloom;
uniform sampler2D uRays;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uRaysStrength;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform vec2 uRes;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uSaturation;
uniform float uContrast;

vec3 aces(vec3 x) {
  // Narkowicz fit with a softer shoulder.
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main() {
  vec2 uv = vUv;
  // Subtle chromatic aberration towards the edges.
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec3 col;
  col.r = texture(uSrc, uv - cc * r2 * 0.006).r;
  col.g = texture(uSrc, uv).g;
  col.b = texture(uSrc, uv + cc * r2 * 0.006).b;
  vec3 bloom = texture(uBloom, uv).rgb;
  col += bloom * uBloomStrength;
  col += texture(uRays, uv).rgb * uRaysStrength * vec3(1.0, 0.8, 0.6);
  col *= uExposure;

  // Filmic tonemap with a gentle desaturation of extreme highlights.
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, vec3(l), smoothstep(4.0, 30.0, l) * 0.5);
  col = aces(col);

  // Grade: split-tone (cool violet shadows, warm highlights), contrast, saturation.
  float lg = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(col, col * vec3(0.92, 0.94, 1.08), (1.0 - smoothstep(0.0, 0.45, lg)) * 0.6);
  col = mix(col, col * vec3(1.05, 1.0, 0.93), smoothstep(0.45, 1.0, lg) * 0.5);
  col = (col - 0.5) * uContrast + 0.5;
  lg = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(lg), col, uSaturation), 0.0);

  // Vignette
  float vig = 1.0 - smoothstep(0.35, 1.05, length(cc * vec2(1.25, 1.0)) * 1.25) * uVignette;
  col *= vig;
  col = mix(col, uFadeColor, uFade);

  // sRGB encode + grain + dither.
  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  float g = hash(uv * uRes + fract(uTime * 13.7) * 100.0) - 0.5;
  col += g * uGrain + (hash(uv * uRes * 1.37) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
}`;

function rt(w: number, h: number, type: THREE.TextureDataType = THREE.HalfFloatType): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(w, h, {
    type,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
}

export interface PipelineParams {
  exposure: number;
  bloom: number;
  rays: number;
  vignette: number;
  grain: number;
  fade: number;
  fadeColor: THREE.Color;
  saturation: number;
  contrast: number;
}

export class Pipeline {
  params: PipelineParams = {
    exposure: 0.46,
    bloom: 0.06,
    rays: 0.35,
    vignette: 0.42,
    grain: 0.022,
    fade: 0,
    fadeColor: new THREE.Color(0, 0, 0),
    saturation: 1.12,
    contrast: 0.97,
  };
  private sceneRT!: THREE.WebGLRenderTarget;
  private cloudRT!: THREE.WebGLRenderTarget;
  private compRT!: THREE.WebGLRenderTarget;
  private bloomRTs: THREE.WebGLRenderTarget[] = [];
  private bloomUpRTs: THREE.WebGLRenderTarget[] = [];
  private raysA!: THREE.WebGLRenderTarget;
  private raysB!: THREE.WebGLRenderTarget;
  private quad = new FullscreenQuad(new THREE.MeshBasicMaterial());
  private cloudMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private downMat: THREE.ShaderMaterial;
  private upMat: THREE.ShaderMaterial;
  private raysMaskMat: THREE.ShaderMaterial;
  private raysBlurMat: THREE.ShaderMaterial;
  private finalMat: THREE.ShaderMaterial;
  private invViewProj = new THREE.Matrix4();
  private width = 1;
  private height = 1;
  private frame = 0;
  /** Scene drawn after the composite (soft particles); may read the depth texture. */
  overlayScene: THREE.Scene | null = null;

  constructor(private renderer: THREE.WebGLRenderer, private quality: Quality, noise: NoiseSet) {
    this.cloudMat = passMaterial(CLOUD_FRAG, {
      ...G,
      uDepth: { value: null },
      uShape: { value: noise.shape },
      uDetail: { value: noise.detail },
      uInvViewProj: { value: this.invViewProj },
      uCamPos: { value: new THREE.Vector3() },
      uRes: { value: new THREE.Vector2() },
      uFrame: { value: 0 },
      uSteps: { value: quality.cloudSteps },
      uLightSteps: { value: quality.cloudLightSteps },
      uDetailOn: { value: quality.cloudDetail ? 1 : 0 },
    } as Record<string, THREE.IUniform>);
    this.compMat = passMaterial(COMPOSITE_FRAG, {
      ...G,
      uScene: { value: null },
      uDepth: { value: null },
      uClouds: { value: null },
      uCloudTexel: { value: new THREE.Vector2() },
      uInvViewProj: { value: this.invViewProj },
      uCamPos: { value: new THREE.Vector3() },
      uSunSize: { value: 0.6 * (Math.PI / 180) },
      uNearFar: { value: new THREE.Vector2(0.25, 160000) },
      uTexel: { value: new THREE.Vector2(1, 1) },
    } as Record<string, THREE.IUniform>);
    this.downMat = passMaterial(BLOOM_DOWN, { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uPrefilter: { value: 0 } });
    this.upMat = passMaterial(BLOOM_UP, {
      uSrc: { value: null },
      uPrev: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRadius: { value: 1 },
    });
    this.raysMaskMat = passMaterial(RAYS_MASK, {
      uSrc: { value: null },
      uDepth: { value: null },
      uSunUV: { value: new THREE.Vector2() },
      uAspect: { value: 1 },
    });
    this.raysBlurMat = passMaterial(RAYS_BLUR, { uSrc: { value: null }, uSunUV: { value: new THREE.Vector2() }, uLength: { value: 1 } });
    this.finalMat = passMaterial(FINAL_FRAG, {
      uSrc: { value: null },
      uBloom: { value: null },
      uRays: { value: null },
      uExposure: { value: 1 },
      uBloomStrength: { value: 0.05 },
      uRaysStrength: { value: 0.3 },
      uTime: G.uTime,
      uVignette: { value: 0.4 },
      uGrain: { value: 0.02 },
      uRes: { value: new THREE.Vector2() },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color() },
      uSaturation: { value: 1 },
      uContrast: { value: 1 },
    });
    this.allocate(1, 1);
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.cloudMat.uniforms.uSteps.value = q.cloudSteps;
    this.cloudMat.uniforms.uLightSteps.value = q.cloudLightSteps;
    this.cloudMat.uniforms.uDetailOn.value = q.cloudDetail ? 1 : 0;
    this.allocate(this.width, this.height, true);
  }

  get depthTexture(): THREE.DepthTexture {
    return this.sceneRT.depthTexture as THREE.DepthTexture;
  }

  private disposeTargets(): void {
    this.sceneRT?.dispose();
    this.sceneRT?.depthTexture?.dispose();
    this.cloudRT?.dispose();
    this.compRT?.dispose();
    this.raysA?.dispose();
    this.raysB?.dispose();
    for (const r of this.bloomRTs) r.dispose();
    for (const r of this.bloomUpRTs) r.dispose();
    this.bloomRTs = [];
    this.bloomUpRTs = [];
  }

  allocate(w: number, h: number, force = false): void {
    w = Math.max(1, Math.floor(w));
    h = Math.max(1, Math.floor(h));
    if (!force && w === this.width && h === this.height && this.sceneRT) return;
    this.disposeTargets();
    this.width = w;
    this.height = h;
    const depthTex = new THREE.DepthTexture(w, h, THREE.FloatType);
    depthTex.format = THREE.DepthFormat;
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      samples: this.quality.msaa,
      depthBuffer: true,
      depthTexture: depthTex,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
    });
    const cd = this.quality.cloudDivisor;
    this.cloudRT = rt(Math.ceil(w / cd), Math.ceil(h / cd));
    this.compRT = rt(w, h);
    let bw = Math.floor(w / 2);
    let bh = Math.floor(h / 2);
    for (let i = 0; i < 6; i++) {
      this.bloomRTs.push(rt(Math.max(1, bw), Math.max(1, bh)));
      this.bloomUpRTs.push(rt(Math.max(1, bw), Math.max(1, bh)));
      bw = Math.floor(bw / 2);
      bh = Math.floor(bh / 2);
    }
    this.raysA = rt(Math.ceil(w / 4), Math.ceil(h / 4));
    this.raysB = rt(Math.ceil(w / 4), Math.ceil(h / 4));
    this.cloudMat.uniforms.uRes.value.set(this.cloudRT.width, this.cloudRT.height);
    this.compMat.uniforms.uCloudTexel.value.set(1 / this.cloudRT.width, 1 / this.cloudRT.height);
    this.finalMat.uniforms.uRes.value.set(w, h);
  }

  private pass(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.quad.render(this.renderer);
  }

  render(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    const r = this.renderer;
    this.frame++;
    camera.updateMatrixWorld();
    this.invViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert();

    // 1. Scene
    r.setRenderTarget(this.sceneRT);
    r.setClearColor(0x000000, 1);
    r.clear(true, true, true);
    r.render(scene, camera);

    // 2. Clouds
    const cu = this.cloudMat.uniforms;
    cu.uDepth.value = this.sceneRT.depthTexture;
    cu.uCamPos.value.copy(camera.position);
    cu.uFrame.value = this.frame % 64;
    this.pass(this.cloudMat, this.cloudRT);

    // 3. Composite
    const mu = this.compMat.uniforms;
    mu.uScene.value = this.sceneRT.texture;
    mu.uDepth.value = this.sceneRT.depthTexture;
    mu.uClouds.value = this.cloudRT.texture;
    mu.uCamPos.value.copy(camera.position);
    mu.uNearFar.value.set(camera.near, camera.far);
    mu.uTexel.value.set(1 / this.width, 1 / this.height);
    this.pass(this.compMat, this.compRT);

    // 4. Overlay particles
    if (this.overlayScene) {
      r.setRenderTarget(this.compRT);
      r.render(this.overlayScene, camera);
    }

    // 5a. Bloom
    const p = this.params;
    let src: THREE.Texture = this.compRT.texture;
    let sw = this.width;
    let sh = this.height;
    const dm = this.downMat.uniforms;
    for (let i = 0; i < this.bloomRTs.length; i++) {
      dm.uSrc.value = src;
      dm.uTexel.value.set(1 / sw, 1 / sh);
      dm.uPrefilter.value = i === 0 ? 1 : 0;
      this.pass(this.downMat, this.bloomRTs[i]);
      src = this.bloomRTs[i].texture;
      sw = this.bloomRTs[i].width;
      sh = this.bloomRTs[i].height;
    }
    const um = this.upMat.uniforms;
    let prev: THREE.Texture = this.bloomRTs[this.bloomRTs.length - 1].texture;
    for (let i = this.bloomRTs.length - 2; i >= 0; i--) {
      um.uSrc.value = prev;
      um.uPrev.value = this.bloomRTs[i].texture;
      um.uTexel.value.set(1 / this.bloomRTs[i].width, 1 / this.bloomRTs[i].height);
      this.pass(this.upMat, this.bloomUpRTs[i]);
      prev = this.bloomUpRTs[i].texture;
    }

    // 5b. God rays — only when the sun is near the frame.
    const sun = G.uSunDir.value.clone().multiplyScalar(1e5).add(camera.position).project(camera);
    const sunUV = new THREE.Vector2(sun.x * 0.5 + 0.5, sun.y * 0.5 + 0.5);
    const behind = sun.z > 1;
    const near = !behind && Math.abs(sun.x) < 1.8 && Math.abs(sun.y) < 1.8;
    let raysStrength = 0;
    if (this.quality.godRays && near) {
      this.raysMaskMat.uniforms.uSrc.value = this.compRT.texture;
      this.raysMaskMat.uniforms.uDepth.value = this.sceneRT.depthTexture;
      this.raysMaskMat.uniforms.uSunUV.value.copy(sunUV);
      this.raysMaskMat.uniforms.uAspect.value = this.width / this.height;
      this.pass(this.raysMaskMat, this.raysA);
      this.raysBlurMat.uniforms.uSrc.value = this.raysA.texture;
      this.raysBlurMat.uniforms.uSunUV.value.copy(sunUV);
      this.raysBlurMat.uniforms.uLength.value = 0.9;
      this.pass(this.raysBlurMat, this.raysB);
      this.raysBlurMat.uniforms.uSrc.value = this.raysB.texture;
      this.raysBlurMat.uniforms.uLength.value = 0.35;
      this.pass(this.raysBlurMat, this.raysA);
      raysStrength = p.rays * (1 - Math.min(1, Math.max(Math.abs(sun.x), Math.abs(sun.y)) - 0.8));
    }

    // 6. Final
    const fu = this.finalMat.uniforms;
    fu.uSrc.value = this.compRT.texture;
    fu.uBloom.value = this.bloomUpRTs[0].texture;
    fu.uRays.value = this.raysA.texture;
    fu.uExposure.value = p.exposure;
    fu.uBloomStrength.value = this.quality.bloom ? p.bloom : 0;
    fu.uRaysStrength.value = Math.max(0, raysStrength);
    fu.uVignette.value = p.vignette;
    fu.uGrain.value = p.grain;
    fu.uFade.value = p.fade;
    fu.uFadeColor.value.copy(p.fadeColor);
    fu.uSaturation.value = p.saturation;
    fu.uContrast.value = p.contrast;
    this.pass(this.finalMat, null);
  }
}
