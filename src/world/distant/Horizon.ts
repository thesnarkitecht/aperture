/**
 * Horizon ring: layered far mountain silhouettes (40–62 km from the terrain centre) standing on
 * a low apron that extends beyond the heightmap edge, so the world never ends abruptly.
 */
import * as THREE from 'three';
import { Noise } from '../../core/noise';
import { SUN_AZIMUTH, TERRAIN_CENTER } from '../WorldConfig';
import { ColoredPart } from './geo';

const n = new Noise(5151);

function ringLayer(radius: number, base: number, amp: number, seed: number, color: THREE.Color): ColoredPart {
  const SEG = 900;
  const pos: number[] = [];
  const idx: number[] = [];
  const nor: number[] = [];
  const cx = TERRAIN_CENTER.x;
  const cz = TERRAIN_CENTER.y;
  for (let i = 0; i <= SEG; i++) {
    const th = (i / SEG) * Math.PI * 2;
    const dx = Math.sin(th);
    const dz = -Math.cos(th); // azimuth convention: from -Z towards +X
    const f = 6;
    const px = Math.cos(th) * f + seed;
    const pz = Math.sin(th) * f - seed;
    let h = n.ridged2(px, pz, 6) * 1.6 + 0.35 * n.fbm2(px * 0.4, pz * 0.4, 3);
    h = Math.max(0, h);
    h = base + amp * Math.pow(h, 1.4);
    // Keep a low gap under the sun so the sunset is never hidden.
    let dAz = Math.abs(th - SUN_AZIMUTH);
    dAz = Math.min(dAz, Math.PI * 2 - dAz);
    h *= 0.35 + 0.65 * Math.min(1, Math.max(0, (dAz - 0.04) / 0.3));
    const r = radius * (1 + 0.04 * n.noise2(px * 2, pz * 2));
    pos.push(cx + dx * r, -60, cz + dz * r);
    pos.push(cx + dx * r * 0.985, h, cz + dz * r * 0.985);
    const inward = new THREE.Vector3(-dx, 0.9, -dz).normalize();
    nor.push(inward.x, inward.y, inward.z, inward.x, inward.y, inward.z);
    if (i < SEG) {
      const a = i * 2;
      // Faces towards the centre.
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setIndex(idx);
  return { geo, color: (p) => color.clone().multiplyScalar(0.75 + 0.35 * Math.min(1, Math.max(0, p.y / (base + amp)))), kind: 1 };
}

function apron(r0: number, r1: number): ColoredPart {
  const g = new THREE.RingGeometry(r0, r1, 128, 2);
  g.deleteAttribute('uv');
  g.rotateX(-Math.PI / 2);
  g.translate(TERRAIN_CENTER.x, 25, TERRAIN_CENTER.y);
  return { geo: g, color: new THREE.Color(0.07, 0.085, 0.045), kind: 0 };
}

export function horizonParts(): ColoredPart[] {
  return [
    apron(30000, 70000),
    ringLayer(40000, 300, 2300, 1.7, new THREE.Color(0.1, 0.1, 0.08)),
    ringLayer(51000, 600, 3600, 7.3, new THREE.Color(0.12, 0.12, 0.12)),
    ringLayer(62000, 900, 5200, 13.1, new THREE.Color(0.16, 0.16, 0.18)),
  ];
}
