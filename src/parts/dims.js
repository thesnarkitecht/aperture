// Key dimensions (mm), modelled on the proportions of a Leica M6.
// Axes: +X toward the rewind side, +Y up, +Z out of the lens.
export const D = {
  W: 138,          // body width
  depth: 33,       // body depth (leather surface to leather surface)
  endR: 16.5,      // radius of the rounded body ends
  halfFlat: 52.5,  // x-extent of the flat front/back section (W/2 - endR)
  leather: 0.7,    // vulcanite thickness
  wall: 1.8,       // die-cast wall thickness
  bodyY0: -35,     // bottom of the body shell
  bodyY1: 16,      // top of the body shell
  topY1: 33,       // top surface of the top plate
  baseY0: -39,     // underside of the base plate
  plateD: 34,      // top/base plate depth (sits slightly proud)
  lensY: -9,       // optical axis height
  mountZ: 17.2,    // body mount flange face
  filmZ: 17.2 - 27.8, // film plane (27.8 mm flange focal distance)
  throatR: 21.5,
  winY: 24.5,      // window row on the top-plate front
};
D.frontZ = D.depth / 2;
D.chassisOuter = D.depth / 2 - D.leather;
D.chassisInner = D.chassisOuter - D.wall;
