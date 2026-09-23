/**
 * Wind & airflow.
 *
 * Always-present layered wind made from filtered noise:
 *   rumble  – brown noise, low-pass          (body of the roar in free fall)
 *   body    – pink noise, wide band-pass     (the "whoosh", slowly panned)
 *   hiss    – pink noise, high band          (air rushing past the ears)
 *   whistle – two narrow resonant bands      (thin whistling that follows gusts)
 *   cloud   – soft low whoosh heard inside the cloud deck
 * All of it passes a "buffet" VCA modulated by a fast random LFO (turbulence).
 *
 * Gusts are an audio-rate smooth random LFO that modulates every layer's level
 * and brightness (filter detune in cents, i.e. multiplicative in frequency).
 *
 * Cloth layers (rapid amplitude-modulated noise bursts driven by a looping
 * flap-envelope buffer whose playbackRate sets the flap rate):
 *   clothes – the character's clothing flapping in the airflow (strong in free fall)
 *   canopy  – the glider fabric fluttering, deeper and only occasionally present
 */
import { FLAPS_PER_SEC, NoiseBank, RandomLfo, loopSource } from './noise';
import { SmoothParam, biquad, clamp01, gainNode, lerp, rand } from './util';

export interface WindInput {
  now: number;
  dt: number;
  /** 0..1 normalised airspeed (1 ≈ 60 m/s). */
  air: number;
  /** 0..1 free-fall amount (airborne, not gliding, falling fast). */
  fall: number;
  /** 0..1 gliding. */
  glide: number;
  airborne: boolean;
  /** 0..1 cloud density around the camera. */
  cloud: number;
  /** 0..1 ambient breeze amount (strongest up on the island). */
  breeze: number;
  /** 0..1 cinematic reveal – the wind steps back a little to let the score bloom. */
  reveal: number;
}

// --- Tuning -----------------------------------------------------------------
/** Layer levels at full airspeed (air = 1, ~60 m/s free fall). */
const FULL = { rumble: 0.4, body: 0.4, hiss: 0.115, whistle: 0.018 };
/** Layer levels of the gentle island breeze (air ≈ 0). */
const BREEZE = { rumble: 0.065, body: 0.08, hiss: 0.014, whistle: 0.012 };
/** Gliding scales the airspeed-driven layers by these factors (smoother, less hiss). */
const GLIDE_SOFTEN = { rumble: 0.9, body: 1.0, hiss: 0.7, whistle: 0.6 };
/** Clothing flap level at full free fall. */
const CLOTH_FALL = 0.2;
/** Glider canopy flutter level (during an occasional flutter burst). */
const CANOPY_BURST = 0.05;
/** Master trim for the whole wind bus. */
const WIND_TRIM = 1.0;

export class Wind {
  private readonly nodes: AudioNode[] = [];
  private readonly sources: AudioBufferSourceNode[] = [];
  private readonly lfos: RandomLfo[] = [];

  private readonly rumbleLvl: SmoothParam;
  private readonly rumbleLp: SmoothParam;
  private readonly bodyLvl: SmoothParam;
  private readonly bodyBp: SmoothParam;
  private readonly bodyQ: SmoothParam;
  private readonly hissLvl: SmoothParam;
  private readonly hissHp: SmoothParam;
  private readonly hissLp: SmoothParam;
  private readonly whistleLvl: SmoothParam;
  private readonly whistleF1: SmoothParam;
  private readonly whistleF2: SmoothParam;
  private readonly cloudLvl: SmoothParam;
  private readonly cloudBp: SmoothParam;
  private readonly gustToRumble: SmoothParam;
  private readonly gustToBody: SmoothParam;
  private readonly gustToHiss: SmoothParam;
  private readonly gustToWhistle: SmoothParam;
  private readonly gustToBright: SmoothParam;
  private readonly clothLvl: SmoothParam;
  private readonly clothRate: SmoothParam;
  private readonly clothBp: SmoothParam;
  private readonly canopyLvl: SmoothParam;
  private readonly canopyRate: SmoothParam;

  private readonly gust: RandomLfo;
  private readonly buffet: RandomLfo;
  private readonly pan: RandomLfo;

  private canopyBurstUntil = 0;
  private nextCanopyBurst = 0;

  constructor(ctx: BaseAudioContext, bank: NoiseBank, out: AudioNode) {
    const c = ctx;
    const sp = (p: AudioParam): SmoothParam => new SmoothParam(c, p);
    const track = <T extends AudioNode>(n: T): T => {
      this.nodes.push(n);
      return n;
    };
    const src = (b: AudioBuffer, rate = 1): AudioBufferSourceNode => {
      const s = loopSource(c, b, rate);
      this.sources.push(s);
      return s;
    };

    const master = track(gainNode(c, WIND_TRIM));
    master.connect(out);
    const buffetVca = track(gainNode(c, 1));
    buffetVca.connect(master);
    const sum = track(gainNode(c, 1));
    sum.connect(buffetVca);

    // -- rumble
    const rLp = track(biquad(c, 'lowpass', 150, -3));
    const rMod = track(gainNode(c, 1));
    const rLvl = track(gainNode(c, 0));
    src(bank.brown).connect(rLp).connect(rMod).connect(rLvl).connect(sum);

    // -- body whoosh (panned)
    const bBp = track(biquad(c, 'bandpass', 450, 0.6));
    const bMod = track(gainNode(c, 1));
    const bLvl = track(gainNode(c, 0));
    const bPan = track(c.createStereoPanner());
    src(bank.pink).connect(bBp).connect(bMod).connect(bLvl).connect(bPan).connect(sum);

    // -- hiss
    const hHp = track(biquad(c, 'highpass', 2200, -3));
    const hLp = track(biquad(c, 'lowpass', 5500, -3));
    const hMod = track(gainNode(c, 1));
    const hLvl = track(gainNode(c, 0));
    src(bank.pink).connect(hHp).connect(hLp).connect(hMod).connect(hLvl).connect(sum);

    // -- whistle (two narrow bands, wandering)
    const wSrc = src(bank.pink);
    const w1 = track(biquad(c, 'bandpass', 1150, 7));
    const w2 = track(biquad(c, 'bandpass', 1760, 9));
    const wMod = track(gainNode(c, 1));
    const wLvl = track(gainNode(c, 0));
    wSrc.connect(w1).connect(wMod);
    wSrc.connect(w2).connect(wMod);
    wMod.connect(wLvl).connect(sum);

    // -- inside-cloud whoosh
    const cBp = track(biquad(c, 'bandpass', 300, 0.8));
    const cLvl = track(gainNode(c, 0));
    src(bank.pink).connect(cBp).connect(cLvl).connect(sum);

    // -- clothing flap: noise carrier × flap envelope train
    const clBp = track(biquad(c, 'bandpass', 900, 0.8));
    const clHp = track(biquad(c, 'highpass', 220, -3));
    const clVca = track(gainNode(c, 0.12)); // small floor: cloth is never fully silent in airflow
    const clLvl = track(gainNode(c, 0));
    src(bank.pink).connect(clBp).connect(clHp).connect(clVca).connect(clLvl).connect(master);
    const clEnv = src(bank.flap, 1);
    clEnv.connect(clVca.gain);

    // -- glider canopy flutter: deeper, slower
    const caBp = track(biquad(c, 'bandpass', 330, 0.7));
    const caVca = track(gainNode(c, 0.15));
    const caLvl = track(gainNode(c, 0));
    src(bank.pink).connect(caBp).connect(caVca).connect(caLvl).connect(master);
    const caEnv = src(bank.flap, 0.5);
    caEnv.connect(caVca.gain);

    // -- modulation
    this.gust = new RandomLfo(c, bank, 0.12, 1, 2);
    const gR = track(gainNode(c, 0.4));
    const gB = track(gainNode(c, 0.5));
    const gH = track(gainNode(c, 0.55));
    const gW = track(gainNode(c, 0.8));
    const gBright = track(gainNode(c, 350));
    this.gust.output.connect(gR).connect(rMod.gain);
    this.gust.output.connect(gB).connect(bMod.gain);
    this.gust.output.connect(gH).connect(hMod.gain);
    this.gust.output.connect(gW).connect(wMod.gain);
    this.gust.output.connect(gBright);
    gBright.connect(bBp.detune);
    gBright.connect(hLp.detune);
    gBright.connect(rLp.detune);

    this.buffet = new RandomLfo(c, bank, 1.5, 0, 2).connect(buffetVca.gain);
    this.pan = new RandomLfo(c, bank, 0.06, 0.35, 1).connect(bPan.pan);
    const wander = new RandomLfo(c, bank, 0.1, 220, 1);
    wander.connect(w1.detune).connect(w2.detune);
    this.lfos.push(this.gust, this.buffet, this.pan, wander);

    this.rumbleLvl = sp(rLvl.gain);
    this.rumbleLp = sp(rLp.frequency);
    this.bodyLvl = sp(bLvl.gain);
    this.bodyBp = sp(bBp.frequency);
    this.bodyQ = sp(bBp.Q);
    this.hissLvl = sp(hLvl.gain);
    this.hissHp = sp(hHp.frequency);
    this.hissLp = sp(hLp.frequency);
    this.whistleLvl = sp(wLvl.gain);
    this.whistleF1 = sp(w1.frequency);
    this.whistleF2 = sp(w2.frequency);
    this.cloudLvl = sp(cLvl.gain);
    this.cloudBp = sp(cBp.frequency);
    this.gustToRumble = sp(gR.gain);
    this.gustToBody = sp(gB.gain);
    this.gustToHiss = sp(gH.gain);
    this.gustToWhistle = sp(gW.gain);
    this.gustToBright = sp(gBright.gain);
    this.clothLvl = sp(clLvl.gain);
    this.clothRate = sp(clEnv.playbackRate);
    this.clothBp = sp(clBp.frequency);
    this.canopyLvl = sp(caLvl.gain);
    this.canopyRate = sp(caEnv.playbackRate);
  }

  update(s: WindInput): void {
    const a = clamp01(s.air);
    const aa = Math.pow(a, 1.3);
    const f = clamp01(s.fall);
    const g = clamp01(s.glide);
    const cloud = clamp01(s.cloud);
    const now = s.now;

    // slow "weather" swell of the ambient breeze (periods ~20 s and ~55 s)
    const swell = 0.8 + 0.1 * Math.sin(now * 0.29) + 0.1 * Math.sin(now * 0.113 + 1.7);
    const br = clamp01(s.breeze) * swell;
    const step = 1 - 0.3 * clamp01(s.reveal);
    const hiCut = 1 - 0.75 * cloud;
    const inCloud = 1 - 0.3 * cloud; // the whiteout is muffled and a little quieter
    const lvl = (k: keyof typeof FULL): number => BREEZE[k] * br + FULL[k] * aa * lerp(1, GLIDE_SOFTEN[k], g);

    const tcL = 0.22;
    this.rumbleLvl.set(lvl('rumble') * step * inCloud, tcL);
    this.bodyLvl.set(lvl('body') * step * inCloud, tcL);
    this.hissLvl.set(lvl('hiss') * step * hiCut, tcL);
    this.whistleLvl.set(lvl('whistle') * step * (1 - cloud), 0.4);
    this.cloudLvl.set(cloud * (0.03 + 0.1 * a), 0.4);

    // brightness rises with airspeed
    const tcF = 0.3;
    this.rumbleLp.set(140 + 330 * a, tcF);
    this.bodyBp.set(420 * Math.pow(2, 2 * a), tcF);
    this.bodyQ.set(lerp(0.55, 0.8, g), 0.8);
    this.hissHp.set(2400 - 900 * a, tcF);
    this.hissLp.set(5200 + 4200 * a, tcF);
    const wf = 1150 * Math.pow(2, 0.8 * a);
    this.whistleF1.set(wf, 0.6);
    this.whistleF2.set(wf * 1.53, 0.6);
    this.cloudBp.set(280 * Math.pow(2, 0.8 * a), tcF);

    // gusts: strong & slow on the island, faster but shallower in free fall, smooth while gliding
    const depth = lerp(lerp(0.55, 0.16, g), 0.22, f);
    this.gust.setRate(0.12 + 0.38 * f + 0.1 * g, 0.8);
    this.gustToRumble.set(depth * 0.8, 0.6);
    this.gustToBody.set(depth, 0.6);
    this.gustToHiss.set(depth * 1.1, 0.6);
    this.gustToWhistle.set(Math.min(0.85, depth * 1.5), 0.6);
    this.gustToBright.set(lerp(lerp(380, 140, g), 220, f), 0.6);

    // turbulence buffeting
    const loose = s.airborne ? (1 - f) * (1 - g) * a : 0;
    this.buffet.setDepth(0.4 * f + 0.05 * g + 0.1 * loose, 0.25);
    this.buffet.setRate(1.4 + 1.8 * f, 0.4);
    this.pan.setDepth(lerp(0.35, 0.18, Math.max(f, g)), 1);

    // clothing flap
    const cloth = s.airborne ? CLOTH_FALL * Math.pow(f, 1.3) + 0.025 * g * a + 0.05 * loose : 0;
    this.clothLvl.set(cloth * step, 0.2);
    const flapsPerSec = g > 0.5 ? 4 + 8 * a : 5 + 20 * a;
    this.clothRate.set(flapsPerSec / FLAPS_PER_SEC, 0.3);
    this.clothBp.set(700 + 1000 * a, 0.3);

    // glider canopy: a quiet bed plus occasional flutter bursts
    if (g > 0.5) {
      if (now >= this.nextCanopyBurst) {
        this.canopyBurstUntil = now + rand(0.6, 2.2);
        this.nextCanopyBurst = this.canopyBurstUntil + rand(2.5, 8);
      }
    } else {
      this.nextCanopyBurst = now + rand(1.5, 4);
    }
    const burst = now < this.canopyBurstUntil ? 1 : 0.2;
    this.canopyLvl.setAsym(g * CANOPY_BURST * burst * (0.5 + a), 0.15, 0.7);
    this.canopyRate.set((4.5 + 5 * a) / FLAPS_PER_SEC, 0.5);
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
