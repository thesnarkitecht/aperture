import * as THREE from 'three';
import { shared } from '../engine/shared';

/**
 * Animated console displays. All screens in the ship share one ShaderMaterial
 * and are merged into a single draw per zone; each quad carries its layout
 * type, a random seed and a palette index in its vertex color (r, g, b).
 */
export const SCREEN = {
  terminal: 0,
  radar: 1,
  graphs: 2,
  bars: 3,
  schematic: 4,
  vitals: 5,
  warning: 6,
  orbit: 7,
} as const;
export type ScreenType = keyof typeof SCREEN;

export const PALETTE = {
  amber: 0,
  green: 1,
  cyan: 2,
  red: 3,
  white: 4,
} as const;
export type ScreenPalette = keyof typeof PALETTE;

/** Encode screen parameters into a vertex color for the batcher. */
export function screenColor(type: ScreenType, palette: ScreenPalette, seed: number) {
  return new THREE.Color((SCREEN[type] + 0.5) / 8, seed % 1, (PALETTE[palette] + 0.5) / 5);
}

/** Fresh fog uniforms for custom ShaderMaterials (UniformsUtils.merge would clone shared uniforms). */
export function fogUniforms() {
  return {
    fogColor: { value: new THREE.Color(0x000000) },
    fogNear: { value: 1 },
    fogFar: { value: 1000 },
    fogDensity: { value: 0 },
  };
}

export function createScreenMaterial() {
  const material = new THREE.ShaderMaterial({
    name: 'screen',
    vertexColors: true,
    uniforms: {
      uTime: shared.uTime,
      uBrightness: { value: 2.4 },
      ...fogUniforms(),
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vParams;
      varying vec3 vViewPos;
      varying vec3 vNormalV;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vUv = uv;
        vParams = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPos = mvPosition.xyz;
        vNormalV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uBrightness;
      varying vec2 vUv;
      varying vec3 vParams;
      varying vec3 vViewPos;
      varying vec3 vNormalV;
      #include <common>
      #include <fog_pars_fragment>

      float h11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
      float h21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      float line(float d, float w) { return 1.0 - smoothstep(w * 0.5, w, abs(d)); }
      float rect(vec2 p, vec2 c, vec2 h) { vec2 d = abs(p - c) - h; return 1.0 - step(0.0, max(d.x, d.y)); }
      float frame(vec2 p, vec2 c, vec2 h, float w) { vec2 d = abs(p - c) - h; float m = max(d.x, d.y); return line(m, w); }

      vec3 palette(float idx) {
        if (idx < 1.0) return vec3(1.0, 0.56, 0.14);
        if (idx < 2.0) return vec3(0.35, 1.0, 0.45);
        if (idx < 3.0) return vec3(0.3, 0.85, 1.0);
        if (idx < 4.0) return vec3(1.0, 0.22, 0.16);
        return vec3(0.85, 0.92, 1.0);
      }

      // Pseudo text: rows of glyph-sized blocks with random lengths.
      float textBlock(vec2 p, vec2 cells, float seed, float t) {
        vec2 g = p * cells;
        vec2 id = floor(g);
        vec2 f = fract(g);
        float row = id.y;
        float rowLen = floor(h11(row * 7.3 + seed + floor(t)) * cells.x * 0.9) + 2.0;
        float glyph = step(id.x, rowLen) * step(0.5, h21(id + seed + floor(t * 0.5 + row * 0.13) * 3.0) + 0.25);
        float shape = step(0.18, f.x) * step(f.x, 0.82) * step(0.22, f.y) * step(f.y, 0.78);
        // Glyph interior detail.
        vec2 sub = floor(f * vec2(3.0, 4.0));
        shape *= step(0.35, h21(sub + id * 1.7 + seed));
        return glyph * shape;
      }

      float graphLine(vec2 p, float seed, float t, float w) {
        float x = p.x * 12.0 + t * 1.5;
        float i = floor(x);
        float f = fract(x);
        float a = h11(i + seed * 13.0);
        float b = h11(i + 1.0 + seed * 13.0);
        float y = mix(a, b, f * f * (3.0 - 2.0 * f)) * 0.7 + 0.15;
        return line(p.y - y, w);
      }

      void main() {
        vec2 uv = vUv;
        float type = floor(vParams.r * 8.0);
        float seed = vParams.g * 97.0;
        vec3 tint = palette(floor(vParams.b * 5.0));
        float t = uTime + seed * 3.1;
        float aspect = 1.6;
        vec2 p = uv;
        float v = 0.0;      // main ink
        float dim = 0.0;    // secondary (grid) ink
        vec3 accent = vec3(0.0);

        if (type < 0.5) {
          // Terminal: header bar, scrolling text, blinking cursor.
          float header = rect(p, vec2(0.5, 0.93), vec2(0.47, 0.04));
          vec2 tp = vec2(p.x, p.y + fract(t * 0.05) * 0.0);
          float txt = textBlock((tp - vec2(0.04, 0.06)) / vec2(0.92, 0.78), vec2(34.0, 16.0), seed, t * 0.7);
          txt *= step(0.06, p.y) * step(p.y, 0.84) * step(0.04, p.x) * step(p.x, 0.96);
          float cursor = rect(p, vec2(0.08 + 0.5 * h11(floor(t)), 0.1), vec2(0.012, 0.018)) * step(0.5, fract(t * 1.5));
          v = txt + cursor;
          dim = header;
          accent = tint * rect(p, vec2(0.9, 0.93), vec2(0.04, 0.025)) * step(0.5, fract(t * 0.8));
        } else if (type < 1.5) {
          // Radar sweep.
          vec2 c = (p - 0.5) * vec2(aspect, 1.0);
          float r = length(c);
          float ang = atan(c.y, c.x);
          float rings = line(fract(r * 6.0) - 0.5, 0.06) * step(r, 0.46);
          float spokes = (line(c.x, 0.004) + line(c.y, 0.004)) * step(r, 0.46);
          float sweepA = mod(t * 1.2, 6.2831853);
          float da = mod(sweepA - ang + 6.2831853, 6.2831853);
          float sweep = exp(-da * 2.2) * step(r, 0.46);
          float blips = 0.0;
          for (int i = 0; i < 6; i++) {
            float fi = float(i);
            float br = 0.08 + 0.36 * h11(fi * 3.1 + seed);
            float ba = 6.2831853 * h11(fi * 7.7 + seed);
            vec2 bp = vec2(cos(ba), sin(ba)) * br;
            float age = mod(sweepA - ba + 6.2831853, 6.2831853);
            blips += (1.0 - smoothstep(0.008, 0.016, length(c - bp))) * exp(-age * 0.6);
          }
          v = sweep * 0.8 + blips * 1.5 + line(r - 0.46, 0.008);
          dim = rings * 0.5 + spokes * 0.4;
        } else if (type < 2.5) {
          // Stacked graphs with grid.
          float grid = (line(fract(p.x * 10.0) - 0.5, 0.04) + line(fract(p.y * 6.0) - 0.5, 0.04)) * 0.5;
          vec2 q = p;
          float lane = floor(q.y * 3.0);
          vec2 lp = vec2(q.x, fract(q.y * 3.0));
          v = graphLine(lp, seed + lane, t, 0.05);
          float fill = step(lp.y, 0.15 + 0.7 * h11(floor(lp.x * 12.0 + t * 1.5) + seed * 13.0 + lane)) * 0.12;
          v += fill;
          dim = grid + line(fract(q.y * 3.0), 0.03) * 2.0;
        } else if (type < 3.5) {
          // Animated level bars + readouts.
          float n = 14.0;
          float i = floor(p.x * n);
          float f = fract(p.x * n);
          float level = 0.25 + 0.6 * (0.5 + 0.5 * sin(t * (0.6 + h11(i + seed) * 1.8) + i));
          float bar = step(0.15, f) * step(f, 0.85) * step(0.12, p.y) * step(p.y, 0.12 + level * 0.66);
          float seg = step(0.3, fract(p.y * 40.0));
          v = bar * seg;
          dim = step(0.15, f) * step(f, 0.85) * step(0.12, p.y) * step(p.y, 0.78) * 0.15;
          float txt = textBlock((p - vec2(0.05, 0.84)) / vec2(0.9, 0.12), vec2(30.0, 2.0), seed, t * 0.3);
          v += txt * step(0.84, p.y) * step(p.y, 0.96);
          accent = vec3(1.0, 0.25, 0.1) * bar * seg * step(0.72, p.y);
        } else if (type < 4.5) {
          // Ship schematic: plan-view outline with blinking compartments.
          vec2 c = (p - vec2(0.5, 0.5)) * vec2(aspect, 1.0);
          float outline = 0.0;
          outline += frame(c, vec2(-0.35, 0.0), vec2(0.13, 0.08), 0.008);
          outline += frame(c, vec2(-0.08, 0.0), vec2(0.15, 0.17), 0.008);
          outline += frame(c, vec2(0.23, 0.0), vec2(0.16, 0.15), 0.008);
          outline += frame(c, vec2(0.5, 0.0), vec2(0.11, 0.13), 0.008);
          outline += line(c.y, 0.004) * step(-0.46, c.x) * step(c.x, 0.6) * 0.5;
          float zone = floor(mod(t * 0.7, 4.0));
          vec2 zc = zone < 0.5 ? vec2(-0.35, 0.0) : zone < 1.5 ? vec2(-0.08, 0.0) : zone < 2.5 ? vec2(0.23, 0.0) : vec2(0.5, 0.0);
          float hl = rect(c, zc, vec2(0.1, 0.06)) * (0.5 + 0.5 * sin(t * 8.0));
          v = outline + hl * 0.35;
          dim = (line(fract(c.x * 20.0) - 0.5, 0.05) + line(fract(c.y * 20.0) - 0.5, 0.05)) * 0.25;
          float txt = textBlock((p - vec2(0.05, 0.05)) / vec2(0.4, 0.15), vec2(16.0, 3.0), seed, t * 0.2);
          v += txt * step(0.05, p.y) * step(p.y, 0.2) * step(p.x, 0.45);
        } else if (type < 5.5) {
          // Patient vitals: ECG trace.
          float x = fract(p.x - t * 0.25);
          float beat = fract(x * 3.0);
          float y = 0.5;
          y += 0.28 * exp(-pow((beat - 0.3) * 28.0, 2.0));
          y -= 0.1 * exp(-pow((beat - 0.34) * 24.0, 2.0));
          y += 0.06 * exp(-pow((beat - 0.55) * 10.0, 2.0));
          float trace = line(p.y * 1.0 - y * 0.6 - 0.25, 0.02);
          v = trace * (0.4 + 0.6 * smoothstep(0.0, 0.5, fract(p.x + t * 0.25)));
          dim = (line(fract(p.x * 12.0) - 0.5, 0.04) + line(fract(p.y * 8.0) - 0.5, 0.04)) * 0.25;
          float txt = textBlock((p - vec2(0.72, 0.62)) / vec2(0.24, 0.3), vec2(6.0, 3.0), seed, 0.0);
          v += txt * step(0.72, p.x) * step(0.62, p.y) * step(p.y, 0.92) * 1.2;
        } else if (type < 6.5) {
          // Warning panel: flashing chevrons + text.
          float stripe = step(0.5, fract((p.x + p.y * 0.4) * 8.0 - t * 0.5));
          float band = step(0.78, p.y) + step(p.y, 0.22);
          float flash = step(0.5, fract(t * 1.1));
          v = stripe * band * (0.4 + 0.6 * flash);
          float txt = textBlock((p - vec2(0.1, 0.38)) / vec2(0.8, 0.26), vec2(14.0, 2.0), seed, 0.0);
          v += txt * step(0.38, p.y) * step(p.y, 0.64) * (0.6 + 0.4 * flash);
        } else {
          // Orbital plot: planet disc, orbit ellipse, moving marker.
          vec2 c = (p - vec2(0.42, 0.5)) * vec2(aspect, 1.0);
          float planet = 1.0 - smoothstep(0.12, 0.125, length(c));
          float terminator = smoothstep(-0.05, 0.05, c.x + c.y * 0.3);
          vec2 e = c / vec2(0.36, 0.22);
          float orbit = line(length(e) - 1.0, 0.03);
          float a = t * 0.4;
          vec2 sp = vec2(cos(a) * 0.36, sin(a) * 0.22);
          float ship = 1.0 - smoothstep(0.01, 0.018, length(c - sp));
          v = orbit * 0.7 + ship * 1.6 + planet * terminator * 0.35;
          dim = planet * 0.25 + (line(fract(p.x * 16.0) - 0.5, 0.04) + line(fract(p.y * 10.0) - 0.5, 0.04)) * 0.15;
          float txt = textBlock((p - vec2(0.76, 0.2)) / vec2(0.2, 0.6), vec2(8.0, 10.0), seed, t * 0.25);
          v += txt * step(0.76, p.x) * step(0.2, p.y) * step(p.y, 0.8);
        }

        // CRT treatment: scanlines, subpixel mask, bezel falloff, flicker.
        float scan = 0.78 + 0.22 * sin(uv.y * 520.0);
        float mask = 0.85 + 0.15 * sin(uv.x * 900.0);
        vec2 e = uv * (1.0 - uv);
        float bezel = smoothstep(0.0, 0.03, e.x * 4.0) * smoothstep(0.0, 0.03, e.y * 4.0);
        float flicker = 0.96 + 0.04 * sin(uTime * 60.0 + seed);
        vec3 bg = tint * 0.035 + vec3(0.004, 0.006, 0.008);
        vec3 col = bg + tint * (clamp(v, 0.0, 1.6) + dim * 0.28) + accent;
        col *= scan * mask * bezel * flicker * uBrightness;

        // Faint glass reflection so the screen reads as a physical surface.
        vec3 viewDir = normalize(-vViewPos);
        float fres = pow(1.0 - clamp(dot(viewDir, normalize(vNormalV)), 0.0, 1.0), 4.0);
        col += vec3(0.05, 0.06, 0.07) * fres;

        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
    fog: true,
  });
  material.userData.uvMode = 'keep';
  material.userData.castShadow = false;
  return material;
}
