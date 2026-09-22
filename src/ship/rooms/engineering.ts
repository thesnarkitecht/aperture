import * as THREE from 'three';
import { Builder, V, col } from '../kit';
import { C, beacon, ceilingLight, console as station, gauge, greebleRect, handrail, valveWheel, vent } from '../props';
import { SKIN } from '../layout';
import { rng } from '../../engine/shared';
import { createBeamMaterial, createPlasmaMaterial } from '../../materials/fx';
import { asFx } from '../../materials/library';

export const REACTOR = { x: 0, z: 31 };

export function buildEngineering(b: Builder) {
  const r = rng(909);
  b.inZone('engineering', () => {
    const x0 = -7 + SKIN;
    const x1 = 7 - SKIN;
    const za = 38 - SKIN;
    const H = 6;
    const { x: rx, z: rz } = REACTOR;

    // ---- Reactor plinth. ----
    b.cyl(b.M.tread, 2.3, 0.35, rx, 0.175, rz, { seg: 56, color: 0x8a8a84 });
    b.geo(b.M.hazard, new THREE.CylinderGeometry(2.32, 2.32, 0.2, 56, 1, true), new THREE.Matrix4().makeTranslation(rx, 0.18, rz), { uv: 'keep', uvRepeat: [14, 0.3] });
    b.solidCircle(2.95, rx, rz);
    b.at(rx, 0.35, rz, 0, () => {
      // Lower manifold with radial ribs.
      b.cyl(b.M.painted, 1.65, 0.85, 0, 0.425, 0, { seg: 48, color: 0x33373c });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        b.at(Math.cos(a) * 1.7, 0.42, Math.sin(a) * 1.7, -a, () => b.box(b.M.painted, 0.3, 0.82, 0.1, 0, 0, 0, { color: 0x2a2e32, bevel: 0.02 }));
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        b.pipe(b.M.painted, [V(Math.cos(a) * 1.4, 0.5, Math.sin(a) * 1.4), V(Math.cos(a) * 2.0, 0.5, Math.sin(a) * 2.0), V(Math.cos(a) * 2.0, -0.4, Math.sin(a) * 2.0)], 0.16, { color: 0x3a6aa0, flangeEvery: 0.6 });
      }
      // Containment tube.
      b.geo(b.M.glass, new THREE.CylinderGeometry(1.05, 1.05, 3.75, 48, 1, true), new THREE.Matrix4().makeTranslation(0, 0.85 + 1.875, 0), { uv: 'keep' });
      // Confinement rings and struts.
      for (const y of [1.35, 2.2, 3.05, 3.9]) {
        b.geo(b.M.painted, new THREE.TorusGeometry(1.2, 0.12, 12, 48), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, y, 0), { color: 0x2c3035 });
        b.geo(b.M.glow, new THREE.TorusGeometry(1.08, 0.018, 4, 64), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, y, 0), { color: col(C.cyan, 3) });
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          b.at(Math.cos(a) * 1.3, y, Math.sin(a) * 1.3, -a, () => b.box(b.M.painted, 0.16, 0.3, 0.2, 0, 0, 0, { color: 0x3a3e43, bevel: 0.02 }));
        }
      }
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.at(Math.cos(a) * 1.42, 2.7, Math.sin(a) * 1.42, -a, () => {
          b.box(b.M.painted, 0.14, 3.9, 0.22, 0, 0, 0, { color: 0x3a3e43, bevel: 0.03 });
          greebleRect(b, 0.16, 3.4, r, 0x4a4e52, 6, 0.05);
        });
      }
      // Upper cap + conduit to the ceiling.
      b.cyl(b.M.painted, 1.55, 0.7, 0, 4.95, 0, { seg: 48, color: 0x33373c, rTop: 1.3 });
      b.cyl(b.M.painted, 0.75, H - 5.3, 0, 5.3 + (H - 5.65) / 2, 0, { seg: 32, color: 0x2a2e32 });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        b.box(b.M.painted, 0.06, 0.62, 0.12, Math.cos(a) * 1.42, 4.95, Math.sin(a) * 1.42, { color: 0x24272a, rotY: -a });
      }
    });
    // Plasma column + inner filament.
    const plasma = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 3.7, 48, 16, true), createPlasmaMaterial());
    plasma.position.set(rx, 0.35 + 0.85 + 1.85, rz);
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 3.7, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 0.95, 1.0).multiplyScalar(1.8), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.position.copy(plasma.position);
    const aura = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 4.4, 48, 1, true), createBeamMaterial(new THREE.Color(0.3, 0.75, 1.0), 0.07));
    aura.position.copy(plasma.position);
    aura.rotation.x = Math.PI; // beam fades along uv.y; flip so the brightest part is at the base
    // Scanner ring travelling along the column.
    const scanMat = new THREE.MeshBasicMaterial({ color: col(C.amber, 5), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const scanner = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.012, 4, 64), scanMat);
    scanner.rotation.x = Math.PI / 2;
    scanner.position.set(rx, 2, rz);
    for (const m of [plasma, core, aura, scanner]) {
      asFx(m);
      b.ctx.zones.addObject('engineering', m);
    }
    b.ctx.animators.push((t) => {
      scanner.position.y = 1.5 + (0.5 + 0.5 * Math.sin(t * 0.6)) * 3.4;
      const flick = 0.92 + 0.08 * Math.sin(t * 23.0) * Math.sin(t * 3.1);
      (core.material as THREE.MeshBasicMaterial).color.setRGB(0.7, 0.95, 1.0).multiplyScalar(1.8 * flick);
    });
    // Reactor lights (strong cyan, gently pulsing).
    b.light(rx, 1.8, rz - 1.8, C.cyan, 11, 13, { pulse: { speed: 0.35, min: 0.8 } });
    b.light(rx, 4.2, rz + 1.8, C.cyan, 9, 13, { pulse: { speed: 0.35, min: 0.8, phase: 0.5 } });

    // Railing around the plinth.
    const ring: [number, number][] = [];
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      ring.push([rx + Math.cos(a) * 2.75, rz + Math.sin(a) * 2.75]);
    }
    handrail(b, ring, 1.05, { posts: 1.1, color: 0xd0a030 });
    b.at(rx, 0.006, rz - 3.4, 0, () => b.sign(['RADIATION CONTROLLED AREA'], 2.6, 0.3, 0, 0, 0, { bg: null, fg: '#d6b04a', wear: 0.9 }), -Math.PI / 2);

    // ---- Coolant loops to heat exchangers and the engine feed. ----
    for (const s of [-1, 1]) {
      const hxZ = s < 0 ? rz : 26.4;
      const loop = [V(rx + s * 1.2, 5.45, rz), V(s * 4.6, 5.45, rz)];
      if (hxZ !== rz) loop.push(V(s * 4.6, 5.45, hxZ));
      loop.push(V(s * 4.6, 1.8, hxZ));
      b.pipe(b.M.painted, loop, 0.22, { color: 0xb05a1e, flangeEvery: 1.4 });
      b.pipe(b.M.painted, [V(rx + s * 0.5, 5.6, rz + 0.8), V(rx + s * 0.5, 5.6, za - 0.3)], 0.2, { color: 0x6a7076, flangeEvery: 1.2 });
      // Heat exchanger block.
      b.at(s * 5.2, 0, hxZ, s < 0 ? Math.PI / 2 : -Math.PI / 2, () => {
        b.box(b.M.painted, 2.2, 1.9, 1.1, 0, 0.95, 0, { color: 0x4a5058, bevel: 0.04 });
        for (let k = 0; k < 12; k++) b.box(b.M.painted, 0.04, 1.6, 1.14, -0.95 + k * 0.17, 0.95, 0, { color: 0x3a4046 });
        b.sign(['HX-' + (s < 0 ? 'A' : 'B'), 'PRIMARY COOLANT'], 0.8, 0.26, 0, 1.55, 0.56, { bg: '#1d2024', fg: '#e8c070' });
        gauge(b, -0.6, 1.2, 0.56, 0, 0.09);
        gauge(b, -0.3, 1.2, 0.56, 0, 0.09);
        valveWheel(b, 0.2, 0.6, 1.1, 0.62, 'z');
        b.solid(2.2, 1.1, 0, 0);
      });
    }

    // ---- Control stations in an arc facing the reactor. ----
    for (const [a, screens] of [
      [-0.5, [['graphs', 'cyan'], ['bars', 'amber']]],
      [0, [['schematic', 'cyan'], ['radar', 'green'], ['bars', 'cyan']]],
      [0.5, [['terminal', 'amber'], ['warning', 'red']]],
    ] as [number, [import('../../materials/screens').ScreenType, import('../../materials/screens').ScreenPalette][]][]) {
      const d = 4.4;
      const px = rx + Math.sin(a) * d;
      const pz = rz - Math.cos(a) * d;
      b.at(px, 0, pz, Math.atan2(Math.sin(a), -Math.cos(a)), () => station(b, screens.length > 2 ? 2.0 : 1.5, { screens, seed: 90 + a * 10, height: 0.84 }));
    }

    // ---- Port wall: turbine-generators. ----
    for (const z of [27.4, 34.6]) {
      b.at(x0 + 1.25, 0, z, 0, () => {
        b.box(b.M.painted, 1.8, 0.4, 3.2, 0, 0.2, 0, { color: 0x2c3034, bevel: 0.03 });
        b.cyl(b.M.painted, 0.78, 2.6, 0, 1.25, 0, { axis: 'z', seg: 32, color: 0x6a5a3a });
        for (let k = 0; k < 9; k++) b.cyl(b.M.painted, 0.84, 0.05, 0, 1.25, -1.1 + k * 0.275, { axis: 'z', seg: 32, color: 0x4a4030 });
        b.cyl(b.M.brushed, 0.5, 0.3, 0, 1.25, 1.45, { axis: 'z', seg: 24 });
        b.cyl(b.M.painted, 0.35, 0.5, 0, 1.25, -1.55, { axis: 'z', seg: 20, color: 0x2c3034 });
        b.sign(['GEN ' + (z < 30 ? '1' : '2'), '12 MW'], 0.7, 0.24, 0.8, 1.3, 0, { bg: '#1d2024', fg: '#e8c070' }, { rotY: Math.PI / 2 });
        b.pipe(b.M.painted, [V(0, 2.0, 0.6), V(0, 2.8, 0.6), V(-1.0, 2.8, 0.6)], 0.1, { color: 0x3a6aa0 });
        b.solid(1.8, 3.2, 0, 0);
      });
    }
    // ---- Starboard wall: switchgear cabinets. ----
    b.at(x1 - 0.35, 0, 32.2, -Math.PI / 2, () => {
      for (let i = 0; i < 7; i++) {
        const x = -3.0 + i * 0.86;
        b.box(b.M.painted, 0.82, 2.3, 0.6, x, 1.15, 0, { color: 0x4a5a52, bevel: 0.02 });
        b.box(b.M.painted, 0.7, 1.9, 0.01, x, 1.15, 0.305, { color: 0x3e4c46, bevel: 0.004 });
        for (let k = 0; k < 6; k++) b.glow(r.pick([C.green, C.green, C.amber, C.red]), 3, 0.04, 0.03, 0.01, x - 0.2 + (k % 3) * 0.2, 1.9 + Math.floor(k / 3) * 0.08, 0.312);
        b.box(b.M.brushed, 0.03, 0.2, 0.03, x + 0.28, 1.2, 0.32, {});
        if (i === 3) b.screen('bars', 'green', 0.5, 0.34, x, 1.45, 0.312, { seed: 0.93 });
        b.sign([`SWG-${i + 1}`], 0.3, 0.08, x, 2.15, 0.31, { bg: '#e8e2d2', fg: '#1a1a1a' });
      }
      b.solid(6.1, 0.6, 0, 0);
    });
    // ---- Aft wall: engine feed port. ----
    b.at(0, 0, za, Math.PI, () => {
      b.cyl(b.M.painted, 1.9, 0.4, 0, 3.0, 0.2, { axis: 'z', seg: 48, color: 0x33373c });
      b.geo(b.M.hazard, new THREE.TorusGeometry(1.7, 0.14, 8, 48), new THREE.Matrix4().makeTranslation(0, 3.0, 0.42), { uv: 'keep', uvRepeat: [12, 1] });
      b.cyl(b.M.painted, 1.35, 0.1, 0, 3.0, 0.45, { axis: 'z', seg: 48, color: 0x1c1e21 });
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        b.cyl(b.M.brushed, 0.06, 0.12, Math.cos(a) * 1.55, 3.0 + Math.sin(a) * 1.55, 0.45, { axis: 'z', seg: 8 });
      }
      b.glow(C.amber, 3, 0.9, 0.06, 0.02, 0, 3.0, 0.51);
      b.sign(['PLASMA CONDUIT', 'MAIN DRIVE FEED · AUTHORISED ONLY'], 3.0, 0.42, 0, 5.1, 0.02, { bg: '#b02a1a', fg: '#f4efe4' });
      b.at(0, 1.05, 0, 0, () => greebleRect(b, 12, 1.5, r, 0x4a4e52, 40, 0.18));
      for (const s of [-1, 1]) b.at(s * 4.5, 3.6, 0, 0, () => greebleRect(b, 4, 2.4, r, 0x3e4246, 18, 0.14));
    });
    b.ctx.collision.addSegment(x0, za - 0.25, x1, za - 0.25);

    // ---- Ceiling structure + lighting. ----
    for (let z = 25.5; z < 37.8; z += 2.5) b.box(b.M.painted, x1 * 2, 0.4, 0.3, 0, H - 0.2, z, { color: 0x30343a, bevel: 0.03 });
    for (const [x, z] of [[-4.6, 26.5], [4.6, 26.5], [-4.6, 36.2], [4.6, 36.2]]) ceilingLight(b, x, H - 0.4, z, { len: 1.4, color: C.cool, glow: 4, intensity: 8, distance: 9 });
    beacon(b, 'engineering', -3.2, H - 0.45, 24.6, C.red);
    beacon(b, 'engineering', 3.2, H - 0.45, 24.6, C.red);
    vent(b, 1.0, 0.4, -3.8, 4.2, 24 + SKIN, 0);
    vent(b, 1.0, 0.4, 3.8, 4.2, 24 + SKIN, 0);
    b.sign(['ENGINEERING · REACTOR ROOM'], 2.2, 0.26, 0, 3.4, 24 + SKIN + 0.001, { bg: '#1d2024', fg: '#e8c070' });
  });
}
