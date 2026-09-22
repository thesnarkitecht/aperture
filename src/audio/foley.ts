/**
 * Foley one-shots: footsteps, jump, landing, glider deploy / fold.
 *
 * Every sound is assembled from two primitives:
 *   burst() – a noise buffer played from a random offset through a small filter
 *             chain and a gain envelope with one or more "hits" (e.g. heel + toe)
 *   thump() – a sine with a falling pitch envelope (body weight / impacts)
 * plus FM "glints" for the magical shimmer. Pitch, filter frequencies, timing and
 * levels are randomised on every call so no two steps are identical. All nodes of
 * a one-shot are stopped and disconnected when it ends.
 */
import { NoiseBank, FLAPS_PER_SEC, shotSource } from './noise';
import { biquad, clamp01, disposeOnEnd, gainNode, lerp, midiToHz, rand } from './util';

export type Surface = 'grass' | 'dirt' | 'rock';

// --- Tuning -----------------------------------------------------------------
/** Overall footstep level at intensity 1. */
const FOOT_LEVEL = 0.34;
/** Overall landing level at intensity 1. */
const LAND_LEVEL = 0.55;
/** Glider deploy / fold level. */
const GLIDER_LEVEL = 1.0;
/** Shimmer glint pitches (D major pentatonic, matching the score). */
const SHIMMER_NOTES = [81, 83, 86, 88, 90, 93, 95, 98];

interface FilterSpec {
  type: BiquadFilterType;
  f: number;
  q: number;
  /** optional exponential sweep target + duration */
  to?: number;
  sweep?: number;
}
interface Hit {
  at: number;
  amp: number;
  att: number;
  /** time (s) to decay by ~35 dB */
  dec: number;
}
interface BurstOpts {
  rate?: number;
  pan?: number;
  panTo?: number;
  dest?: AudioNode;
  /** amplitude-modulate with the cloth flap envelope at this many flaps/s */
  flutter?: number;
}

export class Foley {
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly bank: NoiseBank,
    private readonly out: AudioNode,
    private readonly magic: AudioNode,
  ) {}

  private get now(): number {
    return this.ctx.currentTime + 0.005;
  }

  // ---------------------------------------------------------------------------
  // Public sounds

  footstep(intensity: number, surface: Surface, at?: number): void {
    const t = at ?? this.now;
    const I = clamp01(intensity);
    const L = FOOT_LEVEL * (0.3 + 0.7 * I);
    const p = rand(0.87, 1.15) * (1 + 0.22 * I); // spectral jitter; harder steps are brighter
    const roll = lerp(0.075, 0.03, I) * rand(0.8, 1.25); // heel -> toe
    const toe = lerp(0.55, 0.25, I) * rand(0.7, 1.2);
    const rate = rand(0.9, 1.1);
    const b = this.bank;

    switch (surface) {
      case 'grass': {
        this.thump(t, 85 * p, 50 * p, 0.07, 0.3 * L);
        this.burst(b.pink, [{ type: 'lowpass', f: 650 * p, q: -3 }], [
          { at: t, amp: 0.5 * L, att: 0.003, dec: 0.06 },
          { at: t + roll, amp: 0.22 * L * toe, att: 0.004, dec: 0.05 },
        ], { rate });
        this.burst(b.pink, [
          { type: 'highpass', f: 2000 * p, q: -3 },
          { type: 'lowpass', f: 7500, q: -3 },
        ], [
          { at: t + 0.003, amp: 0.34 * L, att: 0.006, dec: lerp(0.15, 0.09, I) },
          { at: t + roll, amp: 0.3 * L * toe, att: 0.008, dec: 0.08 },
        ], { rate, pan: rand(-0.12, 0.12) });
        break;
      }
      case 'dirt': {
        this.thump(t, 90 * p, 55 * p, 0.06, 0.32 * L);
        this.burst(b.pink, [{ type: 'lowpass', f: 520 * p, q: -3 }], [
          { at: t, amp: 0.55 * L, att: 0.002, dec: 0.05 },
          { at: t + roll, amp: 0.25 * L * toe, att: 0.003, dec: 0.04 },
        ], { rate });
        this.burst(b.grit, [{ type: 'bandpass', f: 1500 * p, q: 0.9 }], [
          { at: t + 0.002, amp: 0.55 * L, att: 0.003, dec: 0.07 },
          { at: t + roll, amp: 0.4 * L * toe, att: 0.004, dec: 0.06 },
        ], { rate, pan: rand(-0.1, 0.1) });
        this.burst(b.grit, [{ type: 'highpass', f: 3600 * p, q: -3 }], [
          { at: t + 0.004, amp: 0.16 * L, att: 0.004, dec: 0.05 },
        ], { rate });
        break;
      }
      case 'rock': {
        this.thump(t, 115 * p, 70 * p, 0.045, 0.24 * L);
        this.burst(b.white, [
          { type: 'bandpass', f: 2600 * p, q: 1.1 },
          { type: 'lowpass', f: 7000, q: -3 },
        ], [
          { at: t, amp: 0.3 * L, att: 0.0015, dec: 0.025 },
          { at: t + roll, amp: 0.22 * L * toe, att: 0.0015, dec: 0.02 },
        ], { rate });
        this.burst(b.pink, [{ type: 'bandpass', f: 650 * p, q: 1.4 }], [
          { at: t, amp: 0.55 * L, att: 0.002, dec: 0.04 },
        ], { rate });
        this.burst(b.grit, [{ type: 'highpass', f: 2800 * p, q: -3 }], [
          { at: t + 0.006, amp: 0.14 * L, att: 0.004, dec: 0.06 },
          { at: t + roll + 0.004, amp: 0.12 * L * toe, att: 0.004, dec: 0.05 },
        ], { rate, pan: rand(-0.1, 0.1) });
        break;
      }
    }
  }

  jump(surface: Surface): void {
    const t = this.now;
    this.footstep(0.9, surface, t); // push-off
    // body moving through the air
    this.burst(this.bank.pink, [{ type: 'bandpass', f: 280, q: 1.0, to: 1000, sweep: 0.3 }], [
      { at: t + 0.02, amp: 0.06, att: 0.07, dec: 0.28 },
    ]);
    // clothes rustle
    this.burst(this.bank.pink, [
      { type: 'highpass', f: 1800, q: -3 },
      { type: 'lowpass', f: 6500, q: -3 },
    ], [{ at: t + 0.03, amp: 0.035, att: 0.03, dec: 0.22 }], { flutter: 16, pan: rand(-0.15, 0.15) });
  }

  land(intensity: number, surface: Surface): void {
    const t = this.now;
    const I = clamp01(intensity);
    const L = LAND_LEVEL * (0.35 + 0.65 * I);
    const b = this.bank;
    this.thump(t, 75, 38, 0.12 + 0.15 * I, 0.55 * L);
    this.burst(b.pink, [{ type: 'lowpass', f: 500 + 1500 * I, q: -3 }], [
      { at: t, amp: 0.65 * L, att: 0.002, dec: 0.07 + 0.08 * I },
    ]);
    switch (surface) {
      case 'grass':
        this.burst(b.pink, [
          { type: 'highpass', f: 1800, q: -3 },
          { type: 'lowpass', f: 7000, q: -3 },
        ], [{ at: t + 0.004, amp: 0.32 * L, att: 0.005, dec: 0.16 + 0.12 * I }], { pan: rand(-0.1, 0.1) });
        break;
      case 'dirt':
        this.burst(b.grit, [{ type: 'bandpass', f: 1400, q: 0.8 }], [
          { at: t + 0.003, amp: 0.5 * L, att: 0.003, dec: 0.14 + 0.1 * I },
        ]);
        break;
      case 'rock':
        this.burst(b.white, [
          { type: 'bandpass', f: 2400, q: 1.2 },
          { type: 'lowpass', f: 7000, q: -3 },
        ], [{ at: t, amp: 0.3 * L, att: 0.0015, dec: 0.035 }]);
        this.burst(b.grit, [{ type: 'highpass', f: 2800, q: -3 }], [
          { at: t + 0.005, amp: 0.2 * L, att: 0.004, dec: 0.1 },
        ]);
        break;
    }
    // clothes settling
    this.burst(b.pink, [{ type: 'bandpass', f: 1500, q: 0.8 }], [
      { at: t + 0.04, amp: 0.1 * L, att: 0.02, dec: 0.18 },
    ], { flutter: 12 });
    // small debris scatter on hard ground
    if (I > 0.55 && surface !== 'grass') {
      const hits: Hit[] = [];
      let at = t + rand(0.06, 0.1);
      const n = 3 + Math.floor(rand(0, 3));
      for (let i = 0; i < n; i++) {
        hits.push({ at, amp: 0.12 * L * (1 - i / (n + 1)), att: 0.002, dec: 0.03 });
        at += rand(0.05, 0.11);
      }
      this.burst(b.grit, [{ type: 'bandpass', f: 3000, q: 0.9 }], hits, { pan: rand(-0.3, 0.3) });
    }
    // heavy landings get a deeper body
    if (I > 0.7) this.thump(t + 0.005, 55, 30, 0.3, 0.35 * L);
  }

  /** Magical cloth unfurl: rising whoosh, fabric flutter, snap + whump as it fills, soft shimmer. */
  gliderDeploy(): void {
    const t = this.now;
    const b = this.bank;
    const G = GLIDER_LEVEL;
    // 1. rising whoosh, sweeping across the stereo field
    this.burst(b.pink, [{ type: 'bandpass', f: 260, q: 0.9, to: 1900, sweep: 0.55 }], [
      { at: t, amp: 0.2 * G, att: 0.42, dec: 0.4 },
    ], { pan: -0.35, panTo: 0.25 });
    // 2. fabric unfurling flutter
    this.burst(b.pink, [
      { type: 'highpass', f: 1300, q: -3 },
      { type: 'lowpass', f: 6500, q: -3 },
    ], [{ at: t + 0.16, amp: 0.1 * G, att: 0.18, dec: 0.22 }], { flutter: 24, pan: rand(-0.2, 0.2) });
    // 3. snap as the canopy catches air (double pop)
    const ts = t + 0.5;
    this.burst(b.pink, [
      { type: 'bandpass', f: 1200, q: 0.7 },
      { type: 'lowpass', f: 6000, q: -3 },
    ], [
      { at: ts, amp: 0.26 * G, att: 0.0015, dec: 0.05 },
      { at: ts + 0.075, amp: 0.13 * G, att: 0.0015, dec: 0.04 },
    ]);
    // 4. whump of the canopy filling
    this.thump(ts, 92, 48, 0.3, 0.26 * G);
    this.burst(b.pink, [{ type: 'lowpass', f: 280, q: -3 }], [{ at: ts, amp: 0.4 * G, att: 0.012, dec: 0.32 }]);
    // 5. shimmer: ascending soft glints and a breath of airy sparkle
    let tg = t + 0.42;
    const start = Math.floor(rand(0, 2));
    const count = 6;
    for (let i = 0; i < count; i++) {
      const m = SHIMMER_NOTES[Math.min(SHIMMER_NOTES.length - 1, start + i)];
      this.glint(tg, midiToHz(m), 0.024 * G * (1 - i * 0.09), rand(-0.6, 0.6), rand(1.1, 1.8));
      tg += rand(0.07, 0.12);
    }
    this.burst(b.white, [
      { type: 'highpass', f: 6500, q: -3 },
      { type: 'lowpass', f: 12000, q: -3 },
    ], [{ at: t + 0.45, amp: 0.022 * G, att: 0.3, dec: 1.1 }], { dest: this.magic, pan: 0.1, panTo: -0.1 });
  }

  /** Glider folding away: descending whoosh, fabric rustle, soft flump, faint falling shimmer. */
  gliderFold(): void {
    const t = this.now;
    const b = this.bank;
    const G = GLIDER_LEVEL;
    this.burst(b.pink, [{ type: 'bandpass', f: 1600, q: 0.9, to: 320, sweep: 0.45 }], [
      { at: t, amp: 0.14 * G, att: 0.07, dec: 0.45 },
    ], { pan: 0.2, panTo: -0.2 });
    this.burst(b.pink, [
      { type: 'highpass', f: 1500, q: -3 },
      { type: 'lowpass', f: 6000, q: -3 },
    ], [{ at: t + 0.03, amp: 0.08 * G, att: 0.05, dec: 0.3 }], { flutter: 18 });
    const tf = t + 0.3;
    this.thump(tf, 100, 60, 0.2, 0.14 * G);
    this.burst(b.pink, [{ type: 'lowpass', f: 420, q: -3 }], [{ at: tf, amp: 0.16 * G, att: 0.008, dec: 0.16 }]);
    const notes = [90, 86, 81];
    for (let i = 0; i < notes.length; i++) {
      this.glint(t + 0.08 + i * rand(0.08, 0.11), midiToHz(notes[i]), 0.012 * G, rand(-0.4, 0.4), 1.0);
    }
  }

  // ---------------------------------------------------------------------------
  // Primitives

  private burst(buf: AudioBuffer, filters: FilterSpec[], hits: Hit[], o: BurstOpts = {}): void {
    if (hits.length === 0) return;
    const c = this.ctx;
    const t0 = hits[0].at;
    let tEnd = t0;
    for (const h of hits) tEnd = Math.max(tEnd, h.at + h.att + h.dec * 1.6);
    const src = shotSource(c, buf, t0, tEnd - t0 + 0.02, o.rate ?? 1);
    const nodes: AudioNode[] = [src];
    let head: AudioNode = src;
    for (const fs of filters) {
      const f = biquad(c, fs.type, fs.f, fs.q);
      if (fs.to !== undefined && fs.sweep) {
        f.frequency.setValueAtTime(fs.f, t0);
        f.frequency.exponentialRampToValueAtTime(fs.to, t0 + fs.sweep);
      }
      head.connect(f);
      head = f;
      nodes.push(f);
    }
    if (o.flutter) {
      const vca = gainNode(c, 0.15);
      const env = c.createBufferSource();
      env.buffer = this.bank.flap;
      env.loop = true;
      env.playbackRate.value = o.flutter / FLAPS_PER_SEC;
      env.connect(vca.gain);
      env.start(t0, Math.random() * this.bank.flap.duration);
      env.stop(tEnd + 0.02);
      head.connect(vca);
      head = vca;
      nodes.push(vca, env);
    }
    const g = gainNode(c, 0);
    head.connect(g);
    nodes.push(g);
    const gp = g.gain;
    gp.setValueAtTime(0, t0);
    hits.forEach((h, i) => {
      if (i === 0) {
        gp.linearRampToValueAtTime(h.amp, h.at + h.att);
      } else {
        gp.setTargetAtTime(h.amp, h.at, h.att / 2.5);
      }
      gp.setTargetAtTime(0, h.at + h.att, h.dec / 4);
    });
    let tail: AudioNode = g;
    if (o.pan !== undefined) {
      const p = c.createStereoPanner();
      p.pan.setValueAtTime(o.pan, t0);
      if (o.panTo !== undefined) p.pan.linearRampToValueAtTime(o.panTo, tEnd);
      g.connect(p);
      tail = p;
      nodes.push(p);
    }
    tail.connect(o.dest ?? this.out);
    disposeOnEnd(src, nodes);
  }

  private thump(at: number, f0: number, f1: number, dec: number, amp: number): void {
    const c = this.ctx;
    const osc = c.createOscillator();
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f1, at + dec);
    const g = gainNode(c, 0);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(amp, at + 0.004);
    g.gain.setTargetAtTime(0, at + 0.004, dec / 4);
    osc.connect(g).connect(this.out);
    osc.start(at);
    osc.stop(at + dec * 1.7 + 0.01);
    disposeOnEnd(osc, [osc, g]);
  }

  /** Soft glassy FM tone for the magical shimmer; routed to the reverb-heavy magic bus. */
  private glint(at: number, f: number, amp: number, pan: number, decay: number): void {
    const c = this.ctx;
    const car = c.createOscillator();
    car.frequency.value = f * rand(0.997, 1.003);
    const mod = c.createOscillator();
    mod.frequency.value = f * 3;
    const idx = gainNode(c, 0);
    idx.gain.setValueAtTime(f * 3 * 0.45, at);
    idx.gain.setTargetAtTime(0, at, 0.12);
    mod.connect(idx).connect(car.frequency);
    const g = gainNode(c, 0);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(amp, at + 0.025);
    g.gain.setTargetAtTime(0, at + 0.025, decay / 4);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    car.connect(g).connect(p).connect(this.magic);
    const end = at + 0.025 + decay * 1.6;
    car.start(at);
    mod.start(at);
    car.stop(end);
    mod.stop(end);
    disposeOnEnd(car, [car, mod, idx, g, p]);
  }
}
