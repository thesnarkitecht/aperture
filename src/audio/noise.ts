/**
 * Procedural noise and control-signal buffers shared by every audio module.
 *
 * All buffers are generated once per AudioContext (cached in a WeakMap) and are
 * seamlessly loopable (the tail is equal-power crossfaded into the head), so
 * long-running layers never click at the loop point.
 *
 *  - white / pink / brown : stereo audio-rate noise with decorrelated channels
 *  - grit                 : sparse crackle (gravel, dirt, debris texture)
 *  - smooth               : smooth random control signal (Catmull-Rom through random
 *                           knots, 4 knots/s at playbackRate 1) used as an audio-rate LFO
 *  - flap                 : train of cloth "snap" envelopes (~10 flaps/s at rate 1)
 */
import { rand, SmoothParam } from './util';

export interface NoiseBank {
  white: AudioBuffer;
  pink: AudioBuffer;
  brown: AudioBuffer;
  grit: AudioBuffer;
  smooth: AudioBuffer;
  flap: AudioBuffer;
}

/** Target RMS of the audio-rate noise buffers (peaks stay well under 1). */
const NOISE_RMS = 0.3;
/** Sample rate for control-signal buffers (low, but supported everywhere). */
const CONTROL_RATE = 22050;
/** Knots per second of the smooth LFO buffer at playbackRate 1. */
export const SMOOTH_KNOTS_PER_SEC = 4;
/** Average flaps per second of the flap buffer at playbackRate 1. */
export const FLAPS_PER_SEC = 10;

const cache = new WeakMap<BaseAudioContext, NoiseBank>();

export function getNoiseBank(ctx: BaseAudioContext): NoiseBank {
  let bank = cache.get(ctx);
  if (!bank) {
    const sr = ctx.sampleRate;
    bank = {
      white: stereo(ctx, sr, 4, () => whiteGen()),
      pink: stereo(ctx, sr, 6, () => pinkGen()),
      brown: stereo(ctx, sr, 6, () => brownGen()),
      grit: mono(ctx, sr, gritData(sr, 3)),
      smooth: mono(ctx, CONTROL_RATE, smoothData(CONTROL_RATE, 24)),
      flap: mono(ctx, CONTROL_RATE, flapData(CONTROL_RATE, 12)),
    };
    cache.set(ctx, bank);
  }
  return bank;
}

// ---------------------------------------------------------------------------
// Generators

type Gen = () => number;
/** Float32Array backed by a plain ArrayBuffer (what copyToChannel expects). */
type F32 = Float32Array<ArrayBuffer>;

function whiteGen(): Gen {
  return () => Math.random() * 2 - 1;
}

/** Paul Kellet's refined pink-noise filter (-3 dB/oct). */
function pinkGen(): Gen {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    const out = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
    b6 = w * 0.115926;
    return out;
  };
}

/** Leaky-integrated white noise (-6 dB/oct), with a DC blocker. */
function brownGen(): Gen {
  let last = 0;
  let dcIn = 0;
  let dcOut = 0;
  return () => {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    // one-pole DC blocker (~5 Hz) keeps the loop centred
    dcOut = last - dcIn + 0.9993 * dcOut;
    dcIn = last;
    return dcOut;
  };
}

/** Sparse random impulses with a skewed amplitude distribution -> gravel crunch when filtered. */
function gritData(sr: number, seconds: number): F32 {
  const len = Math.floor(sr * seconds);
  const d = new Float32Array(len);
  const density = 1800; // grains per second
  const grains = Math.floor(density * seconds);
  for (let g = 0; g < grains; g++) {
    const pos = Math.floor(Math.random() * len);
    const amp = Math.pow(Math.random(), 3) * (Math.random() < 0.5 ? -1 : 1);
    const ring = 3 + Math.floor(Math.random() * 12);
    for (let i = 0; i < ring; i++) {
      const idx = (pos + i) % len;
      d[idx] += amp * Math.exp(-i / (ring * 0.35)) * (i % 2 === 0 ? 1 : -0.6);
    }
  }
  normalizeRms(d, NOISE_RMS);
  return d;
}

/** Smooth random signal in [-1, 1]: Catmull-Rom spline through random knots, wrapping. */
function smoothData(sr: number, seconds: number): F32 {
  const knots = SMOOTH_KNOTS_PER_SEC * seconds;
  const k = new Float32Array(knots);
  for (let i = 0; i < knots; i++) k[i] = Math.random() * 2 - 1;
  const len = Math.floor(sr * seconds);
  const d = new Float32Array(len);
  const spk = len / knots; // samples per knot
  for (let i = 0; i < len; i++) {
    const x = i / spk;
    const i1 = Math.floor(x);
    const t = x - i1;
    const p0 = k[(i1 - 1 + knots) % knots];
    const p1 = k[i1 % knots];
    const p2 = k[(i1 + 1) % knots];
    const p3 = k[(i1 + 2) % knots];
    const t2 = t * t;
    const t3 = t2 * t;
    const v =
      0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
    d[i] = v > 1 ? 1 : v < -1 ? -1 : v;
  }
  return d;
}

/** Train of cloth-flap envelopes (fast raised-cosine attack, exponential decay, random spacing). */
function flapData(sr: number, seconds: number): F32 {
  const len = Math.floor(sr * seconds);
  const d = new Float32Array(len);
  const add = (start: number, amp: number): void => {
    const att = Math.max(2, Math.floor(rand(0.002, 0.005) * sr));
    const tc = rand(0.01, 0.028) * sr;
    const n = att + Math.floor(tc * 6);
    for (let i = 0; i < n; i++) {
      const e = i < att ? 0.5 - 0.5 * Math.cos((Math.PI * i) / att) : Math.exp(-(i - att) / tc);
      const idx = (start + i) % len;
      const v = amp * e;
      if (v > d[idx]) d[idx] = v;
    }
  };
  let t = 0;
  const mean = sr / FLAPS_PER_SEC;
  while (t < len) {
    // amplitude clusters: slow-varying strength so flaps come in groups
    const cluster = 0.65 + 0.35 * Math.sin((t / len) * Math.PI * 2 * 7.3);
    const amp = cluster * (0.35 + 0.65 * Math.pow(Math.random(), 0.7));
    add(Math.floor(t), amp);
    if (Math.random() < 0.2) add(Math.floor(t + rand(0.012, 0.026) * sr), amp * 0.55); // double snap
    t += mean * rand(0.5, 1.5);
  }
  return d;
}

// ---------------------------------------------------------------------------
// Buffer helpers

function stereo(ctx: BaseAudioContext, sr: number, seconds: number, mk: () => Gen): AudioBuffer {
  const fade = Math.floor(sr * 0.05);
  const len = Math.floor(sr * seconds);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const gen = mk();
    for (let i = 0; i < 2048; i++) gen(); // let filters settle
    const raw = new Float32Array(len + fade);
    for (let i = 0; i < raw.length; i++) raw[i] = gen();
    const out = loopable(raw, fade);
    normalizeRms(out, NOISE_RMS);
    buf.copyToChannel(out, ch);
  }
  return buf;
}

function mono(ctx: BaseAudioContext, sr: number, data: F32): AudioBuffer {
  const buf = ctx.createBuffer(1, data.length, sr);
  buf.copyToChannel(data, 0);
  return buf;
}

/** Equal-power crossfade of the last `fade` samples into the first ones -> seamless loop. */
function loopable(raw: F32, fade: number): F32 {
  const len = raw.length - fade;
  const out = raw.slice(0, len);
  for (let i = 0; i < fade; i++) {
    const t = (i / fade) * (Math.PI / 2);
    out[i] = raw[i] * Math.sin(t) + raw[len + i] * Math.cos(t);
  }
  return out;
}

function normalizeRms(d: Float32Array, target: number): void {
  let sum = 0;
  for (let i = 0; i < d.length; i++) sum += d[i] * d[i];
  const rms = Math.sqrt(sum / Math.max(1, d.length));
  if (rms > 0) {
    const k = target / rms;
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
}

// ---------------------------------------------------------------------------
// Sources

/** Starts a looping buffer source at a random offset (decorrelates layers sharing a buffer). */
export function loopSource(ctx: BaseAudioContext, buffer: AudioBuffer, rate = 1): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.playbackRate.value = rate;
  src.start(ctx.currentTime, Math.random() * buffer.duration);
  return src;
}

/** One-shot buffer source playing `dur` seconds from a random offset, starting at `when`. */
export function shotSource(
  ctx: BaseAudioContext,
  buffer: AudioBuffer,
  when: number,
  dur: number,
  rate = 1,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true; // loop so any offset has enough material
  src.playbackRate.value = rate;
  src.start(when, Math.random() * buffer.duration);
  src.stop(when + dur);
  return src;
}

/**
 * Audio-rate smooth random LFO. The output is `depth * lfo(t)` where lfo is roughly in
 * [-1, 1]; connect it to any AudioParam (it adds to the param's intrinsic value).
 * Several decorrelated layers with incommensurate rates are summed so the pattern
 * never audibly repeats. Rate 1 ≈ 4 random knots per second.
 */
export class RandomLfo {
  readonly output: GainNode;
  private readonly srcs: AudioBufferSourceNode[] = [];
  private readonly rates: SmoothParam[] = [];
  private readonly depthParam: SmoothParam;
  private readonly scale: number;
  private static readonly RATIOS = [1, 1.37, 0.71];

  constructor(ctx: BaseAudioContext, bank: NoiseBank, rate: number, depth: number, layers = 2) {
    const n = Math.max(1, Math.min(3, layers));
    this.scale = n === 1 ? 1 : n === 2 ? 0.62 : 0.5;
    this.output = ctx.createGain();
    this.output.gain.value = depth * this.scale;
    this.depthParam = new SmoothParam(ctx, this.output.gain);
    for (let i = 0; i < n; i++) {
      const src = loopSource(ctx, bank.smooth, rate * RandomLfo.RATIOS[i]);
      src.connect(this.output);
      this.srcs.push(src);
      this.rates.push(new SmoothParam(ctx, src.playbackRate));
    }
  }

  connect(param: AudioParam): this {
    this.output.connect(param);
    return this;
  }

  setRate(rate: number, tc = 0.5): void {
    for (let i = 0; i < this.rates.length; i++) this.rates[i].set(Math.max(0.001, rate * RandomLfo.RATIOS[i]), tc);
  }

  setDepth(depth: number, tc = 0.5): void {
    this.depthParam.set(depth * this.scale, tc);
  }

  stop(): void {
    for (const s of this.srcs) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.output.disconnect();
  }
}
