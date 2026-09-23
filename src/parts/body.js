// M11 body: magnesium chassis, leatherette, body mount, front controls,
// rear cover with buttons and d-pad, bottom plate with battery, SD and USB-C.
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import * as T from '../core/textures.js';
import { buildDisplay, buildBattery } from './digital.js';

const { mesh } = G;
const TAU = Math.PI * 2;

// Flat front/back panel between the elliptical ends, with round holes [x, y, r].
function panelShape(holes = [], rects = []) {
  const s = new THREE.Shape();
  const x0 = -D.halfFlat, x1 = D.halfFlat;
  s.moveTo(x0, D.bodyY0);
  s.lineTo(x1, D.bodyY0);
  s.lineTo(x1, D.bodyY1);
  s.lineTo(x0, D.bodyY1);
  s.closePath();
  for (const [x, y, r] of holes) {
    const h = new THREE.Path();
    G.circlePath(h, r, x, y, true);
    s.holes.push(h);
  }
  for (const [w, h, x, y, r] of rects) {
    const p = new THREE.Path();
    G.roundedRectPath(p, w, h, r, x, y, true);
    s.holes.push(p);
  }
  return s;
}

// Throat: lofts from the round mount to the rectangular gate, with light baffles.
function throatGeometry() {
  const segs = 128, steps = 40;
  const z0 = D.chassisInner + 1.6, z1 = D.filmZ + 5.0;
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
      pos.push(D.lensX + c * r, D.lensY + s * r, z);
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

// Rear layout (x > 0 is the photographer's left).
export const R = {
  lcd: { cx: 8, cy: -8.5, w: 69, h: 47 },
  buttons: { x: 49, ys: [4.5, -8.5, -21.5], labels: ['PLAY', 'FN', 'MENU'] },
  dpad: { x: -39.5, y: -13 },
  led: { x: -39.5, y: 5.5 },
};
// Front controls, measured from the front reference photo.
export const F = {
  release: { x: -23.2, y: -6.1, r: 4.1 },
  selector: { x: 42.2, y: -5.5, tipX: 44.4, tipY: 5.9 },
  lug: { y: 9.4, z: 8 },
};
// Bottom layout.
export const B = {
  battery: { x: 44, z: 0, w: 18, d: 25, h: 50 },
  socket: { x: 8 },
  lever: { x: 22 },
  usb: { x: 62 },
};

// Engraved label for small buttons (reads from behind: U flipped by the rotation).
function labelDecal(text, w, h, size = 64) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
    map: T.decal(256, Math.round(256 * h / w), (ctx, cw, ch, f) => {
      ctx.fillStyle = 'rgba(235,232,225,0.9)';
      ctx.font = `600 ${size}px ${f.FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cw / 2, ch / 2 + 2);
    }),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
  }));
}

export function buildBody(M, rig) {
  const body = new THREE.Group();
  body.name = 'body';
  const lx = D.lensX, ly = D.lensY;

  // ---- Chassis (magnesium die-casting) -------------------------------------------
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  body.add(chassis);

  const chFront = mesh(G.extrudeForward(panelShape([[lx, ly, D.throatR], [F.release.x, F.release.y, 3.4]]), D.wall), M.chassis);
  chFront.position.z = D.chassisInner;
  chassis.add(chFront);

  const aO = D.endA - D.leather, bO = D.chassisOuter;
  for (const side of [1, -1]) {
    const end = mesh(G.extrudeUp(G.halfEllipseRing(aO, bO, aO - D.wall, bO - D.wall, side * D.halfFlat, side), D.bodyY1 - D.bodyY0), M.chassis);
    end.position.y = D.bodyY0;
    chassis.add(end);
  }
  // Internal bulkheads either side of the throat (battery bay on the +X side).
  for (const x of [-14.6, 33.2]) {
    const wall = mesh(new THREE.BoxGeometry(1.4, D.bodyY1 - 2 - D.bodyY0, 2 * D.chassisInner), M.chassis);
    wall.position.set(x, (D.bodyY1 - 2 + D.bodyY0) / 2, 0);
    chassis.add(wall);
  }
  const deck = mesh(G.extrudeUp(G.planShape({ x0: -D.W / 2 + 2.5, x1: D.W / 2 - 2.5, d: 2 * D.chassisInner, a: D.endA - 2.5 }), 2, 0.3), M.chassis);
  deck.position.y = D.bodyY1 - 2;
  chassis.add(deck);
  chassis.add(mesh(throatGeometry(), M.matteBlack));

  for (const [x, y] of [[-46, 10], [50, 10], [-46, -28], [50, -28], [-22, -30], [40, -30]]) {
    const boss = mesh(G.latheZ([[0, 0], [2.6, 0], [2.6, 2.2], [2.2, 2.6], [0, 2.6]], 24), M.chassis);
    boss.rotation.y = Math.PI;
    boss.position.set(x, y, D.chassisInner);
    chassis.add(boss);
    const sc = G.screw(M, 1.1);
    sc.rotation.x = -Math.PI / 2;
    sc.position.set(x, y, D.chassisInner - 2.6);
    chassis.add(sc);
  }

  // Strap lugs: teardrop eyelets on the ends, ahead of centre.
  for (const side of [1, -1]) {
    const lug = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(0, -3.9);
    s.lineTo(4.4, -3.2);
    s.absarc(4.6, 0, 3.2, -Math.PI / 2, Math.PI / 2, false);
    s.lineTo(0, 3.9);
    s.closePath();
    const hole = new THREE.Path();
    G.circlePath(hole, 1.45, 5.0, 0, true);
    s.holes.push(hole);
    const plate = mesh(G.extrudeForward(s, 2.6, 0.7, 24, 3), M.chromePolished);
    plate.position.z = -1.3;
    lug.add(plate);
    const bz = F.lug.z, b = D.depth / 2;
    const ex = D.halfFlat + D.endA * Math.sqrt(1 - (bz / b) * (bz / b));
    lug.position.set(side * (ex - 1.2), F.lug.y, bz);
    if (side < 0) lug.scale.x = -1;
    lug.rotation.y = -side * 0.35; // angled slightly forward
    chassis.add(lug);
    rig.add(lug, 'skin', [side * 14, 0, 0]);
  }

  // Body mount: chrome flange, four screws, bayonet lugs, 6-bit code reader.
  const mount = new THREE.Group();
  mount.name = 'bodyMount';
  mount.add(mesh(G.latheZ([
    [D.throatR, D.chassisOuter - 1], [25, D.chassisOuter], [25, D.mountZ - 0.5], [24.4, D.mountZ],
    [D.throatR + 0.4, D.mountZ], [D.throatR, D.mountZ - 0.3], [D.throatR, D.chassisOuter - 1],
  ], 128), M.chromePolished));
  for (let i = 0; i < 3; i++) {
    mount.add(mesh(G.cylZ(D.throatR - 0.2, D.mountZ - 2.8, D.mountZ - 1.6, { segments: 24, thetaStart: i * 2.094, thetaLength: 0.8 }), M.chromePolished));
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const sc = G.screw(M, 0.9);
    sc.rotation.x = Math.PI / 2;
    sc.position.set(Math.cos(a) * 23.2, Math.sin(a) * 23.2, D.mountZ - 0.35);
    mount.add(sc);
  }
  const code = mesh(G.extrudeForward(G.roundedRectShape(3.2, 1.6, 0.5), 0.3), M.glassDark);
  code.position.set(-17.5, -14.8, D.mountZ - 0.28);
  code.rotation.z = -0.7;
  mount.add(code);
  mount.position.set(lx, ly, 0);
  body.add(mount);
  rig.add(mount, 'skin', [0, 0, 16]);

  // ---- Leatherette: coarse pebble grain on the front and around the ends ---------------------
  const frontSkin = mesh(G.boxUV(G.extrudeForward(panelShape([[lx, ly, 25.2], [F.release.x, F.release.y, 4.6]]), D.leather, 0.15, 64, 1)), M.leather);
  frontSkin.position.z = D.chassisOuter;
  body.add(frontSkin);
  rig.add(frontSkin, 'skin', [0, 0, 30]);
  for (const side of [1, -1]) {
    const endSkin = mesh(G.boxUV(G.extrudeUp(G.halfEllipseRing(D.endA, D.depth / 2, aO, bO, side * D.halfFlat, side), D.bodyY1 - D.bodyY0, 0.1, 64, 1)), M.leather);
    endSkin.position.y = D.bodyY0;
    body.add(endSkin);
    rig.add(endSkin, 'skin', [side * 26, 0, 0]);
  }

  // ---- Front controls ------------------------------------------------------------------
  // Lens release: domed button in a chrome housing that bridges to the mount flange.
  const release = new THREE.Group();
  release.name = 'lensRelease';
  const hs = G.roundedRectShape(13.6, 11.4, 5.7, 6.8 - 5.7, 0);
  const housing = mesh(G.extrudeForward(hs, 1.7, 0.55, 48, 3), M.chromePolished);
  release.add(housing);
  release.add(mesh(G.latheZ([[0, 0], [F.release.r, 0], [F.release.r, 1.6], [F.release.r - 0.5, 2.3, 1], [2.2, 2.75, 1], [0, 2.9, 1]], 64), M.chromeTurned));
  release.position.set(F.release.x, F.release.y, D.frontZ - 0.1);
  body.add(release);
  rig.add(release, 'skin', [0, 0, 22]);

  // Frame selector: a flat paddle pivoting on a round boss (its cap is a screw).
  const selector = new THREE.Group();
  selector.name = 'frameSelector';
  const dx = F.selector.tipX - F.selector.x, dy = F.selector.tipY - F.selector.y;
  const len = Math.hypot(dx, dy);
  selector.add(mesh(G.latheZ([[0, 0], [4.5, 0], [4.5, 1.0], [4.1, 1.4], [0, 1.4]], 48), M.body));
  const paddle = mesh(G.extrudeForward(G.roundedRectShape(len + 4.8, 4.8, 2.4, len / 2, 0), 1.3, 0.4, 32, 3), M.body);
  paddle.rotation.z = Math.atan2(dy, dx);
  paddle.position.z = 1.2;
  selector.add(paddle);
  const capScrew = G.screw(M, 1.8, false);
  capScrew.rotation.x = Math.PI / 2;
  capScrew.position.z = 2.5;
  selector.add(capScrew);
  selector.position.set(F.selector.x, F.selector.y, D.frontZ);
  body.add(selector);
  rig.add(selector, 'skin', [0, 0, 20]);

  // ---- Rear cover with display, buttons and d-pad ----------------------------------------------
  const rear = new THREE.Group();
  rear.name = 'rearCover';
  const holes = [
    [R.lcd.w - 2, R.lcd.h - 2, R.lcd.cx, R.lcd.cy, 1.4],
    ...R.buttons.ys.map((y) => [7.4, 5.6, R.buttons.x, y, 2.8]),
    [17, 17, R.dpad.x, R.dpad.y, 8.5],
  ];
  const back = mesh(G.extrudeForward(panelShape([], holes), D.wall), M.chassis);
  back.position.z = -D.chassisOuter;
  rear.add(back);
  const backSkin = mesh(G.boxUV(G.extrudeForward(panelShape([], holes.map(([w, h, x, y, r]) => [w + 1.2, h + 1.2, x, y, r + 0.6])), D.leather, 0.15, 64, 1)), M.leather);
  backSkin.position.z = -D.frontZ;
  rear.add(backSkin);
  rig.add(backSkin, 'skin', [0, 0, -12]);

  R.buttons.ys.forEach((y, i) => {
    const b = new THREE.Group();
    b.add(mesh(G.extrudeForward(G.roundedRectShape(6.6, 4.8, 2.4), 1.6, 0.45), M.rubber));
    const lbl = labelDecal(R.buttons.labels[i], 5.2, 1.8, R.buttons.labels[i].length > 2 ? 54 : 64);
    lbl.rotation.y = Math.PI;
    lbl.position.z = -0.01;
    b.add(lbl);
    b.position.set(R.buttons.x, y, -D.frontZ - 0.9);
    rear.add(b);
    rig.add(b, 'displaySpread', [0, 0, -10 - i * 2]);
  });

  const dpad = new THREE.Group();
  dpad.add(mesh(G.latheZ([[3.4, 0], [7.8, 0], [7.8, 0.9], [7.3, 1.5], [3.9, 1.5], [3.4, 1.0]], 64), M.rubber));
  for (let i = 0; i < 4; i++) {
    const nub = mesh(new THREE.ConeGeometry(0.9, 1.2, 3), M.anodized);
    const a = (i / 4) * TAU;
    nub.position.set(Math.cos(a) * 5.6, Math.sin(a) * 5.6, 1.6);
    nub.rotation.set(Math.PI / 2, 0, a - Math.PI / 2);
    nub.rotation.order = 'ZXY';
    dpad.add(nub);
  }
  dpad.add(mesh(G.latheZ([[0, 0], [3.0, 0], [3.0, 1.2], [2.6, 1.8, 1], [0, 2.0, 1]], 48), M.anodized));
  dpad.rotation.y = Math.PI;
  dpad.position.set(R.dpad.x, R.dpad.y, -D.frontZ + 0.2);
  rear.add(dpad);
  rig.add(dpad, 'displaySpread', [0, 0, -14]);

  const led = mesh(new THREE.CircleGeometry(0.9, 24), M.ledLens);
  led.rotation.y = Math.PI;
  led.position.set(R.led.x, R.led.y, -D.frontZ - 0.02);
  rear.add(led);

  body.add(rear);
  rig.add(rear, 'rear', [0, 0, -130]);
  rig.floaty(rear, 1.4, 0.55);

  const display = buildDisplay(M, rig, { cx: R.lcd.cx, cy: R.lcd.cy, w: R.lcd.w, h: R.lcd.h });
  body.add(display.group);

  // ---- Bottom plate ------------------------------------------------------------------------
  const base = new THREE.Group();
  base.name = 'bottomPlate';
  const bs = G.planShape({ x0: -D.W / 2, x1: D.W / 2, d: D.baseD, a: D.endA });
  const bh = new THREE.Path();
  G.roundedRectPath(bh, B.battery.w + 2, B.battery.d + 2, 3.2, B.battery.x, B.battery.z, true);
  bs.holes.push(bh);
  const plate = mesh(G.extrudeUp(bs, D.bodyY0 - D.baseY0, 1.3, 72, 4), M.body);
  plate.position.y = D.baseY0;
  base.add(plate);
  const socket = mesh(G.latheY([[4.8, 0], [4.8, 0.5], [3.3, 0.8], [3.3, 0.2], [2.9, 0.2], [2.9, 4], [0, 4]], 48), M.steel);
  socket.rotation.x = Math.PI;
  socket.position.set(B.socket.x, D.baseY0 + 0.5, 0);
  base.add(socket);
  const hole = mesh(new THREE.CircleGeometry(2.9, 32), M.matteBlack);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(B.socket.x, D.baseY0 - 0.02, 0);
  base.add(hole);
  for (let i = 0; i < 6; i++) {
    const t = mesh(new THREE.TorusGeometry(2.95, 0.1, 6, 48), M.steel, { cast: false });
    t.rotation.x = Math.PI / 2;
    t.position.set(B.socket.x, D.baseY0 + 0.3 + i * 0.5, 0);
    base.add(t);
  }
  const lever = new THREE.Group();
  lever.add(mesh(G.latheY([[0, 0], [2.4, 0], [2.4, 0.5], [0, 0.5]], 24), M.chromePolished));
  lever.add(mesh(G.extrudeUp(G.roundedRectShape(9, 3.4, 1.7, 4, 0), 0.9, 0.3), M.chromePolished));
  lever.rotation.x = Math.PI;
  lever.rotation.y = 0.3;
  lever.position.set(B.lever.x, D.baseY0 - 0.02, -5);
  base.add(lever);
  rig.add(lever, 'bottom', [0, -6, 0], [0, 0.9, 0]);
  const usb = new THREE.Group();
  usb.add(mesh(G.extrudeUp(G.roundedRectShape(3.4, 9.2, 1.6), 1.2, 0.2), M.steel));
  const usbHole = mesh(G.extrudeUp(G.roundedRectShape(2.5, 8.2, 1.2), 1.3), M.matteBlack);
  usbHole.position.y = -0.05;
  usb.add(usbHole);
  const tongue = mesh(new THREE.BoxGeometry(0.7, 0.9, 6.6), M.chip);
  tongue.position.y = 0.6;
  usb.add(tongue);
  usb.position.set(B.usb.x, D.baseY0 - 0.05, 0);
  base.add(usb);
  for (const [x, z] of [[-56, 10], [-30, 10], [18, 10], [56, -9]]) {
    const sc = G.screw(M, 0.8);
    sc.rotation.x = Math.PI;
    sc.position.set(x, D.baseY0 + 0.3, z);
    base.add(sc);
  }
  body.add(base);
  rig.add(base, 'bottom', [0, -46, 0]);
  rig.floaty(base, 1.4, 0.5);

  // SD card slot inside the battery bay, and the card itself.
  const sd = new THREE.Group();
  const sdX = B.battery.x + B.battery.w / 2 + 2.4;
  const slot = mesh(new THREE.BoxGeometry(2.6, 26, 26), M.steel);
  slot.position.set(sdX, D.bodyY0 + 16, 0);
  sd.add(slot);
  const card = new THREE.Group();
  const cardBody = mesh(G.planarUV(G.extrudeForward(G.roundedRectShape(24, 32, 1.2), 2.1, 0.2), 24, 32), new THREE.MeshPhysicalMaterial({
    map: T.decal(384, 512, (ctx, w, h, f) => {
      ctx.fillStyle = '#1b1c1e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c8102e';
      ctx.fillRect(0, h * 0.58, w, 12);
      ctx.fillStyle = '#e8e6e0';
      ctx.font = `800 54px ${f.FONT_SANS}`;
      ctx.fillText('SDXC', 40, 120);
      ctx.font = `600 40px ${f.FONT_SANS}`;
      ctx.fillText('128 GB', 40, 190);
      ctx.fillText('U3  V90', 40, 250);
    }),
    roughness: 0.45, clearcoat: 0.5,
  }));
  card.add(cardBody);
  for (let i = 0; i < 9; i++) {
    const pad = mesh(new THREE.BoxGeometry(1.4, 3.2, 0.05), M.gold, { cast: false });
    pad.position.set(-9 + i * 2.2, -14, -0.03);
    card.add(pad);
  }
  card.rotation.y = Math.PI / 2;
  card.position.set(sdX, D.bodyY0 + 16, 0);
  sd.add(card);
  body.add(sd);
  rig.add(card, 'bottom', [0, -58, 0]);

  const battery = buildBattery(M, rig, B.battery);
  body.add(battery.group);

  return { body, chassis, rear, base, mount, display };
}
