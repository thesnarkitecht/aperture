/**
 * GPU side of the distant terrain: warped-grid mesh, baked data textures, terrain material and
 * the river/lake water surface.
 */
import * as THREE from 'three';
import { withGlobals } from '../../render/ShaderLib';
import { WATER_LEVEL } from '../WorldConfig';
import { TerrainData } from './TerrainGen';
import { FS_PRE, VS_PRE } from './geo';

export interface TerrainTextures {
  height: THREE.DataTexture; // H×H RGBA16F: height, normal.x, normal.z, cavity
  bake: THREE.DataTexture; // M×M RGBA8: sun shadow, AO, forest, moisture
}

export function buildTerrainTextures(td: TerrainData): TerrainTextures {
  const { H, M, hFine, xs, zs } = td;
  const toHalf = THREE.DataUtils.toHalfFloat;
  const hd = new Uint16Array(H * H * 4);
  for (let j = 0; j < H; j++) {
    const j0 = Math.max(j - 1, 0);
    const j1 = Math.min(j + 1, H - 1);
    const dzw = zs[j1] - zs[j0];
    for (let i = 0; i < H; i++) {
      const i0 = Math.max(i - 1, 0);
      const i1 = Math.min(i + 1, H - 1);
      const o = j * H + i;
      const h = hFine[o];
      const hl = hFine[j * H + i0];
      const hr = hFine[j * H + i1];
      const hd0 = hFine[j0 * H + i];
      const hu = hFine[j1 * H + i];
      const dx = (hr - hl) / (xs[i1] - xs[i0]);
      const dz = (hu - hd0) / dzw;
      const il = 1 / Math.sqrt(dx * dx + dz * dz + 1);
      const sp = 0.25 * (xs[i1] - xs[i0] + dzw);
      const cav = Math.max(-1, Math.min(1, ((hl + hr + hd0 + hu) * 0.25 - h) / Math.max(sp, 1) * 3));
      hd[o * 4] = toHalf(h);
      hd[o * 4 + 1] = toHalf(-dx * il);
      hd[o * 4 + 2] = toHalf(-dz * il);
      hd[o * 4 + 3] = toHalf(cav);
    }
  }
  const height = new THREE.DataTexture(hd, H, H, THREE.RGBAFormat, THREE.HalfFloatType);
  height.magFilter = THREE.LinearFilter;
  height.minFilter = THREE.LinearFilter;
  height.wrapS = height.wrapT = THREE.ClampToEdgeWrapping;
  height.generateMipmaps = false;
  height.needsUpdate = true;

  const bd = new Uint8Array(M * M * 4);
  for (let k = 0; k < M * M; k++) {
    bd[k * 4] = Math.round(td.shadow[k] * 255);
    bd[k * 4 + 1] = Math.round(td.ao[k] * 255);
    bd[k * 4 + 2] = Math.round(td.forest[k] * 255);
    bd[k * 4 + 3] = Math.round(td.moist[k] * 255);
  }
  const bake = new THREE.DataTexture(bd, M, M, THREE.RGBAFormat, THREE.UnsignedByteType);
  bake.magFilter = THREE.LinearFilter;
  bake.minFilter = THREE.LinearFilter;
  bake.wrapS = bake.wrapT = THREE.ClampToEdgeWrapping;
  bake.generateMipmaps = false;
  bake.needsUpdate = true;
  return { height, bake };
}

// ---------------------------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------------------------
const TERRAIN_VS = /* glsl */ `
${VS_PRE}
varying vec3 vWorld;
varying vec2 vT;
void main() {
  vT = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const TERRAIN_FS = /* glsl */ `
${FS_PRE}
uniform sampler2D uHeightTex;
uniform sampler2D uBakeTex;
uniform vec2 uTexN;
uniform float uWaterLevel;
varying vec3 vWorld;
varying vec2 vT;

float dw_detailH(vec2 q, float fineFade) {
  return aw_fbm2(q * 0.018, 3) * 16.0 + aw_vnoise(q * 0.09) * 2.4 * fineFade;
}

void main() {
  vec2 uvH = (vT * (uTexN.x - 1.0) + 0.5) / uTexN.x;
  vec2 uvB = (vT * (uTexN.y - 1.0) + 0.5) / uTexN.y;
  vec4 hm = texture(uHeightTex, uvH);
  vec4 bk = texture(uBakeTex, uvB);
  vec3 P = vWorld;
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-3);
  vec3 Ng = normalize(vec3(hm.g, sqrt(max(1.0 - hm.g * hm.g - hm.b * hm.b, 0.0)), hm.b));
  float h = P.y;
  float slope = 1.0 - Ng.y;
  vec2 q = P.xz;

  float nLarge = aw_fbm2(q * 0.0021 + 3.1, 3);
  float nMid = aw_fbm2(q * 0.011, 3);
  float nFine = aw_vnoise(q * 0.07);
  float fade = 1.0 - smoothstep(1800.0, 8000.0, dist);
  float fineFade = 1.0 - smoothstep(500.0, 2500.0, dist);
  vec3 N = Ng;
  if (fade > 0.0) {
    float e = 1.5;
    float h0 = dw_detailH(q, fineFade);
    float hx = dw_detailH(q + vec2(e, 0.0), fineFade);
    float hz = dw_detailH(q + vec2(0.0, e), fineFade);
    vec2 g = vec2(hx - h0, hz - h0) / e;
    float strength = fade * mix(0.3, 0.9, smoothstep(0.08, 0.4, slope));
    N = normalize(Ng + vec3(-g.x, 0.0, -g.y) * strength);
  }
  float cav = hm.a;
  float moist = bk.a;
  float forest = bk.b;

  // --- grass / meadow
  float dryness = saturate(nLarge * 1.5 - 0.3 + (h - 350.0) / 1800.0 - moist * 0.7);
  vec3 grassLush = vec3(0.060, 0.125, 0.026);
  vec3 grassWarm = vec3(0.135, 0.160, 0.045);
  vec3 grassDry = vec3(0.210, 0.180, 0.085);
  vec3 alb = mix(grassLush, grassWarm, smoothstep(0.2, 0.6, dryness + (nMid - 0.5) * 0.45));
  alb = mix(alb, grassDry, smoothstep(0.6, 0.95, dryness + (nFine - 0.5) * 0.25));
  alb *= 0.85 + 0.3 * nFine * fineFade + 0.15 * (1.0 - fineFade);

  // --- forest canopy (the instanced trees sit on top of this near the camera)
  float fMask = smoothstep(0.25, 0.6, forest + (nMid - 0.5) * 0.5);
  vec3 canopy = mix(vec3(0.022, 0.046, 0.020), vec3(0.040, 0.066, 0.024), nFine);
  alb = mix(alb, canopy, fMask);

  // --- rock, stratified
  float strata = fract(h / 43.0 + nMid * 0.9 + nLarge * 2.0);
  vec3 rockA = vec3(0.19, 0.17, 0.15);
  vec3 rockB = vec3(0.32, 0.28, 0.24);
  vec3 rock = mix(rockA, rockB, smoothstep(0.3, 0.7, strata) * (0.6 + 0.4 * nFine));
  rock *= mix(0.75, 1.1, nMid);
  rock *= 1.0 - 0.35 * saturate(cav);
  float rockW = smoothstep(0.30, 0.48, slope + (nMid - 0.5) * 0.25 + saturate((h - 1400.0) / 2500.0) * 0.3 - saturate(-cav) * 0.1);
  alb = mix(alb, rock, rockW);
  // scree / dirt at the foot of cliffs
  alb = mix(alb, vec3(0.20, 0.16, 0.11), smoothstep(0.2, 0.3, slope) * (1.0 - rockW) * 0.5 * (1.0 - fMask));

  // --- snow (pinkish so it catches the alpenglow)
  float snowLine = 2050.0 + (nLarge - 0.5) * 700.0;
  float snowW = smoothstep(snowLine, snowLine + 200.0, h + (nMid - 0.5) * 160.0)
              * (1.0 - smoothstep(0.52, 0.75, slope + (nFine - 0.5) * 0.12));
  alb = mix(alb, vec3(0.93, 0.88, 0.94), snowW);

  // --- shores: sand, wet darkening, river bed
  float sandW = 1.0 - smoothstep(uWaterLevel + 1.0, uWaterLevel + 4.5, h + (nFine - 0.5) * 2.5);
  alb = mix(alb, vec3(0.40, 0.34, 0.24), sandW * (1.0 - rockW));
  float wet = 1.0 - smoothstep(uWaterLevel - 0.3, uWaterLevel + 1.0, h);
  alb *= mix(1.0, 0.55, wet);

  AwSurface s = aw_defaultSurface();
  s.albedo = alb;
  s.normal = N;
  s.roughness = mix(0.93, 0.55, snowW);
  s.specular = mix(0.3, 0.7, snowW) * (1.0 - fMask * 0.7);
  s.ao = bk.g * mix(1.0, 0.72, fMask) * (1.0 - 0.3 * saturate(cav));
  s.wrap = mix(0.3, 0.1, rockW);
  s.sssColor = mix(vec3(0.9, 0.75, 0.45), vec3(1.0), max(rockW, snowW));

  float terrainShadow = bk.r;
  float sunVis = aw_cloudShadow(P) * terrainShadow;
  vec3 col = aw_shade(s, P, V, sunVis);
  // Alpenglow: sunlit snow blushes pink.
  col += snowW * sunVis * vec3(0.30, 0.09, 0.16) * saturate(dot(N, uSunDir) * 2.0 + 0.4);
  gl_FragColor = vec4(col, 1.0);
  #include <logdepthbuf_fragment>
}
`;

export function buildTerrainMesh(td: TerrainData, tex: TerrainTextures): THREE.Mesh {
  const M = td.M;
  const pos = new Float32Array(M * M * 3);
  const uv = new Float32Array(M * M * 2);
  for (let j = 0; j < M; j++) {
    const z = td.meshZ(j);
    for (let i = 0; i < M; i++) {
      const k = j * M + i;
      pos[k * 3] = td.meshX(i);
      pos[k * 3 + 1] = td.hMesh[k];
      pos[k * 3 + 2] = z;
      uv[k * 2] = i / (M - 1);
      uv[k * 2 + 1] = j / (M - 1);
    }
  }
  const idx = new Uint32Array((M - 1) * (M - 1) * 6);
  let o = 0;
  for (let j = 0; j < M - 1; j++)
    for (let i = 0; i < M - 1; i++) {
      const a = j * M + i;
      const b = a + 1;
      const c = a + M;
      const d = c + 1;
      // Diagonal b–c (matches TerrainData.heightAt). Winding: counter-clockwise seen from +Y.
      idx[o++] = a;
      idx[o++] = c;
      idx[o++] = b;
      idx[o++] = b;
      idx[o++] = c;
      idx[o++] = d;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const mat = new THREE.ShaderMaterial({
    uniforms: withGlobals({
      uHeightTex: { value: tex.height },
      uBakeTex: { value: tex.bake },
      uTexN: { value: new THREE.Vector2(td.H, td.M) },
      uWaterLevel: { value: WATER_LEVEL },
    }),
    vertexShader: TERRAIN_VS,
    fragmentShader: TERRAIN_FS,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'DistantTerrain';
  mesh.matrixAutoUpdate = false;
  mesh.userData.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------------------------------------
// Water
// ---------------------------------------------------------------------------------------------
const WATER_VS = /* glsl */ `
${VS_PRE}
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const WATER_FS = /* glsl */ `
${FS_PRE}
uniform sampler2D uHeightTex;
uniform sampler2D uBakeTex;
uniform vec2 uTexN;
uniform vec4 uWarpX;
uniform vec4 uWarpZ;
uniform float uWaterLevel;
uniform float uDwTime;
varying vec3 vWorld;

float dw_warpT(vec4 w, float x) { return w.w + asinh((x - w.x) / w.y) / w.z; }

vec2 dw_waveGrad(vec2 p, float t, float fade) {
  vec2 g = vec2(0.0);
  float lam = 26.0;
  float amp = 0.085;
  float ang = 0.3;
  for (int i = 0; i < 5; i++) {
    vec2 d = vec2(cos(ang), sin(ang));
    float k = AW_TAU / lam;
    float w = sqrt(9.81 * k);
    float ph = dot(d, p) * k - w * t + float(i) * 1.7;
    g += d * cos(ph) * amp;
    lam *= 0.61;
    amp *= 0.85;
    ang += 2.13;
  }
  vec2 q = (p - uSunXZ * t * 0.9) * 0.22;
  float e = 0.15;
  float n0 = aw_vnoise(q);
  float nx = aw_vnoise(q + vec2(e, 0.0));
  float nz = aw_vnoise(q + vec2(0.0, e));
  g += vec2(nx - n0, nz - n0) / e * 0.05;
  return g * fade;
}

void main() {
  vec3 P = vWorld;
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-3);
  vec2 t = vec2(dw_warpT(uWarpX, P.x), dw_warpT(uWarpZ, P.z));
  vec2 uvH = (t * (uTexN.x - 1.0) + 0.5) / uTexN.x;
  vec2 uvB = (t * (uTexN.y - 1.0) + 0.5) / uTexN.y;
  float hT = texture(uHeightTex, uvH).r;
  vec4 bk = texture(uBakeTex, uvB);
  float depth = max(uWaterLevel - hT, 0.0);

  float fade = 1.0 / (1.0 + dist / 900.0);
  vec2 g = dw_waveGrad(P.xz, uDwTime, fade) * smoothstep(0.0, 1.5, depth + 0.3);
  vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
  float NoV = max(dot(N, V), 1e-3);
  float F = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);

  // Sky reflection (beneath the deck the zenith is cloud; the sunward rift stays open).
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 sky = aw_sky(normalize(vec3(R.x, max(R.y, 0.01), R.z)));
  float under = aw_underDeck(P.y);
  vec2 rxz = R.xz / max(length(R.xz), 1e-4);
  float sunward = smoothstep(-0.3, 0.9, dot(rxz, uSunXZ)) * (1.0 - smoothstep(0.12, 0.55, R.y));
  sky *= mix(1.0, mix(0.36, 1.0, sunward), under);

  float sunVis = aw_cloudShadow(P) * bk.r;
  vec3 L = uSunDir;

  // Sun glint: GGX lobe + an elongated sun path.
  vec3 H = normalize(L + V);
  float NoL = saturate(dot(N, L));
  float NoH = saturate(dot(N, H));
  float VoH = saturate(dot(V, H));
  float rough = mix(0.06, 0.2, 1.0 - fade);
  float a = rough * rough;
  float Fs = 0.02 + 0.98 * pow(1.0 - VoH, 5.0);
  float spec = aw_D_GGX(NoH, a) * aw_V_Smith(NoV, max(NoL, 1e-3), a) * Fs * NoL * AW_PI;
  vec3 Rv = reflect(-V, N);
  vec2 lxz = normalize(L.xz);
  vec2 rv2 = Rv.xz / max(length(Rv.xz), 1e-4);
  float dAz = 1.0 - dot(rv2, lxz);
  float dEl = Rv.y - L.y;
  float path = exp(-dAz / 0.0007 - dEl * dEl / 0.006) * F * 2.5;
  vec3 glint = uSunColor * sunVis * min(spec + path, 40.0);

  // Water body: absorption over the path through the water, bed and in-scatter.
  vec3 amb = aw_ambient(vec3(0.0, 1.0, 0.0), P);
  vec3 sunL = uSunColor * sunVis * max(L.y, 0.0);
  vec3 bed = vec3(0.13, 0.11, 0.075) * (amb + sunL * 0.9);
  vec3 absorb = vec3(0.36, 0.095, 0.07);
  float pathLen = min(depth * (1.0 + 1.0 / max(V.y, 0.08)), 80.0);
  vec3 T = exp(-absorb * pathLen);
  vec3 scatter = vec3(0.010, 0.030, 0.032) * (amb + sunL * 0.6);
  vec3 refr = bed * T + scatter * (1.0 - T);

  // Shore foam.
  float shore = 1.0 - smoothstep(0.0, 1.8, depth);
  float fn = aw_vnoise((P.xz - uSunXZ * uDwTime * 0.7) * 0.35) * 0.6 + aw_vnoise(P.xz * 1.3 + uDwTime * 0.3) * 0.4;
  float foam = smoothstep(0.55, 0.85, fn + shore * 0.55 + 0.1 * sin(depth * 5.0 - uDwTime * 1.4)) * shore;
  foam *= 1.0 - smoothstep(1500.0, 5000.0, dist);
  vec3 foamC = vec3(0.75) * (amb + uSunColor * sunVis * 0.3);

  vec3 col = mix(refr, sky, F) + glint;
  col = mix(col, foamC, foam * 0.75);
  gl_FragColor = vec4(col, 1.0);
  #include <logdepthbuf_fragment>
}
`;

export function buildWaterMesh(td: TerrainData, tex: TerrainTextures): { mesh: THREE.Mesh; time: THREE.IUniform } {
  const M = td.M;
  const hm = td.hMesh;
  const lim = WATER_LEVEL + 0.25;
  const vmap = new Int32Array(M * M).fill(-1);
  const pos: number[] = [];
  const idx: number[] = [];
  const vert = (i: number, j: number): number => {
    const k = j * M + i;
    if (vmap[k] < 0) {
      vmap[k] = pos.length / 3;
      pos.push(td.meshX(i), WATER_LEVEL, td.meshZ(j));
    }
    return vmap[k];
  };
  for (let j = 0; j < M - 1; j++)
    for (let i = 0; i < M - 1; i++) {
      const a = j * M + i;
      if (Math.min(hm[a], hm[a + 1], hm[a + M], hm[a + M + 1]) > lim) continue;
      const va = vert(i, j);
      const vb = vert(i + 1, j);
      const vc = vert(i, j + 1);
      const vd = vert(i + 1, j + 1);
      idx.push(va, vc, vb, vb, vc, vd);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const time = { value: 0 };
  const w = (a: { c: number; A: number; k: number; t0: number }) => new THREE.Vector4(a.c, a.A, a.k, a.t0);
  const mat = new THREE.ShaderMaterial({
    uniforms: withGlobals({
      uHeightTex: { value: tex.height },
      uBakeTex: { value: tex.bake },
      uTexN: { value: new THREE.Vector2(td.H, td.M) },
      uWarpX: { value: w(td.wx) },
      uWarpZ: { value: w(td.wz) },
      uWaterLevel: { value: WATER_LEVEL },
      uDwTime: time,
    }),
    vertexShader: WATER_VS,
    fragmentShader: WATER_FS,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'DistantWater';
  mesh.matrixAutoUpdate = false;
  mesh.renderOrder = 1; // after the terrain so early-z rejects hidden water
  return { mesh, time };
}
