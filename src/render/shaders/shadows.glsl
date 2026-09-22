// ---------------------------------------------------------------------------------------------
// aw_shadows — two sun shadow cascades (a tight one that follows the hero, a wide one for
// the island) with rotated-Poisson PCF and a smooth cascade crossfade.
// ---------------------------------------------------------------------------------------------
#ifndef AW_SHADOWS
#define AW_SHADOWS

uniform sampler2D uShadowMap0;
uniform sampler2D uShadowMap1;
uniform mat4 uShadowMatrix0;
uniform mat4 uShadowMatrix1;
uniform vec4 uShadowTexel;   // xy: texel size (uv) of cascades 0/1, zw: world size of a texel
uniform vec2 uShadowRadius;  // filter radius in texels per cascade
uniform float uShadowEnabled;

const vec2 AW_POISSON[16] = vec2[](
  vec2(-0.94201624, -0.39906216), vec2(0.94558609, -0.76890725), vec2(-0.09418410, -0.92938870),
  vec2(0.34495938, 0.29387760), vec2(-0.91588581, 0.45771432), vec2(-0.81544232, -0.87912464),
  vec2(-0.38277543, 0.27676845), vec2(0.97484398, 0.75648379), vec2(0.44323325, -0.97511554),
  vec2(0.53742981, -0.47373420), vec2(-0.26496911, -0.41893023), vec2(0.79197514, 0.19090188),
  vec2(-0.24188840, 0.99706507), vec2(-0.81409955, 0.91437590), vec2(0.19984126, 0.78641367),
  vec2(0.14383161, -0.14100790)
);

float aw_pcf(sampler2D map, vec3 c, float radius, float rot, int taps) {
  float s = sin(rot), co = cos(rot);
  mat2 R = mat2(co, -s, s, co);
  float lit = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= taps) break;
    vec2 o = R * AW_POISSON[i] * radius;
    float d = texture(map, c.xy + o).r;
    lit += step(c.z, d);
  }
  return lit / float(taps);
}

float aw_inCascade(vec3 c, float margin) {
  vec3 e = min(c, 1.0 - c);
  return step(0.0, min(min(e.x, e.y), e.z) - margin);
}

/**
 * Sun visibility at a world position. `ndl` lets us scale slope bias. `taps` 4..16.
 */
float aw_sunShadow(vec3 worldPos, vec3 n, float ndl, vec2 fragCoord, int taps) {
  if (uShadowEnabled < 0.5) return 1.0;
  float rot = aw_ign(fragCoord) * AW_TAU;
  float slope = clamp(1.0 - ndl, 0.0, 1.0);

  vec3 p0 = worldPos + n * uShadowTexel.z * (1.0 + 2.0 * slope);
  vec4 c0 = uShadowMatrix0 * vec4(p0, 1.0);
  vec3 s0 = c0.xyz / c0.w;
  s0.z -= 0.00025 + 0.0008 * slope;

  vec3 p1 = worldPos + n * uShadowTexel.w * (1.0 + 2.0 * slope);
  vec4 c1 = uShadowMatrix1 * vec4(p1, 1.0);
  vec3 s1 = c1.xyz / c1.w;
  s1.z -= 0.00012 + 0.0004 * slope;

  float in0 = aw_inCascade(s0, 0.0);
  float in1 = aw_inCascade(s1, 0.0);
  float far = in1 > 0.5 ? aw_pcf(uShadowMap1, s1, uShadowTexel.y * uShadowRadius.y, rot, max(4, taps / 2)) : 1.0;
  if (in0 < 0.5) return far;
  float near = aw_pcf(uShadowMap0, s0, uShadowTexel.x * uShadowRadius.x, rot, taps);
  // Fade into the wide cascade near the edge of the tight one.
  vec2 e = min(s0.xy, 1.0 - s0.xy);
  float edge = smoothstep(0.0, 0.12, min(e.x, e.y));
  return mix(far, near, edge);
}

#endif
