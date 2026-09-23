/**
 * The starting floating island: a grassy plateau with a worn path that leads to a dramatic
 * cliff lip facing the setting sun, above an eroded, stratified rock underside that tapers
 * into hanging spires, roots and vines. Also provides the CPU height query and a baked
 * height/density texture for GPU grass placement.
 */
import * as THREE from 'three';
import { Noise, mulberry32 } from '../core/noise';
import { clamp, smoothstep, lerp, DEG } from '../core/math';
import { withGlobals } from '../render/ShaderLib';
import { ISLAND_Y, SUN_AZIMUTH } from './WorldConfig';

const noise = new Noise(7);

/** Run direction: towards the sun, turned a little so the sun rakes across the hero. */
export const RUN_AZIMUTH = SUN_AZIMUTH - 22 * DEG;
export const RUN_DIR = new THREE.Vector3(Math.sin(RUN_AZIMUTH), 0, -Math.cos(RUN_AZIMUTH));
const SIDE_DIR = new THREE.Vector3(-RUN_DIR.z, 0, RUN_DIR.x);

const TEX_EXTENT = 170; // half-size (m) of the baked height texture
const TEX_RES = 512;

function outlineRadius(theta: number): number {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // Elongated along the run axis; noisy coastline.
  const along = c * Math.cos(RUN_AZIMUTH + Math.PI / 2) + s * Math.sin(RUN_AZIMUTH + Math.PI / 2);
  let r = 112 + 22 * along * along;
  r *= 1 + 0.16 * noise.fbm2(c * 1.3 + 4, s * 1.3 - 2, 4) + 0.05 * noise.noise2(c * 6, s * 6);
  return r;
}

export class Island {
  readonly group = new THREE.Group();
  readonly start = new THREE.Vector3();
  readonly cliff = new THREE.Vector3();
  readonly path: THREE.Vector3[] = [];
  readonly heightTexture: THREE.DataTexture;
  readonly colliders: { x: number; z: number; r: number }[] = [];
  private material: THREE.ShaderMaterial;
  private cliffTheta = 0;

  constructor() {
    // Cliff point on the rim along the run direction.
    this.cliffTheta = Math.atan2(RUN_DIR.z, RUN_DIR.x);
    const rc = outlineRadius(this.cliffTheta);
    this.cliff.set(RUN_DIR.x * (rc - 0.6), 0, RUN_DIR.z * (rc - 0.6));
    this.start.copy(RUN_DIR).multiplyScalar(-58).addScaledVector(SIDE_DIR, 6);
    this.buildPath();
    this.cliff.y = this.heightAt(this.cliff.x, this.cliff.z);
    this.start.y = this.heightAt(this.start.x, this.start.z);

    this.material = this.makeMaterial();
    const geo = this.buildGeometry();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.userData.castShadow = true;
    mesh.frustumCulled = false;
    this.group.add(mesh);
    this.heightTexture = this.bakeTexture();
    this.addRoots();
    this.addRocks();
  }

  private buildPath(): void {
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = this.start.clone().lerp(this.cliff, t);
      p.addScaledVector(SIDE_DIR, Math.sin(t * Math.PI * 1.3) * 7 * (1 - t));
      this.path.push(p);
    }
  }

  /** Distance (horizontal) from the path polyline. */
  pathDistance(x: number, z: number): number {
    let best = 1e9;
    for (let i = 0; i < this.path.length - 1; i++) {
      const a = this.path[i];
      const b = this.path[i + 1];
      const abx = b.x - a.x;
      const abz = b.z - a.z;
      const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz), 0, 1);
      const dx = x - (a.x + abx * t);
      const dz = z - (a.z + abz * t);
      best = Math.min(best, dx * dx + dz * dz);
    }
    return Math.sqrt(best);
  }

  /** Normalised radial coordinate: 0 at centre, 1 at the rim. */
  radial(x: number, z: number): number {
    const th = Math.atan2(z, x);
    return Math.hypot(x, z) / outlineRadius(th);
  }

  /** Raw plateau surface height (local, relative to ISLAND_Y). */
  private surface(x: number, z: number): number {
    const s = this.radial(x, z);
    let h = 3.2 * noise.fbm2(x * 0.012, z * 0.012, 4) + 0.9 * noise.fbm2(x * 0.05 + 3, z * 0.05, 3);
    // A gentle knoll at the back, sloping towards the cliff.
    const along = x * RUN_DIR.x + z * RUN_DIR.z;
    h += 3.5 * Math.exp(-((along + 70) * (along + 70)) / 1800) + along * -0.012;
    // Rounded rim: the edge drops away except at the cliff lip, which stays crisp.
    const th = Math.atan2(z, x);
    let dth = Math.abs(th - this.cliffTheta);
    if (dth > Math.PI) dth = 2 * Math.PI - dth;
    const lip = smoothstep(0.35, 0.05, dth);
    h -= smoothstep(0.9, 1.0, s) * lerp(2.5, 0.4, lip);
    // Path is slightly worn in.
    const pd = this.pathDistance(x, z);
    h -= 0.12 * smoothstep(1.6, 0.0, pd);
    return h;
  }

  /** World-space ground height, or -Infinity when off the island. */
  heightAt(x: number, z: number): number {
    if (this.radial(x, z) > 1.0) return -Infinity;
    return ISLAND_Y + this.surface(x, z);
  }

  private buildGeometry(): THREE.BufferGeometry {
    const SEG = 360;
    const TOP_RINGS = 70;
    const SIDE_RINGS = 90;
    const DEPTH = 290;
    const pos: number[] = [];
    const extra: number[] = []; // x: path, y: region (0 top,1 side), z: ao
    const idx: number[] = [];
    const ringCount = TOP_RINGS + SIDE_RINGS;
    for (let r = 0; r <= ringCount; r++) {
      for (let i = 0; i <= SEG; i++) {
        const th = (i / SEG) * Math.PI * 2;
        const R = outlineRadius(th);
        const cx = Math.cos(th);
        const cz = Math.sin(th);
        let x: number, y: number, z: number;
        let region = 0;
        let ao = 1;
        if (r <= TOP_RINGS) {
          const s = Math.pow(r / TOP_RINGS, 0.7) * 0.999;
          x = cx * R * s;
          z = cz * R * s;
          y = this.surface(x, z);
        } else {
          const v = (r - TOP_RINGS) / SIDE_RINGS; // 0 at rim .. 1 at tip
          region = 1;
          const depth = Math.pow(v, 1.15) * DEPTH;
          let dth = Math.abs(th - this.cliffTheta);
          if (dth > Math.PI) dth = 2 * Math.PI - dth;
          const cliffness = smoothstep(0.6, 0.0, dth);
          // Profile: vertical cliff band then a long concave taper into a spire.
          const band = lerp(0.05, 0.16, cliffness);
          let prof = v < band ? 1.0 - v * 0.15 : Math.pow(1 - (v - band) / (1 - band), 0.62) * (1 - band * 0.15);
          prof = Math.max(prof, 0.0);
          const rimY = this.surface(cx * R * 0.999, cz * R * 0.999);
          y = rimY - 0.4 - depth;
          // Erosion: vertical flutes + strata ledges + blobs.
          const n3 = noise.fbm3(cx * 3.0, y * 0.018, cz * 3.0, 4);
          const flutes = Math.abs(noise.noise2(th * 18, y * 0.01)) * 0.12;
          const strata = Math.sin(y * 0.55 + noise.noise2(th * 3, y * 0.02) * 2.5) * 0.02;
          const rr = R * prof * (1 + 0.22 * n3 - flutes + strata) + (v < band ? 0.8 : 0);
          // Secondary hanging lobes off-centre.
          const lobe = Math.max(0, noise.noise2(th * 1.3 + 5, 0.5)) * smoothstep(0.3, 0.9, v) * 60;
          x = cx * (rr + lobe * 0.2) + Math.sin(v * 3.1) * 6;
          z = cz * (rr + lobe * 0.2) + Math.cos(v * 2.3) * 5;
          ao = 0.55 + 0.45 * (1 - v) + 0.2 * n3;
        }
        pos.push(x, y + ISLAND_Y, z);
        const pd = r <= TOP_RINGS ? this.pathDistance(x, z) : 99;
        extra.push(smoothstep(1.7, 0.4, pd), region, clamp(ao, 0.2, 1));
      }
    }
    const row = SEG + 1;
    for (let r = 0; r < ringCount; r++) {
      for (let i = 0; i < SEG; i++) {
        const a = r * row + i;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aExtra', new THREE.Float32BufferAttribute(extra, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    // Ensure the plateau faces up (winding depends on the polar parametrisation).
    if ((geo.attributes.normal as THREE.BufferAttribute).getY(row * 20 + 5) < 0) {
      for (let k = 0; k < idx.length; k += 3) {
        const t = idx[k + 1];
        idx[k + 1] = idx[k + 2];
        idx[k + 2] = t;
      }
      geo.setIndex(idx);
      geo.computeVertexNormals();
    }
    return geo;
  }

  private makeMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: withGlobals({}),
      vertexShader: /* glsl */ `
        attribute vec3 aExtra;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying vec3 vExtra;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vNormal = normalize(mat3(modelMatrix) * normal);
          vExtra = aExtra;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoise2D;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying vec3 vExtra;
        #include <aw_common>
        #include <aw_atmosphere>
        #include <aw_shadows>
        #include <aw_lighting>
        void main() {
          vec3 N = normalize(vNormal);
          vec3 P = vWorld;
          vec3 V = normalize(cameraPosition - P);
          float n1 = texture(uNoise2D, P.xz * 0.013).r;
          float n2 = texture(uNoise2D, P.xz * 0.11).b;
          float n3 = texture(uNoise2D, vec2(P.x + P.z, P.y) * 0.02).r;
          float top = smoothstep(0.55, 0.85, N.y) * (1.0 - vExtra.y * 0.7);
          // Grass ground beneath the blades, dirt path, rock sides with strata.
          vec3 grass = mix(vec3(0.10, 0.17, 0.035), vec3(0.24, 0.27, 0.07), n1) * (0.8 + 0.4 * n2);
          vec3 dirt = mix(vec3(0.24, 0.17, 0.10), vec3(0.34, 0.26, 0.17), n2);
          vec3 ground = mix(grass, dirt, smoothstep(0.35, 0.8, vExtra.x + (n2 - 0.5) * 0.4));
          float strata = sin(P.y * 0.9 + n3 * 6.0) * 0.5 + 0.5;
          vec3 rock = mix(vec3(0.20, 0.16, 0.13), vec3(0.36, 0.30, 0.24), strata * 0.6 + n3 * 0.4);
          rock = mix(rock, vec3(0.13, 0.11, 0.10), smoothstep(1600.0, 1400.0, P.y) * 0.6);
          // Moss on up-facing ledges of the underside.
          float moss = smoothstep(0.3, 0.7, N.y) * vExtra.y * smoothstep(0.4, 0.7, n2);
          rock = mix(rock, vec3(0.10, 0.15, 0.05), moss);
          AwSurface s = aw_defaultSurface();
          s.albedo = mix(rock, ground, top);
          vec3 bump = vec3(n2 - 0.5, 0.0, n3 - 0.5) * 0.35 * (1.0 - top * 0.8);
          s.normal = normalize(N + bump);
          s.roughness = mix(0.85, 0.95, top);
          s.ao = vExtra.z * mix(1.0, 0.75, top * (1.0 - vExtra.x));
          s.specular = 0.4;
          float ndl = dot(s.normal, uSunDir);
          float sh = aw_sunShadow(P, N, ndl, gl_FragCoord.xy, 8);
          vec3 col = aw_shade(s, P, V, sh);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
  }

  private bakeTexture(): THREE.DataTexture {
    const data = new Float32Array(TEX_RES * TEX_RES * 4);
    for (let j = 0; j < TEX_RES; j++) {
      for (let i = 0; i < TEX_RES; i++) {
        const x = ((i + 0.5) / TEX_RES * 2 - 1) * TEX_EXTENT;
        const z = ((j + 0.5) / TEX_RES * 2 - 1) * TEX_EXTENT;
        const k = (j * TEX_RES + i) * 4;
        const s = this.radial(x, z);
        if (s > 0.995) {
          data[k] = -1000;
          data[k + 1] = 0;
          continue;
        }
        data[k] = this.surface(x, z);
        const pd = this.pathDistance(x, z);
        let dens = smoothstep(0.7, 2.4, pd) * smoothstep(0.995, 0.965, s);
        dens *= 0.75 + 0.25 * noise.noise2(x * 0.08, z * 0.08);
        data[k + 1] = clamp(dens, 0, 1);
        data[k + 2] = pd;
        data[k + 3] = 1;
      }
    }
    // Clear grass around rocks / trees
    const tex = new THREE.DataTexture(data, TEX_RES, TEX_RES, THREE.RGBAFormat, THREE.FloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  /** uv transform for the baked texture: uv = (xz * scale) + offset. */
  static readonly texScale = 1 / (2 * TEX_EXTENT);

  private addRoots(): void {
    const rand = mulberry32(99);
    const geos: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 90; i++) {
      const th = rand() * Math.PI * 2;
      const R = outlineRadius(th) * (0.93 + rand() * 0.05);
      const start = new THREE.Vector3(Math.cos(th) * R, 0, Math.sin(th) * R);
      start.y = ISLAND_Y + this.surface(start.x * 0.99, start.z * 0.99) - 0.6 - rand() * 8;
      const len = 6 + rand() * 30;
      const pts: THREE.Vector3[] = [];
      const out = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
      for (let k = 0; k <= 8; k++) {
        const t = k / 8;
        pts.push(
          start
            .clone()
            .addScaledVector(out, Math.sin(t * 2.5) * 2.0 + t * 1.5)
            .add(new THREE.Vector3((rand() - 0.5) * 1.2, -t * len, (rand() - 0.5) * 1.2)),
        );
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      const g = new THREE.TubeGeometry(curve, 12, 0.12 + rand() * 0.25, 5, false);
      // Taper
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let v = 0; v < p.count; v++) {
        const y = p.getY(v);
        const t = clamp((start.y - y) / len, 0, 1);
        const cp = curve.getPointAt(Math.min(1, t));
        const dx = p.getX(v) - cp.x;
        const dz = p.getZ(v) - cp.z;
        const f = 1 - t * 0.85;
        p.setXYZ(v, cp.x + dx * f, y, cp.z + dz * f);
      }
      geos.push(g);
    }
    const merged = mergeGeometries(geos);
    const mat = new THREE.ShaderMaterial({
      uniforms: withGlobals({}),
      vertexShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vNormal;
        uniform float uTime;
        void main() {
          vec3 p = position;
          float sway = sin(uTime * 0.7 + p.x * 0.3 + p.z * 0.2) * 0.25 * clamp((1650.0 - p.y) / 30.0, 0.0, 1.0);
          p.x += sway; p.z += sway * 0.6;
          vec4 w = modelMatrix * vec4(p, 1.0);
          vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vNormal;
        #include <aw_common>
        #include <aw_atmosphere>
        #include <aw_shadows>
        #include <aw_lighting>
        void main() {
          AwSurface s = aw_defaultSurface();
          s.albedo = vec3(0.16, 0.11, 0.07);
          s.normal = normalize(vNormal);
          s.roughness = 0.8;
          s.ao = 0.7;
          s.rim = 0.4;
          vec3 V = normalize(cameraPosition - vWorld);
          float sh = aw_sunShadow(vWorld, s.normal, dot(s.normal, uSunDir), gl_FragCoord.xy, 4);
          gl_FragColor = vec4(aw_shade(s, vWorld, V, sh), 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(merged, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  private addRocks(): void {
    const rand = mulberry32(1234);
    const base = new THREE.IcosahedronGeometry(1, 3);
    const p = base.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const d = 1 + 0.25 * noise.fbm3(v.x * 1.5, v.y * 1.5, v.z * 1.5, 3) + 0.08 * noise.noise3(v.x * 5, v.y * 5, v.z * 5);
      v.multiplyScalar(d);
      v.y *= 0.62;
      if (v.y < -0.2) v.y = -0.2 + (v.y + 0.2) * 0.3;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    base.computeVertexNormals();
    const count = 46;
    const mat = new THREE.ShaderMaterial({
      uniforms: withGlobals({}),
      vertexShader: /* glsl */ `
        varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal;
        void main() {
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vWorld = w.xyz; vLocal = position;
          vNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uNoise2D;
        varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal;
        #include <aw_common>
        #include <aw_atmosphere>
        #include <aw_shadows>
        #include <aw_lighting>
        void main() {
          vec3 N = normalize(vNormal);
          float n = texture(uNoise2D, vWorld.xz * 0.2 + vWorld.y * 0.1).g;
          float n2 = texture(uNoise2D, vWorld.xy * 0.37).b;
          AwSurface s = aw_defaultSurface();
          vec3 rock = mix(vec3(0.19, 0.17, 0.15), vec3(0.29, 0.26, 0.22), n);
          float moss = smoothstep(0.55, 0.9, N.y) * smoothstep(0.35, 0.65, n2);
          s.albedo = mix(rock, vec3(0.16, 0.22, 0.06), moss);
          s.normal = normalize(N + (vec3(n, n2, 1.0 - n) - 0.5) * 0.3);
          s.roughness = 0.75;
          s.ao = smoothstep(-0.3, 0.4, vLocal.y) * 0.6 + 0.4;
          s.rim = 0.25;
          vec3 V = normalize(cameraPosition - vWorld);
          float sh = aw_sunShadow(vWorld, N, dot(N, uSunDir), gl_FragCoord.xy, 8);
          gl_FragColor = vec4(aw_shade(s, vWorld, V, sh), 1.0);
        }`,
    });
    const inst = new THREE.InstancedMesh(base, mat, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let n = 0;
    let tries = 0;
    while (n < count && tries < 2000) {
      tries++;
      const th = rand() * Math.PI * 2;
      const rr = Math.sqrt(rand()) * 0.97;
      const x = Math.cos(th) * outlineRadius(th) * rr;
      const z = Math.sin(th) * outlineRadius(th) * rr;
      if (this.pathDistance(x, z) < 4.5) continue;
      const nearRim = this.radial(x, z) > 0.8;
      if (!nearRim && rand() > 0.35) continue;
      const s = (nearRim ? 1.2 + rand() * 3.2 : 0.5 + rand() * 1.8) * (rand() < 0.08 ? 2.2 : 1);
      const y = this.heightAt(x, z) - s * 0.15;
      q.setFromEuler(new THREE.Euler(rand() * 0.4, rand() * 6.28, rand() * 0.4));
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s * (0.8 + rand() * 0.5), s, s * (0.8 + rand() * 0.5)));
      inst.setMatrixAt(n++, m);
      if (s > 1.3) this.colliders.push({ x, z, r: s * 0.9 });
    }
    inst.count = n;
    inst.userData.castShadow = true;
    inst.frustumCulled = false;
    this.group.add(inst);
  }
}

/** Minimal geometry merge (position/normal/uv + index) to keep dependencies small. */
export function mergeGeometries(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let offset = 0;
  for (const g of geos) {
    const p = g.attributes.position as THREE.BufferAttribute;
    const n = g.attributes.normal as THREE.BufferAttribute | undefined;
    const u = g.attributes.uv as THREE.BufferAttribute | undefined;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      if (n) nor.push(n.getX(i), n.getY(i), n.getZ(i));
      else nor.push(0, 1, 0);
      if (u) uv.push(u.getX(i), u.getY(i));
      else uv.push(0, 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + offset);
    else for (let i = 0; i < p.count; i++) idx.push(i + offset);
    offset += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  return out;
}
