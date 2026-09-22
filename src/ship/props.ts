import * as THREE from 'three';
import { Builder, V, col, cylGeo, latheGeo } from './kit';
import type { ScreenPalette, ScreenType } from '../materials/screens';
import { rng, type Rng } from '../engine/shared';

export const C = {
  warm: 0xffd9a8,
  cool: 0xdfeaff,
  sodium: 0xffb060,
  amber: 0xffa040,
  red: 0xff3020,
  green: 0x50ff80,
  cyan: 0x50d8ff,
  blue: 0x4080ff,
  dark: 0x1c1e21,
  steel: 0x7a7e82,
  gun: 0x3a3e43,
  frame: 0x2f3338,
  orange: 0xc4541c,
  yellow: 0xd29a1a,
};

/** Linear ceiling fixture: housing + diffuser, plus a pooled point light. */
export function ceilingLight(
  b: Builder,
  x: number,
  y: number,
  z: number,
  o: { len?: number; width?: number; color?: number; glow?: number; intensity?: number; distance?: number; rotY?: number; flicker?: number; light?: boolean } = {},
) {
  const len = o.len ?? 1.2;
  const w = o.width ?? 0.22;
  const color = o.color ?? C.cool;
  b.at(x, y, z, o.rotY ?? 0, () => {
    b.box(b.M.painted, w + 0.06, 0.07, len + 0.06, 0, -0.035, 0, { color: C.frame, bevel: 0.012 });
    b.glow(color, o.glow ?? 5, w, 0.012, len, 0, -0.075, 0);
    // Cage bars.
    for (let i = -2; i <= 2; i++) b.box(b.M.painted, w + 0.02, 0.01, 0.012, 0, -0.085, (i / 2.4) * len * 0.5, { color: C.frame });
  });
  if (o.light !== false) return b.light(x, y - 0.25, z, color, o.intensity ?? 9, o.distance ?? 7, { flicker: o.flicker });
  return null;
}

/** Caged bulkhead lamp on a wall, facing local +z. */
export function bulkheadLamp(b: Builder, x: number, y: number, z: number, rotY: number, color = C.warm, intensity = 4, light = true) {
  b.at(x, y, z, rotY, () => {
    b.box(b.M.painted, 0.2, 0.14, 0.05, 0, 0, 0.025, { color: C.gun, bevel: 0.01 });
    b.sphere(b.M.glow, 0.05, 0, 0, 0.08, { color: col(color, 6), sy: 0.8 });
    b.geo(b.M.glow, cylGeo(0.05, 0.05, 0.04, 12), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, 0.06), { color: col(color, 5) });
    for (let i = 0; i < 3; i++) b.box(b.M.painted, 0.012, 0.14, 0.012, (i - 1) * 0.06, 0, 0.12, { color: C.frame });
    b.box(b.M.painted, 0.14, 0.012, 0.012, 0, 0.06, 0.12, { color: C.frame });
    b.box(b.M.painted, 0.14, 0.012, 0.012, 0, -0.06, 0.12, { color: C.frame });
  });
  if (light) b.at(x, y, z, rotY, () => b.light(0, 0, 0.3, color, intensity, 5));
}

/** Grid of small push-buttons, some lit. Faces local +z. */
export function buttonPanel(b: Builder, w: number, h: number, cols: number, rows: number, r: Rng, lit = 0.35) {
  b.box(b.M.painted, w, h, 0.02, 0, 0, -0.01, { color: 0x26292d, bevel: 0.004 });
  const cw = w / cols;
  const rh = h / rows;
  const palette = [C.amber, C.green, C.cyan, C.red, C.warm];
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const x = -w / 2 + cw * (i + 0.5);
      const y = -h / 2 + rh * (j + 0.5);
      if (r.chance(lit)) b.glow(r.pick(palette), r.range(1.5, 4), cw * 0.55, rh * 0.45, 0.012, x, y, 0.006);
      else b.box(b.M.plastic, cw * 0.6, rh * 0.5, 0.016, x, y, 0.004, { color: r.pick([0x3a3d40, 0x4a4d50, 0x6a3020, 0x2a3a4a]) });
    }
}

/** Toggle switches with guards. Faces local +z. */
export function toggleRow(b: Builder, w: number, n: number, r: Rng) {
  b.box(b.M.painted, w, 0.08, 0.02, 0, 0, -0.01, { color: 0x2a2d31 });
  for (let i = 0; i < n; i++) {
    const x = -w / 2 + (w / n) * (i + 0.5);
    b.rod(b.M.brushed, V(x, 0, 0), V(x, r.chance(0.5) ? 0.03 : -0.03, 0.035), 0.004, { seg: 6 });
    b.glow(r.chance(0.6) ? C.green : C.red, 3, 0.008, 0.008, 0.006, x, 0.03, 0.003);
  }
}

/**
 * Workstation console facing local +z (operator stands/sits at +z).
 * Angled desk with screens on a raised back panel.
 */
export function console(
  b: Builder,
  w: number,
  o: { screens?: [ScreenType, ScreenPalette][]; height?: number; depth?: number; seed?: number; color?: number; back?: boolean } = {},
) {
  const r = rng(o.seed ?? 7);
  const depth = o.depth ?? 0.75;
  const h = o.height ?? 0.82;
  const color = o.color ?? 0x3d4247;
  // Pedestal.
  b.box(b.M.painted, w, h - 0.1, depth - 0.2, 0, (h - 0.1) / 2, -0.1, { color, bevel: 0.02 });
  b.box(b.M.painted, w + 0.02, 0.08, depth - 0.24, 0, 0.04, -0.1, { color: C.dark });
  // Angled desk surface.
  b.at(0, h, 0.02, 0, () => {
    b.box(b.M.painted, w + 0.04, 0.05, depth * 0.62, 0, 0, 0, { color: 0x2b2f33, bevel: 0.015 });
    b.at(0, 0.03, 0, 0, () => {
      buttonPanel(b, w * 0.42, depth * 0.34, 10, 4, r);
      b.at(w * 0.28, 0, 0, 0, () => toggleRow(b, w * 0.3, 8, r));
    }, -Math.PI / 2 + 0.25);
  }, 0.0);
  b.solid(w + 0.1, depth, 0, -0.08);
  // Screen back panel.
  const screens = o.screens ?? [['graphs', 'cyan']];
  if (o.back !== false) {
    b.box(b.M.painted, w, 0.5, 0.12, 0, h + 0.3, -depth / 2 + 0.02, { color, bevel: 0.02, rotX: -0.12 });
    const sw = (w - 0.1) / screens.length;
    screens.forEach(([type, pal], i) => {
      b.screen(type, pal, sw - 0.06, 0.36, -w / 2 + 0.05 + sw * (i + 0.5), h + 0.31, -depth / 2 + 0.09, { tilt: 0.12, seed: r.next() });
    });
  }
}

/** Swivel chair facing local +z. */
export function chair(b: Builder, o: { color?: number; pilot?: boolean } = {}) {
  const color = o.color ?? 0x3a3530;
  b.cyl(b.M.brushed, 0.04, 0.42, 0, 0.25, 0, { seg: 10 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    b.rod(b.M.painted, V(0, 0.05, 0), V(Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3), 0.018, { color: C.dark, seg: 6 });
    b.sphere(b.M.rubber, 0.03, Math.cos(a) * 0.3, 0.03, Math.sin(a) * 0.3, { ws: 8, hs: 6 });
  }
  b.box(b.M.fabric, 0.52, 0.1, 0.5, 0, 0.5, 0, { color, bevel: 0.03 });
  const backH = o.pilot ? 0.85 : 0.55;
  b.box(b.M.fabric, 0.5, backH, 0.1, 0, 0.55 + backH / 2, -0.24, { color, bevel: 0.035, rotX: -0.12 });
  if (o.pilot) {
    b.box(b.M.fabric, 0.3, 0.18, 0.12, 0, 0.55 + backH + 0.06, -0.3, { color, bevel: 0.03, rotX: -0.12 });
    for (const s of [-1, 1]) {
      b.box(b.M.painted, 0.08, 0.06, 0.42, s * 0.3, 0.72, 0.02, { color: C.dark, bevel: 0.015 });
      b.box(b.M.painted, 0.05, 0.2, 0.05, s * 0.3, 0.6, -0.15, { color: C.dark });
      b.box(b.M.plastic, 0.07, 0.03, 0.12, s * 0.3, 0.76, 0.16, { color: 0x1a1a1a });
    }
    // Harness straps.
    for (const s of [-1, 1]) b.box(b.M.fabric, 0.05, 0.6, 0.02, s * 0.12, 0.95, -0.17, { color: 0x6a2a1a, rotX: -0.12 });
  }
  b.solidCircle(0.32, 0, 0);
}

/** Tall locker facing local +z. */
export function locker(b: Builder, w: number, h: number, d: number, color: number, r: Rng, label?: string) {
  b.box(b.M.painted, w, h, d, 0, h / 2, 0, { color, bevel: 0.012 });
  b.box(b.M.painted, w - 0.04, h - 0.1, 0.01, 0, h / 2, d / 2 + 0.004, { color: new THREE.Color(color).multiplyScalar(0.92).getHex() });
  for (let i = 0; i < 4; i++) b.box(b.M.painted, w * 0.5, 0.012, 0.012, 0, h - 0.18 - i * 0.035, d / 2 + 0.01, { color: C.dark });
  b.box(b.M.brushed, 0.025, 0.14, 0.03, w / 2 - 0.08, h * 0.52, d / 2 + 0.015, {});
  if (label) b.sign([label], w * 0.6, 0.07, 0, h * 0.72, d / 2 + 0.011, { bg: '#e8e2d2', fg: '#1a1a1a', wear: 0.4 });
  if (r.chance(0.3)) b.box(b.M.hazard, w - 0.04, 0.05, 0.012, 0, 0.08, d / 2 + 0.008, { uvScale: 0.4 });
}

/** Industrial crate with reinforced edges. */
export function crate(b: Builder, w: number, h: number, d: number, color: number, r: Rng, stencil?: string) {
  b.box(b.M.painted, w, h, d, 0, h / 2, 0, { color, bevel: 0.015 });
  const e = 0.05;
  const frame = new THREE.Color(color).multiplyScalar(0.6).getHex();
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.box(b.M.painted, e, h + 0.01, e, (sx * (w - e)) / 2, h / 2, (sz * (d - e)) / 2, { color: frame, bevel: 0.01 });
  for (const sy of [0, 1]) {
    b.box(b.M.painted, w + 0.01, e, e, 0, sy * (h - e) + e / 2, (d - e) / 2, { color: frame, bevel: 0.01 });
    b.box(b.M.painted, w + 0.01, e, e, 0, sy * (h - e) + e / 2, -(d - e) / 2, { color: frame, bevel: 0.01 });
    b.box(b.M.painted, e, e, d + 0.01, (w - e) / 2, sy * (h - e) + e / 2, 0, { color: frame, bevel: 0.01 });
    b.box(b.M.painted, e, e, d + 0.01, -(w - e) / 2, sy * (h - e) + e / 2, 0, { color: frame, bevel: 0.01 });
  }
  if (stencil) {
    b.sign([stencil], Math.min(w * 0.7, 1.2), Math.min(h * 0.22, 0.18), 0, h * 0.55, d / 2 + 0.003, { bg: null, fg: '#e8e0cc', wear: 0.8 });
    if (r.chance(0.5)) b.sign([stencil], Math.min(d * 0.7, 1.2), Math.min(h * 0.22, 0.18), w / 2 + 0.003, h * 0.55, 0, { bg: null, fg: '#e8e0cc', wear: 0.8 }, { rotY: Math.PI / 2 });
  }
}

/** Pressure tank (vertical) with bands, valves and a gauge. */
export function tank(b: Builder, r: number, h: number, color: number, label?: string) {
  const prof: [number, number][] = [
    [0, 0],
    [r * 0.7, 0.02],
    [r, r * 0.35],
    [r, h - r * 0.35],
    [r * 0.7, h - 0.02],
    [0.06, h],
    [0, h],
  ];
  b.geo(b.M.painted, latheGeo(prof, 28, `tank${r}:${h}`), new THREE.Matrix4(), { color, uv: 'box', uvScale: 1.2 });
  for (const y of [r * 0.6, h - r * 0.6]) b.cyl(b.M.painted, r + 0.015, 0.06, 0, y, 0, { color: C.gun, seg: 28 });
  b.cyl(b.M.brushed, 0.05, 0.14, 0, h + 0.06, 0, { seg: 10 });
  valveWheel(b, 0.1, 0, h + 0.14, 0, 'y');
  gauge(b, 0, h * 0.6, r + 0.01, 0);
  if (label) b.sign([label], r * 1.2, 0.14, 0, h * 0.45, r + 0.003, { bg: null, fg: '#f0e8d8', wear: 0.6 });
  b.solidCircle(r + 0.05, 0, 0);
}

export function valveWheel(b: Builder, r: number, x: number, y: number, z: number, axis: 'x' | 'y' | 'z' = 'z', color = 0xb83220) {
  const rot = axis === 'y' ? new THREE.Matrix4().makeRotationX(Math.PI / 2) : axis === 'x' ? new THREE.Matrix4().makeRotationY(Math.PI / 2) : new THREE.Matrix4();
  b.at(x, y, z, 0, () => {
    b.withMatrix(rot, () => {
      b.geo(b.M.painted, new THREE.TorusGeometry(r, r * 0.12, 6, 20), new THREE.Matrix4(), { color });
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.rod(b.M.painted, V(0, 0, 0), V(Math.cos(a) * r, Math.sin(a) * r, 0), r * 0.08, { color, seg: 6 });
      }
      b.cyl(b.M.brushed, r * 0.25, r * 0.4, 0, 0, 0, { axis: 'z', seg: 10 });
    });
  });
}

/** Round analogue gauge facing local +z (rotated by rotY). */
export function gauge(b: Builder, x: number, y: number, z: number, rotY: number, rad = 0.06) {
  b.at(x, y, z, rotY, () => {
    b.cyl(b.M.brushed, rad, 0.03, 0, 0, 0.015, { axis: 'z', seg: 18 });
    b.cyl(b.M.plastic, rad * 0.85, 0.005, 0, 0, 0.031, { axis: 'z', seg: 18, color: 0xe8e4d8 });
    b.box(b.M.painted, rad * 0.08, rad * 0.7, 0.004, rad * 0.2, rad * 0.15, 0.035, { color: C.red, rotZ: -0.7 });
  });
}

export function extinguisher(b: Builder, x: number, y: number, z: number, rotY: number) {
  b.at(x, y, z, rotY, () => {
    b.box(b.M.painted, 0.22, 0.62, 0.04, 0, 0.36, 0.02, { color: 0xb02a1a, bevel: 0.01 });
    b.cyl(b.M.painted, 0.075, 0.46, 0, 0.3, 0.13, { color: 0xc8301e, seg: 14 });
    b.sphere(b.M.painted, 0.075, 0, 0.53, 0.13, { color: 0xc8301e, sy: 0.6 });
    b.box(b.M.painted, 0.05, 0.08, 0.05, 0, 0.6, 0.13, { color: C.dark });
    b.rod(b.M.rubber, V(0.04, 0.6, 0.13), V(0.09, 0.3, 0.16), 0.012, { seg: 6 });
    b.sign(['FIRE'], 0.16, 0.06, 0, 0.62, 0.042, { bg: '#b02a1a', fg: '#f4efe4', wear: 0.2 });
  });
}

/** Louvred vent grille facing local +z. */
export function vent(b: Builder, w: number, h: number, x: number, y: number, z: number, rotY = 0) {
  b.at(x, y, z, rotY, () => {
    b.box(b.M.painted, w + 0.06, h + 0.06, 0.03, 0, 0, 0.015, { color: C.gun, bevel: 0.008 });
    b.box(b.M.painted, w, h, 0.01, 0, 0, 0.012, { color: 0x0c0d0e });
    const n = Math.max(3, Math.round(h / 0.035));
    for (let i = 0; i < n; i++) b.box(b.M.painted, w, 0.012, 0.03, 0, -h / 2 + (h / n) * (i + 0.5), 0.02, { color: 0x484c50, rotX: 0.6 });
  });
}

/** Cable tray between two points with a bundle of cables. */
export function cableTray(b: Builder, a: THREE.Vector3, c: THREE.Vector3, w = 0.3, r?: Rng) {
  const rr = r ?? rng(3);
  const dir = c.clone().sub(a);
  const len = dir.length();
  const yaw = Math.atan2(dir.x, dir.z);
  const mid = a.clone().add(c).multiplyScalar(0.5);
  b.at(mid.x, mid.y, mid.z, yaw, () => {
    b.box(b.M.painted, w, 0.012, len, 0, 0, 0, { color: 0x505458 });
    for (const s of [-1, 1]) b.box(b.M.painted, 0.012, 0.06, len, (s * w) / 2, 0.03, 0, { color: 0x505458 });
    const colors = [0x1a1a1a, 0x2a2a2a, 0x8a2a1a, 0x1a3a6a, 0xb08a1a, 0x2a2a2a];
    const n = Math.round(w / 0.035);
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.03 + (w - 0.06) * (i / Math.max(1, n - 1));
      b.cyl(b.M.rubber, 0.012 + rr.next() * 0.008, len, x, 0.02 + rr.next() * 0.02, 0, { axis: 'z', seg: 6, color: rr.pick(colors) });
    }
    const rungs = Math.floor(len / 0.6);
    for (let i = 0; i <= rungs; i++) b.box(b.M.painted, w, 0.02, 0.03, 0, -0.005, -len / 2 + (len / Math.max(1, rungs)) * i, { color: 0x404448 });
  });
}

/** Animated fan (spins via ctx.animators). Blade disc faces local +z. */
export function fan(b: Builder, zone: string, r: number, x: number, y: number, z: number, rotY: number, speed = 6) {
  b.at(x, y, z, rotY, () => {
    b.geo(b.M.painted, new THREE.TorusGeometry(r + 0.03, 0.035, 6, 32), new THREE.Matrix4(), { color: C.gun });
    b.box(b.M.painted, r * 2 + 0.2, r * 2 + 0.2, 0.04, 0, 0, -0.06, { color: 0x2c3034, bevel: 0.01 });
    for (const a of [0, Math.PI / 2]) b.box(b.M.painted, r * 2, 0.02, 0.02, 0, 0, 0.05, { color: 0x505458, rotZ: a });
  });
  const blades = new THREE.Group();
  const mat = b.M.painted;
  const geo = new THREE.BoxGeometry(r * 0.9, 0.12 * r + 0.02, 0.012);
  geo.translate(r * 0.5, 0, 0);
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.rotation.z = (i / 6) * Math.PI * 2;
    m.rotation.x = 0.35;
    blades.add(m);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.18, r * 0.18, 0.06, 12), mat);
  hub.rotation.x = Math.PI / 2;
  blades.add(hub);
  const pivot = new THREE.Group();
  pivot.position.copy(b.world(x, y, z));
  pivot.rotation.y = b.yaw() + rotY;
  pivot.add(blades);
  paintVertexColor(blades, 0x4a4e52);
  b.ctx.zones.addObject(zone, pivot);
  b.ctx.animators.push((t) => {
    blades.rotation.z = t * speed;
  });
}

/** Give standalone meshes the vertex color attribute the shared materials expect. */
export function paintVertexColor(obj: THREE.Object3D, hex: number) {
  const c = new THREE.Color(hex);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry;
    if (g.getAttribute('color')) return;
    const n = g.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  });
}

/** Rotating amber warning beacon with a pulsing pooled light. */
export function beacon(b: Builder, zone: string, x: number, y: number, z: number, color = C.amber) {
  b.cyl(b.M.painted, 0.08, 0.05, x, y + 0.025, z, { color: C.gun, seg: 14 });
  const mat = new THREE.MeshBasicMaterial({ color: col(color, 5), transparent: true, opacity: 0.9 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.07, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  dome.position.copy(b.world(x, y + 0.05, z));
  const reflector = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), new THREE.MeshBasicMaterial({ color: col(color, 12), side: THREE.DoubleSide }));
  reflector.position.copy(dome.position).add(V(0, 0.04, 0));
  b.ctx.zones.addObject(zone, dome);
  b.ctx.zones.addObject(zone, reflector);
  const def = b.light(x, y - 0.2, z, color, 10, 6, { pulse: { speed: 1.2, min: 0.1 }, glow: { material: mat, base: col(color, 5)! } });
  b.ctx.animators.push((t) => {
    reflector.rotation.y = t * 1.2 * Math.PI * 2;
  });
  return def;
}

/** Handrail along a polyline at height y (local frame). */
export function handrail(b: Builder, pts: [number, number][], y: number, o: { posts?: number; color?: number; r?: number } = {}) {
  const r = o.r ?? 0.022;
  const color = o.color ?? 0xb0a070;
  const pv = pts.map(([x, z]) => V(x, y, z));
  b.pipe(b.M.painted, pv, r, { color, flanges: false, bend: 0.1 });
  const every = o.posts ?? 1.2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pv[i];
    const c = pv[i + 1];
    const n = Math.max(1, Math.round(a.distanceTo(c) / every));
    for (let k = 0; k <= n; k++) {
      if (k === n && i < pts.length - 2) continue;
      const p = a.clone().lerp(c, k / n);
      b.rod(b.M.painted, V(p.x, 0, p.z), V(p.x, y, p.z), r * 0.9, { color, seg: 8 });
    }
    // Mid rail.
    b.rod(b.M.painted, V(a.x, y * 0.5, a.z), V(c.x, y * 0.5, c.z), r * 0.8, { color, seg: 8 });
  }
}

/** Box of small greebles on a surface facing local +z inside a w x h rect. */
export function greebleRect(b: Builder, w: number, h: number, r: Rng, color: number, count = 12, depth = 0.08) {
  for (let i = 0; i < count; i++) {
    const gw = r.range(0.05, Math.min(0.5, w * 0.4));
    const gh = r.range(0.05, Math.min(0.4, h * 0.4));
    const gd = r.range(0.01, depth);
    const x = r.range(-w / 2 + gw / 2, w / 2 - gw / 2);
    const y = r.range(-h / 2 + gh / 2, h / 2 - gh / 2);
    const tint = new THREE.Color(color).multiplyScalar(r.range(0.6, 1.1)).getHex();
    const kind = r.next();
    if (kind < 0.6) b.box(b.M.painted, gw, gh, gd, x, y, gd / 2, { color: tint, bevel: Math.min(gw, gh, gd) * 0.2 });
    else if (kind < 0.8) b.cyl(b.M.painted, Math.min(gw, gh) / 2, gd, x, y, gd / 2, { axis: 'z', seg: 12, color: tint });
    else {
      // Row of small cylinders (connectors).
      const n = r.int(2, 5);
      for (let k = 0; k < n; k++) b.cyl(b.M.brushed, 0.012, gd + 0.02, x - gw / 2 + (gw / n) * (k + 0.5), y, (gd + 0.02) / 2, { axis: 'z', seg: 8 });
    }
  }
}
