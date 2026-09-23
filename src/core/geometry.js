// Geometry helpers. Units are millimetres; the camera root is scaled down later.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

export function roundedRectShape(w, h, r, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  roundedRectPath(s, w, h, r, cx, cy);
  return s;
}

export function roundedRectPath(p, w, h, r, cx = 0, cy = 0, reverse = false) {
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  if (!reverse) {
    p.moveTo(x + r, y);
    p.lineTo(x + w - r, y);
    p.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
    p.lineTo(x + w, y + h - r);
    p.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
    p.lineTo(x + r, y + h);
    p.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
    p.lineTo(x, y + r);
    p.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  } else {
    p.moveTo(x + r, y);
    p.absarc(x + r, y + r, r, Math.PI * 1.5, Math.PI, true);
    p.lineTo(x, y + h - r);
    p.absarc(x + r, y + h - r, r, Math.PI, Math.PI / 2, true);
    p.lineTo(x + w - r, y + h);
    p.absarc(x + w - r, y + h - r, r, Math.PI / 2, 0, true);
    p.lineTo(x + w, y + r);
    p.absarc(x + w - r, y + r, r, 0, -Math.PI / 2, true);
    p.lineTo(x + r, y);
  }
  return p;
}

export function circlePath(p, r, cx = 0, cy = 0, reverse = false) {
  p.moveTo(cx + r, cy);
  p.absarc(cx, cy, r, 0, TAU, reverse);
  return p;
}

// Extrude a plan-view shape (x, z) upward along +Y, spanning y in [0, h].
// Bevels are kept inside the nominal outline.
export function extrudeUp(shape, h, bevel = 0, curveSegments = 48, bevelSegments = 4) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, h - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments,
    curveSegments,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bevel, 0);
  return crease(g);
}

// ExtrudeGeometry ships flat per-face normals; crease them so curved walls
// read smooth while hard edges stay crisp.
export function crease(g, angle = Math.PI / 5) {
  const out = toCreasedNormals(g, angle);
  out.groups = g.groups;
  g.dispose();
  return out;
}

// Extrude a front-view shape (x, y) toward +Z, spanning z in [0, d].
export function extrudeForward(shape, d, bevel = 0, curveSegments = 48, bevelSegments = 3) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, d - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments,
    curveSegments,
  });
  g.translate(0, 0, bevel);
  return crease(g);
}

// Solid of revolution around the Z axis. profile: [[r, z], ...]
// Points are duplicated so every corner is a crisp edge, unless the point
// carries a third truthy element (smooth, e.g. sampled optical surfaces).
function lathePoints(profile) {
  const pts = [];
  profile.forEach(([r, z, smooth], i) => {
    const v = new THREE.Vector2(Math.max(0, r), z);
    pts.push(v);
    if (!smooth && i > 0 && i < profile.length - 1) pts.push(v.clone());
  });
  return pts;
}

export function latheZ(profile, segments = 128) {
  const g = new THREE.LatheGeometry(lathePoints(profile), segments);
  // Lathe revolves around +Y; rotate so +Y becomes +Z.
  g.rotateX(Math.PI / 2);
  return g;
}

// Solid of revolution around the Y axis.
export function latheY(profile, segments = 128) {
  return new THREE.LatheGeometry(lathePoints(profile), segments);
}

// Cylinder along Z spanning z in [z0, z1]. Options for open ends / UV scaling.
export function cylZ(r, z0, z1, { segments = 96, open = false, rTop = r, thetaStart = 0, thetaLength = TAU } = {}) {
  const g = new THREE.CylinderGeometry(rTop, r, z1 - z0, segments, 1, open, thetaStart, thetaLength);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, (z0 + z1) / 2);
  return g;
}

// Tube (annulus solid) along Z with small edge chamfers, via lathe.
export function ringZ(rOuter, rInner, z0, z1, chamfer = 0.3, segments = 128) {
  const c = Math.min(chamfer, (z1 - z0) / 3, (rOuter - rInner) / 3);
  return latheZ([
    [rInner, z0 + c], [rInner + c, z0], [rOuter - c, z0], [rOuter, z0 + c],
    [rOuter, z1 - c], [rOuter - c, z1], [rInner + c, z1], [rInner, z1 - c], [rInner, z0 + c],
  ], segments);
}

// Knurled / scalloped ring along Z. Ridges run parallel to the axis.
// profile: 'knurl' (sharp V), 'scallop' (rounded lobes)
export function ridgedRingZ({ rOuter, rInner, z0, z1, ridges = 60, depth = 0.6, profile = 'knurl', chamfer = 0.5 }) {
  const perRidge = profile === 'scallop' ? 12 : 4;
  const segs = ridges * perRidge;
  const L = z1 - z0;
  const c = Math.min(chamfer, L / 4);
  // Rings along the axis: inner-front, outer chamfer, full ridges, chamfer, inner-back.
  const zs = [z0, z0 + c, z1 - c, z1];
  const ridgeAmt = [0.25, 1, 1, 0.25];
  const rOff = [c, 0, 0, c];
  const pos = [];
  const uv = [];
  const idx = [];
  const rOf = (i, k) => {
    const t = (i / perRidge) % 1;
    let f;
    if (profile === 'scallop') f = 1 - Math.pow(Math.sin(t * Math.PI), 0.7);
    else f = Math.abs(t - 0.5) * 2;
    return rOuter - rOff[k] - depth * f * ridgeAmt[k];
  };
  // Outer surface grid.
  for (let k = 0; k < zs.length; k++) {
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const r = rOf(i, k);
      pos.push(Math.cos(a) * r, Math.sin(a) * r, zs[k]);
      uv.push(i / segs, k / (zs.length - 1));
    }
  }
  const row = segs + 1;
  for (let k = 0; k < zs.length - 1; k++) {
    for (let i = 0; i < segs; i++) {
      const a = k * row + i, b = a + 1, cc = a + row, d = cc + 1;
      idx.push(a, b, d, a, d, cc);
    }
  }
  // Front and back annular faces + inner wall.
  const addAnnulus = (z, outerK, flip) => {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      const ro = rOf(i, outerK);
      pos.push(Math.cos(a) * ro, Math.sin(a) * ro, z, Math.cos(a) * rInner, Math.sin(a) * rInner, z);
      uv.push(i / segs, 1, i / segs, 0);
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2, b = a + 1, cc = a + 2, d = a + 3;
      if (flip) idx.push(a, cc, b, b, cc, d);
      else idx.push(a, b, cc, b, d, cc);
    }
  };
  addAnnulus(z0, 0, false);
  addAnnulus(z1, 3, true);
  const base = pos.length / 3;
  for (const z of [z0, z1]) {
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * TAU;
      pos.push(Math.cos(a) * rInner, Math.sin(a) * rInner, z);
      uv.push(i / segs, z === z0 ? 0 : 1);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = base + i, b = a + 1, cc = a + row, d = cc + 1;
    idx.push(a, d, b, a, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Spur gear lying in the XZ plane (axis +Y), spanning y in [0, h].
export function gearGeometry({ teeth = 24, module = 1, h = 1.5, bore = 1, spokes = 0 }) {
  const rp = (teeth * module) / 2;
  const ra = rp + module, rf = rp - 1.25 * module;
  const s = new THREE.Shape();
  const step = TAU / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const pts = [
      [rf, a - step * 0.5], [rf, a - step * 0.28], [ra, a - step * 0.14],
      [ra, a + step * 0.14], [rf, a + step * 0.28],
    ];
    pts.forEach(([r, t], j) => {
      const x = Math.cos(t) * r, y = Math.sin(t) * r;
      if (i === 0 && j === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    });
  }
  s.closePath();
  const hole = new THREE.Path();
  circlePath(hole, bore, 0, 0, true);
  s.holes.push(hole);
  if (spokes > 0) {
    const r0 = bore + 1.2, r1 = rf - 1.2;
    if (r1 - r0 > 1.5) {
      for (let i = 0; i < spokes; i++) {
        const a0 = (i / spokes) * TAU + 0.18, a1 = ((i + 1) / spokes) * TAU - 0.18;
        const p = new THREE.Path();
        p.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0);
        p.absarc(0, 0, r1, a0, a1, false);
        p.lineTo(Math.cos(a1) * r0, Math.sin(a1) * r0);
        p.absarc(0, 0, r0, a1, a0, true);
        s.holes.push(p);
      }
    }
  }
  return extrudeUp(s, h, Math.min(0.15, h / 5), 12, 1);
}

// A slotted cheese-head screw, head facing +Y, sitting on y = 0.
export function screw(materials, r = 1.1, cross = true) {
  const grp = new THREE.Group();
  const head = new THREE.Mesh(latheY([[0, 0], [r, 0], [r, r * 0.35], [r * 0.85, r * 0.6], [0, r * 0.7]], 24), materials.chromePolished);
  grp.add(head);
  const slotMat = materials.matteBlack;
  const slotA = new THREE.Mesh(new THREE.BoxGeometry(r * 1.7, r * 0.5, r * 0.28), slotMat);
  slotA.position.y = r * 0.55;
  grp.add(slotA);
  if (cross) {
    const slotB = slotA.clone();
    slotB.rotation.y = Math.PI / 2;
    grp.add(slotB);
  }
  return grp;
}

// Helical compression spring along +Y.
export function springGeometry(r = 2, wire = 0.25, turns = 8, length = 10) {
  class Helix extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const a = t * turns * TAU;
      return target.set(Math.cos(a) * r, t * length, Math.sin(a) * r);
    }
  }
  return new THREE.TubeGeometry(new Helix(), turns * 24, wire, 8, false);
}

// Rescale a geometry's UVs so that textures tile in world millimetres.
export function scaleUV(g, su, sv = su) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  uv.needsUpdate = true;
  return g;
}

// Box-projected UVs in millimetres; good for leatherette on arbitrary shells.
export function boxUV(g) {
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else if (ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export function mesh(geometry, material, { cast = true, receive = true, name } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (name) m.name = name;
  return m;
}
