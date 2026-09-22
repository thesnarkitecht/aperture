import * as THREE from 'three';
import { shared } from '../engine/shared';
import { createHaloTexture } from './fx';

export const SUN_DIR = new THREE.Vector3(-0.5, 0.6, -0.3).normalize();
export const PLANET_POS = new THREE.Vector3(4600, -5400, -7200);
export const PLANET_RADIUS = 5600;

const noise = /* glsl */ `
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  float vnoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash33(i).x, hash33(i + vec3(1, 0, 0)).x, u.x),
                   mix(hash33(i + vec3(0, 1, 0)).x, hash33(i + vec3(1, 1, 0)).x, u.x), u.y),
               mix(mix(hash33(i + vec3(0, 0, 1)).x, hash33(i + vec3(1, 0, 1)).x, u.x),
                   mix(hash33(i + vec3(0, 1, 1)).x, hash33(i + vec3(1, 1, 1)).x, u.x), u.y), u.z);
  }
  float fbm3(vec3 p, int oct) {
    float s = 0.0, a = 0.5, n = 0.0;
    for (int i = 0; i < 8; i++) {
      if (i >= oct) break;
      s += a * vnoise3(p);
      n += a;
      p = p * 2.02 + 17.3;
      a *= 0.5;
    }
    return s / n;
  }
  // Domain-warped fbm for gaseous structure.
  float warped(vec3 p, int oct) {
    vec3 q = vec3(fbm3(p, 4), fbm3(p + 5.2, 4), fbm3(p + 9.7, 4));
    return fbm3(p + q * 2.4, oct);
  }
`;

function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vDir;
      ${noise}
      vec3 starColor(float t) {
        vec3 hot = vec3(0.62, 0.74, 1.0);
        vec3 mid = vec3(1.0, 0.96, 0.9);
        vec3 cool = vec3(1.0, 0.7, 0.45);
        return t < 0.5 ? mix(hot, mid, t * 2.0) : mix(mid, cool, (t - 0.5) * 2.0);
      }
      vec3 starLayer(vec3 d, float scale, float density, float bright) {
        vec3 p = d * scale;
        vec3 i = floor(p);
        vec3 f = fract(p);
        vec3 h = hash33(i);
        vec3 sp = 0.25 + 0.5 * hash33(i + 19.1);
        float present = step(1.0 - density, h.x);
        float dist = length(f - sp);
        float core = exp(-dist * dist * 90.0);
        float b = present * core * bright * (0.25 + pow(h.y, 6.0) * 3.0);
        return starColor(h.z) * b;
      }
      void main() {
        vec3 d = normalize(vDir);
        // Galactic plane.
        vec3 gN = normalize(vec3(0.28, 0.92, -0.26));
        float gd = dot(d, gN);
        float band = exp(-gd * gd * 16.0);
        float core = exp(-pow(length(d - normalize(vec3(-0.6, -0.15, -0.78))), 2.0) * 2.2);
        float clouds = warped(d * 3.2, 6);
        float lanes = smoothstep(0.42, 0.66, fbm3(d * 9.0 + 3.0, 5));
        vec3 galaxy = vec3(0.55, 0.5, 0.62) * band * (0.35 + clouds * 1.2) * (1.0 - lanes * 0.8 * band);
        galaxy += vec3(1.0, 0.72, 0.46) * core * band * clouds * 1.4 * (1.0 - lanes * 0.9);
        // Emission nebula.
        vec3 nDir = normalize(vec3(0.55, 0.25, 0.8));
        float nd = max(0.0, dot(d, nDir));
        float neb = pow(nd, 10.0) * smoothstep(0.35, 0.8, warped(d * 5.0 + 1.3, 6));
        vec3 nebula = mix(vec3(0.9, 0.18, 0.45), vec3(0.15, 0.55, 0.85), fbm3(d * 7.0, 3)) * neb * 1.2;
        // Faint far-field dust everywhere.
        float haze = fbm3(d * 2.0 + 7.0, 4);
        vec3 col = vec3(0.004, 0.006, 0.01) + vec3(0.012, 0.014, 0.022) * haze;
        col += galaxy * 0.09 + nebula * 0.12;
        // Stars: denser inside the band.
        col += starLayer(d, 340.0, 0.1 + band * 0.25, 0.55);
        col += starLayer(d, 170.0, 0.05 + band * 0.08, 0.9);
        col += starLayer(d, 70.0, 0.035, 1.6);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
}

/** Bake the procedural sky into an HDR cube map once; sampling it costs one texture fetch per pixel. */
export function bakeSky(renderer: THREE.WebGLRenderer, size = 1024) {
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), createSkyMaterial());
  scene.add(sky);
  const target = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
  });
  const cam = new THREE.CubeCamera(1, 1000, target);
  cam.update(renderer, scene);
  sky.geometry.dispose();
  (sky.material as THREE.Material).dispose();
  return target;
}

export function createPlanet() {
  const group = new THREE.Group();
  group.name = 'planet';
  const sunDirUniform = { value: SUN_DIR.clone() };
  const surface = new THREE.ShaderMaterial({
    uniforms: { uTime: shared.uTime, uSunDir: sunDirUniform },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vWorldN;
      varying vec3 vView;
      void main() {
        vN = normalize(position);
        vWorldN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vView = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      varying vec3 vN;
      varying vec3 vWorldN;
      varying vec3 vView;
      ${noise}
      void main() {
        vec3 n = normalize(vN);
        vec3 wn = normalize(vWorldN);
        float lat = abs(n.y);
        float h = fbm3(n * 2.2 + 4.0, 7);
        float land = smoothstep(0.52, 0.535, h);
        float mountains = smoothstep(0.6, 0.72, h);
        float moist = fbm3(n * 4.0 + 11.0, 4);
        vec3 ocean = mix(vec3(0.004, 0.02, 0.05), vec3(0.01, 0.06, 0.1), smoothstep(0.45, 0.52, h));
        vec3 desert = vec3(0.42, 0.3, 0.18);
        vec3 scrub = vec3(0.16, 0.2, 0.1);
        vec3 rock = vec3(0.28, 0.25, 0.23);
        vec3 ground = mix(desert, scrub, smoothstep(0.4, 0.6, moist));
        ground = mix(ground, rock, mountains);
        float ice = smoothstep(0.78, 0.86, lat + (h - 0.5) * 0.3);
        vec3 albedo = mix(ocean, ground, land);
        albedo = mix(albedo, vec3(0.85, 0.9, 0.95), ice);

        // Clouds drift slowly; they shade the surface slightly.
        vec3 cn = n + vec3(uTime * 0.0015, 0.0, 0.0);
        float cloud = smoothstep(0.5, 0.72, warped(cn * 3.5 + 2.0, 6));
        cloud = max(cloud, smoothstep(0.62, 0.8, fbm3(cn * 9.0, 5)) * 0.6);

        float ndl = dot(wn, uSunDir);
        float day = smoothstep(-0.08, 0.25, ndl);
        vec3 lit = albedo * max(ndl, 0.0) * 3.2;
        // Ocean glint.
        vec3 hv = normalize(uSunDir + vView);
        float spec = pow(max(dot(wn, hv), 0.0), 60.0) * (1.0 - land) * (1.0 - cloud) * 3.0;
        lit += vec3(1.0, 0.9, 0.75) * spec * day;
        lit = mix(lit * (1.0 - cloud * 0.4), vec3(0.95) * max(ndl, 0.0) * 3.6, cloud);
        // City lights on the night side.
        vec3 cc = floor(n * 260.0);
        float city = step(0.86, hash33(cc).x) * land * (1.0 - ice) * smoothstep(0.35, 0.6, moist);
        city *= smoothstep(0.45, 0.7, fbm3(n * 16.0, 3));
        lit += vec3(1.0, 0.62, 0.3) * city * (1.0 - day) * (1.0 - cloud * 0.7) * 1.5;
        // Terminator warmth.
        float term = exp(-ndl * ndl * 60.0);
        lit += vec3(0.5, 0.2, 0.08) * term * 0.12;
        gl_FragColor = vec4(lit * 0.36, 1.0);
      }
    `,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS, 128, 64), surface);
  planet.rotation.set(0.3, 1.1, 0.12);
  group.add(planet);

  const atmosphere = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uSunDir: sunDirUniform },
    vertexShader: /* glsl */ `
      varying vec3 vWorldN;
      varying vec3 vView;
      void main() {
        vWorldN = normalize(mat3(modelMatrix) * normal);
        vec4 w = modelMatrix * vec4(position, 1.0);
        vView = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      varying vec3 vWorldN;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vWorldN);
        float rim = 1.0 - max(dot(n, vView), 0.0);
        float ndl = dot(n, uSunDir);
        float day = smoothstep(-0.25, 0.4, ndl);
        vec3 blue = vec3(0.25, 0.55, 1.0);
        vec3 sunset = vec3(1.0, 0.45, 0.2);
        vec3 col = mix(sunset, blue, smoothstep(-0.05, 0.35, ndl));
        float a = pow(rim, 3.5) * day * 2.4 + pow(rim, 1.5) * day * 0.08;
        gl_FragColor = vec4(col * a, 1.0);
      }
    `,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(PLANET_RADIUS * 1.022, 128, 64), atmosphere);
  group.add(atmo);
  group.position.copy(PLANET_POS);

  // The sun: an HDR sprite far away so bloom produces the glare.
  const halo = createHaloTexture(256);
  const sunMat = new THREE.SpriteMaterial({
    map: halo,
    color: new THREE.Color(1, 0.93, 0.82).multiplyScalar(40),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
    fog: false,
  });
  const sun = new THREE.Sprite(sunMat);
  sun.position.copy(SUN_DIR).multiplyScalar(18000);
  sun.scale.setScalar(900);
  const glare = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: halo,
      color: new THREE.Color(1, 0.8, 0.6).multiplyScalar(1.6),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      fog: false,
    }),
  );
  glare.position.copy(sun.position);
  glare.scale.setScalar(6000);

  const sunGroup = new THREE.Group();
  sunGroup.add(sun, glare);

  for (const m of [planet, atmo]) m.frustumCulled = true;
  return { planet: group, sun: sunGroup };
}

/** A few thousand bright point stars rendered live so they stay crisp at any resolution. */
export function createStarPoints(count = 2600) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    // Uniform on the sphere, biased toward the galactic band.
    let v = new THREE.Vector3();
    for (let tries = 0; tries < 4; tries++) {
      v.set(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
      if (v.lengthSq() > 1 || v.lengthSq() < 0.01) continue;
      v.normalize();
      const band = Math.abs(v.dot(new THREE.Vector3(0.28, 0.92, -0.26).normalize()));
      if (Math.random() > band * 1.4) break;
    }
    v = v.normalize().multiplyScalar(15000);
    pos.set([v.x, v.y, v.z], i * 3);
    const t = Math.random();
    c.setRGB(0.75 + 0.25 * t, 0.8 + 0.1 * Math.sin(t * 3), 1.0 - 0.45 * t * t);
    const b = Math.pow(Math.random(), 5) * 5 + 0.25;
    col.set([c.r * b, c.g * b, c.b * b], i * 3);
    size[i] = 1 + Math.pow(Math.random(), 8) * 2.2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uPixelRatio: { value: 1 }, uTime: shared.uTime },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float size;
      uniform float uPixelRatio;
      uniform float uTime;
      varying vec3 vColor;
      void main() {
        float tw = 0.85 + 0.15 * sin(uTime * (1.5 + size) + position.x * 0.01);
        vColor = color * tw;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uPixelRatio * 1.6;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = exp(-dot(c, c) * 18.0);
        gl_FragColor = vec4(vColor * a, 1.0);
      }
    `,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}
