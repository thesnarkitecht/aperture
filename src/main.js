import * as THREE from 'three';
import './styles.css';
import { createStage } from './core/stage.js';
import { createMaterials } from './core/materials.js';
import { Rig, keyed } from './core/rig.js';
import { buildBody } from './parts/body.js';
import { buildTopPlate } from './parts/topplate.js';
import { buildLens, setIris } from './parts/lens.js';
import { buildRangefinder } from './parts/rangefinder.js';
import { buildSensor, buildShutter, buildMainboard } from './parts/digital.js';
import { keys } from './chapters.js';

const $ = (sel) => document.querySelector(sel);
const N = keys.length;
const DEG = Math.PI / 180;

const loaderBar = $('#loader .bar i');
const step = (p) => {
  loaderBar.style.transform = `scaleX(${p})`;
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
};

async function main() {
  $('#scroll').style.height = `${N * 110}vh`;
  await step(0.05);
  // Fonts are only needed for the engravings baked into textures.
  await Promise.race([
    Promise.all([
      document.fonts.load('italic 400 64px "Instrument Serif"'),
      document.fonts.load('600 32px "Inter"'),
    ].map((p) => p.catch(() => null))),
    new Promise((r) => setTimeout(r, 2500)),
  ]);

  await step(0.15);
  const stage = createStage($('#gl'));
  const { scene, camera, renderer } = stage;

  await step(0.3);
  const M = createMaterials();
  const rig = new Rig();
  const root = new THREE.Group();
  root.scale.setScalar(0.01);
  scene.add(root);

  await step(0.45);
  const body = buildBody(M, rig);
  const top = buildTopPlate(M, rig);
  root.add(body.body, top.top);

  await step(0.6);
  const lens = buildLens(M, rig);
  root.add(lens.lens);

  await step(0.72);
  const shutter = buildShutter(M, rig);
  const sensor = buildSensor(M, rig);
  const board = buildMainboard(M, rig);
  const rf = buildRangefinder(M, rig);
  root.add(shutter.group, sensor.group, board.group, rf.group);

  // Keep glowing / transparent overlays out of the ambient-occlusion G-buffer.
  root.traverse((o) => {
    if (o.isMesh && (o.material.transparent || o.material.blending === THREE.AdditiveBlending)) stage.aoExclude.push(o);
  });

  await step(0.85);
  camera.position.set(0, 1, 5);
  camera.lookAt(0, 0, 0);
  try { await renderer.compileAsync(scene, camera); } catch { /* lazy compile fallback */ }

  // ---- Scroll → explode timeline ---------------------------------------------
  // Beats: 0 hero · 1 lens · 2 optics · 3 iris · 4 top plate · 5 rangefinder ·
  // 6 rear · 7 sensor & shutter · 8 battery & base · 9 everything · 10 assembled
  const out = (k) => [[9.55, 1], [10.15, 0]].map(([t, v]) => [t, v * k]);
  const W = {
    lens: keyed([[0.25, 0], [1.0, 1], ...out(1)]),
    lensPark: keyed([[3.55, 0], [4.2, 1], [8.25, 1], [9.0, 0]]),
    lensInner: keyed([[1.2, 0], [2.0, 1], [3.55, 1], [4.2, 0], [8.3, 0], [9.0, 1], ...out(1)]),
    iris: keyed([[2.3, 0], [2.95, 1], [3.55, 1], [4.2, 0], [8.3, 0], [9.0, 1], ...out(1)]),
    spreadLens: keyed([[8.3, 0], [9.0, 1], ...out(1)]),
    top: keyed([[3.3, 0], [4.0, 1], ...out(1)]),
    topHigh: keyed([[4.3, 0], [5.0, 1], ...out(1)]),
    rf: keyed([[4.35, 0], [5.0, 1], ...out(1)]),
    rfSpread: keyed([[4.6, 0], [5.2, 1], ...out(1)]),
    skin: keyed([[5.3, 0], [6.0, 1], ...out(1)]),
    rear: keyed([[5.35, 0], [6.05, 1], ...out(1)]),
    displaySpread: keyed([[5.6, 0], [6.2, 1], ...out(1)]),
    mainboard: keyed([[6.2, 0], [6.8, 1], ...out(1)]),
    sensor: keyed([[6.35, 0], [6.95, 1], ...out(1)]),
    sensorSpread: keyed([[6.6, 0], [7.15, 1], ...out(1)]),
    shutter: keyed([[6.45, 0], [7.05, 1], ...out(1)]),
    battery: keyed([[7.2, 0], [7.85, 1], ...out(1)]),
    bottom: keyed([[7.3, 0], [7.95, 1], ...out(1)]),
  };
  const spreadK = keyed([[8.3, 0], [9.0, 1], ...out(1)]);
  const floatK = keyed([[0.3, 0], [1.0, 1], [9.6, 1], [10.1, 0]]);
  const floorK = keyed([[0.2, -40.2], [0.9, -125], [7.2, -125], [7.9, -165], [9.6, -165], [10.2, -40.2]]);
  const shadowK = keyed([[0, 0.34], [0.9, 0.16], [9.6, 0.16], [10.2, 0.34]]);
  const raysK = keyed([[1.45, 0], [1.9, 1], [2.45, 1], [2.8, 0]]);
  const rfLightK = keyed([[4.6, 0], [5.0, 1], [5.45, 1], [5.8, 0]]);
  const irisK = keyed([[2.75, 0], [3.3, 1], [3.7, 1], [4.2, 0]]);
  const screenK = keyed([[5.5, 0], [5.9, 1], [6.5, 1], [6.9, 0.35], [9.6, 0.35], [10.2, 0]]);
  const weights = {};

  let sTarget = 0, s = 0;
  const readScroll = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    sTarget = Math.min(1, Math.max(0, scrollY / max)) * (N - 1);
  };
  addEventListener('scroll', readScroll, { passive: true });
  readScroll();
  s = sTarget;

  // Pointer: gentle parallax, drag to spin.
  const mouse = new THREE.Vector2(), mouseS = new THREE.Vector2();
  let yaw = 0, yawVel = 0, dragging = false, lastX = 0, lastInteract = -10;
  addEventListener('pointermove', (e) => {
    mouse.set((e.clientX / innerWidth) * 2 - 1, (e.clientY / innerHeight) * 2 - 1);
    if (dragging) {
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      yawVel = dx * 0.006;
      yaw += yawVel;
      lastInteract = performance.now() / 1000;
    }
  });
  const gl = $('#gl');
  gl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') return; // touch scrolls the page
    dragging = true; lastX = e.clientX; gl.setPointerCapture(e.pointerId); document.body.classList.add('dragging');
  });
  const endDrag = () => { dragging = false; document.body.classList.remove('dragging'); };
  gl.addEventListener('pointerup', endDrag);
  gl.addEventListener('pointercancel', endDrag);

  document.querySelectorAll('[data-finish]').forEach((b) => b.addEventListener('click', () => {
    M.setFinish(b.dataset.finish);
    document.querySelectorAll('[data-finish]').forEach((x) => x.classList.toggle('on', x === b));
  }));

  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const target = new THREE.Vector3();
  const progress = $('#progress i');
  const timer = new THREE.Timer();
  let introStart = -1;
  // Adaptive quality: if the GPU struggles, drop AO first, then resolution.
  let perfFrames = 0, perfTime = 0, perfStage = 0;
  const adapt = (dt) => {
    if (perfStage > 1 || document.hidden) return;
    perfFrames++;
    perfTime += dt;
    if (perfFrames < 90) return;
    const avg = perfTime / perfFrames;
    perfFrames = 0; perfTime = 0;
    if (avg < 0.022) return;
    if (perfStage === 0 && stage.gtao) stage.gtao.enabled = false;
    else {
      renderer.setPixelRatio(Math.min(1, renderer.getPixelRatio()));
      stage.composer.setPixelRatio(renderer.getPixelRatio());
      stage.composer.setSize(innerWidth, innerHeight);
    }
    perfStage++;
  };

  function frame(now) {
    timer.update(now);
    const dt = Math.min(timer.getDelta(), 0.05);
    const time = timer.getElapsed();
    if (introStart < 0) introStart = time;
    if (time - introStart > 1.5) adapt(dt);
    s += (sTarget - s) * (1 - Math.exp(-dt * 5));
    if (Math.abs(sTarget - s) < 1e-4) s = sTarget;

    // Explode rig.
    for (const k in W) weights[k] = W[k](s);
    rig.update(weights, 1 + 0.22 * spreadK(s), time, floatK(s));

    // Mechanisms.
    const irisT = irisK(s);
    setIris(lens.blades, irisT);
    lens.ap.rotation.z = irisT * 1.3;
    lens.focus.rotation.z = Math.sin(Math.min(1, Math.max(0, s - 0.3)) * Math.PI) * 0.5;
    lens.lens.visible = weights.lensPark < 0.995; // fully parked = off-screen
    const rays = raysK(s);
    lens.rayMat.uniforms.uTime.value = time;
    lens.rayMat.uniforms.uOpacity.value = rays;
    lens.rays.visible = rays > 0.001;
    const rfl = rfLightK(s);
    for (const m of rf.lightMats) { m.uniforms.uTime.value = time; m.uniforms.uOpacity.value = rfl; }
    rf.mirrorPivot.rotation.y = -Math.PI / 4 + Math.sin(time * 1.4) * 0.05 * rfl;
    const shutterActive = Math.max(0, 1 - Math.abs(s - 7) * 2.2);
    shutter.setPhase(shutterActive > 0.05 ? (time * 0.45) % 1 : 0);
    shutter.gears.forEach((g) => { g.rotation.y = time * 2.5 * g.userData.ratio * shutterActive; });
    M.screen.emissiveIntensity = screenK(s) * 1.4;

    // Camera: interpolate orbit keys, plus an opening dolly and pointer parallax.
    const i0 = Math.min(N - 2, Math.floor(s)), t = ease(Math.min(1, s - i0));
    const A = keys[i0], B = keys[i0 + 1];
    target.set(lerp(A.t[0], B.t[0], t), lerp(A.t[1], B.t[1], t), lerp(A.t[2], B.t[2], t)).multiplyScalar(0.01);
    const az = lerp(A.az + (A.orbit || 0) * Math.min(1, s - i0), B.az, t);
    const el = lerp(A.el, B.el, t);
    const intro = ease(Math.min(1, (time - introStart) / 3.2));
    const aspect = innerWidth / innerHeight;
    const fit = aspect < 1.2 ? Math.pow(1.2 / aspect, 0.85) : 1;
    const dist = lerp(A.d, B.d, t) * 0.01 * fit * lerp(1.55, 1, intro);
    mouseS.lerp(mouse, 1 - Math.exp(-dt * 3));
    const azR = (az + mouseS.x * 4 + Math.sin(time * 0.15) * 1.5 - (1 - intro) * 25) * DEG;
    const elR = (el - mouseS.y * 3 + (1 - intro) * 8) * DEG;
    camera.position.set(
      target.x + dist * Math.cos(elR) * Math.sin(azR),
      target.y + dist * Math.sin(elR),
      target.z + dist * Math.cos(elR) * Math.cos(azR),
    );
    camera.lookAt(target);

    // Drag spin eases back to the choreographed angle after a pause.
    if (!dragging) {
      yaw += yawVel;
      yawVel *= 0.92;
      if (performance.now() / 1000 - lastInteract > 2.5) yaw *= 0.97;
    }
    root.rotation.y = yaw;

    // Studio follows the action.
    stage.floor.position.y = floorK(s) * 0.01;
    stage.floor.material.opacity = shadowK(s);
    stage.key.position.set(target.x - 2.5, target.y + 5, target.z + 3.5);
    stage.key.target.position.copy(target);

    progress.style.transform = `scaleY(${(s / (N - 1)).toFixed(4)})`;
    document.body.classList.toggle('scrolled', s > 0.08);

    stage.render(time);
    requestAnimationFrame(frame);
  }

  await step(1);
  $('#loader').classList.add('done');
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
  window.__aperture = { scene, camera, rig, root, stage, M, setS: (v) => { s = sTarget = v; } };
}

main().catch((err) => {
  console.error(err);
  document.body.classList.add('ready');
  $('#loader').classList.add('done');
});
