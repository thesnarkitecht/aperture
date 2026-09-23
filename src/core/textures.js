// Procedural textures. Everything is generated at load time on canvases so the
// project ships with zero binary assets.
import * as THREE from 'three';

const TAU = Math.PI * 2;

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

// Converts a wrap-around height field into a tangent-space normal map.
function heightToNormal(height, size, strength) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c, { srgb = false, repeat = 1, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// Vulcanite: a tight, irregular pebble grain made from tiled Worley noise.
export function leatherNormal(size = 512, cells = 30) {
  const pts = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      pts.push([(i + 0.15 + hash(i, j, 1) * 0.7) / cells, (j + 0.15 + hash(i, j, 2) * 0.7) / cells, 0.6 + hash(i, j, 3) * 0.4]);
    }
  }
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
      let f1 = 9, f2 = 9, amp = 1;
      for (let oj = -1; oj <= 1; oj++) {
        for (let oi = -1; oi <= 1; oi++) {
          const ii = (ci + oi + cells) % cells, jj = (cj + oj + cells) % cells;
          const p = pts[jj * cells + ii];
          let dx = p[0] + (ci + oi - ii) / cells - u;
          let dy = p[1] + (cj + oj - jj) / cells - v;
          const d = Math.hypot(dx, dy) * cells;
          if (d < f1) { f2 = f1; f1 = d; amp = p[2]; } else if (d < f2) f2 = d;
        }
      }
      const pebble = Math.min(1, (f2 - f1) * 1.6);
      const n = hash(x, y, 7) * 0.08;
      h[y * size + x] = Math.sqrt(pebble) * amp + n;
    }
  }
  return tex(heightToNormal(h, size, 2.2));
}

// Fine woven cloth for the rubberised shutter curtain.
export function clothNormal(size = 256) {
  const h = new Float32Array(size * size);
  const k = 32;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.sin((x / size) * TAU * k), b = Math.sin((y / size) * TAU * k);
      const over = Math.sin((x / size) * TAU * k / 2) * Math.sin((y / size) * TAU * k / 2) > 0;
      h[y * size + x] = (over ? a * a : b * b) * 0.6 + hash(x, y, 4) * 0.08;
    }
  }
  return tex(heightToNormal(h, size, 1.2));
}

// Vertical ribbing of the frame-line illumination window.
export function ribbedNormal(size = 256, ribs = 40) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const f = (x / size) * ribs;
      h[y * size + x] = Math.abs((f % 1) - 0.5) * 2;
    }
  }
  return tex(heightToNormal(h, size, 3));
}

// Concentric machining marks for turned faces (dial tops, lens front ring).
export function turnedNormal(size = 512, rings = 180) {
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x / size - 0.5, y / size - 0.5) * 2;
      h[y * size + x] = Math.sin(r * rings * TAU) * 0.5 + hash(x, y, 9) * 0.1;
    }
  }
  const t = tex(heightToNormal(h, size, 0.5));
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

const FONT_SANS = '"Inter", "Helvetica Neue", Arial, sans-serif';
const FONT_SERIF = '"Instrument Serif", "Times New Roman", serif';

// A band that wraps around a cylinder: u = circumference, v = ring width.
// items: [{ u, text, color, size, weight, font, align, y }]
export function ringBand({ width = 4096, height = 128, base = '#0d0d0e', items = [], ticks = [] }) {
  const c = canvas(width, height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  for (const t of ticks) {
    ctx.fillStyle = t.color || '#e8e6e0';
    ctx.fillRect(t.u * width - (t.w || 3) / 2, t.y0 * height, t.w || 3, (t.y1 - t.y0) * height);
  }
  for (const it of items) {
    ctx.fillStyle = it.color || '#e8e6e0';
    ctx.font = `${it.style || ''} ${it.weight || 500} ${it.size || 44}px ${it.font === 'serif' ? FONT_SERIF : FONT_SANS}`;
    ctx.textAlign = it.align || 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.text, it.u * width, (it.y ?? 0.5) * height);
  }
  const t = tex(c, { srgb: true, aniso: 16 });
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Text laid around a circle on a square canvas (dial tops, lens front ring).
export function polarText({ size = 1024, base = null, items = [], rings = [] }) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  if (base) {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
  }
  const cx = size / 2;
  for (const r of rings) {
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.w;
    ctx.beginPath();
    ctx.arc(cx, cx, r.r * cx, 0, TAU);
    ctx.stroke();
  }
  for (const it of items) {
    ctx.save();
    ctx.translate(cx, cx);
    ctx.rotate(it.angle);
    ctx.fillStyle = it.color || '#f0eee8';
    ctx.font = `${it.style || ''} ${it.weight || 600} ${it.size || 48}px ${it.font === 'serif' ? FONT_SERIF : FONT_SANS}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (it.arc) {
      // Spread characters along the arc.
      const chars = [...it.text];
      const spacing = it.spacing || 0.045;
      let a = -((chars.length - 1) * spacing) / 2;
      for (const ch of chars) {
        ctx.save();
        ctx.rotate(a);
        ctx.fillText(ch, 0, -it.r * cx);
        ctx.restore();
        a += spacing;
      }
    } else if (it.tick) {
      ctx.fillRect(-it.tick / 2, -it.r * cx, it.tick, it.len * cx);
    } else {
      ctx.fillText(it.text, 0, -it.r * cx);
    }
    ctx.restore();
  }
  const t = tex(c, { srgb: true, aniso: 16 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Free-form decal: transparent canvas with a draw callback.
export function decal(w, h, draw) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  draw(ctx, w, h, { FONT_SANS, FONT_SERIF });
  const t = tex(c, { srgb: true, aniso: 16 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// 35mm film strip: orange base, sprocket holes (alpha) and faint exposed frames.
export function filmStrip(frames = 8) {
  const fw = 380; // px per 38mm frame pitch
  const w = fw * frames, h = 350;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c0621c';
  ctx.fillRect(0, 0, w, h);
  for (let f = 0; f < frames; f++) {
    const x0 = f * fw + 10;
    const g = ctx.createLinearGradient(x0, 60, x0 + 360, 290);
    const hue = (f * 47) % 360;
    g.addColorStop(0, `hsl(${hue}, 35%, 22%)`);
    g.addColorStop(0.5, `hsl(${(hue + 40) % 360}, 45%, 38%)`);
    g.addColorStop(1, `hsl(${(hue + 90) % 360}, 30%, 16%)`);
    ctx.fillStyle = g;
    ctx.fillRect(x0, 62, 360, 226);
    // Suggestion of a scene: horizon + sun.
    ctx.fillStyle = 'rgba(20,10,5,0.45)';
    ctx.fillRect(x0, 62 + 140 + ((f * 13) % 40), 360, 86 - ((f * 13) % 40));
    ctx.beginPath();
    ctx.fillStyle = 'rgba(255,220,180,0.25)';
    ctx.arc(x0 + 80 + ((f * 61) % 200), 120, 26, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,200,120,0.9)';
    ctx.font = `600 18px ${FONT_SANS}`;
    ctx.fillText(`${f + 12}`, f * fw + 30, 44);
    ctx.fillText(`${f + 12}A`, f * fw + 200, 44);
    ctx.fillText('APERTURE 400', f * fw + 60, 320);
  }
  // Sprocket holes: 8 per frame, punched fully transparent.
  ctx.globalCompositeOperation = 'destination-out';
  const pitch = fw / 8;
  for (let x = pitch / 2; x < w; x += pitch) {
    for (const y of [10, 300]) {
      ctx.beginPath();
      ctx.roundRect(x - 14, y, 28, 38, 6);
      ctx.fill();
    }
  }
  const t = tex(c, { srgb: true });
  t.wrapT = THREE.ClampToEdgeWrapping;
  t.repeat.set(1, 1);
  return t;
}

// Printed-circuit texture for the light-meter board.
export function pcbTexture(size = 1024) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0d3b24';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(200, 170, 80, 0.85)';
  ctx.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    let x = hash(i, 1, 11) * size, y = hash(i, 2, 11) * size;
    ctx.lineWidth = 3 + hash(i, 3, 11) * 6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      const len = 40 + hash(i, s, 12) * 160;
      const dir = Math.floor(hash(i, s, 13) * 8) * (TAU / 8);
      x += Math.cos(dir) * len;
      y += Math.sin(dir) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#d8b25a';
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(240,240,230,0.8)';
  ctx.font = `600 34px ${FONT_SANS}`;
  ctx.fillText('LM-6  REV C', 60, 90);
  ctx.fillText('IC1', 520, 300);
  ctx.fillText('D1', 300, 760);
  const t = tex(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Label for the 35mm cassette (a fictional film stock).
export function canisterLabel() {
  const w = 1024, h = 512;
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#16181a';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e8b418';
  ctx.fillRect(0, 0, w, 150);
  ctx.fillStyle = '#c41a1a';
  ctx.fillRect(0, 150, w, 26);
  ctx.fillStyle = '#16181a';
  ctx.font = `800 104px ${FONT_SANS}`;
  ctx.fillText('APERTURE', 40, 112);
  ctx.fillStyle = '#f2f0ea';
  ctx.font = `300 190px ${FONT_SANS}`;
  ctx.fillText('400', 40, 380);
  ctx.font = `600 38px ${FONT_SANS}`;
  ctx.fillText('135-36  ·  B&W', 520, 300);
  ctx.fillText('ISO 400/27°', 520, 360);
  ctx.fillStyle = '#e8b418';
  for (let i = 0; i < 12; i++) ctx.fillRect(560 + i * 34, 410, 18, 50);
  return tex(c, { srgb: true });
}

// Soft radial glow used for dust motes / flares.
export function glowSprite(size = 128) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
