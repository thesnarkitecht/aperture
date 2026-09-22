import * as THREE from 'three';

/**
 * Uniforms shared by every custom shader in the project. Materials reference
 * these objects directly, so updating `.value` once per frame updates all of them.
 */
const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
white.needsUpdate = true;

export const shared = {
  uTime: { value: 0 },
  /** Screen-space ambient occlusion from the GTAO pre-pass (white when disabled). */
  tSSAO: { value: white as THREE.Texture },
  /** 0 disables SSAO sampling (e.g. while baking reflection probes). */
  uSSAOStrength: { value: 1 },
  /** Size of the beauty render target in physical pixels. */
  uResolution: { value: new THREE.Vector2(1, 1) },
};

export const whiteTexture = white;

/** Render layer for additive / transparent effects that must not write to the AO G-buffer. */
export const FX_LAYER = 1;

/** Deterministic PRNG (mulberry32) so the ship is identical on every load. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo: number, hi: number) => lo + (hi - lo) * next(),
    int: (lo: number, hi: number) => Math.floor(lo + (hi - lo + 1) * next()),
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}
export type Rng = ReturnType<typeof rng>;

/** Cheap deterministic 1D noise in [0, 1], used for flicker and pulses. */
export function noise1(x: number) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
