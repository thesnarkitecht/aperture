import * as THREE from 'three';
import type { App, CameraDriver } from '../app';
import { EYE } from '../ship/layout';

const RADIUS = 0.28;
const STEP = 0.45;

/**
 * First-person walking controller: pointer-lock mouse look (with a click-drag
 * fallback where pointer lock is unavailable), WASD/arrows, sprint, crouch,
 * touch joystick, wall sliding and step-up onto raised floors.
 */
export class WalkController implements CameraDriver {
  readonly feet = new THREE.Vector3(-3.4, 0, -4.75);
  yaw = -Math.PI / 2;
  pitch = -0.04;
  private vel = new THREE.Vector2();
  private keys = new Set<string>();
  private eyeY = EYE;
  private bobPhase = 0;
  private bobAmp = 0;
  private crouch = 0;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private stick = new THREE.Vector2();
  private touchLook: { id: number; x: number; y: number } | null = null;
  enabled = false;
  locked = false;
  onLockChange?: (locked: boolean) => void;
  sensitivity = 0.0022;

  constructor(private dom: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked) this.look(e.movementX, e.movementY);
      else if (this.dragging) {
        this.look((e.clientX - this.lastPointer.x) * 1.4, (e.clientY - this.lastPointer.y) * 1.4);
        this.lastPointer = { x: e.clientX, y: e.clientY };
      }
    });
    this.dom.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    // Touch: drag anywhere on the right to look.
    this.dom.addEventListener(
      'touchstart',
      (e) => {
        if (!this.enabled) return;
        for (const t of Array.from(e.changedTouches)) {
          if (t.clientX > window.innerWidth * 0.35 && !this.touchLook) this.touchLook = { id: t.identifier, x: t.clientX, y: t.clientY };
        }
      },
      { passive: true },
    );
    this.dom.addEventListener(
      'touchmove',
      (e) => {
        for (const t of Array.from(e.changedTouches)) {
          if (this.touchLook && t.identifier === this.touchLook.id) {
            this.look((t.clientX - this.touchLook.x) * 2.2, (t.clientY - this.touchLook.y) * 2.2);
            this.touchLook.x = t.clientX;
            this.touchLook.y = t.clientY;
          }
        }
      },
      { passive: true },
    );
    this.dom.addEventListener('touchend', (e) => {
      for (const t of Array.from(e.changedTouches)) if (this.touchLook && t.identifier === this.touchLook.id) this.touchLook = null;
    });
  }

  /** Virtual joystick input in [-1, 1]. */
  setStick(x: number, y: number) {
    this.stick.set(x, y);
  }

  requestLock() {
    try {
      const p = this.dom.requestPointerLock?.() as unknown as Promise<void> | undefined;
      p?.catch?.(() => undefined);
    } catch {
      /* Pointer lock is unavailable (e.g. sandboxed iframe); drag-to-look still works. */
    }
  }

  private look(dx: number, dy: number) {
    this.yaw -= dx * this.sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * this.sensitivity, -1.45, 1.45);
  }

  place(x: number, z: number, yaw: number, pitch = 0) {
    this.feet.set(x, 0, z);
    this.yaw = yaw;
    this.pitch = pitch;
    this.vel.set(0, 0);
  }

  /** Adopt the camera's current pose (e.g. when the tour hands control back). */
  syncFrom(camera: THREE.PerspectiveCamera, app: App) {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    this.yaw = e.y;
    this.pitch = e.x;
    const floor = app.ship.collision.floorAt(camera.position.x, camera.position.z);
    this.feet.set(camera.position.x, floor, camera.position.z);
    const p = { x: this.feet.x, z: this.feet.z };
    app.ship.collision.resolve(p, RADIUS);
    this.feet.x = p.x;
    this.feet.z = p.z;
    this.eyeY = EYE;
  }

  update(dt: number, camera: THREE.PerspectiveCamera, app: App) {
    dt = Math.min(dt, 0.1);
    const k = this.keys;
    let fx = 0;
    let fz = 0;
    if (this.enabled) {
      if (k.has('KeyW') || k.has('ArrowUp')) fz += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fz -= 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
      fx += this.stick.x;
      fz += -this.stick.y;
    }
    const len = Math.hypot(fx, fz);
    if (len > 1) {
      fx /= len;
      fz /= len;
    }
    const crouching = this.enabled && (k.has('KeyC') || k.has('ControlLeft'));
    this.crouch += ((crouching ? 1 : 0) - this.crouch) * Math.min(1, dt * 10);
    const sprint = this.enabled && (k.has('ShiftLeft') || k.has('ShiftRight')) && !crouching;
    const speed = (sprint ? 3.6 : 1.75) * (1 - this.crouch * 0.5);
    // Camera-relative wish direction.
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wx = fx * cos - fz * sin;
    const wz = -fx * sin - fz * cos;
    const accel = len > 0.01 ? 10 : 12;
    this.vel.x += (wx * speed - this.vel.x) * Math.min(1, dt * accel);
    this.vel.y += (wz * speed - this.vel.y) * Math.min(1, dt * accel);

    const col = app.ship.collision;
    const floorNow = col.floorAt(this.feet.x, this.feet.z);
    const tryMove = (dx: number, dz: number) => {
      const p = { x: this.feet.x + dx, z: this.feet.z + dz };
      col.resolve(p, RADIUS);
      const f = col.floorAt(p.x, p.z);
      if (f - floorNow > STEP) return;
      this.feet.x = p.x;
      this.feet.z = p.z;
    };
    // Sub-step so fast movement never tunnels through thin walls.
    const steps = Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.y) * dt) / 0.1));
    for (let i = 0; i < steps; i++) {
      tryMove((this.vel.x * dt) / steps, 0);
      tryMove(0, (this.vel.y * dt) / steps);
    }
    const floor = col.floorAt(this.feet.x, this.feet.z);
    this.feet.y += (floor - this.feet.y) * Math.min(1, dt * 12);

    // Head bob scales with speed.
    const v = Math.hypot(this.vel.x, this.vel.y);
    this.bobAmp += (Math.min(1, v / 1.75) - this.bobAmp) * Math.min(1, dt * 6);
    this.bobPhase += dt * (4.2 + v * 1.4);
    const targetEye = EYE - this.crouch * 0.6;
    this.eyeY += (targetEye - this.eyeY) * Math.min(1, dt * 10);
    const bobY = Math.sin(this.bobPhase * 2) * 0.03 * this.bobAmp + Math.sin(app.time * 1.3) * 0.004;
    const bobX = Math.sin(this.bobPhase) * 0.018 * this.bobAmp;

    camera.position.set(this.feet.x + cos * bobX, this.feet.y + this.eyeY + bobY, this.feet.z - sin * bobX);
    camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bobPhase) * 0.004 * this.bobAmp, 'YXZ');
  }
}
