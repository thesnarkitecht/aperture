// M11 top plate, laid out from orthographic reference photos: a base slab, a
// shoulder carrying the speed dial / release / Fn button, a raised rangefinder
// block with a well for the pull-up ISO dial, windows, red dot and hot shoe.
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import * as T from '../core/textures.js';

const { mesh } = G;

// Layout (mm). x > 0 is the photographer's left (ISO-dial end); z > 0 is the front.
export const L = {
  vf: { x: 46.2, y: 28.7, w: 23.3, h: 15.2, bezel: 1.8 },   // viewfinder window
  rf: { x: -23.0, y: 28.1, w: 8.2, h: 4.9, bezel: 1.1 },    // rangefinder window
  dot: { x: 9.6, y: 29.7, r: 5.35 },                         // red dot, above the lens axis
  bright: { x: -7.5, y: 37.05, r: 2.5 },                     // brightness sensor
  iso: { x: 62.9, z: 0.8, r: 7.4, well: 8.3 },               // ISO dial (seated at isoY)
  speed: { x: -22.9, z: 3.1, r: 9.6 },
  release: { x: -44.6, z: 6.2, collar: 7.9, button: 2.9 },
  fn: { x: -58.8, z: 8.0, r: 2.9 },
  shoe: { x: 0, z: -7.6, w: 20.8, l: 16 },
  eyepiece: { x: 49, y: 28.7 },
  thumb: { x: -57, y: 27 },
  lcdSensor: { x: 26, y: 26 },
};

function decalPlane(w, h, texture, { metal = false, rough = 0.5 } = {}) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({
    map: texture, transparent: true, depthWrite: false, roughness: metal ? 0.3 : rough, metalness: metal ? 0.6 : 0,
    polygonOffset: true, polygonOffsetFactor: -4,
  }));
}

// Window: bezel frame, glass, and a blackened well behind it for depth.
function windowUnit(M, w, h, glassMat, { bezel = 1.1, depth = 1.0, r = 1.4, frameMat } = {}) {
  const g = new THREE.Group();
  const outer = G.roundedRectShape(w + bezel * 2, h + bezel * 2, r + bezel);
  const hole = new THREE.Path();
  G.roundedRectPath(hole, w, h, r, 0, 0, true);
  outer.holes.push(hole);
  g.add(mesh(G.extrudeForward(outer, depth, Math.min(0.4, depth / 3), 32, 3), frameMat || M.chromePolished));
  const glass = mesh(G.extrudeForward(G.roundedRectShape(w, h, r), 0.5), glassMat);
  glass.position.z = depth - 0.55; // nearly flush with the bezel, proud of the plate face
  g.add(glass);
  const well = mesh(G.extrudeForward(G.roundedRectShape(w - 0.2, h - 0.2, r), 3), M.matteBlack, { cast: false });
  well.position.z = depth - 4.2;
  g.add(well);
  return g;
}

// Engraved index mark: a short dark groove on the plate surface.
function indexMark(M, len, x, y, z) {
  const m = mesh(new THREE.BoxGeometry(len, 0.08, 0.35), M.matteBlack, { cast: false });
  m.position.set(x, y + 0.02, z);
  return m;
}

// Knurled dial with a turned top carrying the scale.
// The face swaps with the finish: silver with black-filled engraving on the
// chrome body, black with white-filled engraving on the black body.
function dial(M, { r, h, ridges, items, rings = [], knurlDepth = 0.35 }) {
  const g = new THREE.Group();
  const bodyM = mesh(G.ridgedRingZ({ rOuter: r, rInner: 0.01, z0: 0, z1: h, ridges, depth: knurlDepth, chamfer: 0.45 }), M.body);
  bodyM.rotation.x = -Math.PI / 2;
  g.add(bodyM);
  const faceTex = (base, ink, ring) => T.polarText({
    size: 1024, base,
    items: items.map((it) => ({ weight: 600, ...it, color: it.accent ? it.accent : ink })),
    rings: rings.map((rr) => ({ ...rr, color: ring })),
  });
  const maps = { chrome: faceTex('#a9a9a4', '#0c0c0c', '#8a8a85'), black: faceTex('#0f0f10', '#eeeae2', '#2a2a2b') };
  const topMat = new THREE.MeshPhysicalMaterial({
    map: maps.chrome, metalness: 0.55, roughness: 0.4,
    normalMap: M.chromeTurned.normalMap, normalScale: new THREE.Vector2(0.04, 0.04),
  });
  M.dials = M.dials || [];
  M.dials.push({ mat: topMat, maps });
  const face = mesh(new THREE.CircleGeometry(r - 0.55, 96), topMat);
  face.rotation.x = -Math.PI / 2;
  face.position.y = h + 0.01;
  g.add(face);
  return g;
}

export function buildTopPlate(M, rig) {
  const top = new THREE.Group();
  top.name = 'topPlate';
  const fz = D.plateD / 2; // front face z

  // ---- Plate ----------------------------------------------------------------------------
  // One continuous body up to the shoulder (so the front face has no seams), the
  // lower ISO end cap, and the raised rangefinder block laid over it.
  const notch = { x: L.iso.x, z: L.iso.z, r: L.iso.well };
  const base = mesh(G.extrudeUp(G.planShape({ x0: -D.W / 2, x1: D.blockX1, d: D.plateD, a: D.endA, roundR: false, notch }), D.shoulderY - D.bodyY1, 1.0, 72, 4), M.body);
  base.position.y = D.bodyY1;
  top.add(base);
  // ISO end cap: sits lower, drops a little below the leatherette line.
  const dh = D.plateD / 2, ecx = D.W / 2 - D.endA;
  const t0 = Math.acos((D.blockX1 - ecx) / D.endA);
  const endS = new THREE.Shape();
  endS.moveTo(D.blockX1, -dh * Math.sin(t0));
  endS.absellipse(ecx, 0, D.endA, dh, -t0, t0, false);
  endS.closePath();
  const endCap = mesh(G.extrudeUp(endS, D.isoY - D.bodyY1 + 1.9, 1.0, 48, 4), M.body);
  endCap.position.y = D.bodyY1 - 1.9;
  top.add(endCap);
  // Seat under the ISO dial, filling the well down to the dial's base.
  const seat = mesh(G.latheY([[0, 0], [L.iso.well - 0.05, 0], [L.iso.well - 0.05, D.isoY - D.bodyY1], [0, D.isoY - D.bodyY1]], 64), M.chassis);
  seat.position.set(L.iso.x, D.bodyY1, L.iso.z);
  top.add(seat);
  // Raised block: sunk 3 mm into the base and a hair proud, so its front face
  // continues the plate without a seam line.
  const block = mesh(G.extrudeUp(G.planShape({ x0: D.blockX0, x1: D.blockX1, d: D.plateD + 0.1, a: D.endA, roundL: false, roundR: false, notch }), D.topY1 - D.shoulderY + 3, 1.2, 72, 5), M.body);
  block.position.y = D.shoulderY - 3;
  top.add(block);

  // ---- Front face ------------------------------------------------------------------------
  const vf = windowUnit(M, L.vf.w, L.vf.h, M.glassDark, { bezel: L.vf.bezel, depth: 1.0, r: 1.6 });
  vf.position.set(L.vf.x, L.vf.y, fz - 0.5);
  top.add(vf);
  // Rangefinder window: black-framed, with the pale prism face showing through.
  const rfw = windowUnit(M, L.rf.w, L.rf.h, M.rfGlass, { bezel: L.rf.bezel, depth: 0.6, r: 0.6, frameMat: M.anodized });
  rfw.position.set(L.rf.x, L.rf.y, fz - 0.3);
  top.add(rfw);
  const prism = mesh(new THREE.BoxGeometry(L.rf.w * 0.55, L.rf.h * 0.62, 0.4), M.white, { cast: false });
  prism.position.set(L.rf.x, L.rf.y, fz - 1.9);
  top.add(prism);
  // Brightness sensor: a small domed dark window near the top of the block.
  const bright = new THREE.Group();
  bright.add(mesh(G.latheZ([[0, 0], [L.bright.r + 0.35, 0], [L.bright.r + 0.35, 0.25], [L.bright.r, 0.35], [0, 0.35]], 40), M.body));
  bright.add(mesh(G.latheZ([[0, 0.2], [L.bright.r, 0.2], [L.bright.r * 0.85, 0.6, 1], [0, 0.75, 1]], 40), M.glassDark));
  bright.position.set(L.bright.x, L.bright.y, fz - 0.2);
  top.add(bright);

  const dot = new THREE.Group();
  dot.name = 'redDot';
  dot.add(mesh(G.latheZ([[0, 0], [L.dot.r, 0], [L.dot.r, 0.45], [L.dot.r - 0.3, 0.85], [0, 1.0, 1]], 72), M.redEnamel));
  const script = decalPlane(L.dot.r * 1.62, L.dot.r * 0.8, T.decal(512, 256, (ctx, w, h, f) => {
    ctx.fillStyle = '#fbf8f2';
    ctx.font = `italic 400 190px ${f.FONT_SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Leica', w / 2 - 6, h / 2 + 8);
  }));
  script.position.z = 1.02;
  dot.add(script);
  dot.position.set(L.dot.x, L.dot.y, fz - 0.2);
  top.add(dot);

  // ---- Rear: eyepiece, LCD brightness sensor, thumbwheel -------------------------------------
  const eye = new THREE.Group();
  eye.add(mesh(G.latheZ([[5.2, 0], [7.2, 0], [7.4, 0.4], [7.4, 2.2], [7.0, 2.7], [5.8, 2.7], [5.2, 2.0]], 64), M.body));
  for (let i = 0; i < 5; i++) {
    const t = mesh(new THREE.TorusGeometry(5.25, 0.1, 6, 64), M.steel, { cast: false });
    t.position.z = 0.5 + i * 0.32;
    eye.add(t);
  }
  const eyeGlass = mesh(new THREE.CircleGeometry(5.2, 48), M.glassDark);
  eyeGlass.position.z = 0.4;
  eye.add(eyeGlass);
  eye.rotation.y = Math.PI;
  eye.position.set(L.eyepiece.x, L.eyepiece.y, -fz + 0.3);
  top.add(eye);
  const lcdS = mesh(new THREE.CircleGeometry(1.0, 24), M.glassDark);
  lcdS.rotation.y = Math.PI;
  lcdS.position.set(L.lcdSensor.x, L.lcdSensor.y, -fz - 0.02);
  top.add(lcdS);
  const thumb = new THREE.Group();
  thumb.add(mesh(G.ridgedRingZ({ rOuter: 8, rInner: 1.5, z0: -2.6, z1: 2.6, ridges: 48, depth: 0.55, chamfer: 0.4 }), M.anodized));
  thumb.rotation.y = Math.PI / 2;
  thumb.position.set(L.thumb.x, L.thumb.y, -fz + 5.3);
  top.add(thumb);

  // ---- ISO dial: pull up to unlock (red band), push down to lock -------------------------------
  // Values read radially outward; the selected value faces the index toward the centre.
  const isoVals = ['A', 'M', '6400', '3200', '1600', '800', '400', '200', '64'];
  const iso = new THREE.Group();
  iso.name = 'isoDial';
  iso.add(mesh(G.latheY([[0, 0], [L.iso.r - 0.4, 0], [L.iso.r - 0.4, 3.4], [0, 3.4]], 72), M.body));
  const isoDial = dial(M, {
    r: L.iso.r, h: 4.9, ridges: 54,
    items: isoVals.map((t, i) => ({ text: t, angle: -Math.PI / 2 + i * (Math.PI * 2 / 9), r: 0.6, size: t.length > 3 ? 92 : t.length > 1 ? 112 : 124, radial: true })),
    rings: [{ r: 0.965, w: 10 }],
  });
  isoDial.position.y = 3.4;
  iso.add(isoDial);
  const redBand = mesh(G.latheY([[4.4, 0], [4.6, 0], [4.6, 1.2], [4.4, 1.2]], 48), M.redEnamel);
  redBand.position.y = 1.8;
  iso.add(redBand);
  const isoSpring = mesh(G.springGeometry(3.2, 0.25, 5, 2.4), M.steel);
  isoSpring.position.y = 0.4;
  iso.add(isoSpring);
  iso.position.set(L.iso.x, D.isoY, L.iso.z);
  top.add(iso);
  top.add(indexMark(M, 2.6, L.iso.x - L.iso.well - 1.6, D.topY1, L.iso.z));
  rig.add(isoDial, 'top', [0, 16, 0]);

  // ---- Hot shoe: rails engraved with the serial and "LEICA M11", 4 + 1 contacts ------------------
  const shoe = new THREE.Group();
  shoe.name = 'hotShoe';
  shoe.add(mesh(G.extrudeUp(G.roundedRectShape(L.shoe.w - 8.2, L.shoe.l, 1.0), 0.9, 0.2), M.anodized));
  for (const sgn of [1, -1]) {
    const rail = mesh(G.extrudeUp(G.roundedRectShape(4.1, L.shoe.l, 0.8), 1.6, 0.35), M.body);
    rail.position.x = sgn * (L.shoe.w / 2 - 2.05);
    shoe.add(rail);
    // Overhanging lip that the flash foot slides under.
    const lip = mesh(G.extrudeUp(G.roundedRectShape(1.6, L.shoe.l, 0.3), 0.5, 0.12), M.chromePolished);
    lip.position.set(sgn * (L.shoe.w / 2 - 4.3), 1.35, 0);
    shoe.add(lip);
    const text = sgn > 0 ? '5 614 207' : 'LEICA M11';
    const eng = decalPlane(12.5, 2.2, T.decal(900, 160, (ctx, w, h, f) => {
      ctx.fillStyle = 'rgba(200,198,190,0.75)';
      ctx.font = `500 104px ${f.FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 4);
    }), { metal: true });
    // Reads from the back of the shoe toward the front.
    eng.rotation.order = 'YXZ';
    eng.rotation.set(-Math.PI / 2, -Math.PI / 2, 0);
    eng.position.set(sgn * (L.shoe.w / 2 - 2.05), 1.62, 0);
    shoe.add(eng);
  }
  const cplate = mesh(G.extrudeUp(G.roundedRectShape(7, 13, 1.2), 0.5, 0.12), M.chip);
  cplate.position.set(0, 0.9, -0.9);
  shoe.add(cplate);
  for (let i = 0; i < 5; i++) {
    const rib = mesh(new THREE.BoxGeometry(0.4, 0.2, 4), M.anodized, { cast: false });
    rib.position.set(-2.4 + i * 1.2, 1.45, -5.4);
    shoe.add(rib);
  }
  for (const [x, zz] of [[-2, 3.2], [2, 3.2], [-2, -5.6], [2, -5.6]]) {
    const c = mesh(G.latheY([[0, 0], [0.85, 0], [0.85, 0.25], [0.7, 0.35], [0, 0.35]], 20), M.chromePolished);
    c.position.set(x, 1.4, zz);
    shoe.add(c);
  }
  const centre = mesh(G.extrudeUp(G.roundedRectShape(2.9, 4, 1.2), 0.4, 0.1), M.chromePolished);
  centre.position.set(0, 1.4, -0.4);
  shoe.add(centre);
  const pinHole = mesh(new THREE.CircleGeometry(0.7, 20), M.matteBlack, { cast: false });
  pinHole.rotation.x = -Math.PI / 2;
  pinHole.position.set(0, 1.42, 6.1);
  shoe.add(pinHole);
  shoe.position.set(L.shoe.x, D.topY1 - 0.1, L.shoe.z);
  top.add(shoe);
  rig.add(shoe, 'top', [0, 12, 0]);

  // ---- Shutter-speed dial (no end stop; A at the index toward the centre) --------------------------
  const speeds = ['A', 'B', '8s', '4s', '2s', '1', '2', '4', '8', '15', '30', '60', '125', '250', '500', '1000', '2000', '4000'];
  const step = (Math.PI * 2) / speeds.length;
  const speed = dial(M, {
    r: L.speed.r, h: 5.0, ridges: 64,
    items: speeds.map((t, i) => ({
      text: t, angle: Math.PI / 2 + i * step, r: 0.74,
      size: t.length >= 4 ? 62 : t.length === 3 ? 70 : 82, accent: t === 'A' ? '#6f8196' : null,
    })).concat([{ text: '⚡', angle: Math.PI / 2 + 12.5 * step, r: 0.5, size: 60, accent: '#6f8196' }]),
    rings: [{ r: 0.965, w: 10 }],
  });
  speed.name = 'speedDial';
  const spindle = mesh(G.cylZ(1.6, -9, 0, { segments: 24 }), M.steel);
  spindle.rotation.x = -Math.PI / 2;
  speed.add(spindle);
  const encoder = mesh(G.latheY([[1.6, 0], [7.5, 0], [7.5, 0.8], [1.6, 0.8]], 64), M.chip);
  encoder.position.y = -6;
  speed.add(encoder);
  speed.position.set(L.speed.x, D.shoulderY, L.speed.z);
  top.add(speed);
  top.add(indexMark(M, 2.4, D.blockX0 + 3.2, D.topY1, L.speed.z));
  rig.add(speed, 'top', [0, 24, 0]);

  // ---- Shutter release inside the OFF/ON main-switch collar ------------------------------------
  const rel = new THREE.Group();
  rel.name = 'release';
  const sw = new THREE.Group();
  const collar = mesh(G.ridgedRingZ({ rOuter: L.release.collar, rInner: 3.4, z0: 0, z1: 2.6, ridges: 60, depth: 0.25, chamfer: 0.35 }), M.body);
  collar.rotation.x = -Math.PI / 2;
  sw.add(collar);
  // Forward lever tab.
  const tab = mesh(G.extrudeUp(G.roundedRectShape(6.6, 5.6, 2.6, 0, -(L.release.collar + 1.4)), 1.6, 0.45), M.body);
  tab.position.y = 0.5;
  sw.add(tab);
  rel.add(sw);
  // Release button with its cable-release socket.
  const br = L.release.button;
  const button = mesh(G.latheY([
    [0, 0], [br + 0.25, 0], [br + 0.25, 0.3], [br, 0.5], [br, 1.7], [br - 0.5, 2.25, 1], [1.0, 2.4, 1], [0.75, 2.1], [0.75, 1.6], [0, 1.6],
  ], 48), M.body);
  button.position.y = 1.9;
  rel.add(button);
  const pin = mesh(G.cylZ(0.8, -10, 0, { segments: 16 }), M.steel);
  pin.rotation.x = -Math.PI / 2;
  rel.add(pin);
  rel.position.set(L.release.x, D.shoulderY, L.release.z);
  top.add(rel);
  const swDot = mesh(new THREE.CircleGeometry(0.55, 20), M.white, { cast: false });
  swDot.rotation.x = -Math.PI / 2;
  swDot.position.set(L.release.x, D.shoulderY + 0.02, -3.3);
  top.add(swDot);
  rig.add(rel, 'top', [0, 30, 0]);
  rig.add(button, 'top', [0, 9, 0]);
  rig.add(sw, 'top', [0, 4, 0], [0, 0.4, 0]);

  // ---- Function button -----------------------------------------------------------------------
  const fn = new THREE.Group();
  fn.add(mesh(G.latheY([[L.fn.r + 0.5, 0], [L.fn.r + 0.5, 0.35], [L.fn.r, 0.45], [L.fn.r - 0.1, 0]], 48), M.body));
  fn.add(mesh(G.latheY([[0, 0], [L.fn.r - 0.15, 0], [L.fn.r - 0.15, 1.1], [L.fn.r - 0.5, 1.45, 1], [0, 1.55, 1]], 48), M.body));
  fn.position.set(L.fn.x, D.shoulderY, L.fn.z);
  top.add(fn);
  rig.add(fn, 'top', [0, 18, 0]);

  // Dial-encoder flex PCB under the plate (revealed when it lifts).
  const flex = new THREE.Group();
  flex.add(mesh(G.extrudeUp(G.roundedRectShape(118, 16, 3, -2, 0), 0.4, 0.1), M.flex));
  for (const x of [L.iso.x - 4, L.speed.x, L.release.x]) {
    const hall = mesh(new THREE.BoxGeometry(4, 1, 4), M.chip);
    hall.position.set(x, 0.9, 0);
    flex.add(hall);
  }
  flex.position.y = D.bodyY1 + 0.3;
  top.add(flex);
  rig.add(flex, 'top', [0, -62, 0]);

  rig.add(top, 'top', [0, 72, 0]);
  rig.add(top, 'topHigh', [0, 42, 0]);
  rig.floaty(top, 1.6, 0.45);
  return { top, isoDial, speed };
}
