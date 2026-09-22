/**
 * Procedural, skinned mesh for the hero — an original young sky-wanderer:
 * cobalt travel jacket with ivory trim, dark trousers, leather boots and bracers,
 * a crimson scarf, a brass "wind-spindle" clasp on the back (the glider mechanism)
 * and tousled chestnut hair. Every part is a lathe/tube built along the bind skeleton,
 * with smooth per-vertex skin weights so joints bend cleanly.
 */
import * as THREE from 'three';
import { B, bindPositions } from './Rig';
import { withGlobals } from '../render/ShaderLib';
import { mulberry32 } from '../core/noise';

export const MAT = { cloth: 0, skin: 1, leather: 2, metal: 3, hair: 4, eye: 5, trim: 6 } as const;

export const PALETTE = {
  skin: new THREE.Color(0.78, 0.52, 0.4),
  jacket: new THREE.Color(0.1, 0.2, 0.38),
  jacketDark: new THREE.Color(0.06, 0.12, 0.24),
  trim: new THREE.Color(0.82, 0.74, 0.58),
  trousers: new THREE.Color(0.16, 0.12, 0.1),
  leather: new THREE.Color(0.32, 0.19, 0.1),
  leatherDark: new THREE.Color(0.2, 0.12, 0.07),
  brass: new THREE.Color(0.85, 0.62, 0.3),
  scarf: new THREE.Color(0.66, 0.1, 0.05),
  hair: new THREE.Color(0.13, 0.065, 0.035),
  eye: new THREE.Color(0.03, 0.025, 0.03),
};

interface Sample {
  c: THREE.Vector3;
  rx: number;
  rz: number;
  bones: [number, number];
  w: number; // weight of bones[1]
  color: THREE.Color;
  mat: number;
}

type Weights = [number, number, number, number, number, number, number, number];

class Builder {
  pos: number[] = [];
  col: number[] = [];
  mat: number[] = [];
  flex: number[] = [];
  si: number[] = [];
  sw: number[] = [];
  idx: number[] = [];

  vertex(p: THREE.Vector3, c: THREE.Color, m: number, w: Weights, flex = 0): number {
    this.pos.push(p.x, p.y, p.z);
    this.col.push(c.r, c.g, c.b);
    this.mat.push(m);
    this.flex.push(flex);
    this.si.push(w[0], w[1], w[2], w[3]);
    const s = w[4] + w[5] + w[6] + w[7] || 1;
    this.sw.push(w[4] / s, w[5] / s, w[6] / s, w[7] / s);
    return this.pos.length / 3 - 1;
  }

  /**
   * Vertical (axis 'y') or forward (axis 'z') lathe through samples.
   * `colorFn` can override colour/material per vertex (e.g. trims), `weightFn` weights.
   */
  lathe(
    samples: Sample[],
    seg: number,
    opts: {
      axis?: 'y' | 'z';
      capStart?: boolean;
      capEnd?: boolean;
      colorFn?: (a: number, s: Sample, i: number) => [THREE.Color, number] | null;
      weightFn?: (p: THREE.Vector3, s: Sample, a: number) => Weights | null;
      zShift?: (a: number, s: Sample) => number;
    } = {},
  ): void {
    const axis = opts.axis ?? 'y';
    const start = this.pos.length / 3;
    const p = new THREE.Vector3();
    samples.forEach((s, si) => {
      for (let k = 0; k <= seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        if (axis === 'y') p.set(s.c.x + Math.cos(a) * s.rx, s.c.y, s.c.z + Math.sin(a) * s.rz);
        else p.set(s.c.x + Math.cos(a) * s.rx, s.c.y + Math.sin(a) * s.rz, s.c.z);
        if (opts.zShift) p.z += opts.zShift(a, s);
        let color = s.color;
        let m = s.mat;
        const o = opts.colorFn?.(a, s, si);
        if (o) [color, m] = o;
        const w = opts.weightFn?.(p, s, a) ?? ([s.bones[0], s.bones[1], 0, 0, 1 - s.w, s.w, 0, 0] as Weights);
        this.vertex(p, color, m, w);
      }
    });
    const row = seg + 1;
    for (let r = 0; r < samples.length - 1; r++) {
      for (let k = 0; k < seg; k++) {
        const a = start + r * row + k;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        this.idx.push(a, b, c, b, d, c);
      }
    }
    const cap = (s: Sample, ringStart: number, dir: number) => {
      const c = s.c.clone();
      if (axis === 'y') c.y += dir * Math.min(s.rx, s.rz) * 0.35;
      else c.z += dir * Math.min(s.rx, s.rz) * 0.35;
      const ci = this.vertex(c, s.color, s.mat, [s.bones[0], s.bones[1], 0, 0, 1 - s.w, s.w, 0, 0]);
      for (let k = 0; k < seg; k++) {
        if (dir > 0) this.idx.push(ringStart + k, ringStart + k + 1, ci);
        else this.idx.push(ringStart + k + 1, ringStart + k, ci);
      }
    };
    if (opts.capStart) cap(samples[0], start, axis === 'y' ? -1 : -1);
    if (opts.capEnd) cap(samples[samples.length - 1], start + (samples.length - 1) * row, 1);
  }

  /** Small ellipsoid (eyes, buckles, clasp). */
  blob(c: THREE.Vector3, r: THREE.Vector3, color: THREE.Color, m: number, bone: number, seg = 8): void {
    const samples: Sample[] = [];
    const rings = 6;
    for (let i = 0; i <= rings; i++) {
      const t = i / rings;
      const ang = -Math.PI / 2 + t * Math.PI;
      const s = Math.cos(ang);
      samples.push({
        c: new THREE.Vector3(c.x, c.y + Math.sin(ang) * r.y, c.z),
        rx: Math.max(1e-4, r.x * s),
        rz: Math.max(1e-4, r.z * s),
        bones: [bone, bone],
        w: 0,
        color,
        mat: m,
      });
    }
    this.lathe(samples, seg);
  }

  /** Tapered cone strand for hair clumps; flex 0 at root → 1 at tip. */
  strand(root: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, bend: THREE.Vector3, color: THREE.Color, bone: number): void {
    const up = Math.abs(dir.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const nrm = new THREE.Vector3().crossVectors(side, dir).normalize();
    const steps = 4;
    const base = this.pos.length / 3;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const c = root.clone().addScaledVector(dir, len * t).addScaledVector(bend, len * t * t);
      const w = width * (1 - t * 0.92);
      const cc = color.clone().multiplyScalar(0.75 + 0.5 * t);
      const W: Weights = [bone, 0, 0, 0, 1, 0, 0, 0];
      this.vertex(c.clone().addScaledVector(side, w), cc, MAT.hair, W, t);
      this.vertex(c.clone().addScaledVector(nrm, w * 0.6), cc, MAT.hair, W, t);
      this.vertex(c.clone().addScaledVector(side, -w), cc, MAT.hair, W, t);
    }
    for (let i = 0; i < steps; i++) {
      const a = base + i * 3;
      const n = a + 3;
      this.idx.push(a, n, a + 1, a + 1, n, n + 1, a + 1, n + 1, a + 2, a + 2, n + 1, n + 2);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aMat', new THREE.Float32BufferAttribute(this.mat, 1));
    g.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flex, 1));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function buildCharacterGeometry(): THREE.BufferGeometry {
  const J = bindPositions();
  const b = new Builder();
  const P = PALETTE;
  const S = (c: THREE.Vector3, rx: number, rz: number, b0: number, b1: number, w: number, color: THREE.Color, mat: number): Sample => ({
    c, rx, rz, bones: [b0, b1], w, color, mat,
  });

  // ---------------------------------------------------------------- torso (jacket)
  const front = Math.PI / 2;
  const trimFn = (a: number, s: Sample): [THREE.Color, number] | null => {
    const d = Math.abs(a - front);
    if (s.mat === MAT.cloth && d < 0.1) return [P.trim, MAT.trim];
    return null;
  };
  b.lathe(
    [
      S(v(0, 0.66, 0.0), 0.2, 0.17, B.hips, B.hips, 0, P.jacket, MAT.cloth),
      S(v(0, 0.78, 0.0), 0.185, 0.155, B.hips, B.hips, 0, P.jacket, MAT.cloth),
      S(v(0, 0.9, 0.0), 0.16, 0.12, B.hips, B.hips, 0, P.jacket, MAT.cloth),
      S(v(0, 1.05, 0.0), 0.138, 0.102, B.hips, B.spine, 0.6, P.jacket, MAT.cloth),
      S(v(0, 1.15, 0.0), 0.148, 0.108, B.spine, B.chest, 0.35, P.jacket, MAT.cloth),
      S(v(0, 1.25, 0.005), 0.165, 0.118, B.spine, B.chest, 0.85, P.jacket, MAT.cloth),
      S(v(0, 1.33, 0.0), 0.176, 0.118, B.chest, B.chest, 0, P.jacket, MAT.cloth),
      S(v(0, 1.395, -0.005), 0.15, 0.1, B.chest, B.chest, 0, P.jacket, MAT.cloth),
      S(v(0, 1.43, -0.005), 0.072, 0.066, B.chest, B.neck, 0.3, P.trim, MAT.trim),
    ],
    20,
    {
      colorFn: (a, s, i) => {
        if (i <= 1) {
          // Tunic skirt: split front and back panels with ivory hem.
          if (i === 0) return [P.trim, MAT.trim];
        }
        return trimFn(a, s);
      },
      // Skirt panels follow the thighs on each side.
      weightFn: (p, s) => {
        if (p.y > 0.86) return null;
        const side = p.x > 0 ? B.thighL : B.thighR;
        const lat = Math.min(1, Math.abs(p.x) / 0.18);
        const t = (0.86 - p.y) / 0.2;
        const wt = Math.min(0.85, lat * t * 0.9 + 0.1 * t);
        return [B.hips, side, s.bones[0], 0, 1 - wt, wt, 0, 0];
      },
    },
  );
  // Belt + buckle + satchel strap
  b.lathe(
    [
      S(v(0, 0.935, 0), 0.166, 0.127, B.hips, B.hips, 0, P.leatherDark, MAT.leather),
      S(v(0, 0.975, 0), 0.164, 0.125, B.hips, B.hips, 0, P.leatherDark, MAT.leather),
    ],
    20,
  );
  b.blob(v(0, 0.955, 0.128), v(0.03, 0.026, 0.012), P.brass, MAT.metal, B.hips);
  b.blob(v(-0.17, 0.88, 0.02), v(0.035, 0.06, 0.07), P.leather, MAT.leather, B.hips);
  // Wind-spindle clasp on the back (glider mechanism)
  b.blob(v(0, 1.27, -0.125), v(0.05, 0.07, 0.03), P.brass, MAT.metal, B.chest);
  b.blob(v(0, 1.27, -0.15), v(0.025, 0.025, 0.012), P.trim, MAT.trim, B.chest);

  // ---------------------------------------------------------------- scarf wrap + neck
  b.lathe(
    [
      S(v(0, 1.4, -0.005), 0.1, 0.09, B.chest, B.chest, 0, P.scarf, MAT.cloth),
      S(v(0, 1.44, 0.0), 0.095, 0.09, B.chest, B.neck, 0.5, P.scarf, MAT.cloth),
      S(v(0, 1.49, 0.005), 0.075, 0.075, B.neck, B.neck, 0, P.scarf, MAT.cloth),
      S(v(0, 1.51, 0.005), 0.06, 0.06, B.neck, B.neck, 0, P.scarf, MAT.cloth),
    ],
    16,
  );
  b.lathe(
    [
      S(v(0, 1.47, 0.01), 0.046, 0.05, B.neck, B.neck, 0, P.skin, MAT.skin),
      S(v(0, 1.53, 0.012), 0.044, 0.048, B.neck, B.head, 0.6, P.skin, MAT.skin),
    ],
    12,
  );

  // ---------------------------------------------------------------- head
  const hc = 0.012;
  const headProfile: [number, number, number, number][] = [
    // y, rx, rz, zOffset
    [1.515, 0.02, 0.02, 0.05],
    [1.53, 0.058, 0.06, 0.03],
    [1.56, 0.078, 0.085, 0.018],
    [1.6, 0.09, 0.1, 0.012],
    [1.645, 0.096, 0.107, 0.004],
    [1.69, 0.094, 0.106, -0.004],
    [1.725, 0.08, 0.092, -0.01],
    [1.752, 0.052, 0.062, -0.012],
    [1.766, 0.012, 0.014, -0.012],
  ];
  b.lathe(
    headProfile.map(([y, rx, rz, zo]) => S(v(0, y, hc + zo), rx, rz, B.head, B.head, 0, P.skin, MAT.skin)),
    18,
    {
      capStart: true,
      capEnd: true,
      // Slightly flattened face
      zShift: (a, s) => (Math.sin(a) > 0 ? -Math.pow(Math.sin(a), 6) * 0.012 * (s.c.y < 1.7 ? 1 : 0) : 0),
    },
  );
  // nose + ears + eyes + brows
  b.blob(v(0, 1.615, hc + 0.105), v(0.012, 0.018, 0.014), P.skin, MAT.skin, B.head, 6);
  for (const sx of [1, -1]) {
    b.blob(v(sx * 0.093, 1.625, hc - 0.005), v(0.012, 0.024, 0.018), P.skin, MAT.skin, B.head, 6);
    b.blob(v(sx * 0.036, 1.64, hc + 0.094), v(0.013, 0.017, 0.006), P.eye, MAT.eye, B.head, 6);
    b.blob(v(sx * 0.037, 1.667, hc + 0.096), v(0.019, 0.004, 0.006), P.hair, MAT.hair, B.head, 6);
  }

  // ---------------------------------------------------------------- hair
  const rand = mulberry32(42);
  b.lathe(
    [
      S(v(0, 1.645, hc - 0.012), 0.1, 0.112, B.head, B.head, 0, P.hair, MAT.hair),
      S(v(0, 1.7, hc - 0.01), 0.1, 0.113, B.head, B.head, 0, P.hair, MAT.hair),
      S(v(0, 1.74, hc - 0.012), 0.084, 0.098, B.head, B.head, 0, P.hair, MAT.hair),
      S(v(0, 1.772, hc - 0.012), 0.04, 0.05, B.head, B.head, 0, P.hair, MAT.hair),
    ],
    18,
    {
      capEnd: true,
      // The cap sits higher at the forehead (hairline), lower at the back.
      zShift: () => 0,
      colorFn: () => null,
    },
  );
  for (let i = 0; i < 64; i++) {
    const az = rand() * Math.PI * 2;
    const el = 0.15 + rand() * 1.1;
    const dirOut = v(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const isFront = Math.sin(az) > 0.35;
    if (isFront && el < 0.55) continue; // keep the face clear
    const root = v(0, 1.68, hc - 0.01).addScaledVector(dirOut, 0.09);
    const back = v(0, -0.25, -0.5);
    const dir = dirOut.clone().multiplyScalar(0.6).add(isFront ? v(0, 0.15, 0.6) : back).normalize();
    const len = isFront ? 0.07 + rand() * 0.05 : 0.09 + rand() * 0.09;
    const bend = isFront ? v((rand() - 0.5) * 0.6, -0.9, 0.2) : v((rand() - 0.5) * 0.4, -0.7, -0.3);
    b.strand(root, dir, len, 0.022 + rand() * 0.014, bend, P.hair, B.head);
  }

  // ---------------------------------------------------------------- arms
  for (const side of [1, -1]) {
    const ua = side > 0 ? B.upperArmL : B.upperArmR;
    const fa = side > 0 ? B.forearmL : B.forearmR;
    const hd = side > 0 ? B.handL : B.handR;
    const sh = side > 0 ? B.shoulderL : B.shoulderR;
    const s0 = J[ua];
    const e = J[fa];
    const w = J[hd];
    const lerpV = (a: THREE.Vector3, c: THREE.Vector3, t: number) => a.clone().lerp(c, t);
    b.lathe(
      [
        S(lerpV(s0, e, -0.12).add(v(-side * 0.02, 0.02, 0)), 0.05, 0.05, sh, ua, 0.6, P.jacket, MAT.cloth),
        S(lerpV(s0, e, 0.05), 0.062, 0.058, ua, ua, 0, P.jacket, MAT.cloth),
        S(lerpV(s0, e, 0.5), 0.052, 0.05, ua, ua, 0, P.jacket, MAT.cloth),
        S(lerpV(s0, e, 0.92), 0.046, 0.045, ua, fa, 0.45, P.jacket, MAT.cloth),
        S(lerpV(e, w, 0.12), 0.045, 0.044, ua, fa, 0.9, P.jacket, MAT.cloth),
        S(lerpV(e, w, 0.42), 0.047, 0.045, fa, fa, 0, P.leather, MAT.leather),
        S(lerpV(e, w, 0.88), 0.037, 0.034, fa, hd, 0.15, P.leather, MAT.leather),
        S(lerpV(e, w, 0.97), 0.03, 0.028, fa, hd, 0.5, P.skin, MAT.skin),
      ],
      12,
      { capStart: true },
    );
    // Hand: palm + fingers block + thumb
    const hdir = v(side * 0.03, -1, 0.04).normalize();
    b.lathe(
      [
        S(w.clone().addScaledVector(hdir, 0.0), 0.028, 0.02, hd, hd, 0, P.skin, MAT.skin),
        S(w.clone().addScaledVector(hdir, 0.05), 0.04, 0.021, hd, hd, 0, P.skin, MAT.skin),
        S(w.clone().addScaledVector(hdir, 0.1), 0.039, 0.018, hd, hd, 0, P.skin, MAT.skin),
        S(w.clone().addScaledVector(hdir, 0.15), 0.032, 0.014, hd, hd, 0, P.skin, MAT.skin),
        S(w.clone().addScaledVector(hdir, 0.172), 0.016, 0.008, hd, hd, 0, P.skin, MAT.skin),
      ],
      10,
      { capEnd: true },
    );
    b.strand(w.clone().add(v(-side * 0.008, -0.03, 0.022)), v(-side * 0.25, -0.6, 0.75).normalize(), 0.065, 0.013, v(0, -0.3, 0), P.skin, hd);
  }

  // ---------------------------------------------------------------- legs + boots
  for (const side of [1, -1]) {
    const th = side > 0 ? B.thighL : B.thighR;
    const sn = side > 0 ? B.shinL : B.shinR;
    const ft = side > 0 ? B.footL : B.footR;
    const to = side > 0 ? B.toeL : B.toeR;
    const h = J[th];
    const k = J[sn];
    const a = J[ft];
    const L = (p: THREE.Vector3, q: THREE.Vector3, t: number) => p.clone().lerp(q, t);
    b.lathe(
      [
        S(L(h, k, -0.12).add(v(-side * 0.01, 0, 0)), 0.088, 0.09, B.hips, th, 0.55, P.trousers, MAT.cloth),
        S(L(h, k, 0.2), 0.082, 0.085, th, th, 0, P.trousers, MAT.cloth),
        S(L(h, k, 0.6), 0.068, 0.07, th, th, 0, P.trousers, MAT.cloth),
        S(L(h, k, 0.94), 0.056, 0.058, th, sn, 0.45, P.trousers, MAT.cloth),
        S(L(k, a, 0.08), 0.054, 0.056, th, sn, 0.9, P.trousers, MAT.cloth),
        S(L(k, a, 0.3), 0.062, 0.064, sn, sn, 0, P.leather, MAT.leather),
        S(L(k, a, 0.34), 0.06, 0.062, sn, sn, 0, P.leatherDark, MAT.leather),
        S(L(k, a, 0.6), 0.052, 0.054, sn, sn, 0, P.leather, MAT.leather),
        S(L(k, a, 0.92), 0.045, 0.048, sn, ft, 0.35, P.leather, MAT.leather),
      ],
      12,
    );
    // Foot (forward lathe along +Z)
    const fx = a.x;
    b.lathe(
      [
        S(v(fx, 0.06, -0.06), 0.035, 0.035, ft, ft, 0, P.leatherDark, MAT.leather),
        S(v(fx, 0.065, -0.03), 0.047, 0.055, ft, ft, 0, P.leather, MAT.leather),
        S(v(fx, 0.055, 0.04), 0.047, 0.05, ft, ft, 0, P.leather, MAT.leather),
        S(v(fx, 0.045, 0.1), 0.045, 0.04, ft, to, 0.5, P.leather, MAT.leather),
        S(v(fx, 0.038, 0.155), 0.04, 0.03, to, to, 0, P.leather, MAT.leather),
        S(v(fx, 0.035, 0.18), 0.022, 0.018, to, to, 0, P.leatherDark, MAT.leather),
      ],
      12,
      { axis: 'z', capStart: true, capEnd: true },
    );
  }
  return b.build();
}

// ------------------------------------------------------------------------------------------------
// Material
// ------------------------------------------------------------------------------------------------
export function createCharacterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: withGlobals({ uHairWind: { value: new THREE.Vector3() }, uGlow: { value: 0 } }),
    vertexShader: /* glsl */ `
      #include <common>
      #include <skinning_pars_vertex>
      attribute vec3 aColor;
      attribute float aMat;
      attribute float aFlex;
      uniform vec3 uHairWind;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying float vMat;
      varying vec3 vRest;
      void main() {
        vec3 transformed = position;
        vec3 objectNormal = normal;
        transformed += uHairWind * aFlex * aFlex;
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <skinning_vertex>
        vec4 w = modelMatrix * vec4(transformed, 1.0);
        vWorld = w.xyz;
        vNormal = normalize(mat3(modelMatrix) * objectNormal);
        vColor = aColor;
        vMat = aMat;
        vRest = position;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoise2D;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vColor;
      varying float vMat;
      varying vec3 vRest;
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
        s.albedo = vColor;
        s.normal = N;
        s.rim = 1.0;
        float m = floor(vMat + 0.5);
        // Fabric weave / leather grain from the rest-pose position so it sticks to the body.
        float weave = texture(uNoise2D, vRest.xy * 9.0 + vRest.z * 4.0).a;
        float grain = texture(uNoise2D, vRest.yz * 5.0 + vRest.x * 3.0).g;
        // Cheap cavity AO from rest height (armpits, under the chin, between legs).
        float ao = 1.0;
        if (m < 0.5 || m > 5.5) { // cloth / trim
          s.roughness = 0.9;
          s.wrap = 0.35;
          s.sssColor = vec3(1.0, 0.8, 0.7);
          s.albedo *= 0.88 + 0.24 * weave;
          s.specular = 0.3;
        } else if (m < 1.5) { // skin
          s.roughness = 0.5;
          s.wrap = 0.6;
          s.sssColor = vec3(1.0, 0.45, 0.3);
          s.specular = 0.5;
          s.translucency = 0.25;
        } else if (m < 2.5) { // leather
          s.roughness = 0.55;
          s.albedo *= 0.85 + 0.3 * grain;
          s.specular = 0.8;
        } else if (m < 3.5) { // metal
          s.roughness = 0.3;
          s.metallic = 1.0;
          s.specular = 1.0;
        } else if (m < 4.5) { // hair
          s.roughness = 0.45;
          s.wrap = 0.4;
          s.sssColor = vec3(1.0, 0.6, 0.35);
          s.translucency = 0.4;
          s.specular = 0.6;
        } else { // eyes
          s.roughness = 0.1;
          s.specular = 2.0;
        }
        s.ao = ao;
        float ndl = dot(N, uSunDir);
        float sh = aw_sunShadow(vWorld, N, ndl, gl_FragCoord.xy, 12) * aw_cloudShadow(vWorld);
        vec3 col = aw_shade(s, vWorld, V, sh);
        // Alpha 0 marks the hero (excluded from camera motion blur).
        gl_FragColor = vec4(col, 0.0);
      }`,
  });
}
