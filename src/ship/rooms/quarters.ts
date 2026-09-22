import { Builder } from '../kit';
import { C, ceilingLight, chair, locker, vent } from '../props';
import { SKIN } from '../layout';
import { rng, type Rng } from '../../engine/shared';

/** Two-tier sleeping pod block, 2.1 wide, facing local +z. */
function bunk(b: Builder, r: Rng, lights: boolean[]) {
  const W = 2.1;
  const D = 1.0;
  const H = 2.35;
  const shell = 0x5a5448;
  // Carcass.
  b.box(b.M.painted, W, 0.06, D, 0, 0.03, 0, { color: 0x2c2a26 });
  b.box(b.M.painted, W, 0.08, D, 0, H - 0.04, 0, { color: shell, bevel: 0.02 });
  for (const s of [-1, 1]) b.box(b.M.painted, 0.06, H, D, (s * (W - 0.06)) / 2, H / 2, 0, { color: shell, bevel: 0.015 });
  b.box(b.M.panel, W, H, 0.04, 0, H / 2, -D / 2 + 0.02, { color: 0x8a8272 });
  for (let tier = 0; tier < 2; tier++) {
    const y = 0.28 + tier * 1.05;
    // Berth floor + mattress + pillow + blanket.
    b.box(b.M.painted, W - 0.12, 0.08, D - 0.06, 0, y, 0, { color: 0x3a3630, bevel: 0.01 });
    b.box(b.M.fabric, W - 0.18, 0.14, D - 0.14, 0, y + 0.11, -0.02, { color: 0x6a6a70, bevel: 0.05 });
    b.box(b.M.fabric, 0.42, 0.1, 0.62, -W / 2 + 0.34, y + 0.23, -0.06, { color: 0xd8d4cc, bevel: 0.045 });
    const blanket = r.pick([0x5a2a22, 0x2a3a5a, 0x3a4a2a, 0x6a5a3a]);
    b.box(b.M.fabric, W * 0.55, 0.05, D - 0.1, W * 0.12, y + 0.2, 0.0, { color: blanket, bevel: 0.02, rotZ: 0.02 });
    b.box(b.M.fabric, 0.4, 0.06, D - 0.1, W * 0.12 + W * 0.28, y + 0.24, 0.0, { color: blanket, bevel: 0.03 });
    // Reading lamp + shelf + personal photo.
    b.box(b.M.painted, 0.14, 0.05, 0.08, -W / 2 + 0.2, y + 0.8, -D / 2 + 0.08, { color: C.dark, bevel: 0.01 });
    b.glow(C.warm, 4, 0.1, 0.01, 0.05, -W / 2 + 0.2, y + 0.77, -D / 2 + 0.09);
    if (lights[tier]) b.light(-W / 2 + 0.3, y + 0.6, -D / 2 + 0.3, C.warm, 1.6, 2.4);
    b.box(b.M.painted, 0.6, 0.03, 0.18, W / 2 - 0.45, y + 0.6, -D / 2 + 0.12, { color: 0x3a3630 });
    for (let k = 0; k < 4; k++) b.box(b.M.plastic, 0.035, r.range(0.14, 0.22), 0.13, W / 2 - 0.68 + k * 0.045, y + 0.7, -D / 2 + 0.12, { color: r.pick([0x8a2a1a, 0x2a4a6a, 0xc0b090, 0x3a3a3a]) });
    b.sign([r.pick(['HOME', 'MARS 2291', 'KESSLER YARD', 'ADA & RAY', 'CERES'])], 0.2, 0.14, 0.05, y + 0.62, -D / 2 + 0.045, { bg: '#c8c0a8', fg: '#3a3a3a', wear: 0.6 });
    // Privacy curtain, half drawn.
    const drawn = r.range(0.25, 0.6);
    b.box(b.M.fabric, W * drawn, 0.88, 0.02, W / 2 - (W * drawn) / 2 - 0.05, y + 0.52, D / 2 - 0.05, { color: 0x3a4a5a });
    b.box(b.M.brushed, W - 0.1, 0.015, 0.015, 0, y + 0.97, D / 2 - 0.05, {});
    // Lip.
    b.box(b.M.painted, W - 0.1, 0.12, 0.05, 0, y + 0.06, D / 2 - 0.03, { color: shell, bevel: 0.01 });
  }
  // Ladder.
  for (const s of [-1, 1]) b.box(b.M.brushed, 0.025, 1.6, 0.025, W / 2 - 0.2 + s * 0.16, 0.8, D / 2 + 0.03, {});
  for (let k = 0; k < 5; k++) b.box(b.M.brushed, 0.34, 0.02, 0.02, W / 2 - 0.2, 0.3 + k * 0.3, D / 2 + 0.03, {});
  b.solid(W, D + 0.1, 0, 0);
}

export function buildQuarters(b: Builder) {
  const r = rng(404);
  b.inZone('quarters', () => {
    const x0 = -9 + SKIN;
    const x1 = -1.3 - SKIN;
    const zf = -18 + SKIN;
    const za = -7 - SKIN;
    // Bunk blocks on the forward and aft walls.
    for (const [cx, lit] of [[-7.75, [true, false]], [-5.55, [false, true]]] as [number, boolean[]][]) {
      b.at(cx, 0, zf + 0.5, 0, () => bunk(b, r, lit));
      b.at(cx, 0, za - 0.5, Math.PI, () => bunk(b, r, lit.map((v) => !v)));
    }
    // Wardrobe lockers along the inner wall, split by the door.
    for (let i = 0; i < 6; i++) b.at(x1 - 0.25, 0, zf + 0.35 + i * 0.62, -Math.PI / 2, () => locker(b, 0.6, 2.1, 0.5, 0x5a6a5a, r, `BERTH ${i + 1}`));
    b.solid(0.5, 3.8, x1 - 0.25, zf + 0.35 + 2.5 * 0.62);
    for (let i = 0; i < 6; i++) b.at(x1 - 0.25, 0, za - 0.35 - i * 0.62, -Math.PI / 2, () => locker(b, 0.6, 2.1, 0.5, 0x5a6a5a, r, `BERTH ${i + 7}`));
    b.solid(0.5, 3.8, x1 - 0.25, za - 0.35 - 2.5 * 0.62);
    // Window desks.
    for (const z of [-15.4, -10.2]) {
      b.at(x0, 0, z, Math.PI / 2, () => {
        b.box(b.M.painted, 1.3, 0.05, 0.55, 0, 0.76, 0.3, { color: 0x4a4438, bevel: 0.015 });
        b.box(b.M.painted, 0.05, 0.74, 0.5, -0.6, 0.37, 0.3, { color: 0x2c2a26 });
        b.box(b.M.painted, 0.05, 0.74, 0.5, 0.6, 0.37, 0.3, { color: 0x2c2a26 });
        b.screen('terminal', 'amber', 0.36, 0.24, 0.3, 0.95, 0.2, { tilt: 0.3, seed: z });
        b.box(b.M.plastic, 0.1, 0.12, 0.1, -0.35, 0.84, 0.35, { color: 0xd8d0c0 }); // mug
        b.solid(1.3, 0.6, 0, 0.3);
        b.at(0, 0, 0.9, Math.PI, () => chair(b, { color: 0x5a4a3a }));
      });
    }
    // Mess table with stools.
    b.at(-5.0, 0, -12.5, 0, () => {
      b.box(b.M.painted, 0.9, 0.05, 1.8, 0, 0.74, 0, { color: 0x5a5448, bevel: 0.015 });
      b.cyl(b.M.brushed, 0.06, 0.72, 0, 0.36, 0, { seg: 12 });
      b.cyl(b.M.painted, 0.35, 0.03, 0, 0.015, 0, { seg: 20, color: 0x2c2a26 });
      b.solid(0.9, 1.8, 0, 0);
      for (const [sx, sz] of [[-0.75, -0.5], [-0.75, 0.5], [0.75, -0.5], [0.75, 0.5]]) {
        b.cyl(b.M.fabric, 0.19, 0.08, sx, 0.46, sz, { seg: 16, color: 0x6a3020 });
        b.cyl(b.M.brushed, 0.03, 0.44, sx, 0.22, sz, { seg: 8 });
        b.solidCircle(0.2, sx, sz);
      }
      // Clutter: playing cards, mugs, a tablet.
      b.box(b.M.plastic, 0.3, 0.012, 0.22, 0.1, 0.772, -0.3, { color: 0x1a1a1a, rotY: 0.3 });
      b.glow(C.cyan, 1.2, 0.26, 0.002, 0.18, 0.1, 0.78, -0.3, { rotY: 0.3 });
      b.cyl(b.M.plastic, 0.045, 0.1, -0.2, 0.815, 0.4, { seg: 12, color: 0xc0b8a8 });
      b.cyl(b.M.plastic, 0.045, 0.1, 0.25, 0.815, 0.55, { seg: 12, color: 0x8a2a1a });
      for (let k = 0; k < 5; k++) b.box(b.M.plastic, 0.06, 0.003, 0.09, -0.1 + k * 0.05, 0.768, 0.05 + k * 0.02, { color: k % 2 ? 0xe8e4da : 0xb02a1a, rotY: k * 0.3 });
    });
    // Boots by the bunks.
    for (let i = 0; i < 3; i++) b.box(b.M.rubber, 0.12, 0.2, 0.28, -8.2 + i * 0.9, 0.1, zf + 1.25, { bevel: 0.04, rotY: r.range(-0.3, 0.3) });
    // Lighting.
    ceilingLight(b, -5.2, 2.8, -15.0, { len: 1.4, color: C.warm, glow: 3, intensity: 3.5, distance: 6 });
    ceilingLight(b, -5.2, 2.8, -10.0, { len: 1.4, color: C.warm, glow: 3, intensity: 3.5, distance: 6 });
    vent(b, 0.6, 0.25, -3.2, 2.55, zf, 0);
    b.sign(['QUIET HOURS 2200–0600'], 1.2, 0.12, -3.4, 1.9, za - 0.001, { bg: '#1d2024', fg: '#e8c070' }, { rotY: Math.PI });
  });
}
