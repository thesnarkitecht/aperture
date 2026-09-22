import * as THREE from 'three';
import { LightPool } from './engine/lightPool';
import { Pipeline, QUALITY, type QualityName } from './engine/pipeline';
import { FX_LAYER, shared } from './engine/shared';
import { EXTERIOR } from './engine/zones';
import { createMaterials, type Materials } from './materials/library';
import { bakeSky, createPlanet, createStarPoints, SUN_DIR } from './materials/space';
import { createDust } from './materials/fx';
import { buildShip, type Ship } from './ship';
import { ROOMS } from './ship/layout';

export interface CameraDriver {
  /** Update the camera; return false to leave it untouched. */
  update(dt: number, camera: THREE.PerspectiveCamera, app: App): void;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class App {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(72, 1, 0.05, 40000);
  readonly pipeline: Pipeline;
  M!: Materials;
  ship!: Ship;
  lights!: LightPool;
  readonly hemi = new THREE.HemisphereLight(0x405060, 0x201810, 0.3);
  readonly sun = new THREE.DirectionalLight(0xfff0dc, 5.5);
  readonly flashlight = new THREE.SpotLight(0xfff4e0, 0, 22, 0.42, 0.45, 1.6);
  flashlightOn = false;
  private planet!: THREE.Group;
  private sunSprite!: THREE.Group;
  private stars!: THREE.Points;
  private dust!: THREE.Points;
  private spaceEnv: THREE.Texture | null = null;
  driver: CameraDriver | null = null;
  time = 0;
  zone = EXTERIOR;
  private weights = new Map<string, number>();
  private exposure = 1;
  private fog = new THREE.FogExp2(0x000000, 0);
  private hemiTarget = { sky: new THREE.Color(), ground: new THREE.Color(), intensity: 0.3 };
  onZoneChange?: (zone: string) => void;
  frameMs = 16;
  private snapNext = true;
  constructor(
    readonly container: HTMLElement,
    public qualityName: QualityName,
    readonly opts: { capture?: boolean } = {},
  ) {
    this.pipeline = new Pipeline(container, this.scene, this.camera, QUALITY[qualityName], { preserveDrawingBuffer: !!opts.capture });
    this.scene.fog = this.fog;
    this.camera.layers.enable(FX_LAYER);
    // Offline renders keep grain subtle so the encoder spends bits on the image, not noise.
    if (opts.capture) this.pipeline.finalUniforms.uGrain.value = 0.014;
  }

  async init(progress: (frac: number, label: string) => void) {
    const renderer = this.pipeline.renderer;
    const q = this.pipeline.quality;
    progress(0.02, 'Forging surface textures');
    await nextFrame();
    this.M = createMaterials(renderer);

    progress(0.2, 'Charting the star field');
    await nextFrame();
    const sky = bakeSky(renderer, this.qualityName === 'cinematic' ? 2048 : 1024);
    this.scene.background = sky.texture;
    const { planet, sun } = createPlanet();
    this.planet = planet;
    this.sunSprite = sun;
    this.stars = createStarPoints();
    this.scene.add(planet, sun, this.stars);
    for (const o of [planet, sun, this.stars]) o.traverse((c) => c.layers.set(FX_LAYER));

    progress(0.3, 'Laying the keel');
    await nextFrame();
    this.lights = new LightPool(this.scene, q.lights);
    const steps = 12;
    let step = 0;
    this.ship = buildShip(this.M, this.lights, (label) => {
      step++;
      progress(0.3 + (0.4 * step) / steps, label);
    });
    this.scene.add(this.ship.zones.root);

    // Lighting rig.
    this.scene.add(this.hemi);
    const center = new THREE.Vector3(0, 2, 6);
    this.sun.position.copy(SUN_DIR).multiplyScalar(90).add(center);
    this.sun.target.position.copy(center);
    this.scene.add(this.sun, this.sun.target);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -46;
    sc.right = 46;
    sc.top = 46;
    sc.bottom = -46;
    sc.near = 10;
    sc.far = 180;
    this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.035;
    this.sun.shadow.radius = 2;
    this.camera.add(this.flashlight, this.flashlight.target);
    this.flashlight.position.set(0.15, -0.15, 0);
    this.flashlight.target.position.set(0, -0.1, -1);
    this.scene.add(this.camera);
    this.dust = createDust(this.opts.capture ? 2200 : 1400);
    this.dust.layers.set(FX_LAYER);
    this.scene.add(this.dust);

    progress(0.75, 'Compiling shaders');
    await nextFrame();
    this.renderShadows();
    this.pipeline.renderer.compile(this.scene, this.camera);

    progress(0.82, 'Capturing reflection probes');
    await nextFrame();
    this.bakeProbes();

    progress(1, 'Ready');
    this.resize();
  }

  get stats() {
    const info = this.pipeline.renderer.info;
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs?.length ?? 0,
      lights: this.lights.count,
      zone: this.zone,
      pixelRatio: this.pipeline.pixelRatio,
      ship: this.ship.stats,
    };
  }

  resize(w = this.container.clientWidth || window.innerWidth, h = this.container.clientHeight || window.innerHeight) {
    this.pipeline.setSize(w, h);
    const pr = this.pipeline.pixelRatio;
    (this.stars.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pr;
    (this.dust.material as THREE.ShaderMaterial).uniforms.uPixelRatio.value = pr;
  }

  setQuality(name: QualityName) {
    this.qualityName = name;
    const q = QUALITY[name];
    this.pipeline.applyQuality(q);
    if (this.lights.count !== q.lights) this.lights.setCount(q.lights);
    if (this.sun.shadow.mapSize.x !== q.shadowSize) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
      this.renderShadows();
    }
    this.resize();
  }

  /** The ship is static, so the sun's shadow map is rendered once (and when the hatch moves). */
  renderShadows() {
    const renderer = this.pipeline.renderer;
    this.ship.zones.showAll();
    renderer.shadowMap.needsUpdate = true;
    const rt = new THREE.WebGLRenderTarget(4, 4);
    renderer.setRenderTarget(rt);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
    rt.dispose();
  }

  private bakeProbes() {
    const renderer = this.pipeline.renderer;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const cubeRT = new THREE.WebGLCubeRenderTarget(this.qualityName === 'cinematic' ? 256 : 128, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    const cubeCam = new THREE.CubeCamera(0.05, 30000, cubeRT);
    cubeCam.children.forEach((c) => c.layers.enable(FX_LAYER));
    this.scene.add(cubeCam);
    shared.uSSAOStrength.value = 0;

    // Space environment for the exterior: sky + planet + sun only.
    this.ship.zones.root.visible = false;
    this.dust.visible = false;
    this.hemi.intensity = 0;
    cubeCam.position.set(0, 3, 0);
    cubeCam.update(renderer, this.scene);
    this.spaceEnv = pmrem.fromCubemap(cubeRT.texture).texture;
    this.ship.zones.get(EXTERIOR).env = this.spaceEnv;
    this.ship.zones.root.visible = true;

    // Two passes: the second sees the first pass's reflections (one bounce of fake GI).
    let prev = new Map<string, THREE.WebGLRenderTarget>();
    for (let pass = 0; pass < 2; pass++) {
      const next = new Map<string, THREE.WebGLRenderTarget>();
      for (const room of ROOMS) {
        const pos = new THREE.Vector3(...room.probe);
        const w = this.ship.zones.computeWeights(room.id);
        this.ship.zones.applyVisibility(w);
        for (const d of this.ship.doors) d.group.visible = (w.get(d.def.zones[0]) ?? 0) > 0 || (w.get(d.def.zones[1]) ?? 0) > 0;
        this.lights.update(pos, (id) => w.get(id) ?? 0, Infinity, 0);
        this.hemi.color.setHex(room.ambient.sky);
        this.hemi.groundColor.setHex(room.ambient.ground);
        this.hemi.intensity = room.ambient.intensity;
        this.scene.environment = pass === 0 ? this.spaceEnv : (prev.get(room.id)?.texture ?? null);
        this.scene.environmentIntensity = 1;
        this.planet.visible = (w.get(EXTERIOR) ?? 0) > 0;
        cubeCam.position.copy(pos);
        cubeCam.update(renderer, this.scene);
        next.set(room.id, pmrem.fromCubemap(cubeRT.texture));
      }
      for (const rt of prev.values()) rt.dispose();
      prev = next;
    }
    for (const room of ROOMS) this.ship.zones.get(room.id).env = prev.get(room.id)!.texture;
    this.scene.remove(cubeCam);
    cubeRT.dispose();
    pmrem.dispose();
    this.dust.visible = true;
    this.planet.visible = true;
    shared.uSSAOStrength.value = 1;
    this.zone = '';
  }

  /** Skip adaptation smoothing on the next frame (camera cut). */
  snap() {
    this.snapNext = true;
  }

  /** Advance simulation by dt seconds and (optionally) render one frame. */
  frame(dt: number, render = true) {
    const t0 = performance.now();
    this.time += dt;
    shared.uTime.value = this.time;
    this.driver?.update(dt, this.camera, this);
    this.camera.updateMatrixWorld();

    const eye = this.camera.position;
    const zones = this.ship.zones;
    const zoneId = zones.locate(eye);
    if (zoneId !== this.zone) {
      this.zone = zoneId;
      const z = zones.get(zoneId);
      this.scene.environment = z.env;
      this.onZoneChange?.(zoneId);
    }
    const zone = zones.get(this.zone);
    this.weights = zones.computeWeights(this.zone);
    zones.applyVisibility(this.weights);
    const w = this.weights;

    for (const d of this.ship.doors) {
      const vis = (w.get(d.def.zones[0]) ?? 0) > 0 || (w.get(d.def.zones[1]) ?? 0) > 0;
      d.update(eye, dt, vis);
    }
    for (const a of this.ship.animators) a(this.time, dt);
    this.lights.update(eye, (id) => w.get(id) ?? 0, dt, this.time);

    // Smoothly adapt ambient, exposure and haze to the current room (instantly after a cut).
    const k = this.snapNext || !Number.isFinite(dt) ? 1 : 1 - Math.exp(-dt * 3);
    this.snapNext = false;
    this.hemiTarget.sky.setHex(zone.ambient.sky);
    this.hemiTarget.ground.setHex(zone.ambient.ground);
    this.hemi.color.lerp(this.hemiTarget.sky, k);
    this.hemi.groundColor.lerp(this.hemiTarget.ground, k);
    this.hemi.intensity += (zone.ambient.intensity - this.hemi.intensity) * k;
    this.exposure += (zone.exposure - this.exposure) * k;
    this.fog.density += (zone.fog - this.fog.density) * k;
    this.fog.color.lerp(new THREE.Color(zone.fogColor), k);
    this.pipeline.finalUniforms.uExposure.value = this.exposure;

    const outsideVisible = (w.get(EXTERIOR) ?? 0) > 0;
    this.planet.visible = outsideVisible;
    this.sunSprite.visible = outsideVisible;
    this.dust.visible = this.zone !== EXTERIOR;
    (this.dust.material as THREE.ShaderMaterial).uniforms.uOrigin.value.copy(eye);
    this.flashlight.intensity = this.flashlightOn ? 40 : 0;

    if (render) this.pipeline.render();
    this.frameMs = this.frameMs * 0.9 + (performance.now() - t0) * 0.1;
  }
}
