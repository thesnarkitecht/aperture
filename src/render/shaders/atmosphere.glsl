// ---------------------------------------------------------------------------------------------
// aw_atmosphere — sky lookup, aerial perspective and altitude-aware ambient lighting.
// The sky radiance is precomputed into a lat-long LUT (see SkyLUT.ts), so every shader can
// fetch physically-inspired sky colour for fog, reflections and ambient at the cost of one tap.
// ---------------------------------------------------------------------------------------------
#ifndef AW_ATMOSPHERE
#define AW_ATMOSPHERE

uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform sampler2D uSkyLUT;
uniform vec4 uFog;          // x: density at sea level, y: height falloff, z: haze boost, w: sun glow
uniform vec3 uFogExtinction;// per-channel extinction weights
uniform vec2 uCloudLayer;   // x: base, y: top
uniform vec3 uAmbSkyAbove;
uniform vec3 uAmbGroundAbove;
uniform vec3 uAmbSkyBelow;
uniform vec3 uAmbGroundBelow;
uniform float uTime;

vec2 aw_skyUV(vec3 dir) {
  float az = atan(dir.x, -dir.z);
  float el = asin(clamp(dir.y, -1.0, 1.0));
  float v = 0.5 + 0.5 * sign(el) * sqrt(abs(el) / (AW_PI * 0.5));
  return vec2(az / AW_TAU + 0.5, v);
}

vec3 aw_sky(vec3 dir) {
  return texture(uSkyLUT, aw_skyUV(dir)).rgb;
}

/** 0 above the cloud deck, 1 below it (smooth through the layer). */
float aw_underDeck(float y) {
  return 1.0 - smoothstep(uCloudLayer.x - 60.0, uCloudLayer.y - 120.0, y);
}

/** Colour of in-scattered light along a view ray: horizon sky in that azimuth plus forward sun glow. */
vec3 aw_fogColor(vec3 rd, float camY) {
  vec3 d = normalize(vec3(rd.x, max(rd.y, 0.0) * 0.35 + 0.015, rd.z));
  vec3 c = aw_sky(d);
  float mu = dot(rd, uSunDir);
  c += uSunColor * (aw_hg(mu, 0.72) * 0.25 + aw_hg(mu, 0.2) * 0.06) * uFog.w;
  // Beneath the deck the sky is shaded by cloud; only the sunward haze stays luminous.
  float under = aw_underDeck(camY);
  float sunward = smoothstep(-0.2, 0.9, mu);
  c *= mix(1.0, mix(0.42, 0.95, sunward), under);
  return c;
}

/** Optical depth of exponential height fog between ro and ro + rd*dist (analytic integral). */
float aw_fogDepth(vec3 ro, vec3 rd, float dist) {
  float b = uFog.y;
  float k = rd.y * dist * b;
  float integral = abs(k) > 1e-4 ? (1.0 - exp(-k)) / k : 1.0;
  float od = uFog.x * exp(-ro.y * b) * dist * integral;
  // A thin extra haze layer hugging the cloud sea and valleys increases depth cues.
  return od * (1.0 + uFog.z);
}

vec3 aw_applyAerial(vec3 color, vec3 ro, vec3 rd, float dist) {
  float od = aw_fogDepth(ro, rd, dist);
  vec3 T = exp(-od * uFogExtinction);
  return color * T + aw_fogColor(rd, ro.y) * (1.0 - T);
}

/** Fog transmittance only (for effects that composite over already-fogged backgrounds). */
vec3 aw_aerialT(vec3 ro, vec3 rd, float dist) {
  return exp(-aw_fogDepth(ro, rd, dist) * uFogExtinction);
}

/**
 * Hemispherical ambient that knows about the cloud sea: above the deck the "ground" is a
 * brilliant sunlit cloud floor (strong warm bounce), beneath it the sky is an overcast ceiling.
 */
vec3 aw_ambient(vec3 n, vec3 p) {
  float under = aw_underDeck(p.y);
  vec3 sky = mix(uAmbSkyAbove, uAmbSkyBelow, under);
  vec3 ground = mix(uAmbGroundAbove, uAmbGroundBelow, under);
  float t = n.y * 0.5 + 0.5;
  vec3 amb = mix(ground, sky, t * t * (3.0 - 2.0 * t));
  // The sunward half of the sky is brighter at golden hour.
  vec3 sh = normalize(vec3(uSunDir.x, 0.25, uSunDir.z));
  amb *= 1.0 + 0.35 * max(dot(n, sh), 0.0) * (1.0 - under * 0.5);
  return amb;
}

#endif
