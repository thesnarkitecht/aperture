/**
 * Instanced stylised forests: low-poly conifers (stacked cones) and broadleaf blobs, vertex
 * coloured, scattered in clumps on suitable terrain. Far instances collapse in the vertex
 * shader (distance cutoff scaled by the quality forest density).
 */
import * as THREE from 'three';
import { withGlobals } from '../../render/ShaderLib';
import { mergeColored, FS_PRE, VS_PRE } from './geo';

export interface TreeInstance {
  x: number;
  y: number;
  z: number;
  height: number;
  width: number; // crown width relative to height
  rot: number;
  tint: number; // 0..1
  shadow: number; // baked terrain sun visibility at the base
  ao: number;
}

function conifer(): THREE.BufferGeometry {
  const trunkC = new THREE.Color(0.09, 0.06, 0.04);
  const leaf = new THREE.Color(0.032, 0.07, 0.034);
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.03, 0.045, 0.2, 5, 1, true);
  trunk.translate(0, 0.1, 0);
  parts.push({ geo: trunk, color: trunkC, kind: 0 });
  const tiers: [number, number, number][] = [
    [0.12, 0.58, 0.3],
    [0.36, 0.82, 0.22],
    [0.6, 1.0, 0.14],
  ];
  for (const [y0, y1, r] of tiers) {
    const c = new THREE.ConeGeometry(r, y1 - y0, 7, 1, true);
    c.translate(0, (y0 + y1) / 2, 0);
    // Soften normals: tilt towards the cone's outward direction + up.
    const n = c.attributes.normal as THREE.BufferAttribute;
    const p = c.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < n.count; i++) {
      const x = p.getX(i);
      const z = p.getZ(i);
      const l = Math.hypot(x, z) || 1;
      const v = new THREE.Vector3(x / l, 0.9, z / l).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
    parts.push({
      geo: c,
      color: (pp: THREE.Vector3) => leaf.clone().multiplyScalar(0.7 + 0.6 * ((pp.y - y0) / (y1 - y0))),
      kind: 1,
    });
  }
  return mergeColored(parts);
}

function broadleaf(): THREE.BufferGeometry {
  const trunkC = new THREE.Color(0.1, 0.07, 0.045);
  const leaf = new THREE.Color(0.075, 0.12, 0.035);
  const trunk = new THREE.CylinderGeometry(0.035, 0.06, 0.4, 5, 1, true);
  trunk.translate(0, 0.2, 0);
  const b1 = new THREE.IcosahedronGeometry(0.4, 1);
  b1.scale(1, 0.82, 1);
  b1.translate(0, 0.62, 0);
  const b2 = new THREE.IcosahedronGeometry(0.26, 0);
  b2.translate(0.2, 0.5, 0.12);
  const blobCol = (p: THREE.Vector3) => leaf.clone().multiplyScalar(0.65 + 0.7 * Math.min(1, Math.max(0, (p.y - 0.3) / 0.65)));
  // Smooth "blob" normals from the crown centre for gentle shading.
  for (const g of [b1, b2]) {
    g.computeBoundingSphere();
    const c = g.boundingSphere!.center;
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3(p.getX(i) - c.x, (p.getY(i) - c.y) * 0.8 + 0.08, p.getZ(i) - c.z).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
  }
  return mergeColored([
    { geo: trunk, color: trunkC, kind: 0 },
    { geo: b1, color: blobCol, kind: 1 },
    { geo: b2, color: blobCol, kind: 1 },
  ]);
}

const TREE_VS = /* glsl */ `
${VS_PRE}
attribute vec3 aCol;
attribute float aKind;
attribute vec4 iPos;   // xyz base, w height
attribute vec4 iRot;   // cos, sin, width, tint
attribute vec2 iLight; // terrain shadow, ao
uniform float uTreeFar;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCol;
varying vec3 vLight; // shadow, ao, local height
varying float vLeaf;
void main() {
  float hgt = iPos.w;
  float w = hgt * iRot.z;
  vec3 lp = vec3(position.x * w, position.y * hgt, position.z * w);
  vec3 n = normalize(vec3(normal.x / iRot.z, normal.y, normal.z / iRot.z));
  vec2 cs = iRot.xy;
  lp.xz = vec2(cs.x * lp.x - cs.y * lp.z, cs.y * lp.x + cs.x * lp.z);
  n.xz = vec2(cs.x * n.x - cs.y * n.z, cs.y * n.x + cs.x * n.z);
  float d = distance(cameraPosition, iPos.xyz);
  float vis = 1.0 - smoothstep(uTreeFar * 0.7, uTreeFar, d);
  vec3 wp = iPos.xyz + lp * vis;
  vWorld = wp;
  vNormal = n;
  float tint = iRot.w;
  vec3 c = aCol * (0.8 + 0.45 * tint);
  c = mix(c, c * vec3(1.25, 1.05, 0.7), aKind * smoothstep(0.6, 1.0, tint)); // a few autumnal / olive crowns
  vCol = c;
  vLight = vec3(iLight, position.y);
  vLeaf = aKind;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const TREE_FS = /* glsl */ `
${FS_PRE}
varying vec3 vWorld;
varying vec3 vNormal;
varying vec3 vCol;
varying vec3 vLight;
varying float vLeaf;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  AwSurface s = aw_defaultSurface();
  s.albedo = vCol;
  s.normal = normalize(vNormal);
  s.roughness = 0.85;
  s.specular = 0.25;
  s.wrap = mix(0.2, 0.55, vLeaf);
  s.sssColor = vec3(0.75, 0.85, 0.35);
  s.translucency = 0.35 * vLeaf;
  s.rim = 0.6 * vLeaf;
  s.ao = vLight.y * mix(0.4, 1.0, saturate(vLight.z * 1.2));
  float sunVis = aw_cloudShadow(vWorld) * vLight.x;
  vec3 col = aw_shade(s, vWorld, V, sunVis);
  gl_FragColor = vec4(col, 1.0);
  #include <logdepthbuf_fragment>
}
`;

export class Forest {
  readonly meshes: THREE.Mesh[] = [];
  readonly treeFar: THREE.IUniform;
  totalTriangles = 0;

  constructor(conifers: TreeInstance[], broadleaves: TreeInstance[], treeFar: number) {
    this.treeFar = { value: treeFar };
    const mat = new THREE.ShaderMaterial({
      uniforms: withGlobals({ uTreeFar: this.treeFar }),
      vertexShader: TREE_VS,
      fragmentShader: TREE_FS,
    });
    const pairs: [THREE.BufferGeometry, TreeInstance[], string][] = [
      [conifer(), conifers, 'Conifers'],
      [broadleaf(), broadleaves, 'Broadleaves'],
    ];
    for (const [base, list, name] of pairs) {
      if (list.length === 0) continue;
      const g = new THREE.InstancedBufferGeometry();
      g.index = base.index;
      for (const k of ['position', 'normal', 'aCol', 'aKind']) g.setAttribute(k, base.getAttribute(k));
      const n = list.length;
      const ip = new Float32Array(n * 4);
      const ir = new Float32Array(n * 4);
      const il = new Float32Array(n * 2);
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const t = list[i];
        ip.set([t.x, t.y, t.z, t.height], i * 4);
        ir.set([Math.cos(t.rot), Math.sin(t.rot), t.width, t.tint], i * 4);
        il.set([t.shadow, t.ao], i * 2);
        box.expandByPoint(v.set(t.x, t.y, t.z));
        box.expandByPoint(v.set(t.x, t.y + t.height, t.z));
      }
      g.setAttribute('iPos', new THREE.InstancedBufferAttribute(ip, 4));
      g.setAttribute('iRot', new THREE.InstancedBufferAttribute(ir, 4));
      g.setAttribute('iLight', new THREE.InstancedBufferAttribute(il, 2));
      g.instanceCount = n;
      g.boundingBox = box.clone().expandByScalar(40);
      g.boundingSphere = new THREE.Sphere();
      g.boundingBox.getBoundingSphere(g.boundingSphere);
      const mesh = new THREE.Mesh(g, mat);
      mesh.name = name;
      mesh.matrixAutoUpdate = false;
      this.meshes.push(mesh);
      this.totalTriangles += ((base.index ? base.index.count : 0) / 3) * n;
    }
  }
}
