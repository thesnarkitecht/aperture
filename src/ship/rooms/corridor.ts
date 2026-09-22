import { Builder, V } from '../kit';
import { C, ceilingLight, extinguisher, gauge, vent, cableTray } from '../props';
import { DOORS, SKIN } from '../layout';
import { rng } from '../../engine/shared';

const X_IN = 1.3 - SKIN; // inner face of the side walls
const WALL_TOP = 2.12;
const CEIL = 2.75;
const CEIL_HALF = 0.6;

function doorNear(side: -1 | 1, z: number, clearance: number) {
  const x = side * 1.3;
  return DOORS.some((d) => d.wall === 'x' && Math.abs(d.x - x) < 0.01 && Math.abs(d.z - z) < d.width / 2 + clearance);
}

export function buildCorridor(b: Builder) {
  const r = rng(101);
  b.inZone('corridor', () => {
    const z0 = -18 + SKIN;
    const z1 = 6 - SKIN;
    const len = z1 - z0;
    const zc = (z0 + z1) / 2;

    // ---- Floor: grating over a service trench. ----
    const sections = Math.round(len / 1.2);
    for (let i = 0; i < sections; i++) {
      const za = z0 + (len / sections) * i;
      const zb = za + len / sections;
      b.span(b.M.grate, -X_IN + 0.12, -0.03, za + 0.01, X_IN - 0.12, 0, zb - 0.01, { uvScale: 1 });
      // Cross stringer under each seam.
      b.span(b.M.painted, -X_IN, -0.12, za - 0.03, X_IN, -0.03, za + 0.03, { color: 0x34383c });
    }
    // Solid kick strips along the walls.
    for (const s of [-1, 1]) {
      b.span(b.M.tread, s * X_IN, -0.03, z0, s * (X_IN - 0.12), 0, z1, { color: 0x8a8a84 });
      b.span(b.M.painted, s * (X_IN - 0.12), -0.4, z0, s * (X_IN - 0.14), -0.03, z1, { color: 0x34383c });
      // Yellow edge line.
      b.span(b.M.painted, s * (X_IN - 0.125), 0.0, z0, s * (X_IN - 0.155), 0.004, z1, { color: 0xc8961e });
    }
    // Under-floor services, lit by cyan strips.
    b.pipe(b.M.painted, [V(-0.55, -0.26, z0), V(-0.55, -0.26, z1)], 0.085, { color: 0x4a6a8a, flangeEvery: 1.6 });
    b.pipe(b.M.painted, [V(0.05, -0.28, z0), V(0.05, -0.28, z1)], 0.1, { color: 0xb08a2a, flangeEvery: 2 });
    b.pipe(b.M.painted, [V(0.42, -0.3, z0), V(0.42, -0.3, z1)], 0.05, { color: 0x6a2a22, flangeEvery: 2.4 });
    cableTray(b, V(0.8, -0.36, z0), V(0.8, -0.36, z1), 0.3, r);
    for (const s of [-1, 1]) b.glow(C.cyan, 2.2, 0.03, 0.02, len, s * 0.98, -0.385, zc);

    // ---- Lower wainscot + upper paneling tone. ----
    for (const s of [-1, 1] as const) {
      const yaw = s < 0 ? Math.PI / 2 : -Math.PI / 2; // local +z points into the corridor
      b.at(s * X_IN, 0, 0, yaw, () => {
        // Wainscot with gaps at doors: local x runs along -/+ z.
        const along = (zWorld: number) => (s < 0 ? -zWorld : zWorld);
        const segs: [number, number][] = [];
        let cur = z0;
        const doors = DOORS.filter((d) => d.wall === 'x' && Math.abs(d.x - s * 1.3) < 0.01).sort((a, c) => a.z - c.z);
        for (const d of doors) {
          segs.push([cur, d.z - d.width / 2 - 0.16]);
          cur = d.z + d.width / 2 + 0.16;
        }
        segs.push([cur, z1]);
        for (const [a, c] of segs) {
          if (c - a < 0.1) continue;
          const la = along(a);
          const lc = along(c);
          b.span(b.M.painted, Math.min(la, lc), 0, 0, Math.max(la, lc), 0.95, 0.03, { color: 0x4a5056 });
          b.span(b.M.painted, Math.min(la, lc), 0.95, 0, Math.max(la, lc), 0.99, 0.05, { color: 0x2c3034, bevel: 0.01 });
          // Knee-height pipe on the port side.
          if (s < 0) b.pipe(b.M.painted, [V(Math.min(la, lc), 0.3, 0.1), V(Math.max(la, lc), 0.3, 0.1)], 0.045, { color: 0x7a3a2a, brackets: V(0, 0, -0.1), flangeEvery: 1.8 });
          else b.pipe(b.M.painted, [V(Math.min(la, lc), 0.22, 0.09), V(Math.max(la, lc), 0.22, 0.09)], 0.035, { color: 0x3a5a3a, brackets: V(0, 0, -0.09), flangeEvery: 1.8 });
        }
      });
      // Handrails.
      const railSegs: [number, number][] = [];
      let cur = z0 + 0.3;
      for (const d of DOORS.filter((dd) => dd.wall === 'x' && Math.abs(dd.x - s * 1.3) < 0.01).sort((a, c) => a.z - c.z)) {
        railSegs.push([cur, d.z - d.width / 2 - 0.35]);
        cur = d.z + d.width / 2 + 0.35;
      }
      railSegs.push([cur, z1 - 0.3]);
      for (const [a, c] of railSegs) {
        if (c - a < 0.6) continue;
        b.pipe(b.M.painted, [V(s * (X_IN - 0.09), 1.02, a), V(s * (X_IN - 0.09), 1.02, c)], 0.02, { color: 0xb0a070, flangeEvery: 1.3, brackets: V(s * 0.09, 0, 0) });
      }
    }

    // ---- Ribs, angled upper panels, ceiling. ----
    const ribAt: number[] = [];
    for (let z = -16.5; z < 5.6; z += 2) ribAt.push(z);
    const ribW = 0.2;
    for (const z of ribAt) {
      for (const s of [-1, 1] as const) {
        if (!doorNear(s, z, 0.25)) {
          b.box(b.M.painted, 0.13, WALL_TOP, ribW, s * (X_IN - 0.065), WALL_TOP / 2, z, { color: 0x3a3f44, bevel: 0.02 });
          b.box(b.M.painted, 0.02, WALL_TOP - 0.3, ribW * 0.5, s * (X_IN - 0.135), WALL_TOP / 2, z, { color: 0x2a2e32 });
          // Frame number stencil.
          const fr = Math.round((z + 18) / 2) + 10;
          b.sign([`FR ${fr}`], 0.09, 0.05, s * (X_IN - 0.146), 1.62, z, { bg: null, fg: '#d8cfb8', wear: 0.6 }, { rotY: s < 0 ? Math.PI / 2 : -Math.PI / 2 });
        }
        // Angled brace from the wall top to the ceiling.
        const ax = s * (X_IN - 0.13);
        const cx = s * CEIL_HALF;
        const mx = (ax + cx) / 2;
        const my = (WALL_TOP + CEIL) / 2;
        const ang = Math.atan2(CEIL - WALL_TOP, Math.abs(cx - ax));
        b.box(b.M.painted, Math.hypot(cx - ax, CEIL - WALL_TOP) + 0.08, 0.14, ribW, mx, my - 0.07, z, { color: 0x3a3f44, bevel: 0.02, rotZ: -s * ang });
      }
      b.box(b.M.painted, CEIL_HALF * 2 + 0.1, 0.12, ribW, 0, CEIL - 0.06, z, { color: 0x3a3f44, bevel: 0.02 });
    }
    // Angled panels between wall top and ceiling (continuous), with light strips.
    for (const s of [-1, 1] as const) {
      const ax = s * X_IN;
      const cx = s * CEIL_HALF;
      const ang = Math.atan2(CEIL - WALL_TOP, Math.abs(cx - ax));
      const w = Math.hypot(cx - ax, CEIL - WALL_TOP);
      b.at((ax + cx) / 2, (WALL_TOP + CEIL) / 2, zc, 0, () => {
        b.box(b.M.panel, w + 0.1, 0.05, len, 0, 0.03, 0, { color: 0x7a8288, uvScale: 1.6 });
      }, 0, -s * ang);
      // Light strips in each bay.
      for (let i = 0; i < ribAt.length - 1; i++) {
        const za = ribAt[i] + ribW / 2 + 0.08;
        const zb = ribAt[i + 1] - ribW / 2 - 0.08;
        b.at((ax + cx) / 2 - s * 0.02, (WALL_TOP + CEIL) / 2 - 0.02, (za + zb) / 2, 0, () => {
          b.box(b.M.painted, 0.18, 0.03, zb - za, 0, 0, 0, { color: 0x24272a });
          b.glow(C.cool, 2.2, 0.1, 0.02, zb - za - 0.06, 0, -0.012, 0);
        }, 0, -s * ang);
      }
    }
    b.span(b.M.panel, -CEIL_HALF - 0.05, CEIL, z0, CEIL_HALF + 0.05, CEIL + 0.08, z1, { color: 0x6a7278 });
    // Ceiling services.
    b.pipe(b.M.painted, [V(-0.36, 2.58, z0), V(-0.36, 2.58, z1)], 0.06, { color: 0x8a2a1e, brackets: V(0, 0.17, 0), flangeEvery: 2 });
    b.pipe(b.M.painted, [V(-0.18, 2.62, z0), V(-0.18, 2.62, z1)], 0.04, { color: 0x3a6a4a, brackets: V(0, 0.13, 0), flangeEvery: 2 });
    cableTray(b, V(0.28, 2.6, z0), V(0.28, 2.6, z1), 0.34, r);

    // Pooled lights (every other bay) + fixtures.
    ribAt.slice(0, -1).forEach((z, i) => {
      const zm = z + 1;
      const flicker = Math.abs(zm - -2.5) < 0.6 ? 0.9 : 0;
      ceilingLight(b, 0, CEIL - 0.13, zm, { len: 0.7, width: 0.16, glow: flicker ? 3 : 5, intensity: 7.5, distance: 6.5, light: i % 2 === 0 || flicker > 0, flicker });
    });

    // ---- Wall-mounted detail. ----
    extinguisher(b, X_IN - 0.01, 0.95, -7.2, -Math.PI / 2);
    extinguisher(b, -X_IN + 0.01, 0.95, 4.2, Math.PI / 2);
    // Intercom panel with screen (port, z=-2).
    b.at(-X_IN, 0, -1.6, Math.PI / 2, () => {
      b.box(b.M.painted, 0.5, 0.7, 0.06, 0, 1.45, 0.03, { color: 0x2c3034, bevel: 0.012 });
      b.screen('terminal', 'amber', 0.38, 0.26, 0, 1.58, 0.065, { seed: 0.31 });
      for (let i = 0; i < 6; i++) b.glow(i % 3 === 0 ? C.green : C.amber, 2.5, 0.04, 0.025, 0.01, -0.15 + i * 0.06, 1.34, 0.065);
      b.cyl(b.M.brushed, 0.04, 0.02, 0.16, 1.24, 0.07, { axis: 'z', seg: 12 });
      b.sign(['INTERCOM'], 0.3, 0.05, 0, 1.76, 0.062, { bg: null, fg: '#d8cfb8' });
    });
    // Junction boxes and conduits.
    for (const [s, z] of [[1, -15.2], [-1, -9.2], [1, -3.1], [-1, 3.3], [1, 3.9]] as [number, number][]) {
      b.at(s * X_IN, 0, z, s < 0 ? Math.PI / 2 : -Math.PI / 2, () => {
        b.box(b.M.painted, 0.34, 0.42, 0.12, 0, 1.55, 0.06, { color: 0x5a6068, bevel: 0.015 });
        b.box(b.M.painted, 0.3, 0.02, 0.02, 0, 1.72, 0.125, { color: 0x2a2e32 });
        b.sign(['480V'], 0.12, 0.05, 0.08, 1.64, 0.121, { bg: '#d8a21c', fg: '#141414', wear: 0.3 });
        b.pipe(b.M.painted, [V(-0.08, 1.76, 0.05), V(-0.08, 2.1, 0.05)], 0.018, { color: 0x3a3e42, flanges: false });
        b.pipe(b.M.painted, [V(0.08, 1.34, 0.05), V(0.08, 0.99, 0.05)], 0.018, { color: 0x3a3e42, flanges: false });
        gauge(b, -0.08, 1.46, 0.12, 0, 0.04);
      });
    }
    // Vents low on the walls.
    for (const [s, z] of [[-1, -15.5], [1, -9], [-1, -7.8], [1, 3], [-1, -0.2]] as [number, number][]) {
      vent(b, 0.5, 0.18, s * (X_IN - 0.035), 0.6, z, s < 0 ? Math.PI / 2 : -Math.PI / 2);
    }

    // ---- Directional signage. ----
    const signs: [number, number, string[], 'left' | 'right'][] = [
      [-1, -14.8, ['BRIDGE'], 'right'],
      [1, -14.6, ['BRIDGE'], 'left'],
      [-1, -6.6, ['CARGO · ENGINEERING'], 'left'],
      [1, -2.2, ['CARGO · ENGINEERING'], 'right'],
      [1, -9.6, ['GALLEY'], 'left'],
      [-1, 3.8, ['MEDBAY'], 'right'],
    ];
    for (const [s, z, text, arrow] of signs) {
      b.sign(text, 0.9, 0.16, s * (X_IN - 0.001), 1.88, z, { bg: '#1d2024', fg: '#e8c070', arrow, wear: 0.4 }, { rotY: s < 0 ? Math.PI / 2 : -Math.PI / 2 });
    }
    // End bulkhead detail around the bridge and cargo doors.
    for (const [z, face] of [[z0, 1], [z1, -1]] as [number, number][]) {
      for (const s of [-1, 1]) {
        b.box(b.M.painted, 0.3, WALL_TOP, 0.14, s * 0.95, WALL_TOP / 2, z + face * 0.07, { color: 0x3a3f44, bevel: 0.02 });
        b.box(b.M.hazard, 0.06, 1.8, 0.012, s * 0.8, 1.0, z + face * 0.145, { uvScale: 0.4 });
      }
    }
  });
}
