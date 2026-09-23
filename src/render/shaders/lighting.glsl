// ---------------------------------------------------------------------------------------------
// aw_lighting — painterly toon shading shared by every lit surface.
//   * two-tone light ramp with a soft, narrow terminator (no realistic cosine falloff)
//   * cool violet shadow tones instead of dark greys; cast shadows are crisped to shapes
//   * warm rim band that outlines silhouettes against the sunset
//   * small, hard-edged stylised highlights
//   * thin-surface glow for backlit grass, leaves and fabric
// ---------------------------------------------------------------------------------------------
#ifndef AW_LIGHTING
#define AW_LIGHTING

struct AwSurface {
  vec3 albedo;
  vec3 normal;
  float roughness;
  float metallic;
  float ao;
  float wrap;          // softens the terminator (skin, foliage, cloth)
  vec3 sssColor;       // tint of the terminator band
  float translucency;  // 0..1 thin-surface transmission
  float rim;           // rim light strength multiplier
  float specular;      // highlight scale (0 disables)
  vec3 emissive;
};

AwSurface aw_defaultSurface() {
  AwSurface s;
  s.albedo = vec3(0.5);
  s.normal = vec3(0.0, 1.0, 0.0);
  s.roughness = 0.8;
  s.metallic = 0.0;
  s.ao = 1.0;
  s.wrap = 0.0;
  s.sssColor = vec3(1.0);
  s.translucency = 0.0;
  s.rim = 0.0;
  s.specular = 1.0;
  s.emissive = vec3(0.0);
  return s;
}

// Microfacet helpers (used by water glints).
float aw_D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (AW_PI * d * d + 1e-6);
}
float aw_V_Smith(float NoV, float NoL, float a) {
  float k = a * 0.5;
  return (NoV / (NoV * (1.0 - k) + k)) * (NoL / (NoL * (1.0 - k) + k)) / max(4.0 * NoV * NoL, 1e-4);
}
vec3 aw_F_Schlick(vec3 f0, float VoH) {
  return f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
}

/** Shadow-side tint: cool lavender-blue, lighter under an open sky. */
vec3 aw_shadowTint(vec3 P) {
  float under = aw_underDeck(P.y);
  return mix(vec3(0.46, 0.50, 0.86), vec3(0.40, 0.44, 0.66), under);
}

vec3 aw_shade(AwSurface s, vec3 P, vec3 V, float sunVis) {
  vec3 N = normalize(s.normal);
  vec3 L = uSunDir;
  float NoLraw = dot(N, L);
  float NoV = max(dot(N, V), 1e-3);
  vec3 H = normalize(L + V);
  float NoH = saturate(dot(N, H));

  // --- Toon ramp: a flat lit tone, a narrow warm terminator, a flat shadow tone.
  float w = s.wrap * 0.6;
  float d = (NoLraw + w) / (1.0 + w);
  float ramp = smoothstep(0.0, 0.16, d);
  float terminator = smoothstep(0.0, 0.1, d) * (1.0 - smoothstep(0.1, 0.32, d));
  float castSh = smoothstep(0.35, 0.65, sunVis);
  float lit = ramp * castSh;

  vec3 albedo = s.albedo * (1.0 - s.metallic * 0.5);
  vec3 amb = aw_ambient(N, P);
  // Flatten the ambient towards its average so shadowed forms read as painted shapes.
  vec3 flatAmb = mix(amb, vec3(dot(amb, vec3(0.333))) * vec3(0.95, 0.97, 1.1), 0.35);
  vec3 shadowCol = albedo * (flatAmb * 1.15 * s.ao) * aw_shadowTint(P) * 1.55;
  vec3 sunLit = albedo * uSunColor * 0.62 * mix(0.85, 1.0, s.ao);
  vec3 col = mix(shadowCol, sunLit + shadowCol * 0.35, lit);
  col += albedo * uSunColor * s.sssColor * terminator * castSh * 0.12;

  // --- Backlit glow through thin surfaces (grass, leaves, cloth, hair).
  if (s.translucency > 0.0) {
    float back = pow(saturate(dot(V, -L)), 2.5);
    col += albedo * s.sssColor * uSunColor * s.translucency * (back * 0.9 + 0.06) * (1.0 - ramp * 0.6) * saturate(sunVis + 0.2);
  }

  // --- Hard stylised highlight.
  if (s.specular > 0.0) {
    float gloss = mix(900.0, 24.0, s.roughness);
    float spec = smoothstep(0.55, 0.62, pow(NoH, gloss)) * (1.0 - s.roughness * 0.75);
    col += uSunColor * spec * lit * s.specular * mix(0.25, 0.8, s.metallic);
  }

  // --- Rim band: a crisp warm outline on the silhouette, strongest when back/side lit.
  if (s.rim > 0.0) {
    float fres = smoothstep(0.62, 0.8, 1.0 - NoV);
    float backlit = saturate(dot(-V, L) * 0.6 + 0.55);
    col += uSunColor * vec3(1.0, 0.86, 0.7) * fres * backlit * s.rim * 0.16 * saturate(sunVis + 0.25);
    col += flatAmb * fres * s.rim * 0.18;
  }

  col += s.emissive;
  return col;
}

#endif
