/**
 * Humanoid skeleton definition. Character space: feet at the origin, facing +Z, +X = left.
 * Bind pose has identity local rotations: the spine chain points up (+Y), limbs hang down.
 *
 * Rotation conventions used by the animator:
 *   spine/neck/head: Euler 'YXZ' — +X pitches forward, +Y yaws left, +Z rolls.
 *   limbs:           Euler 'ZXY' — −X swings a limb forward, +Z abducts the LEFT limb outward.
 *   knee/elbow:      shin +X flexes the knee; forearm −X flexes the elbow.
 */
import * as THREE from 'three';

export const B = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5,
  shoulderL: 6, upperArmL: 7, forearmL: 8, handL: 9,
  shoulderR: 10, upperArmR: 11, forearmR: 12, handR: 13,
  thighL: 14, shinL: 15, footL: 16, toeL: 17,
  thighR: 18, shinR: 19, footR: 20, toeR: 21,
} as const;
export const BONE_COUNT = 22;

interface BoneDef {
  name: string;
  parent: number;
  offset: [number, number, number];
}

const L = (x: number) => x;
const R = (x: number) => -x;

export const BONES: BoneDef[] = [
  { name: 'root', parent: -1, offset: [0, 0, 0] },
  { name: 'hips', parent: 0, offset: [0, 0.93, 0] },
  { name: 'spine', parent: 1, offset: [0, 0.1, 0] },
  { name: 'chest', parent: 2, offset: [0, 0.2, 0] },
  { name: 'neck', parent: 3, offset: [0, 0.21, 0.0] },
  { name: 'head', parent: 4, offset: [0, 0.08, 0.01] },
  { name: 'shoulderL', parent: 3, offset: [L(0.035), 0.165, -0.01] },
  { name: 'upperArmL', parent: 6, offset: [L(0.15), -0.02, 0] },
  { name: 'forearmL', parent: 7, offset: [L(0.02), -0.27, 0] },
  { name: 'handL', parent: 8, offset: [L(0.008), -0.245, 0.01] },
  { name: 'shoulderR', parent: 3, offset: [R(0.035), 0.165, -0.01] },
  { name: 'upperArmR', parent: 10, offset: [R(0.15), -0.02, 0] },
  { name: 'forearmR', parent: 11, offset: [R(0.02), -0.27, 0] },
  { name: 'handR', parent: 12, offset: [R(0.008), -0.245, 0.01] },
  { name: 'thighL', parent: 1, offset: [L(0.095), -0.03, 0] },
  { name: 'shinL', parent: 14, offset: [0, -0.41, 0] },
  { name: 'footL', parent: 15, offset: [0, -0.4, -0.01] },
  { name: 'toeL', parent: 16, offset: [0, -0.06, 0.13] },
  { name: 'thighR', parent: 1, offset: [R(0.095), -0.03, 0] },
  { name: 'shinR', parent: 18, offset: [0, -0.41, 0] },
  { name: 'footR', parent: 19, offset: [0, -0.4, -0.01] },
  { name: 'toeR', parent: 20, offset: [0, -0.06, 0.13] },
];

export const THIGH_LEN = 0.41;
export const SHIN_LEN = Math.hypot(0.4, 0.01);

/** Bind-pose world (character-space) positions of every joint. */
export function bindPositions(): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  BONES.forEach((b, i) => {
    const p = new THREE.Vector3(...b.offset);
    if (b.parent >= 0) p.add(out[b.parent]);
    out[i] = p;
  });
  return out;
}

export function createSkeleton(): { bones: THREE.Bone[]; skeleton: THREE.Skeleton } {
  const bones: THREE.Bone[] = BONES.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    bone.position.set(...b.offset);
    return bone;
  });
  BONES.forEach((b, i) => {
    if (b.parent >= 0) bones[b.parent].add(bones[i]);
  });
  bones[0].updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  return { bones, skeleton };
}
