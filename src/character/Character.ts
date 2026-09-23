/**
 * Hero: skinned mesh + animator + physics controller (state machine) + glider wing.
 * States: ground → jumpPrep → air (rise / free fall / dive) → glide → land → ground.
 * Movement has acceleration, friction, gravity with pose-dependent drag, air control and
 * a lift/drag glide model. Cinematic mode drives the same controller with scripted input.
 */
import * as THREE from 'three';
import { createSkeleton, B } from './Rig';
import { buildCharacterGeometry, createCharacterMaterial } from './CharacterMesh';
import { Animator, type AnimState } from './Animator';
import { clamp, damp, dampAngle, angleDelta, lerp, smoothstep, saturate } from '../core/math';
import { withGlobals } from '../render/ShaderLib';
import { Scarf } from './Scarf';
import type { ModelHero } from './ModelHero';

export interface CharInput {
  /** World-space desired move direction (xz) with magnitude 0..1. */
  move: THREE.Vector2;
  sprint: boolean;
  jump: boolean; // edge-triggered
  dive: boolean;
}

export type Ground = (x: number, z: number) => number;

const WALK = 1.6;
const RUN = 5.4;
const SPRINT = 7.8;

export class Character {
  readonly root = new THREE.Group();
  readonly mesh: THREE.SkinnedMesh;
  readonly bones: THREE.Bone[];
  readonly animator: Animator;
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly prevPosition = new THREE.Vector3();
  yaw = 0;
  state: AnimState = 'ground';
  grounded = true;
  airTime = 0;
  prepT = 0;
  glideDeploy = 0;
  dive = 0;
  bank = 0;
  landImpact = 0;
  landT = 0;
  lookYaw = 0;
  lookPitch = 0;
  time = 0;
  private accel = 0;
  private turnRate = 0;
  private wantJump = false;
  private bodyQ = new THREE.Quaternion();
  private glider: THREE.Mesh;
  private gliderMat: THREE.ShaderMaterial;
  onFootstep: ((i: number) => void) | null = null;
  onEvent: ((e: 'jump' | 'land' | 'deploy' | 'fold', v?: number) => void) | null = null;

  constructor(private ground: Ground) {
    const { bones, skeleton } = createSkeleton();
    this.bones = bones;
    this.mesh = new THREE.SkinnedMesh(buildCharacterGeometry(), createCharacterMaterial());
    this.mesh.add(bones[0]);
    this.mesh.bind(skeleton);
    this.mesh.frustumCulled = false;
    this.mesh.userData.castShadow = true;
    this.root.add(this.mesh);
    this.animator = new Animator(bones);
    this.animator.onFootstep = (_s, i) => this.onFootstep?.(i);
    const g = this.makeGlider();
    this.glider = g.mesh;
    this.gliderMat = g.mat;
    bones[B.chest].add(this.glider);
    this.scarf = new Scarf();
  }
  readonly scarf: Scarf;
  model: ModelHero | null = null;

  /** Swap the procedural body for the skinned hero model (the procedural rig keeps driving the glider). */
  useModel(m: ModelHero): void {
    this.model = m;
    this.mesh.visible = false;
    this.scarf.mesh.visible = false;
    this.root.add(m.root);
  }

  /** Crescent wing that unfurls from the back clasp: ribs + translucent rune-lit fabric. */
  private makeGlider(): { mesh: THREE.Mesh; mat: THREE.ShaderMaterial } {
    const U = 28;
    const Vn = 8;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let j = 0; j <= Vn; j++) {
      for (let i = 0; i <= U; i++) {
        pos.push(0, 0, 0);
        uv.push(i / U, j / Vn);
      }
    }
    for (let j = 0; j < Vn; j++)
      for (let i = 0; i < U; i++) {
        const a = j * (U + 1) + i;
        idx.push(a, a + 1, a + U + 1, a + 1, a + U + 2, a + U + 1);
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: withGlobals({ uDeploy: { value: 0 }, uBank: { value: 0 } }),
      vertexShader: /* glsl */ `
        uniform float uDeploy; uniform float uTime; uniform float uBank;
        varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal;
        vec3 wing(vec2 uv) {
          float u = uv.x * 2.0 - 1.0;            // -1..1 across the span
          float a = abs(u);
          float span = 2.3 * uDeploy;
          float chord = mix(1.25, 0.4, pow(a, 1.6)) * smoothstep(0.0, 0.4, uDeploy);
          float x = u * span;
          // Leading edge sweeps back to crescent tips; gentle dihedral, fabric billows.
          float lead = 0.02 - pow(a, 2.0) * 0.45 * uDeploy;
          float z = lead - uv.y * chord;
          float y = 0.12 + pow(a, 1.5) * 0.28 * uDeploy + sin(uv.y * 3.14159) * 0.08 * (1.0 - a * 0.5) * uDeploy;
          y += sin(uTime * 9.0 + u * 4.0 + uv.y * 3.0) * 0.025 * uv.y * uDeploy;
          return vec3(x, y + 0.02, z - 0.12);
        }
        void main() {
          vUv = uv;
          vec3 p = wing(uv);
          vec3 px = wing(uv + vec2(0.01, 0.0));
          vec3 py = wing(uv + vec2(0.0, 0.01));
          vNormal = normalize(mat3(modelMatrix) * cross(px - p, py - p));
          vec4 w = modelMatrix * vec4(p, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uDeploy;
        varying vec2 vUv; varying vec3 vWorld; varying vec3 vNormal;
        #include <aw_common>
        #include <aw_atmosphere>
        #include <aw_shadows>
        #include <aw_lighting>
        #include <aw_clouds>
        void main() {
          if (uDeploy < 0.01) discard;
          vec3 N = normalize(vNormal);
          if (!gl_FrontFacing) N = -N;
          vec3 V = normalize(cameraPosition - vWorld);
          float u = abs(vUv.x * 2.0 - 1.0);
          // Ribs + leading edge + rune lines.
          float rib = 0.0;
          for (int i = 1; i <= 3; i++) rib = max(rib, 1.0 - smoothstep(0.0, 0.012, abs(u - float(i) * 0.28)));
          float edge = 1.0 - smoothstep(0.0, 0.05, vUv.y);
          float trail = smoothstep(0.93, 1.0, vUv.y);
          float rune = (1.0 - smoothstep(0.0, 0.01, abs(fract(vUv.y * 6.0 + u * 2.0) - 0.5) - 0.47)) * step(0.15, vUv.y) * step(vUv.y, 0.85);
          AwSurface s = aw_defaultSurface();
          s.albedo = mix(vec3(0.86, 0.8, 0.68), vec3(0.85, 0.62, 0.3), max(rib, edge));
          s.albedo = mix(s.albedo, vec3(0.1, 0.5, 0.55), trail);
          s.normal = N;
          s.roughness = 0.75;
          s.wrap = 0.4;
          s.translucency = 1.0;
          s.sssColor = vec3(1.0, 0.8, 0.55);
          s.rim = 0.6;
          s.metallic = max(rib, edge) * 0.8;
          s.emissive = vec3(0.2, 0.9, 1.0) * rune * 0.6 * (0.6 + 0.4 * sin(uTime * 2.0 + u * 8.0));
          float sh = aw_sunShadow(vWorld, N, dot(N, uSunDir), gl_FragCoord.xy, 8) * aw_cloudShadow(vWorld);
          gl_FragColor = vec4(aw_shade(s, vWorld, V, sh), 0.0);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.userData.castShadow = true;
    return { mesh, mat };
  }

  reset(p: THREE.Vector3, yaw: number): void {
    this.position.copy(p);
    this.prevPosition.copy(p);
    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.state = 'ground';
    this.grounded = true;
    this.airTime = 0;
    this.glideDeploy = 0;
    this.dive = 0;
    this.bodyQ.identity();
    this.scarf?.reset();
  }

  get horizontalSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  /** Fixed-step physics + state machine. */
  step(dt: number, inp: CharInput): void {
    this.time += dt;
    this.prevPosition.copy(this.position);
    const v = this.velocity;
    const hs = this.horizontalSpeed;
    const mag = Math.min(1, inp.move.length());
    if (inp.jump) this.wantJump = true;

    switch (this.state) {
      case 'ground':
      case 'land': {
        this.landT += dt;
        if (this.state === 'land' && this.landT > lerp(0.25, 0.7, this.landImpact)) this.state = 'ground';
        const target = mag < 0.02 ? 0 : mag < 0.45 ? WALK * (mag / 0.45) : lerp(RUN, inp.sprint ? SPRINT : RUN, 1) * mag;
        const landSlow = this.state === 'land' ? 0.4 : 1;
        if (mag > 0.02) {
          const want = Math.atan2(inp.move.x, inp.move.y);
          const rate = lerp(12, 5.5, smoothstep(2, 8, hs));
          const prev = this.yaw;
          this.yaw = dampAngle(this.yaw, want, rate, dt);
          this.turnRate = angleDelta(prev, this.yaw) / dt;
        } else this.turnRate = damp(this.turnRate, 0, 10, dt);
        const cur = hs;
        const accel = target > cur ? 9.5 : 13;
        const ns = cur + clamp(target * landSlow - cur, -accel * dt, accel * dt);
        this.accel = (ns - cur) / dt;
        v.x = Math.sin(this.yaw) * ns;
        v.z = Math.cos(this.yaw) * ns;
        this.position.x += v.x * dt;
        this.position.z += v.z * dt;
        const g = this.ground(this.position.x, this.position.z);
        if (!isFinite(g) || g < this.position.y - 0.6) {
          // Walked/ran off an edge.
          this.state = 'air';
          this.grounded = false;
          this.airTime = 0.3;
          v.y = 0;
        } else {
          this.position.y = damp(this.position.y, g, 30, dt);
          v.y = 0;
          if (this.wantJump && this.state === 'ground') {
            this.state = 'jumpPrep';
            this.prepT = 0;
          }
        }
        this.wantJump = false;
        break;
      }
      case 'jumpPrep': {
        const dur = lerp(0.2, 0.13, smoothstep(1, 5, hs));
        this.prepT += dt / dur;
        v.x *= 1 - 1.5 * dt;
        v.z *= 1 - 1.5 * dt;
        this.position.x += v.x * dt;
        this.position.z += v.z * dt;
        const g = this.ground(this.position.x, this.position.z);
        if (isFinite(g)) this.position.y = g;
        if (this.prepT >= 1) {
          this.state = 'air';
          this.grounded = false;
          this.airTime = 0;
          const boost = hs > 3 ? 1.0 : 0;
          v.x += Math.sin(this.yaw) * boost;
          v.z += Math.cos(this.yaw) * boost;
          v.y = 5.6;
          this.onEvent?.('jump');
        }
        break;
      }
      case 'air': {
        this.airTime += dt;
        this.dive = damp(this.dive, inp.dive ? 1 : 0, 1.4, dt);
        const vt = lerp(52, 72, this.dive); // terminal velocity by pose
        const speed = v.length();
        const drag = (9.81 / (vt * vt)) * speed;
        v.y -= 9.81 * dt;
        v.addScaledVector(v, -drag * dt);
        // Air control
        if (mag > 0.02) {
          v.x += inp.move.x * 3.0 * dt;
          v.z += inp.move.y * 3.0 * dt;
          this.yaw = dampAngle(this.yaw, Math.atan2(inp.move.x, inp.move.y), 1.5, dt);
        }
        this.position.addScaledVector(v, dt);
        if (this.wantJump && this.airTime > 0.5) {
          this.state = 'glide';
          this.onEvent?.('deploy');
        }
        this.wantJump = false;
        this.checkLanding();
        break;
      }
      case 'glide': {
        this.airTime += dt;
        this.glideDeploy = Math.min(1, this.glideDeploy + dt / 1.1);
        const turn = -inp.move.x;
        this.bank = damp(this.bank, clamp(turn, -1, 1), 2.5, dt);
        this.yaw += -this.bank * 0.45 * dt;
        const pitch = inp.move.y; // W dives, S flares
        const fwdSpeed = lerp(17, pitch > 0 ? 25 : 12, Math.abs(pitch));
        const sink = pitch > 0 ? lerp(4, 9, pitch) : lerp(4, 2.2, -pitch);
        const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        const tgt = dir.multiplyScalar(fwdSpeed).setY(-sink);
        const k = lerp(0.35, 1.3, this.glideDeploy);
        v.lerp(tgt, 1 - Math.exp(-k * dt));
        this.position.addScaledVector(v, dt);
        if (this.wantJump && this.glideDeploy > 0.9) {
          this.state = 'air';
          this.glideDeploy = 0;
          this.onEvent?.('fold');
        }
        this.wantJump = false;
        this.checkLanding();
        break;
      }
    }
    if (this.state !== 'glide') this.glideDeploy = Math.max(0, this.glideDeploy - dt * 2);
  }

  private checkLanding(): void {
    const g = this.ground(this.position.x, this.position.z);
    if (isFinite(g) && this.position.y <= g && this.velocity.y <= 0) {
      this.position.y = g;
      this.landImpact = saturate(-this.velocity.y / 14);
      this.velocity.y = 0;
      this.velocity.x *= 0.4;
      this.velocity.z *= 0.4;
      this.state = 'land';
      this.landT = 0;
      this.grounded = true;
      this.glideDeploy = 0;
      this.onEvent?.('land', this.landImpact);
    }
  }

  /** Per-render-frame: animation, body orientation, glider. `alpha` interpolates physics. */
  update(dt: number, alpha: number): void {
    const p = new THREE.Vector3().lerpVectors(this.prevPosition, this.position, alpha);
    const hs = this.horizontalSpeed;
    // Body orientation in the air: pitch towards the velocity for dives, horizontal glide.
    let pitch = 0;
    let roll = 0;
    if (this.state === 'air') {
      const fall = smoothstep(0.5, 1.8, this.airTime);
      pitch = lerp(0, lerp(1.25, 2.6, this.dive), fall);
    } else if (this.state === 'glide') {
      pitch = lerp(1.25, 1.25, this.glideDeploy);
      roll = this.bank * 0.55;
    }
    const target = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, this.yaw, roll, 'YXZ'));
    this.bodyQ.slerp(target, 1 - Math.exp(-4 * dt));
    // Rotate around the centre of mass (~hips) rather than the feet.
    const com = new THREE.Vector3(0, 0.95, 0);
    const offset = com.clone().sub(com.clone().applyQuaternion(this.bodyQ));
    this.root.position.copy(p).add(offset);
    this.root.quaternion.copy(this.bodyQ);

    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    const gL = this.ground(p.x + cy * 0.1, p.z - sy * 0.1);
    const gR = this.ground(p.x - cy * 0.1, p.z + sy * 0.1);
    const onGround = this.state === 'ground' || this.state === 'land' || this.state === 'jumpPrep';
    this.animator.update(dt, {
      state: this.state,
      speed: hs,
      accel: this.accel,
      turnRate: this.turnRate,
      vy: this.velocity.y,
      airTime: this.airTime,
      prepT: this.prepT,
      dive: this.dive,
      glideDeploy: this.glideDeploy,
      bank: this.bank,
      landImpact: this.landImpact,
      landT: this.landT,
      lookYaw: this.lookYaw,
      lookPitch: this.lookPitch,
      groundLeft: onGround && isFinite(gL) ? clamp(gL - p.y, -0.25, 0.25) : 0,
      groundRight: onGround && isFinite(gR) ? clamp(gR - p.y, -0.25, 0.25) : 0,
      airflow: saturate(this.velocity.length() / 50),
      time: this.time,
    });
    // Scarf tails: pinned behind the neck, simulated in world space.
    this.root.updateMatrixWorld(true);
    const neck = this.bones[B.neck].getWorldPosition(new THREE.Vector3());
    const qW = this.bones[B.chest].getWorldQuaternion(new THREE.Quaternion());
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(qW);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(qW);
    const knot = neck.addScaledVector(back, 0.09).add(new THREE.Vector3(0, -0.02, 0).applyQuaternion(qW));
    const wind = new THREE.Vector3(0.85, 0.05, 0.52).multiplyScalar(3.5 + Math.sin(this.time * 0.7) * 1.5);
    this.scarf.update(dt, knot, side, back, this.velocity, wind, this.time);
    this.model?.update(dt, { state: this.state, speed: hs, airTime: this.airTime, glideDeploy: this.glideDeploy, landT: this.landT, dive: this.dive, time: this.time });
    this.gliderMat.uniforms.uDeploy.value = this.glideDeploy;
    this.glider.visible = this.glideDeploy > 0.005;
    // Hair responds to wind + airflow (in character space).
    const hw = (this.mesh.material as THREE.ShaderMaterial).uniforms.uHairWind.value as THREE.Vector3;
    const rel = this.velocity.clone().multiplyScalar(-0.004).applyQuaternion(this.bodyQ.clone().invert());
    hw.set(Math.sin(this.time * 2.3) * 0.01 + 0.012, Math.sin(this.time * 3.1) * 0.006, -0.01).add(rel.clampLength(0, 0.07));
  }
}
