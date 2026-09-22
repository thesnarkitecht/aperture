/**
 * World-scale constants. Units are meters, Y is up.
 *
 *   ~1660 m  starting floating island plateau
 *   1250 m   cloud-deck tops (billows reach a little higher)
 *    840 m   cloud-deck base
 *     50 m   water level of the world below
 */
import * as THREE from 'three';
import { DEG } from '../core/math';

export const ISLAND_Y = 1650;
export const CLOUD_BASE = 840;
export const CLOUD_TOP = 1260;
export const WATER_LEVEL = 50;

/** Sun: low golden-hour sun. Azimuth measured from -Z towards +X. */
export const SUN_ELEVATION = 4.6 * DEG;
export const SUN_AZIMUTH = 14 * DEG;
export const SUN_DIR = new THREE.Vector3(
  Math.sin(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
  Math.sin(SUN_ELEVATION),
  -Math.cos(SUN_AZIMUTH) * Math.cos(SUN_ELEVATION),
).normalize();

/** Direct sun radiance (linear HDR) — warm, reddened by the long atmospheric path. */
export const SUN_COLOR = new THREE.Color(1.0, 0.56, 0.27).multiplyScalar(7.5);

/** Centre of the distant-world heightmap: under the glide path, towards the sun. */
export const TERRAIN_CENTER = new THREE.Vector2(SUN_DIR.x, SUN_DIR.z).normalize().multiplyScalar(6500);
export const TERRAIN_SIZE = 72000; // meters covered by the heightmap (square)

/** Prevailing wind, blowing roughly across the run path. */
export const WIND_DIR = new THREE.Vector3(0.85, 0, 0.52).normalize();
