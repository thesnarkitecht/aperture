/**
 * Shared send reverb: a ConvolverNode fed with a generated stereo impulse.
 *
 * The impulse is decorrelated noise per channel with a short pre-delay, a soft
 * build-up of density, an exponential decay and progressive high-frequency
 * damping (a time-varying one-pole low-pass), which gives a smooth, dark,
 * "large open space" tail without metallic ringing. The send is band-limited
 * (high-pass + low-pass) so low rumble and hiss don't smear into the tail.
 */
import { biquad, gainNode } from './util';

export interface Reverb {
  /** Connect sends here. */
  input: GainNode;
  /** Wet output (already includes the return level). */
  output: GainNode;
  dispose(): void;
}

export function createReverb(ctx: BaseAudioContext, seconds = 3.8, returnLevel = 0.9): Reverb {
  const input = gainNode(ctx, 1);
  const hp = biquad(ctx, 'highpass', 190, -3);
  const lp = biquad(ctx, 'lowpass', 8500, -3);
  const conv = ctx.createConvolver();
  conv.normalize = true;
  conv.buffer = makeImpulse(ctx, seconds);
  const output = gainNode(ctx, returnLevel);
  input.connect(hp).connect(lp).connect(conv).connect(output);
  return {
    input,
    output,
    dispose() {
      for (const n of [input, hp, lp, conv, output]) n.disconnect();
    },
  };
}

function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const pre = Math.floor(sr * 0.022);
  const len = pre + Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  const rt60 = seconds * 0.85; // time to decay by 60 dB
  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(len);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / sr;
      const env = Math.exp((-6.9 * t) / rt60) * (1 - Math.exp(-t / 0.035));
      // HF damping: the one-pole gets darker as the tail ages
      const a = 0.07 + 0.78 * Math.exp(-t / 0.7);
      lp += a * (Math.random() * 2 - 1 - lp);
      // partially compensate the level loss of the low-pass so the envelope stays smooth
      const comp = Math.pow(a / (2 - a), -0.35);
      d[i] = lp * env * comp;
    }
    // a few soft early reflections, different per channel
    for (let r = 0; r < 6; r++) {
      const pos = pre + Math.floor(sr * (0.008 + Math.random() * 0.07));
      const amp = (0.08 + Math.random() * 0.1) * (Math.random() < 0.5 ? -1 : 1);
      for (let k = 0; k < 24 && pos + k < len; k++) d[pos + k] += amp * Math.exp(-k / 6) * (1 - k / 24);
    }
    buf.copyToChannel(d, ch);
  }
  return buf;
}
