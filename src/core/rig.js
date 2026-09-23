// The explode rig. Every movable part registers one or more "tracks": an
// offset (and optional rotation) in its parent's space, scaled by the weight
// of a named group. Group weights are keyframed against scroll progress.
import * as THREE from 'three';

export class Rig {
  constructor() {
    this.entries = new Map();
    this.anchors = [];
    this.float = [];
  }

  // offset in mm (parent space), rot in radians
  add(obj, group, offset = [0, 0, 0], rot = [0, 0, 0]) {
    let e = this.entries.get(obj);
    if (!e) {
      e = { obj, basePos: obj.position.clone(), baseRot: obj.rotation.clone(), tracks: [] };
      this.entries.set(obj, e);
    }
    e.tracks.push({ group, off: new THREE.Vector3(...offset), rot: new THREE.Vector3(...rot) });
    return obj;
  }

  // Top-level parts drift gently while exploded, so the breakdown feels alive.
  floaty(obj, amp = 1.2, speed = 0.6) {
    this.float.push({ obj, amp, speed, phase: Math.random() * Math.PI * 2 });
  }

  anchor(parent, id, pos = [0, 0, 0]) {
    const a = new THREE.Object3D();
    a.position.set(...pos);
    a.name = `anchor:${id}`;
    parent.add(a);
    this.anchors.push({ id, obj: a });
    return a;
  }

  update(weights, spread, time, floatAmt) {
    const tmp = new THREE.Vector3();
    for (const e of this.entries.values()) {
      const p = e.obj.position.copy(e.basePos);
      const r = e.obj.rotation;
      r.copy(e.baseRot);
      for (const t of e.tracks) {
        const w = (weights[t.group] ?? 0) * spread;
        if (w === 0) continue;
        p.addScaledVector(t.off, w);
        r.x += t.rot.x * w;
        r.y += t.rot.y * w;
        r.z += t.rot.z * w;
      }
    }
    if (floatAmt > 0.001) {
      for (const f of this.float) {
        tmp.set(
          Math.sin(time * f.speed + f.phase) * 0.35,
          Math.sin(time * f.speed * 1.3 + f.phase * 2.1),
          Math.cos(time * f.speed * 0.9 + f.phase) * 0.35,
        );
        f.obj.position.addScaledVector(tmp, f.amp * floatAmt);
      }
    }
  }
}

// Piecewise-smoothstep keyframes: [[s, value], ...]
export function keyed(keys) {
  return (s) => {
    if (s <= keys[0][0]) return keys[0][1];
    for (let i = 0; i < keys.length - 1; i++) {
      const [s0, v0] = keys[i], [s1, v1] = keys[i + 1];
      if (s <= s1) {
        const t = (s - s0) / (s1 - s0 || 1);
        const e = t * t * (3 - 2 * t);
        return v0 + (v1 - v0) * e;
      }
    }
    return keys[keys.length - 1][1];
  };
}
