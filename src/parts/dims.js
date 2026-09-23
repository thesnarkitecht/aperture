// Key dimensions (mm), modelled on the Leica M11 (139 × 38.5 × 80 mm).
// Axes: +X toward the ISO-dial end, +Y up, +Z out of the lens.
export const D = {
  W: 139,          // body width
  depth: 35.5,     // body shell depth (front skin to rear cover)
  leather: 0.7,    // leatherette thickness
  wall: 1.8,       // die-cast wall thickness
  bodyY0: -37.6,   // bottom of the body shell (top of the bottom plate)
  bodyY1: 16,      // top of the body shell
  topY1: 33.8,     // top surface of the top plate
  baseY0: -40.4,   // underside of the bottom plate
  plateD: 36.4,    // top/bottom plate depth (sits slightly proud)
  lensY: -9,       // optical axis height
  throatR: 21.5,
  winY: 24.8,      // window row on the top-plate front
};
D.endR = D.depth / 2;
D.halfFlat = D.W / 2 - D.endR;
D.frontZ = D.depth / 2;
D.chassisOuter = D.depth / 2 - D.leather;
D.chassisInner = D.chassisOuter - D.wall;
D.mountZ = D.frontZ + 0.7;          // body mount flange face
D.filmZ = D.mountZ - 27.8;          // sensor plane (27.8 mm flange focal distance)
