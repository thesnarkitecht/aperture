import type { ZoneDef } from '../engine/zones';
import type { DoorDef } from './doors';

/**
 * CSV Perihelion general arrangement (meters). +X starboard, +Y up, -Z forward (bow).
 *
 *            bow
 *        ┌─────────┐
 *        │ BRIDGE  │                z -28.5 .. -18
 *   ┌────┴──┬───┬──┴────┐
 *   │QUARTRS│ C │ GALLEY│           z -18 .. -7 / -6
 *   ├───────┤ O ├───────┤
 *   │AIRLOCK│ R │  LIFE │           z -7 .. -2.5 / -6 .. 6
 *   ├───────┤ R │SUPPORT│
 *   │MEDBAY │   │       │           z -2.5 .. 6
 *   └─┬─────┴───┴─────┬─┘
 *     │   CARGO BAY   │             z 6 .. 24
 *     └┬─────────────┬┘
 *      │ ENGINEERING │              z 24 .. 38
 *      └─────────────┘
 *          engines                  z 38 ..
 */

export const SKIN = 0.12; // interior wall skin thickness
export const HULL = 0.42; // exterior hull skin thickness
export const HULL_BOTTOM = -0.62;
export const EYE = 1.64;

const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [
  [x0, z0],
  [x1, z0],
  [x1, z1],
  [x0, z1],
];

export interface RoomDef extends ZoneDef {
  wallColor: number;
  floor: 'deck' | 'grate' | 'tread' | 'none';
  ceiling: 'panel' | 'none';
  /** Edges (by index) that get no automatic interior skin (custom geometry instead). */
  skipEdges?: number[];
}

export const ROOMS: RoomDef[] = [
  {
    id: 'bridge',
    label: 'Bridge',
    deck: 'Deck A · Frame 02',
    poly: [
      [-6.5, -18],
      [6.5, -18],
      [4.5, -28.5],
      [-4.5, -28.5],
    ],
    floorY: 0,
    ceilY: 3.3,
    ambient: { sky: 0x3a5a78, ground: 0x1a1410, intensity: 0.45 },
    exposure: 1.4,
    fog: 0.012,
    fogColor: 0x0a1016,
    probe: [0, 1.7, -22],
    windows: true,
    wallColor: 0x6d7378,
    floor: 'deck',
    ceiling: 'none',
    skipEdges: [2],
  },
  {
    id: 'corridor',
    label: 'Main Corridor',
    deck: 'Deck A · Spine',
    poly: rect(-1.3, -18, 1.3, 6),
    floorY: 0,
    ceilY: 2.75,
    ambient: { sky: 0x6a7a88, ground: 0x2a2622, intensity: 0.4 },
    exposure: 1.05,
    fog: 0.02,
    fogColor: 0x10151a,
    probe: [0, 1.6, -6],
    wallColor: 0x8a9096,
    floor: 'grate',
    ceiling: 'none',
  },
  {
    id: 'quarters',
    label: 'Crew Quarters',
    deck: 'Deck A · Port Forward',
    poly: rect(-9, -18, -1.3, -7),
    floorY: 0,
    ceilY: 2.8,
    ambient: { sky: 0x6a5a48, ground: 0x2a2018, intensity: 0.4 },
    exposure: 1.2,
    fog: 0.015,
    fogColor: 0x15110d,
    probe: [-5, 1.5, -12.5],
    windows: true,
    wallColor: 0x8c8474,
    floor: 'deck',
    ceiling: 'panel',
  },
  {
    id: 'airlock',
    label: 'Airlock · EVA Prep',
    deck: 'Deck A · Port Midship',
    poly: rect(-9, -7, -1.3, -2.5),
    floorY: 0,
    ceilY: 2.8,
    ambient: { sky: 0x70685a, ground: 0x2a2218, intensity: 0.35 },
    exposure: 1.1,
    fog: 0.02,
    fogColor: 0x15120e,
    probe: [-5, 1.5, -4.75],
    wallColor: 0x80868a,
    floor: 'tread',
    ceiling: 'panel',
  },
  {
    id: 'medbay',
    label: 'Medical Bay',
    deck: 'Deck A · Port Aft',
    poly: rect(-9, -2.5, -1.3, 6),
    floorY: 0,
    ceilY: 2.8,
    ambient: { sky: 0x8aa0b0, ground: 0x303438, intensity: 0.45 },
    exposure: 1.0,
    fog: 0.01,
    fogColor: 0x121820,
    probe: [-5, 1.5, 1.5],
    wallColor: 0xb4bcc0,
    floor: 'deck',
    ceiling: 'panel',
  },
  {
    id: 'galley',
    label: 'Galley · Mess',
    deck: 'Deck A · Starboard Forward',
    poly: rect(1.3, -18, 9, -6),
    floorY: 0,
    ceilY: 2.8,
    ambient: { sky: 0x7a6650, ground: 0x2e2218, intensity: 0.4 },
    exposure: 1.15,
    fog: 0.012,
    fogColor: 0x16110c,
    probe: [5, 1.5, -12],
    windows: true,
    wallColor: 0x8e8878,
    floor: 'deck',
    ceiling: 'panel',
  },
  {
    id: 'lifesupport',
    label: 'Life Support',
    deck: 'Deck A · Starboard Aft',
    poly: rect(1.3, -6, 9, 6),
    floorY: 0,
    ceilY: 2.8,
    ambient: { sky: 0x4a6a60, ground: 0x1c2420, intensity: 0.35 },
    exposure: 1.2,
    fog: 0.025,
    fogColor: 0x0d1512,
    probe: [5, 1.5, 0],
    wallColor: 0x6e7a76,
    floor: 'grate',
    ceiling: 'panel',
  },
  {
    id: 'cargo',
    label: 'Cargo Bay',
    deck: 'Deck A–B · Hold 1',
    poly: rect(-8, 6, 8, 24),
    floorY: 0,
    ceilY: 7,
    ambient: { sky: 0x6a5a48, ground: 0x2a2018, intensity: 0.35 },
    exposure: 1.15,
    fog: 0.018,
    fogColor: 0x14100c,
    probe: [0, 2.5, 15],
    wallColor: 0x7c7a72,
    floor: 'deck',
    ceiling: 'panel',
  },
  {
    id: 'engineering',
    label: 'Engineering',
    deck: 'Deck A–B · Reactor Room',
    poly: rect(-7, 24, 7, 38),
    floorY: 0,
    ceilY: 6,
    ambient: { sky: 0x3a5a70, ground: 0x1a1a1c, intensity: 0.3 },
    exposure: 1.0,
    fog: 0.01,
    fogColor: 0x0a1014,
    probe: [0, 2, 28],
    wallColor: 0x5c6268,
    floor: 'deck',
    ceiling: 'panel',
  },
];

export const DOORS: DoorDef[] = [
  { id: 'bridge', x: 0, z: -18, wall: 'z', width: 1.6, height: 2.3, zones: ['bridge', 'corridor'], labels: ['CORRIDOR', 'BRIDGE'] },
  { id: 'quarters', x: -1.3, z: -12.5, wall: 'x', width: 1.3, height: 2.2, zones: ['quarters', 'corridor'], labels: ['CORRIDOR', 'CREW QUARTERS'] },
  { id: 'airlock', x: -1.3, z: -4.75, wall: 'x', width: 1.4, height: 2.2, zones: ['airlock', 'corridor'], labels: ['CORRIDOR', 'AIRLOCK · EVA'] },
  { id: 'medbay', x: -1.3, z: 1.6, wall: 'x', width: 1.4, height: 2.2, zones: ['medbay', 'corridor'], labels: ['CORRIDOR', 'MEDICAL'] },
  { id: 'galley', x: 1.3, z: -12, wall: 'x', width: 1.4, height: 2.2, zones: ['corridor', 'galley'], labels: ['GALLEY · MESS', 'CORRIDOR'] },
  { id: 'lifesupport', x: 1.3, z: 0.5, wall: 'x', width: 1.3, height: 2.2, zones: ['corridor', 'lifesupport'], labels: ['LIFE SUPPORT', 'CORRIDOR'] },
  { id: 'cargo', x: 0, z: 6, wall: 'z', width: 2.2, height: 2.5, zones: ['corridor', 'cargo'], labels: ['CARGO BAY', 'HAB DECK'] },
  { id: 'engineering', x: 0, z: 24, wall: 'z', width: 2.0, height: 2.5, zones: ['cargo', 'engineering'], labels: ['ENGINEERING', 'CARGO BAY'], radius: 4.2 },
  {
    id: 'hatch',
    x: -9,
    z: -4.75,
    wall: 'x',
    width: 1.3,
    height: 2.1,
    zones: ['exterior', 'airlock'],
    kind: 'hatch',
    labels: [null, 'OUTER HATCH'],
    depth: [HULL, SKIN],
    radius: 0,
  },
];

export interface WindowDef {
  /** Centre point on the wall line (x, z). */
  x: number;
  z: number;
  /** Unit direction along the wall. */
  dir: [number, number];
  width: number;
  y0: number;
  y1: number;
  room: string;
  mullions?: number;
}

const bridgeSide = (sx: number) => {
  // Mid-point of the angled side wall from (±6.5,-18) to (±4.5,-28.5).
  const ax = 6.5 * sx, az = -18, bx = 4.5 * sx, bz = -28.5;
  const len = Math.hypot(bx - ax, bz - az);
  return { x: (ax + bx) / 2 - (bx - ax) * 0.1, z: (az + bz) / 2 - (bz - az) * 0.1, dir: [(bx - ax) / len, (bz - az) / len] as [number, number] };
};

export const WINDOWS: WindowDef[] = [
  { ...bridgeSide(-1), width: 5.4, y0: 1.15, y1: 2.65, room: 'bridge', mullions: 3 },
  { ...bridgeSide(1), width: 5.4, y0: 1.15, y1: 2.65, room: 'bridge', mullions: 3 },
  { x: -9, z: -15.4, dir: [0, 1], width: 1.0, y0: 1.25, y1: 1.85, room: 'quarters' },
  { x: -9, z: -10.2, dir: [0, 1], width: 1.0, y0: 1.25, y1: 1.85, room: 'quarters' },
  { x: 9, z: -15.3, dir: [0, 1], width: 2.3, y0: 1.0, y1: 2.05, room: 'galley', mullions: 1 },
  { x: 9, z: -12.0, dir: [0, 1], width: 2.3, y0: 1.0, y1: 2.05, room: 'galley', mullions: 1 },
  { x: 9, z: -8.7, dir: [0, 1], width: 2.3, y0: 1.0, y1: 2.05, room: 'galley', mullions: 1 },
];

export interface HullModule {
  id: string;
  poly: [number, number][];
  roof: number;
  /** Edges with custom exterior geometry. */
  skipEdges?: number[];
}

export const HULL_MODULES: HullModule[] = [
  { id: 'bridge', poly: ROOMS[0].poly, roof: 3.85, skipEdges: [2] },
  { id: 'hab', poly: rect(-9, -18, 9, 6), roof: 3.45 },
  { id: 'cargo', poly: rect(-8, 6, 8, 24), roof: 7.6 },
  { id: 'engineering', poly: rect(-7, 24, 7, 38), roof: 6.6 },
];
