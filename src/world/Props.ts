/**
 * Stylised nature props from the KayKit Medieval Hexagon Pack 1.0 by Kay Lousberg (CC0 1.0),
 * packed into self-contained GLBs and embedded. Each model is flattened into one geometry and
 * drawn as an InstancedMesh with the shared sunset lighting and a wind sway for foliage.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { withGlobals } from '../render/ShaderLib';
import { mergeGeometries, type Island } from './Island';
import { mulberry32 } from '../core/noise';

import { loadBinary } from '../character/ModelHero';

import { RUN_DIR } from './Island';
import { SUN_DIR } from './WorldConfig';

const files = {
  ...import.meta.glob('../assets/nature/*.glb', { query: '?url', import: 'default', eager: true }),
  ...import.meta.glob('../assets/buildings/*.glb', { query: '?url', import: 'default', eager: true }),
} as Record<string, string>;

interface WorldLike {
  heightAt(x: number, z: number): number;
  isWater?(x: number, z: number): boolean;
}

interface Model {
  geometry: THREE.BufferGeometry;
  map: THREE.Texture | null;
  height: number;
}

async function loadModel(name: string): Promise<Model | null> {
  const key = Object.keys(files).find((k) => k.endsWith('/' + name + '.glb'));
  if (!key) return null;
  const gltf = await new GLTFLoader().parseAsync(await loadBinary(files[key]), '');
  const geos: THREE.BufferGeometry[] = [];
  let map: THREE.Texture | null = null;
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry.clone().applyMatrix4(m.matrixWorld);
    geos.push(g);
    const mat = m.material as THREE.MeshStandardMaterial;
    if (!map && mat.map) map = mat.map;
  });
  const geometry = mergeGeometries(geos);
  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  // Feet at y = 0, centred.
  geometry.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
  if (map) (map as THREE.Texture).colorSpace = THREE.SRGBColorSpace;
  return { geometry, map, height: bb.max.y - bb.min.y };
}

function propMaterial(map: THREE.Texture | null, sway: number, height: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: withGlobals({ uMap: { value: map }, uSway: { value: sway }, uH: { value: height } }),
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uSway; uniform float uH; uniform vec4 uWind;
      varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv2; varying float vH;
      void main() {
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        float h = clamp(position.y / uH, 0.0, 1.0);
        float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
        float s = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.7) * 0.25) * uSway * h * h;
        w.xz += uWind.xy * s + vec2(sin(uTime * 5.0 + position.x * 9.0 + ph), cos(uTime * 4.3 + position.z * 9.0)) * 0.03 * uSway * h;
        vWorld = w.xyz;
        vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
        vUv2 = uv; vH = h;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uSway;
      varying vec3 vWorld; varying vec3 vNormal; varying vec2 vUv2; varying float vH;
      #include <aw_common>
      #include <aw_atmosphere>
      #include <aw_shadows>
      #include <aw_lighting>
      #include <aw_clouds>
      void main() {
        vec3 N = normalize(vNormal);
        if (!gl_FrontFacing) N = -N;
        vec3 V = normalize(cameraPosition - vWorld);
        AwSurface s = aw_defaultSurface();
        vec3 albedo = texture(uMap, vUv2).rgb;
        s.albedo = albedo * mix(1.0, 1.45, step(0.01, uSway)) + vec3(0.01, 0.015, 0.0);
        s.normal = N;
        s.roughness = 0.8;
        float foliage = step(0.01, uSway) * smoothstep(0.15, 0.4, vH);
        s.wrap = mix(0.2, 0.7, foliage);
        s.sssColor = mix(vec3(1.0), vec3(0.8, 1.0, 0.4), foliage);
        s.translucency = 0.45 * foliage;
        s.ao = mix(0.55, 1.0, smoothstep(0.0, 0.5, vH));
        s.rim = 0.35;
        s.specular = 0.3;
        float sh = aw_sunShadow(vWorld, N, dot(N, uSunDir), gl_FragCoord.xy, 8) * aw_cloudShadow(vWorld);
        gl_FragColor = vec4(aw_shade(s, vWorld, V, sh), 1.0);
      }`,
  });
}

export class Props {
  readonly group = new THREE.Group();

  /** Places one instanced model at explicit transforms: [x, y, z, yaw, height]. */
  private async place(name: string, items: [number, number, number, number, number][], shadow: boolean): Promise<void> {
    if (!items.length) return;
    const model = await loadModel(name);
    if (!model) return;
    const inst = new THREE.InstancedMesh(model.geometry, propMaterial(model.map, 0, model.height), items.length);
    const m = new THREE.Matrix4();
    items.forEach(([x, y, z, yaw, h], i) => {
      const s = h / model.height;
      m.compose(new THREE.Vector3(x, y - 0.05 * h, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(s, s, s));
      inst.setMatrixAt(i, m);
    });
    inst.userData.castShadow = shadow;
    inst.frustumCulled = false;
    this.group.add(inst);
  }

  /**
   * Signs of life: a windmill and a watch-tower on the sky island, and a riverside hamlet
   * in the valley below that the glide passes over.
   */
  async buildSettlements(island: Island, world: WorldLike | null): Promise<void> {
    const side = new THREE.Vector3(-RUN_DIR.z, 0, RUN_DIR.x);
    const at = (along: number, lateral: number) => {
      const p = RUN_DIR.clone().multiplyScalar(along).addScaledVector(side, lateral);
      return [p.x, island.heightAt(p.x, p.z), p.z] as const;
    };
    const faceYaw = Math.atan2(RUN_DIR.x, RUN_DIR.z);
    const wm = at(-78, 34);
    if (isFinite(wm[1])) {
      await this.place('building_windmill_blue', [[wm[0], wm[1], wm[2], faceYaw + 0.6, 15]], true);
      island.colliders.push({ x: wm[0], z: wm[2], r: 5 });
    }
    const tw = at(70, -30);
    if (isFinite(tw[1])) {
      await this.place('building_tower_A_blue', [[tw[0], tw[1], tw[2], faceYaw - 0.4, 13]], true);
      island.colliders.push({ x: tw[0], z: tw[2], r: 4 });
    }
    const we = at(-40, -14);
    if (isFinite(we[1])) await this.place('building_well_blue', [[we[0], we[1], we[2], 0.3, 3.2]], true);

    if (!world) return;
    // Valley hamlet along the glide corridor.
    const sx = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize();
    const px = new THREE.Vector2(-sx.y, sx.x);
    const rand = mulberry32(77);
    const kinds = ['building_home_A_blue', 'building_home_B_blue', 'building_home_A_blue', 'building_tavern_blue', 'building_market_blue', 'building_church_blue', 'building_lumbermill_blue', 'building_windmill_blue'];
    const byKind = new Map<string, [number, number, number, number, number][]>();
    const placed: THREE.Vector2[] = [];
    let tries = 0;
    while (placed.length < 26 && tries++ < 4000) {
      const along = 1800 + rand() * 2600;
      const lat = (rand() < 0.5 ? -1 : 1) * (160 + rand() * 900);
      const x = sx.x * along + px.x * lat;
      const z = sx.y * along + px.y * lat;
      if (world.isWater?.(x, z)) continue;
      const h = world.heightAt(x, z);
      const slope = Math.abs(world.heightAt(x + 12, z) - h) + Math.abs(world.heightAt(x, z + 12) - h);
      if (!isFinite(h) || h > 260 || slope > 5) continue;
      const p = new THREE.Vector2(x, z);
      if (placed.some((q) => q.distanceTo(p) < 38)) continue;
      // Cluster into two hamlets.
      const c1 = new THREE.Vector2(sx.x * 2600 + px.x * 420, sx.y * 2600 + px.y * 420);
      const c2 = new THREE.Vector2(sx.x * 3900 - px.x * 520, sx.y * 3900 - px.y * 520);
      if (Math.min(p.distanceTo(c1), p.distanceTo(c2)) > 260) continue;
      placed.push(p);
      const kind = kinds[Math.floor(rand() * kinds.length)];
      const height = kind.includes('windmill') ? 26 : kind.includes('church') ? 24 : 15 + rand() * 5;
      if (!byKind.has(kind)) byKind.set(kind, []);
      byKind.get(kind)!.push([x, h, z, rand() * Math.PI * 2, height]);
    }
    // A watermill beside the river, a castle keep on a nearby rise.
    for (let i = 0; i < 400; i++) {
      const along = 2200 + i * 12;
      const x = sx.x * along;
      const z = sx.y * along;
      for (const lat of [-40, 40, -80, 80, -140, 140]) {
        const qx = x + px.x * lat;
        const qz = z + px.y * lat;
        if (!world.isWater?.(qx, qz) && world.isWater?.(qx - px.x * Math.sign(lat) * 30, qz - px.y * Math.sign(lat) * 30)) {
          byKind.set('building_watermill_blue', [[qx, world.heightAt(qx, qz), qz, Math.atan2(px.x, px.y), 18]]);
          i = 400;
          break;
        }
      }
    }
    for (const [kind, items] of byKind) await this.place(kind, items, false);
    const kx = sx.x * 5200 + px.x * 1300;
    const kz = sx.y * 5200 + px.y * 1300;
    await this.place('building_castle_blue', [[kx, world.heightAt(kx, kz), kz, 2.2, 60]], false);
  }

  async build(island: Island): Promise<void> {
    const rand = mulberry32(2024);
    const specs: { name: string; count: number; h: [number, number]; sway: number; rim: [number, number]; clear: number }[] = [
      { name: 'trees_A_large', count: 7, h: [4.5, 7], sway: 0.35, rim: [0.25, 0.88], clear: 9 },
      { name: 'trees_B_large', count: 7, h: [6, 9.5], sway: 0.35, rim: [0.25, 0.88], clear: 9 },
      { name: 'trees_A_medium', count: 10, h: [4.5, 7], sway: 0.35, rim: [0.2, 0.92], clear: 7 },
      { name: 'tree_single_A', count: 12, h: [3.5, 6], sway: 0.4, rim: [0.15, 0.95], clear: 5 },
      { name: 'tree_single_B', count: 12, h: [4, 6.5], sway: 0.4, rim: [0.15, 0.95], clear: 5 },
      { name: 'rock_single_A', count: 18, h: [0.6, 2.2], sway: 0, rim: [0.2, 0.99], clear: 3.5 },
      { name: 'rock_single_B', count: 16, h: [0.8, 3.0], sway: 0, rim: [0.5, 0.99], clear: 3.5 },
      { name: 'rock_single_C', count: 14, h: [0.8, 2.6], sway: 0, rim: [0.3, 0.99], clear: 3.5 },
      { name: 'rock_single_D', count: 14, h: [0.5, 1.6], sway: 0, rim: [0.1, 0.99], clear: 3 },
      { name: 'rock_single_E', count: 10, h: [1.5, 4.0], sway: 0, rim: [0.6, 0.99], clear: 4 },
    ];
    const placed: { x: number; z: number; r: number }[] = [];
    for (const sp of specs) {
      const model = await loadModel(sp.name);
      if (!model) continue;
      const inst = new THREE.InstancedMesh(model.geometry, propMaterial(model.map, sp.sway, model.height), sp.count);
      const m = new THREE.Matrix4();
      let n = 0;
      let tries = 0;
      while (n < sp.count && tries++ < 3000) {
        const th = rand() * Math.PI * 2;
        const rr = sp.rim[0] + (sp.rim[1] - sp.rim[0]) * Math.sqrt(rand());
        const x = Math.cos(th) * 150 * rr;
        const z = Math.sin(th) * 150 * rr;
        const rad = island.radial(x, z);
        if (rad < sp.rim[0] || rad > sp.rim[1]) continue;
        if (island.pathDistance(x, z) < sp.clear) continue;
        const cliffD = Math.hypot(x - island.cliff.x, z - island.cliff.z);
        if (cliffD < 16 && sp.sway > 0) continue;
        const startD = Math.hypot(x - island.start.x, z - island.start.z);
        if (startD < 10) continue;
        const footprint = sp.sway > 0 ? sp.clear * 0.6 : sp.h[1] * 0.4;
        if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + footprint)) continue;
        const y = island.heightAt(x, z);
        if (!isFinite(y)) continue;
        const height = sp.h[0] + (sp.h[1] - sp.h[0]) * rand();
        const s = height / model.height;
        m.compose(
          new THREE.Vector3(x, y - 0.15 * s, z),
          new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.06, rand() * Math.PI * 2, (rand() - 0.5) * 0.06)),
          new THREE.Vector3(s, s * (0.9 + rand() * 0.2), s),
        );
        inst.setMatrixAt(n++, m);
        placed.push({ x, z, r: footprint });
        island.colliders.push({ x, z, r: sp.sway > 0 ? 0.6 : height * 0.35 });
      }
      inst.count = n;
      inst.userData.castShadow = true;
      inst.frustumCulled = false;
      this.group.add(inst);
    }
  }
}
