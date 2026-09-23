// Scroll choreography: one camera key per screen. `s` runs 0 → keys.length - 1.
// t = look-at target (mm), d = distance (mm), az / el = orbit angles (deg),
// orbit = extra azimuth swept while scrolling through that key.
export const keys = [
  { name: 'hero',        t: [0, -2, 6],     d: 330,  az: -32,  el: 14 },
  { name: 'lens',        t: [0, -6, 62],    d: 470,  az: 52,   el: 10 },
  { name: 'optics',      t: [0, -9, 128],   d: 400,  az: 90,   el: 5 },
  { name: 'iris',        t: [0, -67, 126],  d: 140,  az: 14,   el: 6 },
  { name: 'topPlate',    t: [0, 62, 0],     d: 500,  az: -30,  el: 30 },
  { name: 'rangefinder', t: [2, 78, 0],     d: 450,  az: 30,   el: 20 },
  { name: 'chassis',     t: [0, 4, -26],    d: 560,  az: 140,  el: 16 },
  { name: 'shutter',     t: [0, 16, -48],   d: 290,  az: 156,  el: 24 },
  { name: 'film',        t: [0, -58, -12],  d: 500,  az: -142, el: 14 },
  { name: 'exploded',    t: [0, 30, 40],    d: 840,  az: -40,  el: 18, orbit: 60 },
  { name: 'assembled',   t: [0, -2, 6],     d: 340,  az: 28,   el: 12 },
];
