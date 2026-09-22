/**
 * Procedural, tileable noise textures generated on the GPU at startup.
 *
 *  - shape  (128³ RGBA8): R = Perlin-Worley, GBA = Worley FBM at increasing frequency
 *  - detail (32³ RGBA8):  RGB = Worley FBM octaves used to erode cloud edges into wisps
 *  - weather (512² RGBA8): large-scale coverage / clumping / variation for the cloud sea
 *  - noise2D (512² RGBA8): general-purpose tileable noise for terrain, rock and water shaders
 */
import * as THREE from 'three';
import { FullscreenQuad } from './FullscreenQuad';

const NOISE_LIB = /* glsl */ `
vec3 nhash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
vec2 nhash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float perlin3(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n[8];
  for (int k = 0; k < 8; k++) {
    vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 g = normalize(nhash33(mod(i + o, period)) * 2.0 - 1.0);
    n[k] = dot(g, f - o);
  }
  return mix(mix(mix(n[0], n[1], u.x), mix(n[2], n[3], u.x), u.y),
             mix(mix(n[4], n[5], u.x), mix(n[6], n[7], u.x), u.y), u.z);
}
float perlinFbm3(vec3 p, float period, int oct) {
  float s = 0.0, a = 1.0, norm = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * perlin3(p, period);
    norm += a;
    a *= 0.5;
    p *= 2.0;
    period *= 2.0;
  }
  return s / norm;
}
float worley3(vec3 p, float period) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d = 1e9;
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 h = nhash33(mod(i + o, period));
    vec3 r = o + h - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - sqrt(d);
}
float worleyFbm3(vec3 p, float period) {
  return worley3(p, period) * 0.625 + worley3(p * 2.0, period * 2.0) * 0.25 + worley3(p * 4.0, period * 4.0) * 0.125;
}
float perlin2(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  vec2 g00 = normalize(nhash22(mod(i, period)) * 2.0 - 1.0);
  vec2 g10 = normalize(nhash22(mod(i + vec2(1, 0), period)) * 2.0 - 1.0);
  vec2 g01 = normalize(nhash22(mod(i + vec2(0, 1), period)) * 2.0 - 1.0);
  vec2 g11 = normalize(nhash22(mod(i + vec2(1, 1), period)) * 2.0 - 1.0);
  float a = dot(g00, f), b = dot(g10, f - vec2(1, 0)), c = dot(g01, f - vec2(0, 1)), d = dot(g11, f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float perlinFbm2(vec2 p, float period, int oct) {
  float s = 0.0, a = 1.0, norm = 0.0;
  for (int i = 0; i < 10; i++) {
    if (i >= oct) break;
    s += a * perlin2(p, period);
    norm += a;
    a *= 0.5;
    p *= 2.0;
    period *= 2.0;
  }
  return s / norm;
}
float worley2(vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d = 1e9;
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + nhash22(mod(i + o, period)) - f;
    d = min(d, dot(r, r));
  }
  return 1.0 - sqrt(d);
}
float remap01(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }
`;

const SHAPE_FRAG = /* glsl */ `
uniform float uZ;
varying vec2 vUv;
${NOISE_LIB}
void main() {
  vec3 p = vec3(vUv, uZ);
  // Low-frequency billowy Perlin, "inverted Worley" dilated — the Perlin-Worley of Schneider (2015).
  float perlin = perlinFbm3(p * 4.0, 4.0, 6) * 0.5 + 0.5;
  float w0 = worleyFbm3(p * 4.0, 4.0);
  float pw = remap01(perlin, -(1.0 - w0) * 0.9, 1.0);
  pw = clamp(pw * 1.05 - 0.02, 0.0, 1.0);
  float w1 = worleyFbm3(p * 6.0, 6.0);
  float w2 = worleyFbm3(p * 12.0, 12.0);
  float w3 = worleyFbm3(p * 20.0, 20.0);
  gl_FragColor = vec4(pw, w1, w2, w3);
}`;

const DETAIL_FRAG = /* glsl */ `
uniform float uZ;
varying vec2 vUv;
${NOISE_LIB}
void main() {
  vec3 p = vec3(vUv, uZ);
  float a = worleyFbm3(p * 2.0, 2.0);
  float b = worleyFbm3(p * 4.0, 4.0);
  float c = worleyFbm3(p * 8.0, 8.0);
  float cur = perlinFbm3(p * 3.0, 3.0, 3) * 0.5 + 0.5;
  gl_FragColor = vec4(a, b, c, cur);
}`;

const WEATHER_FRAG = /* glsl */ `
varying vec2 vUv;
${NOISE_LIB}
void main() {
  vec2 p = vUv;
  float cov = perlinFbm2(p * 5.0, 5.0, 7) * 0.5 + 0.5;
  float clumps = worley2(p * 9.0, 9.0) * 0.6 + worley2(p * 23.0, 23.0) * 0.4;
  float var = perlinFbm2(p * 3.0 + 11.0, 3.0, 5) * 0.5 + 0.5;
  float fine = perlinFbm2(p * 32.0, 32.0, 4) * 0.5 + 0.5;
  gl_FragColor = vec4(cov, clumps, var, fine);
}`;

const NOISE2D_FRAG = /* glsl */ `
varying vec2 vUv;
${NOISE_LIB}
void main() {
  vec2 p = vUv;
  float a = perlinFbm2(p * 8.0, 8.0, 8) * 0.5 + 0.5;
  float b = worley2(p * 16.0, 16.0);
  float c = perlinFbm2(p * 32.0 + 3.1, 32.0, 5) * 0.5 + 0.5;
  float d = worley2(p * 48.0, 48.0) * 0.5 + worley2(p * 96.0, 96.0) * 0.5;
  gl_FragColor = vec4(a, b, c, d);
}`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export interface NoiseSet {
  shape: THREE.Data3DTexture;
  detail: THREE.Data3DTexture;
  weather: THREE.Texture;
  noise2D: THREE.Texture;
  dispose(): void;
}

function make3D(renderer: THREE.WebGLRenderer, size: number, frag: string): THREE.WebGL3DRenderTarget {
  const rt = new THREE.WebGL3DRenderTarget(size, size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
  });
  const tex = rt.texture;
  tex.wrapS = tex.wrapT = tex.wrapR = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms: { uZ: { value: 0 } } });
  const quad = new FullscreenQuad(mat);
  const prev = renderer.getRenderTarget();
  renderer.initRenderTarget(rt); // allocates the full mip chain while generateMipmaps is true
  for (let z = 0; z < size; z++) {
    // Only regenerate mip levels once, after the final slice.
    tex.generateMipmaps = z === size - 1;
    mat.uniforms.uZ.value = (z + 0.5) / size;
    renderer.setRenderTarget(rt, z);
    quad.render(renderer);
  }
  tex.generateMipmaps = true;
  renderer.setRenderTarget(prev);
  quad.dispose();
  mat.dispose();
  return rt;
}

function make2D(renderer: THREE.WebGLRenderer, size: number, frag: string): THREE.WebGLRenderTarget {
  const rt = new THREE.WebGLRenderTarget(size, size, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
  });
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag });
  const quad = new FullscreenQuad(mat);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  quad.render(renderer);
  renderer.setRenderTarget(prev);
  quad.dispose();
  mat.dispose();
  return rt;
}

export function generateNoiseTextures(renderer: THREE.WebGLRenderer, shapeSize = 128): NoiseSet {
  const shape = make3D(renderer, shapeSize, SHAPE_FRAG);
  const detail = make3D(renderer, 32, DETAIL_FRAG);
  const weather = make2D(renderer, 512, WEATHER_FRAG);
  const noise2D = make2D(renderer, 512, NOISE2D_FRAG);
  return {
    shape: shape.texture as unknown as THREE.Data3DTexture,
    detail: detail.texture as unknown as THREE.Data3DTexture,
    weather: weather.texture,
    noise2D: noise2D.texture,
    dispose() {
      shape.dispose();
      detail.dispose();
      weather.dispose();
      noise2D.dispose();
    },
  };
}
