/**
 * Original generative ambient score (D major / Lydian colour, ~60 bpm feel).
 *
 * Layers
 *  - Pads: each chord is a fresh "layer" of detuned oscillator pairs (split hard
 *    left/right for width) with a slow attack and long release, so consecutive
 *    chords crossfade into a warm wash. All layers share one low-pass whose
 *    cutoff opens with intensity (and slowly wanders), plus a big reverb send.
 *    Chords follow a weighted Markov graph; more voices (bass, high colour
 *    tones) join as intensity rises.
 *  - Plucks: sparse harp/bell-like FM tones from D major pentatonic, filtered to
 *    the pitch classes that are consonant with the current chord, moving by a
 *    melodic random walk, through a dark ping-pong delay. At higher intensity
 *    chord changes also get a soft rolled arpeggio.
 *  - Motif: when intensity crosses ~0.42 (the world reveal / glide) a slow,
 *    original melodic phrase plays over its own chord sequence on a soft
 *    legato "glass flute" voice with delayed vibrato. Phrases alternate and
 *    repeat at most every ~40 s.
 *
 * Levels are deliberately low; the score sits well under the wind.
 */
import { NoiseBank, RandomLfo } from './noise';
import {
  SmoothParam,
  approach,
  biquad,
  clamp01,
  gainNode,
  lerp,
  midiToHz,
  pick,
  rand,
  weighted,
} from './util';

export interface MusicInput {
  now: number;
  dt: number;
  /** 0..1 emotional intensity (world reveal, glide). */
  intensity: number;
  /** 0..1 thinning (free fall). */
  thin: number;
  paused: boolean;
}

// --- Tuning -----------------------------------------------------------------
/** Overall score level (gate on both dry and reverb send). */
const MUSIC_LEVEL = 0.34;
/** Peak gain of one pad chord layer. */
const PAD_PEAK = 0.022;
/** Peak gain of a pluck at velocity 1. */
const PLUCK_PEAK = 0.05;
/** Peak gain of the motif voice. */
const LEAD_PEAK = 0.05;
/** Reverb send amounts per layer. */
const SEND = { pad: 0.6, pluck: 0.5, lead: 0.55 };
/** Scheduling look-ahead (s). */
const LOOKAHEAD = 0.15;

/** Pitch classes of D major pentatonic (D E F# A B). */
export const PENTATONIC_PCS = [2, 4, 6, 9, 11];

type ChordId = 'I' | 'V6' | 'vi' | 'IV' | 'iii' | 'ii' | 'Vsus';
interface Chord {
  bass: number;
  pad: number[];
  high: number[];
  /** pitch classes that sit well over this chord (for plucks) */
  safe: number[];
  next: [ChordId, number][];
}

const ALL = [2, 4, 6, 9, 11];
const CHORDS: Record<ChordId, Chord> = {
  // Dmaj9
  I: { bass: 38, pad: [57, 61, 64, 66], high: [69, 73], safe: ALL, next: [['V6', 2], ['vi', 3], ['IV', 3], ['iii', 1]] },
  // A(add9)/C#
  V6: { bass: 37, pad: [57, 61, 64, 71], high: [69, 76], safe: [4, 6, 9, 11], next: [['vi', 3], ['IV', 2]] },
  // Bm7(add11)
  vi: { bass: 35, pad: [57, 62, 64, 66], high: [71, 74], safe: ALL, next: [['IV', 3], ['iii', 1], ['Vsus', 2], ['ii', 1]] },
  // Gmaj9(#11) – the Lydian lift
  IV: { bass: 43, pad: [59, 62, 66, 69], high: [73, 74], safe: ALL, next: [['I', 4], ['vi', 2], ['Vsus', 2], ['ii', 1]] },
  // F#m7
  iii: { bass: 42, pad: [57, 61, 64, 69], high: [73, 76], safe: [4, 6, 9, 11], next: [['IV', 3], ['vi', 2]] },
  // Em9
  ii: { bass: 40, pad: [55, 59, 62, 66], high: [71, 74], safe: ALL, next: [['Vsus', 3], ['I', 1], ['IV', 1]] },
  // Asus4(add9)
  Vsus: { bass: 45, pad: [57, 59, 62, 64], high: [69, 71], safe: ALL, next: [['I', 4], ['vi', 2], ['IV', 1]] },
};

interface MotifNote {
  m: number;
  t: number;
  d: number;
}
interface Motif {
  chords: ChordId[];
  durs: number[];
  notes: MotifNote[];
}

/** Original phrases (times in seconds from phrase start). */
const MOTIFS: Motif[] = [
  {
    chords: ['IV', 'I', 'vi', 'Vsus', 'I'],
    durs: [6, 6, 6, 6, 9],
    notes: [
      { m: 69, t: 0, d: 1 }, { m: 74, t: 1, d: 1 }, { m: 76, t: 2, d: 3.5 },
      { m: 78, t: 6, d: 1.5 }, { m: 76, t: 7.5, d: 0.5 }, { m: 74, t: 8, d: 1 }, { m: 69, t: 9, d: 2.5 },
      { m: 71, t: 12, d: 1 }, { m: 74, t: 13, d: 1 }, { m: 78, t: 14, d: 2 }, { m: 76, t: 16, d: 1.5 },
      { m: 74, t: 18, d: 1 }, { m: 76, t: 19, d: 1 }, { m: 81, t: 20, d: 3.5 },
      { m: 78, t: 24, d: 5.5 },
    ],
  },
  {
    chords: ['vi', 'IV', 'I', 'Vsus', 'I'],
    durs: [6, 6, 6, 6, 9],
    notes: [
      { m: 78, t: 0, d: 1 }, { m: 76, t: 1, d: 1 }, { m: 74, t: 2, d: 1 }, { m: 71, t: 3, d: 2.5 },
      { m: 69, t: 6, d: 1 }, { m: 71, t: 7, d: 1 }, { m: 74, t: 8, d: 1 }, { m: 76, t: 9, d: 2.5 },
      { m: 78, t: 12, d: 1 }, { m: 81, t: 13, d: 2 }, { m: 78, t: 15, d: 0.75 }, { m: 76, t: 15.75, d: 1.75 },
      { m: 76, t: 18, d: 1.5 }, { m: 74, t: 19.5, d: 0.5 }, { m: 76, t: 20, d: 3.5 },
      { m: 74, t: 24, d: 5.5 },
    ],
  },
];

/** Pentatonic notes from A2 to B6. */
const SCALE: number[] = [];
for (let m = 45; m <= 95; m++) if (PENTATONIC_PCS.includes(m % 12)) SCALE.push(m);

interface Layer {
  envs: GainNode[];
  start: number;
  end: number;
}

export class Music {
  private readonly nodes: AudioNode[] = [];
  private readonly lfos: RandomLfo[] = [];
  private readonly padIn: GainNode;
  private readonly padMerge: ChannelMergerNode;
  private readonly pluckIn: GainNode;
  private readonly leadIn: GainNode;
  private readonly gateDry: SmoothParam;
  private readonly gateWet: SmoothParam;
  private readonly padLvl: SmoothParam;
  private readonly padCut: SmoothParam;
  private readonly pluckLvl: SmoothParam;
  private readonly leadLvl: SmoothParam;
  private readonly warm: PeriodicWave;
  private readonly airy: PeriodicWave;

  private enabled = true;
  private intensity = 0;
  private thin = 0;
  private chord: ChordId = 'I';
  private nextChordAt: number;
  private queue: { id: ChordId; dur: number }[] = [{ id: 'I', dur: 13 }];
  private layer: Layer | null = null;
  private nextPluckAt: number;
  private pluckIdx: number;
  private motifIndex = 0;
  private motifUntil = 0;
  private nextMotifAllowed = 0;

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

    const dry = track(gainNode(c, 0));
    const wet = track(gainNode(c, 0));
    dry.connect(out);
    wet.connect(reverbIn);
    this.gateDry = sp(dry.gain);
    this.gateWet = sp(wet.gain);

    // pads
    this.padIn = track(gainNode(c, 1));
    this.padMerge = track(c.createChannelMerger(2));
    this.padMerge.connect(this.padIn);
    const padHp = track(biquad(c, 'highpass', 55, -3));
    const padLp = track(biquad(c, 'lowpass', 600, -2));
    const padLvl = track(gainNode(c, 0.6));
    this.padIn.connect(padHp).connect(padLp).connect(padLvl);
    padLvl.connect(dry);
    padLvl.connect(track(gainNode(c, SEND.pad))).connect(wet);
    const wander = new RandomLfo(c, bank, 0.05, 260, 2).connect(padLp.detune);
    this.lfos.push(wander);
    this.padLvl = sp(padLvl.gain);
    this.padCut = sp(padLp.frequency);

    // plucks with a dark ping-pong delay
    this.pluckIn = track(gainNode(c, 1));
    const pluckLvl = track(gainNode(c, 1));
    this.pluckIn.connect(pluckLvl);
    pluckLvl.connect(dry);
    pluckLvl.connect(track(gainNode(c, SEND.pluck))).connect(wet);
    const dIn = track(gainNode(c, 0.22));
    const dL = track(c.createDelay(2));
    const dR = track(c.createDelay(2));
    dL.delayTime.value = 0.5;
    dR.delayTime.value = 0.75;
    const fbLp = track(biquad(c, 'lowpass', 2400, -3));
    const fb = track(gainNode(c, 0.33));
    const merge = track(c.createChannelMerger(2));
    pluckLvl.connect(dIn).connect(dL);
    dL.connect(merge, 0, 0);
    dL.connect(dR);
    dR.connect(merge, 0, 1);
    dR.connect(fbLp).connect(fb).connect(dL);
    merge.connect(dry);
    this.pluckLvl = sp(pluckLvl.gain);

    // motif voice
    this.leadIn = track(gainNode(c, 1));
    const leadLvl = track(gainNode(c, 1));
    this.leadIn.connect(leadLvl);
    leadLvl.connect(dry);
    leadLvl.connect(track(gainNode(c, SEND.lead))).connect(wet);
    this.leadLvl = sp(leadLvl.gain);

    this.warm = makeWave(c, (n) => (1 / Math.pow(n, 1.7)) * (n % 2 === 0 ? 0.75 : 1), 24);
    this.airy = makeWave(c, (n) => (n === 1 ? 1 : n === 2 ? 0.12 : n === 3 ? 0.04 : 0), 4);

    this.nextChordAt = c.currentTime + 1.2;
    this.nextPluckAt = c.currentTime + rand(5, 9);
    this.pluckIdx = SCALE.indexOf(74);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  update(s: MusicInput): void {
    const now = s.now;
    const dt = s.dt;
    const target = clamp01(s.intensity);
    this.intensity = approach(this.intensity, target, dt, target > this.intensity ? 1.2 : 6);
    this.thin = approach(this.thin, clamp01(s.thin), dt, 1.2);
    const I = this.intensity;
    const th = this.thin * (1 - I);

    const gate = this.enabled ? MUSIC_LEVEL : 0;
    this.gateDry.set(gate, this.enabled ? 1.2 : 0.6);
    this.gateWet.set(gate, this.enabled ? 1.2 : 0.6);
    this.padLvl.set((0.55 + 0.35 * I) * (1 - 0.7 * th), 1.5);
    this.padCut.set(520 * Math.pow(2, 2.3 * I) * (1 - 0.35 * th), 1.5);
    this.pluckLvl.set((0.8 + 0.2 * I) * (1 - 0.85 * th), 1);
    this.leadLvl.set(1 - 0.5 * th, 1);

    if (!this.enabled) return;

    // recover after the context was suspended / music was off for a while
    if (this.nextChordAt < now - 1) this.nextChordAt = now + 0.3;
    if (this.nextPluckAt < now - 1) this.nextPluckAt = now + rand(1, 3);

    // the reveal motif
    if (!s.paused && I > 0.42 && now >= this.nextMotifAllowed && now >= this.motifUntil) this.startMotif(now + 0.4);

    if (now + LOOKAHEAD >= this.nextChordAt) {
      const next = this.queue.shift() ?? { id: weighted(CHORDS[this.chord].next), dur: this.chordDur() };
      const t = this.nextChordAt;
      this.playChord(next.id, t, next.dur);
      if (I > 0.45 && th < 0.5) this.arpeggio(next.id, t + 0.08, t < this.motifUntil ? 0.5 : 0.85);
      this.chord = next.id;
      this.nextChordAt = t + next.dur;
    }

    if (now + LOOKAHEAD >= this.nextPluckAt) {
      const t = this.nextPluckAt;
      this.schedulePluck(t, I, th);
    }
  }

  // ---------------------------------------------------------------------------

  private chordDur(): number {
    const d = lerp(13, 8, this.intensity) * rand(0.9, 1.1);
    return Math.round(d * 2) / 2;
  }

  private playChord(id: ChordId, t: number, dur: number): void {
    const c = this.ctx;
    const ch = CHORDS[id];
    const I = this.intensity;
    // release the previous layer (it may still be sustaining if the motif cut it short)
    if (this.layer && this.layer.end > t) this.release(this.layer, t);

    // one envelope per side; detuned oscillator pairs are split hard left / right
    const envL = gainNode(c, 0);
    const envR = gainNode(c, 0);
    envL.connect(this.padMerge, 0, 0);
    envR.connect(this.padMerge, 0, 1);
    const att = Math.min(4.5, dur * 0.45);
    for (const e of [envL, envR]) {
      e.gain.setValueAtTime(0, t);
      e.gain.setTargetAtTime(PAD_PEAK, t, att / 3);
      e.gain.setTargetAtTime(0, t + dur, 2.4);
    }
    const stopAt = t + dur + 2.4 * 5.5;
    const oscs: OscillatorNode[] = [];
    const extra: AudioNode[] = [envL, envR];

    const pair = (m: number, wave: PeriodicWave | null, left: AudioNode, right: AudioNode, spread: number): void => {
      for (let side = 0; side < 2; side++) {
        const o = c.createOscillator();
        if (wave) o.setPeriodicWave(wave);
        o.frequency.value = midiToHz(m);
        o.detune.value = (side === 0 ? -1 : 1) * spread + rand(-2, 2);
        o.connect(side === 0 ? left : right);
        oscs.push(o);
      }
    };

    const notes = ch.pad.slice();
    // in the calm opening, sometimes leave out an inner voice to keep it airy
    if (I < 0.3 && Math.random() < 0.35) notes.splice(1 + Math.floor(Math.random() * (notes.length - 1)), 1);
    for (const m of notes) pair(m, this.warm, envL, envR, rand(4, 8));

    if (I > 0.28) {
      // centred bass: sine root plus a soft octave
      const bg = gainNode(c, 0.4 * Math.min(1, (I - 0.28) * 3));
      bg.connect(envL);
      bg.connect(envR);
      extra.push(bg);
      pair(ch.bass, null, bg, bg, 3);
      pair(ch.bass + 12, this.airy, bg, bg, 5);
    }
    if (I > 0.5) {
      // high colour tones, slightly off-centre
      const lvl = 0.35 * Math.min(1, (I - 0.5) * 3);
      const tilt = rand(-0.25, 0.25);
      const hgL = gainNode(c, lvl * (1 - tilt));
      const hgR = gainNode(c, lvl * (1 + tilt));
      hgL.connect(envL);
      hgR.connect(envR);
      extra.push(hgL, hgR);
      for (const m of ch.high) pair(m, this.airy, hgL, hgR, 6);
    }

    for (const o of oscs) {
      o.start(t);
      o.stop(stopAt);
    }
    const last = oscs[oscs.length - 1];
    last.onended = () => {
      for (const o of oscs) o.disconnect();
      for (const n of extra) n.disconnect();
    };
    this.layer = { envs: [envL, envR], start: t, end: t + dur };
  }

  private release(layer: Layer, at: number): void {
    const t = Math.max(at, layer.start + 0.05);
    for (const e of layer.envs) {
      e.gain.cancelScheduledValues(t);
      e.gain.setTargetAtTime(0, t, 1.8);
    }
    layer.end = t;
  }

  private schedulePluck(t: number, I: number, th: number): void {
    const inMotif = t < this.motifUntil;
    if (th < 0.7) {
      const safe = CHORDS[this.chord].safe;
      const lo = inMotif ? 57 : I > 0.5 ? 62 : 69;
      const hi = inMotif ? 71 : I > 0.5 ? 88 : 86;
      const m = this.walk(lo, hi, safe);
      const vel = rand(0.5, 1) * (inMotif ? 0.6 : 1);
      const bell = I > 0.5 && Math.random() < 0.25;
      this.pluck(t, m, vel, rand(-0.5, 0.5), bell);
      // occasional gentle answering note
      if (I > 0.6 && !inMotif && Math.random() < 0.25) {
        const idx = SCALE.indexOf(m);
        const m2 = SCALE[Math.max(0, Math.min(SCALE.length - 1, idx + pick([-2, 2, 3])))];
        if (safe.includes(m2 % 12)) this.pluck(t + pick([0.25, 0.5]), m2, vel * 0.6, rand(-0.5, 0.5), false);
      }
    }
    const base = inMotif ? rand(2.5, 5) : lerp(rand(3.5, 8), rand(0.9, 2.6), I);
    const interval = Math.max(0.5, Math.round(base * (1 + 3 * th) * 4) / 4);
    this.nextPluckAt = t + interval;
  }

  /** Melodic random walk over the pentatonic scale, constrained to [lo, hi] and chord-safe tones. */
  private walk(lo: number, hi: number, safe: number[]): number {
    let idx = this.pluckIdx + pick([-2, -1, -1, 1, 1, 2, 0, 3, -3]);
    const loI = SCALE.findIndex((m) => m >= lo);
    let hiI = SCALE.length - 1;
    while (hiI > 0 && SCALE[hiI] > hi) hiI--;
    if (idx < loI) idx = loI + 1;
    if (idx > hiI) idx = hiI - 1;
    idx = Math.max(loI, Math.min(hiI, idx));
    // nudge to the nearest chord-safe tone
    for (let k = 0; k < 4 && !safe.includes(SCALE[idx] % 12); k++) idx += idx > (loI + hiI) / 2 ? -1 : 1;
    this.pluckIdx = idx;
    return SCALE[idx];
  }

  private arpeggio(id: ChordId, t: number, level: number): void {
    const ch = CHORDS[id];
    const pool = Array.from(new Set([...ch.pad.map((m) => m + 12), ...ch.high, ch.bass + 24])).sort((a, b) => a - b);
    const n = Math.min(pool.length, 4 + Math.floor(rand(0, 2)));
    const start = Math.floor(rand(0, Math.max(1, pool.length - n + 1)));
    let at = t;
    for (let i = 0; i < n; i++) {
      this.pluck(at, pool[start + i], level * (0.85 - i * 0.08), lerp(-0.4, 0.4, i / Math.max(1, n - 1)), false);
      at += rand(0.13, 0.19);
    }
  }

  /** Harp-like (ratio 1) or bell-like (inharmonic ratio) FM pluck with a softly decaying index. */
  private pluck(t: number, m: number, vel: number, pan: number, bell: boolean): void {
    const c = this.ctx;
    const f = midiToHz(m) * Math.pow(2, rand(-3, 3) / 1200);
    const ratio = bell ? 3.5 : 1;
    const index = bell ? 1.1 : 1.3;
    const car = c.createOscillator();
    car.frequency.value = f;
    const mod = c.createOscillator();
    mod.frequency.value = f * ratio;
    const dev = gainNode(c, 0);
    const peakDev = f * ratio * index;
    dev.gain.setValueAtTime(peakDev, t);
    dev.gain.setTargetAtTime(peakDev * 0.06, t, bell ? 0.45 : 0.09);
    mod.connect(dev).connect(car.frequency);
    const amp = gainNode(c, 0);
    const decay = lerp(1.2, 0.65, clamp01((m - 57) / 36)) * (bell ? 1.5 : 1);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(PLUCK_PEAK * vel, t + 0.008);
    amp.gain.setTargetAtTime(0, t + 0.008, decay);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    car.connect(amp).connect(p).connect(this.pluckIn);
    const end = t + 0.01 + decay * 6.5;
    car.start(t);
    mod.start(t);
    car.stop(end);
    mod.stop(end);
    car.onended = () => {
      for (const n of [car, mod, dev, amp, p]) n.disconnect();
    };
  }

  private startMotif(t: number): void {
    const motif = MOTIFS[this.motifIndex % MOTIFS.length];
    this.motifIndex++;
    // steer the harmony onto the phrase's chords, starting at t
    this.queue = motif.chords.map((id, i) => ({ id, dur: motif.durs[i] }));
    this.nextChordAt = t;
    const total = motif.durs.reduce((a, b) => a + b, 0);
    this.motifUntil = t + total;
    this.nextMotifAllowed = this.motifUntil + 40;
    this.nextPluckAt = Math.max(this.nextPluckAt, t + 2);
    this.playLead(t, motif.notes);
  }

  /** One persistent legato voice for the whole phrase: pitch glides and amplitude dips between notes. */
  private playLead(t0: number, notes: MotifNote[]): void {
    const c = this.ctx;
    const o1 = c.createOscillator();
    o1.type = 'triangle';
    const o2 = c.createOscillator();
    const o2g = gainNode(c, 0.16);
    const vib = c.createOscillator();
    vib.frequency.value = 4.8;
    const vibG = gainNode(c, 0);
    vib.connect(vibG);
    vibG.connect(o1.detune);
    vibG.connect(o2.detune);
    const lp = biquad(c, 'lowpass', 2600, -3);
    const amp = gainNode(c, 0);
    o1.connect(lp);
    o2.connect(o2g).connect(lp);
    lp.connect(amp).connect(this.leadIn);

    amp.gain.setValueAtTime(0, t0);
    let end = t0;
    notes.forEach((n, i) => {
      const f = midiToHz(n.m);
      const ts = t0 + n.t;
      const te = ts + n.d;
      const prev = notes[i - 1];
      const next = notes[i + 1];
      const legatoIn = !!prev && Math.abs(prev.t + prev.d - n.t) < 0.02;
      const legatoOut = !!next && Math.abs(n.t + n.d - next.t) < 0.02;
      const peak = LEAD_PEAK * (n.d >= 2 ? 1 : 0.88);
      if (i === 0) {
        o1.frequency.setValueAtTime(f, ts);
        o2.frequency.setValueAtTime(f * 2, ts);
      } else {
        o1.frequency.setTargetAtTime(f, ts - 0.02, 0.03);
        o2.frequency.setTargetAtTime(f * 2, ts - 0.02, 0.03);
      }
      amp.gain.setTargetAtTime(peak, ts, legatoIn ? 0.05 : 0.14);
      // delayed, gently swelling vibrato
      vibG.gain.setTargetAtTime(0, ts, 0.06);
      vibG.gain.setTargetAtTime(n.d > 0.9 ? 13 : 6, ts + 0.35, 0.45);
      if (legatoOut) amp.gain.setTargetAtTime(peak * 0.7, te - 0.06, 0.025);
      else amp.gain.setTargetAtTime(0, te - 0.08, n.d > 3 ? 0.45 : 0.2);
      end = te;
    });
    const stopAt = end + 3;
    for (const o of [o1, o2, vib]) {
      o.start(t0);
      o.stop(stopAt);
    }
    o1.onended = () => {
      for (const n of [o1, o2, o2g, vib, vibG, lp, amp]) n.disconnect();
    };
  }

  dispose(): void {
    for (const l of this.lfos) l.stop();
    for (const n of this.nodes) n.disconnect();
  }
}

function makeWave(c: BaseAudioContext, amp: (n: number) => number, harmonics: number): PeriodicWave {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) imag[n] = amp(n);
  return c.createPeriodicWave(real, imag);
}
