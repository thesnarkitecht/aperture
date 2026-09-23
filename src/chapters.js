// Scroll choreography: one camera key per screen. `s` runs 0 → keys.length - 1.
// t = look-at target (mm), d = distance (mm), az / el = orbit angles (deg),
// orbit = extra azimuth swept while scrolling through that key.
export const keys = [
  { name: 'hero',        t: [3, 0, 8],      d: 340,  az: -32,  el: 14 },
  { name: 'lens',        t: [6, -4, 64],    d: 480,  az: 52,   el: 10 },
  { name: 'optics',      t: [10, -7, 132],  d: 420,  az: 90,   el: 5 },
  { name: 'iris',        t: [10, -65, 128], d: 140,  az: 14,   el: 6 },
  { name: 'topPlate',    t: [2, 70, 0],     d: 520,  az: -30,  el: 30 },
  { name: 'rangefinder', t: [8, 86, 0],     d: 470,  az: 30,   el: 20 },
  { name: 'rear',        t: [0, 14, -56],   d: 560,  az: 146,  el: 16 },
  { name: 'internals',   t: [0, 10, -62],   d: 470,  az: 132,  el: 18 },
  { name: 'base',        t: [12, -80, -6],  d: 470,  az: -38,  el: -24 },
  { name: 'exploded',    t: [0, 24, 24],    d: 900,  az: -40,  el: 18, orbit: 60 },
  { name: 'assembled',   t: [3, 0, 8],      d: 350,  az: 28,   el: 12 },
];
