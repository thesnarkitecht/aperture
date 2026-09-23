// Top plate: windows, red dot, engraving, dials, levers and the gear train below.
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import * as T from '../core/textures.js';

const { mesh } = G;
const TAU = Math.PI * 2;

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
  return g;
}

function decalPlane(w, h, texture, { opacity = 1 } = {}) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshPhysicalMaterial({
    map: texture, transparent: true, opacity, depthWrite: false, roughness: 0.6, metalness: 0,
    polygonOffset: true, polygonOffsetFactor: -4,
  }));
}

export function buildTopPlate(M, rig) {
  const top = new THREE.Group();
  top.name = 'topPlate';
  const H = D.topY1 - D.bodyY1;

  const shell = mesh(G.extrudeUp(G.roundedRectShape(D.W, D.plateD, D.plateD / 2), H, 1.9, 64, 5), M.body);
  shell.position.y = D.bodyY1;
  top.add(shell);
  const fz = D.plateD / 2; // front face z
  const Y = D.winY;

  // Windows (viewer's right → left): viewfinder, frame-line illuminator, rangefinder.
  const vf = windowUnit(M, 21, 13, M.glassDark);
  vf.position.set(43, Y, fz - 0.6);
  top.add(vf);
  const illum = windowUnit(M, 13, 8.5, M.frosted, { r: 0.8 });
  illum.position.set(19, Y, fz - 0.6);
  top.add(illum);
  const rfw = windowUnit(M, 10.5, 9.5, M.glassDark, { r: 1 });
  rfw.position.set(-47, Y, fz - 0.6);
  top.add(rfw);
  rig.anchor(vf, 'vfWindow', [0, 6.5, 1]);
  rig.anchor(rfw, 'rfWindow', [0, 5, 1]);
  rig.anchor(illum, 'illum', [0, -4.5, 1]);

  // Red dot.
  const dot = new THREE.Group();
  dot.name = 'redDot';
  dot.add(mesh(G.latheZ([[0, 0], [5.4, 0], [5.4, 0.5], [5.1, 0.9], [0, 1.05, 1]], 64), M.redEnamel));
  const script = decalPlane(8.6, 4.3, T.decal(512, 256, (ctx, w, h, f) => {
    ctx.fillStyle = '#fbf8f2';
    ctx.font = `italic 400 190px ${f.FONT_SERIF}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Leica', w / 2 - 6, h / 2 + 8);
  }));
  script.position.z = 1.07;
  dot.add(script);
  dot.position.set(-29, Y + 0.5, fz - 0.3);
  top.add(dot);
  rig.anchor(dot, 'redDot', [0, 5.5, 1]);

  // Engraving on the top face (reads from the front).
  const engraving = decalPlane(18, 4.5, T.decal(1024, 256, (ctx, w, h, f) => {
    ctx.fillStyle = 'rgba(18,18,18,0.82)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `italic 400 120px ${f.FONT_SERIF}`;
    ctx.fillText('Leica  M6', w / 2, 92);
    ctx.font = `500 40px ${f.FONT_SANS}`;
    ctx.fillText('Nº 1 954 207   ·   GERMANY', w / 2, 200);
  }));
  engraving.rotation.x = -Math.PI / 2;
  engraving.position.set(27, D.topY1 + 0.02, 7.5);
  top.add(engraving);

  // Eyepiece on the rear.
  const eye = windowUnit(M, 11, 9.5, M.glassDark, { bezel: 1.6, depth: 1.8, r: 2.2 });
  eye.rotation.y = Math.PI;
  eye.position.set(43, Y, -fz + 0.6);
  top.add(eye);
  rig.anchor(eye, 'eyepiece', [0, 6, 1]);

  // ---- Controls on the top face -------------------------------------------
  const y0 = D.topY1 - 0.2;

  // Rewind knob with fold-out crank.
  const rewind = new THREE.Group();
  rewind.name = 'rewind';
  const rwCollar = mesh(G.latheY([[0, 0], [10.4, 0], [10.4, 1.6], [9.6, 2.2], [0, 2.2]], 96), M.body);
  rewind.add(rwCollar);
  const rwKnob = new THREE.Group();
  const drum = mesh(G.ridgedRingZ({ rOuter: 9.4, rInner: 0.01, z0: 0, z1: 6, ridges: 56, depth: 0.45, chamfer: 0.6 }), M.body);
  drum.rotation.x = -Math.PI / 2;
  rwKnob.add(drum);
  const cap = mesh(new THREE.CircleGeometry(8.8, 64), M.chromeTurned);
  cap.rotation.x = -Math.PI / 2;
  cap.position.y = 6.01;
  rwKnob.add(cap);
  rwKnob.position.y = 2.2;
  rewind.add(rwKnob);
  const crank = new THREE.Group();
  const crankArm = mesh(G.extrudeUp(G.roundedRectShape(15, 4.2, 2.1, 5.5, 0), 1.4, 0.4), M.body);
  crank.add(crankArm);
  const crankHub = mesh(G.latheY([[0, 0], [3.2, 0], [3.2, 2.2], [2.6, 2.8], [0, 2.8]], 32), M.chromePolished);
  crank.add(crankHub);
  const crankKnob = mesh(G.latheY([[0, 0], [2.3, 0], [2.3, 4.2], [1.8, 5], [0, 5.1, 1]], 32), M.rubber);
  crankKnob.position.set(11.5, 1.4, 0);
  crank.add(crankKnob);
  crank.position.y = 8.2;
  crank.rotation.y = -0.6;
  rewind.add(crank);
  rewind.position.set(47, y0, 0);
  top.add(rewind);
  rig.add(rwKnob, 'top', [0, 12, 0]);
  rig.add(crank, 'top', [0, 24, 0], [0, 0.8, 0]);
  rig.anchor(crank, 'rewind', [11.5, 6, 0]);

  // Accessory (hot) shoe.
  const shoe = new THREE.Group();
  shoe.name = 'hotShoe';
  shoe.add(mesh(G.extrudeUp(G.roundedRectShape(20, 19, 1.2), 1.2, 0.3), M.body));
  for (const s of [1, -1]) {
    const rail = new THREE.Shape();
    rail.moveTo(0, 0); rail.lineTo(2.6, 0); rail.lineTo(2.6, 3.4); rail.lineTo(-1.6, 3.4); rail.lineTo(-1.6, 2.6); rail.lineTo(0, 2.6); rail.closePath();
    const rg = G.extrudeForward(rail, 19, 0.2, 4, 1);
    const rm = mesh(rg, M.chromePolished);
    rm.position.set(s * 9.9, 0.8, -9.5);
    if (s < 0) { rm.scale.x = -1; }
    shoe.add(rm);
  }
  const contact = mesh(G.latheY([[0, 0], [2.4, 0], [2.4, 0.9], [1.4, 1.1], [0, 1.1]], 32), M.gold);
  contact.position.y = 1.2;
  shoe.add(contact);
  const spring = mesh(new THREE.BoxGeometry(12, 0.3, 3), M.steel);
  spring.position.set(0, 1.4, -6.5);
  shoe.add(spring);
  shoe.position.set(7, y0, -1);
  top.add(shoe);
  rig.add(shoe, 'top', [0, 12, 0]);
  rig.anchor(shoe, 'hotShoe', [0, 4, 9]);

  // Shutter-speed dial with its spindle.
  const speed = new THREE.Group();
  speed.name = 'speedDial';
  const dialBody = mesh(G.ridgedRingZ({ rOuter: 10.6, rInner: 0.01, z0: 0, z1: 5.2, ridges: 72, depth: 0.4, chamfer: 0.5 }), M.body);
  dialBody.rotation.x = -Math.PI / 2;
  speed.add(dialBody);
  const speeds = ['B', '1', '2', '4', '8', '15', '30', '60', '125', '250', '500', '1000'];
  const dialTop = mesh(new THREE.CircleGeometry(10.0, 96), new THREE.MeshPhysicalMaterial({
    map: T.polarText({
      size: 1024, base: '#c9c9c5',
      items: speeds.map((t, i) => ({ text: t, angle: -2.2 + i * 0.4, r: 0.74, size: t.length > 3 ? 70 : 86, weight: 600, color: '#141414' }))
        .concat([{ text: '⚡', angle: -2.2 + 7.6 * 0.4, r: 0.52, size: 60, color: '#c41a1a' }]),
      rings: [{ r: 0.96, w: 8, color: '#9d9d98' }],
    }),
    metalness: 0.9, roughness: 0.3, normalMap: M.chromeTurned.normalMap, normalScale: new THREE.Vector2(0.15, 0.15),
  }));
  dialTop.rotation.x = -Math.PI / 2;
  dialTop.position.y = 5.21;
  speed.add(dialTop);
  M.dialTop = dialTop.material;
  const spindle = mesh(G.cylZ(1.6, -12, 0, { segments: 24 }), M.steel);
  spindle.rotation.x = -Math.PI / 2;
  speed.add(spindle);
  const cam = mesh(G.gearGeometry({ teeth: 30, module: 0.45, h: 1.2, bore: 1.6, spokes: 5 }), M.brass);
  cam.position.y = -9;
  speed.add(cam);
  speed.position.set(-25, y0, 1.5);
  top.add(speed);
  rig.add(speed, 'top', [0, 26, 0]);
  rig.anchor(speed, 'speedDial', [-10.6, 3, 0]);

  // Advance lever, concentric with the shutter release.
  const adv = new THREE.Group();
  adv.name = 'advance';
  adv.add(mesh(G.latheY([[0, 0], [8.4, 0], [8.4, 1.8], [7.8, 2.4], [0, 2.4]], 64), M.body));
  const lever = new THREE.Group();
  const ls = new THREE.Shape();
  ls.moveTo(0, -4.5);
  ls.lineTo(33, -2.4);
  ls.quadraticCurveTo(40, -2.2, 40, 1.4);
  ls.quadraticCurveTo(39.5, 3.2, 33, 3.0);
  ls.lineTo(0, 4.5);
  ls.absarc(0, 0, 4.5, Math.PI / 2, -Math.PI / 2, false);
  const leverArm = mesh(G.extrudeUp(ls, 1.8, 0.5, 24, 3), M.body);
  lever.add(leverArm);
  const tip = mesh(G.latheY([[0, 0], [2.6, 0], [2.6, 5.5], [2.0, 6.4], [0, 6.5, 1]], 32), M.rubber);
  tip.position.set(37, 1.6, 0.4);
  lever.add(tip);
  lever.position.y = 2.6;
  lever.rotation.y = 0.38;
  adv.add(lever);
  const counter = mesh(G.latheY([[0, 0], [3.4, 0], [3.4, 0.8], [0, 1.9, 1]], 48), M.glassDark);
  counter.position.set(12, 0, -8.5);
  adv.add(counter);
  adv.position.set(-47, y0, 1);
  top.add(adv);
  rig.add(lever, 'top', [0, 14, 0], [0, -0.95, 0]);
  rig.anchor(tip, 'advance', [0, 6, 0]);

  // Shutter release: threaded collar + button (sits on the lever hub).
  const rel = new THREE.Group();
  rel.name = 'release';
  const thread = [];
  for (let i = 0; i <= 12; i++) thread.push([i % 2 ? 3.6 : 3.95, 0.35 * i, 1]);
  const collar = mesh(G.latheY([[0, 0], [3.95, 0], ...thread, [3.4, 4.6], [0, 4.6]], 64), M.chromePolished);
  rel.add(collar);
  const button = mesh(G.latheY([[0, 0], [2.7, 0], [2.7, 1.2], [2.3, 2.1, 1], [1.2, 2.5, 1], [0, 2.6, 1]], 48), M.chromePolished);
  button.position.y = 4.6;
  rel.add(button);
  const pin = mesh(G.cylZ(0.8, -14, 0, { segments: 16 }), M.steel);
  pin.rotation.x = -Math.PI / 2;
  rel.add(pin);
  rel.position.set(-47, y0 + 4.4, 1);
  top.add(rel);
  rig.add(rel, 'top', [0, 30, 0]);
  rig.add(button, 'top', [0, 8, 0]);
  rig.anchor(button, 'release', [0, 3, 0]);

  // Screws on the plate ends.
  for (const x of [-60, 60]) {
    const s = G.screw(M, 0.9);
    s.position.set(x, D.topY1 - 0.35, -9);
    top.add(s);
  }

  rig.add(top, 'top', [0, 72, 0]);
  rig.add(top, 'topHigh', [0, 42, 0]);
  rig.floaty(top, 1.6, 0.45);
  rig.anchor(shell, 'topPlate', [-62, D.topY1 - 3, 8]);
  return { top };
}

// Advance / transport gear train that lives under the top plate.
export function buildGearTrain(M, rig) {
  const g = new THREE.Group();
  g.name = 'gearTrain';
  const y = D.bodyY1 + 0.2;
  const specs = [
    { teeth: 40, m: 0.5, x: -47, z: 1, h: 1.6, spokes: 5, dir: 1 },
    { teeth: 20, m: 0.5, x: -47 + 15, z: 1 - 0.1, h: 1.6, spokes: 0, dir: -1 },
    { teeth: 32, m: 0.5, x: -47 + 15 + 13 * Math.cos(0.6), z: 1 + 13 * Math.sin(0.6), h: 1.4, spokes: 4, dir: 1 },
    { teeth: 14, m: 0.5, x: -47 + 15, z: 1 - 0.1, h: 1.2, spokes: 0, dir: -1, yo: 1.8, ratio: -2 },
  ];
  const gears = [];
  for (const s of specs) {
    const gear = mesh(G.gearGeometry({ teeth: s.teeth, module: s.m, h: s.h, bore: 0.9, spokes: s.spokes }), M.brass);
    gear.position.set(s.x, y + (s.yo || 0), s.z);
    gear.userData.ratio = s.ratio ?? s.dir * 40 / s.teeth;
    g.add(gear);
    gears.push(gear);
    const arbor = mesh(G.cylZ(0.9, 0, 5, { segments: 16 }), M.steel);
    arbor.rotation.x = -Math.PI / 2;
    arbor.position.set(s.x, y - 1, s.z);
    g.add(arbor);
  }
  // Mainspring and bridge.
  const spring = mesh(G.springGeometry(2.4, 0.3, 7, 11), M.blueSteel);
  spring.rotation.z = Math.PI / 2;
  spring.position.set(-12, y + 3, -8);
  g.add(spring);
  const bridge = mesh(G.extrudeUp(G.roundedRectShape(34, 7, 3.5, -34, -9), 1.2, 0.3), M.steel);
  bridge.position.y = y + 3.2;
  g.add(bridge);
  for (const x of [-48, -20]) {
    const s = G.screw(M, 1.0);
    s.position.set(x, y + 4.4, -9);
    g.add(s);
  }
  rig.add(g, 'top', [0, 34, 0]);
  rig.add(g, 'topHigh', [0, 6, 0]);
  rig.floaty(g, 1.2, 0.7);
  rig.anchor(gears[2], 'gears', [0, 1, 8]);
  return { group: g, gears };
}
