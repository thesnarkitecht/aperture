/**
 * Tiny geometry helpers for the distant world: vertex-coloured merges without extra deps.
 */
import * as THREE from 'three';

export interface ColoredPart {
  geo: THREE.BufferGeometry;
  /** Either a constant colour or a per-vertex function of the (already transformed) position. */
  color: THREE.Color | ((p: THREE.Vector3, n: THREE.Vector3) => THREE.Color);
  /** Optional scalar per-vertex attribute (e.g. material kind). */
  kind?: number;
}

/** Merge parts into one indexed geometry with position / normal / aCol (vec3) / aKind (float). */
export function mergeColored(parts: ColoredPart[]): THREE.BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const p of parts) {
    nv += p.geo.attributes.position.count;
    ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const kind = new Float32Array(nv);
  const idx = new Uint32Array(ni);
  let vo = 0;
  let io = 0;
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (const p of parts) {
    const g = p.geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const pa = g.attributes.position as THREE.BufferAttribute;
    const na = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < pa.count; i++) {
      v.fromBufferAttribute(pa, i);
      n.fromBufferAttribute(na, i);
      const k = vo + i;
      pos[k * 3] = v.x;
      pos[k * 3 + 1] = v.y;
      pos[k * 3 + 2] = v.z;
      nor[k * 3] = n.x;
      nor[k * 3 + 1] = n.y;
      nor[k * 3 + 2] = n.z;
      const c = typeof p.color === 'function' ? p.color(v, n) : p.color;
      col[k * 3] = c.r;
      col[k * 3 + 1] = c.g;
      col[k * 3 + 2] = c.b;
      kind[k] = p.kind ?? 0;
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < pa.count; i++) idx[io++] = i + vo;
    vo += pa.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/** Shared vertex-shader preamble (three's `common` is needed by the log-depth chunk). */
export const VS_PRE = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
`;
export const FS_PRE = /* glsl */ `
#include <aw_common>
#include <aw_atmosphere>
#include <aw_lighting>
#include <aw_clouds>
#include <logdepthbuf_pars_fragment>
`;
