import * as THREE from 'three';
import './styles.css';
import { createStage } from './core/stage.js';
import { createMaterials } from './core/materials.js';
import { Rig, keyed } from './core/rig.js';
import { buildBody } from './parts/body.js';
import { buildTopPlate, buildGearTrain } from './parts/topplate.js';
import { buildLens, setIris } from './parts/lens.js';
import { buildShutter, buildFilm, buildRangefinder, buildElectronics } from './parts/internals.js';
import { chapters, specs } from './chapters.js';

const $ = (sel, el = document) => el.querySelector(sel);
const N = chapters.length;
const DEG = Math.PI / 180;

const loader = $('#loader');
const loaderBar = $('#loader .bar i');
const loaderText = $('#loader .status');
const step = (p, text) => {
  loaderBar.style.transform = `scaleX(${p})`;
  loaderText.textContent = text;
  return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
};

// ---- UI scaffolding from chapter data -------------------------------------------
function buildUI() {
  const cards = $('#cards');
  const rail = $('#rail');
  chapters.forEach((c, i) => {
    const card = document.createElement('article');
    card.className = `card card--${c.side}`;
    card.innerHTML = `
      <p class="kicker">${c.kicker}</p>
      <h2>${c.title}</h2>
      ${c.body ? `<p class="body">${c.body}</p>` : ''}
      ${c.readout === 'fstop' ? '<div class="readout"><span class="f">f/<b data-fstop>1.4</b></span><span class="bar"><i data-fbar></i></span></div>' : ''}
      ${c.specs ? `<dl class="specs">${specs.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>
        <div class="finish-inline"><span>Finish</span><button data-finish="chrome" class="on">Silver chrome</button><button data-finish="black">Black paint</button></div>
        <p class="fine">An independent 3D study built with three.js. Not affiliated with or endorsed by Leica Camera AG. Leica, Summilux and the red dot are trademarks of their respective owners.</p>` : ''}
    `;
    cards.appendChild(card);
    c.el = card;
    const tick = document.createElement('button');
    tick.className = 'tick';
    tick.innerHTML = `<span>${String(i).padStart(2, '0')}</span>`;
    tick.setAttribute('aria-label', c.kicker);
    tick.addEventListener('click', () => scrollToChapter(i));
    rail.appendChild(tick);
    c.tick = tick;
  });
  $('#scroll').style.height = `${N * 100}vh`;
}

function scrollToChapter(i) {
  const max = document.documentElement.scrollHeight - innerHeight;
  window.scrollTo({ top: (i / (N - 1)) * max, behavior: 'smooth' });
}

// ---- Labels -------------------------------------------------------------------------
function createLabels(rig) {
  const layer = $('#labels');
  const byId = new Map(rig.anchors.map((a) => [a.id, a.obj]));
  const items = [];
  chapters.forEach((c, ci) => {
    c.labels.forEach(([id, text], k) => {
      const obj = byId.get(id);
      if (!obj) { console.warn('missing anchor', id); return; }
      const el = document.createElement('div');
      el.className = 'label';
      el.innerHTML = `<i class="dot"></i><i class="leader"></i><span>${text}</span>`;
      layer.appendChild(el);
      items.push({ el, obj, chapter: ci, k, side: 1 });
    });
  });
  const v = new THREE.Vector3();
  const center = new THREE.Vector3();
  return (camera, s, w, h, modelCenter) => {
    center.copy(modelCenter).project(camera);
    const cx = (center.x * 0.5 + 0.5) * w;
    for (const it of items) {
      const d = Math.abs(s - it.chapter);
      const vis = Math.max(0, 1 - Math.max(0, d - 0.12) / 0.2);
      if (vis <= 0.001) {
        if (it.shown) { it.el.style.opacity = 0; it.shown = false; }
        continue;
      }
      it.obj.getWorldPosition(v);
      v.project(camera);
      if (v.z > 1) { it.el.style.opacity = 0; continue; }
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * h;
      const side = x >= cx ? 1 : -1;
      if (side !== it.side) { it.side = side; it.el.classList.toggle('left', side < 0); }
      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
      it.el.style.opacity = vis.toFixed(3);
      it.el.style.setProperty('--delay', `${it.k * 40}ms`);
      it.shown = true;
    }
  };
}

// ---- Main ---------------------------------------------------------------------------
async function main() {
  buildUI();
  await step(0.05, 'Loading typefaces');
  try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); } catch { /* fonts optional */ }
  await Promise.all([
    document.fonts.load('italic 400 64px "Instrument Serif"'),
    document.fonts.load('500 32px "Inter"'),
  ].map((p) => p.catch(() => null)));

  await step(0.15, 'Setting up the studio');
  const stage = createStage($('#gl'));
  const { scene, camera, renderer } = stage;

  await step(0.3, 'Pressing vulcanite, turning brass');
  const M = createMaterials();
  const rig = new Rig();
  const root = new THREE.Group();
  root.scale.setScalar(0.01);
  scene.add(root);

  await step(0.45, 'Casting the chassis');
  const body = buildBody(M, rig);
  root.add(body.body);
  const top = buildTopPlate(M, rig);
  root.add(top.top);
  const gears = buildGearTrain(M, rig);
  root.add(gears.group);

  await step(0.6, 'Grinding eight lens elements');
  const lens = buildLens(M, rig);
  root.add(lens.lens);

  await step(0.72, 'Fitting shutter, film and rangefinder');
  const shutter = buildShutter(M, rig);
  root.add(shutter.group);
  const film = buildFilm(M, rig);
  root.add(film.group);
  const rf = buildRangefinder(M, rig);
  root.add(rf.group);
  const elec = buildElectronics(M, rig);
  root.add(elec.group);

  let meshCount = 0;
  root.traverse((o) => { if (o.isMesh) { meshCount++; if (o.castShadow === undefined) o.castShadow = true; } });
  document.querySelectorAll('[data-parts]').forEach((el) => { el.textContent = meshCount; });
  $('#hud-parts').textContent = meshCount;

  await step(0.85, 'Compiling shaders');
  const labels = createLabels(rig);
  camera.position.set(0, 1, 5);
  camera.lookAt(0, 0, 0);
  try { await renderer.compileAsync(scene, camera); } catch { /* fall back to lazy compile */ }

  // ---- Scroll → timeline --------------------------------------------------------
  const W = {
    lens: keyed([[0.25, 0], [1.0, 1], [9.55, 1], [10.15, 0]]),
    lensInner: keyed([[1.2, 0], [2.0, 1], [3.55, 1], [4.2, 0], [8.3, 0], [9.0, 1], [9.55, 1], [10.15, 0]]),
    iris: keyed([[2.3, 0], [2.95, 1], [3.55, 1], [4.2, 0], [8.3, 0], [9.0, 1], [9.55, 1], [10.15, 0]]),
    spreadLens: keyed([[8.3, 0], [9.0, 1], [9.55, 1], [10.15, 0]]),
    top: keyed([[3.3, 0], [4.0, 1], [9.55, 1], [10.15, 0]]),
    topHigh: keyed([[4.3, 0], [5.0, 1], [9.55, 1], [10.15, 0]]),
    rf: keyed([[4.35, 0], [5.0, 1], [9.55, 1], [10.15, 0]]),
    rfSpread: keyed([[4.6, 0], [5.2, 1], [9.55, 1], [10.15, 0]]),
    skin: keyed([[5.3, 0], [6.0, 1], [9.55, 1], [10.15, 0]]),
    rear: keyed([[5.35, 0], [6.05, 1], [9.55, 1], [10.15, 0]]),
    shutter: keyed([[6.3, 0], [7.0, 1], [9.55, 1], [10.15, 0]]),
    base: keyed([[7.2, 0], [7.9, 1], [9.55, 1], [10.15, 0]]),
    film: keyed([[7.3, 0], [8.0, 1], [9.55, 1], [10.15, 0]]),
  };
  const spreadK = keyed([[8.3, 0], [9.0, 1], [9.55, 1], [10.15, 0]]);
  const floatK = keyed([[0.3, 0], [1.0, 1], [9.6, 1], [10.1, 0]]);
  const floorK = keyed([[0.2, -39.3], [0.9, -125], [7.2, -125], [7.9, -165], [9.6, -165], [10.2, -39.3]]);
  const raysK = keyed([[1.45, 0], [1.9, 1], [2.45, 1], [2.8, 0]]);
  const rfLightK = keyed([[4.6, 0], [5.0, 1], [5.45, 1], [5.8, 0]]);
  const irisK = keyed([[2.75, 0], [3.3, 1], [3.7, 1], [4.2, 0]]);
  const explodeK = keyed([[0.25, 0], [9.0, 1], [9.55, 1], [10.15, 0]]);
  const weights = {};

  let sTarget = 0, s = 0;
  const readScroll = () => {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    sTarget = Math.min(1, Math.max(0, scrollY / max)) * (N - 1);
  };
  addEventListener('scroll', readScroll, { passive: true });
  readScroll();
  s = sTarget;

  // Pointer: parallax + drag to spin.
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
  gl.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; gl.setPointerCapture(e.pointerId); document.body.classList.add('dragging'); });
  const endDrag = () => { dragging = false; document.body.classList.remove('dragging'); };
  gl.addEventListener('pointerup', endDrag);
  gl.addEventListener('pointercancel', endDrag);

  // Finish toggle.
  const setFinish = (f) => {
    M.setFinish(f);
    document.querySelectorAll('[data-finish]').forEach((b) => b.classList.toggle('on', b.dataset.finish === f));
  };
  document.querySelectorAll('[data-finish]').forEach((b) => b.addEventListener('click', () => setFinish(b.dataset.finish)));

  // Camera interpolation between chapter keys.
  const camFor = (i) => chapters[Math.min(N - 1, Math.max(0, i))].cam;
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = (t) => t * t * (3 - 2 * t);
  const target = new THREE.Vector3();
  const modelCenter = new THREE.Vector3();
  const fstopEl = document.querySelector('[data-fstop]');
  const fbarEl = document.querySelector('[data-fbar]');
  const fstops = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16];
  const hudExplode = $('#hud-explode');
  const hudChapter = $('#hud-chapter');
  const progress = $('#progress i');
  let lastFstop = '';

  const clock = new THREE.Clock();
  let prevActive = -1;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const time = clock.elapsedTime;
    s += (sTarget - s) * (1 - Math.exp(-dt * 5.5));
    if (Math.abs(sTarget - s) < 1e-4) s = sTarget;

    // Explode rig.
    for (const k in W) weights[k] = W[k](s);
    const spread = 1 + 0.22 * spreadK(s);
    rig.update(weights, spread, time, floatK(s));

    // Mechanisms.
    const irisT = irisK(s);
    setIris(lens.blades, irisT);
    lens.ap.rotation.z = irisT * 1.3;
    lens.focus.rotation.z = Math.sin(Math.min(1, Math.max(0, s - 0.3)) * Math.PI) * 0.5;
    lens.rayMat.uniforms.uTime.value = time;
    lens.rayMat.uniforms.uOpacity.value = raysK(s);
    lens.rays.visible = raysK(s) > 0.001;
    for (const m of rf.lightMats) { m.uniforms.uTime.value = time; m.uniforms.uOpacity.value = rfLightK(s); }
    rf.mirrorPivot.rotation.y = -Math.PI / 4 + Math.sin(time * 1.4) * 0.05 * rfLightK(s);
    gears.gears.forEach((g) => { g.rotation.y = s * 2.2 * g.userData.ratio; });
    const shutterActive = Math.max(0, 1 - Math.abs(s - 7) * 2.2);
    shutter.setPhase(shutterActive > 0.05 ? (time * 0.45) % 1 : 0);
    shutter.gears.forEach((g) => { g.rotation.y = time * 1.5 * g.userData.ratio * shutterActive; });

    // Camera.
    const i0 = Math.floor(s), t = ease(s - i0);
    const A = camFor(i0), B = camFor(i0 + 1);
    const mob = stage.isMobile ? 1.35 : 1;
    target.set(lerp(A.t[0], B.t[0], t), lerp(A.t[1], B.t[1], t), lerp(A.t[2], B.t[2], t)).multiplyScalar(0.01);
    const orbitA = A.orbit ? A.orbit * (s - i0) : 0;
    let az = lerp(A.az + orbitA, B.az, t);
    if (A.orbit && i0 + 1 < N) az = lerp(A.az + A.orbit * Math.min(1, s - i0), B.az, t);
    const el = lerp(A.el, B.el, t);
    const dist = lerp(A.d, B.d, t) * 0.01 * mob;
    mouseS.lerp(mouse, 1 - Math.exp(-dt * 3));
    const azR = (az + mouseS.x * 4 + Math.sin(time * 0.15) * 1.5) * DEG;
    const elR = (el - mouseS.y * 3) * DEG;
    camera.position.set(
      target.x + dist * Math.cos(elR) * Math.sin(azR),
      target.y + dist * Math.sin(elR),
      target.z + dist * Math.cos(elR) * Math.cos(azR),
    );
    camera.lookAt(target);
    const shift = stage.isMobile ? 0 : lerp(A.shift, B.shift, t);
    const w = innerWidth, h = innerHeight;
    camera.setViewOffset(w, h, -shift * w, stage.isMobile ? h * 0.12 : 0, w, h);

    // Spin: user yaw decays back to zero after a pause.
    if (!dragging) {
      yaw += yawVel;
      yawVel *= 0.92;
      if (performance.now() / 1000 - lastInteract > 2.5) yaw *= 0.97;
    }
    root.rotation.y = yaw;

    // Studio.
    stage.floor.position.y = floorK(s) * 0.01;
    stage.key.position.set(target.x - 2.5, target.y + 5, target.z + 3.5);
    stage.key.target.position.copy(target);
    stage.backdrop.material.uniforms.uGlow.value.set(0.5 + (stage.isMobile ? 0 : shift * 0.9), 0.55);

    // UI.
    const active = Math.round(s);
    chapters.forEach((c, i) => {
      const d = s - i;
      const o = Math.max(0, 1 - Math.abs(d) * 2.4);
      c.el.style.opacity = o.toFixed(3);
      c.el.style.transform = `translate3d(0, ${(-d * 60).toFixed(1)}px, 0)`;
      c.el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
      c.el.style.pointerEvents = o > 0.5 ? 'auto' : 'none';
    });
    if (active !== prevActive) {
      chapters.forEach((c, i) => c.tick.classList.toggle('on', i === active));
      hudChapter.textContent = String(active).padStart(2, '0');
      prevActive = active;
    }
    document.body.classList.toggle('scrolled', s > 0.15);
    progress.style.transform = `scaleY(${(s / (N - 1)).toFixed(4)})`;
    hudExplode.textContent = `${Math.round(explodeK(s) * 100)}%`;
    const fIdx = irisT * (fstops.length - 1);
    const fs = fstops[Math.round(fIdx)].toString();
    if (fstopEl && fs !== lastFstop) { fstopEl.textContent = fs; lastFstop = fs; }
    if (fbarEl) fbarEl.style.transform = `scaleX(${(1 - irisT * 0.92).toFixed(3)})`;

    modelCenter.copy(target);
    labels(camera, s, w, h, modelCenter);
    stage.render(time);
    requestAnimationFrame(frame);
  }

  await step(1, 'Ready');
  loader.classList.add('done');
  document.body.classList.add('ready');
  requestAnimationFrame(frame);
  window.__aperture = { scene, camera, rig, root, stage, M, setS: (v) => { s = sTarget = v; } };
}

main().catch((err) => {
  console.error(err);
  loaderText.textContent = 'This experience needs WebGL 2. Try a recent desktop browser.';
});
