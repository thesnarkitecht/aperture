/**
 * Procedural animation: every pose is generated from parameters each frame, then layered.
 *
 *   state poses  : ground locomotion (idle ↔ walk ↔ run ↔ sprint as one continuous gait),
 *                  jump prep, takeoff/leap, free fall (spread ↔ head-first dive), glide, land
 *   crossfades   : when the state changes, the last output pose is captured and blended
 *                  into the new state over a per-transition duration (smootherstep)
 *   additive     : breathing, acceleration/turn leans, head look-at, airflow flutter
 *   IK           : legs are foot-trajectory driven with analytic two-bone IK, so feet plant
 *                  without sliding and follow uneven ground
 */
import * as THREE from 'three';
import { B, BONE_COUNT, THIGH_LEN, SHIN_LEN, bindPositions } from './Rig';
import { clamp, lerp, smoothstep, smootherstep, Spring, DEG, fract, saturate } from '../core/math';

export type AnimState = 'ground' | 'jumpPrep' | 'air' | 'glide' | 'land';

export interface AnimInput {
  state: AnimState;
  speed: number; // horizontal speed m/s
  accel: number; // forward acceleration m/s²
  turnRate: number; // rad/s
  vy: number; // vertical velocity
  airTime: number;
  prepT: number; // 0..1 progress of jump anticipation
  dive: number; // 0..1 spread → head-first dive
  glideDeploy: number; // 0..1
  bank: number; // glide bank -1..1
  landImpact: number; // 0..1
  landT: number; // seconds since landing
  lookYaw: number; // additive head yaw (rad)
  lookPitch: number;
  groundLeft: number; // terrain height offsets under each foot relative to root (m)
  groundRight: number;
  airflow: number; // 0..1
  time: number;
}

class Pose {
  q: THREE.Quaternion[] = [];
  hips = new THREE.Vector3();
  constructor() {
    for (let i = 0; i < BONE_COUNT; i++) this.q.push(new THREE.Quaternion());
  }
  copy(o: Pose): this {
    for (let i = 0; i < BONE_COUNT; i++) this.q[i].copy(o.q[i]);
    this.hips.copy(o.hips);
    return this;
  }
  blend(o: Pose, t: number): this {
    for (let i = 0; i < BONE_COUNT; i++) this.q[i].slerp(o.q[i], t);
    this.hips.lerp(o.hips, t);
    return this;
  }
  identity(): this {
    for (const q of this.q) q.identity();
    this.hips.set(0, 0.93, 0);
    return this;
  }
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
function setE(q: THREE.Quaternion, x: number, y: number, z: number, order: THREE.EulerOrder): void {
  q.setFromEuler(_e.set(x, y, z, order));
}
function mulE(q: THREE.Quaternion, x: number, y: number, z: number, order: THREE.EulerOrder): void {
  q.multiply(_q.setFromEuler(_e.set(x, y, z, order)));
}

const BIND = bindPositions();
const HIP_OFFSET_L = BIND[B.thighL].clone().sub(BIND[B.hips]);
const HIP_OFFSET_R = BIND[B.thighR].clone().sub(BIND[B.hips]);
const ANKLE_H = BIND[B.footL].y; // ankle height above ground in bind pose

export class Animator {
  private out = new Pose();
  private from = new Pose();
  private target = new Pose();
  private state: AnimState = 'ground';
  private fadeT = 1;
  private fadeDur = 0.2;
  private phase = 0;
  private leanFwd = new Spring(0, 0.25);
  private leanSide = new Spring(0, 0.3);
  private locoW = new Spring(0, 0.18);
  private landSpring = new Spring(0, 0.08);
  /** Emitted with 'L'/'R' when a foot hits the ground. */
  onFootstep: ((side: 'L' | 'R', intensity: number) => void) | null = null;
  private lastContact = [true, true];
  readonly debug = { phase: 0, locomotion: 0 };

  constructor(private bones: THREE.Bone[]) {
    this.out.identity();
  }

  get currentState(): AnimState {
    return this.state;
  }

  private transitionDur(from: AnimState, to: AnimState): number {
    if (to === 'jumpPrep') return 0.1;
    if (from === 'jumpPrep' && to === 'air') return 0.12;
    if (to === 'glide') return 0.7;
    if (to === 'land') return 0.07;
    if (from === 'land') return 0.35;
    if (from === 'glide' && to === 'air') return 0.4;
    return 0.25;
  }

  update(dt: number, inp: AnimInput): void {
    if (inp.state !== this.state) {
      this.from.copy(this.out);
      this.fadeDur = this.transitionDur(this.state, inp.state);
      this.fadeT = 0;
      this.state = inp.state;
    }
    this.fadeT = Math.min(1, this.fadeT + dt / this.fadeDur);

    this.leanFwd.update(clamp(inp.accel * 0.035, -0.25, 0.3), dt);
    this.leanSide.update(clamp(-inp.turnRate * inp.speed * 0.02, -0.3, 0.3), dt);

    const t = this.target.identity();
    switch (inp.state) {
      case 'ground':
        this.ground(t, dt, inp);
        break;
      case 'jumpPrep':
        this.jumpPrep(t, inp);
        break;
      case 'air':
        this.air(t, inp);
        break;
      case 'glide':
        this.glide(t, inp);
        break;
      case 'land':
        this.land(t, dt, inp);
        break;
    }
    // Head look (additive, distributed over the neck and chest).
    mulE(t.q[B.head], inp.lookPitch * 0.6, inp.lookYaw * 0.55, 0, 'YXZ');
    mulE(t.q[B.neck], inp.lookPitch * 0.4, inp.lookYaw * 0.3, 0, 'YXZ');
    mulE(t.q[B.chest], 0, inp.lookYaw * 0.15, 0, 'YXZ');

    this.out.copy(this.from).blend(t, smootherstep(0, 1, this.fadeT));
    this.apply();
  }

  // --------------------------------------------------------------------------------- ground
  private ground(p: Pose, dt: number, inp: AnimInput): void {
    const sp = inp.speed;
    const w = this.locoW.update(smoothstep(0.08, 0.7, sp), dt);
    this.debug.locomotion = w;
    const run = smoothstep(1.8, 4.5, sp);
    const sprint = smoothstep(5.5, 8.0, sp);
    const cadence = lerp(lerp(1.8, 2.75, run), 3.05, sprint); // steps per second
    this.phase = fract(this.phase + (cadence * 0.5 * dt) * Math.max(w, 0.02) * (sp > 0.05 ? 1 : 0.3));
    this.debug.phase = this.phase;
    const ph = this.phase;
    const time = inp.time;

    // ---- idle base
    const breathe = Math.sin(time * 1.6);
    const shift = Math.sin(time * 0.45) * 0.5 + Math.sin(time * 0.21 + 1.3) * 0.5;
    const idleHips = new THREE.Vector3(shift * 0.018, 0.925 - Math.abs(shift) * 0.008, 0);

    // ---- gait parameters
    const stance = lerp(0.62, lerp(0.4, 0.34, sprint), run);
    const stepLen = sp / cadence; // m per step
    const lift = lerp(0.09, lerp(0.26, 0.34, sprint), run);
    const bobAmp = lerp(0.022, 0.05, run);
    // Walk: highest at mid-stance; run: lowest at mid-stance (compression).
    const bobWalk = Math.cos(ph * Math.PI * 4) * -1;
    const hipsY = lerp(0.925, lerp(0.915 + bobWalk * bobAmp * 0.5, 0.9 - Math.cos(ph * Math.PI * 4 + 0.6) * bobAmp, run), 1) - run * 0.04 - sprint * 0.02;
    p.hips.set(lerp(idleHips.x, Math.sin(ph * Math.PI * 2) * 0.02 * (1 - run * 0.5), w), lerp(idleHips.y, hipsY, w), 0);

    // Pelvis twist/roll with the stride; torso counter-rotates.
    const s = Math.sin(ph * Math.PI * 2);
    const c = Math.cos(ph * Math.PI * 2);
    const lean = lerp(0.03, lerp(0.16, 0.27, sprint), run) * w + this.leanFwd.value;
    setE(p.q[B.hips], lean * 0.3, s * lerp(0.1, 0.16, run) * w, (c * 0.05 + shift * 0.03 * (1 - w)) * (1 - run * 0.4), 'YXZ');
    setE(p.q[B.spine], lean * 0.45 + breathe * 0.01, -s * 0.08 * w, this.leanSide.value * 0.5, 'YXZ');
    setE(p.q[B.chest], lean * 0.35 - breathe * 0.02, -s * lerp(0.08, 0.14, run) * w, this.leanSide.value * 0.5 - c * 0.02 * w, 'YXZ');
    setE(p.q[B.neck], -lean * 0.45, s * 0.04 * w, 0, 'YXZ');
    setE(p.q[B.head], -lean * 0.3 + Math.sin(time * 0.37) * 0.02 * (1 - w), s * 0.05 * w + Math.sin(time * 0.29) * 0.05 * (1 - w), 0, 'YXZ');

    // Shoulders shrug with breath and arm swing.
    setE(p.q[B.shoulderL], 0, s * 0.05 * w, -breathe * 0.015 - run * 0.05, 'ZXY');
    setE(p.q[B.shoulderR], 0, s * 0.05 * w, breathe * 0.015 + run * 0.05, 'ZXY');

    // Arms: opposite to legs; elbows pump in the run.
    const armSwing = lerp(0.35, lerp(0.85, 1.05, sprint), run) * w;
    const elbow = lerp(lerp(0.15, 0.3, w), lerp(1.35, 1.5, sprint), run * w);
    const pump = Math.sin(ph * Math.PI * 2) * 0.25 * run * w;
    const idleArm = Math.sin(time * 0.9) * 0.02;
    setE(p.q[B.upperArmL], s * armSwing - 0.05 + idleArm, 0.1 * run, 0.1 + run * 0.14, 'ZXY');
    setE(p.q[B.upperArmR], -s * armSwing - 0.05 - idleArm, -0.1 * run, -0.1 - run * 0.14, 'ZXY');
    setE(p.q[B.forearmL], -elbow - Math.max(0, pump), 0.2 * run, 0, 'ZXY');
    setE(p.q[B.forearmR], -elbow - Math.max(0, -pump), -0.2 * run, 0, 'ZXY');
    setE(p.q[B.handL], -0.1, 0, 0.1, 'ZXY');
    setE(p.q[B.handR], -0.1, 0, -0.1, 'ZXY');

    // ---- legs via foot trajectories
    const footTarget = (legPhase: number, side: number, ground: number): { pos: THREE.Vector3; pitch: number; contact: boolean } => {
      const lp = fract(legPhase);
      const pos = new THREE.Vector3(side * 0.1, ANKLE_H + ground, 0);
      let pitch = 0;
      let contact = true;
      if (lp < stance) {
        const u = lp / stance;
        pos.z = lerp(stepLen * 0.55, -stepLen * 0.45, u);
        // heel strike → flat → heel lift / toe push
        pitch = lerp(-0.25 * w, 0, smoothstep(0, 0.2, u)) + smoothstep(0.6, 1, u) * lerp(0.35, 0.8, run) * w;
        pos.y += smoothstep(0.65, 1.0, u) * 0.05 * w;
      } else {
        const u = (lp - stance) / (1 - stance);
        contact = false;
        const e = smootherstep(0, 1, u);
        pos.z = lerp(-stepLen * 0.45, stepLen * 0.55, e);
        // Run: heel recovers high behind, then the knee drives forward.
        const arc = Math.sin(u * Math.PI);
        pos.y += arc * lift + (1 - u) * run * lift * 0.5 * Math.sin(u * Math.PI * 1.2);
        pos.z -= Math.sin(u * Math.PI) * run * 0.12;
        pitch = lerp(lerp(0.4, 1.0, run), -0.3, smoothstep(0.2, 1.0, u)) * w;
      }
      // Blend to idle stance.
      const idle = new THREE.Vector3(side * 0.11, ANKLE_H + ground, side > 0 ? 0.03 : -0.02);
      pos.lerp(idle, 1 - w);
      pitch *= w;
      return { pos, pitch, contact: contact || w < 0.2 };
    };
    const fl = footTarget(ph, 1, inp.groundLeft);
    const fr = footTarget(ph + 0.5, -1, inp.groundRight);
    this.solveLeg(p, B.thighL, B.shinL, B.footL, HIP_OFFSET_L, fl.pos, fl.pitch, 1);
    this.solveLeg(p, B.thighR, B.shinR, B.footR, HIP_OFFSET_R, fr.pos, fr.pitch, -1);
    // Toe bend at push-off
    setE(p.q[B.toeL], -Math.max(0, fl.pitch) * 0.6, 0, 0, 'ZXY');
    setE(p.q[B.toeR], -Math.max(0, fr.pitch) * 0.6, 0, 0, 'ZXY');

    // Footstep events
    const contacts = [fl.contact, fr.contact];
    for (let i = 0; i < 2; i++) {
      if (contacts[i] && !this.lastContact[i] && w > 0.3) this.onFootstep?.(i === 0 ? 'L' : 'R', clamp(sp / 8, 0.2, 1));
      this.lastContact[i] = contacts[i];
    }
  }

  /** Analytic two-bone IK in hips space, knee pointing forward, then foot pitch in root space. */
  private solveLeg(p: Pose, thigh: number, shin: number, foot: number, hipOffset: THREE.Vector3, target: THREE.Vector3, pitch: number, side: number): void {
    const hipsQ = p.q[B.hips];
    const hipJoint = hipOffset.clone().applyQuaternion(hipsQ).add(p.hips);
    const invHips = hipsQ.clone().invert();
    const d = target.clone().sub(hipJoint).applyQuaternion(invHips);
    const len = clamp(d.length(), 0.08, THIGH_LEN + SHIN_LEN - 0.002);
    const dn = d.clone().normalize();
    const cosK = (THIGH_LEN * THIGH_LEN + SHIN_LEN * SHIN_LEN - len * len) / (2 * THIGH_LEN * SHIN_LEN);
    const knee = Math.PI - Math.acos(clamp(cosK, -1, 1));
    const cosA = (THIGH_LEN * THIGH_LEN + len * len - SHIN_LEN * SHIN_LEN) / (2 * THIGH_LEN * len);
    const a1 = Math.acos(clamp(cosA, -1, 1));
    const pole = new THREE.Vector3(side * 0.08, 0, 1);
    const po = pole.sub(dn.clone().multiplyScalar(pole.dot(dn))).normalize();
    const thighDir = dn.clone().multiplyScalar(Math.cos(a1)).addScaledVector(po, Math.sin(a1));
    const yAxis = thighDir.clone().negate();
    const zAxis = po.clone().sub(yAxis.clone().multiplyScalar(po.dot(yAxis))).normalize();
    const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
    const m = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    p.q[thigh].setFromRotationMatrix(m);
    setE(p.q[shin], knee, 0, 0, 'ZXY');
    // Foot: desired orientation in root space = pitch only.
    const shinWorld = hipsQ.clone().multiply(p.q[thigh]).multiply(p.q[shin]);
    const want = new THREE.Quaternion().setFromEuler(_e.set(pitch, 0, 0, 'ZXY'));
    p.q[foot].copy(shinWorld.invert().multiply(want));
  }

  // --------------------------------------------------------------------------------- jump prep
  private jumpPrep(p: Pose, inp: AnimInput): void {
    const k = smoothstep(0, 1, inp.prepT);
    const run = smoothstep(2, 5, inp.speed);
    p.hips.set(0, 0.93 - 0.16 * k, 0);
    setE(p.q[B.hips], 0.25 * k + 0.1 * run, 0, 0, 'YXZ');
    setE(p.q[B.spine], 0.25 * k, 0, 0, 'YXZ');
    setE(p.q[B.chest], 0.15 * k, 0, 0, 'YXZ');
    setE(p.q[B.neck], -0.3 * k, 0, 0, 'YXZ');
    setE(p.q[B.head], -0.15 * k, 0, 0, 'YXZ');
    // Arms swing back, loading for the throw.
    setE(p.q[B.upperArmL], 0.9 * k, 0, 0.25, 'ZXY');
    setE(p.q[B.upperArmR], 0.9 * k, 0, -0.25, 'ZXY');
    setE(p.q[B.forearmL], -0.4, 0, 0, 'ZXY');
    setE(p.q[B.forearmR], -0.4, 0, 0, 'ZXY');
    const lead = 0.18 * run;
    this.solveLeg(p, B.thighL, B.shinL, B.footL, HIP_OFFSET_L, new THREE.Vector3(0.11, ANKLE_H + inp.groundLeft, 0.05 + lead), -0.05, 1);
    this.solveLeg(p, B.thighR, B.shinR, B.footR, HIP_OFFSET_R, new THREE.Vector3(-0.11, ANKLE_H + inp.groundRight, -0.1 - lead), 0.25 * run, -1);
  }

  // --------------------------------------------------------------------------------- air
  private air(p: Pose, inp: AnimInput): void {
    const t = inp.airTime;
    const rise = smoothstep(0.0, 0.25, t) * (1 - smoothstep(0.35, 1.2, t)); // takeoff leap
    const fall = smoothstep(0.5, 1.6, t);
    const dive = inp.dive;
    const flutter = inp.airflow;
    const n1 = Math.sin(inp.time * 13.0) * 0.05 * flutter;
    const n2 = Math.sin(inp.time * 17.3 + 1.0) * 0.05 * flutter;
    const n3 = Math.sin(inp.time * 2.1) * 0.08;
    p.hips.set(0, 0.93, 0);

    // Leap: front knee drives up, back leg extends, arms thrown forward & up.
    const leap = rise * (1 - fall);
    // Spread (skydiver arch) and head-first dive.
    const spread = fall * (1 - dive);
    const div = fall * dive;

    setE(
      p.q[B.hips],
      -0.15 * leap - 0.25 * spread + 0.05 * div,
      n3 * 0.3,
      0,
      'YXZ',
    );
    setE(p.q[B.spine], -0.1 * leap - 0.2 * spread, 0, n1, 'YXZ');
    setE(p.q[B.chest], -0.1 * leap - 0.15 * spread, n3 * 0.2, n2, 'YXZ');
    setE(p.q[B.neck], -0.35 * spread - 0.3 * div + 0.1 * leap, 0, 0, 'YXZ');
    setE(p.q[B.head], -0.25 * spread - 0.35 * div, 0, 0, 'YXZ');

    const armFwd = -1.2 * leap; // negative = forward/up
    const armSpreadZ = 1.45 * spread + 0.6 * leap;
    const armBack = 0.5 * div; // swept back along the body
    setE(p.q[B.shoulderL], 0, 0, 0.1 * spread, 'ZXY');
    setE(p.q[B.shoulderR], 0, 0, -0.1 * spread, 'ZXY');
    setE(p.q[B.upperArmL], armFwd + armBack + n1 - 0.3 * spread, 0, armSpreadZ + 0.35 * div, 'ZXY');
    setE(p.q[B.upperArmR], armFwd + armBack - n2 - 0.3 * spread, 0, -armSpreadZ - 0.35 * div, 'ZXY');
    setE(p.q[B.forearmL], -0.3 * leap - 0.9 * spread - 0.1 * div + n2, 0, 0, 'ZXY');
    setE(p.q[B.forearmR], -0.3 * leap - 0.9 * spread - 0.1 * div - n1, 0, 0, 'ZXY');
    setE(p.q[B.handL], 0, 0, 0.2 * spread, 'ZXY');
    setE(p.q[B.handR], 0, 0, -0.2 * spread, 'ZXY');

    setE(p.q[B.thighL], -1.1 * leap + 0.2 * spread + 0.02 * div + n2, 0, 0.18 * spread + 0.04, 'ZXY');
    setE(p.q[B.shinL], 1.2 * leap + 0.9 * spread + 0.1 * div, 0, 0, 'ZXY');
    setE(p.q[B.thighR], 0.45 * leap + 0.25 * spread + 0.02 * div - n1, 0, -0.18 * spread - 0.04, 'ZXY');
    setE(p.q[B.shinR], 0.5 * leap + 1.0 * spread + 0.1 * div, 0, 0, 'ZXY');
    setE(p.q[B.footL], 0.5 * fall + 0.3 * leap, 0, 0, 'ZXY');
    setE(p.q[B.footR], 0.6 * fall + 0.5 * leap, 0, 0, 'ZXY');
  }

  // --------------------------------------------------------------------------------- glide
  private glide(p: Pose, inp: AnimInput): void {
    const d = inp.glideDeploy;
    const tb = Math.sin(inp.time * 1.7) * 0.03 + Math.sin(inp.time * 4.3) * 0.015;
    p.hips.set(0, 0.93, 0);
    setE(p.q[B.hips], -0.12, 0, inp.bank * 0.1, 'YXZ');
    setE(p.q[B.spine], -0.12, 0, inp.bank * 0.1, 'YXZ');
    setE(p.q[B.chest], -0.1, 0, tb, 'YXZ');
    setE(p.q[B.neck], -0.5, -inp.bank * 0.2, 0, 'YXZ');
    setE(p.q[B.head], -0.35, -inp.bank * 0.2, 0, 'YXZ');
    // Arms out, gripping the leading-edge ribs.
    const reach = lerp(1.0, 1.42, d);
    setE(p.q[B.shoulderL], 0, 0.1, 0.12, 'ZXY');
    setE(p.q[B.shoulderR], 0, -0.1, -0.12, 'ZXY');
    setE(p.q[B.upperArmL], -0.35 + tb, 0.3, reach + inp.bank * 0.15, 'ZXY');
    setE(p.q[B.upperArmR], -0.35 - tb, -0.3, -reach + inp.bank * 0.15, 'ZXY');
    setE(p.q[B.forearmL], -0.35, 0, 0, 'ZXY');
    setE(p.q[B.forearmR], -0.35, 0, 0, 'ZXY');
    setE(p.q[B.handL], 0, 0, 0.3, 'ZXY');
    setE(p.q[B.handR], 0, 0, -0.3, 'ZXY');
    setE(p.q[B.thighL], 0.12 + tb, 0, 0.05, 'ZXY');
    setE(p.q[B.thighR], 0.1 - tb, 0, -0.05, 'ZXY');
    setE(p.q[B.shinL], 0.35, 0, 0, 'ZXY');
    setE(p.q[B.shinR], 0.45, 0, 0, 'ZXY');
    setE(p.q[B.footL], 0.6, 0, 0, 'ZXY');
    setE(p.q[B.footR], 0.6, 0, 0, 'ZXY');
  }

  // --------------------------------------------------------------------------------- land
  private land(p: Pose, dt: number, inp: AnimInput): void {
    const imp = inp.landImpact;
    const t = inp.landT;
    const comp = this.landSpring.update(t < 0.12 ? 1 : 0, dt) * imp;
    const k = clamp(comp, 0, 1) * (1 - smoothstep(0.2, 0.9, t));
    p.hips.set(0, 0.93 - 0.3 * k, 0.02 * k);
    setE(p.q[B.hips], 0.35 * k, 0, 0, 'YXZ');
    setE(p.q[B.spine], 0.3 * k, 0, 0, 'YXZ');
    setE(p.q[B.chest], 0.2 * k, 0, 0, 'YXZ');
    setE(p.q[B.neck], -0.45 * k, 0, 0, 'YXZ');
    setE(p.q[B.head], -0.2 * k, 0, 0, 'YXZ');
    setE(p.q[B.upperArmL], -0.5 * k, 0, 0.5 * k + 0.1, 'ZXY');
    setE(p.q[B.upperArmR], -0.3 * k, 0, -0.6 * k - 0.1, 'ZXY');
    setE(p.q[B.forearmL], -0.6 * k - 0.2, 0, 0, 'ZXY');
    setE(p.q[B.forearmR], -0.4 * k - 0.2, 0, 0, 'ZXY');
    this.solveLeg(p, B.thighL, B.shinL, B.footL, HIP_OFFSET_L, new THREE.Vector3(0.13, ANKLE_H + inp.groundLeft, 0.1 * k), 0, 1);
    this.solveLeg(p, B.thighR, B.shinR, B.footR, HIP_OFFSET_R, new THREE.Vector3(-0.13, ANKLE_H + inp.groundRight, -0.12 * k), 0.2 * k, -1);
  }

  private apply(): void {
    const b = this.bones;
    for (let i = 1; i < BONE_COUNT; i++) b[i].quaternion.copy(this.out.q[i]);
    b[B.hips].position.copy(this.out.hips);
  }
}

export { DEG, saturate };
