/**
 * Precomputes sky radiance into an HDR lat-long texture.
 *
 * A single-scattering atmosphere (Rayleigh + Mie + ozone absorption, with a cheap isotropic
 * multiple-scattering term) is ray-marched once per texel, then graded towards an art-directed
 * golden-hour palette: deep blue zenith → violet → pink → orange → warm yellow at the sun.
 * The elevation axis is sqrt-mapped so the horizon, where sunsets happen, gets most texels.
 */
import * as THREE from 'three';
import { FullscreenQuad, passMaterial } from '../render/FullscreenQuad';

const FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform vec3 uSunDir;
uniform float uSunIntensity;
uniform float uScale;

#define PI 3.14159265359
const float Rg = 6360e3;
const float Rt = 6460e3;
const vec3 betaR = vec3(5.802, 13.558, 33.1) * 1e-6;
const float betaMs = 3.996e-6;
const float betaMe = 4.40e-6;
const vec3 betaO = vec3(0.650, 1.881, 0.085) * 1e-6;
const float HR = 8000.0;
const float HM = 1200.0;

vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(-1.0);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}

vec3 density(float h) {
  return vec3(exp(-h / HR), exp(-h / HM), max(0.0, 1.0 - abs(h - 25000.0) / 15000.0));
}

vec3 extinctionAt(float h) {
  vec3 d = density(h);
  return betaR * d.x + vec3(betaMe) * d.y + betaO * d.z;
}

vec3 transmittanceToSun(vec3 p) {
  vec2 g = raySphere(p, uSunDir, Rg);
  if (g.x > 0.0) return vec3(0.0);
  float tEnd = raySphere(p, uSunDir, Rt).y;
  const int N = 16;
  float dt = tEnd / float(N);
  vec3 od = vec3(0.0);
  for (int i = 0; i < N; i++) {
    vec3 q = p + uSunDir * (float(i) + 0.5) * dt;
    od += extinctionAt(length(q) - Rg) * dt;
  }
  return exp(-od);
}

float phaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float phaseM(float mu, float g) {
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(1.0 + g2 - 2.0 * g * mu, 1.5));
}

vec3 physicalSky(vec3 rd) {
  vec3 ro = vec3(0.0, Rg + 1400.0, 0.0);
  vec2 top = raySphere(ro, rd, Rt);
  vec2 gnd = raySphere(ro, rd, Rg);
  float tMax = top.y;
  if (gnd.x > 0.0) tMax = gnd.x;
  const int N = 48;
  float mu = dot(rd, uSunDir);
  float pr = phaseR(mu);
  float pm = phaseM(mu, 0.78);
  vec3 T = vec3(1.0);
  vec3 L = vec3(0.0);
  float prev = 0.0;
  for (int i = 0; i < N; i++) {
    // Quadratic distribution: dense sampling near the viewer.
    float s = (float(i) + 1.0) / float(N);
    float t = tMax * s * s;
    float dt = t - prev;
    float tm = prev + dt * 0.5;
    prev = t;
    vec3 p = ro + rd * tm;
    float h = length(p) - Rg;
    vec3 d = density(h);
    vec3 ext = betaR * d.x + vec3(betaMe) * d.y + betaO * d.z;
    vec3 Ts = transmittanceToSun(p);
    vec3 scatR = betaR * d.x;
    vec3 scatM = vec3(betaMs) * d.y;
    // Single scattering + an isotropic multiple-scattering approximation.
    vec3 S = Ts * (scatR * pr + scatM * pm) + (scatR + scatM) * (0.10 * Ts.g + 0.012) * (0.25 / PI);
    vec3 Tr = exp(-ext * dt);
    L += T * S * (1.0 - Tr) / max(ext, vec3(1e-9));
    T *= Tr;
  }
  return L * uSunIntensity;
}

void main() {
  float az = (vUv.x - 0.5) * 2.0 * PI;
  float v = vUv.y * 2.0 - 1.0;
  float el = sign(v) * v * v * PI * 0.5;
  vec3 rd = vec3(sin(az) * cos(el), sin(el), -cos(az) * cos(el));

  // Below the horizon we keep the horizon colour (the cloud sea / terrain covers it anyway).
  vec3 rdc = normalize(vec3(rd.x, max(rd.y, 0.0015), rd.z));
  vec3 c = physicalSky(rdc) * uScale;

  // ------------------------------------------------------------------ art direction
  vec2 sunH = normalize(uSunDir.xz);
  float towards = dot(normalize(rdc.xz + 1e-5), sunH) * 0.5 + 0.5; // 1 facing the sun
  float e = max(rd.y, 0.0);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));

  // Richer saturation, especially in the warm band.
  c = max(mix(vec3(lum), c, 1.18), 0.0);

  // Violet transition between the blue upper sky and the warm horizon.
  float violetBand = exp(-pow((e - 0.16) / 0.12, 2.0));
  c += vec3(0.30, 0.10, 0.38) * violetBand * lum * (0.55 + 0.45 * (1.0 - towards));

  // Pink "belt of Venus" and blue-grey earth-shadow band opposite the sun.
  float belt = exp(-pow((e - 0.07) / 0.05, 2.0)) * pow(1.0 - towards, 1.5);
  c += vec3(0.55, 0.22, 0.30) * belt * 0.35;
  float earthShadow = exp(-pow(e / 0.03, 2.0)) * pow(1.0 - towards, 2.0);
  c = mix(c, c * vec3(0.72, 0.74, 0.95), earthShadow * 0.6);

  // Salmon / pink tint in the mid band towards the sun.
  float pinkBand = exp(-pow((e - 0.09) / 0.07, 2.0)) * towards;
  c *= mix(vec3(1.0), vec3(1.10, 0.86, 0.92), pinkBand * 0.6);

  // Deepen the zenith.
  c *= mix(vec3(1.0), vec3(0.72, 0.80, 1.12), smoothstep(0.25, 1.0, e));

  // Just under the horizon, fade to a dimmer haze.
  if (rd.y < 0.0) c *= mix(1.0, 0.65, smoothstep(0.0, -0.25, rd.y));

  gl_FragColor = vec4(c, 1.0);
}`;

export class SkyLUT {
  readonly target: THREE.WebGLRenderTarget;
  private mat: THREE.ShaderMaterial;
  private quad: FullscreenQuad;

  constructor(width = 512, height = 256) {
    this.target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      depthBuffer: false,
      magFilter: THREE.LinearFilter,
      minFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      generateMipmaps: false,
    });
    this.mat = passMaterial(FRAG, {
      uSunDir: { value: new THREE.Vector3(0, 0.1, -1).normalize() },
      uSunIntensity: { value: 22 },
      uScale: { value: 1 },
    });
    this.quad = new FullscreenQuad(this.mat);
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  update(renderer: THREE.WebGLRenderer, sunDir: THREE.Vector3, scale: number): void {
    this.mat.uniforms.uSunDir.value.copy(sunDir);
    this.mat.uniforms.uScale.value = scale;
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    renderer.setRenderTarget(prev);
  }

  /** Reads back the LUT and integrates approximate irradiance for ambient light. */
  readIrradiance(renderer: THREE.WebGLRenderer): { up: THREE.Color; horizon: THREE.Color } {
    const w = this.target.width;
    const h = this.target.height;
    const buf = new Uint16Array(w * h * 4);
    renderer.readRenderTargetPixels(this.target, 0, 0, w, h, buf);
    const up = new THREE.Color(0, 0, 0);
    const hor = new THREE.Color(0, 0, 0);
    let wu = 0;
    let wh = 0;
    for (let y = h / 2; y < h; y += 2) {
      const v = (y + 0.5) / h * 2 - 1;
      const el = v * v * Math.PI * 0.5;
      const cosTerm = Math.sin(el) * Math.cos(el); // cosine weighting × solid angle
      for (let x = 0; x < w; x += 4) {
        const i = (y * w + x) * 4;
        const r = THREE.DataUtils.fromHalfFloat(buf[i]);
        const g = THREE.DataUtils.fromHalfFloat(buf[i + 1]);
        const b = THREE.DataUtils.fromHalfFloat(buf[i + 2]);
        up.r += r * cosTerm;
        up.g += g * cosTerm;
        up.b += b * cosTerm;
        wu += cosTerm;
        if (el < 0.2) {
          hor.r += r;
          hor.g += g;
          hor.b += b;
          wh++;
        }
      }
    }
    up.multiplyScalar(1 / Math.max(wu, 1e-6));
    hor.multiplyScalar(1 / Math.max(wh, 1));
    return { up, horizon: hor };
  }
}
