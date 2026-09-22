import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/**
 * Procedural PBR texture sets baked on the GPU at load time.
 * One fragment shader writes three render targets at once (MRT):
 *   0: albedo (linear) + alpha
 *   1: tangent-space normal (from finite differences of a height field)
 *   2: ORM - R: ambient occlusion, G: roughness, B: metalness
 * Every pattern is exactly periodic on [0,1]^2 so it tiles seamlessly.
 */
export const KINDS = {
  panel: 0,
  hull: 1,
  grate: 2,
  tread: 3,
  hazard: 4,
  fabric: 5,
  corrugated: 6,
  painted: 7,
  rubber: 8,
  brushed: 9,
  deck: 10,
} as const;
export type TextureKind = keyof typeof KINDS;

export interface TextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  orm: THREE.Texture;
}

const vertex = /* glsl */ `
  in vec3 position;
  in vec2 uv;
  out vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  precision highp float;
  precision highp int;
  in vec2 vUv;
  layout(location = 0) out vec4 oAlbedo;
  layout(location = 1) out vec4 oNormal;
  layout(location = 2) out vec4 oORM;
  uniform float uSeed;
  uniform float uTexel;
  uniform float uNormalStrength;

  float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  vec2 hash22(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.xx + p3.yz) * p3.zy);
  }

  // Periodic value noise: p in lattice units, period in lattice cells.
  float vnoise(vec2 p, vec2 period) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    vec2 s = vec2(uSeed * 17.0, uSeed * 31.0);
    float a = hash12(mod(i, period) + s);
    float b = hash12(mod(i + vec2(1.0, 0.0), period) + s);
    float c = hash12(mod(i + vec2(0.0, 1.0), period) + s);
    float d = hash12(mod(i + vec2(1.0, 1.0), period) + s);
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  // Tileable fBm over uv in [0,1].
  float fbm(vec2 uv, vec2 freq, int oct) {
    float s = 0.0, a = 0.5, n = 0.0;
    vec2 per = freq;
    for (int i = 0; i < 8; i++) {
      if (i >= oct) break;
      s += a * vnoise(uv * per, per);
      n += a;
      per *= 2.0;
      a *= 0.5;
    }
    return s / n;
  }
  // Thin, randomly oriented scratch lines.
  float scratches(vec2 uv, float density) {
    float acc = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 freq = vec2(4.0 + fi * 3.0, 90.0 + fi * 40.0);
      float n = vnoise(uv * freq + fi * 7.3, freq);
      float line = 1.0 - smoothstep(0.0, 0.035, abs(n - 0.5));
      float mask = smoothstep(1.0 - density, 1.0, fbm(uv + fi * 0.37, vec2(3.0), 3));
      acc = max(acc, line * mask);
    }
    return acc;
  }

  // Small paint chips that cluster in worn areas.
  float chips(vec2 uv, float freq, float thr) {
    float field = fbm(uv, vec2(freq), 4);
    float cluster = fbm(uv + 0.31, vec2(3.0), 3);
    return smoothstep(thr, thr + 0.025, field + (cluster - 0.5) * 0.45);
  }
  // Natural grime: soft large-scale variation, finer mottling and vertical drips.
  float grimeAt(vec2 uv) {
    float large = fbm(uv, vec2(4.0), 5);
    float mid = fbm(uv + 0.5, vec2(18.0), 4);
    float drip = fbm(vec2(uv.x, uv.y * 0.25) + 0.2, vec2(48.0, 3.0), 4);
    return clamp(large * 0.5 + mid * 0.3 + drip * 0.35 - 0.12, 0.0, 1.0);
  }

  // Random k-d subdivision of the unit square into panels. Periodic by construction.
  struct Cell { vec2 mn; vec2 mx; float id; };
  Cell kd(vec2 uv, float seed, int depth, float stopP, float minSize) {
    Cell c;
    c.mn = vec2(0.0);
    c.mx = vec2(1.0);
    c.id = seed;
    for (int i = 0; i < 6; i++) {
      if (i >= depth) break;
      vec2 size = c.mx - c.mn;
      float r = hash11(c.id * 13.37 + float(i) * 1.7);
      if (i >= 2 && hash11(c.id * 3.31 + 1.7) < stopP) break;
      bool splitX = size.x > size.y * 1.35 ? true : (size.y > size.x * 1.35 ? false : r < 0.5);
      if ((splitX ? size.x : size.y) < minSize * 2.0) break;
      float r2 = hash11(c.id * 7.1 + 3.0);
      float t = r2 < 0.34 ? 0.5 : (r2 < 0.67 ? 0.3333333 : 0.6666667);
      if (splitX) {
        float m = mix(c.mn.x, c.mx.x, t);
        if (uv.x < m) { c.mx.x = m; c.id = c.id * 2.0 + 1.0; } else { c.mn.x = m; c.id = c.id * 2.0 + 2.0; }
      } else {
        float m = mix(c.mn.y, c.mx.y, t);
        if (uv.y < m) { c.mx.y = m; c.id = c.id * 2.0 + 1.0; } else { c.mn.y = m; c.id = c.id * 2.0 + 2.0; }
      }
    }
    c.id = fract(c.id * 0.61803 + seed * 0.1234);
    return c;
  }
  float edgeDist(vec2 uv, Cell c) {
    vec2 d = min(uv - c.mn, c.mx - uv);
    return min(d.x, d.y);
  }
  float dome(float d, float r) {
    float x = clamp(d / r, 0.0, 1.0);
    return sqrt(1.0 - x * x);
  }
  // Distance to the nearest rivet in rows along the inside of a cell's edges.
  float rivetDist(vec2 uv, Cell c, float inset, float spacing) {
    vec2 size = c.mx - c.mn;
    float best = 1e3;
    // Horizontal rows (bottom, top).
    for (int k = 0; k < 2; k++) {
      float y = k == 0 ? c.mn.y + inset : c.mx.y - inset;
      float n = max(1.0, floor((size.x - inset * 2.0) / spacing));
      float stp = (size.x - inset * 2.0) / n;
      float t = clamp(floor((uv.x - c.mn.x - inset) / stp + 0.5), 0.0, n);
      vec2 p = vec2(c.mn.x + inset + t * stp, y);
      best = min(best, length(uv - p));
    }
    for (int k = 0; k < 2; k++) {
      float x = k == 0 ? c.mn.x + inset : c.mx.x - inset;
      float n = max(1.0, floor((size.y - inset * 2.0) / spacing));
      float stp = (size.y - inset * 2.0) / n;
      float t = clamp(floor((uv.y - c.mn.y - inset) / stp + 0.5), 0.0, n);
      vec2 p = vec2(x, c.mn.y + inset + t * stp);
      best = min(best, length(uv - p));
    }
    return best;
  }
  float boxMask(vec2 uv, vec2 c, vec2 h, float soft) {
    vec2 d = abs(uv - c) - h;
    return 1.0 - smoothstep(-soft, soft, max(d.x, d.y));
  }

  // ------------------------------------------------------------------
  // Height fields. Each KIND has one; surface() re-derives the rest.
  // ------------------------------------------------------------------
  float heightAt(vec2 uv) {
    #if KIND == 0 || KIND == 1
      #if KIND == 0
        Cell c = kd(uv, 1.0 + uSeed, 4, 0.3, 0.06);
        float groove = 0.0026, bev = 0.012;
      #else
        Cell c = kd(uv, 3.0 + uSeed, 5, 0.25, 0.04);
        float groove = 0.0016, bev = 0.006;
      #endif
      float ed = edgeDist(uv, c);
      float h = 0.55 + 0.12 * c.id;
      h *= smoothstep(0.0, bev, ed);
      h -= (1.0 - smoothstep(groove * 0.5, groove * 1.6, ed)) * 0.35;
      vec2 size = c.mx - c.mn;
      vec2 ctr = (c.mn + c.mx) * 0.5;
      #if KIND == 0
        if (min(size.x, size.y) > 0.09) {
          vec2 corner = vec2(uv.x - c.mn.x < c.mx.x - uv.x ? c.mn.x + 0.02 : c.mx.x - 0.02,
                             uv.y - c.mn.y < c.mx.y - uv.y ? c.mn.y + 0.02 : c.mx.y - 0.02);
          h += 0.6 * dome(length(uv - corner), 0.0065);
        }
        float kind = hash11(c.id * 91.7);
        if (kind < 0.2 && min(size.x, size.y) > 0.16) {
          vec2 hv = size * vec2(0.32, 0.28);
          float inR = boxMask(uv, ctr, hv, 0.002);
          float slot = smoothstep(0.3, 0.38, fract((uv.y - ctr.y) * 70.0)) * smoothstep(0.82, 0.74, fract((uv.y - ctr.y) * 70.0));
          h -= inR * (0.18 + 0.4 * slot);
          h -= (boxMask(uv, ctr, hv + 0.006, 0.002) - inR) * 0.1;
        } else if (kind < 0.34 && min(size.x, size.y) > 0.12) {
          vec2 hv = size * 0.3;
          float g = abs(max(abs(uv.x - ctr.x) - hv.x, abs(uv.y - ctr.y) - hv.y));
          h -= (1.0 - smoothstep(0.001, 0.003, g)) * 0.3;
          vec2 sc = ctr + sign(uv - ctr) * (hv - 0.012);
          h += 0.3 * dome(length(uv - sc), 0.004);
        }
      #else
        h += 0.45 * dome(rivetDist(uv, c, 0.007, 0.014), 0.0026);
        // Micrometeorite pitting.
        vec2 pc = floor(uv * 180.0);
        vec2 pp = hash22(mod(pc, 180.0) + uSeed);
        float pd = length(fract(uv * 180.0) - pp);
        h -= step(0.93, hash12(mod(pc, 180.0) + 3.1)) * (1.0 - smoothstep(0.05, 0.16, pd)) * 0.18;
      #endif
      h += (fbm(uv, vec2(24.0), 3) - 0.5) * 0.03;
      return h;
    #elif KIND == 2
      float bearing = abs(fract(uv.x * 30.0) - 0.5) * 2.0;
      float cross = abs(fract(uv.y * 8.0) - 0.5) * 2.0;
      float b = smoothstep(0.76, 0.84, bearing);
      float cr = smoothstep(0.86, 0.92, cross);
      return max(b * (0.8 + 0.2 * (1.0 - abs(bearing - 0.9) * 8.0)), cr * 0.6);
    #elif KIND == 3
      vec2 g = uv * 14.0;
      vec2 cell = floor(g);
      vec2 f = fract(g) - 0.5;
      float o = mod(cell.x + cell.y, 2.0) < 1.0 ? 1.0 : -1.0;
      vec2 r = vec2(f.x + o * f.y, f.y - o * f.x) * 0.7071;
      float d = length(vec2(r.x / 0.36, r.y / 0.075));
      return 0.2 + 0.6 * smoothstep(1.0, 0.55, d) + (fbm(uv, vec2(16.0), 3) - 0.5) * 0.05;
    #elif KIND == 4
      float chip = chips(uv, 20.0, 0.66);
      return 0.5 - chip * 0.2 + (fbm(uv, vec2(40.0), 2) - 0.5) * 0.04;
    #elif KIND == 5
      vec2 w = uv * 90.0;
      float warp = sin(w.x * 6.2831853) * 0.5 + 0.5;
      float weft = sin(w.y * 6.2831853) * 0.5 + 0.5;
      float over = mod(floor(w.x) + floor(w.y), 2.0);
      float t = mix(warp, weft, over);
      return t * 0.6 + fbm(uv, vec2(30.0), 3) * 0.3;
    #elif KIND == 6
      float x = fract(uv.x * 14.0);
      float prof = smoothstep(0.05, 0.2, x) * (1.0 - smoothstep(0.55, 0.7, x));
      float dent = (fbm(uv, vec2(3.0, 5.0), 3) - 0.5) * 0.25;
      return prof * 0.7 + dent;
    #elif KIND == 7
      float peel = fbm(uv, vec2(60.0), 3) * 0.06;
      float chip = chips(uv, 34.0, 0.81);
      return 0.5 + peel - chip * 0.2;
    #elif KIND == 8
      float rib = abs(fract(uv.y * 20.0) - 0.5) * 2.0;
      return smoothstep(0.35, 0.6, rib) * 0.5 + fbm(uv, vec2(40.0), 2) * 0.05;
    #elif KIND == 9
      return vnoise(uv * vec2(3.0, 400.0), vec2(3.0, 400.0)) * 0.08;
    #elif KIND == 10
      // Deck plating: large bolted floor plates.
      Cell c = kd(uv, 7.0 + uSeed, 2, 0.0, 0.2);
      float ed = edgeDist(uv, c);
      float h = 0.5 * smoothstep(0.0, 0.006, ed);
      h -= (1.0 - smoothstep(0.001, 0.003, ed)) * 0.3;
      h += 0.3 * dome(rivetDist(uv, c, 0.018, 0.09), 0.006);
      h += (fbm(uv, vec2(20.0), 3) - 0.5) * 0.03;
      return h;
    #else
      return 0.5;
    #endif
  }

  void surface(vec2 uv, float h, out vec3 albedo, out float alpha, out float rough, out float metal, out float ao) {
    alpha = 1.0;
    float grime = grimeAt(uv);
    float fine = fbm(uv, vec2(48.0), 3);
    #if KIND == 0 || KIND == 1
      #if KIND == 0
        Cell c = kd(uv, 1.0 + uSeed, 4, 0.3, 0.06);
        float groove = 0.0026;
      #else
        Cell c = kd(uv, 3.0 + uSeed, 5, 0.25, 0.04);
        float groove = 0.0016;
      #endif
      float ed = edgeDist(uv, c);
      float seam = 1.0 - smoothstep(groove * 0.4, groove * 2.2, ed);
      float edgeWear = (1.0 - smoothstep(0.0, 0.012, ed)) * smoothstep(0.66, 0.84, fbm(uv, vec2(40.0), 3));
      float tone = 0.8 + 0.2 * c.id;
      float replaced = step(0.9, hash11(c.id * 51.3));
      tone *= mix(1.0, 0.72, replaced);
      #if KIND == 1
        // Hull: vertical weathering streaks + scorch.
        float streak = fbm(vec2(uv.x, uv.y * 0.25), vec2(40.0, 3.0), 4);
        tone *= 0.9 + 0.12 * streak;
        tone *= 1.0 - 0.3 * smoothstep(0.3, 0.8, grime);
      #else
        tone *= 1.0 - 0.32 * smoothstep(0.3, 0.8, grime);
      #endif
      albedo = vec3(tone);
      albedo *= 1.0 - seam * 0.55;
      float cav = clamp(h * 1.6 + 0.2, 0.0, 1.0);
      albedo *= mix(0.55, 1.0, cav);
      float sc = scratches(uv, 0.35);
      metal = clamp(edgeWear + sc * 0.6, 0.0, 1.0);
      albedo = mix(albedo, vec3(0.4), metal);
      rough = 0.55 + 0.18 * (fine - 0.5) + 0.2 * smoothstep(0.5, 0.9, grime) - sc * 0.25;
      rough = mix(rough, 0.32, metal * 0.6);
      ao = mix(0.35, 1.0, 1.0 - seam) * mix(0.6, 1.0, cav);
    #elif KIND == 2
      float bar = step(0.15, h);
      alpha = bar;
      float worn = smoothstep(0.7, 0.95, h);
      albedo = vec3(0.42) * (0.8 + 0.3 * fine) * (1.0 - 0.35 * smoothstep(0.5, 0.85, grime));
      albedo = mix(albedo, vec3(0.62), worn * 0.6);
      metal = 1.0;
      rough = mix(0.62, 0.34, worn) + 0.15 * smoothstep(0.55, 0.9, grime);
      ao = mix(0.55, 1.0, h);
    #elif KIND == 3
      float top = smoothstep(0.45, 0.75, h);
      albedo = vec3(0.5) * (0.85 + 0.25 * fine) * (1.0 - 0.4 * smoothstep(0.45, 0.85, grime) * (1.0 - top));
      albedo = mix(albedo, vec3(0.66), top * 0.5);
      metal = 1.0;
      rough = mix(0.58, 0.28, top) + 0.15 * smoothstep(0.55, 0.9, grime);
      ao = mix(0.6, 1.0, h);
    #elif KIND == 4
      float s = fract((uv.x + uv.y) * 5.0);
      float stripe = smoothstep(0.49, 0.51, s) * (1.0 - smoothstep(0.99, 1.0, s)) + (1.0 - smoothstep(0.0, 0.01, s));
      vec3 yellow = vec3(0.86, 0.52, 0.03);
      vec3 black = vec3(0.025);
      albedo = mix(yellow, black, stripe);
      float chip = chips(uv, 20.0, 0.66);
      float sc = scratches(uv, 0.5);
      metal = max(chip, sc * 0.7);
      albedo = mix(albedo, vec3(0.5), metal);
      albedo *= 1.0 - 0.45 * smoothstep(0.45, 0.9, grime);
      rough = 0.55 + 0.25 * grime - metal * 0.2;
      ao = 1.0 - chip * 0.3;
    #elif KIND == 5
      albedo = vec3(0.78) * (0.85 + 0.2 * fine) * (1.0 - 0.15 * grime);
      albedo *= 0.75 + 0.25 * h;
      metal = 0.0;
      rough = 0.92;
      ao = 0.7 + 0.3 * h;
    #elif KIND == 6
      float sc = scratches(uv, 0.45);
      float chip = chips(uv, 26.0, 0.78) * (0.4 + 0.6 * smoothstep(0.3, 0.7, h));
      float streak = fbm(vec2(uv.x, uv.y * 0.2), vec2(60.0, 2.0), 4);
      albedo = vec3(0.85) * (0.85 + 0.15 * streak) * (1.0 - 0.4 * smoothstep(0.45, 0.9, grime));
      metal = clamp(chip + sc * 0.6, 0.0, 1.0);
      albedo = mix(albedo, vec3(0.45), metal);
      rough = 0.6 + 0.2 * grime - metal * 0.2;
      ao = 0.65 + 0.35 * smoothstep(0.0, 0.5, h);
    #elif KIND == 7
      float chip = chips(uv, 34.0, 0.81);
      float sc = scratches(uv, 0.22);
      albedo = vec3(0.86) * (0.92 + 0.1 * fine) * (1.0 - 0.3 * smoothstep(0.5, 0.9, grime));
      metal = clamp(chip + sc * 0.5, 0.0, 1.0);
      albedo = mix(albedo, vec3(0.34), metal);
      rough = 0.42 + 0.2 * fine + 0.18 * smoothstep(0.5, 0.9, grime) - sc * 0.15;
      rough = mix(rough, 0.3, metal * 0.5);
      ao = 1.0 - chip * 0.25;
    #elif KIND == 8
      albedo = vec3(0.07) * (0.8 + 0.4 * fine);
      metal = 0.0;
      rough = 0.88 - h * 0.1;
      ao = 0.7 + 0.3 * h;
    #elif KIND == 9
      float st = vnoise(uv * vec2(2.0, 260.0), vec2(2.0, 260.0));
      albedo = vec3(0.6 + 0.08 * st) * (1.0 - 0.18 * smoothstep(0.55, 0.9, grime));
      metal = 1.0;
      rough = 0.26 + 0.12 * st + 0.1 * smoothstep(0.55, 0.9, grime);
      ao = 1.0;
    #elif KIND == 10
      Cell c = kd(uv, 7.0 + uSeed, 2, 0.0, 0.2);
      float ed = edgeDist(uv, c);
      float seam = 1.0 - smoothstep(0.0008, 0.004, ed);
      float traffic = fbm(uv, vec2(3.0), 4);
      float sc = scratches(uv, 0.6);
      albedo = vec3(0.4 + 0.1 * c.id) * (1.0 - 0.35 * smoothstep(0.45, 0.85, grime)) * (1.0 - seam * 0.6);
      metal = clamp(0.35 + sc * 0.6 + smoothstep(0.6, 0.8, traffic) * 0.3, 0.0, 1.0);
      albedo = mix(albedo, vec3(0.55), sc * 0.6);
      rough = 0.55 + 0.2 * grime - sc * 0.2;
      ao = 1.0 - seam * 0.6;
    #else
      albedo = vec3(0.8); metal = 0.0; rough = 0.5; ao = 1.0;
    #endif
    rough = clamp(rough, 0.04, 1.0);
  }

  void main() {
    vec2 uv = vUv;
    float h = heightAt(uv);
    float hx = heightAt(fract(uv + vec2(uTexel, 0.0)));
    float hy = heightAt(fract(uv + vec2(0.0, uTexel)));
    vec3 n = normalize(vec3((h - hx) * uNormalStrength, (h - hy) * uNormalStrength, 1.0));
    vec3 albedo; float alpha, rough, metal, ao;
    surface(uv, h, albedo, alpha, rough, metal, ao);
    oAlbedo = vec4(albedo, alpha);
    oNormal = vec4(n * 0.5 + 0.5, 1.0);
    oORM = vec4(ao, rough, metal, 1.0);
  }
`;

const SPEC: Record<TextureKind, { size: number; normal: number }> = {
  panel: { size: 1024, normal: 10 },
  hull: { size: 1024, normal: 8 },
  grate: { size: 512, normal: 6 },
  tread: { size: 512, normal: 6 },
  hazard: { size: 512, normal: 4 },
  fabric: { size: 512, normal: 4 },
  corrugated: { size: 512, normal: 8 },
  painted: { size: 512, normal: 4 },
  rubber: { size: 256, normal: 3 },
  brushed: { size: 512, normal: 1.5 },
  deck: { size: 1024, normal: 8 },
};

export function bakeTextureSet(renderer: THREE.WebGLRenderer, kind: TextureKind, seed = 0, anisotropy = 8): TextureSet {
  const spec = SPEC[kind];
  const size = spec.size;
  const rt = new THREE.WebGLRenderTarget(size, size, {
    count: 3,
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: false,
  });
  for (const t of rt.textures) {
    t.anisotropy = anisotropy;
    t.colorSpace = THREE.NoColorSpace;
  }
  const material = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: vertex,
    fragmentShader: fragment,
    defines: { KIND: KINDS[kind] },
    uniforms: {
      uSeed: { value: seed },
      uTexel: { value: 1 / size },
      uNormalStrength: { value: spec.normal },
    },
    depthTest: false,
    depthWrite: false,
  });
  const quad = new FullScreenQuad(material);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  quad.render(renderer);
  renderer.setRenderTarget(prev);
  quad.dispose();
  material.dispose();
  const [map, normalMap, orm] = rt.textures;
  map.name = `${kind}-albedo`;
  normalMap.name = `${kind}-normal`;
  orm.name = `${kind}-orm`;
  return { map, normalMap, orm };
}
