import * as THREE from 'three';
import { Builder, V } from '../kit';
import { C, beacon, crate, handrail } from '../props';
import { SKIN } from '../layout';
import { rng, type Rng } from '../../engine/shared';
import { createBeamMaterial } from '../../materials/fx';
import { asFx } from '../../materials/library';

const LIVERIES: [number, string, string][] = [
  [0x8a3a1e, 'KESSLER-VANCE', 'KVHU 204417'],
  [0x2a4a6a, 'TSU-OKADA ORE', 'TOOU 881203'],
  [0x3a5a3a, 'HX LOGISTICS', 'HXLU 551920'],
  [0x7a6a4a, 'CERES MINERAL', 'CMCU 330118'],
  [0x5a5e62, 'KESSLER-VANCE', 'KVHU 204952'],
  [0x9a6a1a, 'BELT FREIGHT', 'BFTU 702211'],
];

/** Corrugated freight container, 4.0 x 2.3 x 2.4, long axis along local z, doors at +z. */
function container(b: Builder, r: Rng, livery: [number, string, string]) {
  const [color, brand, code] = livery;
  const L = 4.0, W = 2.3, H = 2.4;
  const frame = new THREE.Color(color).multiplyScalar(0.55).getHex();
  // Corrugated walls and roof.
  for (const s of [-1, 1]) b.box(b.M.corrugated, 0.05, H - 0.16, L - 0.16, (s * (W - 0.05)) / 2, H / 2, 0, { color, uvScale: 2.6 });
  b.box(b.M.corrugated, W - 0.1, 0.05, L - 0.16, 0, H - 0.05, 0, { color, uvScale: 2.6, rotZ: 0 });
  b.box(b.M.corrugated, W - 0.1, H - 0.16, 0.05, 0, H / 2, -L / 2 + 0.05, { color });
  // Corner posts and rails.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) b.box(b.M.painted, 0.14, H, 0.14, (sx * (W - 0.14)) / 2, H / 2, (sz * (L - 0.14)) / 2, { color: frame, bevel: 0.015 });
  for (const y of [0.08, H - 0.08])
    for (const s of [-1, 1]) {
      b.box(b.M.painted, 0.14, 0.16, L, (s * (W - 0.14)) / 2, y, 0, { color: frame });
      b.box(b.M.painted, W, 0.16, 0.14, 0, y, (s * (L - 0.14)) / 2, { color: frame });
    }
  // Doors with locking bars.
  for (const s of [-1, 1]) {
    b.box(b.M.corrugated, W / 2 - 0.12, H - 0.3, 0.04, (s * W) / 4, H / 2, L / 2 - 0.03, { color, uvScale: 1.2 });
    for (const k of [-0.3, 0.3]) {
      const x = (s * W) / 4 + k;
      b.cyl(b.M.brushed, 0.025, H - 0.3, x, H / 2, L / 2 + 0.02, { seg: 8 });
      b.box(b.M.painted, 0.08, 0.14, 0.05, x, 1.1, L / 2 + 0.04, { color: frame });
    }
  }
  // Livery.
  b.sign([brand], 2.6, 0.42, W / 2 + 0.03, H * 0.62, 0, { bg: null, fg: '#e8e2d2', wear: 0.9 }, { rotY: Math.PI / 2 });
  b.sign([brand], 2.6, 0.42, -W / 2 - 0.03, H * 0.62, 0, { bg: null, fg: '#e8e2d2', wear: 0.9 }, { rotY: -Math.PI / 2 });
  b.sign([code, '45G1 · MAX 30480 KG'], 1.0, 0.3, -W / 4, H * 0.78, L / 2 + 0.05, { bg: null, fg: '#e8e2d2', wear: 0.7, align: 'left' });
  if (r.chance(0.5)) b.sign(['HAZMAT 5.1'], 0.3, 0.3, W / 4, 1.5, L / 2 + 0.05, { bg: '#d8a21c', fg: '#141414', border: '#141414' });
}

export function buildCargo(b: Builder) {
  const r = rng(808);
  b.inZone('cargo', () => {
    const x1 = 8 - SKIN;
    const zf = 6 + SKIN;
    const za = 24 - SKIN;
    const H = 7;

    // ---- Walls: structural columns + horizontal girts. ----
    for (let z = zf + 1.2; z < za - 0.5; z += 3.0) {
      for (const s of [-1, 1]) {
        b.box(b.M.painted, 0.3, H, 0.4, s * (x1 - 0.15), H / 2, z, { color: 0x4a4e52, bevel: 0.03 });
        b.box(b.M.hazard, 0.31, 1.2, 0.41, s * (x1 - 0.15), 0.6, z, { uvScale: 0.7 });
      }
      // Roof truss.
      b.box(b.M.painted, x1 * 2, 0.4, 0.25, 0, H - 0.3, z, { color: 0x3a3e42, bevel: 0.03 });
      for (let k = -3; k <= 3; k++) b.box(b.M.painted, 0.08, 0.6, 0.08, k * 2.2, H - 0.8, z, { color: 0x3a3e42, rotZ: k % 2 ? 0.6 : -0.6 });
    }
    for (const y of [1.8, 4.2]) for (const s of [-1, 1]) b.box(b.M.painted, 0.12, 0.2, za - zf, s * (x1 - 0.06), y, (zf + za) / 2, { color: 0x5a5e62 });

    // ---- Floor markings. ----
    for (const s of [-1, 1]) b.span(b.M.painted, s * 3.3, 0.001, zf + 0.5, s * 3.45, 0.006, za - 0.5, { color: 0xd0a030 });
    b.span(b.M.hazard, -1.3, 0.001, za - 1.4, 1.3, 0.006, za - 1.1, { uvScale: 0.7 });
    b.span(b.M.hazard, -1.4, 0.001, zf + 1.1, 1.4, 0.006, zf + 1.4, { uvScale: 0.7 });
    for (const [z, label] of [[10.5, 'BAY 1'], [17.5, 'BAY 2']] as [number, string][]) {
      b.at(-5.8, 0.007, z, Math.PI / 2, () => b.sign([label], 1.6, 0.5, 0, 0, 0, { bg: null, fg: '#d6b04a', wear: 0.9 }), -Math.PI / 2);
      b.at(5.8, 0.007, z, -Math.PI / 2, () => b.sign([label], 1.6, 0.5, 0, 0, 0, { bg: null, fg: '#d6b04a', wear: 0.9 }), -Math.PI / 2);
    }

    // ---- Containers: two rows, stacked two high. ----
    let li = 0;
    // Starboard row leaves the main cargo door clear.
    const rows: [number, [number, number][]][] = [
      [-1, [[9.2, 2], [13.8, 1], [18.6, 2]]],
      [1, [[9.0, 2], [20.3, 2]]],
    ];
    for (const [s, slots] of rows) {
      for (const [zc, stack] of slots) {
        for (let k = 0; k < stack; k++) {
          const lv = LIVERIES[li++ % LIVERIES.length];
          b.at(s * 5.45, k * 2.42, zc + r.range(-0.08, 0.08), (s < 0 ? 0 : Math.PI) + r.range(-0.02, 0.02), () => container(b, r, lv));
        }
        b.solid(2.4, 4.1, s * 5.45, zc);
      }
    }

    // ---- Crate stacks and pallets in the aisle margins. ----
    const crates: [number, number, number][] = [
      [-2.6, 16.2, 0],
      [2.7, 11.6, 0.2],
      [2.5, 20.8, -0.15],
    ];
    for (const [x, z, rot] of crates) {
      b.at(x, 0, z, rot, () => {
        b.box(b.M.painted, 1.3, 0.12, 1.3, 0, 0.06, 0, { color: 0x6a5a3a });
        crate(b, 1.2, 0.9, 1.2, r.pick([0x5a6a4a, 0x6a5a3a, 0x4a5a6a]), r, r.pick(['FRAGILE', 'KV-ORE SAMPLES', 'MED SUPPLY', 'SPARES']));
        b.at(0.05, 0.9, -0.05, 0.3, () => crate(b, 0.8, 0.6, 0.8, r.pick([0x8a3a1e, 0x3a4a5a]), r, 'THIS SIDE UP'));
        b.solid(1.4, 1.4, 0, 0);
      });
    }

    // ---- Power loader parked by bay 2. ----
    b.at(-2.4, 0, 21.0, 0.5, () => {
      const y = 0xd09a1a;
      b.box(b.M.painted, 1.2, 0.35, 1.6, 0, 0.35, 0, { color: 0x3a3e42, bevel: 0.04 });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.cyl(b.M.rubber, 0.24, 0.2, sx * 0.62, 0.24, sz * 0.55, { axis: 'x', seg: 16 });
      b.box(b.M.painted, 1.0, 1.2, 1.0, 0, 1.1, -0.2, { color: y, bevel: 0.06 });
      b.box(b.M.glass, 0.8, 0.6, 0.02, 0, 1.4, 0.31, {});
      b.box(b.M.painted, 0.8, 0.12, 0.8, 0, 1.76, -0.2, { color: 0x2a2e32, bevel: 0.03 });
      for (const sx of [-1, 1]) {
        b.box(b.M.painted, 0.12, 1.8, 0.12, sx * 0.45, 1.0, 0.6, { color: 0x3a3e42 });
        b.box(b.M.brushed, 0.12, 0.05, 1.0, sx * 0.3, 0.12, 1.1, {});
        b.rod(b.M.painted, V(sx * 0.5, 1.4, -0.1), V(sx * 0.75, 1.0, 0.5), 0.07, { color: y });
        b.box(b.M.painted, 0.18, 0.14, 0.3, sx * 0.78, 0.95, 0.62, { color: 0x3a3e42, bevel: 0.02 });
      }
      b.glow(C.amber, 5, 0.12, 0.06, 0.04, 0.35, 1.84, 0.12);
      b.sign(['LOADER 2'], 0.5, 0.12, 0, 0.9, 0.305, { bg: null, fg: '#1a1a1a' });
      b.solid(1.6, 2.4, 0, 0.2);
    });

    // ---- Catwalks along both walls at 3.6 m (visual). ----
    const cy = 3.6;
    for (const s of [-1, 1]) {
      const xin = s * (x1 - 1.1);
      b.span(b.M.grate, s * (x1 - 0.2), cy - 0.04, zf + 0.3, xin, cy, za - 0.3, { uvScale: 1 });
      b.span(b.M.painted, xin - s * 0.03, cy - 0.2, zf + 0.3, xin, cy, za - 0.3, { color: 0x4a4e52 });
      b.at(0, cy, 0, 0, () => handrail(b, [[xin, zf + 0.3], [xin, za - 0.3]], 1.0, { posts: 1.5 }));
      for (let z = zf + 1.2; z < za - 0.5; z += 3.0) b.rod(b.M.painted, V(xin, cy - 0.2, z), V(s * (x1 - 0.3), cy - 1.0, z), 0.04, { color: 0x3a3e42 });
    }

    // Ladder up to the port catwalk.
    for (const s of [-1, 1]) b.box(b.M.painted, 0.05, cy + 1, 0.05, -x1 + 0.1, (cy + 1) / 2, 7.2 + s * 0.22, { color: 0xd0a030 });
    for (let k = 0; k < 14; k++) b.box(b.M.painted, 0.04, 0.03, 0.44, -x1 + 0.1, 0.3 + k * 0.3, 7.2, { color: 0xd0a030 });

    // ---- Gantry crane. ----
    const railY = 6.2;
    for (const s of [-1, 1]) {
      b.box(b.M.painted, 0.3, 0.35, za - zf, s * 5.3, railY, (zf + za) / 2, { color: 0xb07a1a, bevel: 0.03 });
    }
    const craneZ = 14.8;
    b.box(b.M.painted, 11.0, 0.55, 0.5, 0, railY - 0.45, craneZ, { color: 0xd09a1a, bevel: 0.04 });
    b.box(b.M.hazard, 11.02, 0.2, 0.51, 0, railY - 0.2, craneZ, { uvScale: 1.2 });
    for (const s of [-1, 1]) b.box(b.M.painted, 0.8, 0.5, 1.0, s * 5.3, railY - 0.35, craneZ, { color: 0x3a3e42, bevel: 0.04 });
    // Trolley + hook (hook sways gently).
    b.box(b.M.painted, 1.0, 0.5, 0.8, 1.2, railY - 0.95, craneZ, { color: 0x3a3e42, bevel: 0.04 });
    b.glow(C.amber, 4, 0.1, 0.06, 0.06, 1.2, railY - 1.23, craneZ + 0.3);
    const hook = new THREE.Group();
    const hookPivot = b.world(1.2, railY - 1.2, craneZ);
    hook.position.copy(hookPivot);
    const cableMat = b.M.painted;
    for (const s of [-1, 1]) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.4, 6), cableMat);
      cable.position.set(s * 0.12, -1.2, 0);
      hook.add(cable);
    }
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), b.M.painted);
    block.position.y = -2.6;
    const hk = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 16, Math.PI * 1.5), b.M.painted);
    hk.position.y = -3.0;
    hook.add(block, hk);
    colorize(hook, 0xd09a1a);
    b.ctx.zones.addObject('cargo', hook);
    b.ctx.animators.push((t) => {
      hook.rotation.z = Math.sin(t * 0.7) * 0.025;
      hook.rotation.x = Math.sin(t * 0.53 + 1) * 0.02;
    });

    // ---- Main cargo door (starboard wall). ----
    b.at(x1, 0, 15.0, -Math.PI / 2, () => {
      const W = 5.4, DH = 5.0;
      b.box(b.M.painted, W + 0.8, 0.5, 0.25, 0, DH + 0.25, 0.12, { color: 0x3a3e42, bevel: 0.04 });
      for (const s of [-1, 1]) b.box(b.M.hazard, 0.4, DH, 0.26, (s * (W + 0.4)) / 2, DH / 2, 0.13, { uvScale: 1 });
      for (let k = 0; k < 20; k++) b.box(b.M.painted, W, DH / 20 - 0.02, 0.08, 0, (k + 0.5) * (DH / 20), 0.06, { color: k % 5 === 0 ? 0x6a6e72 : 0x7a7e82, bevel: 0.01 });
      b.sign(['CARGO DOOR 1', 'DEPRESSURISE HOLD BEFORE OPENING'], 2.4, 0.4, 0, 3.6, 0.105, { bg: '#b02a1a', fg: '#f4efe4' });
      b.box(b.M.painted, 0.5, 0.8, 0.12, W / 2 + 0.9, 1.4, 0.06, { color: 0x2c3034, bevel: 0.015 });
      b.screen('warning', 'amber', 0.36, 0.24, W / 2 + 0.9, 1.55, 0.125, { seed: 0.61 });
    });
    beacon(b, 'cargo', x1 - 0.2, 5.6, 12.0);
    beacon(b, 'cargo', x1 - 0.2, 5.6, 18.0);

    // ---- Lighting: sodium floods with volumetric beams. ----
    const floods: [number, number][] = [
      [-1, 9.5],
      [1, 9.5],
      [-1, 15.5],
      [1, 15.5],
      [-1, 21.0],
      [1, 21.0],
    ];
    const beamMat = createBeamMaterial(new THREE.Color(1.0, 0.72, 0.4), 0.16);
    for (const [s, z] of floods) {
      const x = s * 2.4;
      b.at(x, H - 0.55, z, 0, () => {
        b.box(b.M.painted, 0.9, 0.25, 0.5, 0, 0, 0, { color: 0x2a2e32, bevel: 0.03 });
        b.glow(C.sodium, 7, 0.8, 0.02, 0.4, 0, -0.13, 0);
      });
      b.light(x, H - 1.2, z, C.sodium, 30, 14);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 2.2, 5.6, 32, 1, true), beamMat);
      beam.position.copy(b.world(x, H - 0.7 - 2.8, z));
      asFx(beam);
      b.ctx.zones.addObject('cargo', beam);
    }
    for (const s of [-1, 1]) for (const z of [8, 14, 20]) b.light(s * (x1 - 1.1), cy - 0.5, z, C.warm, 3, 5);
  });
}

function colorize(obj: THREE.Object3D, hex: number) {
  const c = new THREE.Color(hex);
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const n = m.geometry.getAttribute('position').count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    m.geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  });
}
