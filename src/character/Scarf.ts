/**
 * Two long scarf tails simulated as Verlet chains (gravity, wind, airflow drag, length
 * constraints) and drawn as camera-independent ribbons. Pinned at the knot behind the neck.
 */
import * as THREE from 'three';
import { withGlobals } from '../render/ShaderLib';
import { PALETTE } from './CharacterMesh';

const N = 12;
const SEG = 0.1;

class Chain {
  p: THREE.Vector3[] = [];
  prev: THREE.Vector3[] = [];
  constructor(start: THREE.Vector3) {
    for (let i = 0; i < N; i++) {
      this.p.push(start.clone().add(new THREE.Vector3(0, -i * SEG, 0)));
      this.prev.push(this.p[i].clone());
    }
  }
}

export class Scarf {
  readonly mesh: THREE.Mesh;
  private chains: Chain[] = [];
  private geo: THREE.BufferGeometry;
  private initialized = false;

  constructor() {
    this.chains = [new Chain(new THREE.Vector3()), new Chain(new THREE.Vector3())];
    const verts = 2 * N * 2;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3));
    this.geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(verts * 3), 3));
    this.geo.setAttribute('aT', new THREE.Float32BufferAttribute(new Float32Array(verts), 1));
    const idx: number[] = [];
    for (let c = 0; c < 2; c++) {
      const o = c * N * 2;
      for (let i = 0; i < N - 1; i++) {
        const a = o + i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    this.geo.setIndex(idx);
    const t = this.geo.attributes.aT as THREE.BufferAttribute;
    for (let c = 0; c < 2; c++) for (let i = 0; i < N; i++) for (let k = 0; k < 2; k++) t.setX(c * N * 2 + i * 2 + k, i / (N - 1));
    const col = PALETTE.scarf;
    const mat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: withGlobals({ uColor: { value: new THREE.Vector3(col.r, col.g, col.b) } }),
      vertexShader: /* glsl */ `
        attribute float aT;
        varying vec3 vWorld; varying vec3 vNormal; varying float vT;
        void main() { vWorld = position; vNormal = normal; vT = aT; gl_Position = projectionMatrix * viewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying vec3 vWorld; varying vec3 vNormal; varying float vT;
        #include <aw_common>
        #include <aw_atmosphere>
        #include <aw_shadows>
        #include <aw_lighting>
        #include <aw_clouds>
        void main() {
          vec3 N = normalize(vNormal);
          if (!gl_FrontFacing) N = -N;
          AwSurface s = aw_defaultSurface();
          s.albedo = uColor * (vT > 0.93 ? 0.55 : 1.0);
          s.normal = N; s.roughness = 0.85; s.wrap = 0.5; s.translucency = 0.8;
          s.sssColor = vec3(1.0, 0.5, 0.3); s.rim = 0.8; s.specular = 0.3;
          vec3 V = normalize(cameraPosition - vWorld);
          float sh = aw_sunShadow(vWorld, N, dot(N, uSunDir), gl_FragCoord.xy, 8) * aw_cloudShadow(vWorld);
          gl_FragColor = vec4(aw_shade(s, vWorld, V, sh), 0.0);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.userData.castShadow = true;
  }

  /** anchor: knot position (world); side: hero's left axis; vel: hero velocity. */
  update(dt: number, anchor: THREE.Vector3, side: THREE.Vector3, back: THREE.Vector3, vel: THREE.Vector3, wind: THREE.Vector3, time: number): void {
    if (!this.initialized) {
      this.chains.forEach((c, ci) => c.p.forEach((p, i) => {
        p.copy(anchor).addScaledVector(back, 0.02 * i).add(new THREE.Vector3(0, -i * SEG, 0)).addScaledVector(side, ci ? 0.04 : -0.04);
        c.prev[i].copy(p);
      }));
      this.initialized = true;
    }
    const h = Math.min(dt, 1 / 30);
    const sub = 3;
    const sdt = h / sub;
    const air = wind.clone().sub(vel);
    for (let s = 0; s < sub; s++) {
      this.chains.forEach((c, ci) => {
        const knot = anchor.clone().addScaledVector(side, ci ? 0.035 : -0.035);
        for (let i = 1; i < N; i++) {
          const p = c.p[i];
          const v = p.clone().sub(c.prev[i]).multiplyScalar(0.985);
          c.prev[i].copy(p);
          // Drag towards the relative airflow, with flutter.
          const flutter = Math.sin(time * 14 + i * 0.9 + ci * 2.1) * 0.35 * (i / N);
          const rel = air.clone().multiplyScalar(0.9).addScaledVector(side, flutter * Math.min(air.length(), 20) * 0.3);
          const acc = new THREE.Vector3(0, -9.8, 0).add(rel.sub(v.clone().divideScalar(sdt)).multiplyScalar(0.9));
          p.add(v).addScaledVector(acc, sdt * sdt);
        }
        c.p[0].copy(knot);
        for (let it = 0; it < 4; it++) {
          for (let i = 1; i < N; i++) {
            const a = c.p[i - 1];
            const b = c.p[i];
            const d = b.clone().sub(a);
            const len = d.length() || 1e-6;
            const corr = d.multiplyScalar((len - SEG) / len);
            if (i === 1) b.sub(corr);
            else {
              a.addScaledVector(corr, 0.5);
              b.addScaledVector(corr, -0.5);
            }
          }
          c.p[0].copy(knot);
        }
      });
    }
    // Ribbon vertices
    const pos = this.geo.attributes.position as THREE.BufferAttribute;
    const nor = this.geo.attributes.normal as THREE.BufferAttribute;
    this.chains.forEach((c, ci) => {
      for (let i = 0; i < N; i++) {
        const t = c.p[Math.min(N - 1, i + 1)].clone().sub(c.p[Math.max(0, i - 1)]).normalize();
        const w = side.clone().sub(t.clone().multiplyScalar(side.dot(t))).normalize();
        const n = new THREE.Vector3().crossVectors(t, w).normalize();
        const hw = 0.055 * (1 - (i / N) * 0.25);
        const base = ci * N * 2 + i * 2;
        const p = c.p[i];
        pos.setXYZ(base, p.x + w.x * hw, p.y + w.y * hw, p.z + w.z * hw);
        pos.setXYZ(base + 1, p.x - w.x * hw, p.y - w.y * hw, p.z - w.z * hw);
        nor.setXYZ(base, n.x, n.y, n.z);
        nor.setXYZ(base + 1, n.x, n.y, n.z);
      }
    });
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  }

  reset(): void {
    this.initialized = false;
  }
}
