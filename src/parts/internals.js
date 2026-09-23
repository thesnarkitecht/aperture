// Internal assemblies: focal-plane shutter, film path, rangefinder/viewfinder
// optics and the light-meter electronics.
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import { rayMaterial } from './lens.js';

const { mesh } = G;
const TAU = Math.PI * 2;

// ---- Shutter -----------------------------------------------------------------
export function buildShutter(M, rig) {
  const g = new THREE.Group();
  g.name = 'shutter';
  const zf = D.filmZ + 2.1; // frame rear face
  const cy = D.lensY;

  const frameS = G.roundedRectShape(66, 48, 3, 0, cy);
  const hole = new THREE.Path();
  G.roundedRectPath(hole, 38, 26, 1, 0, cy, true);
  frameS.holes.push(hole);
  const frame = mesh(G.extrudeForward(frameS, 1.0, 0.2), M.crate);
  frame.position.z = zf;
  g.add(frame);

  const drums = [];
  for (const s of [-1, 1]) {
    const drum = new THREE.Group();
    drum.add(mesh(G.latheY([[0, -21], [3.4, -21], [3.4, -20], [2.8, -19.5], [2.8, 19.5], [3.4, 20], [3.4, 21], [0, 21]], 32), M.steel));
    drum.position.set(s * 27.5, cy, zf + 3.4);
    g.add(drum);
    drums.push(drum);
    // Curtain roll wound around each drum.
    const roll = mesh(G.latheY([[0, -17], [3.6, -17], [3.6, 17], [0, 17]], 32), M.cloth);
    roll.position.copy(drum.position);
    g.add(roll);
  }

  // Curtains as unit planes scaled each frame.
  const curtainGeo = new THREE.PlaneGeometry(1, 32);
  curtainGeo.translate(0.5, 0, 0);
  G.scaleUV(curtainGeo, 30, 1);
  const c1 = mesh(curtainGeo, M.cloth);
  const c2 = mesh(curtainGeo, M.cloth);
  c1.position.set(0, cy, zf + 1.35);
  c2.position.set(0, cy, zf + 1.7);
  g.add(c1, c2);
  const spot = mesh(new THREE.CircleGeometry(4.2, 32), M.white);
  spot.position.set(0, cy, zf + 1.4);
  g.add(spot);

  // Brass escapement gears on the shutter crate.
  for (const [x, t] of [[-14, 26], [-14 + 11.5, 20], [16, 30]]) {
    const gear = mesh(G.gearGeometry({ teeth: t, module: 0.5, h: 1.0, bore: 0.7, spokes: t > 24 ? 4 : 0 }), M.brass);
    gear.rotation.x = Math.PI / 2;
    gear.position.set(x, cy + 21, zf + 2.4);
    gear.userData.ratio = 26 / t * (x > 0 ? 1 : -1);
    g.add(gear);
  }
  const spring = mesh(G.springGeometry(1.3, 0.2, 9, 20), M.blueSteel);
  spring.rotation.z = Math.PI / 2;
  spring.position.set(10, cy - 21, zf + 2.2);
  g.add(spring);

  let e1 = -21, e2 = -27.5;
  const setCurtains = () => {
    // First curtain spans e1 → right drum; second spans left drum → e2.
    c1.position.x = e1;
    c1.scale.x = Math.max(0.01, 27.5 - e1);
    c2.position.x = -27.5;
    c2.scale.x = Math.max(0.01, e2 + 27.5);
    spot.position.x = e1 + 21;
    spot.visible = spot.position.x < 23;
  };
  setCurtains();

  // phase in [0, 1): hold, fire (first then second curtain), hold, re-cock.
  const setPhase = (p) => {
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const fire1 = ss(0.25, 0.45, p), fire2 = ss(0.33, 0.53, p), cock = ss(0.78, 0.95, p);
    e1 = -21 + 48.5 * fire1 - 48.5 * cock;
    e2 = -27.5 + 48.5 * fire2 - 48.5 * cock;
    setCurtains();
  };

  rig.add(g, 'shutter', [0, 26, -40]);
  rig.floaty(g, 1.2, 0.6);
  rig.anchor(frame, 'shutterFrame', [-33, cy + 18, 1]);
  rig.anchor(spot, 'meterSpot', [0, 0, 0.2]);
  rig.anchor(drums[1], 'drum', [0, 18, 0]);
  return { group: g, setPhase, gears: g.children.filter((c) => c.userData.ratio) };
}

// ---- Film -------------------------------------------------------------------
function filmStripGeometry(path, width, yc) {
  const pos = [], uv = [], idx = [];
  let s = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    const [x, z] = path[i];
    pos.push(x, yc - width / 2, z, x, yc + width / 2, z);
    uv.push(s / 304, 0, s / 304, 1);
    if (i > 0) {
      const a = (i - 1) * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildFilm(M, rig) {
  const g = new THREE.Group();
  g.name = 'film';
  const cy = D.lensY;
  const zFilm = D.filmZ - 0.2;

  // 35 mm cassette.
  const can = new THREE.Group();
  can.name = 'cassette';
  const cx = 46, cz = -1.5;
  const shell = mesh(new THREE.CylinderGeometry(12.3, 12.3, 40, 96, 1, true), M.canister);
  can.add(shell);
  for (const s of [-1, 1]) {
    const capM = mesh(G.latheY([[0, 0], [12.8, 0], [12.8, 1.2], [12.2, 1.8], [0, 1.8]], 96), M.chromeTurned);
    capM.position.y = s * 20;
    if (s < 0) capM.rotation.x = Math.PI;
    can.add(capM);
  }
  const knob = mesh(G.latheY([[0, 0], [4.4, 0], [4.4, 4.5], [3.9, 5], [0, 5]], 32), M.rubber);
  knob.position.y = 21.8;
  can.add(knob);
  const lip = mesh(new THREE.BoxGeometry(3, 38, 3.2), M.cloth);
  lip.position.set(-10.5, 0, -6.5);
  lip.rotation.y = 0.6;
  can.add(lip);
  can.position.set(cx, cy, cz);
  g.add(can);

  // Take-up spool.
  const spool = new THREE.Group();
  spool.name = 'takeUp';
  const sx = -46, sz = -1.5;
  spool.add(mesh(G.latheY([[0, -20], [10.5, -20], [10.5, -18.8], [7.4, -18.4], [7.4, 18.4], [10.5, 18.8], [10.5, 20], [0, 20]], 64), M.chromeTurned));
  for (let i = 0; i < 3; i++) {
    const prong = mesh(new THREE.BoxGeometry(1.2, 30, 3), M.anodizedMatte);
    const a = (i / 3) * TAU;
    prong.position.set(Math.cos(a) * 7.5, 0, Math.sin(a) * 7.5);
    prong.rotation.y = -a;
    spool.add(prong);
  }
  spool.position.set(sx, cy, sz);
  g.add(spool);

  // Film path in plan (x, z): out of the cassette lip, across the gate, onto the spool.
  const path = [];
  path.push([cx - 9.5, cz - 9]);
  const p1 = [30, zFilm];
  for (let t = 0; t <= 1; t += 0.1) {
    path.push([cx - 9.5 + (p1[0] - cx + 9.5) * t, cz - 9 + (zFilm - cz + 9) * (1 - (1 - t) * (1 - t))]);
  }
  for (let x = 28; x >= sx; x -= 4) path.push([x, zFilm]);
  const turns = 1.6, R0 = sz - zFilm, R1 = 8.0;
  for (let i = 1; i <= 120; i++) {
    const t = i / 120;
    const a = -Math.PI / 2 - t * turns * TAU;
    const r = R0 + (R1 - R0) * t;
    path.push([sx + Math.cos(a) * r, sz + Math.sin(a) * r]);
  }
  const strip = mesh(filmStripGeometry(path, 35, cy), M.film);
  g.add(strip);

  rig.add(g, 'film', [0, -62, 0]);
  rig.floaty(g, 1.3, 0.5);
  rig.anchor(can, 'cassette', [0, -20, -12]);
  rig.anchor(spool, 'takeUp', [0, -20, -10]);
  rig.anchor(strip, 'filmStrip', [0, cy - 17.5, zFilm]);
  return { group: g, can, spool, strip };
}

// ---- Rangefinder / viewfinder -------------------------------------------------
export function buildRangefinder(M, rig) {
  const g = new THREE.Group();
  g.name = 'rangefinder';
  const Y = D.winY;
  const yb = D.bodyY1 + 1.2;

  const plate = mesh(G.extrudeUp(G.roundedRectShape(104, 24, 3, -2, 0), 1.2, 0.3), M.steel);
  plate.position.y = yb;
  g.add(plate);

  // Viewfinder: objective, frame-line mask, beam splitter, eyepiece.
  const vf = new THREE.Group();
  const objective = mesh(G.extrudeForward(G.roundedRectShape(19, 12, 2), 3.2, 0.8), M.glass, { cast: false });
  objective.position.set(43, Y, 11);
  vf.add(objective);
  const eyeLens = mesh(G.extrudeForward(G.roundedRectShape(11, 9, 2), 3, 0.8), M.glass, { cast: false });
  eyeLens.position.set(43, Y, -14);
  vf.add(eyeLens);
  const cube = mesh(new THREE.BoxGeometry(9, 9, 9), M.glass, { cast: false });
  cube.position.set(43, Y, 2);
  vf.add(cube);
  const halfMirror = mesh(new THREE.PlaneGeometry(12.4, 8.6), new THREE.MeshPhysicalMaterial({
    color: 0xd8c0ff, metalness: 1, roughness: 0.05, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    iridescence: 1, iridescenceIOR: 1.8,
  }));
  halfMirror.position.copy(cube.position);
  halfMirror.rotation.y = Math.PI / 4;
  vf.add(halfMirror);
  // Rails holding the viewfinder optics.
  for (const s of [-1, 1]) {
    const rail = mesh(new THREE.BoxGeometry(1.4, 1.4, 30), M.anodizedMatte);
    rail.position.set(43 + s * 10.5, yb + 2, -1.5);
    vf.add(rail);
    const post = mesh(new THREE.BoxGeometry(1.2, Y - yb + 5, 1.2), M.anodizedMatte);
    post.position.set(43 + s * 10.5, (Y + yb) / 2 + 1, 11);
    vf.add(post);
  }
  g.add(vf);

  // Frame-line mask with glowing bright lines (35 / 50 / 90 mm).
  const mask = new THREE.Group();
  const maskPlate = mesh(new THREE.BoxGeometry(21, 13.5, 0.3), M.anodizedMatte);
  mask.add(maskPlate);
  const line = (w, h, t = 0.28) => {
    const f = new THREE.Group();
    const parts = [[w, t, 0, h / 2], [w, t, 0, -h / 2], [t, h, -w / 2, 0], [t, h, w / 2, 0]];
    for (const [bw, bh, x, y] of parts) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.1), M.frameline);
      b.position.set(x, y, 0.2);
      f.add(b);
    }
    return f;
  };
  mask.add(line(17, 11), line(12.5, 8.2), line(7, 4.6));
  mask.position.set(43, Y, 7);
  g.add(mask);
  // Meter LEDs below the frame.
  for (const s of [-1, 1]) {
    const led = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.8, 3), M.led);
    led.rotation.z = s * Math.PI / 2;
    led.position.set(43 + s * 2.2, Y - 8.2, 7);
    g.add(led);
  }

  // Illumination prism behind the frosted window.
  const illum = mesh(new THREE.BoxGeometry(12, 8, 5), M.frosted);
  illum.position.set(19, Y, 12.5);
  g.add(illum);

  // Rangefinder: swinging mirror, compensation optics, cam-follower arm.
  const rf = new THREE.Group();
  const mirror = mesh(G.extrudeForward(G.roundedRectShape(10, 9, 0.8), 0.9, 0.2), M.chromePolished);
  const mirrorPivot = new THREE.Group();
  mirrorPivot.position.set(-47, Y, 4);
  mirrorPivot.rotation.y = -Math.PI / 4;
  mirror.position.z = -0.45;
  mirrorPivot.add(mirror);
  const mirrorBack = mesh(new THREE.BoxGeometry(11, 10, 1.2), M.anodizedMatte);
  mirrorBack.position.z = -1.4;
  mirrorPivot.add(mirrorBack);
  rf.add(mirrorPivot);
  const pivotPin = mesh(new THREE.CylinderGeometry(0.7, 0.7, 14, 16), M.steel);
  pivotPin.position.set(-47, Y - 1, 4);
  rf.add(pivotPin);
  const tube = mesh(new THREE.CylinderGeometry(3, 3, 76, 48, 1, true, 0.9, TAU - 1.8), M.matteBlack);
  tube.rotation.z = Math.PI / 2;
  tube.position.set(-4, Y, 4);
  rf.add(tube);
  const compLens = mesh(G.latheZ([[0, -0.9], [2.7, -0.6, 1], [2.7, 0.6], [0, 0.9, 1]], 32), M.glass, { cast: false });
  compLens.rotation.y = Math.PI / 2;
  compLens.position.set(-18, Y, 4);
  rf.add(compLens);
  // Cam-follower arm running down to the roller on the lens cam.
  const armStart = new THREE.Vector3(-45, Y - 4, 5), armEnd = new THREE.Vector3(10, D.lensY + 22.2, 12.5);
  const armLen = armStart.distanceTo(armEnd);
  const arm = mesh(new THREE.BoxGeometry(armLen, 1.6, 2.2), M.steel);
  arm.position.copy(armStart).lerp(armEnd, 0.5);
  arm.lookAt(armEnd);
  arm.rotateY(Math.PI / 2);
  rf.add(arm);
  const roller = mesh(G.latheZ([[0, -1.2], [2.1, -1.2], [2.1, 1.2], [0, 1.2]], 32), M.brass);
  roller.position.copy(armEnd);
  rf.add(roller);
  g.add(rf);

  // Light paths (shown in the rangefinder chapter).
  const lightMat = rayMaterial(new THREE.Color(0.55, 0.8, 1.0));
  const lightMat2 = rayMaterial(new THREE.Color(1.0, 0.75, 0.45));
  const mk = (pts, mat, r = 0.35) => {
    const curve = new THREE.CurvePath();
    for (let i = 0; i < pts.length - 1; i++) curve.add(new THREE.LineCurve3(pts[i], pts[i + 1]));
    const t = new THREE.Mesh(new THREE.TubeGeometry(curve, 320, r, 8, false), mat);
    t.frustumCulled = false;
    t.renderOrder = 10;
    return t;
  };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const paths = new THREE.Group();
  paths.add(mk([V(-47, Y, 70), V(-47, Y, 4), V(43, Y, 4), V(43, Y + 0.6, -60)], lightMat));
  paths.add(mk([V(43.8, Y - 0.6, 80), V(43.8, Y - 0.6, -60)], lightMat2));
  g.add(paths);

  rig.add(g, 'rf', [0, 60, 0]);
  rig.add(vf, 'rf', [0, 0, 0]);
  rig.add(objective, 'rfSpread', [0, 0, 16]);
  rig.add(eyeLens, 'rfSpread', [0, 0, -16]);
  rig.add(mask, 'rfSpread', [0, 12, 0]);
  rig.add(illum, 'rfSpread', [0, 8, 6]);
  rig.add(mirrorPivot, 'rfSpread', [-6, 6, 0]);
  rig.floaty(g, 1.2, 0.55);

  rig.anchor(mask, 'frameMask', [0, 7, 0]);
  rig.anchor(cube, 'beamSplitter', [0, 4.5, 0]);
  rig.anchor(mirrorPivot, 'rfMirror', [0, 5, 0]);
  rig.anchor(objective, 'objective', [0, 6, 1.5]);
  rig.anchor(roller, 'roller', [0, -2, 0]);
  rig.anchor(eyeLens, 'eyeLens', [0, 4.5, 0]);
  return { group: g, lightMats: [lightMat, lightMat2], mirrorPivot };
}

// ---- Light-meter electronics -------------------------------------------------------
export function buildElectronics(M, rig) {
  const g = new THREE.Group();
  g.name = 'electronics';
  const y = D.bodyY1 + 0.1;
  const board = mesh(G.extrudeUp(G.roundedRectShape(46, 20, 2), 0.8, 0.15), M.pcb);
  board.position.set(-8, y, -2);
  g.add(board);
  const chip = (w, d, h, x, z, mat = M.chip) => {
    const c = mesh(G.extrudeUp(G.roundedRectShape(w, d, 0.3), h, 0.1), mat);
    c.position.set(x, y + 0.8, z);
    g.add(c);
    return c;
  };
  const ic = chip(9, 9, 1.2, -14, -4);
  chip(5, 3, 0.9, 2, 2);
  chip(3, 2, 0.8, 8, -6);
  chip(4, 4, 1, -24, 3);
  for (let i = 0; i < 6; i++) {
    const cap = mesh(new THREE.CylinderGeometry(1, 1, 2.6, 16), i % 2 ? M.chip : M.gold);
    cap.position.set(-2 + i * 3.2, y + 2.1, 6.5);
    g.add(cap);
  }
  // Photodiode looking back at the shutter curtain.
  const diode = mesh(G.latheZ([[0, 0], [2, 0], [2, 3], [1.4, 3.6], [0, 3.8, 1]], 24), M.chip);
  diode.rotation.y = Math.PI;
  diode.rotation.x = -0.35;
  diode.position.set(-6, D.lensY + 22, 12);
  g.add(diode);
  const diodeLens = mesh(new THREE.SphereGeometry(1.3, 16, 12), M.glass, { cast: false });
  diodeLens.position.set(-6, D.lensY + 21, 8.4);
  g.add(diodeLens);
  // Flex ribbon from board to diode.
  const flex = mesh(new THREE.PlaneGeometry(4, 16), new THREE.MeshPhysicalMaterial({ color: 0xc4741c, roughness: 0.4, clearcoat: 0.6, side: THREE.DoubleSide }));
  flex.rotation.x = -0.9;
  flex.position.set(-6, y - 0.5, 8);
  g.add(flex);

  rig.add(g, 'rf', [0, 26, 0]);
  rig.floaty(g, 1, 0.8);
  rig.anchor(ic, 'pcb', [0, 1.4, 0]);
  rig.anchor(diode, 'photodiode', [0, 2, 0]);
  return { group: g };
}
