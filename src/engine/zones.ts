import * as THREE from 'three';
import { pointInPoly } from '../player/collision';

export interface ZoneDef {
  id: string;
  label: string;
  deck: string;
  poly: [number, number][];
  floorY: number;
  ceilY: number;
  /** Hemisphere fill light (linear hex colors) and intensity. */
  ambient: { sky: number; ground: number; intensity: number };
  exposure: number;
  /** Exponential fog density (interior haze). */
  fog: number;
  fogColor: number;
  /** Reflection probe position. */
  probe: [number, number, number];
  /** Zone has windows to space, so the exterior is visible from it. */
  windows?: boolean;
  envIntensity?: number;
}

export interface Zone extends ZoneDef {
  group: THREE.Group;
  env: THREE.Texture | null;
}

interface Link {
  a: string;
  b: string;
  open: () => number;
}

export const EXTERIOR = 'exterior';

/**
 * Rooms are zones. Each zone owns a scene group; only zones potentially
 * visible from the camera's zone (through open doors and windows) render.
 */
export class Zones {
  readonly root = new THREE.Group();
  readonly map = new Map<string, Zone>();
  private links: Link[] = [];
  private weights = new Map<string, number>();

  constructor() {
    this.root.name = 'zones';
    this.add({
      id: EXTERIOR,
      label: 'Exterior',
      deck: 'Hull',
      poly: [],
      floorY: -1e9,
      ceilY: 1e9,
      ambient: { sky: 0x141820, ground: 0x4a6a90, intensity: 0.55 },
      exposure: 0.9,
      fog: 0,
      fogColor: 0x000000,
      probe: [0, 4, 0],
      windows: true,
      envIntensity: 1,
    });
  }

  add(def: ZoneDef) {
    const group = new THREE.Group();
    group.name = `zone:${def.id}`;
    this.root.add(group);
    const zone: Zone = { ...def, group, env: null };
    this.map.set(def.id, zone);
    return zone;
  }

  get(id: string) {
    const z = this.map.get(id);
    if (!z) throw new Error(`Unknown zone ${id}`);
    return z;
  }

  link(a: string, b: string, open: () => number) {
    this.links.push({ a, b, open });
  }

  addObject(zone: string, obj: THREE.Object3D) {
    this.get(zone).group.add(obj);
  }

  /** Interior zone containing p, or 'exterior'. */
  locate(p: THREE.Vector3) {
    for (const z of this.map.values()) {
      if (z.id === EXTERIOR) continue;
      if (p.y < z.floorY - 0.5 || p.y > z.ceilY + 0.3) continue;
      if (pointInPoly(p.x, p.z, z.poly)) return z.id;
    }
    return EXTERIOR;
  }

  /** Visibility weights (0..1) of every zone as seen from `current`. */
  computeWeights(current: string) {
    const w = this.weights;
    w.clear();
    w.set(current, 1);
    let frontier = [current];
    for (let depth = 0; depth < 2; depth++) {
      const next: string[] = [];
      for (const id of frontier) {
        const base = w.get(id) ?? 0;
        for (const l of this.links) {
          const other = l.a === id ? l.b : l.b === id ? l.a : null;
          if (!other) continue;
          const o = l.open();
          if (o <= 0.001) continue;
          const val = base * Math.min(1, 0.35 + o) * 0.85;
          if (val > (w.get(other) ?? 0)) {
            w.set(other, val);
            next.push(other);
          }
        }
      }
      frontier = next;
    }
    // Space and the hull are visible through any window of any visible zone.
    let throughWindow = 0;
    for (const [id, v] of w) if (id !== EXTERIOR && this.get(id).windows) throughWindow = Math.max(throughWindow, v);
    if (throughWindow > 0) w.set(EXTERIOR, Math.max(w.get(EXTERIOR) ?? 0, throughWindow * 0.6));
    // From outside, rooms with windows are visible.
    if (current === EXTERIOR) for (const z of this.map.values()) if (z.windows && z.id !== EXTERIOR) w.set(z.id, Math.max(w.get(z.id) ?? 0, 0.3));
    return w;
  }

  applyVisibility(weights: Map<string, number>) {
    for (const z of this.map.values()) z.group.visible = (weights.get(z.id) ?? 0) > 0;
  }

  showAll() {
    for (const z of this.map.values()) z.group.visible = true;
  }
}
