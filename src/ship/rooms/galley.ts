import * as THREE from 'three';
import { Builder, V, col } from '../kit';
import { C, buttonPanel, vent } from '../props';
import { SKIN } from '../layout';
import { rng, type Rng } from '../../engine/shared';

function plant(b: Builder, r: Rng, x: number, y: number, z: number) {
  const n = r.int(5, 9);
  for (let i = 0; i < n; i++) {
    const a = r.range(0, Math.PI * 2);
    const d = r.range(0, 0.1);
    const h = r.range(0.12, 0.34);
    const green = new THREE.Color().setHSL(r.range(0.24, 0.33), r.range(0.45, 0.7), r.range(0.18, 0.32)).getHex();
    b.box(b.M.plastic, 0.04, h, 0.012, x + Math.cos(a) * d, y + h / 2, z + Math.sin(a) * d, { color: green, rotY: a, rotZ: r.range(-0.5, 0.5), rotX: r.range(-0.3, 0.3) });
    b.sphere(b.M.plastic, r.range(0.03, 0.06), x + Math.cos(a) * (d + 0.05), y + h, z + Math.sin(a) * (d + 0.05), { color: green, ws: 8, hs: 6, sy: 0.5 });
  }
  if (r.chance(0.4)) b.sphere(b.M.plastic, 0.025, x + 0.05, y + 0.18, z, { color: 0xc03020, ws: 8, hs: 6 });
}

export function buildGalley(b: Builder) {
  const r = rng(505);
  b.inZone('galley', () => {
    const x0 = 1.3 + SKIN;
    const x1 = 9 - SKIN;
    const zf = -18 + SKIN;
    const za = -6 - SKIN;

    // ---- Kitchen run along the forward wall. ----
    b.at(4.4, 0, zf, 0, () => {
      const L = 5.6;
      b.box(b.M.painted, L, 0.86, 0.62, 0, 0.43, 0.31, { color: 0x5a6068, bevel: 0.015 });
      b.box(b.M.brushed, L + 0.04, 0.04, 0.66, 0, 0.88, 0.33, {});
      for (let i = 0; i < 8; i++) {
        const x = -L / 2 + 0.35 + i * 0.7;
        b.box(b.M.painted, 0.64, 0.7, 0.01, x, 0.42, 0.625, { color: 0x4e545c, bevel: 0.004 });
        b.box(b.M.brushed, 0.2, 0.02, 0.02, x, 0.7, 0.635, {});
      }
      // Upper cabinets.
      b.box(b.M.painted, L, 0.6, 0.36, 0, 1.95, 0.18, { color: 0x5a6068, bevel: 0.015 });
      for (let i = 0; i < 8; i++) b.box(b.M.painted, 0.64, 0.54, 0.01, -L / 2 + 0.35 + i * 0.7, 1.95, 0.365, { color: 0x4e545c, bevel: 0.004 });
      b.glow(C.warm, 3, L - 0.2, 0.01, 0.05, 0, 1.64, 0.3);
      b.light(-1.2, 1.45, 0.45, C.warm, 2.2, 3);
      b.light(1.4, 1.45, 0.45, C.warm, 2.2, 3);
      // Sink.
      b.box(b.M.chrome, 0.6, 0.02, 0.42, -1.4, 0.895, 0.33, {});
      b.box(b.M.chrome, 0.54, 0.2, 0.36, -1.4, 0.8, 0.33, {});
      b.rod(b.M.chrome, V(-1.4, 0.9, 0.08), V(-1.4, 1.15, 0.12), 0.015, {});
      b.rod(b.M.chrome, V(-1.4, 1.15, 0.12), V(-1.4, 1.12, 0.3), 0.012, {});
      // Food printer with display.
      b.box(b.M.painted, 0.7, 0.5, 0.5, 0.6, 1.15, 0.28, { color: 0x2c3034, bevel: 0.03 });
      b.box(b.M.glass, 0.46, 0.3, 0.01, 0.52, 1.12, 0.535, {});
      b.glow(0xff8a40, 1.4, 0.44, 0.02, 0.3, 0.52, 0.93, 0.35);
      b.screen('bars', 'amber', 0.14, 0.2, 0.83, 1.2, 0.535, { seed: 0.9 });
      // Coffee machine.
      b.box(b.M.chrome, 0.32, 0.46, 0.34, 1.6, 1.13, 0.25, {});
      b.box(b.M.painted, 0.3, 0.1, 0.3, 1.6, 1.33, 0.26, { color: 0x1a1a1a });
      b.cyl(b.M.plastic, 0.04, 0.09, 1.6, 0.945, 0.36, { color: 0xe8e4da, seg: 12 });
      b.at(1.6, 1.2, 0.43, 0, () => buttonPanel(b, 0.2, 0.08, 3, 1, r, 0.8));
      // Range + extraction hood.
      b.box(b.M.painted, 0.8, 0.02, 0.5, -0.4, 0.9, 0.33, { color: 0x151515 });
      for (const [hx, hz] of [[-0.6, 0.22], [-0.2, 0.22], [-0.6, 0.44], [-0.2, 0.44]]) b.geo(b.M.glow, new THREE.TorusGeometry(0.07, 0.006, 4, 24), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(hx, 0.915, hz), { color: col(0xff4020, hz > 0.3 ? 2.5 : 0.001) });
      b.box(b.M.brushed, 0.9, 0.3, 0.5, -0.4, 1.9, 0.25, {});
      // Tall fridge at the end.
      b.box(b.M.painted, 0.9, 2.1, 0.7, L / 2 + 0.5, 1.05, 0.35, { color: 0xb8bcc0, bevel: 0.02 });
      b.box(b.M.brushed, 0.03, 0.6, 0.04, L / 2 + 0.12, 1.35, 0.72, {});
      b.screen('terminal', 'cyan', 0.2, 0.12, L / 2 + 0.6, 1.5, 0.705, { seed: 0.12 });
      b.solid(L + 1.2, 0.72, 0.5, 0.36);
    });

    // ---- Mess tables with benches. ----
    for (const zc of [-14.2, -9.6]) {
      b.at(6.0, 0, zc, 0, () => {
        b.box(b.M.painted, 0.95, 0.05, 3.0, 0, 0.75, 0, { color: 0x6a6258, bevel: 0.015 });
        b.box(b.M.painted, 0.1, 0.72, 2.6, 0, 0.36, 0, { color: 0x2c2a26 });
        for (const s of [-1, 1]) {
          b.box(b.M.fabric, 0.4, 0.08, 2.9, s * 0.78, 0.44, 0, { color: 0x6a3a22, bevel: 0.025 });
          b.box(b.M.painted, 0.08, 0.4, 2.6, s * 0.78, 0.2, 0, { color: 0x2c2a26 });
          b.solid(0.45, 2.9, s * 0.78, 0);
        }
        b.solid(0.95, 3.0, 0, 0);
        // Tableware.
        for (let i = 0; i < 6; i++) {
          const pz = -1.1 + i * 0.44;
          const px = i % 2 ? 0.25 : -0.25;
          if (r.chance(0.7)) b.cyl(b.M.plastic, 0.12, 0.015, px, 0.782, pz, { seg: 16, color: 0xd8d4cc });
          if (r.chance(0.5)) b.cyl(b.M.plastic, 0.04, 0.1, px + 0.15, 0.825, pz + 0.1, { seg: 10, color: r.pick([0x2a4a6a, 0xd8d4cc, 0x8a2a1a]) });
        }
        // Pendant lamps.
        for (const pz of [-0.9, 0.9]) {
          b.rod(b.M.brushed, V(0, 2.8, pz), V(0, 1.85, pz), 0.006, {});
          b.cyl(b.M.painted, 0.2, 0.18, 0, 1.78, pz, { color: 0x2a2e33, seg: 20, rTop: 0.08, open: true });
          b.sphere(b.M.glow, 0.05, 0, 1.72, pz, { color: col(C.warm, 8) });
        }
        b.light(0, 1.6, 0, C.warm, 5.5, 6);
      });
    }

    // ---- Hydroponic planters under the windows (pink grow lights). ----
    for (const z of [-15.3, -12.0, -8.7]) {
      b.at(x1, 0, z, -Math.PI / 2, () => {
        b.box(b.M.painted, 2.4, 0.5, 0.45, 0, 0.55, 0.23, { color: 0x3a4a3a, bevel: 0.02 });
        b.box(b.M.painted, 2.3, 0.05, 0.4, 0, 0.81, 0.23, { color: 0x2a1e14 });
        for (let i = 0; i < 9; i++) plant(b, r, -1.05 + i * 0.26, 0.83, 0.23 + r.range(-0.08, 0.08));
        b.box(b.M.painted, 2.4, 0.04, 0.12, 0, 1.0 - 0.06, 0.4, { color: C.dark });
        b.glow(0xff50c8, 3.2, 2.3, 0.01, 0.05, 0, 0.915, 0.4);
        b.light(0, 1.0, 0.45, 0xff60c8, 1.6, 2.4);
        b.sign(['HYDRO ' + (z < -14 ? 'A' : z < -10 ? 'B' : 'C')], 0.3, 0.07, -0.9, 0.55, 0.456, { bg: '#e8e2d2', fg: '#1a1a1a' });
        b.solid(2.4, 0.5, 0, 0.23);
      });
    }

    // ---- Aft wall: pantry shelving + notice board. ----
    b.at(4.2, 0, za, Math.PI, () => {
      b.box(b.M.painted, 3.2, 2.2, 0.06, 0, 1.1, 0.03, { color: 0x3a3e43 });
      for (let k = 0; k < 5; k++) {
        b.box(b.M.brushed, 3.2, 0.03, 0.42, 0, 0.3 + k * 0.45, 0.24, {});
        for (let i = 0; i < 9; i++) {
          if (r.chance(0.2)) continue;
          const w = r.range(0.2, 0.32);
          const h = r.range(0.18, 0.34);
          b.box(b.M.painted, w, h, 0.34, -1.45 + i * 0.36, 0.315 + k * 0.45 + h / 2, 0.24, { color: r.pick([0xb8b0a0, 0x7a8a5a, 0xc0a060, 0x8a9aa8, 0xd8d4cc]), bevel: 0.01 });
        }
      }
      b.solid(3.2, 0.5, 0, 0.24);
      b.box(b.M.painted, 1.2, 0.8, 0.02, 2.5, 1.5, 0.01, { color: 0x8a7a5a });
      const notes = ['DUTY ROSTER', 'NO HOT FOOD IN ZERO-G', 'BIRTHDAY: OKAFOR', 'FILTER CHANGE WED'];
      notes.forEach((n, i) => b.sign([n], 0.5, 0.2, 2.2 + (i % 2) * 0.58, 1.72 - Math.floor(i / 2) * 0.36, 0.025, { bg: i % 2 ? '#e8e2c8' : '#d8e0e8', fg: '#2a2a2a', wear: 0.3 }));
    });
    b.screen('orbit', 'cyan', 1.0, 0.6, x0 + 0.02, 1.6, -15.5, { rotY: Math.PI / 2, seed: 0.55 });
    b.sign(['GALLEY · MESS'], 1.0, 0.16, x0 + 0.002, 2.2, -15.5, { bg: '#1d2024', fg: '#e8c070' }, { rotY: Math.PI / 2 });
    vent(b, 0.7, 0.28, 7.0, 2.5, zf, 0);
  });
}
