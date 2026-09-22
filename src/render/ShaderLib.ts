/**
 * Registers the shared GLSL library as three.js shader chunks so any ShaderMaterial can use
 * `#include <aw_common>`, `<aw_atmosphere>`, `<aw_lighting>`, `<aw_shadows>`, `<aw_clouds>`.
 * Also owns the global uniform objects shared (by reference) across all materials.
 */
import * as THREE from 'three';
import common from './shaders/common.glsl?raw';
import atmosphere from './shaders/atmosphere.glsl?raw';
import lighting from './shaders/lighting.glsl?raw';
import shadows from './shaders/shadows.glsl?raw';
import clouds from './shaders/clouds.glsl?raw';
import { CLOUD_BASE, CLOUD_TOP, SUN_COLOR, SUN_DIR } from '../world/WorldConfig';

const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
chunks.aw_common = common;
chunks.aw_atmosphere = atmosphere;
chunks.aw_lighting = lighting;
chunks.aw_shadows = shadows;
chunks.aw_clouds = clouds;

/** Global uniforms. Materials spread these into their own uniform maps (same objects). */
export const G = {
  uTime: { value: 0 },
  uSunDir: { value: SUN_DIR.clone() },
  uSunColor: { value: new THREE.Vector3(SUN_COLOR.r, SUN_COLOR.g, SUN_COLOR.b) },
  uSkyLUT: { value: null as THREE.Texture | null },
  uFog: { value: new THREE.Vector4(0.00011, 1 / 1400, 0.0, 1.0) },
  uFogExtinction: { value: new THREE.Vector3(0.8, 0.95, 1.2) },
  uCloudLayer: { value: new THREE.Vector2(CLOUD_BASE, CLOUD_TOP) },
  uAmbSkyAbove: { value: new THREE.Vector3(0.32, 0.36, 0.55) },
  uAmbGroundAbove: { value: new THREE.Vector3(0.55, 0.42, 0.36) },
  uAmbSkyBelow: { value: new THREE.Vector3(0.2, 0.22, 0.32) },
  uAmbGroundBelow: { value: new THREE.Vector3(0.08, 0.08, 0.07) },
  // shadows
  uShadowMap0: { value: null as THREE.Texture | null },
  uShadowMap1: { value: null as THREE.Texture | null },
  uShadowMatrix0: { value: new THREE.Matrix4() },
  uShadowMatrix1: { value: new THREE.Matrix4() },
  uShadowTexel: { value: new THREE.Vector4(1 / 2048, 1 / 4096, 0.02, 0.1) },
  uShadowRadius: { value: new THREE.Vector2(1.8, 1.4) },
  uShadowEnabled: { value: 1 },
  // clouds
  uWeather: { value: null as THREE.Texture | null },
  uNoise2D: { value: null as THREE.Texture | null },
  uIslandXZ: { value: new THREE.Vector2(0, 0) },
  uSunXZ: { value: new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize() },
  uCloudWind: { value: new THREE.Vector2(0, 0) },
  // wind / interaction
  uWind: { value: new THREE.Vector4(0.85, 0.52, 1.0, 0) }, // xy dir, z strength, w gust time
  uPlayerPos: { value: new THREE.Vector3() },
};

export type SharedUniforms = typeof G;

/** Spread the global uniforms into a material's uniform map. */
export function withGlobals(u: Record<string, THREE.IUniform> = {}): Record<string, THREE.IUniform> {
  return { ...G, ...u } as Record<string, THREE.IUniform>;
}
