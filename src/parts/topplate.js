// M11 top plate: windows, red dot, engravings, ISO dial, shutter-speed dial,
// release with main switch, function button, hot shoe, eyepiece, thumbwheel.
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import * as T from '../core/textures.js';

const { mesh } = G;

// Layout (mm). x > 0 is the photographer's left (ISO-dial end).
export const L = {
  vf: { x: 43, w: 22, h: 13.5 },       // viewfinder window (front, viewer's right)
  rf: { x: -46.5, w: 10.5, h: 10 },    // rangefinder window (front, viewer's left)
  dot: { x: -28.5, r: 5.6 },           // red dot
  bright: { x: 15, r: 1.5 },           // front brightness sensor (frame-line LEDs / metering)
  timerLed: { x: 22.5, r: 1.1 },       // self-timer LED
  lcdSensor: { x: 24 },                // rear brightness sensor for the LCD
  iso: { x: 47, z: -0.5, r: 10.8 },    // ISO dial (photographer's left)
  shoe: { x: 7, z: -0.5 },
  speed: { x: -24.5, z: 1.2, r: 10.8 },
  release: { x: -47.5, z: 1.5 },
  fn: { x: -36, z: 11.2 },             // top function button, ahead of the release
  eyepiece: { x: 43 },
  thumb: { x: -52, y: 24 },            // thumbwheel on the rear of the plate
};

function windowUnit(M, w, h, glassMat, { bezel = 1.1, depth = 1.2, r = 1.4 } = {}) {
  const g = new THREE.Group();
  const outer = G.roundedRectShape(w + bezel * 2, h + bezel * 2, r + bezel);
  const hole = new THREE.Path();
  G.roundedRectPath(hole, w, h, r, 0, 0, true);
  outer.holes.push(hole);
  g.add(mesh(G.extrudeForward(outer, depth, 0.35, 32, 2), M.chromePolished));
  const glass = mesh(G.extrudeForward(G.roundedRectShape(w, h, r), 0.6), glassMat);
  glass.position.z = depth - 1.0;
  g.add(glass);
  // Blackened interior so the window has depth.
  const well = mesh(G.extrudeForward(G.roundedRectShape(w - 0.2, h - 0.2, r), 3), M.matteBlack, { cast: false });
  well.position.z = depth - 4.2;
  g.add(well);
  return g;
}

function decalPlane(w, h, texture, { opacity = 1, metal = false } = {}) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({
    map: texture, transparent: true, opacity, depthWrite: false, roughness: metal ? 0.3 : 0.6, metalness: metal ? 0.6 : 0,
    polygonOffset: true, polygonOffsetFactor: -4,
  }));
}

// Knurled dial: body with a turned top carrying engraved markings.
function dial(M, { r, h, ridges, items, rings = [], base = '#c9c9c5', ink = '#141414', knurlDepth = 0.4 }) {
  const g = new THREE.Group();
  const bodyM = mesh(G.ridgedRingZ({ rOuter: r, rInner: 0.01, z0: 0, z1: h, ridges, depth: knurlDepth, chamfer: 0.5 }), M.body);
  bodyM.rotation.x = -Math.PI / 2;
  g.add(bodyM);
  const topMat = new THREE.MeshPhysicalMaterial({
    map: T.polarText({ size: 1024, base, items: items.map((it) => ({ color: ink, weight: 600, ...it })), rings }),
    metalness: 0.9, roughness: 0.28, normalMap: M.chromeTurned.normalMap, normalScale: new THREE.Vector2(0.15, 0.15),
  });
  const face = mesh(new THREE.CircleGeometry(r - 0.6, 96), topMat);
  face.rotation.x = -Math.PI / 2;
  face.position.y = h + 0.01;
  g.add(face);
  g.userData.topMat = topMat;
  return g;
}

export function buildTopPlate(M, rig) {
  const top = new THREE.Group();
  top.name = 'topPlate';
  const H = D.topY1 - D.bodyY1;

  const shell = mesh(G.extrudeUp(G.roundedRectShape(D.W, D.plateD, D.plateD / 2), H, 2.0, 72, 6), M.body);
  shell.position.y = D.bodyY1;
  top.add(shell);
  const fz = D.plateD / 2; // front face z
  const Y = D.winY;
  const y0 = D.topY1 - 0.2;

  // ---- Front: viewfinder window, rangefinder window, red dot, LED sensor ----
  const vf = windowUnit(M, L.vf.w, L.vf.h, M.glassDark);
  vf.position.set(L.vf.x, Y, fz - 0.6);
  top.add(vf);
  const rfw = windowUnit(M, L.rf.w, L.rf.h, M.glassDark, { r: 1 });
  rfw.position.set(L.rf.x, Y, fz - 0.6);
  top.add(rfw);
  // Small round windows: brightness sensor (frosted) and self-timer LED (red).
  const pinWindow = (r, glassMat) => {
    const w = new THREE.Group();
    w.add(mesh(G.latheZ([[0, 0], [r + 0.7, 0], [r + 0.7, 0.4], [r, 0.6], [0, 0.6]], 32), M.chromePolished));
    const gl = mesh(new THREE.CircleGeometry(r, 32), glassMat);
    gl.position.z = 0.61;
    w.add(gl);
    return w;
  };
  const bright = pinWindow(L.bright.r, M.frosted);
  bright.position.set(L.bright.x, Y - 1.5, fz - 0.3);
  top.add(bright);
  const timerLed = pinWindow(L.timerLed.r, M.ledLens);
  timerLed.position.set(L.timerLed.x, Y - 1.5, fz - 0.3);
  top.add(timerLed);
  const lcdSensor = pinWindow(1.1, M.glassDark);
  lcdSensor.rotation.y = Math.PI;
  lcdSensor.position.set(L.lcdSensor.x, Y - 2, -fz + 0.3);
  top.add(lcdSensor);

  const dot = new THREE.Group();
  dot.name = 'redDot';
  dot.add(mesh(G.latheZ([[0, 0], [L.dot.r, 0], [L.dot.r, 0.5], [L.dot.r - 0.3, 0.9], [0, 1.05, 1]], 64), M.redEnamel));
  const script = decalPlane(L.dot.r * 1.6, L.dot.r * 0.8, T.decal(512, 256, (ctx, w, h, f) => {
    ctx.fillStyle = '#fbf8f2';
    ctx.font = `italic 400 190px ${f.FONT_SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Leica', w / 2 - 6, h / 2 + 8);
  }));
  script.position.z = 1.07;
  dot.add(script);
  dot.position.set(L.dot.x, Y + 0.5, fz - 0.3);
  top.add(dot);

  // ---- Rear: eyepiece and thumbwheel -------------------------------------------
  const eye = new THREE.Group();
  const eyeRing = mesh(G.latheZ([[5.2, 0], [7.4, 0], [7.6, 0.4], [7.6, 2.4], [7.2, 2.9], [5.8, 2.9], [5.2, 2.2]], 64), M.body);
  eye.add(eyeRing);
  // Fine accessory thread inside the eyepiece ring.
  for (let i = 0; i < 5; i++) {
    const t = mesh(new THREE.TorusGeometry(5.3, 0.12, 6, 64), M.steel, { cast: false });
    t.position.z = 0.5 + i * 0.35;
    eye.add(t);
  }
  const eyeGlass = mesh(new THREE.CircleGeometry(5.2, 48), M.glassDark);
  eyeGlass.position.z = 0.4;
  eye.add(eyeGlass);
  eye.rotation.y = Math.PI;
  eye.position.set(L.eyepiece.x, Y, -fz + 0.3);
  top.add(eye);

  const thumb = new THREE.Group();
  const wheel = mesh(G.ridgedRingZ({ rOuter: 7.5, rInner: 1.5, z0: -2.6, z1: 2.6, ridges: 44, depth: 0.55, chamfer: 0.4 }), M.anodized);
  wheel.rotation.y = Math.PI / 2;
  thumb.add(wheel);
  thumb.position.set(L.thumb.x, L.thumb.y, -fz + 3.4);
  top.add(thumb);

  // ---- ISO dial (pull up to turn) -------------------------------------------------
  const isoVals = ['A', '64', '200', '400', '800', '1600', '3200', '6400', 'M'];
  const iso = new THREE.Group();
  iso.name = 'isoDial';
  const isoCollar = mesh(G.latheY([[0, 0], [L.iso.r + 0.3, 0], [L.iso.r + 0.3, 1.4], [L.iso.r - 0.4, 2.0], [0, 2.0]], 96), M.body);
  iso.add(isoCollar);
  const isoDial = dial(M, {
    r: L.iso.r, h: 5.2, ridges: 60,
    items: isoVals.map((t, i) => ({ text: t, angle: Math.PI + (i - 4) * 0.36, r: 0.72, size: t.length > 3 ? 64 : 80 })),
    rings: [{ r: 0.95, w: 6, color: '#a3a39e' }],
  });
  isoDial.position.y = 2.0;
  iso.add(isoDial);
  // Red band on the spindle: visible only when the dial is pulled up to unlock.
  const redBand = mesh(G.latheY([[4.4, 0], [4.6, 0], [4.6, 1.2], [4.4, 1.2]], 48), M.redEnamel);
  redBand.position.y = 0.8;
  iso.add(redBand);
  const isoSpindle = mesh(G.latheY([[0, -1], [4.3, -1], [4.3, 2.2], [0, 2.2]], 48), M.steel);
  iso.add(isoSpindle);
  // Locking pin and spring revealed when the dial lifts.
  const isoSpring = mesh(G.springGeometry(3.2, 0.25, 5, 2.4), M.steel);
  isoSpring.position.y = -0.4;
  iso.add(isoSpring);
  iso.position.set(L.iso.x, y0, L.iso.z);
  top.add(iso);
  rig.add(isoDial, 'top', [0, 16, 0]);

  // ---- Hot shoe with centre and auxiliary contacts ---------------------------------
  const shoe = new THREE.Group();
  shoe.name = 'hotShoe';
  shoe.add(mesh(G.extrudeUp(G.roundedRectShape(20, 19.5, 1.2), 1.2, 0.3), M.body));
  for (const sgn of [1, -1]) {
    const rail = new THREE.Shape();
    rail.moveTo(0, 0); rail.lineTo(2.6, 0); rail.lineTo(2.6, 3.4); rail.lineTo(-1.6, 3.4); rail.lineTo(-1.6, 2.6); rail.lineTo(0, 2.6); rail.closePath();
    const rm = mesh(G.extrudeForward(rail, 19.5, 0.2, 4, 1), M.chromePolished);
    rm.position.set(sgn * 9.9, 0.8, -9.75);
    if (sgn < 0) rm.scale.x = -1;
    shoe.add(rm);
  }
  const contact = mesh(G.latheY([[0, 0], [2.4, 0], [2.4, 0.9], [1.4, 1.1], [0, 1.1]], 32), M.gold);
  contact.position.set(0, 1.2, 0.5);
  shoe.add(contact);
  // Auxiliary contact strip (for flash and Visoflex) at the rear of the shoe.
  const aux = mesh(new THREE.BoxGeometry(9, 0.5, 2.2), M.chip);
  aux.position.set(0, 1.45, -7.6);
  shoe.add(aux);
  for (let i = 0; i < 5; i++) {
    const c = mesh(new THREE.BoxGeometry(0.9, 0.2, 1.4), M.gold, { cast: false });
    c.position.set(-3.2 + i * 1.6, 1.75, -7.6);
    shoe.add(c);
  }
  // Serial number engraved on the shoe rail.
  const serial = decalPlane(14, 1.6, T.decal(700, 80, (ctx, w, h, f) => {
    ctx.fillStyle = 'rgba(25,25,25,0.8)';
    ctx.font = `600 54px ${f.FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('5 614 207', w / 2, h / 2 + 3);
  }), { metal: true });
  serial.rotation.y = Math.PI / 2;
  serial.position.set(9.9 + 2.61, 0.8 + 1.7, 0);
  shoe.add(serial);
  const leaf = mesh(new THREE.BoxGeometry(12, 0.3, 2.6), M.steel);
  leaf.position.set(0, 1.4, 6.8);
  shoe.add(leaf);
  shoe.position.set(L.shoe.x, y0, L.shoe.z);
  top.add(shoe);
  rig.add(shoe, 'top', [0, 12, 0]);

  // ---- Shutter-speed dial ------------------------------------------------------------
  const speeds = ['A', '8s', '4s', '2s', '1s', '2', '4', '8', '15', '30', '60', '125', '250', '500', '1000', '2000', '4000', 'B'];
  const speed = dial(M, {
    r: L.speed.r, h: 5.4, ridges: 72,
    items: speeds.map((t, i) => ({
      text: t, angle: Math.PI - 2.75 + i * (5.5 / (speeds.length - 1)), r: 0.76,
      size: t.length >= 4 ? 50 : t.length === 3 ? 58 : 66, color: t === 'A' ? '#c41a1a' : '#141414',
    })).concat([{ text: '⚡', angle: Math.PI - 2.75 + 11.5 * (5.5 / (speeds.length - 1)), r: 0.55, size: 44, color: '#c41a1a' }]),
    rings: [{ r: 0.95, w: 6, color: '#a3a39e' }],
  });
  speed.name = 'speedDial';
  const spindle = mesh(G.cylZ(1.6, -10, 0, { segments: 24 }), M.steel);
  spindle.rotation.x = -Math.PI / 2;
  speed.add(spindle);
  // Magnetic encoder disc underneath (reads the dial position electronically).
  const encoder = mesh(G.latheY([[1.6, 0], [8, 0], [8, 0.8], [1.6, 0.8]], 64), M.chip);
  encoder.position.y = -6;
  speed.add(encoder);
  speed.position.set(L.speed.x, y0, L.speed.z);
  top.add(speed);
  rig.add(speed, 'top', [0, 24, 0]);

  // ---- Shutter release with main switch --------------------------------------------
  const rel = new THREE.Group();
  rel.name = 'release';
  // Main-switch ring with a forward-pointing lever.
  const sw1 = new THREE.Group();
  sw1.add(mesh(G.latheY([[4.2, 0], [8.2, 0], [8.2, 1.6], [7.6, 2.2], [4.2, 2.2]], 64), M.body));
  const lever = mesh(G.extrudeUp(G.roundedRectShape(5, 6, 2.2, 0, -8.6), 1.8, 0.5), M.body);
  sw1.add(lever);
  const leverGrip = mesh(new THREE.BoxGeometry(3.6, 0.3, 0.3), M.matteBlack, { cast: false });
  leverGrip.position.set(0, 1.85, 10.6);
  sw1.add(leverGrip);
  sw1.rotation.y = -0.25;
  rel.add(sw1);
  // Threaded collar (cable release) and button.
  const thread = [];
  for (let i = 0; i <= 12; i++) thread.push([i % 2 ? 3.6 : 3.95, 2.2 + 0.32 * i, 1]);
  const collar = mesh(G.latheY([[0, 2.2], [3.95, 2.2], ...thread, [3.4, 6.6], [0, 6.6]], 64), M.chromePolished);
  rel.add(collar);
  const button = new THREE.Group();
  button.add(mesh(G.latheY([[0, 0], [2.7, 0], [2.7, 1.2], [2.3, 2.1, 1], [1.2, 2.5, 1], [0, 2.6, 1]], 48), M.chromePolished));
  const cableHole = mesh(new THREE.CircleGeometry(0.9, 24), M.matteBlack, { cast: false });
  cableHole.rotation.x = -Math.PI / 2;
  cableHole.position.y = 2.61;
  button.add(cableHole);
  button.position.y = 6.6;
  rel.add(button);
  const pin = mesh(G.cylZ(0.8, -12, 0, { segments: 16 }), M.steel);
  pin.rotation.x = -Math.PI / 2;
  rel.add(pin);
  rel.position.set(L.release.x, y0, L.release.z);
  top.add(rel);
  // Main switch positions engraved beside the collar: OFF · ON.
  const swMarks = decalPlane(26, 26, T.polarText({
    size: 1024,
    items: [['OFF', Math.PI - 0.55], ['ON', Math.PI + 0.45]].map(([t, a]) => ({ text: t, angle: a, r: 0.8, size: 78, color: 'rgba(20,20,20,0.85)', weight: 700 })),
  }), { metal: true });
  swMarks.rotation.x = -Math.PI / 2;
  swMarks.position.set(L.release.x, D.topY1 + 0.02, L.release.z);
  top.add(swMarks);
  rig.add(rel, 'top', [0, 30, 0]);
  rig.add(button, 'top', [0, 9, 0]);
  rig.add(sw1, 'top', [0, 4, 0], [0, 0.4, 0]);

  // ---- Function button -----------------------------------------------------------------
  const fn = new THREE.Group();
  fn.add(mesh(G.latheY([[0, 0], [3.4, 0], [3.4, 0.5], [3.0, 0.7], [0, 0.7]], 48), M.body));
  fn.add(mesh(G.latheY([[0, 0.7], [2.6, 0.7], [2.6, 1.9], [2.2, 2.4, 1], [0, 2.5, 1]], 48), M.chromePolished));
  fn.position.set(L.fn.x, y0, L.fn.z);
  top.add(fn);
  rig.add(fn, 'top', [0, 18, 0]);

  // Screws at the plate ends.
  for (const x of [-62, 62]) {
    const s = G.screw(M, 0.8);
    s.position.set(x, D.topY1 - 0.4, -9.5);
    top.add(s);
  }

  // Dial-encoder flex PCB under the top plate (revealed when it lifts).
  const flex = new THREE.Group();
  const fb = mesh(G.extrudeUp(G.roundedRectShape(112, 18, 3, -2, 0), 0.4, 0.1), M.flex);
  flex.add(fb);
  for (const x of [L.iso.x, L.speed.x, L.release.x]) {
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
