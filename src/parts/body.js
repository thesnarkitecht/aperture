// M11 body: magnesium chassis, leatherette, body mount, front controls,
// rear cover with buttons and d-pad, bottom plate with battery, SD and USB-C.
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import * as T from '../core/textures.js';
import { buildDisplay, buildBattery } from './digital.js';

const { mesh } = G;
const TAU = Math.PI * 2;

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

// Rear layout (x > 0 is the photographer's left).
export const R = {
  lcd: { cx: 9, cy: -10.5, w: 69, h: 47 },
  buttons: { x: 48.2, ys: [2.5, -10.5, -23.5], labels: ['PLAY', 'FN', 'MENU'] },
  dpad: { x: -38.5, y: -15 },
  led: { x: -38.5, y: 3 },
};
// Bottom layout.
export const B = {
  battery: { x: 40, z: 0, w: 19, d: 27, h: 50 },
  socket: { x: 6 },
  lever: { x: 21 },
  usb: { x: 60.5 },
};

function rearPanelShape(holes) {
  const s = frontPanelShape(0);
  for (const [w, h, x, y, r] of holes) {
    const p = new THREE.Path();
    G.roundedRectPath(p, w, h, r, x, y, true);
    s.holes.push(p);
  }
  return s;
}

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

  // ---- Chassis (magnesium die-casting) -------------------------------------
  const chassis = new THREE.Group();
  chassis.name = 'chassis';
  body.add(chassis);

  const chFront = mesh(G.extrudeForward(frontPanelShape(D.throatR, [[33, -15, 3.2]]), D.wall), M.chassis);
  chFront.position.z = D.chassisInner;
  chassis.add(chFront);

  for (const side of [1, -1]) {
    const end = mesh(G.extrudeUp(halfAnnulus(D.chassisOuter, D.chassisInner, side * D.halfFlat, side), D.bodyY1 - D.bodyY0), M.chassis);
    end.position.y = D.bodyY0;
    chassis.add(end);
    // Internal bulkheads: battery bay on one side, electronics bay on the other.
    const wall = mesh(new THREE.BoxGeometry(1.4, D.bodyY1 - 2 - D.bodyY0, 2 * D.chassisInner), M.chassis);
    wall.position.set(side * 29.5, (D.bodyY1 - 2 + D.bodyY0) / 2, 0);
    chassis.add(wall);
    // Strap lugs: round eyelets.
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
  }

  const deck = mesh(G.extrudeUp(G.roundedRectShape(2 * D.halfFlat + 2 * D.chassisInner, 2 * D.chassisInner, D.chassisInner), 2, 0.3), M.chassis);
  deck.position.y = D.bodyY1 - 2;
  chassis.add(deck);

  const throat = mesh(throatGeometry(), M.matteBlack);
  chassis.add(throat);

  // Die-cast bosses and screws on the inside of the front casting.
  for (const [x, y] of [[-46, 10], [46, 10], [-46, -30], [46, -30], [-26, -32], [26, -32]]) {
    const boss = mesh(G.latheZ([[0, 0], [2.6, 0], [2.6, 2.2], [2.2, 2.6], [0, 2.6]], 24), M.chassis);
    boss.rotation.y = Math.PI;
    boss.position.set(x, y, D.chassisInner);
    chassis.add(boss);
    const sc = G.screw(M, 1.1);
    sc.rotation.x = -Math.PI / 2;
    sc.position.set(x, y, D.chassisInner - 2.6);
    chassis.add(sc);
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
    const s = G.screw(M, 0.9);
    s.rotation.x = Math.PI / 2;
    s.position.set(Math.cos(a) * 23.2, Math.sin(a) * 23.2, D.mountZ - 0.35);
    mount.add(s);
  }
  const idxDot = mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.4, 20), M.redEnamel);
  idxDot.rotation.x = Math.PI / 2;
  idxDot.position.set(8.5, 22.7, D.mountZ - 0.3);
  mount.add(idxDot);
  // Lens-code sensor: a small dark window in the flange reading the 6-bit code.
  const code = mesh(G.extrudeForward(G.roundedRectShape(3.2, 1.6, 0.5), 0.3), M.glassDark);
  code.position.set(-17.5, -14.8, D.mountZ - 0.28);
  code.rotation.z = -0.7;
  mount.add(code);
  mount.position.y = D.lensY;
  body.add(mount);
  rig.add(mount, 'skin', [0, 0, 16]);

  // ---- Leatherette (front and ends) ---------------------------------------------
  const frontSkin = mesh(G.boxUV(G.extrudeForward(frontPanelShape(25.2, [[33, -15, 4.8]]), D.leather, 0.15, 64, 1)), M.leather);
  frontSkin.position.z = D.chassisOuter;
  body.add(frontSkin);
  rig.add(frontSkin, 'skin', [0, 0, 30]);
  for (const side of [1, -1]) {
    const endSkin = mesh(G.boxUV(G.extrudeUp(halfAnnulus(D.endR, D.chassisOuter, side * D.halfFlat, side), D.bodyY1 - D.bodyY0, 0.1, 64, 1)), M.leather);
    endSkin.position.y = D.bodyY0;
    body.add(endSkin);
    rig.add(endSkin, 'skin', [side * 26, 0, 0]);
  }

  // ---- Front controls ------------------------------------------------------------
  const release = new THREE.Group();
  release.name = 'lensRelease';
  release.add(mesh(G.latheZ([[0, 0], [4.4, 0], [4.4, 0.6], [3.9, 1.0], [3.9, 2.4], [3.5, 2.9], [0, 3.1, 1]], 48), M.chromeTurned));
  release.position.set(33, -15, D.frontZ - 0.2);
  body.add(release);
  rig.add(release, 'skin', [0, 0, 22]);

  // Frame selector lever; its flat cap is a screw head.
  const selector = new THREE.Group();
  selector.name = 'frameSelector';
  selector.add(mesh(G.latheZ([[0, 0], [2.8, 0], [2.8, 1.2], [2.3, 1.6], [0, 1.6]], 32), M.body));
  const capScrew = G.screw(M, 1.6, false);
  capScrew.rotation.x = Math.PI / 2;
  capScrew.position.z = 1.6;
  selector.add(capScrew);
  const arm = mesh(G.extrudeForward(G.roundedRectShape(2.6, 10, 1.2, 0, -4.5), 1.2, 0.3), M.body);
  arm.position.z = 0.8;
  arm.rotation.z = 0.5;
  selector.add(arm);
  selector.position.set(31, 7, D.frontZ);
  body.add(selector);
  rig.add(selector, 'skin', [0, 0, 20]);

  // ---- Rear cover with display, buttons and d-pad -------------------------------------
  const rear = new THREE.Group();
  rear.name = 'rearCover';
  const holes = [
    [R.lcd.w - 2, R.lcd.h - 2, R.lcd.cx, R.lcd.cy, 1.4],
    ...R.buttons.ys.map((y) => [7.4, 5.6, R.buttons.x, y, 2.8]),
    [17, 17, R.dpad.x, R.dpad.y, 8.5],
  ];
  const back = mesh(G.extrudeForward(rearPanelShape(holes), D.wall), M.chassis);
  back.position.z = -D.chassisOuter;
  rear.add(back);
  const backSkin = mesh(G.boxUV(G.extrudeForward(rearPanelShape(holes.map(([w, h, x, y, r]) => [w + 1.2, h + 1.2, x, y, r + 0.6])), D.leather, 0.15, 64, 1)), M.leather);
  backSkin.position.z = -D.frontZ;
  rear.add(backSkin);
  rig.add(backSkin, 'skin', [0, 0, -12]);

  // PLAY / FN / MENU, stacked left of the screen (MENU lowest).
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

  // Directional pad with centre button.
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

  // Status LED.
  const led = mesh(new THREE.CircleGeometry(0.9, 24), M.ledLens);
  led.rotation.y = Math.PI;
  led.position.set(R.led.x, R.led.y, -D.frontZ - 0.02);
  rear.add(led);

  body.add(rear);
  rig.add(rear, 'rear', [0, 0, -130]);
  rig.floaty(rear, 1.4, 0.55);

  const display = buildDisplay(M, rig, { cx: R.lcd.cx, cy: R.lcd.cy, w: R.lcd.w, h: R.lcd.h });
  body.add(display.group);

  // ---- Bottom plate ------------------------------------------------------------------
  const base = new THREE.Group();
  base.name = 'bottomPlate';
  const bs = G.roundedRectShape(D.W, D.plateD, D.plateD / 2);
  const bh = new THREE.Path();
  G.roundedRectPath(bh, B.battery.w + 2, B.battery.d + 2, 3.2, B.battery.x, B.battery.z, true);
  bs.holes.push(bh);
  const plate = mesh(G.extrudeUp(bs, D.bodyY0 - D.baseY0, 1.1), M.body);
  plate.position.y = D.baseY0;
  base.add(plate);
  // Tripod socket (1/4", stainless) and the battery-release lever beside it.
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
  const leverArm = mesh(G.extrudeUp(G.roundedRectShape(9, 3.4, 1.7, 4, 0), 0.9, 0.3), M.chromePolished);
  lever.add(leverArm);
  lever.rotation.x = Math.PI;
  lever.rotation.y = 0.3;
  lever.position.set(B.lever.x, D.baseY0 - 0.02, -5);
  base.add(lever);
  rig.add(lever, 'bottom', [0, -6, 0], [0, 0.9, 0]);
  // USB-C socket at the corner.
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
  // Four small screws.
  for (const x of [-56, -30, 16, 54]) {
    const sc = G.screw(M, 0.8);
    sc.rotation.x = Math.PI;
    sc.position.set(x, D.baseY0 + 0.3, x > 50 ? -11 : 11);
    base.add(sc);
  }
  body.add(base);
  rig.add(base, 'bottom', [0, -46, 0]);
  rig.floaty(base, 1.4, 0.5);

  // SD card slot inside the battery bay, and the card itself.
  const sd = new THREE.Group();
  const slot = mesh(new THREE.BoxGeometry(2.6, 26, 26), M.steel);
  slot.position.set(B.battery.x + B.battery.w / 2 + 2.4, D.bodyY0 + 16, 0);
  sd.add(slot);
  const card = new THREE.Group();
  const cardBody = mesh(G.extrudeForward(G.roundedRectShape(24, 32, 1.2), 2.1, 0.2), new THREE.MeshPhysicalMaterial({
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
  G.planarUV(cardBody.geometry, 24, 32);
  card.rotation.y = Math.PI / 2;
  card.position.set(B.battery.x + B.battery.w / 2 + 2.4, D.bodyY0 + 16, 0);
  sd.add(card);
  body.add(sd);
  rig.add(card, 'bottom', [0, -58, 0]);

  const battery = buildBattery(M, rig, B.battery);
  body.add(battery.group);

  return { body, chassis, rear, base, mount, display };
}
