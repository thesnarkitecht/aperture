// Optical rangefinder and bright-line viewfinder (M11: LED-illuminated frames).
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import { rayMaterial } from './lens.js';

const { mesh } = G;
const TAU = Math.PI * 2;

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

  // LED frame-line illuminator: a small board of white SMD LEDs feeding a
  // light guide into the mask (replaces the frosted window of film Ms).
  const ledUnit = new THREE.Group();
  const ledBoard = mesh(G.extrudeForward(G.roundedRectShape(14, 7, 0.8), 0.8, 0.15), M.pcbBlack);
  ledBoard.position.set(0, 0, 0);
  ledUnit.add(ledBoard);
  for (let i = 0; i < 3; i++) {
    const led = mesh(new THREE.BoxGeometry(1.6, 1.2, 0.7), M.white, { cast: false });
    led.position.set(-4 + i * 4, 0, 1.1);
    ledUnit.add(led);
    const lens = mesh(new THREE.BoxGeometry(1.1, 0.8, 0.12), M.frameline, { cast: false });
    lens.position.set(-4 + i * 4, 0, 1.5);
    ledUnit.add(lens);
  }
  const guide = mesh(G.extrudeForward(G.roundedRectShape(10, 5, 1), 9, 0.4), M.frosted);
  guide.position.set(0, 0, -9.4);
  ledUnit.add(guide);
  ledUnit.position.set(30, Y + 1, 14.2);
  g.add(ledUnit);
  const illum = ledUnit;

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
  rig.anchor(ledUnit, 'frameLeds', [0, 4, 0]);
  return { group: g, lightMats: [lightMat, lightMat2], mirrorPivot };
}

