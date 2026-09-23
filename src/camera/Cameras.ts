/**
 * Gameplay orbit camera and the data-driven cinematic shot system.
 *
 * Shots are plain data: a start (absolute seconds or relative to a recorded story event),
 * a duration, a blend-in time, an easing and two camera "specs" (start/end) interpolated
 * across the shot. A spec positions the camera in the hero's heading frame ('char'),
 * frozen where the hero was when the shot began ('anchor'), or in world space ('world').
 */
import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp, smoothstep, Ease, type EaseName, Spring } from '../core/math';
import type { Character } from '../character/Character';

export interface CamSpec {
  space: 'char' | 'anchor' | 'world';
  pos: [number, number, number]; // heading frame: x = hero's left, y up, z = hero's forward
  look: [number, number, number]; // offset from the hero (heading frame)
  fov: number;
  roll?: number;
}

export interface Shot {
  name: string;
  start: number | [string, number];
  duration: number;
  blend: number;
  ease?: EaseName;
  from: CamSpec;
  to: CamSpec;
  shake?: number;
}

export interface CamState {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  roll: number;
}

function headingFrame(yaw: number): { f: THREE.Vector3; l: THREE.Vector3 } {
  return { f: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), l: new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)) };
}

function toWorld(o: [number, number, number], base: THREE.Vector3, yaw: number): THREE.Vector3 {
  const { f, l } = headingFrame(yaw);
  return base.clone().addScaledVector(l, o[0]).add(new THREE.Vector3(0, o[1], 0)).addScaledVector(f, o[2]);
}

export class CinematicCamera {
  events = new Map<string, number>();
  private anchors = new Map<Shot, { p: THREE.Vector3; yaw: number }>();
  constructor(public shots: Shot[]) {}

  reset(): void {
    this.events.clear();
    this.anchors.clear();
  }

  private startOf(s: Shot): number | null {
    if (typeof s.start === 'number') return s.start;
    const e = this.events.get(s.start[0]);
    return e === undefined ? null : e + s.start[1];
  }

  private evalSpec(spec: CamSpec, shot: Shot, hero: Character, heroPos: THREE.Vector3): { pos: THREE.Vector3; look: THREE.Vector3 } {
    let base = heroPos;
    let yaw = hero.yaw;
    if (spec.space === 'anchor') {
      let a = this.anchors.get(shot);
      if (!a) {
        a = { p: heroPos.clone(), yaw: hero.yaw };
        this.anchors.set(shot, a);
      }
      base = a.p;
      yaw = a.yaw;
    } else if (spec.space === 'world') {
      base = new THREE.Vector3();
      yaw = 0;
    }
    const pos = toWorld(spec.pos, base, yaw);
    const look = toWorld(spec.look, heroPos, hero.yaw);
    return { pos, look };
  }

  private evalShot(s: Shot, t: number, hero: Character, heroPos: THREE.Vector3): CamState {
    const st = this.startOf(s)!;
    const u = (Ease[s.ease ?? 'inOutSine'])(clamp((t - st) / s.duration, 0, 1));
    const a = this.evalSpec(s.from, s, hero, heroPos);
    const b = this.evalSpec(s.to, s, hero, heroPos);
    const shake = (s.shake ?? 0) * (Math.sin(t * 23.1) * 0.6 + Math.sin(t * 37.7) * 0.4);
    const pos = a.pos.lerp(b.pos, u);
    pos.y += shake * 0.05;
    pos.x += Math.sin(t * 29.3) * (s.shake ?? 0) * 0.04;
    return { pos, look: a.look.lerp(b.look, u), fov: lerp(s.from.fov, s.to.fov, u), roll: lerp(s.from.roll ?? 0, s.to.roll ?? 0, u) };
  }

  evaluate(t: number, hero: Character, heroPos: THREE.Vector3): CamState | null {
    let cur: Shot | null = null;
    let prev: Shot | null = null;
    let curStart = -1;
    for (const s of this.shots) {
      const st = this.startOf(s);
      if (st === null || st > t) continue;
      if (st >= curStart) {
        prev = cur;
        cur = s;
        curStart = st;
      }
    }
    if (!cur) return null;
    const c = this.evalShot(cur, t, hero, heroPos);
    const w = cur.blend > 0 ? smoothstep(0, 1, (t - curStart) / cur.blend) : 1;
    if (prev && w < 1) {
      const p = this.evalShot(prev, t, hero, heroPos);
      c.pos.lerpVectors(p.pos, c.pos, w);
      c.look.lerpVectors(p.look, c.look, w);
      c.fov = lerp(p.fov, c.fov, w);
      c.roll = lerp(p.roll, c.roll, w);
    }
    return c;
  }
}

/** Third-person orbit camera with lag, collision against terrain and state-driven framing. */
export class GameplayCamera {
  yaw = 0;
  pitch = 0.18;
  private dist = new Spring(4.2, 0.4);
  private fov = new Spring(55, 0.6);
  private height = new Spring(1.55, 0.3);
  private target = new THREE.Vector3();
  private idle = 0;
  readonly state: CamState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 55, roll: 0 };

  constructor(private ground: (x: number, z: number) => number) {}

  snap(hero: Character, pos: THREE.Vector3): void {
    this.yaw = hero.yaw + Math.PI;
    this.target.copy(pos);
  }

  /** Align the orbit to an existing camera pose so handing over from the cinematic is seamless. */
  syncFrom(cam: THREE.Camera, heroPos: THREE.Vector3): void {
    const d = cam.position.clone().sub(heroPos);
    this.yaw = Math.atan2(d.x, d.z);
    this.pitch = clamp(Math.atan2(d.y - 1.5, Math.hypot(d.x, d.z)), -0.5, 1.2);
    this.dist.reset(clamp(d.length(), 3, 12));
    this.target.copy(heroPos);
  }

  update(dt: number, hero: Character, heroPos: THREE.Vector3, lookX: number, lookY: number): CamState {
    const moved = Math.abs(lookX) + Math.abs(lookY) > 0.01;
    this.yaw -= lookX;
    this.pitch = clamp(this.pitch + lookY, -0.6, 1.25);
    this.idle = moved ? 0 : this.idle + dt;
    const hs = hero.horizontalSpeed;
    const air = hero.state === 'air';
    const glide = hero.state === 'glide';
    // Auto-follow behind the hero when moving and the player isn't steering the camera.
    if (this.idle > 1.2 && (hs > 1 || glide || air)) {
      const behind = (glide ? hero.yaw : Math.atan2(hero.velocity.x, hero.velocity.z)) + Math.PI;
      this.yaw = dampAngle(this.yaw, behind, glide ? 1.2 : 0.8, dt);
      const wantPitch = air ? 0.55 : glide ? 0.25 : 0.2;
      this.pitch = damp(this.pitch, wantPitch, 0.8, dt);
    }
    const dist = this.dist.update(air ? 7.5 : glide ? 8.5 : lerp(4.0, 5.2, smoothstep(3, 8, hs)), dt);
    const fov = this.fov.update(air ? 72 : glide ? 64 : lerp(52, 64, smoothstep(2, 8, hs)), dt);
    const h = this.height.update(glide || air ? 1.0 : 1.5, dt);
    this.target.lerp(heroPos, 1 - Math.exp(-(air ? 25 : 10) * dt));
    const look = this.target.clone().add(new THREE.Vector3(0, h, 0));
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const pos = look.clone().addScaledVector(dir, dist);
    // Terrain collision: keep the camera above the ground along the boom.
    for (let i = 1; i <= 6; i++) {
      const q = look.clone().addScaledVector(dir, (dist * i) / 6);
      const g = this.ground(q.x, q.z);
      if (isFinite(g) && q.y < g + 0.4 && look.y > g) {
        pos.copy(look).addScaledVector(dir, Math.max(0.8, (dist * (i - 1)) / 6));
        break;
      }
    }
    const g = this.ground(pos.x, pos.z);
    if (isFinite(g) && pos.y < g + 0.4 && look.y > g) pos.y = g + 0.4;
    this.state.pos.copy(pos);
    this.state.look.copy(look);
    this.state.fov = fov;
    this.state.roll = glide ? -hero.bank * 0.08 : 0;
    return this.state;
  }
}

/** The opening sequence, expressed as data. Times in seconds; events: jump, cloud, exit, deploy. */
export const OPENING_SHOTS: Shot[] = [
  // Establishing: drifting wide around the island, the hero tiny against the cloud sea.
  { name: 'establish', start: 0, duration: 7, blend: 0, ease: 'inOutSine',
    from: { space: 'char', pos: [-34, 26, -40], look: [0, -14, 110], fov: 50 },
    to: { space: 'char', pos: [-10, 4.5, -12], look: [0, 0.4, 14], fov: 44 } },
  // Close three-quarter behind: rim-lit idle, looking around.
  { name: 'idle-close', start: 6.5, duration: 3.5, blend: 1.5,
    from: { space: 'char', pos: [-3.6, 2.12, -4.8], look: [0.2, 1.45, 2], fov: 40 },
    to: { space: 'char', pos: [-2.4, 2, -5.1], look: [0.1, 1.4, 3], fov: 42 } },
  // Walk: follow from behind, slightly high.
  { name: 'walk', start: 9.5, duration: 6, blend: 1.2,
    from: { space: 'char', pos: [-1.8, 2.38, -6.3], look: [0, 1.3, 4], fov: 48 },
    to: { space: 'char', pos: [1.5, 2.25, -6.75], look: [0, 1.2, 5], fov: 52 } },
  // Run: low tracking shot from the side, the island streaming past.
  { name: 'run-side', start: 15.5, duration: 5.5, blend: 1.0,
    from: { space: 'char', pos: [6.3, 1.12, 2.25], look: [0, 1.1, 1.5], fov: 50 },
    to: { space: 'char', pos: [5.4, 1.25, -2.25], look: [0, 1.1, 3], fov: 54 } },
  // Charge the cliff: low behind, FOV widens, camera pulls back to reveal the drop.
  { name: 'run-cliff', start: 21, duration: 8, blend: 1.2, shake: 0.4,
    from: { space: 'char', pos: [1.2, 1.5, -6], look: [0, 1.0, 8], fov: 58 },
    to: { space: 'char', pos: [0.9, 2, -9], look: [0, 0.2, 12], fov: 66 } },
  // Takeoff: the camera stops at the edge; the hero flies out and shrinks against the sky.
  { name: 'edge', start: ['jump', 0.05], duration: 2.8, blend: 0.35, ease: 'outCubic',
    from: { space: 'anchor', pos: [0.75, 2.25, -5.25], look: [0, 0.5, 4], fov: 66 },
    to: { space: 'anchor', pos: [0.6, 2.75, -1.8], look: [0, -0.5, 1], fov: 58 } },
  // Below the hero looking up: the island hangs above, roots and all.
  { name: 'underside', start: ['jump', 2.8], duration: 4.2, blend: 0, ease: 'linear',
    from: { space: 'char', pos: [3.5, -9, 9], look: [0, 1.0, 0], fov: 62 },
    to: { space: 'char', pos: [6, -12, 12], look: [0, 3.0, 0], fov: 66 } },
  // Wide falling shot: hero small, clouds approaching.
  { name: 'fall-wide', start: ['jump', 7.0], duration: 5, blend: 1.5, shake: 0.3,
    from: { space: 'char', pos: [-10.5, 7.5, -13.5], look: [0, -3, 2], fov: 70 },
    to: { space: 'char', pos: [-4.5, 5, -7.5], look: [0, -4, 2], fov: 76 } },
  // Into the clouds: tight above-behind, heavy buffeting.
  { name: 'cloud', start: ['cloud', -0.8], duration: 9, blend: 1.2, shake: 1.0,
    from: { space: 'char', pos: [-2.25, 4.5, -3.9], look: [0, -2, 1.5], fov: 78 },
    to: { space: 'char', pos: [-1.8, 4, -3.6], look: [0, -2, 1.5], fov: 80 } },
  // Burst out below: the world opens up — FOV widens dramatically.
  { name: 'reveal', start: ['exit', 0.2], duration: 4.5, blend: 1.0, ease: 'outCubic', shake: 0.4,
    from: { space: 'char', pos: [-2.25, 4.38, -4.5], look: [0, -3, 6], fov: 70 },
    to: { space: 'char', pos: [-5.25, 6.25, -12], look: [0, -8, 30], fov: 84 } },
  // Deploy: close side view of the wing unfurling.
  { name: 'deploy', start: ['deploy', -0.3], duration: 4, blend: 0.8,
    from: { space: 'char', pos: [5.7, 1, 1.5], look: [0, 0.8, 0.5], fov: 55 },
    to: { space: 'char', pos: [5.1, 2.25, -5.25], look: [0, 0.8, 1.5], fov: 60 } },
  // The long pull-back: hero becomes a small silhouette gliding into the sunset.
  { name: 'glide-pullback', start: ['deploy', 3.7], duration: 36, blend: 2.5, ease: 'inOutSine',
    from: { space: 'char', pos: [1.2, 2.0, -6.5], look: [0, 0.5, 12], fov: 58 },
    to: { space: 'char', pos: [12, 16, -70], look: [0, -8, 60], fov: 52 } },
];
