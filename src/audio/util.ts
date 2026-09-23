/**
 * Small shared helpers for the procedural audio modules: math, randomness,
 * smoothed AudioParam control and one-shot node cleanup.
 */

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Hermite smoothstep between edges e0 and e1 (works for e0 > e1 too). */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length) % arr.length];
export const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** Returns `v` when it is a finite number, otherwise `fallback`. */
export const finite = (v: number, fallback: number): number => (Number.isFinite(v) ? v : fallback);

/** Frame-rate independent exponential approach of `cur` toward `target` with time constant `tc`. */
export function approach(cur: number, target: number, dt: number, tc: number): number {
  if (tc <= 0) return target;
  return cur + (target - cur) * (1 - Math.exp(-dt / tc));
}

/** Weighted random choice from [value, weight] pairs. */
export function weighted<T>(items: readonly (readonly [T, number])[]): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = Math.random() * total;
  for (const [v, w] of items) {
    r -= w;
    if (r <= 0) return v;
  }
  return items[items.length - 1][0];
}

/**
 * Wraps an AudioParam that is driven every frame. Targets only produce an
 * automation event when they changed meaningfully (keeps the event timeline
 * small), and always glide with setTargetAtTime so values never jump.
 */
export class SmoothParam {
  private last = Number.NaN;

  constructor(
    private readonly ctx: BaseAudioContext,
    readonly param: AudioParam,
    private readonly rel = 0.012,
    private readonly abs = 1e-5,
  ) {}

  /** Glide toward `target` with time constant `tc` seconds. */
  set(target: number, tc: number): void {
    if (!Number.isFinite(target)) return;
    const d = Math.abs(target - this.last);
    // (comparisons with NaN are false, so the very first call always passes)
    if (d <= this.abs || d <= Math.abs(this.last) * this.rel) return;
    this.last = target;
    this.param.setTargetAtTime(target, this.ctx.currentTime, Math.max(0.004, tc));
  }

  /** Like set() but with separate time constants for rising and falling targets. */
  setAsym(target: number, tcUp: number, tcDown: number): void {
    this.set(target, target > this.last || Number.isNaN(this.last) ? tcUp : tcDown);
  }
}

/** Disconnects every node in `nodes` once `src` has finished playing. */
export function disposeOnEnd(src: AudioScheduledSourceNode, nodes: readonly AudioNode[]): void {
  src.onended = () => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  };
}

/** Stops a source, swallowing the InvalidStateError thrown for never-started / already-stopped sources. */
export function safeStop(src: AudioScheduledSourceNode, when = 0): void {
  try {
    src.stop(when);
  } catch {
    /* ignore */
  }
}

/** Creates a biquad filter in one call. For lowpass/highpass, `q` is the resonance in dB (-3 ≈ Butterworth). */
export function biquad(
  ctx: BaseAudioContext,
  type: BiquadFilterType,
  frequency: number,
  q: number,
  gain = 0,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.gain.value = gain;
  return f;
}

/** Creates a gain node with an initial value. */
export function gainNode(ctx: BaseAudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}
