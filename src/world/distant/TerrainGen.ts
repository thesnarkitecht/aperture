/**
 * CPU generation of the distant landscape: layout masks (glide valley, river, lake, sunset
 * range), eroded heightfield, soft sun self-shadow, AO and forest density.
 *
 * The heightmap lives on a *warped* grid: sample spacing follows a sinh() curve per axis so the
 * texels are ~17 m apart under the glide corridor and grow to a few hundred metres at the edge
 * of the 72 km square. The terrain mesh uses every other heightmap sample, so the CPU height
 * query can reproduce the rendered triangles exactly.
 */
import * as THREE from 'three';
import { Noise } from '../../core/noise';
import { SUN_DIR, TERRAIN_CENTER, TERRAIN_SIZE, WATER_LEVEL } from '../WorldConfig';

export const SUN_XZ = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();
/** Perpendicular to the sun axis (points to the right when facing the sun). */
export const PERP_XZ = new THREE.Vector2(-SUN_XZ.y, SUN_XZ.x);
export const SUN_TAN = SUN_DIR.y / Math.hypot(SUN_DIR.x, SUN_DIR.z);

/** World XZ from corridor coordinates (along the sun axis from the start island, side offset). */
export function corridorToWorld(along: number, side: number): [number, number] {
  return [along * SUN_XZ.x + side * PERP_XZ.x, along * SUN_XZ.y + side * PERP_XZ.y];
}

// ---------------------------------------------------------------------------------------------
// Axis warp: x(t) = c + A sinh(k (t - t0)), t in [0,1]
// ---------------------------------------------------------------------------------------------
export interface AxisWarp {
  c: number;
  A: number;
  k: number;
  t0: number;
}

function makeWarp(lo: number, hi: number, c: number, k: number): AxisWarp {
  const r = (hi - c) / (c - lo);
  let a = 1e-5;
  let b = 1 - 1e-5;
  for (let i = 0; i < 80; i++) {
    const m = 0.5 * (a + b);
    const g = Math.sinh(k * (1 - m)) / Math.sinh(k * m);
    if (g > r) a = m;
    else b = m;
  }
  const t0 = 0.5 * (a + b);
  const A = (hi - c) / Math.sinh(k * (1 - t0));
  return { c, A, k, t0 };
}
export const warpToWorld = (w: AxisWarp, t: number): number => w.c + w.A * Math.sinh(w.k * (t - w.t0));
export const worldToWarp = (w: AxisWarp, x: number): number => w.t0 + Math.asinh((x - w.c) / w.A) / w.k;

// ---------------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------------
/** Lateral offset of the valley axis at a distance `a` along the corridor. */
export function valleyCenter(a: number): number {
  return 260 * Math.sin(a * 0.00035 + 0.9) + 90 * Math.sin(a * 0.00017 - 0.4);
}
/** Lateral offset of the river centreline (meanders inside the valley). */
export function riverCenter(a: number): number {
  return valleyCenter(a) + 230 * Math.sin(a * 0.0009 + 2.1) + 80 * Math.sin(a * 0.0027 + 0.4);
}
export const LAKE_ALONG = 13200;
export const LAKE_SIDE = valleyCenter(LAKE_ALONG) - 300;

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
function sstep(a: number, b: number, x: number): number {
  const t = sat((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** Integer lattice hash in [-1, 1). */
function lhash(ix: number, iz: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 2147483648 - 1;
}

/**
 * Derivative-damped value-noise fbm (after Quilez): high octaves are suppressed on steep
 * slopes, giving smooth eroded valleys between sharp crests.
 */
function erodedFbm(x: number, z: number, oct: number): number {
  let a = 0;
  let b = 1;
  let dx = 0;
  let dz = 0;
  let px = x;
  let pz = z;
  for (let i = 0; i < oct; i++) {
    const ix = Math.floor(px);
    const iz = Math.floor(pz);
    const fx = px - ix;
    const fz = pz - iz;
    const ux = fx * fx * (3 - 2 * fx);
    const uz = fz * fz * (3 - 2 * fz);
    const dux = 6 * fx * (1 - fx);
    const duz = 6 * fz * (1 - fz);
    const o = i * 131;
    const va = lhash(ix + o, iz);
    const vb = lhash(ix + 1 + o, iz);
    const vc = lhash(ix + o, iz + 1);
    const vd = lhash(ix + 1 + o, iz + 1);
    const k1 = vb - va;
    const k2 = vc - va;
    const k4 = va - vb - vc + vd;
    const v = va + k1 * ux + k2 * uz + k4 * ux * uz;
    dx += dux * (k1 + k4 * uz);
    dz += duz * (k2 + k4 * ux);
    a += (b * v) / (1 + dx * dx + dz * dz);
    b *= 0.5;
    const nx = 1.6 * px - 1.2 * pz;
    const nz = 1.2 * px + 1.6 * pz;
    px = nx + 3.7;
    pz = nz - 1.3;
  }
  return a;
}

const nWarp = new Noise(911);
const nMisc = new Noise(4242);
const nRidge = new Noise(1717);

/** Analytic height function (metres). Only used to fill the heightmap. */
export function terrainHeightFn(x: number, z: number): number {
  const along = x * SUN_XZ.x + z * SUN_XZ.y;
  const side = x * PERP_XZ.x + z * PERP_XZ.y;

  // Domain warp for organic ridgelines.
  const wx = x + 1100 * nWarp.fbm2(x / 9000, z / 9000, 3);
  const wz = z + 1100 * nWarp.fbm2(x / 9000 + 5.2, z / 9000 - 3.1, 3);

  // ---- mountains
  const ero = erodedFbm(wx / 4300, wz / 4300, 8); // ~[-1,1]
  const ridge = nRidge.ridged2(wx / 13000, wz / 13000, 3); // massifs
  const crest = nRidge.ridged2(wx / 5200 + 7.3, wz / 5200 - 2.9, 7); // sharp ridge network
  let s = sat(0.3 * (0.5 + 0.6 * ero) + 0.6 * ridge + 0.55 * crest - 0.4);
  s = Math.pow(s, 1.3);
  let amp = 2300 + 1300 * (0.5 + 0.5 * nMisc.noise2(x / 26000 + 3.1, z / 26000 - 1.7));

  // Valley coordinates.
  const vc = valleyCenter(along);
  const dsV = Math.abs(side - vc);
  const W = 1100 + 0.09 * Math.min(Math.max(along, 0), 11000);
  const corridorOn = sstep(-5200, -1800, along) * (1 - sstep(11500, 14500, along));

  // Flanks of the corridor are guaranteed mountainous (peaks pierce the cloud deck).
  const flank = sstep(-4000, -500, along) * (1 - sstep(10000, 13000, along)) * sstep(W * 0.9, W * 2.2, dsV) * (1 - sstep(W * 3.5, W * 6.5, dsV));
  s += flank * (0.22 + 0.6 * crest * crest + 0.2 * (0.5 + 0.5 * ero)) * (1 - 0.5 * s);
  amp *= 1 + 0.3 * flank;

  // Great range on the horizon under the sun, with a notch framing the sunset.
  const rangeM = sstep(20000, 25000, along) * (1 - sstep(33000, 40000, along)) * (1 - sstep(10000, 17000, Math.abs(side)));
  amp *= 1 + 0.75 * rangeM;
  s += rangeM * (0.2 + 0.6 * crest * crest + 0.15 * (0.5 + 0.5 * ero)) * sstep(21500, 25500, along) * (1 - 0.5 * s);
  let hMount = amp * s;
  const notch = sstep(15500, 19000, along) * (1 - sstep(38000, 42000, along)) * (1 - sstep(2000, 5200, Math.abs(side + 300 * nMisc.noise2(along / 3000, 1.3))));
  hMount = hMount + (Math.min(hMount, 300 + 220 * (0.5 + 0.5 * ero)) - hMount) * notch;
  // Near the sky island the peaks stay inside the cloud sea, so it reads as endless from above.
  const capH = 900 + 2200 * sstep(6000, 16000, Math.hypot(x, z));
  if (hMount > capH) hMount = capH + (hMount - capH) * 0.12;

  const hills = 70 + 150 * (0.5 + 0.5 * nMisc.fbm2(x / 3600, z / 3600, 4));
  let h = hills + hMount;

  // ---- plains between the lake and the far range
  const dLake = Math.abs(side - LAKE_SIDE);
  const plainLow =
    sstep(9500, 13500, along) *
    (1 - sstep(17500, 20500, along)) *
    (1 - sstep(3500, 8500, dLake + 1200 * nMisc.noise2(x / 5000, z / 5000)));
  const plainH = 62 + 160 * Math.pow(0.5 + 0.5 * nMisc.fbm2(x / 2600 + 9.1, z / 2600, 4), 1.6);
  h += (plainH - h) * plainLow;

  // ---- glide valley
  const vNoise = 380 * nMisc.fbm2(x / 2600, z / 2600, 3);
  const vprof = sstep(W * 0.45, W * 1.6, dsV + vNoise);
  const valleyLow = corridorOn * (1 - vprof);
  const floorH = 56 + 95 * Math.pow(sat(dsV / (W * 1.3)), 1.6) + 16 * (0.5 + 0.5 * nMisc.fbm2(x / 900, z / 900, 3));
  h += (floorH - h) * valleyLow;

  // ---- lake basin
  const lakeD =
    Math.hypot((along - LAKE_ALONG) / 3300, (side - LAKE_SIDE) / 2600) + 0.22 * nMisc.fbm2(x / 3000 - 7.7, z / 3000, 3);
  const lakeLow = 1 - sstep(1.0, 1.9, lakeD);
  const lakeH = lakeD < 1 ? WATER_LEVEL - 26 * sat((1 - lakeD) / 0.4) - 2 + 6 * sat((lakeD - 0.92) / 0.08) : 54 + 110 * sat((lakeD - 1) / 0.9);
  h += (lakeH - h) * lakeLow;

  // ---- river (flows along the valley into the lake)
  if (along > -3200 && along < LAKE_ALONG) {
    const rc = riverCenter(along);
    const dr = Math.abs(side - rc);
    const up = sstep(-3200, -1200, along);
    const rw = (10 + 38 * sat((along + 1200) / 11000)) * (0.5 + 0.5 * up);
    const rm = 1 - sstep(rw * 0.55, rw * 1.25, dr);
    if (rm > 0) {
      const bed = WATER_LEVEL - (1.2 + 4.5 * up) * (1 - Math.pow(sat(dr / (rw * 1.25)), 2));
      h += (bed - h) * rm * sat(valleyLow * 1.5 + lakeLow);
    }
    // Soft banks: floodplain dips towards the channel.
    const bank = (1 - sstep(rw, rw * 5, dr)) * valleyLow;
    h -= bank * Math.max(0, h - (WATER_LEVEL + 2.5)) * 0.5;
  }

  // ---- fade to low hills at the heightmap border
  const rx = Math.abs(x - TERRAIN_CENTER.x) / (TERRAIN_SIZE * 0.5);
  const rz = Math.abs(z - TERRAIN_CENTER.y) / (TERRAIN_SIZE * 0.5);
  const edge = sstep(0.8, 0.99, Math.max(rx, rz));
  h += (90 + 60 * (0.5 + 0.5 * nMisc.noise2(x / 7000, z / 7000)) - h) * edge;
  // Keep the dive and glide corridor open: a wide valley under the island towards the sun,
  // with the flanking ranges pushed back so the reveal looks out over the whole world.
  const corridor = sstep(-3000, -1200, along) * (1 - sstep(9000, 12000, along)) * (1 - sstep(1600, 4200, Math.abs(side)));
  const floor = 160 + 260 * sstep(1600, 4200, Math.abs(side));
  if (h > floor) h -= (h - floor) * corridor;
  return h;
}

// ---------------------------------------------------------------------------------------------
// Baked terrain data
// ---------------------------------------------------------------------------------------------
export type ProgressFn = (p: number) => void;

async function rows(n: number, fn: (j: number) => void, onP: ProgressFn, p0: number, p1: number): Promise<void> {
  let t = performance.now();
  for (let j = 0; j < n; j++) {
    fn(j);
    if (performance.now() - t > 14) {
      onP(p0 + ((p1 - p0) * (j + 1)) / n);
      await new Promise<void>((r) => setTimeout(r, 0));
      t = performance.now();
    }
  }
  onP(p1);
}

export class TerrainData {
  /** Mesh resolution (vertices per side). */
  readonly M: number;
  /** Heightmap resolution (texels per side) = 2M - 1. */
  readonly H: number;
  readonly wx: AxisWarp;
  readonly wz: AxisWarp;
  /** World coordinates of heightmap columns / rows. */
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly hFine: Float32Array;
  readonly hMesh: Float32Array;
  readonly shadow: Float32Array;
  readonly ao: Float32Array;
  readonly forest: Float32Array;
  readonly moist: Float32Array;
  maxHeight = 0;

  constructor(M = 540) {
    this.M = M;
    this.H = 2 * M - 1;
    const half = TERRAIN_SIZE * 0.5;
    // Densest under the middle of the glide corridor.
    const [cx, cz] = corridorToWorld(3800, 0);
    const k = 6.5;
    this.wx = makeWarp(TERRAIN_CENTER.x - half, TERRAIN_CENTER.x + half, cx, k);
    this.wz = makeWarp(TERRAIN_CENTER.y - half, TERRAIN_CENTER.y + half, cz, k);
    const H = this.H;
    this.xs = new Float64Array(H);
    this.zs = new Float64Array(H);
    for (let i = 0; i < H; i++) {
      this.xs[i] = warpToWorld(this.wx, i / (H - 1));
      this.zs[i] = warpToWorld(this.wz, i / (H - 1));
    }
    this.hFine = new Float32Array(H * H);
    this.hMesh = new Float32Array(M * M);
    this.shadow = new Float32Array(M * M);
    this.ao = new Float32Array(M * M);
    this.forest = new Float32Array(M * M);
    this.moist = new Float32Array(M * M);
  }

  meshX(i: number): number {
    return this.xs[2 * i];
  }
  meshZ(j: number): number {
    return this.zs[2 * j];
  }

  async generate(onP: ProgressFn): Promise<void> {
    const { H, M, xs, zs, hFine, hMesh } = this;
    await rows(
      H,
      (j) => {
        const z = zs[j];
        const o = j * H;
        for (let i = 0; i < H; i++) hFine[o + i] = terrainHeightFn(xs[i], z);
      },
      onP,
      0,
      0.55,
    );
    let mx = 0;
    for (let j = 0; j < M; j++)
      for (let i = 0; i < M; i++) {
        const h = hFine[2 * j * H + 2 * i];
        hMesh[j * M + i] = h;
        if (h > mx) mx = h;
      }
    this.maxHeight = mx;
    await rows(M, (j) => this.bakeRow(j), onP, 0.55, 1);
  }

  /** Exact height of the rendered mesh surface (same triangulation). */
  heightAt(x: number, z: number): number {
    const M = this.M;
    let u = worldToWarp(this.wx, x) * (M - 1);
    let v = worldToWarp(this.wz, z) * (M - 1);
    u = Math.min(Math.max(u, 0), M - 1.0001);
    v = Math.min(Math.max(v, 0), M - 1.0001);
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const hm = this.hMesh;
    const a = hm[j * M + i];
    const b = hm[j * M + i + 1];
    const c = hm[(j + 1) * M + i];
    const d = hm[(j + 1) * M + i + 1];
    if (fu + fv <= 1) return a + (b - a) * fu + (c - a) * fv;
    return d + (c - d) * (1 - fu) + (b - d) * (1 - fv);
  }

  /** Bilinear sample of a mesh-resolution field at a world position. */
  sampleField(f: Float32Array, x: number, z: number): number {
    const M = this.M;
    let u = worldToWarp(this.wx, x) * (M - 1);
    let v = worldToWarp(this.wz, z) * (M - 1);
    u = Math.min(Math.max(u, 0), M - 1.0001);
    v = Math.min(Math.max(v, 0), M - 1.0001);
    const i = Math.floor(u);
    const j = Math.floor(v);
    const fu = u - i;
    const fv = v - j;
    const o = j * M + i;
    return (f[o] * (1 - fu) + f[o + 1] * fu) * (1 - fv) + (f[o + M] * (1 - fu) + f[o + M + 1] * fu) * fv;
  }

  /** Mesh-resolution normal (world). */
  normalAt(i: number, j: number, out: THREE.Vector3): THREE.Vector3 {
    const M = this.M;
    const i0 = Math.max(i - 1, 0);
    const i1 = Math.min(i + 1, M - 1);
    const j0 = Math.max(j - 1, 0);
    const j1 = Math.min(j + 1, M - 1);
    const hm = this.hMesh;
    const dx = (hm[j * M + i1] - hm[j * M + i0]) / (this.meshX(i1) - this.meshX(i0));
    const dz = (hm[j1 * M + i] - hm[j0 * M + i]) / (this.meshZ(j1) - this.meshZ(j0));
    return out.set(-dx, 1, -dz).normalize();
  }

  private bakeRow(j: number): void {
    const M = this.M;
    const hm = this.hMesh;
    const z = this.meshZ(j);
    const sx = SUN_XZ.x;
    const sz = SUN_XZ.y;
    const maxH = this.maxHeight + 50;
    const n = new THREE.Vector3();
    for (let i = 0; i < M; i++) {
      const x = this.meshX(i);
      const h0 = hm[j * M + i];
      const o = j * M + i;
      // --- soft sun shadow: march towards the sun over the mesh heightfield.
      let lit = 1;
      let d = 25;
      const h0b = h0 + 4;
      while (true) {
        const ray = h0b + d * SUN_TAN;
        if (ray > maxH) break;
        const px = x + sx * d;
        const pz = z + sz * d;
        const hs = this.sampleField(hm, px, pz);
        const q = (40 * (ray - hs)) / d; // penumbra ~ 1/40 rad
        if (q < lit) {
          lit = q;
          if (lit <= 0) {
            lit = 0;
            break;
          }
        }
        d += Math.max(18, d * 0.065);
        if (d > 60000) break;
      }
      this.shadow[o] = lit * lit * (3 - 2 * lit);

      // --- ambient occlusion: horizon-ish estimate at two radii, 8 directions.
      let occ = 0;
      for (let r = 0; r < 2; r++) {
        const rad = r === 0 ? 120 : 520;
        let acc = 0;
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2 + r * 0.4;
          const hs = this.sampleField(hm, x + Math.cos(ang) * rad, z + Math.sin(ang) * rad);
          acc += sat((hs - h0) / rad);
        }
        occ += acc / 8;
      }
      this.ao[o] = sat(1 - occ * 0.8);

      // --- forest density: mid elevations, moderate slopes, patchy.
      this.normalAt(i, j, n);
      const slope = 1 - n.y;
      const patch = 0.5 + 0.5 * nMisc.fbm2(x / 1400 + 11.3, z / 1400 - 4.2, 4);
      const band = sstep(WATER_LEVEL + 6, WATER_LEVEL + 40, h0) * (1 - sstep(1350, 1750, h0 + 200 * patch));
      const slopeOK = 1 - sstep(0.18, 0.34, slope);
      this.forest[o] = sat(band * slopeOK * sstep(0.42, 0.62, patch + 0.12 * sat((h0 - 250) / 600)));

      // --- moisture: near the river / lake shores.
      const along = x * SUN_XZ.x + z * SUN_XZ.y;
      const side = x * PERP_XZ.x + z * PERP_XZ.y;
      const dr = Math.abs(side - riverCenter(along));
      const wet = (1 - sstep(60, 600, dr)) * sstep(-2500, -800, along) + (1 - sstep(0, 40, h0 - WATER_LEVEL)) * 0.6;
      this.moist[o] = sat(wet);
    }
  }
}
