// Key dimensions (mm) of the Leica M11, measured from orthographic product
// photographs (front and top) scaled to the published 139 × 80 mm envelope.
// Axes: +X toward the ISO-dial end (photographer's left), +Y up, +Z out of the lens.
export const D = {
  W: 139,          // body width
  depth: 33.5,     // body shell depth (front skin to rear cover)
  endA: 13,        // the ends are shallow ellipses: semi-axis along X
  leather: 0.7,    // leatherette thickness
  wall: 1.8,       // magnesium wall thickness
  bodyY0: -35.6,   // top of the bottom plate / bottom of the leatherette
  bodyY1: 18.6,    // top of the leatherette / underside of the top plate
  baseY0: -40.4,   // underside of the bottom plate
  plateD: 35.5,    // top-plate depth
  baseD: 34.4,     // bottom-plate depth
  isoY: 32.0,      // lower shoulder at the ISO end (dial seat)
  shoulderY: 35.2, // shoulder carrying the shutter-speed dial and release
  topY1: 40.9,     // raised rangefinder block
  blockX0: -11.2,  // raised block extent
  blockX1: 62.4,
  lensX: 9.8,      // optical axis is offset toward the viewfinder side
  lensY: -7.0,
  throatR: 21.5,
};
D.halfFlat = D.W / 2 - D.endA;
D.frontZ = D.depth / 2;
D.chassisOuter = D.depth / 2 - D.leather;
D.chassisInner = D.chassisOuter - D.wall;
D.mountZ = D.frontZ + 0.8;          // body mount flange face
D.filmZ = D.mountZ - 27.8;          // sensor plane (27.8 mm flange focal distance)
