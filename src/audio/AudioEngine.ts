/**
 * AudioEngine – public facade of the fully procedural soundscape (Web Audio only,
 * no audio files). Everything is synthesised at runtime from noise buffers,
 * oscillators, filters and envelopes.
 *
 * Signal graph (one master chain):
 *
 *   Wind ───────► windBus  ─┐
 *   Ambience ───► ambBus   ─┤
 *   Foley ──────► foleyBus ─┼─► mix ─► muffle LP ×2 ─► pause duck ─► master ─► HP 28 Hz ─► compressor ─► limiter ─► out
 *   Music ──────► musicBus ─┤          (cloud)
 *   sends ──────► reverb ───┘
 *
 * All continuous parameters are driven from update() with setTargetAtTime (via
 * SmoothParam), so nothing ever jumps. Every public method is a silent no-op
 * until unlock() succeeded, and nothing here throws into the game loop.
 */
import { Ambience } from './ambience';
import { Foley, Surface } from './foley';
import { Music } from './music';
import { getNoiseBank } from './noise';
import { Reverb, createReverb } from './reverb';
import { SmoothParam, approach, biquad, clamp, clamp01, finite, gainNode, lerp, smoothstep } from './util';
import { Wind } from './wind';

export type { Surface } from './foley';

export interface AudioState {
  grounded: boolean;
  speed: number;            // horizontal ground speed, m/s (0 idle, ~1.5 walk, ~5.5 run, ~8 sprint)
  verticalSpeed: number;    // m/s, negative = falling (free fall reaches about -55..-65)
  airspeed: number;         // total speed relative to air, m/s (0..70)
  altitude: number;         // world Y in meters (island ~1650, cloud layer 850..1250, ground ~50)
  cloudDensity: number;     // 0..1, how deep inside cloud the camera is (1 = whiteout)
  belowClouds: boolean;     // camera is beneath the cloud deck
  gliding: boolean;
  inGrass: number;          // 0..1 how grassy the ground under the character is
  waterfallDistance: number;// meters to nearest waterfall (Infinity if none)
  reveal: number;           // 0..1 cinematic "world reveal" intensity (drives the music swell)
  paused: boolean;
}

export interface AudioEngineOptions {
  /** Use an existing context instead of creating one (e.g. an OfflineAudioContext for offline renders). */
  context?: BaseAudioContext;
}

// --- Tuning -----------------------------------------------------------------
/** Master trim applied under the user volume (the compressor adds some make-up gain). */
const MASTER_TRIM = 0.6;
/** Level everything ducks to while paused. */
const PAUSE_LEVEL = 0.18;
/** Cloud muffle low-pass range (Hz): open -> whiteout. */
const MUFFLE_OPEN = 20000;
const MUFFLE_CLOSED = 700;
/** Cloud smoothing: entering closes quickly, leaving opens gradually (s). */
const CLOUD_TC_IN = 0.3;
const CLOUD_TC_OUT = 1.4;
/** Reverb send from the foley bus, and from the magic (shimmer) bus. */
const FOLEY_SEND = 0.06;
const MAGIC_SEND = 0.85;

interface Graph {
  ctx: BaseAudioContext;
  nodes: AudioNode[];
  reverb: Reverb;
  wind: Wind;
  ambience: Ambience;
  foley: Foley;
  music: Music;
  muffleA: SmoothParam;
  muffleB: SmoothParam;
  pause: SmoothParam;
  master: SmoothParam;
  maxCut: number;
  /** Named buses (handy for debugging / soloing). */
  buses: { wind: GainNode; ambience: GainNode; foley: GainNode; music: GainNode };
}

export class AudioEngine {
  private ctx: BaseAudioContext | null = null;
  private g: Graph | null = null;
  private readonly external: BaseAudioContext | null;
  private failed = false;
  private disposed = false;
  private pending: Promise<void> | null = null;
  private warned = false;

  private volume = 1;
  private muted = false;
  private musicOn = true;
  private lastSurface: Surface = 'grass';
  private cloudS = 0;

  constructor(options: AudioEngineOptions = {}) {
    this.external = options.context ?? null;
  }

  /** True once the graph is built and the context is running. */
  get unlocked(): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.g) return false;
    return isOffline(ctx) || ctx.state === 'running';
  }

  /** The underlying context (null before unlock or if audio is unavailable). */
  get context(): BaseAudioContext | null {
    return this.ctx;
  }

  /** Create/resume the AudioContext. Called from a user gesture (click/keydown). Safe to call repeatedly. */
  unlock(): Promise<void> {
    if (this.disposed || this.failed) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.doUnlock().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async doUnlock(): Promise<void> {
    try {
      if (!this.ctx) {
        this.ctx = this.external ?? createContext();
        if (!this.ctx) {
          this.failed = true;
          this.warn('Web Audio is not available; running silently.');
          return;
        }
      }
      const ctx = this.ctx;
      if (!this.g) this.g = this.build(ctx);
      if (!isOffline(ctx) && ctx.state !== 'running' && ctx.state !== 'closed') {
        primeSilence(ctx); // older iOS needs a sound started inside the gesture
        await withTimeout((ctx as AudioContext).resume(), 1500);
      }
    } catch (err) {
      this.warn('Audio unlock failed; running silently.', err);
      if (!this.g) {
        this.failed = true;
        this.closeContext();
      }
    }
  }

  /** Called every rendered frame with smoothed game state; dt in seconds. No-op until unlocked. */
  update(dt: number, state: AudioState): void {
    const g = this.g;
    if (!g || this.disposed || g.ctx.state === 'closed' || !state) return;
    try {
      this.step(g, clamp(finite(dt, 1 / 60), 0, 0.1), state);
    } catch (err) {
      this.warn('Audio update error.', err);
    }
  }

  footstep(intensity: number, surface: Surface): void {
    const s = validSurface(surface, this.lastSurface);
    this.lastSurface = s;
    this.play((g) => g.foley.footstep(clamp01(finite(intensity, 0.5)), s));
  }

  jump(): void {
    this.play((g) => g.foley.jump(this.lastSurface));
  }

  land(intensity: number): void {
    this.play((g) => g.foley.land(clamp01(finite(intensity, 0.5)), this.lastSurface));
  }

  /** Magical cloth unfurl: whoosh + fabric snap + soft shimmer. */
  gliderDeploy(): void {
    this.play((g) => g.foley.gliderDeploy());
  }

  gliderFold(): void {
    this.play((g) => g.foley.gliderFold());
  }

  /** 0..1 (linear gain). */
  setMasterVolume(v: number): void {
    this.volume = clamp01(finite(v, 1));
    this.applyMaster();
  }

  setMusicEnabled(on: boolean): void {
    this.musicOn = !!on;
    this.g?.music.setEnabled(this.musicOn);
  }

  setMuted(m: boolean): void {
    this.muted = !!m;
    this.applyMaster();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const g = this.g;
    this.g = null;
    if (g) {
      try {
        g.wind.dispose();
        g.ambience.dispose();
        g.music.dispose();
        g.reverb.dispose();
        for (const n of g.nodes) n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.closeContext();
  }

  // ---------------------------------------------------------------------------

  private build(ctx: BaseAudioContext): Graph {
    const bank = getNoiseBank(ctx);
    const nodes: AudioNode[] = [];
    const track = <T extends AudioNode>(n: T): T => {
      nodes.push(n);
      return n;
    };
    const maxCut = Math.min(MUFFLE_OPEN, ctx.sampleRate * 0.45);

    // master chain
    const mix = track(gainNode(ctx, 1));
    const muffleA = track(biquad(ctx, 'lowpass', maxCut, -3));
    const muffleB = track(biquad(ctx, 'lowpass', maxCut, -3));
    const pause = track(gainNode(ctx, 1));
    const master = track(gainNode(ctx, 0));
    const hp = track(biquad(ctx, 'highpass', 28, -3));
    const comp = track(ctx.createDynamicsCompressor());
    comp.threshold.value = -20;
    comp.knee.value = 14;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.02;
    comp.release.value = 0.35;
    const limiter = track(ctx.createDynamicsCompressor());
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    mix.connect(muffleA).connect(muffleB).connect(pause).connect(master).connect(hp).connect(comp).connect(limiter);
    limiter.connect(ctx.destination);

    // shared reverb send
    const reverb = createReverb(ctx);
    reverb.output.connect(mix);

    // buses
    const windBus = track(gainNode(ctx, 1));
    const ambBus = track(gainNode(ctx, 1));
    const foleyBus = track(gainNode(ctx, 1));
    const musicBus = track(gainNode(ctx, 1));
    for (const b of [windBus, ambBus, foleyBus, musicBus]) b.connect(mix);
    foleyBus.connect(track(gainNode(ctx, FOLEY_SEND))).connect(reverb.input);
    const magic = track(gainNode(ctx, 1));
    magic.connect(foleyBus);
    magic.connect(track(gainNode(ctx, MAGIC_SEND))).connect(reverb.input);

    const music = new Music(ctx, bank, musicBus, reverb.input);
    music.setEnabled(this.musicOn);

    const g: Graph = {
      ctx,
      nodes,
      reverb,
      wind: new Wind(ctx, bank, windBus),
      ambience: new Ambience(ctx, bank, ambBus, reverb.input),
      foley: new Foley(ctx, bank, foleyBus, magic),
      music,
      muffleA: new SmoothParam(ctx, muffleA.frequency, 0.004),
      muffleB: new SmoothParam(ctx, muffleB.frequency, 0.004),
      pause: new SmoothParam(ctx, pause.gain),
      master: new SmoothParam(ctx, master.gain, 0.002),
      maxCut,
      buses: { wind: windBus, ambience: ambBus, foley: foleyBus, music: musicBus },
    };
    // fade in gently rather than starting at full level
    g.master.set(this.masterTarget(), 0.8);
    return g;
  }

  private step(g: Graph, dt: number, s: AudioState): void {
    const now = g.ctx.currentTime;
    const grounded = !!s.grounded;
    const airborne = !grounded;
    const gliding = !!s.gliding && airborne;
    const paused = !!s.paused;
    const speed = Math.max(0, finite(s.speed, 0));
    const vs = finite(s.verticalSpeed, 0);
    const airspeed = clamp(finite(s.airspeed, speed), 0, 90);
    const alt = finite(s.altitude, 1650);
    const below = !!s.belowClouds;
    const reveal = clamp01(finite(s.reveal, 0));
    const inGrass = clamp01(finite(s.inGrass, 0));
    const wfd = Number.isNaN(s.waterfallDistance) ? Infinity : s.waterfallDistance;

    // cloud: close quickly on entry, open gradually on exit
    const cloudRaw = clamp01(finite(s.cloudDensity, 0));
    this.cloudS = approach(this.cloudS, cloudRaw, dt, cloudRaw > this.cloudS ? CLOUD_TC_IN : CLOUD_TC_OUT);
    const cloud = this.cloudS;

    // derived drivers
    const air = clamp01(airspeed / 60);
    const fall = airborne && !gliding ? smoothstep(6, 42, -vs) : 0;
    const nearIsland = smoothstep(1300, 1520, alt);
    const breeze = clamp01(0.25 + 0.75 * Math.max(nearIsland, below ? 0.5 : 0)) * (1 - cloud);
    const envDuck = (grounded ? 1 : gliding ? 0.7 : lerp(0.45, 0.12, fall)) * (1 - 0.85 * cloud);
    const birdZone = Math.max(nearIsland, below ? 1 : 0);
    const birds =
      birdZone * (1 - smoothstep(0.03, 0.35, cloud)) * (1 - fall) * (grounded ? 1 : gliding ? 0.8 : 0.5);

    g.wind.update({ now, dt, air, fall, glide: gliding ? 1 : 0, airborne, cloud, breeze, reveal });
    g.ambience.update({
      now,
      dt,
      grounded,
      speed,
      inGrass,
      birds,
      birdDistance: below ? 1 : grounded ? 0.15 : 0.5,
      duck: envDuck,
      breeze,
      waterfallDistance: wfd,
      paused,
    });
    g.music.update({ now, dt, intensity: Math.max(reveal, gliding ? 0.5 : 0), thin: fall, paused });

    // cloud muffle (log-frequency mapping, already smoothed in JS)
    const cut = g.maxCut * Math.pow(MUFFLE_CLOSED / g.maxCut, Math.pow(cloud, 0.75));
    g.muffleA.set(cut, 0.05);
    g.muffleB.set(cut, 0.05);

    g.pause.setAsym(paused ? PAUSE_LEVEL : 1, 0.4, 0.25);
  }

  private play(fn: (g: Graph) => void): void {
    const g = this.g;
    if (!g || this.disposed) return;
    const ctx = g.ctx;
    if (ctx.state === 'closed' || (!isOffline(ctx) && ctx.state !== 'running')) return;
    try {
      fn(g);
    } catch (err) {
      this.warn('Audio one-shot error.', err);
    }
  }

  private masterTarget(): number {
    return this.muted ? 0 : this.volume * MASTER_TRIM;
  }

  private applyMaster(): void {
    this.g?.master.set(this.masterTarget(), 0.08);
  }

  private closeContext(): void {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx !== this.external && !isOffline(ctx) && ctx.state !== 'closed') {
      (ctx as AudioContext).close().catch(() => undefined);
    }
  }

  private warn(msg: string, err?: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[audio] ${msg}`, err ?? '');
  }
}

// ---------------------------------------------------------------------------

function createContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor({ latencyHint: 'interactive' });
  } catch {
    try {
      return new Ctor();
    } catch {
      return null;
    }
  }
}

function isOffline(ctx: BaseAudioContext): boolean {
  return typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
}

/** Plays one silent sample – unlocks audio output on older iOS Safari when called inside a gesture. */
function primeSilence(ctx: BaseAudioContext): void {
  try {
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
    src.onended = () => src.disconnect();
  } catch {
    /* ignore */
  }
}

function withTimeout(p: Promise<void>, ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const id = setTimeout(resolve, ms);
    p.then(
      () => {
        clearTimeout(id);
        resolve();
      },
      () => {
        clearTimeout(id);
        resolve();
      },
    );
  });
}

function validSurface(s: Surface, fallback: Surface): Surface {
  return s === 'grass' || s === 'dirt' || s === 'rock' ? s : fallback;
}
