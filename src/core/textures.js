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
// Returns a normal map plus a roughness map (pebble crowns are worn smoother).
export function leatherMaps(size = 1024, cells = 24) {
  const pts = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      pts.push([(i + 0.1 + hash(i, j, 1) * 0.8) / cells, (j + 0.1 + hash(i, j, 2) * 0.8) / cells, 0.55 + hash(i, j, 3) * 0.45]);
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
          const dx = p[0] + (ci + oi - ii) / cells - u;
          const dy = p[1] + (cj + oj - jj) / cells - v;
          const d = Math.hypot(dx, dy) * cells;
          if (d < f1) { f2 = f1; f1 = d; amp = p[2]; } else if (d < f2) f2 = d;
        }
      }
      // Deep crevices between rounded, slightly flattened pebbles, plus fine grain.
      const edge = Math.min(1, (f2 - f1) * 1.8);
      const crown = Math.max(0, 1 - f1 * 1.1);
      const fine = (hash(x >> 1, y >> 1, 7) + hash(x, y, 8)) * 0.05;
      h[y * size + x] = Math.pow(edge, 0.45) * amp * 0.85 + crown * 0.22 + fine;
    }
  }
  // Two wrap-around box blurs round off the Worley facets into organic pebbles.
  for (let pass = 0; pass < 2; pass++) {
    const src = h.slice();
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let acc = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) acc += src[((y + oy + size) % size) * size + ((x + ox + size) % size)];
        }
        h[y * size + x] = acc / 9;
      }
    }
  }
  const normal = tex(heightToNormal(h, size, 6.0));
  const rc = canvas(size);
  const ctx = rc.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const r = Math.max(0, Math.min(255, (1.05 - h[i] * 0.45) * 235));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = r;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { normal, rough: tex(rc) };
}

// Brushed / satin metal: long horizontal streaks for a roughness map.
export function brushedRoughness(size = 1024) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rows = new Float32Array(size);
  for (let y = 0; y < size; y++) rows[y] = hash(y, 3, 21);
  for (let y = 0; y < size; y++) {
    // Smooth the per-row noise a little so streaks have width variety.
    const r = (rows[y] * 0.5 + rows[(y + 1) % size] * 0.3 + rows[(y + size - 1) % size] * 0.2);
    for (let x = 0; x < size; x++) {
      const streak = 0.5 + 0.5 * Math.sin((x / size) * Math.PI * 2 * (1 + (y % 7)) + rows[y] * 40);
      const v = 0.72 + r * 0.22 + streak * 0.04 + hash(x, y, 22) * 0.05;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 255);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return tex(c);
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
export function ringBand({ width = 4096, height = 128, base = '#0d0d0e', items = [], ticks = [], lines = [], dots = [] }) {
  const c = canvas(width, height);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, width, height);
  // Polylines in (u, v) space, e.g. the depth-of-field fan.
  for (const l of lines) {
    ctx.strokeStyle = l.color || '#e8e6e0';
    ctx.lineWidth = l.w || 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    l.pts.forEach(([u, v], i) => (i ? ctx.lineTo(u * width, v * height) : ctx.moveTo(u * width, v * height)));
    ctx.stroke();
  }
  for (const d of dots) {
    ctx.fillStyle = d.color || '#e8e6e0';
    ctx.beginPath();
    ctx.arc(d.u * width, d.v * height, d.r, 0, TAU);
    ctx.fill();
  }
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
    } else if (it.radial) {
      // Baseline along the radius, reading from the centre outward.
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(it.text, it.r * cx, 0);
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

// Printed-circuit texture: solder mask, copper traces, pads, silkscreen.
export function pcbTexture({ size = 1024, base = '#0d3b24', trace = 'rgba(200, 170, 80, 0.85)', labels = [], seed = 11 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = trace;
  ctx.lineCap = 'round';
  for (let i = 0; i < 110; i++) {
    let x = hash(i, 1, seed) * size, y = hash(i, 2, seed) * size;
    ctx.lineWidth = 2 + hash(i, 3, seed) * 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let st = 0; st < 5; st++) {
      const len = 30 + hash(i, st, seed + 1) * 150;
      const dir = Math.floor(hash(i, st, seed + 2) * 8) * (TAU / 8);
      x += Math.cos(dir) * len;
      y += Math.sin(dir) * len;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = '#d8b25a';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, TAU);
    ctx.fill();
  }
  // Via field.
  ctx.fillStyle = 'rgba(216,178,90,0.9)';
  for (let i = 0; i < 400; i++) {
    ctx.beginPath();
    ctx.arc(hash(i, 5, seed) * size, hash(i, 6, seed) * size, 2.5, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(240,240,230,0.85)';
  ctx.font = `600 30px ${FONT_SANS}`;
  for (const [t, x, y] of labels) ctx.fillText(t, x * size, y * size);
  const t = tex(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Micro-lens array over the photosites: a dense grid of tiny domes.
export function microlensNormal(size = 512, n = 64) {
  const h = new Float32Array(size * size);
  const cell = size / n;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x % cell) / cell - 0.5, v = (y % cell) / cell - 0.5;
      h[y * size + x] = Math.sqrt(Math.max(0, 0.25 - u * u - v * v));
    }
  }
  return tex(heightToNormal(h, size, 4));
}

// Ceramic sensor package: dark ceramic, gold bond-pad ring, cavity.
export function sensorPackage(w = 1024, h = 790) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#23221f';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(255,255,255,0.04)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Cavity.
  ctx.fillStyle = '#0c0c0d';
  ctx.fillRect(w * 0.08, h * 0.1, w * 0.84, h * 0.8);
  // Bond pads on the ledge.
  ctx.fillStyle = '#d6ad55';
  const pads = 58;
  for (let i = 0; i < pads; i++) {
    const x = w * 0.1 + (i / (pads - 1)) * w * 0.8;
    ctx.fillRect(x - 3, h * 0.105, 6, 16);
    ctx.fillRect(x - 3, h * 0.895 - 16, 6, 16);
  }
  for (let i = 0; i < 40; i++) {
    const y = h * 0.13 + (i / 39) * h * 0.74;
    ctx.fillRect(w * 0.085, y - 3, 16, 6);
    ctx.fillRect(w * 0.915 - 16, y - 3, 16, 6);
  }
  // Pin-1 mark.
  ctx.beginPath();
  ctx.arc(w * 0.04, h * 0.05, 9, 0, TAU);
  ctx.fillStyle = '#d6ad55';
  ctx.fill();
  const t = tex(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Rear-screen image: a live-view frame of a dusk street (no UI text).
export function screenImage(w = 1024, h = 683) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.62);
  sky.addColorStop(0, '#1d2b4a');
  sky.addColorStop(0.55, '#b85e3c');
  sky.addColorStop(1, '#f2b067');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f7d9a0';
  ctx.beginPath();
  ctx.arc(w * 0.68, h * 0.56, 34, 0, TAU);
  ctx.fill();
  // Skyline silhouettes.
  ctx.fillStyle = '#120d12';
  let x = 0;
  let i = 0;
  while (x < w) {
    const bw = 40 + hash(i, 1, 31) * 90;
    const bh = 90 + hash(i, 2, 31) * 230;
    ctx.fillRect(x, h * 0.62 - bh, bw, bh + h);
    // Lit windows.
    for (let wy = h * 0.62 - bh + 14; wy < h * 0.6; wy += 22) {
      for (let wx = x + 8; wx < x + bw - 10; wx += 16) {
        if (hash(Math.floor(wx), Math.floor(wy), 32) > 0.72) {
          ctx.fillStyle = 'rgba(255,196,110,0.85)';
          ctx.fillRect(wx, wy, 6, 9);
        }
      }
    }
    ctx.fillStyle = '#120d12';
    x += bw + 6;
    i++;
  }
  // Street with reflections.
  const road = ctx.createLinearGradient(0, h * 0.62, 0, h);
  road.addColorStop(0, '#2a1a1e');
  road.addColorStop(1, '#0a0709');
  ctx.fillStyle = road;
  ctx.fillRect(0, h * 0.62, w, h);
  ctx.fillStyle = 'rgba(247,190,120,0.35)';
  ctx.fillRect(w * 0.66, h * 0.62, 10, h * 0.38);
  // A figure crossing: the decisive moment.
  ctx.fillStyle = '#050405';
  ctx.beginPath();
  ctx.ellipse(w * 0.32, h * 0.66, 11, 12, 0, 0, TAU);
  ctx.fill();
  ctx.fillRect(w * 0.32 - 12, h * 0.68, 24, 70);
  ctx.save();
  ctx.translate(w * 0.32, h * 0.78);
  ctx.rotate(0.35);
  ctx.fillRect(-5, 0, 10, 60);
  ctx.restore();
  ctx.save();
  ctx.translate(w * 0.32, h * 0.78);
  ctx.rotate(-0.3);
  ctx.fillRect(-5, 0, 10, 60);
  ctx.restore();
  // Thin live-view guides (no text).
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  for (const f of [1 / 3, 2 / 3]) {
    ctx.beginPath(); ctx.moveTo(w * f, 0); ctx.lineTo(w * f, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, h * f); ctx.lineTo(w, h * f); ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(w * 0.03, h * 0.93, w * 0.18, 6);
  ctx.fillStyle = 'rgba(120,220,120,0.95)';
  ctx.fillRect(w * 0.03, h * 0.93, w * 0.12, 6);
  const t = tex(c, { srgb: true });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
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
