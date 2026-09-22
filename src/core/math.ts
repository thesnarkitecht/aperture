/**
 * Small, allocation-free math helpers shared by the simulation, animation and camera code.
 */
import * as THREE from 'three';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);
export const saturate = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number): number => (a === b ? 0 : (x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number): number =>
  c + (d - c) * saturate(invLerp(a, b, x));

export function smoothstep(a: number, b: number, x: number): number {
  const t = saturate((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export function smootherstep(a: number, b: number, x: number): number {
  const t = saturate((x - a) / (b - a));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Frame-rate independent exponential approach. `rate` is 1/seconds. */
export const damp = (a: number, b: number, rate: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-rate * dt));

export function dampVec3(a: THREE.Vector3, b: THREE.Vector3, rate: number, dt: number): THREE.Vector3 {
  return a.lerp(b, 1 - Math.exp(-rate * dt));
}

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export const angleDelta = (from: number, to: number): number => wrapAngle(to - from);
export const dampAngle = (a: number, b: number, rate: number, dt: number): number =>
  a + angleDelta(a, b) * (1 - Math.exp(-rate * dt));

/**
 * Critically damped spring (a.k.a. SmoothDamp). Keeps its own velocity so it is
 * continuous in both value and derivative — ideal for camera follow and procedural leans.
 */
export class Spring {
  value: number;
  velocity = 0;
  constructor(value = 0, public smoothTime = 0.2) {
    this.value = value;
  }
  update(target: number, dt: number, smoothTime = this.smoothTime): number {
    const omega = 2 / Math.max(1e-4, smoothTime);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = this.value - target;
    const temp = (this.velocity + omega * change) * dt;
    this.velocity = (this.velocity - omega * temp) * exp;
    this.value = target + (change + temp) * exp;
    return this.value;
  }
  reset(v: number): void {
    this.value = v;
    this.velocity = 0;
  }
}

/** Damped harmonic oscillator — allows overshoot/wobble, used for secondary motion. */
export class Oscillator {
  value: number;
  velocity = 0;
  constructor(value = 0, public stiffness = 120, public damping = 12) {
    this.value = value;
  }
  update(target: number, dt: number): number {
    const a = (target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += a * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
  reset(v: number): void {
    this.value = v;
    this.velocity = 0;
  }
}

export class Vec3Spring {
  readonly value = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  constructor(public smoothTime = 0.2) {}
  update(target: THREE.Vector3, dt: number, smoothTime = this.smoothTime): THREE.Vector3 {
    const omega = 2 / Math.max(1e-4, smoothTime);
    const x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    for (const k of ['x', 'y', 'z'] as const) {
      const change = this.value[k] - target[k];
      const temp = (this.velocity[k] + omega * change) * dt;
      this.velocity[k] = (this.velocity[k] - omega * temp) * exp;
      this.value[k] = target[k] + (change + temp) * exp;
    }
    return this.value;
  }
  reset(v: THREE.Vector3): void {
    this.value.copy(v);
    this.velocity.set(0, 0, 0);
  }
}

// ---------------------------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------------------------
export type EaseName =
  | 'linear'
  | 'inQuad'
  | 'outQuad'
  | 'inOutQuad'
  | 'inCubic'
  | 'outCubic'
  | 'inOutCubic'
  | 'inOutSine'
  | 'outExpo'
  | 'inExpo'
  | 'inOutExpo'
  | 'smooth';

export const Ease: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  inOutExpo: (t) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  smooth: (t) => t * t * (3 - 2 * t),
};

// ---------------------------------------------------------------------------------------------
// Splines
// ---------------------------------------------------------------------------------------------

/** Centripetal Catmull-Rom through an array of points; u in [0,1] spans the whole curve. */
export function catmullRom(points: THREE.Vector3[], u: number, out: THREE.Vector3): THREE.Vector3 {
  const n = points.length;
  if (n === 0) return out.set(0, 0, 0);
  if (n === 1) return out.copy(points[0]);
  const f = saturate(u) * (n - 1);
  const i = Math.min(n - 2, Math.floor(f));
  const t = f - i;
  const p0 = points[Math.max(0, i - 1)];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[Math.min(n - 1, i + 2)];
  return catmullRomSegment(p0, p1, p2, p3, t, out);
}

const _alpha = 0.5;
function tj(ti: number, a: THREE.Vector3, b: THREE.Vector3): number {
  const d = a.distanceTo(b);
  return ti + Math.max(1e-4, Math.pow(d, _alpha));
}

const _a1 = new THREE.Vector3();
const _a2 = new THREE.Vector3();
const _a3 = new THREE.Vector3();
const _b1 = new THREE.Vector3();
const _b2 = new THREE.Vector3();

export function catmullRomSegment(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  const t0 = 0;
  const t1 = tj(t0, p0, p1);
  const t2 = tj(t1, p1, p2);
  const t3 = tj(t2, p2, p3);
  const tt = lerp(t1, t2, t);
  const mix = (o: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, ta: number, tb: number) => {
    const w = (tt - ta) / (tb - ta);
    return o.copy(a).multiplyScalar(1 - w).addScaledVector(b, w);
  };
  mix(_a1, p0, p1, t0, t1);
  mix(_a2, p1, p2, t1, t2);
  mix(_a3, p2, p3, t2, t3);
  mix(_b1, _a1, _a2, t0, t2);
  mix(_b2, _a2, _a3, t1, t3);
  return mix(out, _b1, _b2, t1, t2);
}

/** Periodic cubic (Catmull-Rom) sampling of a looped keyframe table: keys evenly spaced over [0,1). */
export function loopCurve(keys: readonly number[], phase: number): number {
  const n = keys.length;
  let f = (phase - Math.floor(phase)) * n;
  const i = Math.floor(f);
  f -= i;
  const k0 = keys[(i - 1 + n) % n];
  const k1 = keys[i % n];
  const k2 = keys[(i + 1) % n];
  const k3 = keys[(i + 2) % n];
  const f2 = f * f;
  const f3 = f2 * f;
  return 0.5 * (2 * k1 + (-k0 + k2) * f + (2 * k0 - 5 * k1 + 4 * k2 - k3) * f2 + (-k0 + 3 * k1 - 3 * k2 + k3) * f3);
}

export const fract = (x: number): number => x - Math.floor(x);
