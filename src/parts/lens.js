// Summilux-M 50 mm f/1.4 style lens: barrel rings with engraved scales,
// eight glass elements, a ten-blade iris and animated light rays.
import * as THREE from 'three';
import { D } from './dims.js';
import * as G from '../core/geometry.js';
import * as T from '../core/textures.js';

const { mesh } = G;
const TAU = Math.PI * 2;

// Band overlay for a ring: open cylinder carrying the engraved scale texture.
function band(M, r, z0, z1, texture) {
  const g = G.cylZ(r, z0, z1, { segments: 160, open: true });
  const mat = M.anodized.clone();
  mat.map = texture;
  mat.color.set(0xffffff);
  return mesh(g, mat);
}

// Flowing-light shader for rays.
export function rayMaterial(color = new THREE.Color(1.0, 0.8, 0.5)) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uColor: { value: color.clone().multiplyScalar(3.5) },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uOpacity; uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float pulse = pow(0.5 + 0.5 * sin(vUv.x * 60.0 - uTime * 6.0), 6.0);
        float ends = smoothstep(0.0, 0.05, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        float a = (0.35 + 0.65 * pulse) * ends * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
}

// Spherical surface sag: c = +1 means convex toward +Z (edges fall back).
function surfaceZ(zv, R, c, r) {
  if (!isFinite(R)) return zv;
  return zv - c * (R - Math.sqrt(Math.max(0, R * R - r * r)));
}

function elementGeometry(e, zFront) {
  const n = 18;
  const zBackV = zFront - e.t;
  const prof = [];
  // CCW in (r, z): back surface outward, edge up, front surface inward.
  for (let i = 0; i <= n; i++) {
    const r = (i / n) * e.r;
    prof.push([r, surfaceZ(zBackV, e.Rb, e.cb, r), i > 0 && i < n ? 1 : 0]);
  }
  for (let i = n; i >= 0; i--) {
    const r = (i / n) * e.r;
    prof.push([r, surfaceZ(zFront, e.Rf, e.cf, r), i > 0 && i < n ? 1 : 0]);
  }
  return G.latheZ(prof, 96);
}

export function buildLens(M, rig) {
  const lens = new THREE.Group();
  lens.name = 'lens';
  lens.position.set(0, D.lensY, D.mountZ);

  // ---- Barrel ---------------------------------------------------------------
  const bayonet = new THREE.Group();
  bayonet.add(mesh(G.latheZ([
    [18.4, -2.8], [21.2, -2.8], [21.2, 0], [24.6, 0], [24.6, 1.0], [24.2, 1.4], [18.4, 1.4], [18.4, -2.8],
  ]), M.chromePolished));
  for (let i = 0; i < 3; i++) {
    bayonet.add(mesh(G.cylZ(22.6, -2.6, -1.6, { segments: 24, thetaStart: 0.4 + i * 2.094, thetaLength: 0.75 }), M.chromePolished));
  }
  const redBead = mesh(new THREE.SphereGeometry(0.9, 16, 12), M.redEnamel);
  redBead.position.set(0, 24.2, 0.9);
  bayonet.add(redBead);
  lens.add(bayonet);

  const rear = mesh(G.latheZ([[16.6, -16], [18.2, -16], [18.2, -2.8], [16.6, -2.8], [16.6, -16]]), M.anodized);
  lens.add(rear);

  const collar = mesh(G.ringZ(24.3, 21, 1.4, 4, 0.3), M.anodized);
  lens.add(collar);

  // Focus ring: scalloped grip, focusing tab and distance scale.
  const focus = new THREE.Group();
  focus.name = 'focusRing';
  focus.add(mesh(G.ridgedRingZ({ rOuter: 26, rInner: 21.4, z0: 4, z1: 10, ridges: 18, depth: 1.0, profile: 'scallop', chamfer: 0.7 }), M.anodized));
  const tab = mesh(G.extrudeForward(G.roundedRectShape(7.5, 10, 3.6, 0, -28.5), 4.2, 0.9), M.anodized);
  tab.position.z = 5;
  focus.add(tab);
  focus.add(mesh(G.ringZ(25.2, 21.4, 10, 15, 0.25), M.anodized));
  const dist = [['0.7', 0.18], ['0.8', 0.26], ['1', 0.33], ['1.5', 0.4], ['2', 0.44], ['3', 0.48], ['5', 0.515], ['∞', 0.56]];
  const distFt = [['2.5', 0.2], ['3', 0.28], ['4', 0.35], ['5', 0.39], ['7', 0.43], ['10', 0.47], ['15', 0.5], ['30', 0.535]];
  focus.add(band(M, 25.22, 10.2, 14.8, T.ringBand({
    items: [
      ...dist.map(([t, u]) => ({ text: t, u, y: 0.3, size: 42, color: '#f1eee6' })),
      ...distFt.map(([t, u]) => ({ text: t, u, y: 0.74, size: 34, color: '#e2b43a' })),
      { text: 'm', u: 0.61, y: 0.3, size: 32, color: '#f1eee6' },
      { text: 'ft', u: 0.61, y: 0.74, size: 30, color: '#e2b43a' },
    ],
  })));
  lens.add(focus);

  // Depth-of-field scale (fixed) with the red index.
  const dof = new THREE.Group();
  dof.name = 'dofRing';
  dof.add(mesh(G.ringZ(24.5, 21.2, 15, 18, 0.25), M.anodized));
  const dofItems = [];
  ['16', '8', '4', '', '4', '8', '16'].forEach((t, i) => { if (t) dofItems.push({ text: t, u: 0.5 + (i - 3) * 0.018, y: 0.45, size: 30 }); });
  dof.add(band(M, 24.52, 15.1, 17.9, T.ringBand({
    height: 96,
    items: dofItems,
    ticks: [{ u: 0.5, y0: 0.1, y1: 0.95, w: 6, color: '#d8242b' }, ...[-3, -2, -1, 1, 2, 3].map((k) => ({ u: 0.5 + k * 0.018, y0: 0.72, y1: 1, w: 3 }))],
  })));
  lens.add(dof);

  // Aperture ring with f-numbers and fine knurling.
  const ap = new THREE.Group();
  ap.name = 'apertureRing';
  ap.add(mesh(G.ringZ(24.8, 21.2, 18, 20.6, 0.25), M.anodized));
  const fnums = ['1.4', '2', '2.8', '4', '5.6', '8', '11', '16'];
  ap.add(band(M, 24.82, 18.1, 20.5, T.ringBand({
    height: 96,
    items: fnums.map((t, i) => ({ text: t, u: 0.5 - i * 0.03, y: 0.5, size: 34, color: i === 0 ? '#e2b43a' : '#f1eee6' })),
  })));
  ap.add(mesh(G.ridgedRingZ({ rOuter: 25.2, rInner: 21.2, z0: 20.6, z1: 25, ridges: 110, depth: 0.32, chamfer: 0.4 }), M.anodized));
  lens.add(ap);

  // Front barrel with engraved name ring.
  const front = new THREE.Group();
  front.name = 'frontBarrel';
  front.add(mesh(G.latheZ([[20.6, 25], [23.6, 25], [23.6, 26], [23.0, 35.2], [22.5, 36.0], [20.6, 36.0], [20.6, 25]]), M.anodized));
  const nameRing = mesh(new THREE.RingGeometry(20.7, 22.4, 160, 1), new THREE.MeshPhysicalMaterial({
    map: T.polarText({
      size: 2048, base: '#0c0c0d',
      items: [
        { text: 'SUMMILUX-M 1:1.4/50 ASPH.', angle: -0.25, r: 0.955, size: 46, weight: 600, arc: true, spacing: 0.029, color: '#efece4' },
        { text: 'E46  ·  4 012 857', angle: 2.35, r: 0.955, size: 40, weight: 500, arc: true, spacing: 0.03, color: '#bdbab2' },
      ],
    }),
    metalness: 0.3, roughness: 0.4, clearcoat: 0.4,
  }));
  nameRing.position.z = 36.01;
  front.add(nameRing);
  lens.add(front);

  const baffle = mesh(G.latheZ([[19.4, 29], [20.6, 29], [20.6, 35.9], [19.4, 35.9], [19.4, 29]], 96), M.matteBlack);
  lens.add(baffle);

  // ---- Optics -----------------------------------------------------------------
  // r: clear radius, t: centre thickness, Rf/Rb: radii, cf/cb: convex toward +Z (+1) or not (-1)
  // Eight elements; two cemented pairs either side of the stop, aspherical rear element.
  const formula = [
    { r: 19.2, t: 5.6, Rf: 52, cf: 1, Rb: 260, cb: -1, gap: 0.8 },
    { r: 17.2, t: 4.2, Rf: 30, cf: 1, Rb: 62, cb: 1, gap: 0.6 },
    { r: 15.4, t: 3.8, Rf: 28, cf: 1, Rb: 60, cb: 1, cemented: true },
    { r: 15.4, t: 1.8, Rf: 60, cf: 1, Rb: 22, cb: 1, gap: 1.4 },
    { stop: true, gap: 1.4 },
    { r: 14.4, t: 1.8, Rf: 22, cf: -1, Rb: 60, cb: -1, cemented: true },
    { r: 14.4, t: 4.2, Rf: 60, cf: -1, Rb: 30, cb: -1, gap: 1.0 },
    { r: 15.2, t: 4.6, Rf: 90, cf: 1, Rb: 48, cb: -1, gap: 0.8 },
    { r: 13.4, t: 4.2, Rf: 60, cf: 1, Rb: 60, cb: -1, gap: 0, asph: true },
  ];
  const optics = new THREE.Group();
  optics.name = 'optics';
  lens.add(optics);
  const elements = [];
  let z = 35.2;
  let stopZ = 16;
  let cementTo = null;
  formula.forEach((e) => {
    if (e.stop) {
      stopZ = z - 0.4;
      z -= e.gap;
      return;
    }
    // Front vertex placed so the element's forward-most point sits at z,
    // or directly on the previous element's rear vertex when cemented.
    const fwd = e.cf < 0 ? (e.Rf - Math.sqrt(e.Rf * e.Rf - e.r * e.r)) : 0;
    const zFront = cementTo ?? z - fwd;
    const el = new THREE.Group();
    const glass = mesh(elementGeometry(e, zFront), M.glass, { cast: false });
    el.add(glass);
    // Blackened retaining ring at the element edge.
    const zEdgeF = surfaceZ(zFront, e.Rf, e.cf, e.r);
    const zEdgeB = surfaceZ(zFront - e.t, e.Rb, e.cb, e.r);
    const ring = mesh(G.ringZ(e.r + 0.9, e.r - 0.2, Math.min(zEdgeB, zEdgeF) - 0.2, Math.max(zEdgeB, zEdgeF) + 0.2, 0.2, 96), M.anodizedMatte);
    el.add(ring);
    const zBackMost = Math.min(zFront - e.t, zEdgeB);
    el.userData.zc = (Math.max(zFront, zEdgeF) + zBackMost) / 2;
    optics.add(el);
    elements.push(el);
    cementTo = e.cemented ? zFront - e.t : null;
    z = zBackMost - (e.gap || 0);
  });

  // ---- Iris -----------------------------------------------------------------
  const iris = new THREE.Group();
  iris.name = 'iris';
  iris.position.z = stopZ;
  const housing = mesh(G.ringZ(21, 18.6, -0.9, 0.9, 0.2), M.anodizedMatte);
  iris.add(housing);
  const N = 10;
  const Rp = 18.2;
  const bladeShape = new THREE.Shape();
  const span = 1.35, rIn = 12.6, rOut = 19.6;
  bladeShape.moveTo(Math.cos(0) * rIn - Rp, Math.sin(0) * rIn);
  bladeShape.absarc(-Rp, 0, rIn, 0, span, false);
  bladeShape.absarc(Math.cos(span) * (rIn + rOut) / 2 - Rp, Math.sin(span) * (rIn + rOut) / 2, (rOut - rIn) / 2, span + Math.PI, span, true);
  bladeShape.absarc(-Rp, 0, rOut, span, -0.12, true);
  bladeShape.closePath();
  const bladeGeo = G.extrudeForward(bladeShape, 0.16, 0, 64);
  const blades = [];
  for (let i = 0; i < N; i++) {
    const holder = new THREE.Group();
    holder.rotation.z = (i / N) * TAU;
    const pivot = new THREE.Group();
    pivot.position.set(Rp, 0, -0.5 + i * 0.1);
    pivot.rotation.x = 0.02;
    const blade = mesh(bladeGeo, M.blade);
    pivot.add(blade);
    const pinM = mesh(G.cylZ(0.5, -0.3, 0.5, { segments: 12 }), M.steel);
    pivot.add(pinM);
    holder.add(pivot);
    iris.add(holder);
    blades.push(pivot);
  }
  optics.add(iris);

  // ---- Light rays ------------------------------------------------------------
  const rays = new THREE.Group();
  rays.name = 'rays';
  const rayMat = rayMaterial();
  const zFilm = D.filmZ - D.mountZ;
  const zE1 = 36;
  for (const h of [-15, -10, -5, 0, 5, 10, 15]) {
    for (const plane of [0, Math.PI / 2]) {
      if (plane && h === 0) continue;
      const pts = [];
      pts.push(new THREE.Vector3(0, h, 170));
      pts.push(new THREE.Vector3(0, h, zE1 + 2));
      for (let zz = zE1; zz >= zFilm - 14; zz -= 3) {
        const f = (zz - zFilm) / (zE1 - zFilm);
        const k = f >= 0 ? Math.pow(f, 0.8) : f * 0.9;
        pts.push(new THREE.Vector3(0, h * k, zz));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 240, h === 0 ? 0.26 : 0.2, 6, false), rayMat);
      tube.rotation.z = plane;
      tube.frustumCulled = false;
      tube.renderOrder = 10;
      rays.add(tube);
    }
  }
  lens.add(rays);

  // ---- Explode tracks (lens-local) ---------------------------------------------
  rig.add(lens, 'lens', [0, 0, 100]);
  // Parked below frame while the body chapters play out.
  rig.add(lens, 'lensPark', [0, -270, 160], [0.3, 0, 0]);
  rig.floaty(lens, 1.2, 0.5);
  rig.add(front, 'lensInner', [0, 0, 64]);
  rig.add(baffle, 'lensInner', [0, 0, 50]);
  rig.add(ap, 'lensInner', [0, 0, 44]);
  rig.add(dof, 'lensInner', [0, 0, 30]);
  rig.add(focus, 'lensInner', [0, 0, -34]);
  rig.add(collar, 'lensInner', [0, 0, -42]);
  rig.add(bayonet, 'lensInner', [0, 0, -52]);
  rig.add(rear, 'lensInner', [0, 0, -62]);
  elements.forEach((el) => {
    rig.add(el, 'iris', [0, 0, (el.userData.zc - stopZ) * 0.9]);
    rig.add(el, 'spreadLens', [0, 0, (el.userData.zc - stopZ) * 0.5]);
  });
  rig.add(iris, 'iris', [0, -58, 0], [0, 0.25, 0]);

  rig.anchor(front, 'frontBarrel', [0, 23.4, 30]);
  rig.anchor(ap, 'apertureRing', [0, 25, 22]);
  rig.anchor(focus, 'focusRing', [0, -30, 7]);
  rig.anchor(dof, 'dofRing', [0, 24.5, 16.5]);
  rig.anchor(bayonet, 'bayonet', [0, 24.6, 0.6]);
  rig.anchor(elements[0], 'element1', [0, 12, 36]);
  rig.anchor(elements[2], 'doublet', [0, -15, elements[2].userData.zc]);
  rig.anchor(elements[7], 'asph', [0, -13, elements[7].userData.zc]);
  rig.anchor(elements[4], 'doublet2', [0, 14, elements[4].userData.zc]);
  rig.anchor(iris, 'iris', [0, 19, 0]);

  return { lens, focus, ap, iris, blades, rays, rayMat, elements, stopZ };
}

// Iris opening: t in [0, 1] maps f/1.4 → f/16.
export function setIris(blades, t) {
  const a = t * 0.78;
  for (const b of blades) b.rotation.z = a;
}
