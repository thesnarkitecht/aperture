import * as THREE from 'three';
import { Builder, V, extrudeGeo } from './kit';
import { DOORS, HULL, HULL_BOTTOM, HULL_MODULES, ROOMS, SKIN, WINDOWS, type RoomDef } from './layout';
import { pointInPoly } from '../player/collision';

type P2 = [number, number];

export interface Opening {
  x: number;
  z: number;
  dir: P2;
  half: number;
  y0: number;
  y1: number;
  kind: 'door' | 'window' | 'hatch';
}

export const OPENINGS: Opening[] = [
  ...DOORS.map<Opening>((d) => ({
    x: d.x,
    z: d.z,
    dir: d.wall === 'x' ? [0, 1] : [1, 0],
    half: d.width / 2,
    y0: 0,
    y1: d.height,
    kind: d.kind === 'hatch' ? 'hatch' : 'door',
  })),
  ...WINDOWS.map<Opening>((w) => ({ x: w.x, z: w.z, dir: w.dir, half: w.width / 2, y0: w.y0, y1: w.y1, kind: 'window' })),
];

function centroid(poly: P2[]): P2 {
  let x = 0;
  let z = 0;
  for (const p of poly) {
    x += p[0];
    z += p[1];
  }
  return [x / poly.length, z / poly.length];
}

/** Unit normal of edge a->b pointing towards the polygon centroid. */
function inwardNormal(a: P2, b: P2, c: P2): P2 {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz);
  let nx = -dz / l;
  let nz = dx / l;
  const mx = (a[0] + b[0]) / 2;
  const mz = (a[1] + b[1]) / 2;
  if ((c[0] - mx) * nx + (c[1] - mz) * nz < 0) {
    nx = -nx;
    nz = -nz;
  }
  return [nx, nz];
}

interface StripOpts {
  material: THREE.Material;
  color?: number;
  collide?: boolean;
  /** Openings to ignore (e.g. hull strips above another module). */
  noOpenings?: boolean;
  uvScale?: number;
  /** Extend the strip by this much past each end along the wall. */
  extend?: [number, number];
}

/**
 * Build a straight wall strip along a->b occupying offsets [near, far] along the
 * inward normal n, from y0 to y1, with door/window openings cut out.
 */
export function wallStrip(b: Builder, a: P2, c: P2, n: P2, near: number, far: number, y0: number, y1: number, o: StripOpts) {
  const dx = c[0] - a[0];
  const dz = c[1] - a[1];
  const L = Math.hypot(dx, dz);
  const dir: P2 = [dx / L, dz / L];
  // Right-handed frame: X along the wall, Y up, Z = X x Y.
  const Z: P2 = [-dir[1], dir[0]];
  const sZ = Math.sign(Z[0] * n[0] + Z[1] * n[1]) || 1;
  const frame = new THREE.Matrix4().makeBasis(V(dir[0], 0, dir[1]), V(0, 1, 0), V(Z[0], 0, Z[1]));
  frame.setPosition(a[0], 0, a[1]);

  const [e0, e1] = o.extend ?? [0, 0];
  const t0 = -e0;
  const t1 = L + e1;
  const cuts: { t0: number; t1: number; y0: number; y1: number; door: boolean }[] = [];
  if (!o.noOpenings) {
    for (const op of OPENINGS) {
      const rx = op.x - a[0];
      const rz = op.z - a[1];
      const across = Math.abs(rx * Z[0] + rz * Z[1]);
      const parallel = Math.abs(op.dir[0] * dir[0] + op.dir[1] * dir[1]);
      if (across > 0.08 || parallel < 0.99) continue;
      const t = rx * dir[0] + rz * dir[1];
      const ot0 = Math.max(t0, t - op.half);
      const ot1 = Math.min(t1, t + op.half);
      if (ot1 <= ot0 + 0.01) continue;
      cuts.push({ t0: ot0, t1: ot1, y0: op.y0, y1: op.y1, door: op.kind !== 'window' });
    }
  }
  cuts.sort((p, q) => p.t0 - q.t0);

  const zc = (sZ * (near + far)) / 2;
  const depth = Math.abs(far - near);
  const piece = (pa: number, pb: number, ya: number, yb: number) => {
    if (pb - pa < 0.005 || yb - ya < 0.005) return;
    b.withMatrix(frame, () =>
      b.box(o.material, pb - pa, yb - ya, depth, (pa + pb) / 2, (ya + yb) / 2, zc, { color: o.color, uvScale: o.uvScale }),
    );
  };
  let cursor = t0;
  for (const cut of cuts) {
    if (cut.t0 > cursor) piece(cursor, cut.t0, y0, y1);
    if (cut.y0 > y0) piece(cut.t0, cut.t1, y0, Math.min(y1, cut.y0));
    if (cut.y1 < y1) piece(cut.t0, cut.t1, Math.max(y0, cut.y1), y1);
    cursor = Math.max(cursor, cut.t1);
  }
  if (cursor < t1) piece(cursor, t1, y0, y1);

  if (o.collide) {
    // Collision along the inner face, with gaps at doors.
    const off = sZ * far;
    const toWorld = (t: number): P2 => [a[0] + dir[0] * t + Z[0] * off, a[1] + dir[1] * t + Z[1] * off];
    let cur = t0;
    const gaps = cuts.filter((g) => g.door);
    for (const g of gaps) {
      if (g.t0 > cur) {
        const p = toWorld(cur);
        const q = toWorld(g.t0);
        b.ctx.collision.addSegment(p[0], p[1], q[0], q[1]);
      }
      cur = Math.max(cur, g.t1);
    }
    if (cur < t1) {
      const p = toWorld(cur);
      const q = toWorld(t1);
      b.ctx.collision.addSegment(p[0], p[1], q[0], q[1]);
    }
  }
  return { frame, dir, Z, sZ, L };
}

/** Flat slab covering a polygon between y0 and y1. */
export function polySlab(b: Builder, poly: P2[], y0: number, y1: number, material: THREE.Material, color?: number, uvScale?: number) {
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const isRect =
    poly.length === 4 &&
    poly.every((p) => (p[0] === Math.min(...xs) || p[0] === Math.max(...xs)) && (p[1] === Math.min(...zs) || p[1] === Math.max(...zs)));
  if (isRect) {
    b.span(material, Math.min(...xs), y0, Math.min(...zs), Math.max(...xs), y1, Math.max(...zs), { color, uvScale });
    return;
  }
  // Shape in (x, z); extrude along +z then rotate so extrusion points down from y1.
  const g = extrudeGeo(poly.map(([x, z]) => [x, z] as P2), y1 - y0);
  g.translate(0, 0, (y1 - y0) / 2);
  const m = new THREE.Matrix4().makeTranslation(0, y1, 0).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  b.geo(material, g, m, { color, uvScale });
}

function roomSkins(b: Builder, room: RoomDef) {
  const c = centroid(room.poly);
  const grated = room.floor === 'grate';
  const y0 = grated ? -0.4 : 0;
  room.poly.forEach((a, i) => {
    if (room.skipEdges?.includes(i)) return;
    const bb = room.poly[(i + 1) % room.poly.length];
    const n = inwardNormal(a, bb, c);
    wallStrip(b, a, bb, n, 0, SKIN, y0, room.ceilY, { material: b.M.panel, color: room.wallColor, collide: true });
  });
}

function roomFloorCeiling(b: Builder, room: RoomDef) {
  if (room.floor === 'grate') {
    polySlab(b, room.poly, -0.52, -0.4, b.M.painted, 0x2a2c2e);
  } else if (room.floor === 'deck') {
    polySlab(b, room.poly, -0.12, 0, b.M.deck, 0x9a968c);
  } else if (room.floor === 'tread') {
    polySlab(b, room.poly, -0.12, 0, b.M.tread, 0xa8a49a);
  }
  if (room.ceiling === 'panel') {
    polySlab(b, room.poly, room.ceilY, room.ceilY + 0.1, b.M.panel, darken(room.wallColor, 0.85));
  }
}

export function darken(hex: number, f: number) {
  const c = new THREE.Color(hex).multiplyScalar(f);
  return c.getHex();
}

/** Shared intervals between collinear, opposite edges of two modules. */
function sharedIntervals(a: P2, c: P2, selfId: string) {
  const dx = c[0] - a[0];
  const dz = c[1] - a[1];
  const L = Math.hypot(dx, dz);
  const dir: P2 = [dx / L, dz / L];
  const out: { t0: number; t1: number; roof: number }[] = [];
  for (const m of HULL_MODULES) {
    if (m.id === selfId) continue;
    m.poly.forEach((p, i) => {
      const q = m.poly[(i + 1) % m.poly.length];
      const across = (pt: P2) => Math.abs((pt[0] - a[0]) * -dir[1] + (pt[1] - a[1]) * dir[0]);
      if (across(p) > 0.02 || across(q) > 0.02) return;
      const tp = (p[0] - a[0]) * dir[0] + (p[1] - a[1]) * dir[1];
      const tq = (q[0] - a[0]) * dir[0] + (q[1] - a[1]) * dir[1];
      const t0 = Math.max(0, Math.min(tp, tq));
      const t1 = Math.min(L, Math.max(tp, tq));
      if (t1 > t0 + 0.01) out.push({ t0, t1, roof: m.roof });
    });
  }
  return { out, L, dir };
}

function insideOtherModule(x: number, z: number, selfId: string) {
  let roof = -Infinity;
  for (const m of HULL_MODULES) {
    if (m.id === selfId) continue;
    if (pointInPoly(x, z, m.poly)) roof = Math.max(roof, m.roof);
  }
  return roof;
}

function hullSkins(b: Builder) {
  for (const mod of HULL_MODULES) {
    const c = centroid(mod.poly);
    mod.poly.forEach((a, i) => {
      if (mod.skipEdges?.includes(i)) return;
      const cc = mod.poly[(i + 1) % mod.poly.length];
      const n = inwardNormal(a, cc, c);
      const { out, L, dir } = sharedIntervals(a, cc, mod.id);
      out.sort((p, q) => p.t0 - q.t0);
      // Exterior intervals at full height.
      const pieces: { t0: number; t1: number; y0: number; y1: number }[] = [];
      let cur = 0;
      for (const s of out) {
        if (s.t0 > cur) pieces.push({ t0: cur, t1: s.t0, y0: HULL_BOTTOM, y1: mod.roof });
        if (s.roof < mod.roof) pieces.push({ t0: s.t0, t1: s.t1, y0: s.roof, y1: mod.roof });
        cur = Math.max(cur, s.t1);
      }
      if (cur < L) pieces.push({ t0: cur, t1: L, y0: HULL_BOTTOM, y1: mod.roof });
      for (const p of pieces) {
        const pa: P2 = [a[0] + dir[0] * p.t0, a[1] + dir[1] * p.t0];
        const pb: P2 = [a[0] + dir[0] * p.t1, a[1] + dir[1] * p.t1];
        wallStrip(b, pa, pb, n, -HULL, 0, p.y0, p.y1, { material: b.M.hull, color: 0xc9c6bc, noOpenings: p.y0 > 0.5 });
      }
      // Corner posts at polygon vertices, clipped against neighbouring modules.
      for (const end of [0, 1]) {
        const touches = pieces.some((p) => (end === 0 ? p.t0 < 0.01 : p.t1 > L - 0.01) && p.y0 === HULL_BOTTOM);
        if (!touches) continue;
        const vx = end === 0 ? a[0] : cc[0];
        const vz = end === 0 ? a[1] : cc[1];
        const sgn = end === 0 ? -1 : 1;
        const px = vx + dir[0] * sgn * HULL * 0.5 - n[0] * HULL * 0.5;
        const pz = vz + dir[1] * sgn * HULL * 0.5 - n[1] * HULL * 0.5;
        const other = insideOtherModule(px, pz, mod.id);
        const y0 = other > -Infinity ? other : HULL_BOTTOM;
        if (y0 >= mod.roof) continue;
        const pa: P2 = end === 0 ? [vx - dir[0] * HULL, vz - dir[1] * HULL] : [vx, vz];
        const pb: P2 = end === 0 ? [vx, vz] : [vx + dir[0] * HULL, vz + dir[1] * HULL];
        wallStrip(b, pa, pb, n, -HULL, 0, y0, mod.roof, { material: b.M.hull, color: 0xc9c6bc, noOpenings: true });
      }
    });
    // Roof and belly.
    polySlab(b, mod.poly, mod.roof - 0.16, mod.roof, b.M.hull, 0xc4c1b8);
    polySlab(b, mod.poly, HULL_BOTTOM, HULL_BOTTOM + 0.16, b.M.hull, 0x9c9a94);
  }
}

function windowFrames(b: Builder) {
  for (const w of WINDOWS) {
    const room = ROOMS.find((r) => r.id === w.room)!;
    const c = centroid(room.poly);
    const a: P2 = [w.x - w.dir[0], w.z - w.dir[1]];
    const bb: P2 = [w.x + w.dir[0], w.z + w.dir[1]];
    const n = inwardNormal(a, bb, c);
    const yaw = Math.atan2(n[0], n[1]); // local +z = into the room
    const hw = w.width / 2;
    const h = w.y1 - w.y0;
    const yc = (w.y0 + w.y1) / 2;
    // Interior trim + mullions + glass (room zone).
    b.inZone(room.id, () =>
      b.at(w.x, 0, w.z, yaw, () => {
        const z = SKIN + 0.02;
        const t = 0.07;
        b.box(b.M.painted, w.width + t * 2, t, 0.05, 0, w.y1 + t / 2, z, { color: 0x2c3034, bevel: 0.012 });
        b.box(b.M.painted, w.width + t * 2, t * 1.4, 0.07, 0, w.y0 - t * 0.7, z + 0.01, { color: 0x2c3034, bevel: 0.012 });
        for (const s of [-1, 1]) b.box(b.M.painted, t, h, 0.05, s * (hw + t / 2), yc, z, { color: 0x2c3034, bevel: 0.012 });
        const m = w.mullions ?? 0;
        for (let k = 1; k <= m; k++) {
          const x = -hw + (w.width * k) / (m + 1);
          b.box(b.M.painted, 0.06, h, SKIN + HULL, x, yc, (SKIN - HULL) / 2, { color: 0x2c3034 });
        }
        b.geo(b.M.glass, new THREE.PlaneGeometry(w.width, h), new THREE.Matrix4().makeTranslation(0, yc, -HULL * 0.45), { uv: 'keep' });
        // Reveal liner so the opening reads as thick structure.
        b.span(b.M.painted, -hw, w.y0 - 0.005, -HULL, hw, w.y0, SKIN, { color: 0x3a3e42 });
        b.span(b.M.painted, -hw, w.y1, -HULL, hw, w.y1 + 0.005, SKIN, { color: 0x3a3e42 });
      }),
    );
    // Exterior frame (exterior zone).
    b.inZone('exterior', () =>
      b.at(w.x, 0, w.z, yaw, () => {
        const z = -HULL - 0.03;
        const t = 0.12;
        b.box(b.M.hull, w.width + t * 2, t, 0.08, 0, w.y1 + t / 2, z, { color: 0x6a6c6e, bevel: 0.02 });
        b.box(b.M.hull, w.width + t * 2, t, 0.08, 0, w.y0 - t / 2, z, { color: 0x6a6c6e, bevel: 0.02 });
        for (const s of [-1, 1]) b.box(b.M.hull, t, h + t * 2, 0.08, s * (hw + t / 2), yc, z, { color: 0x6a6c6e, bevel: 0.02 });
        // Eyebrow shield.
        b.box(b.M.hull, w.width + 0.5, 0.05, 0.3, 0, w.y1 + 0.18, -HULL - 0.15, { color: 0x8a8880, bevel: 0.015 });
      }),
    );
  }
}

export function buildStructure(b: Builder) {
  for (const room of ROOMS) {
    b.inZone(room.id, () => {
      roomSkins(b, room);
      roomFloorCeiling(b, room);
    });
  }
  b.inZone('exterior', () => hullSkins(b));
  windowFrames(b);
}
