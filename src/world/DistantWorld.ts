/**
 * The distant world below the cloud sea: a vast eroded landscape at sunset with a broad green
 * glide valley, a meandering river flowing into a large lake, mountain flanks piercing the
 * cloud deck, a great range framing the sun, forests, other floating islands with waterfalls,
 * ancient ruins, a far horizon ring and a few bird flocks.
 *
 * Everything outputs unfogged linear HDR; the composite applies aerial perspective from depth.
 *
 * Draw calls: terrain, water, conifers, broadleaves, islands+ruins, waterfalls, horizon, birds (8).
 */
import * as THREE from 'three';
import { mulberry32 } from '../core/noise';
import { withGlobals } from '../render/ShaderLib';
import { WATER_LEVEL } from './WorldConfig';
import { TerrainData, corridorToWorld } from './distant/TerrainGen';
import { buildTerrainMesh, buildTerrainTextures, buildWaterMesh, TerrainTextures } from './distant/TerrainMesh';
import { Forest, TreeInstance } from './distant/Forest';
import { buildIslands, PROP_FS, PROP_VS } from './distant/Islands';
import { horizonParts } from './distant/Horizon';
import { buildBirds } from './distant/Birds';
import { mergeColored } from './distant/geo';

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

export class DistantWorld {
  readonly group: THREE.Group;
  /** Stats filled after build (for debugging / HUD). */
  readonly stats = { drawCalls: 0, triangles: 0, trees: 0 };
  /** World position of the ruined ridge tower (after build). */
  readonly towerPosition = new THREE.Vector3();
  ready = false;

  private readonly terrain: TerrainData;
  private readonly forestDensity: number;
  private readonly timeUniforms: THREE.IUniform[] = [];
  private textures: TerrainTextures | null = null;
  private time = 0;

  constructor(opts?: { forestDensity?: number }) {
    this.forestDensity = Math.min(1, Math.max(0, opts?.forestDensity ?? 1));
    this.group = new THREE.Group();
    this.group.name = 'DistantWorld';
    this.terrain = new TerrainData(540);
  }

  /** Generation is chunked (yields to the event loop); reports progress 0..1. */
  async build(onProgress?: (p: number) => void): Promise<void> {
    const report = onProgress ?? (() => {});
    const td = this.terrain;
    await td.generate((p) => report(p * 0.8));

    const tex = buildTerrainTextures(td);
    this.textures = tex;
    const terrainMesh = buildTerrainMesh(td, tex);
    this.group.add(terrainMesh);
    const water = buildWaterMesh(td, tex);
    this.group.add(water.mesh);
    this.timeUniforms.push(water.time);
    report(0.84);
    await yieldFrame();

    // Ruined tower on a ridge beside the corridor, below the cloud base so the glide sees it.
    const tower = this.findRidge();
    this.towerPosition.copy(tower);
    const islands = buildIslands(tower);
    this.group.add(islands.props);
    if (islands.falls) this.group.add(islands.falls);
    this.timeUniforms.push(islands.time);
    report(0.87);
    await yieldFrame();

    // Forest scatter.
    const { conifers, broadleaves } = await this.scatterTrees((p) => report(0.87 + p * 0.1));
    conifers.push(...islands.conifers);
    broadleaves.push(...islands.broadleaves);
    const forest = new Forest(conifers, broadleaves, 3500 + 6000 * this.forestDensity);
    for (const m of forest.meshes) this.group.add(m);

    // Horizon ring + apron (no close-up detail needed).
    const horizon = new THREE.Mesh(
      mergeColored(horizonParts()),
      new THREE.ShaderMaterial({
        uniforms: withGlobals({ uDetail: { value: 0 } }),
        vertexShader: PROP_VS,
        fragmentShader: PROP_FS,
      }),
    );
    horizon.name = 'HorizonRing';
    horizon.matrixAutoUpdate = false;
    this.group.add(horizon);

    const birds = buildBirds();
    this.group.add(birds.mesh);
    this.timeUniforms.push(birds.time);

    this.group.updateMatrixWorld(true);

    // Stats.
    let tris = 0;
    let calls = 0;
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      calls++;
      const g = m.geometry;
      const base = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
      tris += (g as THREE.InstancedBufferGeometry).isInstancedBufferGeometry ? base * (g as THREE.InstancedBufferGeometry).instanceCount : base;
    });
    this.stats.drawCalls = calls;
    this.stats.triangles = Math.round(tris);
    this.stats.trees = conifers.length + broadleaves.length;
    this.ready = true;
    report(1);
  }

  /** Terrain height at a world position (matches the rendered mesh triangles). */
  heightAt(x: number, z: number): number {
    return this.terrain.heightAt(x, z);
  }

  /** Is (x,z) over open water (river or lake)? */
  isWater(x: number, z: number): boolean {
    return this.terrain.heightAt(x, z) < WATER_LEVEL;
  }

  update(dt: number, _camera: THREE.Camera): void {
    this.time += dt;
    for (const u of this.timeUniforms) u.value = this.time;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    this.textures?.height.dispose();
    this.textures?.bake.dispose();
  }

  // -------------------------------------------------------------------------------------------

  private findRidge(): THREE.Vector3 {
    const td = this.terrain;
    let best = -1e9;
    const out = new THREE.Vector3();
    for (let a = 3000; a <= 7500; a += 60) {
      for (const sgn of [-1, 1]) {
        for (let s = 1300; s <= 3600; s += 60) {
          const [x, z] = corridorToWorld(a, s * sgn);
          const h = td.heightAt(x, z);
          if (h < 380 || h > 760) continue;
          let avg = 0;
          for (let k = 0; k < 6; k++) {
            const ang = (k / 6) * Math.PI * 2;
            avg += td.heightAt(x + Math.cos(ang) * 140, z + Math.sin(ang) * 140);
          }
          avg /= 6;
          // Prominent (ridge-like) and facing the corridor, preferring sites closer to it.
          const score = h - avg - s * 0.02 + (sgn > 0 ? 8 : 0);
          if (score > best) {
            best = score;
            out.set(x, h, z);
          }
        }
      }
    }
    if (best === -1e9) {
      const [x, z] = corridorToWorld(5000, 2200);
      out.set(x, td.heightAt(x, z), z);
    }
    return out;
  }

  private async scatterTrees(report: (p: number) => void): Promise<{ conifers: TreeInstance[]; broadleaves: TreeInstance[] }> {
    const td = this.terrain;
    const dens = this.forestDensity;
    const conifers: TreeInstance[] = [];
    const broadleaves: TreeInstance[] = [];
    const target = Math.round(36000 * dens);
    if (target === 0) return { conifers, broadleaves };
    const rnd = mulberry32(20240917);
    const sideMax = 3000 + 3500 * dens;
    const aMin = -3500;
    const aMax = 9000 + 7000 * dens;
    const n = new THREE.Vector3();
    let count = 0;
    let attempts = 0;
    let t0 = performance.now();
    const place = (x: number, z: number): boolean => {
      const h = td.heightAt(x, z);
      if (h < WATER_LEVEL + 3) return false;
      // Slope from nearby heights.
      const hx = td.heightAt(x + 8, z);
      const hz = td.heightAt(x, z + 8);
      n.set(-(hx - h) / 8, 1, -(hz - h) / 8).normalize();
      if (n.y < 0.8) return false;
      const hi = Math.min(1, Math.max(0, (h - 120) / 500));
      const con = rnd() < 0.2 + 0.72 * hi;
      const t: TreeInstance = {
        x,
        y: h - 0.8,
        z,
        height: con ? 15 + rnd() * 14 : 10 + rnd() * 8,
        width: con ? 0.75 + rnd() * 0.35 : 0.85 + rnd() * 0.35,
        rot: rnd() * Math.PI * 2,
        tint: rnd(),
        shadow: td.sampleField(td.shadow, x, z),
        ao: 0.6 + 0.4 * td.sampleField(td.ao, x, z),
      };
      (con ? conifers : broadleaves).push(t);
      count++;
      return true;
    };
    while (count < target && attempts < target * 4) {
      attempts++;
      const along = aMin + (aMax - aMin) * rnd();
      const side = (rnd() < 0.5 ? -1 : 1) * sideMax * Math.pow(rnd(), 1.3);
      const [x, z] = corridorToWorld(along, side);
      const f = td.sampleField(td.forest, x, z);
      if (f < 0.12) {
        // Occasional lone meadow tree.
        if (rnd() < 0.05) place(x, z);
        continue;
      }
      if (rnd() > f) continue;
      const clump = 4 + Math.floor(rnd() * 12);
      const rad = 18 + rnd() * 36;
      for (let i = 0; i < clump && count < target; i++) {
        const a = rnd() * Math.PI * 2;
        const r = rad * Math.sqrt(rnd());
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        if (td.sampleField(td.forest, px, pz) < 0.15) continue;
        place(px, pz);
      }
      if ((attempts & 63) === 0 && performance.now() - t0 > 12) {
        report(count / target);
        await yieldFrame();
        t0 = performance.now();
      }
    }
    report(1);
    return { conifers, broadleaves };
  }
}
