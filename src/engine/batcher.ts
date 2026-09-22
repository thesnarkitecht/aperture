import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type UVMode =
  /** Project UVs per face along the dominant normal axis, in local space (meters / uvScale). */
  | 'box'
  /** Keep the geometry's own UVs, optionally scaled by uvRepeat. */
  | 'keep';

export interface AddOptions {
  /** Linear-space vertex color. Values above 1 are allowed for emissive (HDR) materials. */
  color?: THREE.Color;
  uv?: UVMode;
  /** Meters per texture repeat for 'box' mapping. Defaults to the material's userData.uvScale or 1. */
  uvScale?: number;
  /** UV multiplier for 'keep' mapping. */
  uvRepeat?: [number, number];
  /** UV offset applied after mapping, handy for decorrelating repeated pieces. */
  uvOffset?: [number, number];
  /** Added to local positions before 'box' projection, so adjacent pieces share one continuous mapping. */
  uvShift?: [number, number, number];
}

interface Bucket {
  zone: string;
  material: THREE.Material;
  geos: THREE.BufferGeometry[];
  vertices: number;
}

const WHITE = new THREE.Color(1, 1, 1);

/**
 * Collects static geometry and merges it into one mesh per (zone, material).
 * Pieces are baked into world space, so the whole ship renders in a few dozen
 * draw calls while zones stay separately cullable.
 */
export class Batcher {
  private buckets = new Map<string, Bucket>();
  private materialIds = new Map<THREE.Material, number>();
  pieceCount = 0;

  add(source: THREE.BufferGeometry, matrix: THREE.Matrix4, material: THREE.Material, zone: string, opts: AddOptions = {}) {
    const geo = new THREE.BufferGeometry();
    const srcPos = source.getAttribute('position') as THREE.BufferAttribute;
    geo.setAttribute('position', srcPos.clone());
    let srcNormal = source.getAttribute('normal') as THREE.BufferAttribute | undefined;
    if (!srcNormal) {
      source.computeVertexNormals();
      srcNormal = source.getAttribute('normal') as THREE.BufferAttribute;
    }
    geo.setAttribute('normal', srcNormal.clone());
    if (source.index) geo.setIndex(source.index.clone());

    const count = srcPos.count;
    const mode: UVMode = opts.uv ?? (material.userData.uvMode as UVMode | undefined) ?? 'box';
    const uv = new Float32Array(count * 2);
    if (mode === 'box') {
      const scale = 1 / (opts.uvScale ?? (material.userData.uvScale as number | undefined) ?? 1);
      const p = srcPos.array as ArrayLike<number>;
      const n = srcNormal.array as ArrayLike<number>;
      const [sx, sy, sz] = opts.uvShift ?? [0, 0, 0];
      for (let i = 0; i < count; i++) {
        const nx = n[i * 3], ny = n[i * 3 + 1], nz = n[i * 3 + 2];
        const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
        const x = p[i * 3] + sx, y = p[i * 3 + 1] + sy, z = p[i * 3 + 2] + sz;
        let u: number, v: number;
        if (ax >= ay && ax >= az) {
          u = nx > 0 ? -z : z;
          v = y;
        } else if (ay >= az) {
          u = x;
          v = ny > 0 ? -z : z;
        } else {
          u = nz > 0 ? x : -x;
          v = y;
        }
        uv[i * 2] = u * scale;
        uv[i * 2 + 1] = v * scale;
      }
    } else {
      const src = source.getAttribute('uv') as THREE.BufferAttribute | undefined;
      const [ru, rv] = opts.uvRepeat ?? [1, 1];
      if (src) {
        for (let i = 0; i < count; i++) {
          uv[i * 2] = src.getX(i) * ru;
          uv[i * 2 + 1] = src.getY(i) * rv;
        }
      }
    }
    if (opts.uvOffset) {
      for (let i = 0; i < count; i++) {
        uv[i * 2] += opts.uvOffset[0];
        uv[i * 2 + 1] += opts.uvOffset[1];
      }
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    const c = opts.color ?? WHITE;
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));

    geo.applyMatrix4(matrix);
    // Mirrored transforms flip winding; restore it so front faces stay front faces.
    if (matrix.determinant() < 0) flipWinding(geo);

    if (!geo.index) {
      const idx = new (count > 65535 ? Uint32Array : Uint16Array)(count);
      for (let i = 0; i < count; i++) idx[i] = i;
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
    }

    let id = this.materialIds.get(material);
    if (id === undefined) {
      id = this.materialIds.size;
      this.materialIds.set(material, id);
    }
    const key = `${zone}|${id}`;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { zone, material, geos: [], vertices: 0 };
      this.buckets.set(key, bucket);
    }
    bucket.geos.push(geo);
    bucket.vertices += count;
    this.pieceCount++;
  }

  /** Merge everything collected so far. Returns meshes tagged with userData.zone. */
  build(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const bucket of this.buckets.values()) {
      // Very large buckets are split so no single draw exceeds ~1M vertices.
      const chunks: THREE.BufferGeometry[][] = [[]];
      let acc = 0;
      for (const g of bucket.geos) {
        const n = g.getAttribute('position').count;
        if (acc + n > 1_000_000 && chunks[chunks.length - 1].length) {
          chunks.push([]);
          acc = 0;
        }
        chunks[chunks.length - 1].push(g);
        acc += n;
      }
      for (const list of chunks) {
        const merged = mergeGeometries(list, false);
        if (!merged) continue;
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        const mesh = new THREE.Mesh(merged, bucket.material);
        mesh.matrixAutoUpdate = false;
        mesh.userData.zone = bucket.zone;
        const fx = bucket.material.userData.fx === true;
        mesh.castShadow = !fx && bucket.material.userData.castShadow !== false;
        mesh.receiveShadow = !fx;
        mesh.name = `${bucket.zone}:${bucket.material.name || bucket.material.type}`;
        meshes.push(mesh);
      }
      for (const g of bucket.geos) g.dispose();
    }
    this.buckets.clear();
    return meshes;
  }
}

function flipWinding(geo: THREE.BufferGeometry) {
  const index = geo.index;
  if (index) {
    const a = index.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1];
      a[i + 1] = a[i + 2];
      a[i + 2] = t;
    }
    index.needsUpdate = true;
  } else {
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    for (const name of Object.keys(geo.attributes)) {
      const attr = geo.getAttribute(name) as THREE.BufferAttribute;
      const s = attr.itemSize;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < pos.count; i += 3) {
        for (let k = 0; k < s; k++) {
          const t = arr[(i + 1) * s + k];
          arr[(i + 1) * s + k] = arr[(i + 2) * s + k];
          arr[(i + 2) * s + k] = t;
        }
      }
    }
  }
}
