/**
 * Environmental ambience: distant birds, grass rustle and waterfalls.
 *
 * Birds  – occasional synthesized calls (sine carrier with pitch envelopes and
 *          detune-FM for trills/vibrato; amplitude shaped by smooth curves so no
 *          syllable ever clicks). Several "species" with randomized pitch, timing
 *          and panning, sometimes answered by a second bird. Each call uses one
 *          short-lived set of 5 nodes that is disconnected when it ends.
 * Grass  – soft band-limited pink noise whose level follows ground speed × grass
 *          amount; a random LFO whose rate tracks speed gives a brushing texture.
 *          A faint idle rustle follows the breeze while standing in grass.
 * Waterfall – distant broadband rush (brown rumble + pink splash band), level and
 *          brightness by distance (inaudible beyond ~1500 m).
 */
import { NoiseBank, RandomLfo, loopSource } from './noise';
import {
  SmoothParam,
  biquad,
  clamp01,
  gainNode,
  lerp,
  pick,
  rand,
  smoothstep,
  weighted,
} from './util';

export interface AmbienceInput {
  now: number;
  dt: number;
  grounded: boolean;
  /** Horizontal ground speed, m/s. */
  speed: number;
  /** 0..1 grass under the character. */
  inGrass: number;
  /** 0..1 how much bird activity is allowed here (island / below clouds, not falling, not in cloud). */
  birds: number;
  /** 0..1 how far away birds sound (1 = far below, below the clouds). */
  birdDistance: number;
  /** 0..1 overall environment level (ducks when airborne / inside cloud). */
  duck: number;
  /** Ambient breeze amount 0..1 (drives idle grass rustle). */
  breeze: number;
  waterfallDistance: number;
  paused: boolean;
}

// --- Tuning -----------------------------------------------------------------
/** Peak gain range of a single bird call (before distance attenuation). */
const BIRD_LEVEL: [number, number] = [0.012, 0.032];
/** Mean seconds between calls at full / minimal activity. */
const BIRD_INTERVAL: [number, number] = [3.2, 10];
/** Grass rustle level at a sprint in full grass. */
const GRASS_MOVE = 0.11;
/** Idle grass-in-the-breeze level. */
const GRASS_IDLE = 0.012;
/** Waterfall level at ~0 m (falls off ~ 1/(1 + d/40)). */
const WATERFALL_NEAR = 0.2;
const WATERFALL_MAX_DIST = 1500;

type Shape = 'chirp' | 'whistle' | 'swell';
interface Syllable {
  t: number;
  dur: number;
  /** 2 or 3 pitch points (Hz): start, [mid], end – exponential glides between them. */
  f: number[];
  amp: number;
  shape: Shape;
  /** detune FM for trills / vibrato */
  mod?: { rate: number; cents: number };
}
type Species = (k: number) => Syllable[];

export class Ambience {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioBufferSourceNode[] = [];
  private readonly lfos: RandomLfo[] = [];

  private readonly birdIn: GainNode;
  private readonly birdLp: SmoothParam;
  private readonly birdLvl: SmoothParam;
  private readonly grassLvl: SmoothParam;
  private readonly grassLp: SmoothParam;
  private readonly grassLfo: RandomLfo;
  private readonly wfLvl: SmoothParam;
  private readonly wfLp: SmoothParam;

  private nextBird = 0;
  private activeCalls = 0;
  private readonly curves = new Map<Shape, Float32Array<ArrayBuffer>>();

  constructor(
    private readonly ctx: BaseAudioContext,
    bank: NoiseBank,
    out: AudioNode,
    reverbIn: AudioNode,
  ) {
    const c = ctx;
    const sp = (p: AudioParam): SmoothParam => new SmoothParam(c, p);
    const track = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };
    const src = (b: AudioBuffer): AudioBufferSourceNode => {
      const s = loopSource(c, b);
      this.sources.push(s);
      return s;
    };

    // -- birds bus: distance low-pass, level, reverb send
    this.birdIn = track(gainNode(c, 1));
    const bLp = track(biquad(c, 'lowpass', 7000, -3));
    const bHp = track(biquad(c, 'highpass', 900, -3));
    const bLvl = track(gainNode(c, 0));
    const bSend = track(gainNode(c, 0.45));
    this.birdIn.connect(bHp).connect(bLp).connect(bLvl).connect(out);
    bLvl.connect(bSend).connect(reverbIn);
    this.birdLp = sp(bLp.frequency);
    this.birdLvl = sp(bLvl.gain);

    // -- grass rustle
    const gHp = track(biquad(c, 'highpass', 1100, -3));
    const gPeak = track(biquad(c, 'peaking', 3800, 0.8, 4));
    const gLp = track(biquad(c, 'lowpass', 6000, -3));
    const gVca = track(gainNode(c, 0.5));
    const gLvl = track(gainNode(c, 0));
    src(bank.pink).connect(gHp).connect(gPeak).connect(gLp).connect(gVca).connect(gLvl).connect(out);
    this.grassLfo = new RandomLfo(c, bank, 1, 0.4, 2).connect(gVca.gain);
    this.grassLvl = sp(gLvl.gain);
    this.grassLp = sp(gLp.frequency);

    // -- waterfall
    const wfSum = track(gainNode(c, 1));
    const wfRumble = track(biquad(c, 'lowpass', 420, -3));
    const wfSplash = track(biquad(c, 'bandpass', 1500, 0.5));
    const wfSplashG = track(gainNode(c, 0.7));
    src(bank.brown).connect(wfRumble).connect(wfSum);
    src(bank.pink).connect(wfSplash).connect(wfSplashG).connect(wfSum);
    const wfMod = track(gainNode(c, 1));
    const wfDist = track(biquad(c, 'lowpass', 4000, -3));
    const wfLvl = track(gainNode(c, 0));
    const wfSend = track(gainNode(c, 0.2));
    wfSum.connect(wfMod).connect(wfDist).connect(wfLvl).connect(out);
    wfLvl.connect(wfSend).connect(reverbIn);
    const wfLfo = new RandomLfo(c, bank, 0.3, 0.12, 2).connect(wfMod.gain);
    this.wfLvl = sp(wfLvl.gain);
    this.wfLp = sp(wfDist.frequency);

    this.lfos.push(this.grassLfo, wfLfo);
    this.buildCurves();
    this.nextBird = c.currentTime + rand(1.5, 4);
  }

  update(s: AmbienceInput): void {
    const now = s.now;
    const duck = clamp01(s.duck);

    // ---- birds
    const birds = clamp01(s.birds);
    const far = clamp01(s.birdDistance);
    this.birdLvl.setAsym(birds * duck, 1.2, 0.35);
    this.birdLp.set(lerp(7000, 4200, far), 1);
    if (!s.paused && now >= this.nextBird) {
      if (birds > 0.15 && this.activeCalls < 3) this.spawnCall(now + 0.02, far);
      this.nextBird = now + rand(0.6, 1.4) * lerp(BIRD_INTERVAL[1], BIRD_INTERVAL[0], birds);
    }

    // ---- grass
    const inGrass = clamp01(s.inGrass);
    const speed = Math.max(0, s.speed);
    const moving = Math.pow(clamp01(speed / 7.5), 0.8);
    const grass = s.grounded ? inGrass * (GRASS_MOVE * moving + GRASS_IDLE * clamp01(s.breeze)) : 0;
    this.grassLvl.setAsym(grass, 0.12, s.grounded ? 0.3 : 0.12);
    this.grassLfo.setRate(0.4 + speed * 0.9, 0.3);
    this.grassLp.set(4800 + 450 * Math.min(speed, 8), 0.3);

    // ---- waterfall
    const d = Number.isFinite(s.waterfallDistance) ? Math.max(0, s.waterfallDistance) : Infinity;
    let wf = 0;
    if (d < WATERFALL_MAX_DIST) wf = (WATERFALL_NEAR * 40) / (40 + d) * smoothstep(WATERFALL_MAX_DIST, WATERFALL_MAX_DIST * 0.6, d);
    this.wfLvl.set(wf * lerp(1, duck, 0.6), 0.8);
    if (Number.isFinite(d)) this.wfLp.set(900 + 9000 * (80 / (80 + d)), 0.8);
  }

  // ---------------------------------------------------------------------------
  // Birds

  private static readonly SPECIES: readonly (readonly [Species, number])[] = [
    [chirper, 3],
    [whistler, 3],
    [trill, 1.5],
    [peeoo, 1],
    [twitter, 1.5],
  ];

  private spawnCall(when: number, far: number): void {
    const species = weighted(Ambience.SPECIES);
    const k = rand(0.9, 1.1);
    const pan = rand(-0.85, 0.85);
    const level = rand(BIRD_LEVEL[0], BIRD_LEVEL[1]) * lerp(1, 0.45, far);
    const call = species(k);
    this.playCall(when, call, pan, level);
    // sometimes a second bird answers from elsewhere
    if (Math.random() < 0.35) {
      const answerPan = Math.max(-0.9, Math.min(0.9, -pan * 0.6 + rand(-0.3, 0.3)));
      const len = call.reduce((m, x) => Math.max(m, x.t + x.dur), 0);
      this.playCall(when + len + rand(0.8, 2.4), species(k * rand(0.92, 1.08)), answerPan, level * rand(0.5, 0.85));
    }
  }

  private playCall(when: number, syl: Syllable[], pan: number, level: number): void {
    const c = this.ctx;
    const osc = c.createOscillator();
    const mod = c.createOscillator();
    const modG = gainNode(c, 0);
    const amp = gainNode(c, 0);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    mod.connect(modG).connect(osc.detune);
    osc.connect(amp).connect(p).connect(this.birdIn);

    let tPrev = when;
    for (const s of syl) {
      const t0 = Math.max(when + s.t, tPrev + 0.004);
      const dur = Math.max(0.01, s.dur);
      const fr = osc.frequency;
      fr.setValueAtTime(s.f[0], t0);
      if (s.f.length >= 3) {
        fr.exponentialRampToValueAtTime(s.f[1], t0 + dur * 0.45);
        fr.exponentialRampToValueAtTime(s.f[2], t0 + dur);
      } else if (s.f.length === 2) {
        fr.exponentialRampToValueAtTime(s.f[1], t0 + dur);
      }
      mod.frequency.setValueAtTime(s.mod ? s.mod.rate : 6, t0);
      modG.gain.setValueAtTime(s.mod ? s.mod.cents : 0, t0);
      amp.gain.setValueCurveAtTime(this.scaledCurve(s.shape, s.amp * level), t0, dur);
      tPrev = t0 + dur;
    }
    osc.start(when);
    mod.start(when);
    osc.stop(tPrev + 0.05);
    mod.stop(tPrev + 0.05);
    this.activeCalls++;
    osc.onended = () => {
      this.activeCalls = Math.max(0, this.activeCalls - 1);
      for (const n of [osc, mod, modG, amp, p]) n.disconnect();
    };
  }

  private buildCurves(): void {
    const N = 32;
    const mk = (fn: (x: number) => number): Float32Array<ArrayBuffer> => {
      const a = new Float32Array(N);
      for (let i = 0; i < N; i++) a[i] = fn(i / (N - 1));
      a[0] = 0;
      a[N - 1] = 0;
      return a;
    };
    // fast attack, smooth decay
    this.curves.set('chirp', mk((x) => (x < 0.12 ? Math.sin((x / 0.12) * Math.PI * 0.5) : Math.pow(1 - (x - 0.12) / 0.88, 1.6))));
    // smooth, symmetric
    this.curves.set('whistle', mk((x) => Math.pow(Math.sin(Math.PI * x), 0.8)));
    // slow rise, gentle fall
    this.curves.set('swell', mk((x) => (x < 0.6 ? Math.sin((x / 0.6) * Math.PI * 0.5) : Math.cos(((x - 0.6) / 0.4) * Math.PI * 0.5))));
  }

  private scaledCurve(shape: Shape, amp: number): Float32Array<ArrayBuffer> {
    const base = this.curves.get(shape) as Float32Array<ArrayBuffer>;
    const out = new Float32Array(base.length);
    for (let i = 0; i < base.length; i++) out[i] = base[i] * amp;
    return out;
  }

  dispose(): void {
    for (const l of this.lfos) l.stop();
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* ignore */
      }
      s.disconnect();
    }
    for (const n of this.nodes) n.disconnect();
  }
}

// ---------------------------------------------------------------------------
// Species: each returns a list of non-overlapping syllables (times in seconds).
// `k` scales pitch so repeated calls and answers differ slightly.

/** A few short falling (or rising) chirps. */
function chirper(k: number): Syllable[] {
  const base = rand(3200, 4300) * k;
  const n = 2 + Math.floor(rand(0, 4));
  const down = Math.random() < 0.7;
  const out: Syllable[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const dur = rand(0.035, 0.07);
    const f0 = base * rand(0.95, 1.08);
    const f1 = down ? f0 * rand(0.62, 0.78) : f0 * rand(1.15, 1.3);
    out.push({ t, dur, f: [f0, f1], amp: Math.max(0.35, 1 - i * rand(0.05, 0.18)), shape: 'chirp' });
    t += dur + rand(0.06, 0.14);
  }
  return out;
}

/** A sweet, slow 2–4 note whistle with gentle vibrato. */
function whistler(k: number): Syllable[] {
  let p = rand(1900, 2500) * k;
  const n = 2 + Math.floor(rand(0, 3));
  const out: Syllable[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const dur = rand(0.14, 0.32);
    out.push({
      t,
      dur,
      f: [p * 0.96, p, p * rand(0.97, 1.03)],
      amp: rand(0.7, 1),
      shape: 'whistle',
      mod: { rate: rand(5, 8), cents: rand(8, 26) },
    });
    t += dur + rand(0.05, 0.16);
    p *= pick([1, 1.125, 1.25, 1.333, 0.889, 0.8, 1.5]);
    p = Math.min(3600, Math.max(1500, p));
  }
  return out;
}

/** A single warbling trill. */
function trill(k: number): Syllable[] {
  const f = rand(3300, 4200) * k;
  return [
    {
      t: 0,
      dur: rand(0.5, 1.1),
      f: [f, f * rand(0.86, 0.95)],
      amp: 0.75,
      shape: 'swell',
      mod: { rate: rand(20, 32), cents: rand(120, 260) },
    },
  ];
}

/** Rising then falling "pee-oo" call, like a distant hawk or thrush. */
function peeoo(k: number): Syllable[] {
  const d1 = rand(0.14, 0.2);
  return [
    { t: 0, dur: d1, f: [2300 * k, 3500 * k], amp: 0.8, shape: 'whistle', mod: { rate: 6, cents: 10 } },
    {
      t: d1 + rand(0.03, 0.07),
      dur: rand(0.3, 0.42),
      f: [3400 * k, 2900 * k, 2000 * k],
      amp: 1,
      shape: 'whistle',
      mod: { rate: 6.5, cents: 14 },
    },
  ];
}

/** A soft sparrow-like twitter of tiny ticks. */
function twitter(k: number): Syllable[] {
  const n = 6 + Math.floor(rand(0, 6));
  const out: Syllable[] = [];
  let t = 0;
  for (let i = 0; i < n; i++) {
    const dur = rand(0.012, 0.024);
    const f0 = rand(4800, 6000) * k;
    out.push({ t, dur, f: [f0, f0 * rand(0.8, 0.9)], amp: rand(0.45, 1), shape: 'chirp' });
    t += dur + rand(0.03, 0.065);
  }
  return out;
}
