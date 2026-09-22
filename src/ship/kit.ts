import * as THREE from 'three';
import type { Batcher } from '../engine/batcher';
import type { LightDef, LightPool } from '../engine/lightPool';
import type { Materials } from '../materials/library';
import { screenColor, type ScreenPalette, type ScreenType } from '../materials/screens';
import type { CollisionWorld } from '../player/collision';
import type { SignAtlas, SignStyle } from './signs';
import type { Zones } from '../engine/zones';
import type { Door } from './doors';

// ---------------------------------------------------------------------------
// Geometry primitives (cached; the batcher clones on add).
// ---------------------------------------------------------------------------

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

/** Box with flat 45-degree chamfers on every edge; the chamfers catch highlights. */
export function chamferBox(w: number, h: number, d: number, b: number): THREE.BufferGeometry {
  const key = `cb:${w.toFixed(4)}:${h.toFixed(4)}:${d.toFixed(4)}:${b.toFixed(4)}`;
  return cached(key, () => {
    const H = [w / 2, h / 2, d / 2];
    b = Math.min(b, H[0] * 0.95, H[1] * 0.95, H[2] * 0.95);
    if (b <= 1e-4) return new THREE.BoxGeometry(w, h, d);
    const pos: number[] = [];
    const nor: number[] = [];
    const idx: number[] = [];
    const v = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    const poly = (pts: number[][], n: number[]) => {
      const nn = new THREE.Vector3(n[0], n[1], n[2]).normalize();
      e1.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]);
      e2.set(pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]);
      const flip = v.crossVectors(e1, e2).dot(nn) < 0;
      const ordered = flip ? [...pts].reverse() : pts;
      const base = pos.length / 3;
      for (const p of ordered) {
        pos.push(p[0], p[1], p[2]);
        nor.push(nn.x, nn.y, nn.z);
      }
      for (let i = 1; i < ordered.length - 1; i++) idx.push(base, base + i, base + i + 1);
    };
    const P = (a: number, va: number, bb: number, vb: number, c: number, vc: number) => {
      const p = [0, 0, 0];
      p[a] = va;
      p[bb] = vb;
      p[c] = vc;
      return p;
    };
    // Faces.
    for (let a = 0; a < 3; a++) {
      const u = (a + 1) % 3;
      const w2 = (a + 2) % 3;
      for (const s of [-1, 1]) {
        const hu = H[u] - b;
        const hw = H[w2] - b;
        const n = [0, 0, 0];
        n[a] = s;
        poly(
          [P(a, s * H[a], u, -hu, w2, -hw), P(a, s * H[a], u, hu, w2, -hw), P(a, s * H[a], u, hu, w2, hw), P(a, s * H[a], u, -hu, w2, hw)],
          n,
        );
      }
    }
    // Edge chamfers.
    for (let a1 = 0; a1 < 3; a1++) {
      for (let a2 = a1 + 1; a2 < 3; a2++) {
        const a3 = 3 - a1 - a2;
        for (const s1 of [-1, 1]) {
          for (const s2 of [-1, 1]) {
            const h3 = H[a3] - b;
            const n = [0, 0, 0];
            n[a1] = s1;
            n[a2] = s2;
            poly(
              [
                P(a1, s1 * H[a1], a2, s2 * (H[a2] - b), a3, -h3),
                P(a1, s1 * H[a1], a2, s2 * (H[a2] - b), a3, h3),
                P(a1, s1 * (H[a1] - b), a2, s2 * H[a2], a3, h3),
                P(a1, s1 * (H[a1] - b), a2, s2 * H[a2], a3, -h3),
              ],
              n,
            );
          }
        }
      }
    }
    // Corners.
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          poly(
            [
              [sx * H[0], sy * (H[1] - b), sz * (H[2] - b)],
              [sx * (H[0] - b), sy * H[1], sz * (H[2] - b)],
              [sx * (H[0] - b), sy * (H[1] - b), sz * H[2]],
            ],
            [sx, sy, sz],
          );
        }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return g;
  });
}

export function boxGeo(w: number, h: number, d: number) {
  return cached(`b:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
}
export function cylGeo(rTop: number, rBot: number, h: number, seg = 16, open = false) {
  return cached(`c:${rTop}:${rBot}:${h}:${seg}:${open}`, () => new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open));
}
export function sphereGeo(r: number, ws = 16, hs = 12) {
  return cached(`s:${r}:${ws}:${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
}
export function torusGeo(r: number, tube: number, rs = 8, ts = 24, arc = Math.PI * 2) {
  return cached(`t:${r}:${tube}:${rs}:${ts}:${arc}`, () => new THREE.TorusGeometry(r, tube, rs, ts, arc));
}
export function planeGeo(w: number, h: number) {
  return cached(`p:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
}
/** Lathe from a [radius, y] profile. */
export function latheGeo(profile: [number, number][], seg = 32, key?: string) {
  const make = () => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  return key ? cached(`l:${key}:${seg}`, make) : make();
}
/** Extrude a 2D profile (x, y) along +z by depth, centred on z. */
export function extrudeGeo(points: [number, number][], depth: number, key?: string) {
  const make = () => {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    g.translate(0, 0, -depth / 2);
    return g;
  };
  return key ? cached(`e:${key}:${depth}`, make) : make();
}

const UP = new THREE.Vector3(0, 1, 0);
const tmpQ = new THREE.Quaternion();
const ONE = new THREE.Vector3(1, 1, 1);

/** Matrix placing a Y-aligned primitive of the given length between two points. */
export function alignY(a: THREE.Vector3, b: THREE.Vector3) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  dir.divideScalar(len || 1);
  tmpQ.setFromUnitVectors(UP, dir);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return { matrix: new THREE.Matrix4().compose(mid, tmpQ, ONE), length: len };
}

export const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// Builder: a transform stack + helpers that feed the batcher, lights and colliders.
// ---------------------------------------------------------------------------

export interface ShipContext {
  M: Materials;
  screen: THREE.ShaderMaterial;
  signMat: THREE.Material;
  signGlowMat: THREE.Material;
  batcher: Batcher;
  lights: LightPool;
  collision: CollisionWorld;
  zones: Zones;
  signs: SignAtlas;
  doors: Door[];
  /** Per-frame animation callbacks (fans, beacons, holograms...). */
  animators: ((time: number, dt: number) => void)[];
}

export interface PieceOpts {
  color?: THREE.ColorRepresentation | THREE.Color;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  uvScale?: number;
  uv?: 'box' | 'keep';
  uvRepeat?: [number, number];
  uvOffset?: [number, number];
  uvShift?: [number, number, number];
}

const colorCache = new Map<string, THREE.Color>();
export function col(c: THREE.ColorRepresentation | THREE.Color | undefined, scale = 1): THREE.Color | undefined {
  if (c === undefined) return undefined;
  if (c instanceof THREE.Color) return scale === 1 ? c : c.clone().multiplyScalar(scale);
  const key = `${String(c)}*${scale}`;
  let v = colorCache.get(key);
  if (!v) {
    v = new THREE.Color(c).multiplyScalar(scale);
    colorCache.set(key, v);
  }
  return v;
}

export class Builder {
  zone = 'exterior';
  private stack: THREE.Matrix4[] = [new THREE.Matrix4()];
  constructor(readonly ctx: ShipContext) {}

  get M() {
    return this.ctx.M;
  }
  get top() {
    return this.stack[this.stack.length - 1];
  }

  inZone(zone: string, fn: () => void) {
    const prev = this.zone;
    this.zone = zone;
    fn();
    this.zone = prev;
  }

  /** Run fn with a local frame translated to (x,y,z) and rotated about Y (then X, Z). */
  at(x: number, y: number, z: number, rotY: number, fn: () => void, rotX = 0, rotZ = 0) {
    const m = new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ, 'YXZ')), ONE);
    this.stack.push(this.top.clone().multiply(m));
    try {
      fn();
    } finally {
      this.stack.pop();
    }
  }

  withMatrix(m: THREE.Matrix4, fn: () => void) {
    this.stack.push(this.top.clone().multiply(m));
    try {
      fn();
    } finally {
      this.stack.pop();
    }
  }

  /** Transform a local point to world space. */
  world(x: number, y: number, z: number) {
    return V(x, y, z).applyMatrix4(this.top);
  }
  /** World-space yaw of the current frame. */
  yaw() {
    const e = new THREE.Euler().setFromRotationMatrix(this.top, 'YXZ');
    return e.y;
  }

  geo(material: THREE.Material, geometry: THREE.BufferGeometry, local: THREE.Matrix4, o: PieceOpts = {}) {
    const m = this.top.clone().multiply(local);
    this.ctx.batcher.add(geometry, m, material, this.zone, {
      color: col(o.color),
      uv: o.uv,
      uvScale: o.uvScale,
      uvRepeat: o.uvRepeat,
      uvOffset: o.uvOffset,
      uvShift: o.uvShift,
    });
  }

  private localMatrix(x: number, y: number, z: number, o: PieceOpts) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotX ?? 0, o.rotY ?? 0, o.rotZ ?? 0, 'YXZ'));
    return new THREE.Matrix4().compose(V(x, y, z), q, ONE);
  }

  /** Axis-aligned (in local frame) box centred at (x,y,z). bevel > 0 gives chamfered edges. */
  box(material: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, o: PieceOpts & { bevel?: number } = {}) {
    const g = o.bevel ? chamferBox(w, h, d, o.bevel) : boxGeo(w, h, d);
    // Continuous texture mapping across neighbouring pieces in the same frame.
    const uvShift = o.uvShift ?? (o.rotX || o.rotY || o.rotZ ? undefined : ([x, y, z] as [number, number, number]));
    this.geo(material, g, this.localMatrix(x, y, z, o), { ...o, uvShift });
  }

  /** Box spanning explicit min/max corners (local frame). */
  span(material: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: PieceOpts & { bevel?: number } = {}) {
    this.box(material, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, o);
  }

  /** Cylinder along an axis centred at (x,y,z). */
  cyl(
    material: THREE.Material,
    r: number,
    len: number,
    x: number,
    y: number,
    z: number,
    o: PieceOpts & { axis?: 'x' | 'y' | 'z'; seg?: number; rTop?: number; open?: boolean } = {},
  ) {
    const g = cylGeo(o.rTop ?? r, r, len, o.seg ?? 16, o.open ?? false);
    const axis = o.axis ?? 'y';
    const base = new THREE.Matrix4();
    if (axis === 'x') base.makeRotationZ(-Math.PI / 2);
    else if (axis === 'z') base.makeRotationX(Math.PI / 2);
    const m = this.localMatrix(x, y, z, o).multiply(base);
    this.geo(material, g, m, { ...o, uv: o.uv ?? 'keep', uvRepeat: o.uvRepeat ?? [Math.max(1, Math.round(r * 6.28)), Math.max(1, len)] });
  }

  sphere(material: THREE.Material, r: number, x: number, y: number, z: number, o: PieceOpts & { ws?: number; hs?: number; sy?: number } = {}) {
    const m = this.localMatrix(x, y, z, o);
    if (o.sy) m.scale(V(1, o.sy, 1));
    this.geo(material, sphereGeo(r, o.ws ?? 16, o.hs ?? 12), m, o);
  }

  /** Straight cylinder between two local points. */
  rod(material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, r: number, o: PieceOpts & { seg?: number } = {}) {
    const { matrix, length } = alignY(a, b);
    this.geo(material, cylGeo(r, r, length, o.seg ?? 10), matrix, { ...o, uv: 'keep', uvRepeat: [1, Math.max(1, length)] });
  }

  /**
   * A pipe along a polyline with rounded elbows, flanges at joints and optional
   * wall brackets. Points are in the local frame.
   */
  pipe(
    material: THREE.Material,
    points: THREE.Vector3[],
    r: number,
    o: PieceOpts & { bend?: number; seg?: number; flanges?: boolean; flangeEvery?: number; brackets?: THREE.Vector3 } = {},
  ) {
    const bend = o.bend ?? Math.max(r * 2.5, 0.08);
    const seg = o.seg ?? (r > 0.12 ? 16 : 10);
    const n = points.length;
    const starts: THREE.Vector3[] = [];
    const ends: THREE.Vector3[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = points[i].clone();
      const b = points[i + 1].clone();
      const dir = b.clone().sub(a).normalize();
      const len = a.distanceTo(b);
      const cut = Math.min(bend, len * 0.45);
      if (i > 0) a.addScaledVector(dir, cut);
      if (i < n - 2) b.addScaledVector(dir, -cut);
      starts.push(a);
      ends.push(b);
      const { matrix, length } = alignY(a, b);
      this.geo(material, cylGeo(r, r, length, seg, true), matrix, { ...o, uv: 'keep', uvRepeat: [1, Math.max(1, length * 2)] });
      if (o.flanges !== false) {
        const every = o.flangeEvery ?? 2.4;
        const count = Math.floor(len / every);
        for (let k = 1; k <= count; k++) {
          const t = k / (count + 1);
          const p = a.clone().lerp(b, t);
          const fm = alignY(p.clone().addScaledVector(dir, -0.025), p.clone().addScaledVector(dir, 0.025));
          this.geo(this.M.brushed, cylGeo(r * 1.35, r * 1.35, 0.05, seg), fm.matrix, { color: 0x8a8a86 });
          if (o.brackets) {
            // Bracket from pipe towards the mounting surface.
            const to = p.clone().add(o.brackets);
            this.rod(this.M.painted, p, to, Math.max(0.012, r * 0.35), { color: 0x3a3c3e, seg: 6 });
            this.box(this.M.painted, 0.08, 0.08, 0.02, to.x, to.y, to.z, { color: 0x3a3c3e, rotY: Math.atan2(o.brackets.x, o.brackets.z) });
          }
        }
      }
    }
    // Elbows as short tubes along quadratic curves.
    for (let i = 1; i < n - 1; i++) {
      const curve = new THREE.QuadraticBezierCurve3(ends[i - 1], points[i], starts[i]);
      const tube = new THREE.TubeGeometry(curve, 6, r, seg, false);
      this.geo(material, tube, new THREE.Matrix4(), { ...o, uv: 'keep', uvRepeat: [1, 1] });
    }
  }

  /** Emissive box (HDR vertex color). */
  glow(color: THREE.ColorRepresentation, intensity: number, w: number, h: number, d: number, x: number, y: number, z: number, o: PieceOpts = {}) {
    this.geo(this.M.glow, boxGeo(w, h, d), this.localMatrix(x, y, z, o), { color: col(color, intensity) });
  }

  /**
   * An animated display quad facing local +z, with a dark bezel behind it.
   * (x, y, z) is the screen centre; tilt leans the top back.
   */
  screen(type: ScreenType, palette: ScreenPalette, w: number, h: number, x: number, y: number, z: number, o: { rotY?: number; tilt?: number; seed?: number; bezel?: number } = {}) {
    this.at(x, y, z, o.rotY ?? 0, () => {
      const bz = o.bezel ?? 0.03;
      this.box(this.M.painted, w + bz * 2, h + bz * 2, 0.04, 0, 0, -0.021, { color: 0x1b1d20, bevel: 0.008 });
      const seed = o.seed ?? Math.random();
      this.geo(this.ctx.screen, planeGeo(w, h), new THREE.Matrix4().makeTranslation(0, 0, 0.001), { color: screenColor(type, palette, seed), uv: 'keep' });
    }, -(o.tilt ?? 0));
  }

  /** Register a light fixture at a local position. */
  light(x: number, y: number, z: number, color: THREE.ColorRepresentation, intensity: number, distance: number, extra: Partial<LightDef> = {}) {
    return this.ctx.lights.add({
      pos: this.world(x, y, z),
      color: new THREE.Color(color),
      intensity,
      distance,
      zone: this.zone,
      ...extra,
    });
  }

  /** 2D collision box in the local frame (footprint w x d centred at x, z). */
  solid(w: number, d: number, x: number, z: number, rotY = 0) {
    const c = this.world(x, 0, z);
    this.ctx.collision.addBox(c.x, c.z, w / 2, d / 2, this.yaw() + rotY);
  }
  solidCircle(r: number, x: number, z: number) {
    const c = this.world(x, 0, z);
    this.ctx.collision.addCircle(c.x, c.z, r);
  }

  /** Sign plate facing local +z. */
  sign(lines: string[], w: number, h: number, x: number, y: number, z: number, style: Partial<SignStyle> = {}, o: { rotY?: number; glow?: number } = {}) {
    const rect = this.ctx.signs.add(lines, w / h, style, h);
    const g = planeGeo(w, h).clone();
    const uv = g.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, rect.u0 + uv.getX(i) * (rect.u1 - rect.u0), rect.v0 + uv.getY(i) * (rect.v1 - rect.v0));
    const mat = o.glow ? this.ctx.signGlowMat : this.ctx.signMat;
    const m = this.localMatrix(x, y, z, { rotY: o.rotY ?? 0 });
    this.geo(mat, g, m, { uv: 'keep', color: o.glow ? col(0xffffff, o.glow) : undefined });
  }
}
