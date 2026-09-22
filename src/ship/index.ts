import * as THREE from 'three';
import { Batcher } from '../engine/batcher';
import type { LightPool } from '../engine/lightPool';
import { FX_LAYER } from '../engine/shared';
import { EXTERIOR, Zones } from '../engine/zones';
import type { Materials } from '../materials/library';
import { createScreenMaterial } from '../materials/screens';
import { CollisionWorld } from '../player/collision';
import { Door } from './doors';
import { Builder, type ShipContext } from './kit';
import { DOORS, ROOMS } from './layout';
import { SignAtlas } from './signs';
import { buildStructure } from './structure';
import { buildCorridor } from './rooms/corridor';
import { buildBridge } from './rooms/bridge';
import { buildAirlock } from './rooms/airlock';
import { buildQuarters } from './rooms/quarters';
import { buildGalley } from './rooms/galley';
import { buildMedbay } from './rooms/medbay';
import { buildLifeSupport } from './rooms/lifesupport';
import { buildCargo } from './rooms/cargo';
import { buildEngineering } from './rooms/engineering';
import { buildExterior } from './exterior';

export interface Ship {
  ctx: ShipContext;
  zones: Zones;
  doors: Door[];
  collision: CollisionWorld;
  animators: ShipContext['animators'];
  stats: { pieces: number; meshes: number; triangles: number };
}

function patchSignMaterial(m: THREE.MeshStandardMaterial) {
  m.polygonOffset = true;
  m.polygonOffsetFactor = -2;
  m.polygonOffsetUnits = -2;
  return m;
}

export function buildShip(M: Materials, lights: LightPool, onStep?: (label: string) => void): Ship {
  const zones = new Zones();
  for (const room of ROOMS) zones.add(room);
  const signs = new SignAtlas();
  const signMat = patchSignMaterial(
    new THREE.MeshStandardMaterial({ name: 'sign', map: signs.texture, alphaTest: 0.45, roughness: 0.62, metalness: 0.05, vertexColors: true }),
  );
  signMat.userData.uvMode = 'keep';
  signMat.userData.castShadow = false;
  const signGlowMat = new THREE.MeshBasicMaterial({ name: 'sign-glow', map: signs.texture, alphaTest: 0.45, vertexColors: true });
  signGlowMat.userData.uvMode = 'keep';
  signGlowMat.userData.castShadow = false;

  const ctx: ShipContext = {
    M,
    screen: createScreenMaterial(),
    signMat,
    signGlowMat,
    batcher: new Batcher(),
    lights,
    collision: new CollisionWorld(),
    zones,
    signs,
    doors: [],
    animators: [],
  };
  const b = new Builder(ctx);

  const steps: [string, (b: Builder) => void][] = [
    ['Framing hull and bulkheads', buildStructure],
    ['Outfitting main corridor', buildCorridor],
    ['Outfitting bridge', buildBridge],
    ['Outfitting airlock', buildAirlock],
    ['Outfitting crew quarters', buildQuarters],
    ['Outfitting galley', buildGalley],
    ['Outfitting medical bay', buildMedbay],
    ['Outfitting life support', buildLifeSupport],
    ['Outfitting cargo bay', buildCargo],
    ['Outfitting engineering', buildEngineering],
    ['Plating exterior', buildExterior],
  ];
  for (const [label, fn] of steps) {
    onStep?.(label);
    fn(b);
  }

  // Doors: static frames go into the batches; leaves are live objects.
  for (const def of DOORS) {
    const door = new Door(def, ctx).build();
    ctx.doors.push(door);
    zones.root.add(door.group);
    zones.link(def.zones[0], def.zones[1], () => door.open);
  }

  onStep?.('Merging geometry');
  signs.finalize();
  const meshes = ctx.batcher.build();
  let triangles = 0;
  for (const mesh of meshes) {
    const zone = (mesh.userData.zone as string) ?? EXTERIOR;
    if ((mesh.material as THREE.Material).userData.fx) mesh.layers.set(FX_LAYER);
    zones.addObject(zone, mesh);
    const idx = mesh.geometry.index;
    triangles += (idx ? idx.count : mesh.geometry.getAttribute('position').count) / 3;
  }
  ctx.collision.finalize();

  return {
    ctx,
    zones,
    doors: ctx.doors,
    collision: ctx.collision,
    animators: ctx.animators,
    stats: { pieces: ctx.batcher.pieceCount, meshes: meshes.length, triangles: Math.round(triangles) },
  };
}
