// ---------------------------------------------------------------------------------------------
// aw_common — hashing, value noise, remapping. Prefixed to avoid clashing with three.js chunks.
// ---------------------------------------------------------------------------------------------
#ifndef AW_COMMON
#define AW_COMMON

#define AW_PI 3.14159265359
#define AW_TAU 6.28318530718
#ifndef saturate
#define saturate(a) clamp(a, 0.0, 1.0)
#endif

float aw_hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float aw_hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float aw_hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 aw_hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
vec3 aw_hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

/** Interleaved gradient noise — cheap per-pixel dither (Jimenez 2014). */
float aw_ign(vec2 fragCoord) {
  return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
}

float aw_vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = aw_hash12(i);
  float b = aw_hash12(i + vec2(1.0, 0.0));
  float c = aw_hash12(i + vec2(0.0, 1.0));
  float d = aw_hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float aw_vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float n000 = aw_hash13(i);
  float n100 = aw_hash13(i + vec3(1, 0, 0));
  float n010 = aw_hash13(i + vec3(0, 1, 0));
  float n110 = aw_hash13(i + vec3(1, 1, 0));
  float n001 = aw_hash13(i + vec3(0, 0, 1));
  float n101 = aw_hash13(i + vec3(1, 0, 1));
  float n011 = aw_hash13(i + vec3(0, 1, 1));
  float n111 = aw_hash13(i + vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

float aw_fbm2(vec2 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 8; i++) {
    if (i >= oct) break;
    s += a * aw_vnoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.13;
    a *= 0.5;
  }
  return s;
}

float aw_fbm3(vec3 p, int oct) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= oct) break;
    s += a * aw_vnoise3(p);
    p = p * 2.03 + vec3(1.7, 9.2, 5.3);
    a *= 0.5;
  }
  return s;
}

float aw_remap(float x, float a, float b, float c, float d) {
  return c + (d - c) * (x - a) / (b - a);
}
float aw_luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

/** Henyey-Greenstein phase function. */
float aw_hg(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * AW_PI * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}

#endif
