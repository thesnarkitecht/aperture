import './style.css';
import * as THREE from 'three';
import { App, type CameraDriver } from './app';
import type { QualityName } from './engine/pipeline';
import { EXTERIOR } from './engine/zones';
import { WalkController } from './player/controls';
import { Tour, type Caption } from './tour';
import { ROOMS } from './ship/layout';

const params = new URLSearchParams(location.search);
const capture = params.has('capture');
const container = document.getElementById('viewport')!;
const storedQuality = (() => {
  try {
    return localStorage.getItem('perihelion.quality') as QualityName | null;
  } catch {
    return null;
  }
})();
const quality = (params.get('q') as QualityName) || (capture ? 'cinematic' : storedQuality || 'high');

const app = new App(container, quality, { capture });
const walk = new WalkController(app.pipeline.renderer.domElement);
const tour = new Tour();
(window as unknown as { __app: App }).__app = app;
(window as unknown as { __THREE: typeof THREE }).__THREE = THREE;

const $ = (id: string) => document.getElementById(id)!;
const ui = {
  loader: $('loader'),
  menu: $('menu'),
  hud: $('hud'),
  fill: $('progress-fill'),
  text: $('progress-text'),
  deck: $('location-deck'),
  name: $('location-name'),
  location: $('location'),
  hint: $('hint'),
  stats: $('stats'),
  caption: $('caption'),
  kicker: $('caption-kicker'),
  title: $('caption-title'),
  minimap: $('minimap') as HTMLCanvasElement,
  touch: $('touch'),
  stick: $('stick'),
  knob: $('stick-knob'),
};

type Mode = 'menu' | 'walk' | 'tour';
let mode: Mode = 'menu';

/** Slow orbit around the ship behind the menu. */
const idle: CameraDriver = {
  update(_dt, camera, a) {
    const t = a.time * 0.035 + 2.2;
    camera.position.set(Math.cos(t) * 62, 14 + Math.sin(t * 0.7) * 5, 6 + Math.sin(t) * 62);
    camera.lookAt(0, 2, 4);
    if (camera.fov !== 50) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
  },
};

function setMode(next: Mode) {
  mode = next;
  ui.menu.classList.toggle('hidden', next !== 'menu');
  ui.hud.classList.toggle('hidden', next === 'menu');
  ui.location.classList.toggle('hidden', next === 'tour');
  ui.hint.classList.toggle('hidden', next === 'tour');
  document.querySelector('#crosshair')!.classList.toggle('hidden', next !== 'walk');
  walk.enabled = next === 'walk';
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  ui.touch.classList.toggle('hidden', !(coarse && next === 'walk'));
  if (next === 'tour') {
    tour.start(0);
    app.driver = tour;
  } else {
    if (tour.playing) tour.stop(app);
    if (next === 'walk') {
      app.driver = walk;
      if (app.camera.fov !== 72) {
        app.camera.fov = 72;
        app.camera.updateProjectionMatrix();
      }
    } else {
      app.driver = idle;
    }
  }
}

// ---------------------------------------------------------------------------
// HUD
// ---------------------------------------------------------------------------

function showLocation(zoneId: string) {
  if (zoneId === EXTERIOR) {
    ui.deck.textContent = 'EVA';
    ui.name.textContent = 'OUTSIDE THE HULL';
    return;
  }
  const room = ROOMS.find((r) => r.id === zoneId);
  if (!room) return;
  ui.deck.textContent = room.deck.toUpperCase();
  ui.name.textContent = room.label.toUpperCase();
  ui.location.style.opacity = '1';
}
app.onZoneChange = showLocation;

function showCaption(c: Caption | null) {
  if (!c) {
    ui.caption.classList.add('hidden');
    return;
  }
  ui.caption.classList.remove('hidden');
  ui.caption.style.opacity = String(c.alpha);
  if (ui.kicker.textContent !== c.kicker) ui.kicker.textContent = c.kicker;
  if (ui.title.textContent !== c.title) ui.title.textContent = c.title;
}

function drawMinimap() {
  const cv = ui.minimap;
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  g.clearRect(0, 0, W, H);
  // World x in [-10, 10], z in [-30, 40] -> canvas.
  const sx = (x: number) => ((x + 10) / 20) * (W - 40) + 20;
  const sz = (z: number) => ((z + 30) / 70) * (H - 40) + 20;
  for (const room of ROOMS) {
    g.beginPath();
    room.poly.forEach(([x, z], i) => (i ? g.lineTo(sx(x), sz(z)) : g.moveTo(sx(x), sz(z))));
    g.closePath();
    const active = room.id === app.zone;
    g.fillStyle = active ? 'rgba(242,163,58,0.22)' : 'rgba(232,228,218,0.05)';
    g.fill();
    g.strokeStyle = active ? 'rgba(242,163,58,0.9)' : 'rgba(232,228,218,0.35)';
    g.lineWidth = 2;
    g.stroke();
    const cx = room.poly.reduce((s, p) => s + p[0], 0) / room.poly.length;
    const cz = room.poly.reduce((s, p) => s + p[1], 0) / room.poly.length;
    g.fillStyle = active ? '#f2a33a' : 'rgba(232,228,218,0.55)';
    g.font = '600 13px ui-monospace, monospace';
    g.textAlign = 'center';
    const label = room.label.split(' ')[0].toUpperCase();
    if (room.id !== 'corridor') g.fillText(label, sx(cx), sz(cz) + 4);
  }
  const p = app.camera.position;
  const e = new THREE.Euler().setFromQuaternion(app.camera.quaternion, 'YXZ');
  g.save();
  g.translate(sx(p.x), sz(p.z));
  g.rotate(-e.y);
  g.fillStyle = '#62d5e8';
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(7, 8);
  g.lineTo(0, 4);
  g.lineTo(-7, 8);
  g.closePath();
  g.fill();
  g.restore();
}

function updateStats() {
  const s = app.stats;
  ui.stats.textContent = [
    `${(1000 / Math.max(1, app.frameMs)).toFixed(0)} fps · ${app.frameMs.toFixed(1)} ms`,
    `draw calls ${s.calls} · tris ${(s.triangles / 1000).toFixed(0)}k`,
    `ship ${s.ship.meshes} meshes · ${(s.ship.triangles / 1000).toFixed(0)}k tris · ${s.ship.pieces} parts`,
    `lights ${s.lights} pooled · zone ${s.zone}`,
    `quality ${app.qualityName} · res ${(s.pixelRatio * 100).toFixed(0)}%`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (mode === 'menu') return;
  if (e.code === 'KeyF') app.flashlightOn = !app.flashlightOn;
  if (e.code === 'KeyM') ui.minimap.classList.toggle('hidden');
  if (e.code === 'Backquote') ui.stats.classList.toggle('hidden');
  if (e.code === 'KeyT') {
    if (mode === 'tour') {
      walk.syncFrom(app.camera, app);
      setMode('walk');
      walk.requestLock();
    } else setMode('tour');
  }
  if (e.code === 'Escape' && mode === 'tour') setMode('menu');
});

walk.onLockChange = (locked) => {
  if (!locked && mode === 'walk' && !window.matchMedia('(pointer: coarse)').matches) setMode('menu');
};

$('btn-walk').addEventListener('click', () => {
  if (app.driver === idle) walk.place(-3.4, -4.75, -Math.PI / 2, -0.04);
  setMode('walk');
  walk.requestLock();
  ui.hint.style.opacity = '1';
  setTimeout(() => (ui.hint.style.opacity = '0.35'), 6000);
});
$('btn-tour').addEventListener('click', () => setMode('tour'));
app.pipeline.renderer.domElement.addEventListener('click', () => {
  if (mode === 'walk' && !walk.locked) walk.requestLock();
});

const qualityButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('#quality-seg button'));
function markQuality() {
  for (const b of qualityButtons) b.setAttribute('aria-checked', String(b.dataset.q === app.qualityName));
}
for (const b of qualityButtons) {
  b.setAttribute('role', 'radio');
  b.addEventListener('click', () => {
    const q = b.dataset.q as QualityName;
    app.setQuality(q);
    try {
      localStorage.setItem('perihelion.quality', q);
    } catch {
      /* storage unavailable */
    }
    markQuality();
  });
}

// Touch joystick.
let stickId: number | null = null;
ui.stick.addEventListener('touchstart', (e) => {
  stickId = e.changedTouches[0].identifier;
  e.preventDefault();
});
ui.stick.addEventListener('touchmove', (e) => {
  for (const t of Array.from(e.changedTouches)) {
    if (t.identifier !== stickId) continue;
    const r = ui.stick.getBoundingClientRect();
    const dx = (t.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (t.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.min(1, Math.hypot(dx, dy));
    const a = Math.atan2(dy, dx);
    walk.setStick(Math.cos(a) * l, Math.sin(a) * l);
    ui.knob.style.transform = `translate(${Math.cos(a) * l * 38}px, ${Math.sin(a) * l * 38}px)`;
  }
  e.preventDefault();
});
const endStick = () => {
  stickId = null;
  walk.setStick(0, 0);
  ui.knob.style.transform = '';
};
ui.stick.addEventListener('touchend', endStick);
ui.stick.addEventListener('touchcancel', endStick);

tour.onCaption = (c) => (capture ? drawOverlayCaption(c) : showCaption(c));
tour.onEnd = () => {
  if (!capture) setMode('menu');
};

// ---------------------------------------------------------------------------
// Capture mode: captions are composited into the frame itself.
// ---------------------------------------------------------------------------

const overlay = document.createElement('canvas');
overlay.width = 1920;
overlay.height = 1080;
const overlayTex = new THREE.CanvasTexture(overlay);
overlayTex.colorSpace = THREE.NoColorSpace;
let lastCaptionKey = '';
function drawOverlayCaption(c: Caption | null) {
  const key = c ? `${c.kicker}|${c.title}|${c.alpha.toFixed(3)}` : '';
  if (key === lastCaptionKey) return;
  lastCaptionKey = key;
  const u = app.pipeline.finalUniforms;
  u.tOverlay.value = overlayTex;
  const g = overlay.getContext('2d')!;
  g.clearRect(0, 0, overlay.width, overlay.height);
  if (!c) {
    u.uOverlay.value = 0;
    overlayTex.needsUpdate = true;
    return;
  }
  const x = 116;
  const y = 918;
  g.globalAlpha = c.alpha;
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x - 28, y - 24, 3, 118);
  g.fillStyle = '#f2a33a';
  g.font = `600 22px 'DejaVu Sans Mono', monospace`;
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '4px';
  g.fillText(c.kicker.toUpperCase(), x, y);
  g.fillStyle = '#eee9de';
  g.font = `300 64px 'Liberation Sans', 'DejaVu Sans', sans-serif`;
  (g as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '14px';
  g.shadowColor = 'rgba(0,0,0,0.5)';
  g.shadowBlur = 18;
  g.fillText(c.title.toUpperCase(), x - 4, y + 78);
  g.shadowBlur = 0;
  g.fillStyle = '#f2a33a';
  g.fillRect(x - 28, y - 24, 3, 118);
  u.uOverlay.value = 1;
  overlayTex.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

async function start() {
  await app.init((f, label) => {
    ui.fill.style.width = `${Math.round(f * 100)}%`;
    ui.text.textContent = label;
  });

  const w = window as unknown as Record<string, unknown>;
  // Tooling: render a still from an explicit viewpoint.
  w.__renderView = (pos: number[], look: number[], fov = 72, settle = 30, width = 0, height = 0) => {
    if (width && height) app.resize(width, height);
    app.driver = null;
    app.camera.fov = fov;
    app.camera.updateProjectionMatrix();
    for (let i = 0; i < settle; i++) {
      app.camera.position.set(pos[0], pos[1], pos[2]);
      app.camera.lookAt(look[0], look[1], look[2]);
      app.frame(1 / 30, i === settle - 1);
    }
    return app.pipeline.renderer.domElement.toDataURL('image/png');
  };
  // Tooling: deterministic tour playback for the video renderer.
  w.__tour = {
    duration: tour.duration,
    begin(width: number, height: number) {
      app.resize(width, height);
      ui.loader.classList.add('hidden');
      ui.menu.classList.add('hidden');
      tour.start(0);
      app.driver = tour;
      app.time = 0;
    },
    /** Advance by dt; when render is true returns the frame as a data URL. */
    step(dt: number, render: boolean, type = 'image/png', q = 0.95) {
      app.frame(dt, render);
      return render ? app.pipeline.renderer.domElement.toDataURL(type, q) : null;
    },
  };
  w.__ready = true;

  ui.loader.classList.add('hidden');
  if (capture) return;
  markQuality();
  setMode('menu');
  let last = performance.now();
  let slowFrames = 0;
  let fastFrames = 0;
  let hudTimer = 0;
  const loop = () => {
    requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    app.frame(dt);
    // Dynamic resolution: trade pixels for frame rate on slower GPUs.
    if (app.pipeline.quality.dynamicResolution) {
      const ms = dt * 1000;
      if (ms > 24) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (ms < 13) fastFrames++;
      else fastFrames = 0;
      const p = app.pipeline;
      if (slowFrames > 45 && p.dynamicScale > 0.55) {
        p.dynamicScale = Math.max(0.55, p.dynamicScale - 0.1);
        app.resize();
        slowFrames = 0;
      } else if (fastFrames > 240 && p.dynamicScale < 1) {
        p.dynamicScale = Math.min(1, p.dynamicScale + 0.1);
        app.resize();
        fastFrames = 0;
      }
    }
    hudTimer += dt;
    if (hudTimer > 0.25 && mode !== 'menu') {
      hudTimer = 0;
      if (!ui.minimap.classList.contains('hidden')) drawMinimap();
      if (!ui.stats.classList.contains('hidden')) updateStats();
    }
  };
  loop();
  window.addEventListener('resize', () => app.resize());
}

start().catch((e) => {
  console.error(e);
  ui.text.textContent = `Failed to start: ${e?.message ?? e}`;
});
