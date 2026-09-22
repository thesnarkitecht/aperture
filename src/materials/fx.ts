import * as THREE from 'three';
import { shared } from '../engine/shared';

const noiseGLSL = /* glsl */ `
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  float vnoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash33(i).x;
    float n100 = hash33(i + vec3(1, 0, 0)).x;
    float n010 = hash33(i + vec3(0, 1, 0)).x;
    float n110 = hash33(i + vec3(1, 1, 0)).x;
    float n001 = hash33(i + vec3(0, 0, 1)).x;
    float n101 = hash33(i + vec3(1, 0, 1)).x;
    float n011 = hash33(i + vec3(0, 1, 1)).x;
    float n111 = hash33(i + vec3(1, 1, 1)).x;
    return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
               mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
  }
  float fbm3(vec3 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { s += a * vnoise3(p); p = p * 2.03 + 11.7; a *= 0.5; }
    return s;
  }
`;

function additive(params: THREE.ShaderMaterialParameters) {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    ...params,
  });
  m.userData.fx = true;
  m.userData.castShadow = false;
  m.userData.uvMode = 'keep';
  return m;
}

/** Swirling plasma column inside the reactor's containment glass. */
export function createPlasmaMaterial() {
  return additive({
    name: 'plasma',
    side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uColor: { value: new THREE.Color(0.25, 0.62, 1.0) }, uIntensity: { value: 0.75 } },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      void main() {
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        vNormalV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vPos;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      ${noiseGLSL}
      void main() {
        float ang = atan(vPos.z, vPos.x);
        vec3 q = vec3(cos(ang) * 1.5, vPos.y * 1.2 - uTime * 1.6, sin(ang) * 1.5);
        float n = fbm3(q + vec3(0.0, 0.0, uTime * 0.3));
        float bands = 0.5 + 0.5 * sin(vPos.y * 9.0 - uTime * 5.0 + n * 6.0);
        float filaments = pow(1.0 - abs(n - 0.5) * 2.0, 6.0);
        float fres = abs(dot(normalize(-vViewPos), normalize(vNormalV)));
        float core = pow(fres, 1.6);
        vec3 col = uColor * (0.3 + core * 1.1) * (0.45 + 0.7 * bands) + vec3(0.7, 0.9, 1.0) * filaments * 1.4;
        gl_FragColor = vec4(col * uIntensity * (0.55 + 0.45 * core), 1.0);
      }
    `,
  });
}

/** Holographic projection: fresnel rim, scanlines, flicker. Works on any mesh. */
export function createHologramMaterial(color = new THREE.Color(0.3, 0.85, 1.0), intensity = 1.6) {
  return additive({
    name: 'hologram',
    side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uColor: { value: color }, uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec3 vLocal;
      void main() {
        vLocal = position;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vViewPos = mv.xyz;
        vNormalV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vWorld;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec3 vLocal;
      float h(float p) { return fract(sin(p * 91.345) * 47453.21); }
      void main() {
        float fres = 1.0 - abs(dot(normalize(-vViewPos), normalize(vNormalV)));
        float rim = pow(fres, 2.2);
        float scan = 0.75 + 0.25 * sin(vWorld.y * 220.0 - uTime * 8.0);
        float band = smoothstep(0.0, 0.02, abs(fract(vWorld.y * 1.3 - uTime * 0.35) - 0.5) - 0.46);
        float flicker = 0.85 + 0.15 * h(floor(uTime * 24.0));
        // Lat/long grid from local sphere coordinates.
        vec3 n = normalize(vLocal);
        float lat = asin(clamp(n.y, -1.0, 1.0));
        float lon = atan(n.z, n.x);
        float grid = max(1.0 - smoothstep(0.0, 0.035, abs(fract(lat * 3.8197) - 0.5) * 2.0 - 0.94),
                         1.0 - smoothstep(0.0, 0.035, abs(fract(lon * 1.9098) - 0.5) * 2.0 - 0.94));
        float a = (0.015 + rim * 0.55 + grid * 0.5) * scan * flicker + band * 0.12;
        gl_FragColor = vec4(uColor * a * uIntensity, 1.0);
      }
    `,
  });
}

/** Rocket exhaust: a cone with shock diamonds and turbulent falloff. UV.y runs along the plume. */
export function createPlumeMaterial(color = new THREE.Color(0.45, 0.65, 1.0)) {
  return additive({
    name: 'plume',
    side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uColor: { value: color }, uThrottle: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mv.xyz;
        vNormalV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uThrottle;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec3 vPos;
      ${noiseGLSL}
      void main() {
        float along = 1.0 - vUv.y; // 0 at nozzle, 1 at tail
        float facing = abs(dot(normalize(-vViewPos), normalize(vNormalV)));
        float body = pow(facing, 1.5);
        float diamonds = 0.5 + 0.5 * cos(along * 38.0 - uTime * 2.0);
        diamonds = pow(diamonds, 10.0) * smoothstep(0.32, 0.0, along);
        float turb = fbm3(vec3(vPos.x * 2.0, vPos.y * 0.6 - uTime * 9.0, vPos.z * 2.0));
        float fade = pow(1.0 - along, 2.2) * smoothstep(0.0, 0.03, along);
        vec3 hot = vec3(0.9, 0.95, 1.0);
        vec3 col = mix(uColor, hot, diamonds * 0.8 + (1.0 - along) * 0.3);
        float a = fade * pow(body, 1.5) * (0.35 + 0.8 * turb) * 0.6 + diamonds * pow(body, 2.0) * 0.45;
        gl_FragColor = vec4(col * a * 1.5 * uThrottle, 1.0);
      }
    `,
  });
}

/**
 * Soft volumetric light beam (open cone, apex at y=0 pointing -y in local space).
 * Faded by view angle, distance along the cone, and an animated dust texture.
 */
export function createBeamMaterial(color: THREE.Color, intensity = 0.25) {
  return additive({
    name: 'beam',
    side: THREE.DoubleSide,
    uniforms: { uTime: shared.uTime, uColor: { value: color }, uIntensity: { value: intensity } },
    vertexShader: /* glsl */ `
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mv = viewMatrix * w;
        vViewPos = mv.xyz;
        vNormalV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormalV;
      varying vec3 vViewPos;
      varying vec2 vUv;
      varying vec3 vWorld;
      ${noiseGLSL}
      void main() {
        float facing = abs(dot(normalize(-vViewPos), normalize(vNormalV)));
        float edge = pow(facing, 2.5);
        float along = 1.0 - vUv.y;
        float fall = smoothstep(0.0, 0.08, along) * pow(1.0 - along, 1.6);
        float dust = 0.65 + 0.35 * vnoise3(vWorld * 2.5 + vec3(0.0, -uTime * 0.15, uTime * 0.05));
        float nearFade = smoothstep(0.3, 1.8, length(vViewPos));
        gl_FragColor = vec4(uColor * edge * fall * dust * uIntensity * nearFade, 1.0);
      }
    `,
  });
}

/** Camera-facing halo sprite texture (radial falloff + faint star streaks). */
export function createHaloTexture(size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = size / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.08, 'rgba(255,255,255,0.75)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.18)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.globalCompositeOperation = 'lighter';
  const streak = g.createLinearGradient(0, r, size, r);
  streak.addColorStop(0, 'rgba(255,255,255,0)');
  streak.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = streak;
  g.fillRect(0, r - 1, size, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Floating dust motes that catch the light. Positions wrap inside a box that
 * follows the camera, so a small buffer fills the whole ship.
 */
export function createDust(count = 1400, box = 9) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = Math.random() * box;
    pos[i * 3 + 1] = Math.random() * box;
    pos[i * 3 + 2] = Math.random() * box;
    seed[i] = Math.random();
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: shared.uTime,
      uOrigin: { value: new THREE.Vector3() },
      uBox: { value: box },
      uIntensity: { value: 1 },
      uPixelRatio: { value: 1 },
    },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform vec3 uOrigin;
      uniform float uBox;
      uniform float uPixelRatio;
      varying float vAlpha;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.13 + seed * 40.0), uTime * 0.03 * (0.5 + seed), cos(uTime * 0.11 + seed * 23.0)) * 0.4;
        // Wrap into a box centred on the camera.
        vec3 base = uOrigin - uBox * 0.5;
        p = base + mod(p - base, uBox);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vAlpha = smoothstep(0.2, 1.0, d) * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, d)) * (0.4 + 0.6 * seed);
        gl_PointSize = uPixelRatio * clamp(10.0 / d, 1.0, 6.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uIntensity;
      varying float vAlpha;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = smoothstep(0.5, 0.0, length(c));
        gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a * vAlpha * 0.16 * uIntensity, 1.0);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}
