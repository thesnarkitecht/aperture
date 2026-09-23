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
  lens.position.set(D.lensX, D.lensY, D.mountZ);

  // ---- Barrel (measured from a top-view photograph) -----------------------------
  // z from the mount flange: chrome bayonet 0–2.8 · DOF ring 2.8–18.2 · focus ring
  // 18.2–32.1 · aperture ring 32.6–37.6 · index ring 37.6–38.8 · hood 38.8–53.8.
  // Angles θ below: 180° is the top of the lens, increasing toward the -X side.
  const U = (thetaDeg) => thetaDeg / 360;
  const ORANGE = '#e9a23b', WHITE = '#f1eee6';

  const bayonet = new THREE.Group();
  bayonet.add(mesh(G.latheZ([
    [18.4, -2.8], [21.2, -2.8], [21.2, 0], [24.7, 0], [24.7, 2.4], [24.3, 2.8], [18.4, 2.8], [18.4, -2.8],
  ]), M.chromePolished));
  for (let i = 0; i < 3; i++) {
    bayonet.add(mesh(G.cylZ(22.6, -2.6, -1.6, { segments: 24, thetaStart: 0.4 + i * 2.094, thetaLength: 0.75 }), M.chromePolished));
  }
  // Six-bit lens-code pattern on the bayonet rim.
  for (let i = 0; i < 6; i++) {
    const bit = mesh(new THREE.BoxGeometry(1.1, 0.6, 0.2), i % 2 ? M.white : M.matteBlack, { cast: false });
    const a = -2.35 + i * 0.055;
    bit.position.set(Math.cos(a) * 21.9, Math.sin(a) * 21.9, -2.81);
    bit.rotation.z = a + Math.PI / 2;
    bayonet.add(bit);
  }
  lens.add(bayonet);

  const rear = mesh(G.latheZ([[16.6, -16], [18.2, -16], [18.2, -2.8], [16.6, -2.8], [16.6, -16]]), M.anodized);
  lens.add(rear);

  // Depth-of-field ring (fixed): rear taper, "50", DOF fan, red mounting dot.
  const dof = new THREE.Group();
  dof.name = 'dofRing';
  dof.add(mesh(G.latheZ([[21.5, 2.8], [25.2, 2.8], [26.4, 4.2], [27.0, 5.8], [27.0, 17.8], [26.7, 18.2], [21.5, 18.2], [21.5, 2.8]], 160), M.anodized));
  const dofNums = [['2', 0], ['4', 6.1], ['8', 13.8], ['11', 20.6], ['16', 27.8]];
  const dofItems = [], dofLines = [];
  for (const [t, d] of dofNums) {
    for (const sgn of d ? [-1, 1] : [1]) {
      const u = U(180 + sgn * d);
      dofItems.push({ text: t, u, y: 0.78, size: 44, color: WHITE });
      if (d) {
        const k = dofNums.findIndex(([tt]) => tt === t);
        const uc = 0.5 + sgn * k * 0.0016;
        dofLines.push({ pts: [[u, 0.6], [u, 0.52], [uc, 0.24], [uc, 0.04]], w: 2.2 });
      }
    }
  }
  dofItems.push({ text: '50', u: U(139.5), y: 0.72, size: 78, color: ORANGE, weight: 600 });
  dof.add(band(M, 27.02, 6.0, 17.6, T.ringBand({
    height: 160, items: dofItems, lines: dofLines,
    ticks: [{ u: 0.5, y0: 0.0, y1: 0.28, w: 3 }],
  })));
  const redDot = mesh(new THREE.SphereGeometry(1.15, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.redEnamel);
  const rdTheta = 242 * Math.PI / 180;
  redDot.position.set(27.0 * Math.sin(rdTheta), -27.0 * Math.cos(rdTheta), 11.3);
  redDot.lookAt(redDot.position.clone().multiplyScalar(2).setZ(11.3));
  redDot.rotateX(Math.PI / 2);
  dof.add(redDot);
  lens.add(dof);

  // Focus ring: smooth barrel carrying the feet (orange) and metre (white) scales.
  const focus = new THREE.Group();
  focus.name = 'focusRing';
  focus.add(mesh(G.latheZ([[21.6, 18.4], [26.6, 18.4], [27.0, 18.8], [27.0, 31.7], [26.6, 32.1], [21.6, 32.1], [21.6, 18.4]], 160), M.anodized));
  const metres = [['∞', 180], ['5', 168.5], ['3', 160.2], ['2', 149.6], ['1.5', 138.6], ['1.2', 125.4], ['1', 115], ['0.8', 105], ['0.7', 96.5]];
  const feet = [['∞', 180], ['25', 172.3], ['10', 161.7], ['6', 148], ['5', 140], ['4', 130.4], ['3.5', 119], ['3', 111], ['2.5', 101]];
  focus.add(band(M, 27.02, 19.0, 26.6, T.ringBand({
    height: 180,
    items: [
      ...metres.map(([t, a]) => ({ text: t, u: U(a), y: 0.78, size: 50, color: WHITE })),
      ...feet.map(([t, a]) => ({ text: t, u: U(a), y: 0.33, size: 50, color: ORANGE })),
      { text: 'm', u: U(194), y: 0.78, size: 46, color: WHITE },
      { text: 'feet', u: U(195.5), y: 0.33, size: 46, color: ORANGE },
    ],
  })));
  // Low finger rest on the photographer's right-hand side.
  const rest = mesh(G.extrudeForward(G.roundedRectShape(4.6, 2.4, 1.1, 0, 0), 6.2, 0.9), M.anodized);
  rest.position.set(-27.9, 0, 18.9);
  rest.rotation.z = Math.PI / 2;
  focus.add(rest);
  lens.add(focus);

  // Aperture ring: knurled over half its circumference, f-numbers on the rest.
  const ap = new THREE.Group();
  ap.name = 'apertureRing';
  ap.add(mesh(G.ridgedRingZ({ rOuter: 27.4, rInner: 23.4, z0: 32.6, z1: 37.6, ridges: 150, depth: 0.45, chamfer: 0.4, arc: [-100 * Math.PI / 180, 81 * Math.PI / 180] }), M.anodized));
  const apStart = 171, apLen = 179;
  const fnums = [['1.4', 180], ['2', 193.7], ['2.8', 205.2], ['4', 223], ['5.6', 236.5], ['8', 253], ['11', 266], ['16', 280]];
  const apBand = band(M, 27.06, 33.0, 37.2, T.ringBand({
    width: 2048, height: 128,
    items: fnums.map(([t, a]) => ({ text: t, u: (a - apStart) / apLen, y: 0.52, size: 60, color: WHITE })),
  }));
  apBand.geometry.dispose();
  apBand.geometry = G.cylZ(27.06, 33.0, 37.2, { segments: 96, open: true, thetaStart: apStart * Math.PI / 180, thetaLength: apLen * Math.PI / 180 });
  ap.add(apBand);
  lens.add(ap);

  // Index ring with the white aperture-index dot.
  const idxRing = new THREE.Group();
  idxRing.add(mesh(G.latheZ([[23.6, 37.6], [26.9, 37.6], [26.9, 38.5], [26.6, 38.8], [23.6, 38.8], [23.6, 37.6]], 160), M.anodized));
  const idxDot = mesh(new THREE.SphereGeometry(0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.white);
  idxDot.position.set(0, 26.9, 38.15);
  idxRing.add(idxDot);
  lens.add(idxRing);

  // Built-in hood, matte inside.
  const hood = new THREE.Group();
  hood.name = 'hood';
  hood.add(mesh(G.latheZ([[24.4, 38.8], [25.7, 38.8], [25.7, 53.2], [25.3, 53.8], [24.4, 53.8], [24.4, 38.8]], 160), M.anodized));
  hood.add(mesh(G.cylZ(24.38, 38.8, 53.8, { segments: 128, open: true }), M.matteBlack));
  lens.add(hood);

  // Front bezel with the engraved name ring, just ahead of the front element.
  const front = new THREE.Group();
  front.name = 'frontBezel';
  front.add(mesh(G.latheZ([[20.4, 36.4], [24.3, 36.4], [24.3, 38.2], [20.4, 38.2], [20.4, 36.4]], 128), M.anodized));
  const nameRing = mesh(new THREE.RingGeometry(20.5, 24.2, 160, 1), new THREE.MeshPhysicalMaterial({
    map: T.polarText({
      size: 2048, base: '#0c0c0d',
      items: [
        { text: 'LEICA', angle: 0, r: 0.915, size: 64, weight: 600, arc: true, spacing: 0.06, color: '#efece4' },
        { text: 'SUMMILUX-M 1:1.4/50 ASPH.', angle: 1.75, r: 0.915, size: 58, weight: 500, arc: true, spacing: 0.043, color: '#efece4' },
        { text: 'E46', angle: 3.95, r: 0.915, size: 58, weight: 500, arc: true, spacing: 0.05, color: '#efece4' },
        { text: '4659050', angle: 4.95, r: 0.915, size: 58, weight: 500, arc: true, spacing: 0.045, color: '#efece4' },
      ],
    }),
    metalness: 0.3, roughness: 0.4, clearcoat: 0.4,
  }));
  nameRing.position.z = 38.21;
  front.add(nameRing);
  lens.add(front);

  const baffle = mesh(G.latheZ([[19.4, 30], [20.4, 30], [20.4, 36.4], [19.4, 36.4], [19.4, 30]], 96), M.matteBlack);
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
  let z = 37.2;
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
  rig.add(hood, 'lensInner', [0, 0, 66]);
  rig.add(idxRing, 'lensInner', [0, 0, 58]);
  rig.add(front, 'lensInner', [0, 0, 44]);
  rig.add(baffle, 'lensInner', [0, 0, 38]);
  rig.add(ap, 'lensInner', [0, 0, 50]);
  rig.add(focus, 'lensInner', [0, 0, -38]);
  rig.add(dof, 'lensInner', [0, 0, -52]);
  rig.add(bayonet, 'lensInner', [0, 0, -64]);
  rig.add(rear, 'lensInner', [0, 0, -76]);
  elements.forEach((el) => {
    rig.add(el, 'iris', [0, 0, (el.userData.zc - stopZ) * 0.9]);
    rig.add(el, 'spreadLens', [0, 0, (el.userData.zc - stopZ) * 0.5]);
  });
  rig.add(iris, 'iris', [0, -58, 0], [0, 0.25, 0]);

  return { lens, focus, ap, iris, blades, rays, rayMat, elements, stopZ };
}

// Iris opening: t in [0, 1] maps f/1.4 → f/16.
export function setIris(blades, t) {
  const a = t * 0.78;
  for (const b of blades) b.rotation.z = a;
}
