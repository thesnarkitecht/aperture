import * as THREE from 'three';
import type { App, CameraDriver } from './app';

type V3 = [number, number, number];

interface Key {
  t: number;
  p: V3;
  look: V3;
  fov?: number;
}

export interface Caption {
  kicker: string;
  title: string;
  alpha: number;
}

interface Shot {
  name: string;
  duration: number;
  keys: Key[];
  /** Simulated footsteps (head bob) scaled by speed. */
  walk?: boolean;
  fadeIn?: number;
  fadeOut?: number;
  /** Forced door states during the shot (door id -> 0..1, null = automatic). */
  doors?: Record<string, number | null>;
  captions?: { t: number; dur: number; kicker: string; title: string }[];
}

const EYE = 1.64;

/**
 * The cinematic walkthrough. The same script drives the in-app "tour" mode and
 * the offline video render, so the video is exactly what the app shows.
 */
const SHOTS: Shot[] = [
  {
    name: 'approach',
    duration: 21,
    fadeIn: 1.5,
    fadeOut: 0.7,
    doors: { hatch: 0 },
    keys: [
      { t: 0, p: [-46, 26, 96], look: [0, -2, 8], fov: 50 },
      { t: 5.5, p: [-34, 15, 58], look: [0, 1, 6], fov: 50 },
      { t: 10.5, p: [-27, 7.5, 24], look: [-4, 2.5, -4], fov: 52 },
      { t: 15, p: [-18.5, 3.2, 1.5], look: [-9, 1.6, -4.5], fov: 55 },
      { t: 21, p: [-11.4, 1.62, -4.7], look: [-8.8, 1.35, -4.75], fov: 58 },
    ],
    captions: [
      { t: 1.8, dur: 6.5, kicker: 'CSV-7061 · Kessler-Vance Heavy Yards', title: 'Perihelion' },
      { t: 11.5, dur: 4.5, kicker: 'Deep-space ore hauler · 82 m', title: 'Port airlock' },
    ],
  },
  {
    name: 'interior-walk',
    duration: 37,
    fadeIn: 0.7,
    fadeOut: 0.8,
    walk: true,
    doors: { hatch: 0 },
    keys: [
      { t: 0, p: [-8.2, EYE, -4.75], look: [-3, 1.45, -4.75], fov: 72 },
      { t: 3.2, p: [-5.6, EYE, -4.8], look: [-3.5, 1.35, -6.4], fov: 72 },
      { t: 6.0, p: [-3.9, EYE, -4.95], look: [-3.8, 1.2, -6.8], fov: 72 },
      { t: 8.6, p: [-2.5, EYE, -4.8], look: [1.0, 1.5, -4.9], fov: 72 },
      { t: 10.8, p: [-0.5, EYE, -5.0], look: [0.6, 1.55, -9.0], fov: 72 },
      { t: 13.4, p: [0.0, EYE, -8.6], look: [0.2, 1.5, -14], fov: 72 },
      { t: 15.8, p: [0.2, EYE, -11.4], look: [4.5, 1.3, -12.4], fov: 72 },
      { t: 18.2, p: [0.1, EYE, -14.6], look: [0, 1.55, -20], fov: 72 },
      { t: 21.2, p: [0.0, EYE, -18.6], look: [-0.4, 1.5, -24], fov: 72 },
      { t: 24.2, p: [-1.8, EYE, -20.4], look: [0.0, 1.35, -20.4], fov: 72 },
      { t: 27.4, p: [-2.5, EYE, -23.6], look: [-0.6, 1.3, -27.8], fov: 72 },
      { t: 30.6, p: [-1.2, EYE, -25.2], look: [1.6, 1.1, -28.6], fov: 72 },
      { t: 34, p: [0.4, EYE, -25.0], look: [4.8, 1.6, -23.6], fov: 72 },
      { t: 37, p: [0.8, EYE, -24.4], look: [4.6, 1.8, -21.0], fov: 72 },
    ],
    captions: [
      { t: 1.0, dur: 4.5, kicker: 'Deck A · Port midship', title: 'Airlock · EVA prep' },
      { t: 11.0, dur: 4.0, kicker: 'Deck A · Spine', title: 'Main corridor' },
      { t: 21.5, dur: 5.0, kicker: 'Deck A · Frame 02', title: 'Bridge' },
    ],
  },
  {
    name: 'cargo-engineering',
    duration: 30,
    fadeIn: 0.8,
    fadeOut: 0.8,
    walk: true,
    keys: [
      { t: 0, p: [0.0, EYE, 2.8], look: [0, 1.7, 8], fov: 72 },
      { t: 3.0, p: [0.0, EYE, 7.0], look: [1.0, 3.2, 14], fov: 74 },
      { t: 6.5, p: [-0.6, EYE, 10.8], look: [2.0, 4.6, 15.5], fov: 74 },
      { t: 10.0, p: [-0.4, EYE, 14.6], look: [-5.2, 2.6, 18.4], fov: 74 },
      { t: 13.6, p: [0.2, EYE, 18.8], look: [0.4, 1.8, 25], fov: 72 },
      { t: 16.8, p: [0.0, EYE, 23.2], look: [0, 2.2, 30], fov: 72 },
      { t: 19.6, p: [-1.5, EYE, 25.0], look: [0, 2.6, 31], fov: 74 },
      { t: 23.2, p: [-3.7, EYE, 27.6], look: [0, 3.0, 31], fov: 74 },
      { t: 26.6, p: [-3.9, EYE, 32.4], look: [0, 3.6, 31], fov: 74 },
      { t: 30, p: [-2.6, EYE, 35.0], look: [0, 4.4, 31], fov: 74 },
    ],
    captions: [
      { t: 2.0, dur: 4.5, kicker: 'Deck A–B · Hold 1', title: 'Cargo bay' },
      { t: 18.5, dur: 5.0, kicker: 'Deck A–B · Reactor room', title: 'Engineering' },
    ],
  },
  {
    name: 'departure',
    duration: 12,
    fadeIn: 0.8,
    fadeOut: 2.0,
    keys: [
      { t: 0, p: [-16, 3, 52], look: [0, 3, 30], fov: 55 },
      { t: 6, p: [-19, 7, 64], look: [1, 2.5, 24], fov: 52 },
      { t: 12, p: [-24, 12, 84], look: [3, 0, 14], fov: 48 },
    ],
    captions: [{ t: 2.5, dur: 8.5, kicker: 'Real-time · Three.js · WebGL 2', title: 'Walk it yourself' }],
  },
];

export const TOUR_DURATION = SHOTS.reduce((s, x) => s + x.duration, 0);

interface Built {
  shot: Shot;
  start: number;
  pos: THREE.CatmullRomCurve3;
  look: THREE.CatmullRomCurve3;
  /** Cumulative arc length at each key, for walking bob. */
}

function smooth(x: number) {
  return x * x * (3 - 2 * x);
}

export class Tour implements CameraDriver {
  time = 0;
  playing = false;
  onCaption?: (c: Caption | null) => void;
  onEnd?: () => void;
  private built: Built[] = [];
  private lastPos = new THREE.Vector3();
  private dist = 0;
  private shotIndex = -1;

  constructor() {
    let start = 0;
    for (const shot of SHOTS) {
      this.built.push({
        shot,
        start,
        pos: new THREE.CatmullRomCurve3(shot.keys.map((k) => new THREE.Vector3(...k.p)), false, 'centripetal'),
        look: new THREE.CatmullRomCurve3(shot.keys.map((k) => new THREE.Vector3(...k.look)), false, 'centripetal'),
      });
      start += shot.duration;
    }
  }

  get duration() {
    return TOUR_DURATION;
  }

  start(t = 0) {
    this.time = t;
    this.playing = true;
    this.shotIndex = -1;
  }

  stop(app?: App) {
    this.playing = false;
    if (app) {
      app.pipeline.finalUniforms.uFade.value = 1;
      for (const d of app.ship.doors) d.force = null;
    }
    this.onCaption?.(null);
  }

  /** Map shot-local time to the curve parameter using per-key timing (eased at shot ends). */
  private param(b: Built, t: number) {
    const keys = b.shot.keys;
    const n = keys.length;
    const tt = THREE.MathUtils.clamp(t, 0, b.shot.duration);
    let i = 0;
    while (i < n - 2 && tt > keys[i + 1].t) i++;
    const t0 = keys[i].t;
    const t1 = keys[i + 1].t;
    let u = (tt - t0) / Math.max(1e-6, t1 - t0);
    // Ease in on the first segment and out on the last.
    if (n === 2) u = smooth(u);
    else if (i === 0) u = Math.pow(u, 1.5);
    else if (i === n - 2) u = 1 - Math.pow(1 - u, 1.5);
    return { s: (i + THREE.MathUtils.clamp(u, 0, 1)) / (n - 1), i, u };
  }

  update(dt: number, camera: THREE.PerspectiveCamera, app: App) {
    if (!this.playing) return;
    this.time += dt;
    if (this.time >= TOUR_DURATION) {
      this.time = TOUR_DURATION;
      this.stop(app);
      this.onEnd?.();
      return;
    }
    let idx = this.built.length - 1;
    for (let i = 0; i < this.built.length; i++) {
      if (this.time < this.built[i].start + this.built[i].shot.duration) {
        idx = i;
        break;
      }
    }
    const b = this.built[idx];
    const shot = b.shot;
    const t = this.time - b.start;
    const { s, i, u } = this.param(b, t);
    const p = b.pos.getPoint(s);
    const look = b.look.getPoint(s);
    const k0 = shot.keys[i];
    const k1 = shot.keys[i + 1];
    const fov = THREE.MathUtils.lerp(k0.fov ?? 72, k1.fov ?? 72, smooth(u));

    if (idx !== this.shotIndex) {
      this.shotIndex = idx;
      this.lastPos.copy(p);
      this.dist = 0;
      for (const d of app.ship.doors) d.force = shot.doors?.[d.def.id] ?? null;
      app.snap();
    }
    // Scripted door moments.
    if (shot.name === 'approach') {
      const hatch = app.ship.doors.find((d) => d.def.id === 'hatch');
      if (hatch) hatch.force = t > 14.8 ? 1 : 0;
    }

    // Walking: bob from distance travelled.
    let bobY = 0;
    let bobX = 0;
    if (shot.walk) {
      const step = p.distanceTo(this.lastPos);
      this.dist += step;
      const speed = dt > 0 ? step / dt : 0;
      const amp = THREE.MathUtils.clamp(speed / 1.4, 0, 1);
      const phase = (this.dist / 0.72) * Math.PI;
      bobY = Math.sin(phase * 2) * 0.022 * amp + Math.sin(this.time * 1.3) * 0.004;
      bobX = Math.sin(phase) * 0.012 * amp;
    }
    this.lastPos.copy(p);

    camera.position.copy(p);
    camera.lookAt(look);
    if (shot.walk) {
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(right, bobX);
      camera.position.y += bobY;
    }
    if (camera.fov !== fov) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Fades.
    let fade = 1;
    if (shot.fadeIn && t < shot.fadeIn) fade = Math.min(fade, smooth(t / shot.fadeIn));
    if (shot.fadeOut && t > shot.duration - shot.fadeOut) fade = Math.min(fade, smooth((shot.duration - t) / shot.fadeOut));
    app.pipeline.finalUniforms.uFade.value = fade;

    // Captions.
    let cap: Caption | null = null;
    for (const c of shot.captions ?? []) {
      if (t >= c.t && t <= c.t + c.dur) {
        const a = Math.min(1, (t - c.t) / 0.8, (c.t + c.dur - t) / 0.8);
        cap = { kicker: c.kicker, title: c.title, alpha: smooth(THREE.MathUtils.clamp(a, 0, 1)) };
      }
    }
    this.onCaption?.(cap);
  }
}
