import * as THREE from 'three';
import { Builder, V } from '../kit';
import { C, beacon, bulkheadLamp, ceilingLight, gauge, locker, tank, valveWheel, vent } from '../props';
import { SKIN } from '../layout';
import { rng, type Rng } from '../../engine/shared';

/** A pressure suit hanging on a rack, facing local +z. */
export function evaSuit(b: Builder, color: number, accent: number, r: Rng) {
  const worn = new THREE.Color(color).multiplyScalar(r.range(0.85, 1)).getHex();
  // Rack frame.
  b.box(b.M.painted, 0.9, 2.1, 0.06, 0, 1.05, -0.32, { color: 0x3a3e43, bevel: 0.015 });
  b.box(b.M.painted, 0.7, 0.05, 0.3, 0, 1.95, -0.2, { color: 0x2c3034 });
  // Backpack (PLSS).
  b.box(b.M.painted, 0.5, 0.62, 0.22, 0, 1.38, -0.17, { color: 0xd8d4c8, bevel: 0.04 });
  b.cyl(b.M.brushed, 0.05, 0.5, -0.16, 1.4, -0.3, { seg: 10 });
  b.cyl(b.M.brushed, 0.05, 0.5, 0.16, 1.4, -0.3, { seg: 10 });
  // Torso.
  b.box(b.M.fabric, 0.52, 0.62, 0.32, 0, 1.36, 0.02, { color: worn, bevel: 0.1 });
  b.box(b.M.painted, 0.34, 0.2, 0.08, 0, 1.3, 0.2, { color: 0x3a3e43, bevel: 0.02 }); // chest control unit
  for (let i = 0; i < 4; i++) b.glow(i % 2 ? C.green : C.amber, 2.5, 0.03, 0.02, 0.01, -0.1 + i * 0.065, 1.33, 0.245);
  b.box(b.M.fabric, 0.54, 0.08, 0.34, 0, 1.08, 0.02, { color: accent, bevel: 0.03 }); // waist ring
  // Neck ring + helmet.
  b.cyl(b.M.brushed, 0.17, 0.06, 0, 1.7, 0.02, { seg: 20 });
  b.sphere(b.M.plastic, 0.19, 0, 1.87, 0.03, { color: 0xe8e4da, ws: 24, hs: 16 });
  const visor = new THREE.SphereGeometry(0.192, 24, 12, -Math.PI * 0.42, Math.PI * 0.84, Math.PI * 0.28, Math.PI * 0.36);
  b.geo(b.M.chrome, visor, new THREE.Matrix4().makeTranslation(0, 1.87, 0.03), { color: 0x6a4a1a, uv: 'keep' });
  b.box(b.M.plastic, 0.06, 0.05, 0.05, 0.16, 1.98, 0.08, { color: 0x2a2a2a }); // helmet lamp
  b.glow(C.warm, 3, 0.04, 0.03, 0.01, 0.16, 1.98, 0.106);
  // Arms.
  for (const s of [-1, 1]) {
    b.sphere(b.M.fabric, 0.1, s * 0.32, 1.6, 0.02, { color: worn });
    b.rod(b.M.fabric, V(s * 0.33, 1.58, 0.02), V(s * 0.38, 1.22, 0.06), 0.075, { color: worn, seg: 12 });
    b.sphere(b.M.fabric, 0.075, s * 0.38, 1.22, 0.06, { color: accent });
    b.rod(b.M.fabric, V(s * 0.38, 1.22, 0.06), V(s * 0.36, 0.92, 0.12), 0.068, { color: worn, seg: 12 });
    b.cyl(b.M.brushed, 0.07, 0.04, s * 0.36, 0.9, 0.12, { seg: 12 });
    b.box(b.M.rubber, 0.08, 0.13, 0.1, s * 0.36, 0.81, 0.13, { bevel: 0.03 });
    // Legs + boots.
    b.rod(b.M.fabric, V(s * 0.13, 1.05, 0.02), V(s * 0.14, 0.58, 0.04), 0.095, { color: worn, seg: 12 });
    b.sphere(b.M.fabric, 0.09, s * 0.14, 0.58, 0.04, { color: accent });
    b.rod(b.M.fabric, V(s * 0.14, 0.58, 0.04), V(s * 0.14, 0.16, 0.02), 0.085, { color: worn, seg: 12 });
    b.box(b.M.rubber, 0.14, 0.14, 0.3, s * 0.14, 0.07, 0.06, { bevel: 0.04 });
  }
  // Mission patch + name tape.
  b.sign([r.pick(['VANCE', 'OKAFOR', 'LINDQVIST', 'MORROW', 'TAKEDA'])], 0.2, 0.05, 0, 1.52, 0.185, { bg: '#2a2a2a', fg: '#e8e2d2', wear: 0.3 });
  b.solid(0.9, 0.7, 0, -0.05);
}

export function buildAirlock(b: Builder) {
  const r = rng(303);
  b.inZone('airlock', () => {
    const x0 = -9 + SKIN;
    const x1 = -1.3 - SKIN;
    const zf = -7 + SKIN; // forward wall face
    const za = -2.5 - SKIN; // aft wall face
    const zc = -4.75;

    // Floor markings: hazard border around the hatch approach + walkway lines.
    b.span(b.M.hazard, x0, 0.001, zc - 1.1, x0 + 2.6, 0.006, zc - 0.95, { uvScale: 0.6 });
    b.span(b.M.hazard, x0, 0.001, zc + 0.95, x0 + 2.6, 0.006, zc + 1.1, { uvScale: 0.6 });
    b.span(b.M.hazard, x0 + 2.45, 0.001, zc - 1.1, x0 + 2.6, 0.006, zc + 1.1, { uvScale: 0.6 });
    b.at(x0 + 1.4, 0.007, zc, Math.PI / 2, () => b.sign(['DECOMPRESSION ZONE'], 1.8, 0.28, 0, 0, 0, { bg: null, fg: '#d0a030', wear: 0.8 }), -Math.PI / 2);

    // Pressure-chamber arch splitting the room.
    const ax = -5.9;
    for (const s of [-1, 1]) {
      const z = zc + s * 1.25;
      b.box(b.M.painted, 0.35, 2.8, 0.3, ax, 1.4, z, { color: 0x3a3f44, bevel: 0.03 });
      b.box(b.M.hazard, 0.36, 2.2, 0.04, ax, 1.2, z - s * 0.17, { uvScale: 0.5 });
      b.span(b.M.painted, ax - 0.17, 0, s < 0 ? zf : z + 0.15, ax + 0.17, 2.8, s < 0 ? z - 0.15 : za, { color: 0x4a5056 });
      b.ctx.collision.addBox(ax, (s < 0 ? (zf + z - 0.15) / 2 : (z + 0.15 + za) / 2), 0.17, Math.abs((s < 0 ? z - 0.15 - zf : za - z - 0.15) / 2));
      b.solid(0.35, 0.3, ax, z);
    }
    b.box(b.M.painted, 0.35, 0.4, 2.8, ax, 2.6, zc, { color: 0x3a3f44, bevel: 0.03 });
    b.sign(['PRESSURE LOCK'], 1.2, 0.16, ax + 0.18, 2.55, zc, { bg: '#1d2024', fg: '#e8c070' }, { rotY: Math.PI / 2 });
    b.sign(['VERIFY SEAL BEFORE CYCLING'], 1.4, 0.13, ax - 0.18, 2.55, zc, { bg: '#b02a1a', fg: '#f4efe4' }, { rotY: -Math.PI / 2 });
    // Chamber lighting (red) + beacons.
    ceilingLight(b, -7.5, 2.78, zc, { len: 1.0, color: 0xff5040, glow: 3.5, intensity: 5, distance: 5 });
    beacon(b, 'airlock', x0 + 0.25, 2.55, zc - 1.0);
    beacon(b, 'airlock', x0 + 0.25, 2.55, zc + 1.0);
    // Hatch control panel.
    b.at(x0, 0, zc + 1.35, Math.PI / 2, () => {
      b.box(b.M.painted, 0.55, 0.9, 0.08, 0, 1.35, 0.04, { color: 0x2c3034, bevel: 0.015 });
      b.screen('warning', 'red', 0.42, 0.28, 0, 1.58, 0.085, { seed: 0.2 });
      for (let i = 0; i < 3; i++) b.glow([C.red, C.amber, C.green][i], 3, 0.08, 0.05, 0.02, -0.14 + i * 0.14, 1.3, 0.09);
      b.box(b.M.hazard, 0.18, 0.28, 0.03, 0, 1.08, 0.09, { uvScale: 0.3 });
      b.rod(b.M.painted, V(0, 1.08, 0.1), V(0, 1.2, 0.22), 0.02, { color: 0xb02a1a });
      b.sphere(b.M.plastic, 0.035, 0, 1.2, 0.22, { color: 0xb02a1a });
    });
    // Equalisation plumbing with valve wheels.
    b.pipe(b.M.painted, [V(x0 + 0.1, 0.4, zf + 0.2), V(x0 + 0.1, 2.4, zf + 0.2), V(-5.8, 2.4, zf + 0.2)], 0.06, { color: 0x3a6aa0, brackets: V(-0.1, 0, 0) });
    valveWheel(b, 0.14, x0 + 0.25, 1.2, zf + 0.2, 'x');
    gauge(b, x0 + 0.02, 1.55, zf + 0.5, Math.PI / 2, 0.07);
    b.at(x0 + 0.4, 0, zf + 0.75, 0, () => tank(b, 0.22, 1.3, 0x2a6a3a, 'O2'));

    // ---- EVA prep side ----
    const suitColors: [number, number][] = [
      [0xd8d2c2, 0xc4541c],
      [0xd0ccc0, 0x2a5a9a],
      [0xc8c4b8, 0xc4541c],
      [0xe0dcd0, 0x3a7a3a],
    ];
    suitColors.forEach(([c, a], i) => {
      b.at(-5.1 + i * 0.95, 0, zf + 0.42, 0, () => evaSuit(b, c, a, r));
    });
    // Helmet shelf + tools on the aft wall, bench in front.
    for (let i = 0; i < 4; i++) b.at(-4.9 + i * 0.6, 0, za - 0.25, Math.PI, () => locker(b, 0.56, 2.0, 0.45, 0x4a5a6a, r, `EVA ${i + 1}`));
    b.solid(2.4, 0.5, -4.0, za - 0.25);
    b.box(b.M.painted, 2.2, 0.08, 0.45, -3.8, 0.46, zc + 1.2, { color: 0x3a3f44, bevel: 0.015 });
    b.box(b.M.fabric, 2.1, 0.06, 0.4, -3.8, 0.53, zc + 1.2, { color: 0x6a3020, bevel: 0.02 });
    for (const x of [-4.7, -2.9]) b.box(b.M.painted, 0.06, 0.46, 0.35, x, 0.23, zc + 1.2, { color: 0x2c3034 });
    b.solid(2.2, 0.45, -3.8, zc + 1.2);
    // A spare helmet and a toolbox on the bench.
    b.sphere(b.M.plastic, 0.18, -4.4, 0.74, zc + 1.2, { color: 0xe8e4da });
    b.box(b.M.painted, 0.45, 0.2, 0.22, -3.3, 0.66, zc + 1.18, { color: 0xb02a1a, bevel: 0.02 });

    // Lighting + vents.
    ceilingLight(b, -3.4, 2.78, zc - 0.8, { len: 1.2, color: C.cool, glow: 4.5, intensity: 6.5, distance: 6 });
    ceilingLight(b, -3.4, 2.78, zc + 1.0, { len: 1.2, color: C.cool, glow: 4.5, intensity: 5, distance: 6, light: false });
    bulkheadLamp(b, x1, 2.1, zc - 1.4, -Math.PI / 2, C.warm, 2.5);
    vent(b, 0.8, 0.3, -3.5, 2.5, zf, 0);
    b.sign(['EVA PREP'], 1.0, 0.18, -3.6, 2.45, za - 0.001, { bg: '#1d2024', fg: '#e8c070' }, { rotY: Math.PI });
  });
}
