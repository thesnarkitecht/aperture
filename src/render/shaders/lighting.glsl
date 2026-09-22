// ---------------------------------------------------------------------------------------------
// aw_lighting — stylised physically based shading shared by every lit surface.
//   * GGX specular with Smith visibility and Schlick fresnel
//   * wrapped diffuse with a subsurface tint (skin, foliage, cloth)
//   * thin-surface translucency for backlit leaves, grass and fabric
//   * warm sun rim light that makes silhouettes glow against the sunset
// ---------------------------------------------------------------------------------------------
#ifndef AW_LIGHTING
#define AW_LIGHTING

struct AwSurface {
  vec3 albedo;
  vec3 normal;
  float roughness;
  float metallic;
  float ao;
  float wrap;          // 0 = lambert, ~0.5 = soft wrap (skin/foliage)
  vec3 sssColor;       // tint of light that wraps into the terminator
  float translucency;  // 0..1 thin-surface transmission
  float rim;           // rim light strength multiplier
  float specular;      // specular scale (0 disables)
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

float aw_D_GGX(float NoH, float a) {
  float a2 = a * a;
  float d = NoH * NoH * (a2 - 1.0) + 1.0;
  return a2 / (AW_PI * d * d + 1e-6);
}

float aw_V_Smith(float NoV, float NoL, float a) {
  float k = a * 0.5;
  float gv = NoV / (NoV * (1.0 - k) + k);
  float gl = NoL / (NoL * (1.0 - k) + k);
  return gv * gl / max(4.0 * NoV * NoL, 1e-4);
}

vec3 aw_F_Schlick(vec3 f0, float VoH) {
  return f0 + (1.0 - f0) * pow(1.0 - VoH, 5.0);
}

/**
 * Full lighting for one surface point. `sunVis` combines shadow maps, cloud shadow and
 * terrain self-shadowing. Returns outgoing radiance (before aerial perspective).
 */
vec3 aw_shade(AwSurface s, vec3 P, vec3 V, float sunVis) {
  vec3 N = normalize(s.normal);
  vec3 L = uSunDir;
  vec3 H = normalize(L + V);
  float NoLraw = dot(N, L);
  float NoL = saturate(NoLraw);
  float NoV = max(dot(N, V), 1e-3);
  float NoH = saturate(dot(N, H));
  float VoH = saturate(dot(V, H));

  vec3 f0 = mix(vec3(0.04), s.albedo, s.metallic);
  vec3 diffAlbedo = s.albedo * (1.0 - s.metallic);

  // Wrapped diffuse: energy-normalised, with the wrap zone tinted by the SSS colour.
  float w = s.wrap;
  float wrapped = saturate((NoLraw + w) / ((1.0 + w) * (1.0 + w)));
  vec3 diffuseTerm = mix(s.sssColor * wrapped, vec3(NoL), NoL) ;
  vec3 direct = diffAlbedo * diffuseTerm / AW_PI;

  // Specular
  float a = max(s.roughness * s.roughness, 0.002);
  vec3 F = aw_F_Schlick(f0, VoH);
  vec3 spec = aw_D_GGX(NoH, a) * aw_V_Smith(NoV, NoL, a) * F * NoL * s.specular;

  vec3 sun = uSunColor * sunVis;
  vec3 col = (direct + spec) * sun * AW_PI;

  // Thin-surface transmission (light passing through leaves / fabric towards the viewer).
  if (s.translucency > 0.0) {
    float back = pow(saturate(dot(V, -L)), 3.0);
    float thin = saturate(-NoLraw * 0.6 + 0.4);
    col += s.albedo * s.sssColor * uSunColor * sunVis * s.translucency * (back * 1.6 + 0.12) * thin;
  }

  // Ambient: altitude-aware hemisphere + a cheap specular sky reflection.
  vec3 amb = aw_ambient(N, P);
  col += diffAlbedo * amb * s.ao;
  vec3 R = reflect(-V, N);
  vec3 envF = f0 + (max(vec3(1.0 - s.roughness), f0) - f0) * pow(1.0 - NoV, 5.0);
  vec3 env = aw_sky(normalize(vec3(R.x, abs(R.y) * 0.6 + 0.05, R.z))) * mix(1.0, 0.45, aw_underDeck(P.y));
  col += env * envF * s.ao * s.specular * (1.0 - s.roughness * 0.7);

  // Rim: silhouettes catch the low sun when back- or side-lit.
  if (s.rim > 0.0) {
    float fres = pow(1.0 - NoV, 3.0);
    float backlit = saturate(dot(-V, L) * 0.5 + 0.55);
    float facing = saturate(dot(N, normalize(L - V * dot(L, V))) * 0.5 + 0.5);
    col += uSunColor * sunVis * fres * backlit * facing * s.rim * 0.35;
    col += amb * fres * s.rim * 0.25;
  }

  col += s.emissive;
  return col;
}

#endif
