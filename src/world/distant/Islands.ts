/**
 * Secondary floating islands (grassy caps over eroded rock undersides tapering to a point),
 * ancient stone structures (ruined ridge tower, broken ring on an island), waterfall ribbons.
 * All rock/grass/stone geometry is merged into a single vertex-coloured mesh.
 */
import * as THREE from 'three';
import { Noise, mulberry32 } from '../../core/noise';
import { withGlobals } from '../../render/ShaderLib';
import { corridorToWorld } from './TerrainGen';
import { ColoredPart, FS_PRE, VS_PRE, mergeColored } from './geo';
import type { TreeInstance } from './Forest';

export interface IslandSpec {
  along: number;
  side: number;
  y: number; // top surface height
  radius: number;
  depth: number; // underside length
  seed: number;
  waterfall?: number; // azimuth (radians) of the waterfall lip
  fallHeight?: number;
  trees: number;
  ring?: boolean;
}

/** Layout. Distances from the start island (0,1650,0) are all > 1 km. */
export const ISLAND_SPECS: IslandSpec[] = [
  // Below the cloud deck, flanking the glide.
  { along: 2800, side: 1150, y: 700, radius: 95, depth: 170, seed: 11, trees: 26 },
  { along: 5800, side: -1500, y: 520, radius: 150, depth: 260, seed: 12, trees: 40, waterfall: 0.25, fallHeight: 330 },
  // Above the deck.
  { along: 3400, side: 650, y: 1810, radius: 125, depth: 230, seed: 13, trees: 14, ring: true },
  { along: -1200, side: 1500, y: 1760, radius: 105, depth: 200, seed: 14, trees: 22 },
  { along: 5500, side: -2600, y: 2080, radius: 210, depth: 380, seed: 15, trees: 60, waterfall: 0.6, fallHeight: 700 },
  { along: 1800, side: -2200, y: 1460, radius: 80, depth: 150, seed: 16, trees: 12 },
  { along: 7000, side: 2600, y: 1620, radius: 165, depth: 300, seed: 17, trees: 36 },
];

const nz = new Noise(3131);

interface IslandShape {
  cx: number;
  cy: number;
  cz: number;
  R: number;
  rim: (theta: number) => number;
  top: (x: number, z: number) => number;
}

function islandShape(spec: IslandSpec): IslandShape {
  const [cx, cz] = corridorToWorld(spec.along, spec.side);
  const s = spec.seed * 7.31;
  const R = spec.radius;
  const rim = (th: number) =>
    R * (0.84 + 0.26 * nz.fbm2(Math.cos(th) * 1.3 + s, Math.sin(th) * 1.3 - s, 3) + 0.05 * nz.noise2(Math.cos(th) * 5 + s, Math.sin(th) * 5));
  const top = (x: number, z: number) => {
    const r = Math.hypot(x - cx, z - cz) / R;
    return spec.y + 5 * (1 - r * r) + 2.5 * nz.fbm2((x - cx) / 40 + s, (z - cz) / 40, 3);
  };
  return { cx, cy: spec.y, cz, R, rim, top };
}

function islandGeometry(spec: IslandSpec, sh: IslandShape): ColoredPart {
  const S = 64;
  const NT = 6;
  const NU = 18;
  const rnd = mulberry32(spec.seed);
  const tipX = (rnd() - 0.5) * spec.radius * 0.5;
  const tipZ = (rnd() - 0.5) * spec.radius * 0.5;
  const rows = NT + 1 + NU;
  const pos = new Float32Array(rows * S * 3);
  const s = spec.seed * 3.7;
  let k = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < S; c++) {
      const th = (c / S) * Math.PI * 2;
      const ct = Math.cos(th);
      const st = Math.sin(th);
      const rr = sh.rim(th);
      let x: number;
      let y: number;
      let z: number;
      if (r <= NT) {
        const f = r / NT;
        const rad = rr * (f < 1 ? f : 1);
        x = sh.cx + ct * rad;
        z = sh.cz + st * rad;
        y = sh.top(x, z) - (f === 1 ? 3 : 0);
      } else {
        const u = (r - NT) / NU;
        const groove = 1 - 0.2 * Math.abs(nz.noise2(th * 2.2 + s, u * 3.5));
        const bulge = 1 + 0.12 * Math.sin(u * Math.PI);
        const rad = rr * Math.pow(1 - u, 1.35) * groove * bulge * (1 + 0.08 * nz.noise2(ct * 3 + u * 4, st * 3 - s));
        const drift = u * u;
        x = sh.cx + ct * rad + tipX * drift;
        z = sh.cz + st * rad + tipZ * drift;
        y = sh.cy - 4 - spec.depth * Math.pow(u, 0.85) + 10 * nz.noise2(ct * 4 + s, st * 4 + u * 6) * (1 - u);
      }
      pos[k++] = x;
      pos[k++] = y;
      pos[k++] = z;
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < S; c++) {
      const a = r * S + c;
      const b = r * S + ((c + 1) % S);
      const d = (r + 1) * S + c;
      const e = (r + 1) * S + ((c + 1) % S);
      idx.push(a, b, d, b, e, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const grass = new THREE.Color(0.075, 0.13, 0.03);
  const dirt = new THREE.Color(0.2, 0.14, 0.085);
  const rockA = new THREE.Color(0.25, 0.21, 0.17);
  const rockB = new THREE.Color(0.34, 0.29, 0.24);
  const tip = new THREE.Color(0.12, 0.1, 0.085);
  const cy = sh.cy;
  const color = (p: THREE.Vector3, n: THREE.Vector3) => {
    const dy = cy - p.y;
    if (dy < 2.5 && n.y > 0.3) return grass.clone().multiplyScalar(0.85 + 0.3 * (0.5 + 0.5 * nz.noise2(p.x / 20, p.z / 20)));
    if (dy < 12) return dirt.clone().lerp(rockA, Math.max(0, (dy - 4) / 8));
    const band = 0.5 + 0.5 * Math.sin(p.y * 0.22 + nz.noise2(p.x / 30, p.z / 30) * 2);
    const c = rockA.clone().lerp(rockB, band * 0.8);
    return c.lerp(tip, Math.min(1, dy / (spec.depth * 1.05)));
  };
  return { geo, color, kind: 1 };
}

function towerGeometry(x: number, y: number, z: number, seed: number): ColoredPart[] {
  const rnd = mulberry32(seed);
  const S = 14;
  const L = 12;
  const Hh = 78;
  const r0 = 11;
  const r1 = 7.5;
  const tops: number[] = [];
  for (let c = 0; c < S; c++) tops.push(Hh * (0.72 + 0.28 * rnd()) * (c % 5 === 0 ? 0.8 : 1));
  const pos: number[] = [];
  for (let l = 0; l <= L; l++) {
    const f = l / L;
    for (let c = 0; c < S; c++) {
      const th = (c / S) * Math.PI * 2;
      const hy = tops[c] * f;
      const rr = r0 + (r1 - r0) * (hy / Hh) + (l % 3 === 0 ? 0.6 : 0);
      pos.push(x + Math.cos(th) * rr, y - 8 + hy, z + Math.sin(th) * rr);
    }
  }
  const idx: number[] = [];
  for (let l = 0; l < L; l++)
    for (let c = 0; c < S; c++) {
      const a = l * S + c;
      const b = l * S + ((c + 1) % S);
      const d = (l + 1) * S + c;
      const e = (l + 1) * S + ((c + 1) % S);
      idx.push(a, d, b, b, d, e);
    }
  // Top cap (jagged, inner rim).
  const topStart = pos.length / 3;
  for (let c = 0; c < S; c++) {
    const th = (c / S) * Math.PI * 2;
    pos.push(x + Math.cos(th) * (r1 - 2.2), y - 8 + tops[c] - 3, z + Math.sin(th) * (r1 - 2.2));
  }
  for (let c = 0; c < S; c++) {
    const a = L * S + c;
    const b = L * S + ((c + 1) % S);
    const d = topStart + c;
    const e = topStart + ((c + 1) % S);
    idx.push(a, d, b, b, d, e);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const stone = new THREE.Color(0.3, 0.27, 0.23);
  const parts: ColoredPart[] = [
    { geo, color: (p) => stone.clone().multiplyScalar(0.7 + 0.35 * ((p.y - y) / Hh) + 0.1 * Math.sin(p.y * 1.3)), kind: 1 },
  ];
  // Broken curtain wall running down the ridge.
  for (let i = 0; i < 4; i++) {
    const bh = 10 + rnd() * 14;
    const b = new THREE.BoxGeometry(14 + rnd() * 8, bh, 3.5);
    b.rotateY(0.6 + i * 0.12);
    b.translate(x + 18 + i * 15, y - 6 + bh / 2 - i * 4, z + 10 + i * 9);
    parts.push({ geo: b, color: stone.clone().multiplyScalar(0.85), kind: 1 });
  }
  return parts;
}

function ringGeometry(sh: IslandShape, faceTo: THREE.Vector3): ColoredPart[] {
  const R = 68;
  const tube = 7.5;
  const ring = new THREE.TorusGeometry(R, tube, 9, 72, Math.PI * 2 * 0.84);
  ring.deleteAttribute('uv');
  // Gap on the upper right, then stand the ring upright facing the start island.
  ring.rotateZ(Math.PI * 0.62);
  const yaw = Math.atan2(faceTo.x - sh.cx, faceTo.z - sh.cz);
  ring.rotateY(yaw);
  ring.translate(sh.cx, sh.cy + R - 2, sh.cz);
  const pale = new THREE.Color(0.36, 0.33, 0.29);
  const parts: ColoredPart[] = [
    { geo: ring, color: (p) => pale.clone().multiplyScalar(0.8 + 0.25 * Math.sin(p.y * 0.4) * Math.sin(p.x * 0.3)), kind: 1 },
  ];
  // Plinths.
  for (const s of [-1, 1]) {
    const b = new THREE.BoxGeometry(12, 10, 26);
    b.rotateY(yaw);
    b.translate(sh.cx + Math.cos(yaw) * s * 16, sh.cy + 3, sh.cz - Math.sin(yaw) * s * 16);
    parts.push({ geo: b, color: pale.clone().multiplyScalar(0.75), kind: 1 });
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------------------------
export const PROP_VS = /* glsl */ `
${VS_PRE}
attribute vec3 aCol;
attribute float aKind;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCol;
varying float vKind;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vCol = aCol;
  vKind = aKind;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

export const PROP_FS = /* glsl */ `
${FS_PRE}
uniform float uDetail;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCol;
varying float vKind;
void main() {
  vec3 P = vWorld;
  vec3 toCam = cameraPosition - P;
  float dist = length(toCam);
  vec3 V = toCam / max(dist, 1e-3);
  vec3 N = normalize(vNormal);
  float fade = (1.0 - smoothstep(600.0, 5000.0, dist)) * uDetail;
  vec3 alb = vCol;
  float grassy = saturate((alb.g - alb.r * 1.2) * 40.0) * step(0.3, N.y);
  if (fade > 0.0) {
    float n = aw_fbm3(P * 0.06, 3);
    float strata = fract(P.y * 0.08 + n * 1.3);
    alb *= mix(1.0, mix(0.72, 1.18, smoothstep(0.25, 0.75, strata)) * (0.8 + 0.4 * n), fade * (1.0 - grassy));
    alb *= mix(1.0, 0.8 + 0.4 * aw_vnoise(P.xz * 0.25), fade * grassy);
    // Bump the rock with the same noise.
    vec3 e = vec3(1.2, 0.0, 0.0);
    float nx = aw_fbm3((P + e.xyy) * 0.06, 2);
    float ny = aw_fbm3((P + e.yxy) * 0.06, 2);
    float nzz = aw_fbm3((P + e.yyx) * 0.06, 2);
    float n0 = aw_fbm3(P * 0.06, 2);
    N = normalize(N - vec3(nx - n0, ny - n0, nzz - n0) * 3.0 * fade * (1.0 - grassy));
  }
  AwSurface s = aw_defaultSurface();
  s.albedo = alb;
  s.normal = N;
  s.roughness = 0.9;
  s.specular = 0.3;
  s.wrap = mix(0.1, 0.35, grassy);
  s.sssColor = vec3(0.9, 0.7, 0.45);
  s.rim = 0.45;
  s.ao = mix(0.55, 1.0, saturate(N.y * 0.5 + 0.6));
  float sunVis = aw_cloudShadow(P);
  vec3 col = aw_shade(s, P, V, sunVis);
  gl_FragColor = vec4(col, 1.0);
  #include <logdepthbuf_fragment>
}
`;

const FALL_VS = /* glsl */ `
${VS_PRE}
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <logdepthbuf_vertex>
}
`;

const FALL_FS = /* glsl */ `
${FS_PRE}
uniform float uDwTime;
varying vec2 vUv;
varying vec3 vWorld;
void main() {
  float a = vUv.x;
  float u = vUv.y;
  float edge = smoothstep(0.0, 0.2, a) * smoothstep(1.0, 0.8, a);
  float streak = aw_fbm2(vec2(a * 11.0, u * 2.5 - uDwTime * 0.35), 3);
  float foam = aw_fbm2(vec2(a * 6.0, u * 30.0 - uDwTime * 2.2), 4);
  float dens = smoothstep(0.3, 0.75, foam * 0.75 + streak * 0.55);
  float alpha = edge * mix(0.35, 1.0, dens) * smoothstep(0.0, 0.02, u) * (1.0 - smoothstep(0.55, 0.92, u));
  float mist = smoothstep(0.35, 0.8, u) * (1.0 - smoothstep(0.82, 1.0, u)) * smoothstep(0.0, 0.4, a) * smoothstep(1.0, 0.6, a);
  mist *= 0.55 * aw_fbm2(vec2(a * 3.0, u * 5.0 - uDwTime * 0.25), 3) + 0.1;
  alpha = max(alpha * 0.9, mist);
  vec3 V = normalize(cameraPosition - vWorld);
  float sunVis = aw_cloudShadow(vWorld);
  vec3 amb = aw_ambient(normalize(vec3(V.x, 0.4, V.z)), vWorld);
  float fwd = pow(saturate(dot(-V, uSunDir)), 5.0);
  vec3 col = vec3(0.85, 0.88, 0.9) * (amb * 1.2 + uSunColor * sunVis * (0.16 + 0.9 * fwd));
  gl_FragColor = vec4(col, alpha);
  #include <logdepthbuf_fragment>
}
`;

function waterfallGeometry(sh: IslandShape, theta: number, fall: number, pos: number[], uv: number[], idx: number[]): void {
  const NS = 40;
  const NA = 6;
  const out = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
  const tan = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta));
  const rr = sh.rim(theta);
  const lx = sh.cx + out.x * (rr - 2);
  const lz = sh.cz + out.z * (rr - 2);
  const ly = sh.top(lx, lz) - 1.5;
  const w0 = sh.R * 0.13;
  const base = pos.length / 3;
  for (let s = 0; s <= NS; s++) {
    const u = s / NS;
    const drop = fall * u;
    const outD = 4 + 22 * Math.sqrt(u);
    const w = w0 * (1 + 2.2 * u * u);
    for (let a = 0; a <= NA; a++) {
      const f = a / NA;
      const c = f * 2 - 1;
      const bulge = (1 - c * c) * w * 0.35;
      pos.push(
        lx + out.x * (outD + bulge) + tan.x * c * w * 0.5,
        ly - drop,
        lz + out.z * (outD + bulge) + tan.z * c * w * 0.5,
      );
      uv.push(f, u);
    }
  }
  for (let s = 0; s < NS; s++)
    for (let a = 0; a < NA; a++) {
      const i0 = base + s * (NA + 1) + a;
      const i1 = i0 + 1;
      const i2 = i0 + NA + 1;
      const i3 = i2 + 1;
      idx.push(i0, i2, i1, i1, i2, i3);
    }
}

export interface IslandsResult {
  props: THREE.Mesh;
  falls: THREE.Mesh | null;
  conifers: TreeInstance[];
  broadleaves: TreeInstance[];
  time: THREE.IUniform;
}

export function buildIslands(tower: THREE.Vector3 | null): IslandsResult {
  const parts: ColoredPart[] = [];
  const conifers: TreeInstance[] = [];
  const broadleaves: TreeInstance[] = [];
  const fp: number[] = [];
  const fu: number[] = [];
  const fi: number[] = [];
  const start = new THREE.Vector3(0, 1650, 0);
  for (const spec of ISLAND_SPECS) {
    const sh = islandShape(spec);
    parts.push(islandGeometry(spec, sh));
    if (spec.ring) parts.push(...ringGeometry(sh, start));
    if (spec.waterfall !== undefined) waterfallGeometry(sh, spec.waterfall, spec.fallHeight ?? 300, fp, fu, fi);
    const rnd = mulberry32(spec.seed * 97 + 5);
    for (let i = 0; i < spec.trees; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 0.72;
      const rr = sh.rim(a) * r;
      const x = sh.cx + Math.cos(a) * rr;
      const z = sh.cz + Math.sin(a) * rr;
      if (spec.ring && Math.hypot(x - sh.cx, z - sh.cz) < 40) continue;
      const con = rnd() < 0.55;
      (con ? conifers : broadleaves).push({
        x,
        y: sh.top(x, z) - 0.8,
        z,
        height: con ? 12 + rnd() * 10 : 8 + rnd() * 6,
        width: con ? 0.8 + rnd() * 0.3 : 1.0 + rnd() * 0.4,
        rot: rnd() * Math.PI * 2,
        tint: rnd(),
        shadow: 1,
        ao: 1,
      });
    }
  }
  if (tower) parts.push(...towerGeometry(tower.x, tower.y, tower.z, 99));

  const time = { value: 0 };
  const props = new THREE.Mesh(
    mergeColored(parts),
    new THREE.ShaderMaterial({
      uniforms: withGlobals({ uDetail: { value: 1 } }),
      vertexShader: PROP_VS,
      fragmentShader: PROP_FS,
    }),
  );
  props.name = 'FloatingIslands';
  props.matrixAutoUpdate = false;

  let falls: THREE.Mesh | null = null;
  if (fi.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(fu, 2));
    g.setIndex(fi);
    g.computeBoundingSphere();
    falls = new THREE.Mesh(
      g,
      new THREE.ShaderMaterial({
        uniforms: withGlobals({ uDwTime: time }),
        vertexShader: FALL_VS,
        fragmentShader: FALL_FS,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    falls.name = 'Waterfalls';
    falls.renderOrder = 10;
    falls.matrixAutoUpdate = false;
  }
  return { props, falls, conifers, broadleaves, time };
}
