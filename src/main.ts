/**
 * APERTURE — application bootstrap and main loop.
 * Owns the renderer, world, hero, cameras, cinematic director, input modes, UI and audio.
 */
import * as THREE from 'three';
import { G } from './render/ShaderLib';
import { Settings } from './core/Settings';
import { Input } from './core/Input';
import { clamp, lerp, smoothstep, damp } from './core/math';
import { generateNoiseTextures } from './render/NoiseTextures';
import { Pipeline } from './render/Pipeline';
import { Shadows } from './render/Shadows';
import { SkyLUT } from './environment/SkyLUT';
import { Island, RUN_DIR } from './world/Island';
import { Grass } from './world/Grass';
import { Character, type CharInput } from './character/Character';
import { CinematicCamera, GameplayCamera, OPENING_SHOTS, type CamState } from './camera/Cameras';
import { UI } from './ui/UI';
import { CLOUD_BASE, CLOUD_TOP, ISLAND_Y, SUN_DIR } from './world/WorldConfig';

// Optional modules (built in parallel); the app runs with or without them.
const worldModules = import.meta.glob('./world/DistantWorld.ts');
const audioModules = import.meta.glob('./audio/AudioEngine.ts');

const FIXED = 1 / 120;
const params = new URLSearchParams(location.search);

interface DistantWorldLike {
  group: THREE.Object3D;
  build(p?: (x: number) => void): Promise<void>;
  heightAt(x: number, z: number): number;
  update(dt: number, cam: THREE.Camera): void;
}
interface AudioLike {
  unlock(): Promise<void>;
  update(dt: number, s: Record<string, unknown>): void;
  footstep(i: number, s: 'grass' | 'dirt' | 'rock'): void;
  jump(): void;
  land(i: number): void;
  gliderDeploy(): void;
  gliderFold(): void;
  setMasterVolume(v: number): void;
  setMusicEnabled(on: boolean): void;
  setMuted(m: boolean): void;
}

class App {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.25, 160000);
  ui: UI;
  input: Input;
  pipeline!: Pipeline;
  shadows!: Shadows;
  island!: Island;
  grass!: Grass;
  hero!: Character;
  world: DistantWorldLike | null = null;
  audio: AudioLike | null = null;
  gameCam!: GameplayCamera;
  cine = new CinematicCamera(OPENING_SHOTS);
  mode: 'cinematic' | 'manual' = 'cinematic';
  cineTime = 0;
  handoff = 1; // 0..1 blend from the cinematic camera to gameplay after interrupting
  private handoffFrom: CamState | null = null;
  private acc = 0;
  private last = performance.now();
  private simInput: CharInput = { move: new THREE.Vector2(), sprint: false, jump: false, dive: false };
  private fpsFrames = 0;
  private fpsTime = 0;
  private fps = 0;
  private frameMs = 0;
  private titleShown = false;
  private endShown = false;
  private gpuName = 'unknown';
  private paused = false;

  constructor() {
    Settings.load();
    const canvas = document.createElement('canvas');
    document.getElementById('app')!.appendChild(canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const gl = this.renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    this.gpuName = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    this.ui = new UI(document.body);
    this.input = new Input(canvas);
    window.addEventListener('resize', () => this.resize());
  }

  private async tick(label: string, p: number): Promise<void> {
    this.ui.setProgress(p, label);
    await new Promise((r) => setTimeout(r, 0));
  }

  async init(): Promise<void> {
    const q = Settings.quality;
    await this.tick('weaving clouds', 0.05);
    const noise = generateNoiseTextures(this.renderer);
    G.uWeather.value = noise.weather;
    G.uNoise2D.value = noise.noise2D;

    await this.tick('painting the sky', 0.2);
    const sky = new SkyLUT();
    sky.update(this.renderer, SUN_DIR, 1);
    G.uSkyLUT.value = sky.texture;

    await this.tick('raising the island', 0.3);
    this.island = new Island();
    this.scene.add(this.island.group);
    this.grass = new Grass(this.island, q.grassNear, q.grassNearSpacing, q.grassFar, q.grassFarSpacing);
    this.scene.add(this.grass.group);

    await this.tick('waking the traveller', 0.45);
    const ground = (x: number, z: number) => {
      const h = this.island.heightAt(x, z);
      if (isFinite(h)) return h;
      return this.world ? this.world.heightAt(x, z) : -Infinity;
    };
    this.hero = new Character(ground);
    this.scene.add(this.hero.root);
    this.gameCam = new GameplayCamera(ground);
    this.hero.onFootstep = (i) => this.audio?.footstep(i, 'grass');
    this.hero.onEvent = (e, v) => {
      if (e === 'jump') {
        this.audio?.jump();
        if (this.mode === 'cinematic') this.cine.events.set('jump', this.cineTime);
      } else if (e === 'land') this.audio?.land(v ?? 0.5);
      else if (e === 'deploy') {
        this.audio?.gliderDeploy();
        if (this.mode === 'cinematic') this.cine.events.set('deploy', this.cineTime);
      } else if (e === 'fold') this.audio?.gliderFold();
    };

    const wm = worldModules['./world/DistantWorld.ts'];
    if (wm) {
      try {
        await this.tick('unfolding the world below', 0.55);
        const mod = (await wm()) as { DistantWorld: new (o?: { forestDensity?: number }) => DistantWorldLike };
        this.world = new mod.DistantWorld({ forestDensity: q.forestDensity });
        await this.world.build((p) => this.ui.setProgress(0.55 + p * 0.3, 'unfolding the world below'));
        this.scene.add(this.world.group);
      } catch (e) {
        console.warn('Distant world unavailable', e);
        this.world = null;
      }
    }

    await this.tick('lighting the sunset', 0.9);
    this.pipeline = new Pipeline(this.renderer, q, noise);
    this.shadows = new Shadows(q.shadowNear, q.shadowFar);
    this.shadows.collect(this.scene);
    this.resize();

    this.setupUI();
    this.startCinematic();
    const seek = parseFloat(params.get('t') ?? '');
    if (isFinite(seek) && seek > 0) this.seek(seek);
    if (params.get('mode') === 'manual') this.toManual();

    const am = audioModules['./audio/AudioEngine.ts'];
    if (am) {
      am()
        .then((mod) => {
          const A = (mod as { AudioEngine: new () => AudioLike }).AudioEngine;
          this.audio = new A();
          this.audio.setMasterVolume(Settings.user.volume);
          this.audio.setMusicEnabled(Settings.user.music);
          this.input.whenGesture(() => {
            this.audio?.unlock();
            this.ui.hideCaption();
          });
        })
        .catch((e) => console.warn('Audio unavailable', e));
    }

    await this.tick('entering the sky', 1);
    this.ui.hideLoading();
    setTimeout(() => this.ui.showControlsHint(), 1500);
    setTimeout(() => this.ui.showCaption('Click for sound · WASD to take control', 6), 2500);
    (window as unknown as { __ready: boolean }).__ready = true;
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private setupUI(): void {
    this.ui.onResume(() => this.setPaused(false));
    this.ui.onReplay(() => {
      this.setPaused(false);
      this.startCinematic();
    });
    this.ui.onQualityChange((name) => {
      Settings.applyPreset(name);
      const q = Settings.quality;
      this.pipeline.setQuality(q);
      this.shadows.resize(q.shadowNear, q.shadowFar);
      this.grass.build(this.island, q.grassNear, q.grassNearSpacing, q.grassFar, q.grassFarSpacing);
      this.resize();
    });
    this.ui.onSettingsChange(() => {
      this.audio?.setMasterVolume(Settings.user.volume);
      this.audio?.setMusicEnabled(Settings.user.music);
    });
  }

  private setPaused(p: boolean): void {
    this.paused = p;
    if (p) {
      this.ui.openMenu();
      this.input.exitPointerLock();
    } else this.ui.closeMenu();
  }

  resize(): void {
    const q = Settings.quality;
    const dpr = Math.min(window.devicePixelRatio || 1, q.maxPixelRatio);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, true);
    const scale = dpr * q.renderScale;
    this.pipeline?.allocate(w * scale, h * scale);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(w, h, true);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  startCinematic(): void {
    this.mode = 'cinematic';
    this.cineTime = 0;
    this.cine.reset();
    this.hero.reset(this.island.start, Math.atan2(RUN_DIR.x, RUN_DIR.z));
    this.hero.time = 0;
    this.gameCam.snap(this.hero, this.hero.position);
    this.handoff = 1;
    this.handoffFrom = null;
    this.titleShown = false;
    this.endShown = false;
    this.ui.setCinematicBars(true);
  }

  toManual(): void {
    if (this.mode === 'manual') return;
    this.mode = 'manual';
    this.gameCam.syncFrom(this.camera, this.hero.position);
    this.handoffFrom = { pos: this.camera.position.clone(), look: this.camera.position.clone().add(this.camera.getWorldDirection(new THREE.Vector3())), fov: this.camera.fov, roll: 0 };
    this.handoff = 0;
    this.ui.setCinematicBars(false);
  }

  private seek(t: number): void {
    while (this.cineTime < t) {
      this.simStep();
      if (Math.floor(this.cineTime * 120) % 4 === 0) this.hero.update(FIXED * 4, 1);
    }
  }

  // ------------------------------------------------------------------ cinematic script
  private directorInput(): CharInput {
    const t = this.cineTime;
    const h = this.hero;
    const inp = this.simInput;
    inp.jump = false;
    inp.sprint = false;
    inp.dive = false;
    inp.move.set(0, 0);
    h.lookYaw = t > 3.2 && t < 5.4 ? 0.85 * smoothstep(3.2, 4.2, t) : t >= 5.4 && t < 7.6 ? -0.75 * smoothstep(5.4, 6.3, t) * (1 - smoothstep(7.1, 7.6, t)) : 0;
    h.lookPitch = t > 5.4 && t < 7.6 ? -0.12 : 0;
    const ev = this.cine.events;
    if (h.state === 'ground' || h.state === 'jumpPrep' || h.state === 'land') {
      if (t < 8) return inp;
      const mag = t < 14 ? 0.36 : 1;
      inp.sprint = t > 20;
      // Steer along the path: aim a few metres ahead of the closest point.
      const path = this.island.path;
      let best = 0;
      let bd = 1e9;
      path.forEach((p, i) => {
        const d = Math.hypot(p.x - h.position.x, p.z - h.position.z);
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      const aim = path[Math.min(path.length - 1, best + 2)];
      const dir = new THREE.Vector2(aim.x - h.position.x, aim.z - h.position.z);
      if (dir.length() < 0.5 || best >= path.length - 2) dir.set(RUN_DIR.x, RUN_DIR.z);
      inp.move.copy(dir.normalize().multiplyScalar(mag));
      const toCliff = Math.hypot(this.island.cliff.x - h.position.x, this.island.cliff.z - h.position.z);
      if (toCliff < 1.9 && !ev.has('jump')) inp.jump = true;
    } else if (h.state === 'air') {
      inp.move.set(RUN_DIR.x * 0.15, RUN_DIR.z * 0.15);
      const jt = ev.get('jump') ?? t;
      inp.dive = t - jt > 1.4 && !ev.has('exit');
      const et = ev.get('exit');
      if (et !== undefined && t - et > 1.6 && !ev.has('deploy')) inp.jump = true;
    } else if (h.state === 'glide') {
      const dt = t - (ev.get('deploy') ?? t);
      inp.move.set(Math.sin(dt * 0.16) * 0.35, dt > 24 ? -0.2 : 0);
    }
    return inp;
  }

  private manualInput(): CharInput {
    const inp = this.simInput;
    const a = this.input.moveAxes();
    // Camera-relative movement.
    const yaw = this.gameCam.yaw + Math.PI;
    const f = new THREE.Vector2(Math.sin(yaw), Math.cos(yaw));
    const r = new THREE.Vector2(-f.y, f.x);
    inp.move.set(0, 0).addScaledVector(f, a.y).addScaledVector(r, -a.x);
    if (this.hero.state === 'glide') inp.move.set(a.x, a.y); // glide: bank / pitch
    inp.sprint = this.input.down('ShiftLeft') || this.input.down('ShiftRight') || this.input.gamepadButton(5);
    inp.dive = this.hero.state === 'air' && a.y > 0.5;
    return inp;
  }

  private simStep(): void {
    const inp = this.mode === 'cinematic' ? this.directorInput() : this.manualInput();
    this.hero.step(FIXED, inp);
    inp.jump = false;
    if (this.mode === 'cinematic') {
      this.cineTime += FIXED;
      const y = this.hero.position.y;
      const ev = this.cine.events;
      if (ev.has('jump') && !ev.has('cloud') && y < CLOUD_TOP - 30) ev.set('cloud', this.cineTime);
      if (ev.has('cloud') && !ev.has('exit') && y < CLOUD_BASE - 15) ev.set('exit', this.cineTime);
    }
  }

  // ------------------------------------------------------------------ frame
  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frameMs = lerp(this.frameMs, dt * 1000, 0.1);
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime > 0.25) {
      this.fps = this.fpsFrames / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
      this.updateDebug();
    }
    this.handleKeys();
    const simDt = this.paused ? 0 : dt;
    G.uTime.value += simDt;

    // Input may interrupt the cinematic.
    if (this.mode === 'cinematic' && !this.paused) {
      const a = this.input.moveAxes();
      const look = this.input.consumeLookActivity();
      if (Math.hypot(a.x, a.y) > 0.1 || this.input.wasPressed('Space') || look > 40) this.toManual();
    }
    if (this.mode === 'manual' && (this.input.wasPressed('Space') || this.input.gamepadButton(0))) this.simInput.jump = true;

    this.acc += simDt;
    let steps = 0;
    while (this.acc >= FIXED && steps < 24) {
      this.simStep();
      this.acc -= FIXED;
      steps++;
    }
    if (steps >= 24) this.acc = 0;
    const alpha = this.acc / FIXED;
    this.hero.update(simDt, alpha);
    const heroPos = this.hero.root.position.clone();
    const heroFeet = new THREE.Vector3().lerpVectors(this.hero.prevPosition, this.hero.position, alpha);
    G.uPlayerPos.value.copy(heroFeet);

    // Camera
    const sens = 0.0024 * Settings.user.mouseSensitivity;
    const gp = this.input.gamepadLook();
    const lx = this.input.mouseDX * sens + gp.x * 2.5 * dt;
    const ly = this.input.mouseDY * sens * (Settings.user.invertY ? -1 : 1) + gp.y * 2.0 * dt;
    let cs: CamState | null = null;
    if (this.mode === 'cinematic') {
      cs = this.cine.evaluate(this.cineTime, this.hero, heroFeet);
      this.cinematicBeats();
    }
    if (!cs) {
      const g = this.gameCam.update(simDt, this.hero, heroFeet, lx, ly);
      cs = { pos: g.pos.clone(), look: g.look.clone(), fov: g.fov, roll: g.roll };
      if (this.handoffFrom && this.handoff < 1) {
        this.handoff = Math.min(1, this.handoff + dt / 1.2);
        const w = smoothstep(0, 1, this.handoff);
        cs.pos.lerpVectors(this.handoffFrom.pos, cs.pos, w);
        cs.look.lerpVectors(this.handoffFrom.look, cs.look, w);
        cs.fov = lerp(this.handoffFrom.fov, cs.fov, w);
      }
    }
    this.camera.position.copy(cs.pos);
    this.camera.up.set(Math.sin(cs.roll), Math.cos(cs.roll), 0);
    this.camera.lookAt(cs.look);
    this.camera.fov = cs.fov;
    this.camera.updateProjectionMatrix();

    this.grass.update(this.camera);
    this.world?.update(simDt, this.camera);
    // Clouds drift slowly with the wind.
    (G.uCloudWind.value as THREE.Vector2).set(G.uTime.value * 1.2, G.uTime.value * 0.6);
    this.updateAudio(dt);

    this.shadows.render(this.renderer, this.scene, heroPos);
    this.pipeline.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private cinematicBeats(): void {
    const ev = this.cine.events;
    const t = this.cineTime;
    const dep = ev.get('deploy');
    if (dep !== undefined && !this.titleShown && t > dep + 6) {
      this.titleShown = true;
      this.ui.showTitle('APERTURE', 'an opening in the sky', 5);
    }
    if (dep !== undefined && !this.endShown && t > dep + 34) {
      this.endShown = true;
      this.ui.showCaption('Press C to replay · WASD to fly', 8);
      this.toManual();
    }
    // Fade-in at the start.
    this.pipeline.params.fade = t < 1.5 ? 1 - smoothstep(0, 1.5, t) : 0;
  }

  private handleKeys(): void {
    const i = this.input;
    if (i.wasPressed('F3')) this.ui.setDebugVisible(!this.ui.debugVisible);
    if (i.wasPressed('Escape')) this.setPaused(!this.paused);
    if (this.paused) return;
    if (i.wasPressed('KeyC')) this.startCinematic();
    if (i.wasPressed('KeyR') && this.mode === 'manual') {
      this.hero.reset(this.island.start, Math.atan2(RUN_DIR.x, RUN_DIR.z));
      this.gameCam.snap(this.hero, this.hero.position);
    }
  }

  private updateAudio(dt: number): void {
    if (!this.audio) return;
    const h = this.hero;
    const cy = this.camera.position.y;
    const cov = cy > CLOUD_BASE && cy < CLOUD_TOP + 80 ? smoothstep(CLOUD_TOP + 80, CLOUD_TOP - 80, cy) * smoothstep(CLOUD_BASE - 20, CLOUD_BASE + 80, cy) : 0;
    this.audio.update(dt, {
      grounded: h.grounded && h.state !== 'air' && h.state !== 'glide',
      speed: h.horizontalSpeed,
      verticalSpeed: h.velocity.y,
      airspeed: h.velocity.length(),
      altitude: h.position.y,
      cloudDensity: cov,
      belowClouds: cy < CLOUD_BASE,
      gliding: h.state === 'glide',
      inGrass: h.position.y > ISLAND_Y - 20 ? 0.8 : 0.2,
      waterfallDistance: Infinity,
      reveal: this.cine.events.has('exit') ? clamp((this.cineTime - (this.cine.events.get('exit') ?? 0)) / 6, 0, 1) : 0,
      paused: this.paused,
    });
  }

  private updateDebug(): void {
    if (!this.ui.debugVisible) return;
    const info = this.renderer.info;
    const c = this.camera.position;
    this.ui.updateDebug({
      fps: this.fps,
      frameMs: this.frameMs,
      drawCalls: info.render.calls,
      triangles: info.render.triangles,
      resolution: `${this.renderer.domElement.width}×${this.renderer.domElement.height}`,
      gpu: this.gpuName,
      characterState: `${this.hero.state}  v=${this.hero.velocity.length().toFixed(1)} m/s`,
      animationState: `${this.hero.animator.currentState} gait=${this.hero.animator.debug.phase.toFixed(2)} loco=${this.hero.animator.debug.locomotion.toFixed(2)}`,
      camera: `${c.x.toFixed(1)}, ${c.y.toFixed(1)}, ${c.z.toFixed(1)}  fov ${this.camera.fov.toFixed(0)}`,
      cinematicTime: this.mode === 'cinematic' ? `${this.cineTime.toFixed(2)} s` : 'manual',
      quality: Settings.quality.name,
    });
  }
}

const app = new App();
app.init().catch((e) => {
  console.error(e);
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;inset:auto 0 0 0;color:#fbb;font:12px monospace;padding:12px;z-index:99;white-space:pre-wrap';
  el.textContent = 'Failed to start: ' + (e && e.stack ? e.stack : e);
  document.body.appendChild(el);
});
void damp;
