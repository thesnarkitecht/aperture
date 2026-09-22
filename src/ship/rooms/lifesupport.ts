import { Builder, V } from '../kit';
import { C, ceilingLight, console as station, fan, gauge, tank, valveWheel, vent } from '../props';
import { SKIN } from '../layout';
import { rng } from '../../engine/shared';

export function buildLifeSupport(b: Builder) {
  const r = rng(707);
  b.inZone('lifesupport', () => {
    const x0 = 1.3 + SKIN;
    const x1 = 9 - SKIN;
    const zf = -6 + SKIN;
    const za = 6 - SKIN;

    // Grated floor over the service pit.
    b.span(b.M.grate, x0, -0.03, zf, x1, 0, za, { uvScale: 1 });
    for (let z = zf + 1; z < za; z += 1.5) b.span(b.M.painted, x0, -0.14, z - 0.03, x1, -0.03, z + 0.03, { color: 0x34383c });
    for (const x of [3.2, 5.4, 7.6]) b.pipe(b.M.painted, [V(x, -0.26, zf), V(x, -0.26, za)], 0.1, { color: r.pick([0x3a6a4a, 0x4a6a8a, 0xb08a2a]), flangeEvery: 1.4 });
    b.glow(0x40ffb0, 1.6, 0.04, 0.02, za - zf, x1 - 0.1, -0.38, (zf + za) / 2);

    // ---- Tank farm along the outer wall. ----
    const tanks: [number, number, string][] = [
      [-4.6, 0x2a6a3a, 'O2'],
      [-3.4, 0x2a6a3a, 'O2'],
      [-2.2, 0x3a4a6a, 'N2'],
      [-1.0, 0x3a4a6a, 'N2'],
    ];
    for (const [z, c, label] of tanks) {
      b.at(x1 - 0.55, 0, z, -Math.PI / 2, () => tank(b, 0.45, 2.2, c, label));
      b.pipe(b.M.painted, [V(x1 - 0.55, 2.35, z), V(x1 - 0.55, 2.55, z), V(x1 - 0.1, 2.55, z)], 0.04, { color: 0x8a8a84, flanges: false });
    }
    // Manifold header across the tank tops.
    b.pipe(b.M.painted, [V(x1 - 0.12, 2.55, -5.4), V(x1 - 0.12, 2.55, 0.2), V(x1 - 1.2, 2.55, 0.2), V(x1 - 1.2, 0.9, 0.2)], 0.07, { color: 0xb08a2a, brackets: V(0.1, 0, 0) });
    valveWheel(b, 0.16, x1 - 1.2, 1.3, 0.33, 'z');
    gauge(b, x1 - 1.0, 1.55, 0.29, 0, 0.07);

    // ---- CO2 scrubber stacks with fans. ----
    for (const [z, i] of [[2.0, 0], [4.6, 1]] as [number, number][]) {
      b.at(x1 - 0.7, 0, z, -Math.PI / 2, () => {
        b.box(b.M.painted, 2.2, 2.4, 1.2, 0, 1.2, 0, { color: 0x5a6a62, bevel: 0.03 });
        b.box(b.M.painted, 2.0, 0.3, 0.02, 0, 2.2, 0.61, { color: 0x3a4a42 });
        b.sign([`SCRUBBER ${i + 1}`, 'LiOH · REGEN'], 0.8, 0.2, -0.55, 2.2, 0.625, { bg: '#1d2024', fg: '#8ae8b8' });
        for (let k = 0; k < 5; k++) b.box(b.M.painted, 1.9, 0.02, 0.02, 0, 0.3 + k * 0.08, 0.62, { color: 0x2a3430 });
        b.screen('bars', 'green', 0.4, 0.28, 0.65, 1.55, 0.605, { seed: 0.3 + i * 0.2 });
        b.pipe(b.M.painted, [V(-0.9, 2.4, 0), V(-0.9, 2.65, 0), V(-0.9, 2.65, -0.8)], 0.12, { color: 0x6a7a72, flanges: false });
      });
      fan(b, 'lifesupport', 0.42, x1 - 1.32, 1.1, z - 0.35, -Math.PI / 2, 9 + i * 3);
      b.solid(1.2, 2.2, x1 - 0.7, z);
    }

    // ---- Water reclamation along the aft wall. ----
    b.at(4.0, 0, za - 0.6, Math.PI, () => {
      b.cyl(b.M.painted, 0.5, 2.6, 0, 0.8, 0, { axis: 'x', color: 0x4a6a8a, seg: 24 });
      for (const x of [-1.1, 0, 1.1]) b.cyl(b.M.painted, 0.53, 0.08, x, 0.8, 0, { axis: 'x', color: C.gun, seg: 24 });
      for (const x of [-1, 1]) b.box(b.M.painted, 0.2, 0.3, 0.9, x, 0.15, 0, { color: C.gun });
      b.pipe(b.M.painted, [V(1.3, 0.8, 0), V(1.7, 0.8, 0), V(1.7, 2.5, 0), V(1.7, 2.5, 0.5)], 0.08, { color: 0x4a6a8a });
      b.sign(['WATER RECLAMATION'], 1.2, 0.14, 0, 1.45, 0.5, { bg: null, fg: '#e8e8e0' });
      valveWheel(b, 0.12, -1.5, 0.8, 0.0, 'x');
      b.solid(2.8, 1.1, 0, 0);
    });

    // ---- Operator station + wall fan. ----
    b.at(3.2, 0, -4.2, Math.PI / 2 + 0.3, () => station(b, 1.2, { screens: [['bars', 'green'], ['graphs', 'green']], seed: 71 }));
    fan(b, 'lifesupport', 0.5, x0 + 0.08, 1.8, 3.4, Math.PI / 2, 7);
    // Dense overhead pipework.
    const ys = [2.35, 2.5, 2.62];
    ys.forEach((y, i) => b.pipe(b.M.painted, [V(x0 + 0.3 + i * 0.25, y, zf), V(x0 + 0.3 + i * 0.25, y, za)], 0.06 + i * 0.02, { color: [0x8a2a1e, 0x3a6a4a, 0xb08a2a][i], brackets: V(0, 2.8 - y, 0) }));
    b.pipe(b.M.painted, [V(x0, 2.45, -2.5), V(x1 - 1.2, 2.45, -2.5)], 0.09, { color: 0x4a6a8a, brackets: V(0, 0.35, 0) });

    for (const [x, z] of [[4.5, -3.2], [4.5, 1.5], [6.8, -0.6]]) ceilingLight(b, x, 2.8, z, { len: 1.2, color: 0xc8ffe8, glow: 3.5, intensity: 4.5, distance: 6 });
    vent(b, 0.7, 0.3, 5.0, 2.5, zf, 0);
    b.sign(['LIFE SUPPORT · ECLSS'], 1.4, 0.18, 5.4, 2.1, zf + 0.001, { bg: '#1d2024', fg: '#8ae8b8' });
    b.sign(['HEARING PROTECTION REQUIRED'], 1.2, 0.14, x0 + 0.001, 2.1, -2.0, { bg: '#2a6ab0', fg: '#f4efe4' }, { rotY: Math.PI / 2 });
  });
}
