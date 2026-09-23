// ---------------------------------------------------------------------------------------------
// aw_clouds — cloud-sea coverage field shared by the raymarcher and by cloud-shadow lookups.
// Layout: a vast dense sea under the island; a rift opens towards the setting sun so the sun
// can shine beneath the deck during the glide; far towards the sun the sea breaks into towers.
// ---------------------------------------------------------------------------------------------
#ifndef AW_CLOUDS
#define AW_CLOUDS

uniform sampler2D uWeather;
uniform vec2 uIslandXZ;
uniform vec2 uSunXZ;
uniform vec2 uCloudWind;

float aw_cloudCoverage(vec2 xz, out float tower) {
  vec2 rel = xz - uIslandXZ;
  float along = dot(rel, uSunXZ);
  float side = dot(rel, vec2(-uSunXZ.y, uSunXZ.x));
  vec4 w = texture(uWeather, (xz + uCloudWind) / 14000.0);
  vec4 w2 = texture(uWeather, (xz + uCloudWind * 1.3) / 3800.0 + 0.37);
  float n = w.r * 0.55 + w2.g * 0.45;
  float cov = 0.58 + 0.5 * (n - 0.5) * 1.6;
  // Dense directly under the island so the dive always passes through cloud.
  float r = length(rel - uSunXZ * 200.0);
  cov = max(cov, 0.8 * (1.0 - smoothstep(500.0, 1300.0, r)));
  // Rift towards the sun.
  float wob = (w2.b - 0.5) * 500.0;
  float halfW = 300.0 + max(along, 0.0) * 0.14;
  float rift = smoothstep(650.0, 1300.0, along) * (1.0 - smoothstep(halfW * 0.55, halfW * 1.25, abs(side + wob)));
  tower = smoothstep(halfW * 2.2, halfW * 1.0, abs(side + wob)) * smoothstep(500.0, 1500.0, along) * (1.0 - rift);
  cov = mix(cov, cov * 0.05, rift);
  // Far sunward: scattered towers.
  float far = smoothstep(9000.0, 18000.0, along);
  cov = mix(cov, cov * (0.35 + 0.65 * w2.g), far);
  return clamp(cov, 0.0, 1.0);
}

float aw_cloudTop(float cov, float tower) {
  return mix(uCloudLayer.x + 150.0, uCloudLayer.y, cov) + tower * 260.0;
}

/** Sun transmittance through the cloud layer at a world position (coarse, 5 taps). */
float aw_cloudShadow(vec3 p) {
  if (p.y > uCloudLayer.y + 300.0) return 1.0;
  float t0 = max(0.0, (uCloudLayer.x - p.y) / uSunDir.y);
  float t1 = max(t0, (uCloudLayer.y + 150.0 - p.y) / uSunDir.y);
  float od = 0.0;
  for (int i = 0; i < 5; i++) {
    float t = mix(t0, t1, (float(i) + 0.5) / 5.0);
    vec3 q = p + uSunDir * t;
    float tw;
    float cov = aw_cloudCoverage(q.xz, tw);
    float top = aw_cloudTop(cov, tw);
    float inside = step(q.y, top) * step(uCloudLayer.x, q.y);
    od += smoothstep(0.42, 0.75, cov) * inside;
  }
  return exp(-od * 1.4);
}

#endif
