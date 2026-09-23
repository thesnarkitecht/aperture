/**
 * Skinned hero model: "Rogue (Hooded)" from the KayKit Adventurers Character Pack 1.0 by
 * Kay Lousberg — CC0 1.0 (www.kaylousberg.com). Embedded in the bundle.
 *
 * The controller's state drives a small blend tree of the model's clips; every action runs
 * continuously and its weight is damped towards a target, so all transitions crossfade:
 *   ground : Idle ↔ Walking_A ↔ Running_A (speed-synchronised time scales)
 *   jump   : Jump_Start (one-shot) → Jump_Idle
 *   fall   : Jump_Idle blended with T-Pose (arms spread against the airflow)
 *   glide  : mostly T-Pose (arms out, gripping the wing ribs)
 *   land   : Jump_Land (one-shot)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import heroGlb from '../assets/Rogue_Hooded.glb?url';
import { withGlobals } from '../render/ShaderLib';
import { damp, smoothstep, clamp } from '../core/math';
import type { AnimState } from './Animator';

const HIDDEN = ['Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Knife', 'Throwable'];

/** Decodes an inlined data: URI (single-file build) or fetches a regular asset URL. */
export async function loadBinary(uri: string): Promise<ArrayBuffer> {
  if (!uri.startsWith('data:')) return (await fetch(uri)).arrayBuffer();
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function heroMaterial(map: THREE.Texture | null): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: withGlobals({ uMap: { value: map } }),
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv2;
      void main() {
        vec3 transformed = position;
        vec3 objectNormal = normal;
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <skinning_vertex>
        vec4 w = modelMatrix * vec4(transformed, 1.0);
        vWorld = w.xyz;
        vNormal = normalize(mat3(modelMatrix) * objectNormal);
        vUv2 = uv;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv2;
      #include <aw_common>
      #include <aw_atmosphere>
      #include <aw_shadows>
      #include <aw_lighting>
      #include <aw_clouds>
      void main() {
        vec3 N = normalize(vNormal);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(cameraPosition - vWorld);
        vec3 albedo = texture(uMap, vUv2).rgb;
        // Original palette: remap the pack's greens to deep indigo-teal travel cloth.
        float mx = max(albedo.r, max(albedo.g, albedo.b));
        float mn = min(albedo.r, min(albedo.g, albedo.b));
        float greenish = smoothstep(0.02, 0.12, albedo.g - max(albedo.r, albedo.b)) * step(0.0001, mx - mn);
        // Dark greens → deep indigo cloth, light greens → teal trim.
        vec3 recol = mix(vec3(0.09, 0.12, 0.36), vec3(0.18, 0.56, 0.58), smoothstep(0.25, 0.55, mx)) * (0.7 + mx);
        albedo = mix(albedo, recol, greenish);
        AwSurface s = aw_defaultSurface();
        s.albedo = albedo * 1.05;
        s.normal = N;
        s.roughness = 0.7;
        s.wrap = 0.45;
        s.sssColor = vec3(1.0, 0.7, 0.55);
        s.translucency = 0.12;
        s.rim = 1.2;
        s.specular = 0.45;
        float sh = aw_sunShadow(vWorld, N, dot(N, uSunDir), gl_FragCoord.xy, 12) * aw_cloudShadow(vWorld);
        gl_FragColor = vec4(aw_shade(s, vWorld, V, sh), 0.0);
      }`,
  });
}

export interface HeroAnimParams {
  state: AnimState;
  speed: number;
  airTime: number;
  glideDeploy: number;
  landT: number;
  dive: number;
  time: number;
}

export class ModelHero {
  readonly root = new THREE.Group();
  private mixer!: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private weights = new Map<string, number>();
  private lastState: AnimState = 'ground';
  private cape: THREE.Object3D | null = null;
  private capeRest = new THREE.Quaternion();
  meshes: THREE.SkinnedMesh[] = [];
  height = 1.75;

  async load(): Promise<void> {
    const gltf = await new GLTFLoader().parseAsync(await loadBinary(heroGlb), '');
    const model = gltf.scene;
    let map: THREE.Texture | null = null;
    model.traverse((o) => {
      if (HIDDEN.includes(o.name)) o.visible = false;
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        const src = m.material as THREE.MeshStandardMaterial;
        if (!map && src.map) map = src.map;
      }
      if (o.name === 'Rogue_Cape') this.cape = o;
    });
    if (map) (map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
    const mat = heroMaterial(map);
    model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh && o.visible) {
        m.material = mat;
        m.frustumCulled = false;
        m.userData.castShadow = true;
        if (m.isSkinnedMesh) this.meshes.push(m);
      }
    });
    if (this.cape) this.capeRest.copy(this.cape.quaternion);
    // Normalise to ~1.72 m tall, feet at the origin.
    const box = new THREE.Box3().setFromObject(model);
    const h = box.max.y - box.min.y;
    const s = 1.72 / h;
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    this.height = 1.72;
    this.root.add(model);

    this.mixer = new THREE.AnimationMixer(model);
    const want: Record<string, string> = {
      idle: 'Unarmed_Idle',
      walk: 'Walking_A',
      run: 'Running_A',
      jumpStart: 'Jump_Start',
      jumpIdle: 'Jump_Idle',
      land: 'Jump_Land',
      spread: 'T-Pose',
    };
    for (const [k, name] of Object.entries(want)) {
      const clip = gltf.animations.find((a) => a.name === name) ?? gltf.animations.find((a) => a.name === 'Idle');
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      if (k === 'jumpStart' || k === 'land') {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      a.enabled = true;
      a.setEffectiveWeight(k === 'idle' ? 1 : 0);
      a.play();
      this.actions.set(k, a);
      this.weights.set(k, k === 'idle' ? 1 : 0);
    }
  }

  update(dt: number, p: HeroAnimParams): void {
    if (!this.mixer) return;
    const t: Record<string, number> = { idle: 0, walk: 0, run: 0, jumpStart: 0, jumpIdle: 0, land: 0, spread: 0 };
    if (p.state !== this.lastState) {
      if (p.state === 'jumpPrep') this.actions.get('jumpStart')?.reset().play();
      if (p.state === 'land') this.actions.get('land')?.reset().play();
      this.lastState = p.state;
    }
    const sp = p.speed;
    switch (p.state) {
      case 'ground': {
        const moving = smoothstep(0.08, 1.0, sp);
        const run = smoothstep(2.0, 4.2, sp);
        t.idle = 1 - moving;
        t.walk = moving * (1 - run);
        t.run = moving * run;
        this.actions.get('walk')!.timeScale = clamp(sp / 1.45, 0.6, 1.6);
        this.actions.get('run')!.timeScale = clamp(sp / 5.2, 0.7, 1.45);
        break;
      }
      case 'jumpPrep':
        t.jumpStart = 1;
        this.actions.get('jumpStart')!.timeScale = 1.6;
        break;
      case 'air': {
        const fall = smoothstep(0.7, 1.8, p.airTime);
        t.jumpStart = 1 - smoothstep(0.0, 0.45, p.airTime);
        t.jumpIdle = (1 - t.jumpStart) * (1 - fall * 0.6);
        t.spread = (1 - t.jumpStart) * fall * 0.6;
        break;
      }
      case 'glide':
        t.spread = 0.8;
        t.jumpIdle = 0.2;
        break;
      case 'land':
        t.land = 1;
        break;
    }
    const rate = p.state === 'land' || p.state === 'jumpPrep' ? 18 : 9;
    let sum = 0;
    for (const k of Object.keys(t)) {
      const w = damp(this.weights.get(k) ?? 0, t[k], rate, dt);
      this.weights.set(k, w);
      sum += w;
    }
    for (const [k, a] of this.actions) a.setEffectiveWeight((this.weights.get(k) ?? 0) / Math.max(sum, 1e-3));
    this.mixer.update(dt);
    // Cape streams upward/backward with airflow while airborne.
    if (this.cape) {
      const air = p.state === 'air' || p.state === 'glide' ? 1 : 0;
      const flap = Math.sin(p.time * 16) * 0.15 + Math.sin(p.time * 23) * 0.08;
      const lift = air * (0.9 + flap);
      this.cape.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-lift, 0, 0)));
    }
  }
}
