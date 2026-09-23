// Die-cast chassis, vulcanite skins, rear panel, body mount and base plate.
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import * as T from '../core/textures.js';

const { mesh } = G;

function halfAnnulus(rOuter, rInner, cx, side) {
  // Plan-view half ring around (cx, 0); side = +1 for the +X end, -1 for -X.
  const s = new THREE.Shape();
  const a0 = side > 0 ? -Math.PI / 2 : Math.PI / 2;
  const a1 = a0 + Math.PI;
  s.moveTo(cx + Math.cos(a0) * rOuter, Math.sin(a0) * rOuter);
  s.absarc(cx, 0, rOuter, a0, a1, false);
  s.lineTo(cx + Math.cos(a1) * rInner, Math.sin(a1) * rInner);
  s.absarc(cx, 0, rInner, a1, a0, true);
  s.closePath();
  return s;
}

function frontPanelShape(holeR, extraHoles = []) {
  const s = new THREE.Shape();
  const x0 = -D.halfFlat, x1 = D.halfFlat;
  s.moveTo(x0, D.bodyY0);
  s.lineTo(x1, D.bodyY0);
  s.lineTo(x1, D.bodyY1);
  s.lineTo(x0, D.bodyY1);
  s.closePath();
  if (holeR) {
    const h = new THREE.Path();
    G.circlePath(h, holeR, 0, D.lensY, true);
    s.holes.push(h);
  }
  for (const [x, y, r] of extraHoles) {
    const h = new THREE.Path();
    G.circlePath(h, r, x, y, true);
    s.holes.push(h);
  }
  return s;
}

// Throat: lofts from the round mount to the rectangular gate, with light baffles.
function throatGeometry() {
  const segs = 128, steps = 40;
  const z0 = D.chassisInner + 1.6, z1 = D.filmZ + 3.6;
  const rw = 20.5, rh = 14.5; // half-extent of the rectangular end
  const pos = [], idx = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps;
    const blend = t * t * (3 - 2 * t);
    const rib = Math.pow(Math.max(0, Math.sin(t * Math.PI * 9)), 6) * 0.9;
    const z = z0 + (z1 - z0) * t;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      const cr = D.throatR - 0.2;
      // Ray / rounded-rectangle intersection (superellipse approximation).
      const n = 8;
      const rr = Math.pow(Math.pow(Math.abs(c) / rw, n) + Math.pow(Math.abs(s) / rh, n), -1 / n);
      const r = cr + (rr - cr) * blend - rib;
      pos.push(c * r, D.lensY + s * r, z);
    }
  }
  const row = segs + 1;
  for (let k = 0; k < steps; k++) {
    for (let i = 0; i < segs; i++) {
      const a = k * row + i;
      idx.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildBody(M, rig) {
  const body = new THREE.Group();
  body.name = 'body';

  // ---- Chassis -------------------------------------------------------------
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  body.add(chassis);

  const chFront = mesh(G.extrudeForward(frontPanelShape(D.throatR, [[-38, -23, 6.2], [33, -15, 3.2]]), D.wall), M.chassis);
  chFront.position.z = D.chassisInner;
  chassis.add(chFront);

  for (const side of [1, -1]) {
    const end = mesh(G.extrudeUp(halfAnnulus(D.chassisOuter, D.chassisInner, side * D.halfFlat, side), D.bodyY1 - D.bodyY0), M.chassis);
    end.position.y = D.bodyY0;
    chassis.add(end);
    // Film chamber walls.
    const wall = mesh(new THREE.BoxGeometry(1.4, D.bodyY1 - 2 - D.bodyY0, D.chassisInner - D.filmZ - 1), M.chassis);
    wall.position.set(side * 31.5, (D.bodyY1 - 2 + D.bodyY0) / 2, (D.chassisInner + D.filmZ + 1) / 2);
    chassis.add(wall);
    // Strap lugs.
    const lug = new THREE.Group();
    const post = mesh(G.latheY([[0, 0], [2.4, 0], [2.4, 1.2], [1.7, 2.0], [1.7, 3.6], [0, 3.6]], 32), M.chromePolished);
    post.rotation.z = -side * Math.PI / 2;
    lug.add(post);
    const eye = mesh(new THREE.TorusGeometry(2.4, 0.75, 16, 48), M.chromePolished);
    eye.position.x = side * 4.6;
    eye.rotation.y = Math.PI / 2;
    lug.add(eye);
    lug.position.set(side * (D.halfFlat + D.endR - 0.3), 11, 0);
    chassis.add(lug);
    rig.add(lug, 'skin', [side * 14, 0, 0]);
    if (side > 0) rig.anchor(lug, 'strapLug', [side * 5, 0, 0]);
  }

  // Top deck.
  const deck = mesh(G.extrudeUp(G.roundedRectShape(2 * D.halfFlat + 2 * D.chassisInner, 2 * D.chassisInner, D.chassisInner), 2, 0.3), M.chassis);
  deck.position.y = D.bodyY1 - 2;
  chassis.add(deck);

  // Throat with baffles, and the gate mask / film rails at the film plane.
  const throat = mesh(throatGeometry(), M.matteBlack);
  chassis.add(throat);
  rig.anchor(chassis, 'throat', [0, D.lensY + 18, 2]);

  const gateShape = G.roundedRectShape(64, 44, 2, 0, D.lensY);
  const gateHole = new THREE.Path();
  G.roundedRectPath(gateHole, 36, 24, 0.6, 0, D.lensY, true);
  gateShape.holes.push(gateHole);
  const gate = mesh(G.extrudeForward(gateShape, 0.8), M.anodizedMatte);
  gate.position.z = D.filmZ + 1.1;
  chassis.add(gate);
  for (const [dy, w] of [[18.3, 1.3], [-18.3, 1.3], [12.9, 0.9], [-12.9, 0.9]]) {
    const rail = mesh(new THREE.BoxGeometry(48, w, 1.1), M.chromePolished);
    rail.position.set(0, D.lensY + dy, D.filmZ + 0.55);
    chassis.add(rail);
  }
  rig.anchor(chassis, 'rails', [22, D.lensY - 18.3, D.filmZ]);

  // Body mount: chrome flange with four screws.
  const mount = new THREE.Group();
  mount.name = 'bodyMount';
  const mountRing = mesh(G.latheZ([
    [D.throatR, D.chassisOuter - 1], [25, D.chassisOuter], [25, D.mountZ - 0.5], [24.4, D.mountZ],
    [D.throatR + 0.4, D.mountZ], [D.throatR, D.mountZ - 0.3], [D.throatR, D.chassisOuter - 1],
  ], 128), M.chromePolished);
  mount.add(mountRing);
  // Bayonet lugs behind the flange.
  for (let i = 0; i < 3; i++) {
    const sector = mesh(G.cylZ(D.throatR - 0.2, D.mountZ - 2.8, D.mountZ - 1.6, { segments: 24, thetaStart: i * 2.094, thetaLength: 0.8 }), M.chromePolished);
    mount.add(sector);
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const s = G.screw(M, 0.9);
    s.rotation.x = Math.PI / 2;
    s.position.set(Math.cos(a) * 23.2, Math.sin(a) * 23.2, D.mountZ - 0.35);
    mount.add(s);
  }
  // Red lens-index dot.
  const idxDot = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 20), M.redEnamel);
  idxDot.rotation.x = Math.PI / 2;
  idxDot.position.set(8.5, 22.7, D.mountZ - 0.3);
  mount.add(idxDot);
  mount.position.y = D.lensY;
  body.add(mount);
  rig.add(mount, 'skin', [0, 0, 16]);
  rig.anchor(mount, 'mount', [-17, -17, D.mountZ]);

  // ---- Vulcanite skins -----------------------------------------------------
  const skins = new THREE.Group();
  skins.name = 'vulcanite';
  body.add(skins);
  const frontSkin = mesh(G.boxUV(G.extrudeForward(frontPanelShape(25.2, [[-38, -23, 6.6], [33, -15, 4.6]]), D.leather, 0.15, 64, 1)), M.leather);
  frontSkin.position.z = D.chassisOuter;
  skins.add(frontSkin);
  rig.add(frontSkin, 'skin', [0, 0, 30]);
  rig.anchor(frontSkin, 'vulcanite', [-48, -28, D.leather]);
  for (const side of [1, -1]) {
    const endSkin = mesh(G.boxUV(G.extrudeUp(halfAnnulus(D.endR, D.chassisOuter, side * D.halfFlat, side), D.bodyY1 - D.bodyY0, 0.1, 64, 1)), M.leather);
    endSkin.position.y = D.bodyY0;
    skins.add(endSkin);
    rig.add(endSkin, 'skin', [side * 26, 0, 0]);
  }

  // ---- Front controls ------------------------------------------------------
  const release = new THREE.Group();
  release.name = 'lensRelease';
  release.add(mesh(G.latheZ([[0, 0], [4.4, 0], [4.4, 0.6], [3.9, 1.0], [3.9, 2.4], [3.5, 2.9], [0, 3.1, 1]], 48), M.chromeTurned));
  release.position.set(33, -15, D.frontZ - 0.2);
  body.add(release);
  rig.add(release, 'skin', [0, 0, 22]);
  rig.anchor(release, 'lensRelease', [2, -2, 3]);

  const selector = new THREE.Group();
  selector.name = 'frameSelector';
  selector.add(mesh(G.latheZ([[0, 0], [2.6, 0], [2.6, 1.2], [2, 1.6], [0, 1.6]], 32), M.body));
  const arm = mesh(G.extrudeForward(G.roundedRectShape(2.6, 10, 1.2, 0, -4.5), 1.2, 0.3), M.body);
  arm.position.z = 0.8;
  arm.rotation.z = 0.5;
  selector.add(arm);
  selector.position.set(31, 7, D.frontZ);
  body.add(selector);
  rig.add(selector, 'skin', [0, 0, 20]);
  rig.anchor(selector, 'frameSelector', [4, -6, 2]);

  // Film-rewind release lever ("R") on the front, left of the mount.
  const rLever = new THREE.Group();
  rLever.name = 'rewindLever';
  rLever.add(mesh(G.latheZ([[0, 0], [2.4, 0], [2.4, 0.9], [1.9, 1.4], [0, 1.4]], 32), M.body));
  const rArm = mesh(G.extrudeForward(G.roundedRectShape(2.2, 9, 1.1, 0, 3.8), 1.0, 0.3), M.body);
  rArm.position.z = 0.9;
  rArm.rotation.z = -0.35;
  rLever.add(rArm);
  rLever.position.set(-27, 7, D.frontZ);
  body.add(rLever);
  rig.add(rLever, 'skin', [0, 0, 20]);

  // Die-cast bosses and screws on the inside of the front casting.
  for (const [x, y] of [[-46, 10], [46, 10], [-46, -30], [46, -30], [-27, -32], [27, -32]]) {
    const boss = mesh(G.latheZ([[0, 0], [2.6, 0], [2.6, 2.2], [2.2, 2.6], [0, 2.6]], 24), M.chassis);
    boss.rotation.y = Math.PI;
    boss.position.set(x, y, D.chassisInner);
    chassis.add(boss);
    const sc = G.screw(M, 1.1);
    sc.rotation.x = -Math.PI / 2;
    sc.position.set(x, y, D.chassisInner - 2.6);
    chassis.add(sc);
  }

  // Battery compartment: two SR44 cells behind a coin-slot cap.
  const battery = new THREE.Group();
  battery.name = 'battery';
  const cap = new THREE.Group();
  cap.add(mesh(G.ridgedRingZ({ rOuter: 6.5, rInner: 0.01, z0: 0, z1: 1.8, ridges: 48, depth: 0.25, chamfer: 0.3 }), M.body));
  const capFace = mesh(new THREE.CircleGeometry(6.1, 48), M.chromeTurned);
  capFace.position.z = 1.81;
  cap.add(capFace);
  const coin = mesh(new THREE.BoxGeometry(7, 0.9, 0.6), M.matteBlack);
  coin.position.z = 1.7;
  coin.rotation.z = 0.4;
  cap.add(coin);
  cap.position.set(-38, -23, D.frontZ - 0.4);
  battery.add(cap);
  const cells = [];
  for (let i = 0; i < 2; i++) {
    const cell = new THREE.Group();
    cell.add(mesh(G.latheZ([[0, 0], [5.4, 0], [5.7, 0.4], [5.7, 5.0], [5.4, 5.4], [3.6, 5.4], [3.6, 5.6], [0, 5.6]], 48), M.steel));
    cell.position.set(-38, -23, D.chassisInner - 5.6 * (i + 1) + 1.6);
    battery.add(cell);
    cells.push(cell);
  }
  body.add(battery);
  rig.add(cap, 'skin', [0, 0, 44]);
  rig.add(cells[1], 'skin', [0, 0, 36]);
  rig.add(cells[0], 'skin', [0, 0, 44]);
  rig.anchor(cells[0], 'battery', [-5, -4, 3]);

  // ---- Rear panel ----------------------------------------------------------
  const rear = new THREE.Group();
  rear.name = 'rearPanel';
  const back = mesh(G.extrudeForward(frontPanelShape(0), D.wall), M.chassis);
  back.position.z = -D.chassisOuter;
  rear.add(back);
  const backSkin = mesh(G.boxUV(G.extrudeForward(frontPanelShape(0, [[-40, -19, 7.2]]), D.leather, 0.15, 64, 1)), M.leather);
  backSkin.position.z = -D.frontZ;
  rear.add(backSkin);
  rig.add(backSkin, 'skin', [0, 0, -18]);
  // Hinged back-door outline and hinge pin in the vulcanite.
  const door = new THREE.Group();
  const seam = (w, h, x, y) => {
    const m = mesh(new THREE.BoxGeometry(w, h, 0.25), M.matteBlack, { cast: false });
    m.position.set(x, y, -D.frontZ - 0.05);
    door.add(m);
  };
  seam(78, 0.5, -4, 11); seam(78, 0.5, -4, -30); seam(0.5, 41, -43, -9.5); seam(0.5, 41, 35, -9.5);
  const hinge = mesh(G.cylZ(0.9, 0, 1, { segments: 16 }), M.chromePolished);
  hinge.geometry = new THREE.CylinderGeometry(0.9, 0.9, 40, 16);
  hinge.position.set(35.6, -9.5, -D.frontZ - 0.4);
  door.add(hinge);
  const latch = mesh(G.extrudeForward(G.roundedRectShape(6, 3, 1.4), 1.2, 0.35), M.body);
  latch.rotation.y = Math.PI;
  latch.position.set(-38, -9.5, -D.frontZ + 0.2);
  door.add(latch);
  rear.add(door);
  rig.add(door, 'skin', [0, 0, -18]);

  // Pressure plate on springs.
  const pp = new THREE.Group();
  pp.name = 'pressurePlate';
  pp.add(mesh(G.extrudeForward(G.roundedRectShape(54, 31, 2.5, 0, D.lensY), 0.9, 0.25), M.chromePolished));
  for (const x of [-16, 16]) {
    const sp = mesh(G.springGeometry(2.2, 0.28, 5, D.filmZ - 1.2 + D.chassisInner), M.steel);
    sp.rotation.x = -Math.PI / 2;
    sp.position.set(x, D.lensY, -0.2);
    pp.add(sp);
  }
  pp.position.z = D.filmZ - 1.4;
  rear.add(pp);
  rig.add(pp, 'rear', [0, 0, 26]);
  rig.anchor(pp, 'pressurePlate', [24, D.lensY + 12, 1]);
  // Film-speed reminder dial on the back.
  const iso = new THREE.Group();
  iso.name = 'isoDial';
  iso.add(mesh(G.ridgedRingZ({ rOuter: 6.6, rInner: 0.01, z0: 0, z1: 2.6, ridges: 40, depth: 0.35 }), M.body));
  const isoFace = mesh(new THREE.CircleGeometry(6.0, 48), new THREE.MeshPhysicalMaterial({
    map: T.polarText({
      size: 512, base: '#111',
      items: ['25', '50', '100', '200', '400', '800', '1600', '3200', '6400'].map((t, i, a) => ({
        text: t, angle: (i / a.length) * Math.PI * 2, r: 0.68, size: 58, weight: 600, color: i === 4 ? '#e2342a' : '#efece4',
      })).concat([{ text: 'ISO', angle: 0, r: 0.15, size: 60, weight: 700 }]),
    }),
    roughness: 0.4, clearcoat: 0.6,
  }));
  isoFace.position.z = 2.61;
  iso.add(isoFace);
  iso.rotation.y = Math.PI;
  iso.position.set(-40, -19, -D.frontZ + 0.4);
  rear.add(iso);
  rig.add(iso, 'rear', [0, 0, -14]);
  rig.anchor(iso, 'isoDial', [0, 7, 1]);
  body.add(rear);
  rig.add(rear, 'rear', [0, 0, -92]);

  // ---- Base plate ----------------------------------------------------------
  const base = new THREE.Group();
  base.name = 'basePlate';
  const plate = mesh(G.extrudeUp(G.roundedRectShape(D.W, D.plateD, D.plateD / 2), D.bodyY0 - D.baseY0, 1.3), M.body);
  plate.position.y = D.baseY0;
  base.add(plate);
  // Inner skirt that slips over the body.
  const skirtS = G.roundedRectShape(D.W - 1.6, D.plateD - 1.6, D.plateD / 2 - 0.8);
  const skirtH = new THREE.Path();
  G.roundedRectPath(skirtH, D.W - 3.2, D.plateD - 3.2, D.plateD / 2 - 1.6, 0, 0, true);
  skirtS.holes.push(skirtH);
  const skirt = mesh(G.extrudeUp(skirtS, 5), M.chassis);
  skirt.position.y = D.bodyY0 - 0.4;
  base.add(skirt);
  // Locking key.
  const key = new THREE.Group();
  key.add(mesh(G.latheY([[0, 0], [7.2, 0], [7.2, 0.5], [6.6, 1.0], [0, 1.0]], 48), M.chromeTurned));
  const dring = mesh(new THREE.TorusGeometry(5.2, 0.8, 12, 48, Math.PI), M.chromePolished);
  dring.rotation.x = Math.PI / 2;
  dring.position.y = 1.1;
  key.add(dring);
  const keyBar = mesh(new THREE.CylinderGeometry(0.8, 0.8, 10.4, 16), M.chromePolished);
  keyBar.rotation.z = Math.PI / 2;
  keyBar.position.y = 1.1;
  key.add(keyBar);
  key.rotation.x = Math.PI;
  key.position.set(-44, D.baseY0 + 0.05, 0);
  base.add(key);
  rig.add(key, 'base', [0, -14, 0], [0.9, 0, 0]);
  rig.anchor(key, 'lockKey', [0, 0, 6]);
  // Tripod socket and engraving.
  const socket = mesh(G.latheY([[4.6, 0], [4.6, 0.6], [3.2, 0.9], [3.2, 0.2], [2.8, 0.2], [2.8, 4], [0, 4]], 48), M.chromePolished);
  socket.rotation.x = Math.PI;
  socket.position.set(8, D.baseY0 + 0.6, 0);
  base.add(socket);
  const hole = mesh(new THREE.CircleGeometry(2.8, 32), M.matteBlack);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(8, D.baseY0 - 0.02, 0);
  base.add(hole);
  const baseText = mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshBasicMaterial({
    map: T.decal(1024, 205, (ctx, w, h, f) => {
      ctx.fillStyle = 'rgba(30,30,30,0.85)';
      ctx.font = `600 64px ${f.FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('OPEN  ◂  ▸  CLOSE', w / 2, h / 2);
    }),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  baseText.rotation.x = Math.PI / 2;
  baseText.position.set(-44, D.baseY0 - 0.03, 10.5);
  base.add(baseText);
  body.add(base);
  rig.add(base, 'base', [0, -70, 0]);
  rig.floaty(base, 1.5, 0.5);
  rig.anchor(base, 'basePlate', [48, D.baseY0, 12]);

  rig.floaty(rear, 1.4, 0.55);

  return { body, chassis, skins, rear, base, mount };
}
