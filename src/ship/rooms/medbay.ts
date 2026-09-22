import * as THREE from 'three';
import { Builder, V, col } from '../kit';
import { C, buttonPanel, ceilingLight, chair, vent } from '../props';
import { SKIN } from '../layout';
import { rng } from '../../engine/shared';

export function buildMedbay(b: Builder) {
  const r = rng(606);
  b.inZone('medbay', () => {
    const x0 = -9 + SKIN;
    const x1 = -1.3 - SKIN;
    const zf = -2.5 + SKIN;
    const za = 6 - SKIN;

    // ---- Two treatment beds with scanner arches. ----
    for (const [zc, seed] of [[-0.2, 0.1], [3.5, 0.2]] as [number, number][]) {
      b.at(x0 + 1.25, 0, zc, Math.PI / 2, () => {
        // Local: +z toward room (world +x), bed runs along local z.
        b.box(b.M.painted, 0.8, 0.12, 2.0, 0, 0.62, 0.1, { color: 0xc8ccd0, bevel: 0.03 });
        b.box(b.M.painted, 0.3, 0.5, 0.6, 0, 0.3, 0.1, { color: 0x8a9096, bevel: 0.03 });
        b.box(b.M.painted, 0.7, 0.04, 0.5, 0, 0.04, 0.1, { color: 0x3a3e43 });
        b.box(b.M.fabric, 0.74, 0.12, 1.9, 0, 0.74, 0.12, { color: 0xe4e8ea, bevel: 0.05 });
        b.box(b.M.fabric, 0.5, 0.1, 0.35, 0, 0.84, -0.62, { color: 0xf0f0f0, bevel: 0.045 });
        b.box(b.M.fabric, 0.76, 0.03, 0.8, 0, 0.815, 0.55, { color: 0x6a8aa8, bevel: 0.012 });
        // Scanner arch.
        const arch = new THREE.TorusGeometry(0.62, 0.05, 8, 32, Math.PI);
        b.geo(b.M.painted, arch, new THREE.Matrix4().makeTranslation(0, 0.72, 0.35), { color: 0xd8dce0 });
        b.geo(b.M.glow, new THREE.TorusGeometry(0.575, 0.008, 4, 48, Math.PI), new THREE.Matrix4().makeTranslation(0, 0.72, 0.35), { color: col(C.cyan, 5) });
        for (const s of [-1, 1]) b.box(b.M.painted, 0.12, 0.72, 0.18, s * 0.62, 0.36, 0.35, { color: 0xb8bcc0, bevel: 0.02 });
        // Vitals monitor on an arm.
        b.rod(b.M.brushed, V(0.55, 1.6, -0.95), V(0.55, 1.6, -0.5), 0.02, {});
        b.at(0.55, 1.6, -0.45, 0.6, () => b.screen('vitals', 'green', 0.44, 0.3, 0, 0, 0.02, { seed }));
        // IV stand.
        b.rod(b.M.chrome, V(-0.6, 0, -0.7), V(-0.6, 1.9, -0.7), 0.012, {});
        b.box(b.M.glass, 0.12, 0.2, 0.05, -0.6, 1.75, -0.7, {});
        b.box(b.M.plastic, 0.1, 0.18, 0.04, -0.6, 1.75, -0.7, { color: 0xc8e0e8 });
        b.solid(0.9, 2.1, 0, 0.1);
      });
      // Surgical lamp.
      const lx = x0 + 1.25;
      b.rod(b.M.brushed, V(lx - 0.2, 2.8, zc), V(lx + 0.3, 2.1, zc), 0.025, {});
      b.cyl(b.M.painted, 0.36, 0.1, lx + 0.3, 2.05, zc, { color: 0xd8dce0, seg: 28 });
      b.cyl(b.M.glow, 0.3, 0.01, lx + 0.3, 1.995, zc, { color: col(C.cool, 6), seg: 28 });
      b.light(lx + 0.3, 1.8, zc, C.cool, 5, 4);
    }

    // ---- Cabinets and sink along the forward wall. ----
    b.at(-5.2, 0, zf, 0, () => {
      const L = 5.0;
      b.box(b.M.painted, L, 0.9, 0.6, 0, 0.45, 0.3, { color: 0xd8dce0, bevel: 0.015 });
      b.box(b.M.painted, L + 0.02, 0.04, 0.62, 0, 0.92, 0.31, { color: 0x3a4a5a });
      for (let i = 0; i < 7; i++) b.box(b.M.painted, 0.66, 0.74, 0.01, -L / 2 + 0.38 + i * 0.71, 0.44, 0.605, { color: 0xc8ccd0, bevel: 0.004 });
      // Glass-front upper cabinets with supplies.
      b.box(b.M.painted, L, 0.8, 0.36, 0, 1.95, 0.18, { color: 0xd8dce0, bevel: 0.015 });
      for (let i = 0; i < 6; i++) {
        const x = -L / 2 + 0.42 + i * 0.83;
        b.box(b.M.glass, 0.74, 0.68, 0.01, x, 1.95, 0.365, {});
        for (let k = 0; k < 2; k++) for (let j = 0; j < 4; j++) b.box(b.M.plastic, 0.1, r.range(0.12, 0.24), 0.1, x - 0.26 + j * 0.17, 1.66 + k * 0.33 + 0.08, 0.2, { color: r.pick([0xe8e4da, 0x6a9ac0, 0xd06a3a, 0x8ab87a]) });
      }
      b.box(b.M.chrome, 0.7, 0.2, 0.42, 1.6, 0.84, 0.3, {});
      b.rod(b.M.chrome, V(1.6, 0.94, 0.08), V(1.6, 1.2, 0.12), 0.014, {});
      b.sign(['BIOHAZARD'], 0.36, 0.1, -1.8, 1.25, 0.61, { bg: '#d8a21c', fg: '#141414' });
      b.solid(L, 0.62, 0, 0.31);
    });

    // ---- Medical pod on the aft wall. ----
    b.at(-5.0, 0, za - 0.75, 0, () => {
      b.box(b.M.painted, 1.1, 0.5, 2.3, 0, 0.25, 0, { color: 0xb8bcc0, bevel: 0.05, rotY: Math.PI / 2 });
      const pod = new THREE.CapsuleGeometry(0.5, 1.4, 8, 24);
      const m = new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 0.95, 0);
      b.geo(b.M.painted, pod, m, { color: 0xd8dce0, uv: 'box' });
      b.geo(b.M.glass, new THREE.CapsuleGeometry(0.52, 1.2, 6, 24), new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, 1.02, 0.05), { uv: 'keep' });
      b.glow(C.cyan, 1.2, 1.6, 0.02, 0.6, 0, 0.8, 0.05);
      b.light(0, 1.1, 0.6, C.cyan, 1.8, 3);
      b.at(1.3, 0, 0.1, -0.4, () => {
        b.box(b.M.painted, 0.5, 1.2, 0.3, 0, 0.6, 0, { color: 0xc8ccd0, bevel: 0.03 });
        b.screen('graphs', 'cyan', 0.36, 0.26, 0, 1.0, 0.155, { seed: 0.77 });
        b.at(0, 0.72, 0.155, 0, () => buttonPanel(b, 0.36, 0.16, 5, 2, r, 0.5));
      });
      b.sign(['STASIS · MED-POD 01'], 1.0, 0.14, 0, 1.75, -0.2, { bg: '#1d2024', fg: '#8ad8e8' });
      b.solid(2.3, 1.1, 0, 0);
    });

    // ---- Doctor's desk on the inner wall. ----
    b.at(x1, 0, 4.2, -Math.PI / 2, () => {
      b.box(b.M.painted, 1.5, 0.05, 0.7, 0, 0.76, 0.35, { color: 0xc8ccd0, bevel: 0.015 });
      b.box(b.M.painted, 0.5, 0.72, 0.6, 0.45, 0.37, 0.35, { color: 0xb8bcc0 });
      b.screen('schematic', 'cyan', 0.6, 0.38, -0.2, 1.08, 0.2, { tilt: 0.2, seed: 0.66 });
      b.box(b.M.plastic, 0.4, 0.02, 0.14, -0.2, 0.79, 0.45, { color: 0x2a2a2a });
      b.solid(1.5, 0.7, 0, 0.35);
      b.at(-0.2, 0, 1.0, Math.PI, () => chair(b, { color: 0x3a4a5a }));
    });

    // Lighting: bright, clinical.
    for (const [x, z] of [[-5.2, -0.8], [-5.2, 2.2], [-5.2, 4.6]]) ceilingLight(b, x, 2.8, z, { len: 1.6, width: 0.35, color: C.cool, glow: 5.5, intensity: 6, distance: 7 });
    vent(b, 0.6, 0.25, -2.4, 2.5, zf, 0);
    b.sign(['MEDICAL BAY'], 1.1, 0.18, -2.8, 2.35, za - 0.001, { bg: '#1d2024', fg: '#8ad8e8' }, { rotY: Math.PI });
    // Red cross.
    b.at(x1 - 0.001, 1.9, -1.4, -Math.PI / 2, () => {
      b.box(b.M.painted, 0.36, 0.12, 0.01, 0, 0, 0, { color: 0xb02a1a });
      b.box(b.M.painted, 0.12, 0.36, 0.01, 0, 0, 0, { color: 0xb02a1a });
    });
  });
}
