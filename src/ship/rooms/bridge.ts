import * as THREE from 'three';
import { Builder, V, col } from '../kit';
import { C, buttonPanel, chair, console as station, locker, toggleRow, vent } from '../props';
import { HULL, HULL_BOTTOM, SKIN } from '../layout';
import { polySlab } from '../structure';
import { rng } from '../../engine/shared';
import { createBeamMaterial, createHologramMaterial } from '../../materials/fx';
import { asFx } from '../../materials/library';

const FRONT_Z = -28.5;
const SILL_Y = 0.9;
const TOP_Y = 3.3;
const TOP_Z = -26.6;
const halfWidthAt = (z: number) => 4.5 + ((z - FRONT_Z) / 10.5) * 2;

/** Position + yaw on the angled side wall: t in meters from the rear corner, inset from the wall face. */
function onSideWall(side: -1 | 1, t: number, inset: number) {
  const ax = 6.5 * side, az = -18, bx = 4.5 * side, bz = FRONT_Z;
  const len = Math.hypot(bx - ax, bz - az);
  const dx = (bx - ax) / len, dz = (bz - az) / len;
  // Inward normal.
  let nx = -dz, nz = dx;
  if (nx * -side < 0) {
    nx = -nx;
    nz = -nz;
  }
  const d = SKIN + inset;
  return { x: ax + dx * t + nx * d, z: az + dz * t + nz * d, yaw: Math.atan2(nx, nz) };
}

export function buildBridge(b: Builder) {
  const r = rng(202);
  b.inZone('bridge', () => {
    // ---- Raked forward window. ----
    const xb = halfWidthAt(FRONT_Z) - SKIN;
    const xt = halfWidthAt(TOP_Z) - SKIN;
    const zb = FRONT_Z + 0.1;
    const glass = new THREE.BufferGeometry();
    glass.setAttribute('position', new THREE.Float32BufferAttribute([-xb, SILL_Y, zb, xb, SILL_Y, zb, xt, TOP_Y, TOP_Z, -xt, TOP_Y, TOP_Z], 3));
    glass.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    glass.setIndex([0, 1, 2, 0, 2, 3]);
    glass.computeVertexNormals();
    b.geo(b.M.glass, glass, new THREE.Matrix4(), { uv: 'keep' });

    const slopeLen = Math.hypot(TOP_Z - zb, TOP_Y - SILL_Y);
    const tilt = Math.atan2(TOP_Z - zb, TOP_Y - SILL_Y);
    const midY = (SILL_Y + TOP_Y) / 2;
    const midZ = (zb + TOP_Z) / 2;
    const mullions = [-0.6, -0.2, 0.2, 0.6];
    for (const f of [...mullions, -1, 1]) {
      const x = f * (xb + xt) * 0.5;
      const w = Math.abs(f) === 1 ? 0.22 : 0.1;
      b.box(b.M.painted, w, slopeLen + 0.1, 0.14, x, midY, midZ, { color: 0x2a2e33, bevel: 0.02, rotX: tilt });
      // Exterior cap on each mullion.
      b.inZone('exterior', () => b.box(b.M.hull, w + 0.04, slopeLen + 0.12, 0.1, x, midY + 0.05, midZ - 0.09, { color: 0x5a5c5e, bevel: 0.02, rotX: tilt }));
    }
    // Sill + header.
    b.box(b.M.painted, xb * 2 + 0.3, 0.12, 0.5, 0, SILL_Y - 0.06, zb + 0.14, { color: 0x2a2e33, bevel: 0.02 });
    b.box(b.M.painted, xt * 2 + 0.3, 0.16, 0.2, 0, TOP_Y - 0.06, TOP_Z + 0.02, { color: 0x2a2e33, bevel: 0.02 });
    // Low wall under the window (interior skin + hull).
    b.span(b.M.panel, -xb - 0.2, 0, FRONT_Z, xb + 0.2, SILL_Y, FRONT_Z + SKIN, { color: 0x5a6066 });
    b.ctx.collision.addSegment(-xb, FRONT_Z + 0.55, xb, FRONT_Z + 0.55);
    b.inZone('exterior', () => {
      b.span(b.M.hull, -4.5 - HULL, HULL_BOTTOM, FRONT_Z - HULL, 4.5 + HULL, SILL_Y, FRONT_Z, { color: 0xc9c6bc });
      // Visor fascia between window head and roof, and a chin plate.
      b.span(b.M.hull, -halfWidthAt(TOP_Z), TOP_Y, TOP_Z - 0.1, halfWidthAt(TOP_Z), 3.72, TOP_Z + 0.06, { color: 0x8a8880 });
      b.box(b.M.hull, 9.6, 0.24, 1.2, 0, SILL_Y - 0.12, FRONT_Z - 0.55, { color: 0x8c8a84, bevel: 0.05, rotX: -0.25 });
    });

    // ---- Floor runner, ceiling, trim. ----
    polySlab(b, [[-6.5, -18], [6.5, -18], [halfWidthAt(TOP_Z), TOP_Z], [-halfWidthAt(TOP_Z), TOP_Z]], TOP_Y, TOP_Y + 0.1, b.M.panel, 0x4a5056);
    b.span(b.M.rubber, -0.7, 0, -26.0, 0.7, 0.012, -18.2, { color: 0x2a2826 });
    for (const s of [-1, 1]) {
      b.span(b.M.painted, s * 0.7, 0, -26.0, s * 0.74, 0.016, -18.2, { color: 0xc8961e });
    }
    // Ceiling ribs across the room with recessed light panels between them.
    for (const z of [-25.6, -23.2, -20.8, -18.6]) {
      const hw = halfWidthAt(z) - SKIN;
      b.box(b.M.painted, hw * 2, 0.22, 0.26, 0, TOP_Y - 0.11, z, { color: 0x30343a, bevel: 0.03 });
    }
    for (const [x, z] of [[-2.3, -24.4], [2.3, -24.4], [-2.6, -19.7], [2.6, -19.7]]) {
      b.box(b.M.painted, 1.3, 0.05, 0.9, x, TOP_Y - 0.02, z, { color: 0x202326 });
      b.glow(C.warm, 2.4, 1.1, 0.01, 0.7, x, TOP_Y - 0.05, z);
      b.light(x, TOP_Y - 0.4, z, C.warm, 4.2, 6.5);
    }
    // Red floor-edge accent lighting along the side walls.
    for (const s of [-1, 1] as const) {
      const a = onSideWall(s, 0.2, 0.02);
      const c = onSideWall(s, 10.4, 0.02);
      const len = Math.hypot(c.x - a.x, c.z - a.z);
      b.at((a.x + c.x) / 2, 0.06, (a.z + c.z) / 2, a.yaw, () => {
        b.box(b.M.painted, len, 0.12, 0.04, 0, 0, 0.02, { color: 0x202326 });
        b.glow(C.red, 2.5, len - 0.1, 0.02, 0.01, 0, 0.02, 0.045);
      });
    }

    // ---- Pilot stations. ----
    for (const s of [-1, 1]) {
      // Console operator side (+z local) faces the pilot seat.
      b.at(s * 1.55, 0, -27.3, 0, () => {
        station(b, 1.7, {
          screens: s < 0 ? [['radar', 'green'], ['graphs', 'cyan']] : [['orbit', 'cyan'], ['bars', 'amber']],
          seed: 11 + s,
          height: 0.78,
          back: true,
        });
      });
      b.at(s * 1.55, 0, -26.0, Math.PI, () => chair(b, { pilot: true, color: 0x4a3a2c }));
      // Flight stick + throttle quadrant.
      b.rod(b.M.painted, V(s * 1.55 + s * 0.3, 0.72, -26.2), V(s * 1.55 + s * 0.3, 0.9, -26.25), 0.02, { color: C.dark });
      b.sphere(b.M.rubber, 0.035, s * 1.55 + s * 0.3, 0.92, -26.26, {});
    }
    // Centre pedestal with throttles.
    b.box(b.M.painted, 0.5, 0.8, 1.0, 0, 0.4, -26.6, { color: 0x3a3f44, bevel: 0.03 });
    b.at(0, 0.82, -26.6, 0, () => {
      b.box(b.M.painted, 0.46, 0.04, 0.9, 0, 0, 0, { color: 0x24272a, bevel: 0.01 });
      for (let i = 0; i < 4; i++) {
        b.rod(b.M.brushed, V(-0.15 + i * 0.1, 0.02, 0.05 - i * 0.06), V(-0.15 + i * 0.1, 0.18, -0.02 - i * 0.06), 0.012, { seg: 6 });
        b.box(b.M.plastic, 0.07, 0.04, 0.05, -0.15 + i * 0.1, 0.19, -0.03 - i * 0.06, { color: i < 2 ? 0x2a2a2a : 0x8a2a1a });
      }
      b.at(0, 0.03, 0.3, 0, () => buttonPanel(b, 0.4, 0.22, 6, 3, r), -Math.PI / 2 + 0.2);
    });
    b.solid(0.5, 1.0, 0, -26.6);
    // Overhead switch panel hanging above the pilots.
    b.at(0, TOP_Y - 0.1, -25.9, 0, () => {
      b.box(b.M.painted, 2.6, 0.08, 0.7, 0, -0.04, 0, { color: 0x2b2f33, bevel: 0.02, rotX: 0.35 });
      b.at(0, -0.1, 0, 0, () => {
        for (let i = -1; i <= 1; i++) b.at(i * 0.85, 0, 0, 0, () => buttonPanel(b, 0.7, 0.5, 8, 5, r, 0.3));
        b.at(0, 0, 0.3, 0, () => toggleRow(b, 2.2, 22, r));
      }, Math.PI / 2 + 0.35);
    });

    // ---- Captain's dais and chair. ----
    b.cyl(b.M.tread, 1.35, 0.2, 0, 0.1, -23.2, { seg: 40, color: 0x8a8a84 });
    b.geo(b.M.glow, new THREE.TorusGeometry(1.35, 0.012, 4, 64), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.19, -23.2), { color: col(C.amber, 2.2) });
    b.ctx.collision.addFloor({ circle: { x: 0, z: -23.2, r: 1.35 }, y: 0.2 });
    b.at(0, 0.2, -23.2, Math.PI, () => {
      chair(b, { pilot: true, color: 0x5a3020 });
      // Arm consoles.
      for (const s of [-1, 1]) {
        b.box(b.M.painted, 0.14, 0.12, 0.5, s * 0.42, 0.68, 0.05, { color: 0x2a2e33, bevel: 0.02 });
        b.screen('terminal', 'amber', 0.12, 0.18, s * 0.42, 0.75, 0.2, { tilt: 1.2, seed: 0.4 + s * 0.1 });
      }
    });

    // ---- Holo table. ----
    const hz = -20.4;
    b.cyl(b.M.painted, 0.55, 0.85, 0, 0.425, hz, { color: 0x30343a, seg: 32, rTop: 0.7 });
    b.cyl(b.M.painted, 0.95, 0.08, 0, 0.9, hz, { color: 0x2a2e33, seg: 48 });
    b.cyl(b.M.brushed, 0.98, 0.03, 0, 0.955, hz, { seg: 48 });
    b.cyl(b.M.glow, 0.72, 0.01, 0, 0.945, hz, { color: col(C.cyan, 0.35), seg: 48 });
    b.geo(b.M.glow, new THREE.TorusGeometry(0.86, 0.01, 4, 64), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0.97, hz), { color: col(C.cyan, 4) });
    b.solidCircle(1.0, 0, hz);
    b.light(0, 1.5, hz, C.cyan, 1.6, 4.0, { flicker: 0.08 });
    // Hologram: rotating planet + orbit ring + projector beam.
    const holoMat = createHologramMaterial(new THREE.Color(0.35, 0.85, 1.0), 0.9);
    const holo = new THREE.Group();
    holo.position.set(0, 1.62, hz);
    const planet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 40, 24), holoMat);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.004, 4, 96), holoMat);
    ring.rotation.x = Math.PI / 2 - 0.3;
    const moon = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 8), holoMat);
    const shipMarker = new THREE.Mesh(new THREE.OctahedronGeometry(0.03), holoMat);
    holo.add(planet, ring, moon, shipMarker);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.65, 40, 1, true), createBeamMaterial(new THREE.Color(0.3, 0.8, 1.0), 0.12));
    beam.position.set(0, 1.28, hz);
    asFx(holo);
    asFx(beam);
    b.ctx.zones.addObject('bridge', holo);
    b.ctx.zones.addObject('bridge', beam);
    b.ctx.animators.push((t) => {
      planet.rotation.y = t * 0.25;
      ring.rotation.z = t * 0.1;
      const a = t * 0.6;
      moon.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55 * Math.sin(0.3), Math.sin(a) * 0.55 * Math.cos(0.3));
      const s2 = t * 1.3;
      shipMarker.position.set(Math.cos(s2) * 0.42, 0.05, Math.sin(s2) * 0.42);
      shipMarker.rotation.y = -s2;
    });

    // ---- Side stations along the angled walls (clear of the side windows). ----
    for (const s of [-1, 1] as const) {
      for (const [t, screens] of [
        [0.95, s < 0 ? [['schematic', 'amber'], ['terminal', 'amber']] : [['bars', 'green'], ['graphs', 'green']]],
        [8.55, s < 0 ? [['graphs', 'cyan']] : [['radar', 'cyan']]],
      ] as [number, [import('../../materials/screens').ScreenType, import('../../materials/screens').ScreenPalette][]][]) {
        const p = onSideWall(s, t, 0.42);
        b.at(p.x, 0, p.z, p.yaw, () => {
          station(b, t < 5 ? 1.4 : 1.1, { screens, seed: 30 + t * s, height: 0.8 });
          b.at(0, 0, 0.75, Math.PI, () => chair(b, { color: 0x3a3a3a }));
        });
      }
      // Low storage under the side window with a status strip.
      const p = onSideWall(s, 4.6, 0.25);
      b.at(p.x, 0, p.z, p.yaw, () => {
        b.box(b.M.painted, 4.6, 0.62, 0.5, 0, 0.31, 0, { color: 0x3d4247, bevel: 0.02 });
        b.box(b.M.painted, 4.64, 0.05, 0.54, 0, 0.64, 0, { color: 0x24272a, bevel: 0.01 });
        for (let i = 0; i < 6; i++) b.box(b.M.painted, 0.7, 0.4, 0.01, -1.9 + i * 0.76, 0.3, 0.255, { color: 0x353a3f, bevel: 0.004 });
        b.glow(C.cyan, 1.6, 4.4, 0.012, 0.01, 0, 0.6, 0.26);
        b.solid(4.6, 0.5, 0, 0);
      });
    }

    // ---- Rear bulkhead: big displays, lockers, vents. ----
    const rz = -18 - SKIN;
    for (const s of [-1, 1]) {
      b.at(s * 3.2, 0, rz, Math.PI, () => {
        b.box(b.M.painted, 2.6, 1.5, 0.08, 0, 1.75, 0.04, { color: 0x24272a, bevel: 0.02 });
        b.screen(s < 0 ? 'schematic' : 'orbit', s < 0 ? 'amber' : 'cyan', 2.4, 1.3, 0, 1.75, 0.09, { seed: 0.7 + s * 0.2 });
        b.sign([s < 0 ? 'SHIP STATUS' : 'NAVIGATION'], 1.2, 0.14, 0, 2.62, 0.05, { bg: '#1d2024', fg: '#e8c070', wear: 0.3 });
      });
      b.at(s * 5.4, 0, rz - 0.3, Math.PI, () => {
        locker(b, 0.6, 2.0, 0.5, 0x4a5058, r, 'EVA-2');
      });
      vent(b, 0.6, 0.3, s * 1.6, 2.7, rz - 0.01, Math.PI);
    }
    b.solid(1.2, 0.6, 5.4, rz - 0.3);
    b.solid(1.2, 0.6, -5.4, rz - 0.3);
    // Ship's name plate by the door.
    b.at(0, 2.75, rz - 0.01, Math.PI, () => {
      b.box(b.M.brushed, 2.0, 0.26, 0.02, 0, 0, 0.01, {});
      b.sign(['CSV PERIHELION  ·  HX-7061'], 1.9, 0.18, 0, 0, 0.022, { bg: null, fg: '#1a1a1a', wear: 0.2 });
    });

    // Console glow spill (cyan) near the pilots.
    for (const s of [-1, 1]) b.light(s * 1.55, 1.15, -26.9, C.cyan, 1.6, 3.2);
  });
}
