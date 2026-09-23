// M11 digital internals: BSI-CMOS sensor module, vertical metal-blade
// focal-plane shutter, main board, BP-SCL7 battery and the rear display.
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import * as T from '../core/textures.js';

const { mesh } = G;
const TAU = Math.PI * 2;

// Small helpers ----------------------------------------------------------------
function slab(w, h, d, r, mat, bevel = 0.2) {
  return mesh(G.extrudeForward(G.roundedRectShape(w, h, r), d, Math.min(bevel, d / 3)), mat);
}
function smd(g, M, x, y, z, w, h, d = 0.5, mat = M.chip) {
  const c = mesh(new THREE.BoxGeometry(w, h, d), mat);
  c.position.set(x, y, z);
  g.add(c);
  return c;
}
// Scatter passives (resistors/caps) on a board face at z.
function passives(g, M, x0, x1, y0, y1, z, n, seed, facing = 1) {
  const cap = new THREE.MeshPhysicalMaterial({ color: 0x8a7a5a, roughness: 0.5 });
  const res = new THREE.MeshPhysicalMaterial({ color: 0x151515, roughness: 0.4 });
  const endMat = M.steel;
  for (let i = 0; i < n; i++) {
    const r = (k) => Math.abs(Math.sin(i * 12.9898 + seed * 78.233 + k * 37.719) * 43758.5453) % 1;
    const x = x0 + r(1) * (x1 - x0), y = y0 + r(2) * (y1 - y0);
    const isCap = r(3) > 0.5;
    const w = isCap ? 1.0 : 1.6, h = isCap ? 0.5 : 0.8;
    const body = mesh(new THREE.BoxGeometry(w, h, 0.45), isCap ? cap : res, { cast: false });
    body.position.set(x, y, z + facing * 0.22);
    if (r(4) > 0.5) body.rotation.z = Math.PI / 2;
    g.add(body);
    const e1 = mesh(new THREE.BoxGeometry(0.22, h + 0.02, 0.47), endMat, { cast: false });
    e1.position.x = -w / 2 + 0.11;
    body.add(e1);
    const e2 = e1.clone();
    e2.position.x = w / 2 - 0.11;
    body.add(e2);
  }
}

// ---- Sensor module ----------------------------------------------------------------
export function buildSensor(M, rig) {
  const g = new THREE.Group();
  g.name = 'sensor';
  const cy = D.lensY;
  const zf = D.filmZ;

  // Ceramic package with the die recessed in its cavity.
  const pkg = new THREE.Group();
  // Package texture on the faces (caps); sides stay dark ceramic.
  const body = mesh(G.planarUV(G.extrudeForward(G.roundedRectShape(46, 35.5, 0.8), 1.8, 0.2), 46, 35.5), [M.ceramic, M.chip]);
  body.position.set(0, cy, zf - 1.3);
  pkg.add(body);
  const die = mesh(new THREE.BoxGeometry(37.2, 25.2, 0.5), M.chip);
  die.position.set(0, cy, zf - 0.25);
  pkg.add(die);
  const active = mesh(new THREE.PlaneGeometry(35.9, 23.9), M.sensorDie);
  active.position.set(0, cy, zf + 0.01);
  pkg.add(active);
  // Bond wires: fine gold arcs from die edge to package ledge.
  const wireMat = M.gold;
  const wireCurve = (a, b, lift) => new THREE.QuadraticBezierCurve3(a, a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0, lift)), b);
  const wires = [];
  for (let i = 0; i < 44; i++) {
    const x = -17 + (i / 43) * 34;
    for (const sgn of [1, -1]) {
      const a = new THREE.Vector3(x, cy + sgn * 12.4, zf + 0.01);
      const b = new THREE.Vector3(x * 1.05, cy + sgn * 15.2, zf - 0.4);
      wires.push(new THREE.TubeGeometry(wireCurve(a, b, 0.9), 6, 0.05, 3, false));
    }
  }
  for (const wg of wires) pkg.add(mesh(wg, wireMat, { cast: false }));
  g.add(pkg);

  // IR-cut / UV cover glass in a thin black frame.
  const coverFrameS = G.roundedRectShape(42, 31, 1.2);
  const cfh = new THREE.Path();
  G.roundedRectPath(cfh, 39, 28, 0.8, 0, 0, true);
  coverFrameS.holes.push(cfh);
  const coverFrame = mesh(G.extrudeForward(coverFrameS, 1.1, 0.2), M.anodizedMatte);
  coverFrame.position.set(0, cy, zf + 0.5);
  const cover = mesh(G.extrudeForward(G.roundedRectShape(39.4, 28.4, 0.8), 0.9, 0.12), M.irGlass, { cast: false });
  cover.position.set(0, cy, zf + 0.6);
  const coverGroup = new THREE.Group();
  coverGroup.add(coverFrame, cover);
  g.add(coverGroup);

  // Sensor PCB (black) with flex tail, and passives on its rear.
  const pcb = slab(58, 46, 1.2, 2, M.pcbBlack);
  pcb.position.set(0, cy, zf - 2.7);
  g.add(pcb);
  passives(g, M, -26, 26, cy - 20, cy + 20, zf - 2.7, 70, 3, -1);
  smd(g, M, 18, cy - 14, zf - 3.1, 12, 4, 1.1, M.chip);
  const flexTail = mesh(new THREE.PlaneGeometry(10, 18), M.flex);
  flexTail.position.set(18, cy - 24, zf - 3.3);
  g.add(flexTail);

  // Aluminium mounting plate with three alignment springs and screws.
  const plateS = G.roundedRectShape(62, 50, 4);
  const ph = new THREE.Path();
  G.roundedRectPath(ph, 30, 20, 3, 0, 0, true);
  plateS.holes.push(ph);
  const plate = mesh(G.extrudeForward(plateS, 1.4, 0.3), M.aluminium);
  plate.position.set(0, cy, zf - 5.4);
  g.add(plate);
  for (const [x, y] of [[-27, 21], [27, 21], [0, -21]]) {
    const sp = mesh(G.springGeometry(1.5, 0.22, 4, 2.2), M.blueSteel);
    sp.rotation.x = Math.PI / 2;
    sp.position.set(x, cy + y, zf - 2.1);
    g.add(sp);
    const sc = G.screw(M, 1.3);
    sc.rotation.x = -Math.PI / 2;
    sc.position.set(x, cy + y, zf - 5.4);
    g.add(sc);
  }
  // Thermal fins on the back of the plate.
  for (let i = 0; i < 7; i++) {
    const fin = mesh(new THREE.BoxGeometry(0.8, 18, 2.2), M.aluminium);
    fin.position.set(-12 + i * 4, cy, zf - 6.5);
    g.add(fin);
  }

  rig.add(g, 'sensor', [0, 0, -46]);
  rig.add(coverGroup, 'sensorSpread', [0, 0, 16]);
  rig.add(pkg, 'sensorSpread', [0, 0, 6]);
  rig.add(plate, 'sensorSpread', [0, 0, -10]);
  rig.floaty(g, 1.0, 0.6);
  rig.anchor(active, 'sensorDie', [10, 6, 0.2]);
  return { group: g, cover: coverGroup, pkg };
}

// ---- Vertical metal-blade focal-plane shutter ---------------------------------------
export function buildShutter(M, rig) {
  const g = new THREE.Group();
  g.name = 'shutter';
  const cy = D.lensY;
  const zf = D.filmZ + 3.4;

  const frameS = G.roundedRectShape(60, 54, 3, 0, cy + 3);
  const hole = new THREE.Path();
  G.roundedRectPath(hole, 37.4, 25.6, 0.8, 0, cy, true);
  frameS.holes.push(hole);
  const frame = mesh(G.extrudeForward(frameS, 1.1, 0.25), M.crate);
  frame.position.z = zf;
  g.add(frame);
  // Rear baseplate.
  const rearS = G.roundedRectShape(60, 54, 3, 0, cy + 3);
  const rh = new THREE.Path();
  G.roundedRectPath(rh, 37.4, 25.6, 0.8, 0, cy, true);
  rearS.holes.push(rh);
  const rear = mesh(G.extrudeForward(rearS, 0.6, 0.15), M.anodizedMatte);
  rear.position.z = zf - 1.6;
  g.add(rear);

  // Two blade packs (first and second curtain), each of 4 lamellae.
  const bladeGeo = G.extrudeForward(G.roundedRectShape(40, 8.2, 0.6), 0.12, 0, 8);
  const packs = [[], []];
  for (let p = 0; p < 2; p++) {
    for (let i = 0; i < 4; i++) {
      const b = mesh(bladeGeo, M.blade);
      b.position.set(0, cy, zf - 1.0 + p * 0.5 + i * 0.1);
      g.add(b);
      packs[p].push(b);
    }
  }
  // Drive arms on the left side.
  const arms = [];
  for (let p = 0; p < 2; p++) {
    const arm = mesh(G.extrudeForward(G.roundedRectShape(24, 1.8, 0.9, 12, 0), 0.4, 0.1), M.steel);
    const pivot = new THREE.Group();
    pivot.position.set(-26, cy + 18 - p * 5, zf - 0.6 + p * 0.5);
    pivot.add(arm);
    g.add(pivot);
    arms.push(pivot);
    const pin = mesh(G.cylZ(0.8, -0.4, 0.8, { segments: 16 }), M.chromePolished);
    pin.position.copy(pivot.position);
    g.add(pin);
  }

  // Motor, reduction gears and cocking spring on top of the crate.
  const motor = new THREE.Group();
  const can = mesh(G.latheY([[0, 0], [3.4, 0], [3.6, 0.4], [3.6, 11], [3.2, 11.5], [1, 11.5], [1, 12.2], [0, 12.2]], 32), M.steel);
  can.rotation.z = Math.PI / 2;
  motor.add(can);
  const label = mesh(new THREE.CylinderGeometry(3.62, 3.62, 6, 32, 1, true), M.chip);
  label.rotation.z = Math.PI / 2;
  label.position.x = -5.5;
  motor.add(label);
  motor.position.set(22, cy + 26, zf - 3);
  g.add(motor);
  const gears = [];
  for (const [x, t, h] of [[9, 12, 1.2], [4.5, 28, 0.9], [-4, 20, 0.9], [-12, 32, 1.0]]) {
    const gear = mesh(G.gearGeometry({ teeth: t, module: 0.4, h, bore: 0.5, spokes: t > 24 ? 4 : 0 }), M.brass);
    gear.rotation.x = Math.PI / 2;
    gear.position.set(x, cy + 26, zf + 1.4);
    gear.userData.ratio = (t % 2 ? -1 : 1) * 12 / t;
    g.add(gear);
    gears.push(gear);
  }
  const spring = mesh(G.springGeometry(1.2, 0.2, 10, 18), M.blueSteel);
  spring.rotation.z = Math.PI / 2;
  spring.position.set(9, cy - 21, zf + 0.6);
  g.add(spring);
  for (const [x, y] of [[-27, cy + 27], [27, cy + 27], [-27, cy - 21], [27, cy - 21]]) {
    const sc = G.screw(M, 0.9);
    sc.rotation.x = Math.PI / 2;
    sc.position.set(x, y, zf + 1.1);
    g.add(sc);
  }

  // Blade positions: open fraction per curtain. Blades fan across the gate
  // when closed and fold into a narrow stack above/below when open.
  const gateTop = cy + 12.8, gateBot = cy - 12.8;
  const setPack = (pack, closed, foldAbove) => {
    pack.forEach((b, i) => {
      const fanned = gateBot + 4.1 + (i / 3) * (gateTop - gateBot - 8.2);
      const folded = foldAbove ? gateTop + 5 + i * 1.2 : gateBot - 5 - (3 - i) * 1.2;
      b.position.y = folded + (fanned - folded) * closed;
    });
  };
  // phase in [0,1): 1st curtain opens downward, 2nd follows, then re-cock.
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const setPhase = (p) => {
    const open1 = ss(0.25, 0.42, p) * (1 - ss(0.78, 0.95, p));
    const close2 = ss(0.34, 0.51, p) * (1 - ss(0.78, 0.95, p));
    setPack(packs[0], 1 - open1, false);
    setPack(packs[1], close2, true);
    arms[0].rotation.z = -0.35 * open1;
    arms[1].rotation.z = -0.35 * close2;
  };
  setPhase(0);

  rig.add(g, 'shutter', [0, 30, -24]);
  rig.floaty(g, 1.1, 0.6);
  rig.anchor(frame, 'shutter', [-30, cy + 20, 1]);
  return { group: g, setPhase, gears };
}

// ---- Main board ----------------------------------------------------------------------
export function buildMainboard(M, rig) {
  const g = new THREE.Group();
  g.name = 'mainboard';
  const z = -14.2;
  const board = slab(92, 46, 1.0, 3, M.pcbBlack);
  board.position.set(-2, -12, z - 1.0);
  g.add(board);
  // Processor: BGA package with a nickel heat-spreader lid.
  const soc = new THREE.Group();
  soc.add(slab(15, 15, 0.9, 0.6, M.chip, 0.15));
  const lid = slab(12, 12, 0.6, 0.8, M.aluminium, 0.15);
  lid.position.z = -0.6;
  soc.add(lid);
  const socLabel = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.2), new THREE.MeshBasicMaterial({
    map: T.decal(512, 164, (ctx, w, h, f) => {
      ctx.fillStyle = 'rgba(30,30,32,0.85)';
      ctx.font = `700 64px ${f.FONT_SANS}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('MAESTRO III', w / 2, h / 2);
    }),
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  socLabel.rotation.y = Math.PI;
  socLabel.position.z = -0.62;
  soc.add(socLabel);
  soc.position.set(-10, -8, z - 1.0);
  g.add(soc);
  // Memory (64 GB), DRAM, power management, board-to-board connectors.
  const parts = [
    [8, -6, 11, 13, 1.2], [8, -21, 11, 8, 1.0], [-28, -18, 9, 9, 0.9], [-30, -2, 7, 5, 0.8], [26, -24, 6, 6, 0.8],
  ];
  for (const [x, y, w, h, d] of parts) {
    const c = slab(w, h, d, 0.4, M.chip, 0.12);
    c.position.set(x, y, z - 1.0 - d);
    g.add(c);
  }
  for (const [x, y] of [[30, 2], [-38, -30]]) {
    const b2b = mesh(new THREE.BoxGeometry(12, 3, 1.2), M.chip);
    b2b.position.set(x, y, z - 1.6);
    g.add(b2b);
    for (let i = 0; i < 14; i++) {
      const pin = mesh(new THREE.BoxGeometry(0.35, 0.8, 0.3), M.gold, { cast: false });
      pin.position.set(x - 5.2 + i * 0.8, y + 1.6, z - 1.3);
      g.add(pin);
    }
  }
  passives(g, M, -46, 42, -34, 10, z - 1.0, 150, 7, -1);
  // Shield can over the RF / Wi-Fi section.
  const shield = slab(16, 12, 1.6, 0.5, M.steel, 0.2);
  shield.position.set(32, -18, z - 2.6);
  g.add(shield);
  for (let i = 0; i < 6; i++) {
    const vent = mesh(new THREE.BoxGeometry(10, 0.6, 0.1), M.chip, { cast: false });
    vent.position.set(32, -22 + i * 1.6, z - 2.65);
    g.add(vent);
  }
  // Flex from sensor to board.
  const flex = mesh(new THREE.PlaneGeometry(10, 6), M.flex);
  flex.position.set(18, -30, z + 0.4);
  flex.rotation.x = -0.6;
  g.add(flex);

  rig.add(g, 'mainboard', [0, 0, -74]);
  rig.floaty(g, 1.0, 0.7);
  rig.anchor(soc, 'processor', [0, 7.5, -1.5]);
  return { group: g };
}

// ---- Rear display module ----------------------------------------------------------------
// opts: { cx, cy, w, h } in mm — LCD glass centre and size on the back.
export function buildDisplay(M, rig, opts) {
  const { cx, cy, w, h } = opts;
  const g = new THREE.Group();
  g.name = 'display';
  const zb = -D.frontZ; // rear surface of the body
  // Cover glass (chemically strengthened) sitting just proud of the back.
  // Image mapped across the rear-facing cap (seen from behind, so U is flipped).
  const glass = mesh(G.planarUV(G.extrudeForward(G.roundedRectShape(w, h, 1.6), 0.9, 0.2), w, h, true), M.screen);
  glass.position.set(cx, cy, zb - 0.95);
  g.add(glass);
  // Thin black printed border under the glass.
  const borderS = G.roundedRectShape(w, h, 1.6);
  const bh = new THREE.Path();
  G.roundedRectPath(bh, w - 4.2, h - 4.2, 0.6, 0, 0, true);
  borderS.holes.push(bh);
  const border = mesh(G.extrudeForward(borderS, 0.05), M.chip, { cast: false });
  border.position.set(cx, cy, zb - 0.97);
  g.add(border);
  // TFT panel and steel backlight frame behind it.
  const panel = slab(w - 3, h - 3, 1.4, 1, M.anodizedMatte, 0.2);
  panel.position.set(cx, cy, zb + 0.2);
  g.add(panel);
  const back = slab(w - 2, h - 2, 1.0, 1, M.steel, 0.2);
  back.position.set(cx, cy, zb + 1.8);
  g.add(back);
  const dflex = mesh(new THREE.PlaneGeometry(14, 12), M.flex);
  dflex.position.set(cx - w / 2 + 6, cy - h / 2 - 3, zb + 2.4);
  g.add(dflex);

  rig.add(g, 'rear', [0, 0, -30]);
  rig.add(glass, 'displaySpread', [0, 0, -18]);
  rig.add(border, 'displaySpread', [0, 0, -18]);
  rig.add(back, 'displaySpread', [0, 0, 10]);
  rig.anchor(glass, 'display', [w / 2 - 4, h / 2 - 3, -0.9]);
  return { group: g, glass };
}

// ---- Battery (BP-SCL7) ------------------------------------------------------------------
// opts: { x, z, w, d, h } — centre in plan, width (x), depth (z), height (y).
export function buildBattery(M, rig, opts) {
  const { x, z, w, d, h } = opts;
  const g = new THREE.Group();
  g.name = 'battery';
  const y0 = D.baseY0;
  const pack = mesh(G.extrudeUp(G.roundedRectShape(w, d, 2.2), h - 3, 0.6), M.battery);
  pack.position.set(x, y0 + 3, z);
  g.add(pack);
  // Metal bottom cap that forms part of the camera base, with release notch.
  const cap = mesh(G.extrudeUp(G.roundedRectShape(w + 1.6, d + 1.6, 2.8), 3.2, 0.7), M.body);
  cap.position.set(x, y0, z);
  g.add(cap);
  const notch = mesh(new THREE.BoxGeometry(w * 0.5, 0.5, 1.6), M.matteBlack, { cast: false });
  notch.position.set(x, y0 + 0.2, z - d / 2 + 1.4);
  g.add(notch);
  // Contacts on top.
  for (let i = 0; i < 4; i++) {
    const c = mesh(new THREE.BoxGeometry(1.4, 0.3, 3), M.gold, { cast: false });
    c.position.set(x - 3 + i * 2, y0 + h + 0.05, z);
    g.add(c);
  }
  // Label band.
  const label = new THREE.Mesh(new THREE.PlaneGeometry(h - 12, d - 4), new THREE.MeshPhysicalMaterial({
    map: T.decal(512, 256, (ctx, cw, ch, f) => {
      ctx.fillStyle = '#1a1a1b';
      ctx.fillRect(0, 0, cw, ch);
      ctx.fillStyle = '#e6e3dc';
      ctx.font = `700 54px ${f.FONT_SANS}`;
      ctx.fillText('BP-SCL7', 30, 90);
      ctx.font = `500 30px ${f.FONT_SANS}`;
      ctx.fillStyle = '#a9a69f';
      ctx.fillText('Li-ion  7.4 V  1800 mAh', 30, 150);
      ctx.fillStyle = '#d0101e';
      ctx.beginPath();
      ctx.arc(cw - 60, 70, 26, 0, TAU);
      ctx.fill();
    }),
    roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  label.rotation.set(0, -Math.PI / 2, Math.PI / 2);
  label.position.set(x - w / 2 - 0.02, y0 + 3 + (h - 3) / 2, z);
  g.add(label);

  rig.add(g, 'battery', [0, -78, 0]);
  rig.floaty(g, 1.3, 0.55);
  rig.anchor(pack, 'battery', [0, h * 0.6, d / 2]);
  return { group: g };
}
