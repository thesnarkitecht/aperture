import * as THREE from 'three';
import { noise1 } from './shared';

export interface LightDef {
  pos: THREE.Vector3;
  color: THREE.Color;
  /** Candela (three.js physical units). */
  intensity: number;
  /** Cutoff distance in meters. */
  distance: number;
  zone: string;
  /** 0..1, amount of random electrical flicker. */
  flicker?: number;
  /** Periodic pulse (e.g. rotating beacons): intensity oscillates between min..1 at `speed` Hz. */
  pulse?: { speed: number; min: number; phase?: number };
  /** Optional emissive material whose color follows this light's modulation. */
  glow?: { material: THREE.MeshBasicMaterial; base: THREE.Color };
  id?: number;
}

interface Slot {
  light: THREE.PointLight;
  def: LightDef | null;
  fade: number;
}

/**
 * The ship has well over a hundred light fixtures. Forward rendering them all
 * would be far too slow, so a fixed pool of point lights is re-assigned every
 * frame to the fixtures that matter most for the current viewpoint. Slots fade
 * in and out so reassignment never pops, and the light count stays constant
 * so shaders are never recompiled.
 */
export class LightPool {
  readonly defs: LightDef[] = [];
  private slots: Slot[] = [];
  private group = new THREE.Group();
  private scores: { def: LightDef; score: number }[] = [];

  constructor(scene: THREE.Scene, count: number) {
    this.group.name = 'light-pool';
    scene.add(this.group);
    this.setCount(count);
  }

  add(def: LightDef) {
    def.id = this.defs.length;
    this.defs.push(def);
    return def;
  }

  get count() {
    return this.slots.length;
  }

  setCount(count: number) {
    for (const s of this.slots) {
      this.group.remove(s.light);
      s.light.dispose();
    }
    this.slots = [];
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      light.castShadow = false;
      this.group.add(light);
      this.slots.push({ light, def: null, fade: 0 });
    }
  }

  private modulation(def: LightDef, time: number) {
    let m = 1;
    if (def.flicker) {
      const n = noise1(time * 9 + (def.id ?? 0) * 13.7);
      const n2 = noise1(time * 31 + (def.id ?? 0) * 3.1);
      m *= 1 - def.flicker * (n > 0.72 ? 0.85 * n2 : 0.08 * n2);
    }
    if (def.pulse) {
      const s = 0.5 + 0.5 * Math.sin((time * def.pulse.speed + (def.pulse.phase ?? 0)) * Math.PI * 2);
      m *= def.pulse.min + (1 - def.pulse.min) * Math.pow(s, 3);
    }
    return m;
  }

  /**
   * @param eye camera position
   * @param weightOf visibility weight for a zone (0 = not visible)
   * @param dt seconds since last update; pass Infinity to snap instantly
   */
  update(eye: THREE.Vector3, weightOf: (zone: string) => number, dt: number, time: number) {
    const scores = this.scores;
    scores.length = 0;
    for (const def of this.defs) {
      const w = weightOf(def.zone);
      if (w <= 0) continue;
      const d2 = def.pos.distanceToSquared(eye);
      const reach = def.distance + 3;
      if (d2 > reach * reach) continue;
      scores.push({ def, score: (w * def.intensity) / (d2 + 4) });
    }
    scores.sort((a, b) => b.score - a.score);
    const wanted = new Set<LightDef>();
    for (let i = 0; i < Math.min(scores.length, this.slots.length); i++) wanted.add(scores[i].def);

    const rate = Number.isFinite(dt) ? dt * 5 : 1;
    // Fade out slots whose light is no longer wanted.
    for (const s of this.slots) {
      if (s.def && !wanted.has(s.def)) {
        s.fade -= rate;
        if (s.fade <= 0) {
          s.fade = 0;
          s.def = null;
        }
      }
    }
    // Assign newly wanted lights to free slots.
    const assigned = new Set<LightDef>();
    for (const s of this.slots) if (s.def) assigned.add(s.def);
    for (const def of wanted) {
      if (assigned.has(def)) continue;
      let slot = this.slots.find((s) => !s.def);
      if (!slot) {
        // Steal the weakest fading slot if nothing is free.
        slot = this.slots
          .filter((s) => s.def && !wanted.has(s.def))
          .sort((a, b) => a.fade - b.fade)[0];
        if (!slot) continue;
      }
      slot.def = def;
      slot.fade = Number.isFinite(dt) ? 0 : 1;
      assigned.add(def);
    }
    for (const s of this.slots) {
      const def = s.def;
      if (def && wanted.has(def)) s.fade = Math.min(1, s.fade + rate);
      if (!def) {
        s.light.intensity = 0;
        continue;
      }
      const m = this.modulation(def, time);
      s.light.position.copy(def.pos);
      s.light.color.copy(def.color);
      s.light.distance = def.distance;
      s.light.intensity = def.intensity * s.fade * m;
    }
    // Emissive fixtures that track their light's flicker/pulse.
    for (const def of this.defs) {
      if (!def.glow) continue;
      def.glow.material.color.copy(def.glow.base).multiplyScalar(this.modulation(def, time));
    }
  }
}
