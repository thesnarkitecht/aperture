import * as THREE from 'three';
import { Builder, V, col, latheGeo } from './kit';
import { C, vent } from './props';
import { HULL, HULL_BOTTOM } from './layout';
import { rng, type Rng } from '../engine/shared';
import { createBeamMaterial, createHaloTexture, createPlumeMaterial } from '../materials/fx';
import { asFx } from '../materials/library';

type Rect = [number, number, number, number]; // x0, y0, x1, y1 in face-local coords

const HULL_TONES = [0xc9c6bc, 0xbdbab0, 0xd2cfc6, 0xaeaca4, 0x9a9890];

/** Scatter hull greebles on a face whose local +z is the outward normal. */
function scatterFace(b: Builder, r: Rng, w: number, h: number, avoid: Rect[], density = 1) {
  const area = w * h;
  const count = Math.round(area * 0.55 * density);
  const hit = (x0: number, y0: number, x1: number, y1: number) =>
    avoid.some(([a0, b0, a1, b1]) => x1 > a0 - 0.15 && x0 < a1 + 0.15 && y1 > b0 - 0.15 && y0 < b1 + 0.15);
  for (let i = 0; i < count; i++) {
    const kind = r.next();
    let gw: number, gh: number;
    if (kind < 0.5) {
      gw = r.range(0.6, Math.min(3.5, w * 0.5));
      gh = r.range(0.4, Math.min(1.8, h * 0.5));
    } else {
      gw = r.range(0.12, 0.7);
      gh = r.range(0.12, 0.6);
    }
    const x = r.range(-w / 2 + gw / 2 + 0.1, w / 2 - gw / 2 - 0.1);
    const y = r.range(-h / 2 + gh / 2 + 0.1, h / 2 - gh / 2 - 0.1);
    if (hit(x - gw / 2, y - gh / 2, x + gw / 2, y + gh / 2)) continue;
    const tone = r.pick(HULL_TONES);
    if (kind < 0.5) {
      // Armour plate.
      const d = r.range(0.02, 0.06);
      b.box(b.M.hull, gw, gh, d, x, y, d / 2, { color: tone, bevel: 0.012, uvOffset: [r.next(), r.next()] });
    } else if (kind < 0.68) {
      const d = r.range(0.06, 0.28);
      b.box(b.M.painted, gw, gh, d, x, y, d / 2, { color: r.pick([0x5a5c5e, 0x6a6c6e, 0x8a8880, 0x4a4c4e]), bevel: Math.min(gw, gh, d) * 0.2 });
      if (r.chance(0.3)) b.box(b.M.painted, gw * 0.6, gh * 0.6, 0.03, x, y, d + 0.015, { color: 0x3a3c3e });
    } else if (kind < 0.78) {
      const len = r.range(0.5, 1.6);
      const rad = r.range(0.07, 0.18);
      if (!hit(x - len / 2, y - rad, x + len / 2, y + rad)) {
        b.cyl(b.M.painted, rad, len, x, y, rad + 0.02, { axis: 'x', seg: 14, color: r.pick([0x8a8880, 0xb8b4aa, 0x6a6c6e]) });
        for (const s of [-1, 1]) b.box(b.M.painted, 0.05, rad * 2.2, rad + 0.04, x + (s * len) / 3, y, (rad + 0.04) / 2, { color: 0x3a3c3e });
      }
    } else if (kind < 0.86) {
      vent(b, gw, gh * 0.5, x, y, 0, 0);
    } else if (kind < 0.94) {
      // Pipe run.
      const len = r.range(1, Math.min(5, w * 0.6));
      const x0 = Math.max(-w / 2 + 0.2, x - len / 2);
      const x1 = Math.min(w / 2 - 0.2, x + len / 2);
      if (!hit(x0, y - 0.1, x1, y + 0.1)) {
        const n = r.int(1, 3);
        const c = r.pick([0x8a8880, 0xb05a1e, 0x6a6c6e]);
        for (let k = 0; k < n; k++) b.cyl(b.M.painted, 0.035, x1 - x0, (x0 + x1) / 2, y + k * 0.09, 0.06, { axis: 'x', seg: 8, color: c });
        for (let t = x0 + 0.3; t < x1; t += 0.9) b.box(b.M.painted, 0.04, n * 0.09 + 0.04, 0.08, t, y + ((n - 1) * 0.09) / 2, 0.04, { color: 0x3a3c3e });
      }
    } else {
      // Small status lamp.
      b.box(b.M.painted, 0.12, 0.08, 0.05, x, y, 0.025, { color: 0x3a3c3e });
      b.glow(r.chance(0.5) ? C.amber : C.warm, 3, 0.08, 0.04, 0.01, x, y, 0.052);
    }
  }
}

/** Face helper: centre + yaw with local +z pointing out of the hull. */
function onFace(b: Builder, cx: number, cy: number, cz: number, yaw: number, fn: () => void, pitch = 0) {
  b.at(cx, cy, cz, yaw, fn, pitch);
}

function rcsQuad(b: Builder, x: number, y: number, z: number, yaw: number) {
  b.at(x, y, z, yaw, () => {
    b.box(b.M.painted, 0.5, 0.5, 0.35, 0, 0, 0.17, { color: 0x5a5c5e, bevel: 0.05 });
    const dirs: [number, number, number, number][] = [
      [0, 0.25, -Math.PI / 2, 0],
      [0, -0.25, Math.PI / 2, 0],
      [0.25, 0, 0, -Math.PI / 2],
      [-0.25, 0, 0, Math.PI / 2],
    ];
    for (const [dx, dy, rx, rz] of dirs) b.cyl(b.M.brushed, 0.07, 0.14, dx, dy, 0.2, { color: 0x6a6a6a, rotX: rx, rotZ: rz, seg: 10, rTop: 0.04 });
    b.cyl(b.M.brushed, 0.08, 0.16, 0, 0, 0.42, { axis: 'z', seg: 10, rTop: 0.05, color: 0x6a6a6a });
  });
}

function navLight(b: Builder, x: number, y: number, z: number, color: number, blink: boolean, phase = 0) {
  b.cyl(b.M.painted, 0.08, 0.1, x, y, z, { color: 0x3a3c3e, seg: 10 });
  const mat = new THREE.MeshBasicMaterial({ color: col(color, 10) });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mat);
  bulb.position.copy(b.world(x, y + 0.08, z));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex(), color: col(color, 3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(1.6);
  halo.position.copy(bulb.position);
  asFx(halo);
  b.ctx.zones.addObject('exterior', bulb);
  b.ctx.zones.addObject('exterior', halo);
  if (blink) {
    const base = col(color, 10)!.clone();
    b.ctx.animators.push((t) => {
      const on = ((t + phase) % 1.6) < 0.12 ? 1 : 0.02;
      mat.color.copy(base).multiplyScalar(on);
      halo.material.opacity = on;
      halo.visible = on > 0.5;
    });
  }
}

let _halo: THREE.Texture | null = null;
const haloTex = () => (_halo ??= createHaloTexture(64));

export function buildExterior(b: Builder) {
  const r = rng(1111);
  b.inZone('exterior', () => {
    const O = HULL; // outward offset of the hull skin
    const HB = HULL_BOTTOM;

    // ---------------------------------------------------------------
    // Greebles on every large hull face.
    // ---------------------------------------------------------------
    // Face-local coordinates: yaw -PI/2 (port) maps local x = z - cz; yaw +PI/2 (starboard) maps local x = cz - z.
    // Hab module sides (x = ±9), z -18..6, y HB..3.45.
    const habH = 3.45 - HB;
    const habY = (3.45 + HB) / 2;
    const Y = (y: number) => y - habY;
    onFace(b, -9 - O, habY, -6, -Math.PI / 2, () =>
      scatterFace(b, r, 24, habH, [
        [-9.4 - 0.8, Y(0.95), -9.4 + 0.8, Y(2.15)],
        [-4.2 - 0.8, Y(0.95), -4.2 + 0.8, Y(2.15)],
        [1.25 - 1.7, -habH / 2, 1.25 + 1.7, Y(3.2)],
        [-12, Y(2.1), -10.6, Y(3.45)],
        [10.6, Y(2.1), 12, Y(3.45)],
      ], 0.9),
    );
    onFace(b, 9 + O, habY, -6, Math.PI / 2, () =>
      scatterFace(b, r, 24, habH, [
        [1.2, Y(0.7), 10.8, Y(2.35)],
        [-12, Y(2.1), -10.6, Y(3.45)],
        [10.6, Y(2.1), 12, Y(3.45)],
      ], 0.9),
    );
    // Hab front faces outboard of the bridge.
    for (const s of [-1, 1]) onFace(b, s * 7.85, habY, -18 - O, Math.PI, () => scatterFace(b, r, 2.1, habH, [], 1.2));
    // Cargo sides (x = ±8), z 6..24, y HB..7.6.
    const cH = 7.6 - HB;
    const cY = (7.6 + HB) / 2;
    const cyr = (y: number) => y - cY;
    const cargoAvoid: Rect[] = [
      [-8, cyr(4.5), 8, cyr(6.9)],
      [-6.1, cyr(3.2), -4.9, cyr(4.1)],
      [4.9, cyr(3.2), 6.1, cyr(4.1)],
      [-9, cyr(6.3), -7.6, cyr(7.6)],
    ];
    onFace(b, -8 - O, cY, 15, -Math.PI / 2, () => scatterFace(b, r, 18, cH, cargoAvoid, 0.8));
    onFace(b, 8 + O, cY, 15, Math.PI / 2, () => scatterFace(b, r, 18, cH, [...cargoAvoid, [-3.4, -cH / 2, 3.4, cyr(5.7)]], 0.8));
    // Cargo front face above the hab roof.
    onFace(b, 0, (3.45 + 7.6) / 2, 6 - O, Math.PI, () => scatterFace(b, r, 16, 7.6 - 3.45, [[-8.5, 0.9, -6.2, 2.2], [6.2, 0.9, 8.5, 2.2]], 1.1));
    // Engineering sides (x = ±7), z 24..38, y HB..6.6; radiator roots at y 3.3.
    const eH = 6.6 - HB;
    const eY = (6.6 + HB) / 2;
    const ey = (y: number) => y - eY;
    for (const s of [-1, 1])
      onFace(b, s * (7 + O), eY, 31, s * (Math.PI / 2), () =>
        scatterFace(b, r, 14, eH, [
          [-7, ey(2.6), 7, ey(4.0)],
          [-2.8, ey(4.8), 2.8, ey(6.0)],
          [-6.6, ey(0.8), -3.8, ey(1.6)],
          [3.8, ey(0.8), 6.6, ey(1.6)],
          [-7, ey(5.2), -5.6, ey(6.6)],
          [5.6, ey(5.2), 7, ey(6.6)],
        ], 0.9),
      );
    // Roofs (local +z = up; local y = -(z - cz)).
    onFace(b, 0, 3.45, -6, 0, () => scatterFace(b, r, 18, 24, [[-2.8, -12, 2.8, 12], [4.3, 5.6, 6.1, 6.4]], 0.6), -Math.PI / 2);
    onFace(b, 0, 7.6, 15, 0, () => scatterFace(b, r, 16, 18, [[-2, -9, 2, 9]], 0.7), -Math.PI / 2);
    onFace(b, 0, 6.6, 31, 0, () => scatterFace(b, r, 14, 14, [], 0.7), -Math.PI / 2);
    // Belly per module (local +z = down; local y = z - cz), clear of the keel and clamps.
    const keel: Rect = [-1.5, -40, 1.5, 40];
    onFace(b, 0, HB, -6, 0, () => scatterFace(b, r, 18, 24, [keel], 0.35), Math.PI / 2);
    onFace(b, 0, HB, 15, 0, () => scatterFace(b, r, 16, 18, [keel, [-7.6, -9, -5.4, 9], [5.4, -9, 7.6, 9]], 0.35), Math.PI / 2);
    onFace(b, 0, HB, 31, 0, () => scatterFace(b, r, 14, 14, [keel], 0.35), Math.PI / 2);

    // ---------------------------------------------------------------
    // Paint scheme and markings.
    // ---------------------------------------------------------------
    for (const s of [-1, 1]) {
      // Orange accent band along the hab.
      b.span(b.M.painted, s * (9 + O), 2.55, -18.2, s * (9 + O + 0.012), 2.85, 5.8, { color: 0xc4541c });
      // Name and registry on the cargo module.
      const yaw = s < 0 ? -Math.PI / 2 : Math.PI / 2;
      b.at(s * (8 + O + 0.08), 0, 0, 0, () => {
        b.sign(['PERIHELION'], 11.5, 1.35, 0, 5.75, 15, { bg: null, fg: '#2a2c2e', wear: 0.6 }, { rotY: yaw });
        b.sign(['CSV · HX-7061 · KESSLER-VANCE HEAVY YARDS'], 8, 0.34, 0, 4.85, 15, { bg: null, fg: '#2a2c2e', wear: 0.5 }, { rotY: yaw });
      });
      b.at(s * (7 + O + 0.06), 0, 0, 0, () => {
        b.sign(['HX-7061'], 5, 0.9, 0, 5.4, 31, { bg: null, fg: '#c4541c', wear: 0.5 }, { rotY: yaw });
        b.sign(['⚠ THRUSTER EXHAUST'], 2.4, 0.3, 0, 1.2, 36.2, { bg: '#d8a21c', fg: '#141414' }, { rotY: yaw });
      });
    }
    // Chevron stripes on the bridge chin.
    b.span(b.M.hazard, -4.6, 0.55, -28.5 - O - 0.012, 4.6, 0.8, -28.5 - O - 0.002, { uvScale: 1.4 });
    // Roof walkway markings on the hab.
    for (const s of [-1, 1]) b.span(b.M.painted, s * 3.0, 3.451, -17.5, s * 3.12, 3.46, 5.5, { color: 0xd0a030 });
    b.at(0, 3.462, -12, 0, () => b.sign(['NO STEP'], 1.4, 0.35, 5.2, 0, 0, { bg: null, fg: '#b02a1a', wear: 0.6 }), -Math.PI / 2);

    // ---------------------------------------------------------------
    // Dorsal spine + comms mast on the hab roof.
    // ---------------------------------------------------------------
    b.box(b.M.hull, 4.6, 0.7, 22, 0, 3.45 + 0.35, -6, { color: 0xbab7ae, bevel: 0.25 });
    b.box(b.M.hull, 3.2, 0.35, 21, 0, 3.45 + 0.85, -6, { color: 0xc4c1b8, bevel: 0.12 });
    onFace(b, 0, 4.2 + 0.001, -6, 0, () => scatterFace(b, r, 3.0, 20, [], 1.6), -Math.PI / 2);
    // Mast.
    b.cyl(b.M.painted, 0.18, 4.0, 0, 4.2 + 2.0, -10, { color: 0x8a8880, seg: 14 });
    for (let k = 0; k < 4; k++) b.cyl(b.M.painted, 0.24, 0.08, 0, 4.8 + k * 0.9, -10, { color: 0x5a5c5e, seg: 14 });
    b.rod(b.M.brushed, V(0, 8.2, -10), V(0, 10.2, -10), 0.02, {});
    b.rod(b.M.brushed, V(0, 7.5, -10), V(1.4, 7.7, -10), 0.015, {});
    b.rod(b.M.brushed, V(0, 7.0, -10), V(-1.2, 7.2, -10), 0.015, {});
    navLight(b, 0, 10.2, -10, C.red, true, 0.3);
    // Dish.
    b.at(0, 6.8, -12.2, 0.6, () => {
      const dish = latheGeo([[0.02, 0], [0.5, 0.06], [0.9, 0.24], [1.25, 0.5], [1.28, 0.53]], 36, 'dish');
      b.geo(b.M.painted, dish, new THREE.Matrix4().makeRotationX(-Math.PI / 2 - 0.5), { color: 0xd8d4ca, uv: 'box' });
      b.rod(b.M.brushed, V(0, 0, 0), V(0, 0.15, 1.1).applyAxisAngle(V(1, 0, 0), -0.5), 0.02, {});
      b.cyl(b.M.painted, 0.1, 0.25, 0, 0.1, 0.9, { color: 0x3a3c3e, rotX: Math.PI / 2 - 0.5 });
      b.rod(b.M.painted, V(0, -0.2, -0.1), V(0, -2.6, 2.2), 0.08, { color: 0x8a8880 });
    });
    // Sensor blister on the bridge roof.
    b.sphere(b.M.plastic, 0.9, 0, 3.85, -23.5, { color: 0x2a2c2e, sy: 0.45, ws: 24, hs: 12 });
    b.box(b.M.hull, 2.6, 0.3, 1.6, 0, 3.95, -21, { color: 0xb8b4aa, bevel: 0.08 });
    for (let k = 0; k < 3; k++) b.rod(b.M.brushed, V(-0.8 + k * 0.8, 4.1, -21), V(-0.8 + k * 0.8, 4.9 + k * 0.2, -21), 0.012, {});

    // ---------------------------------------------------------------
    // Keel and ore clamps under the cargo bay.
    // ---------------------------------------------------------------
    b.box(b.M.hull, 2.4, 0.6, 64, 0, HB - 0.3, 6, { color: 0x8a8880, bevel: 0.1 });
    for (const z of [9, 15, 21]) {
      for (const s of [-1, 1]) {
        b.box(b.M.painted, 0.6, 1.8, 0.8, s * 6.8, HB - 0.9, z, { color: 0x5a5c5e, bevel: 0.08 });
        b.box(b.M.painted, 1.6, 0.4, 0.8, s * 6.2, HB - 1.9, z, { color: 0xd09a1a, bevel: 0.08 });
        b.box(b.M.hazard, 0.62, 0.3, 0.82, s * 6.8, HB - 0.4, z, { uvScale: 0.6 });
        b.cyl(b.M.brushed, 0.1, 1.4, s * 6.3, HB - 0.9, z, { rotZ: s * 0.6, seg: 10 });
      }
    }
    // Chin sensor pod under the bridge.
    b.box(b.M.hull, 3.2, 0.7, 4.0, 0, HB - 0.3, -25.5, { color: 0x9a9890, bevel: 0.2 });
    b.sphere(b.M.plastic, 0.45, 0, HB - 0.6, -27.3, { color: 0x1a1c1e, ws: 20, hs: 12 });

    // ---------------------------------------------------------------
    // RCS thruster quads at module corners.
    // ---------------------------------------------------------------
    for (const s of [-1, 1]) {
      rcsQuad(b, s * (9 + O), 2.6, -17.2, s * Math.PI / 2);
      rcsQuad(b, s * (9 + O), 2.6, 5.2, s * Math.PI / 2);
      rcsQuad(b, s * (7 + O), 5.7, 37.2, s * Math.PI / 2);
      rcsQuad(b, s * (8 + O), 6.8, 6.9, s * Math.PI / 2);
    }

    // ---------------------------------------------------------------
    // Airlock docking collar + cargo door (exterior sides).
    // ---------------------------------------------------------------
    b.at(-9 - O, 0, -4.75, -Math.PI / 2, () => {
      b.box(b.M.painted, 2.3, 0.3, 0.4, 0, 2.35, 0.2, { color: 0x5a5c5e, bevel: 0.05 });
      b.box(b.M.painted, 2.3, 0.25, 0.4, 0, -0.1, 0.2, { color: 0x5a5c5e, bevel: 0.05 });
      for (const s of [-1, 1]) {
        b.box(b.M.painted, 0.35, 2.7, 0.4, s * 0.98, 1.1, 0.2, { color: 0x5a5c5e, bevel: 0.05 });
        b.box(b.M.hazard, 0.36, 2.2, 0.02, s * 0.98, 1.1, 0.41, { uvScale: 0.6 });
        // EVA handrails.
        b.pipe(b.M.painted, [V(s * 1.4, 0.3, 0.02), V(s * 1.4, 0.3, 0.22), V(s * 1.4, 2.1, 0.22), V(s * 1.4, 2.1, 0.02)], 0.025, { color: 0xd0a030, flanges: false, bend: 0.06 });
      }
      b.sign(['AIRLOCK 1', 'EMERGENCY ACCESS · PULL HANDLE'], 1.8, 0.34, 0, 2.75, 0.02, { bg: '#b02a1a', fg: '#f4efe4' });
      for (const s of [-1, 1]) {
        b.box(b.M.painted, 0.2, 0.12, 0.1, s * 0.9, 2.62, 0.45, { color: 0x3a3c3e });
        b.glow(C.amber, 5, 0.16, 0.06, 0.02, s * 0.9, 2.6, 0.51);
      }
      b.light(0, 2.4, 1.2, C.amber, 4, 6);
      b.light(0, 1.2, 2.6, C.warm, 3, 6);
    });
    b.at(8 + O, 0, 15, Math.PI / 2, () => {
      const W = 5.4, DH = 5.0;
      b.box(b.M.painted, W + 1.2, 0.5, 0.3, 0, DH + 0.3, 0.15, { color: 0x5a5c5e, bevel: 0.06 });
      for (const s of [-1, 1]) b.box(b.M.hazard, 0.5, DH + 0.2, 0.3, (s * (W + 0.5)) / 2, DH / 2 - 0.1, 0.15, { uvScale: 1.2 });
      for (let k = 0; k < 10; k++) b.box(b.M.hull, W, DH / 10 - 0.03, 0.08, 0, (k + 0.5) * (DH / 10), 0.04, { color: k % 3 === 0 ? 0xaeaca4 : 0xc4c1b8, bevel: 0.02 });
      b.sign(['CARGO 1'], 2.0, 0.5, 0, 3.2, 0.09, { bg: null, fg: '#2a2c2e', wear: 0.5 });
    });

    // ---------------------------------------------------------------
    // Radiator wings off engineering.
    // ---------------------------------------------------------------
    for (const s of [-1, 1]) {
      const y = 3.3;
      b.box(b.M.painted, 1.4, 0.7, 1.4, s * (7 + O + 0.7), y, 31, { color: 0x5a5c5e, bevel: 0.08 });
      b.cyl(b.M.brushed, 0.35, 1.4, s * (7 + O + 1.2), y, 31, { axis: 'x', seg: 16 });
      b.box(b.M.painted, 12.2, 0.3, 0.4, s * (8.7 + 6.1), y, 31, { color: 0x4a4c4e, bevel: 0.05 });
      for (let k = 0; k < 6; k++) {
        const x = s * (9.2 + k * 1.95);
        b.box(b.M.painted, 1.85, 0.08, 11, x, y, 31, { color: 0x2c2e30, bevel: 0.02 });
        for (let j = 0; j < 9; j++) b.glow(0xff6a30, 0.7 + 0.25 * Math.sin(k + j), 0.03, 0.01, 10.6, x - 0.8 + j * 0.2, y + 0.045, 31);
        b.box(b.M.painted, 1.9, 0.12, 0.12, x, y, 25.5, { color: 0x4a4c4e });
        b.box(b.M.painted, 1.9, 0.12, 0.12, x, y, 36.5, { color: 0x4a4c4e });
      }
      navLight(b, s * 21.0, 3.45, 25.5, 0xffffff, true, s < 0 ? 0 : 0.8);
      navLight(b, s * 21.0, 3.45, 36.5, s < 0 ? C.red : C.green, false);
    }

    // ---------------------------------------------------------------
    // Engine block.
    // ---------------------------------------------------------------
    const ez0 = 38 + O;
    b.box(b.M.hull, 13.8, 6.4, 3.4, 0, 2.95, ez0 + 1.7, { color: 0x9a9890, bevel: 0.35 });
    b.box(b.M.painted, 12.4, 5.6, 0.6, 0, 2.95, ez0 + 3.6, { color: 0x3a3c3e, bevel: 0.1 });
    onFace(b, 0, 2.95 + 3.2, ez0 + 1.7, 0, () => scatterFace(b, r, 13, 3.2, [], 1.2), -Math.PI / 2);
    for (const s of [-1, 1]) onFace(b, s * 6.9, 2.95, ez0 + 1.7, s * Math.PI / 2, () => scatterFace(b, r, 3.2, 6.2, [], 1.2));
    const bellProfile: [number, number][] = [
      [0.55, 0],
      [0.5, 0.25],
      [0.62, 0.8],
      [0.9, 1.8],
      [1.2, 2.9],
      [1.36, 3.6],
      [1.42, 3.7],
    ];
    const bellGeo = latheGeo(bellProfile, 40, 'bell');
    const plumeMat = createPlumeMaterial(new THREE.Color(0.4, 0.62, 1.0));
    for (const [ex, ey] of [[-2.9, 1.35], [2.9, 1.35], [-2.9, 4.55], [2.9, 4.55]]) {
      const bz = ez0 + 3.9;
      b.at(ex, ey, bz, 0, () => {
        // Bell (lathe along +y rotated to +z).
        const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
        b.geo(b.M.painted, bellGeo, rot, { color: 0x3a3634, uv: 'box', uvScale: 1 });
        // Cooling bands.
        for (const t of [0.9, 1.9, 2.9]) b.geo(b.M.painted, new THREE.TorusGeometry(0.64 + t * 0.21, 0.035, 6, 40), new THREE.Matrix4().makeTranslation(0, 0, t), { color: 0x5a4a3a });
        // Glowing throat.
        b.geo(b.M.glow, new THREE.CircleGeometry(0.5, 24), new THREE.Matrix4().makeTranslation(0, 0, 0.3), { color: col(0x9ab8ff, 9) });
        b.cyl(b.M.painted, 0.75, 0.5, 0, 0, -0.1, { axis: 'z', seg: 20, color: 0x4a4c4e });
        // Gimbal actuators.
        for (const s of [-1, 1]) b.rod(b.M.brushed, V(s * 0.9, 0.9, -0.3), V(s * 0.8, 0.7, 1.4), 0.06, {});
      });
      const plume = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 0.35, 16, 32, 24, true), plumeMat);
      plume.rotation.x = -Math.PI / 2;
      plume.position.copy(b.world(ex, ey, bz + 3.7 + 8));
      asFx(plume);
      b.ctx.zones.addObject('exterior', plume);
      b.light(ex, ey, bz + 5.5, 0x8ab0ff, 20, 12);
    }
    b.sign(['DANGER · DRIVE PLUME · 2 KM EXCLUSION'], 5.5, 0.34, 0, 6.35, ez0 + 3.41, { bg: '#b02a1a', fg: '#f4efe4' });

    // ---------------------------------------------------------------
    // Navigation lights, strobes and floodlights.
    // ---------------------------------------------------------------
    navLight(b, -9 - O - 0.1, 3.3, -17.8, C.red, false);
    navLight(b, 9 + O + 0.1, 3.3, -17.8, C.green, false);
    navLight(b, 0, 3.9 + 0.1, -26.4, 0xffffff, true, 0.5);
    navLight(b, 0, 7.6 + 0.1, 23.6, 0xffffff, true, 1.1);
    navLight(b, 0, HB - 0.65, 20, 0xffffff, true, 0.9);
    const beamMat = createBeamMaterial(new THREE.Color(1.0, 0.92, 0.8), 0.1);
    for (const s of [-1, 1]) {
      // Floods on outriggers lighting the name.
      for (const z of [9.5, 20.5]) {
        const x = s * (8 + O + 1.4);
        b.rod(b.M.painted, V(s * (8 + O), 3.6, z), V(x, 3.6, z), 0.05, { color: 0x5a5c5e });
        b.at(x, 3.6, z, s < 0 ? -Math.PI / 2 : Math.PI / 2, () => {
          b.box(b.M.painted, 0.4, 0.3, 0.25, 0, 0, 0, { color: 0x3a3c3e, bevel: 0.03 });
          b.glow(C.warm, 8, 0.32, 0.22, 0.01, 0, 0, -0.13);
        }, 0);
        b.light(x - s * 0.3, 4.4, z, C.warm, 26, 11);
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 1.8, 3.2, 24, 1, true), beamMat);
        beam.position.copy(b.world(x - s * 0.9, 4.9, z + (z < 15 ? 1.0 : -1.0)));
        beam.rotation.set(0, 0, s * -0.55);
        beam.rotation.x = z < 15 ? -0.4 : 0.4;
        asFx(beam);
        b.ctx.zones.addObject('exterior', beam);
      }
    }
    // Soft fill lights along the hull so the sunless side reads.
    b.light(-12, 2, -4.75, C.warm, 10, 14);
    b.light(0, 9, -6, 0xb0c8ff, 8, 16);
    b.light(0, 9, 22, 0xb0c8ff, 8, 16);
  });
}
