import * as THREE from 'three';
import { rng } from '../engine/shared';

export interface SignStyle {
  /** Plate color, or null for stencil text straight on the surface. */
  bg: string | null;
  fg: string;
  border: string | null;
  /** Hazard stripes along the left edge. */
  hazard: boolean;
  arrow: 'left' | 'right' | 'up' | 'down' | null;
  align: 'center' | 'left';
  /** Scale for the first line (headline). */
  headline: number;
  wear: number;
}

const DEFAULT: SignStyle = {
  bg: '#d9d2c0',
  fg: '#16181a',
  border: null,
  hazard: false,
  arrow: null,
  align: 'center',
  headline: 1,
  wear: 0.5,
};

const FONT = `'Liberation Sans Narrow', 'Arial Narrow', 'Roboto Condensed', 'DejaVu Sans Condensed', 'Liberation Sans', 'Helvetica Neue', Arial, sans-serif`;

export interface SignRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** All ship signage is drawn into one canvas atlas so it batches into a single material. */
export class SignAtlas {
  readonly canvas: HTMLCanvasElement;
  readonly texture: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private x = 0;
  private y = 0;
  private rowH = 0;
  private readonly width = 4096;
  private readonly height = 2048;
  private rand = rng(4242);
  overflow = false;
  private cache = new Map<string, SignRect>();
  private count = 0;
  private area = 0;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.texture.flipY = true;
  }

  /** @param heightM physical height in meters, used to pick texel density. */
  add(lines: string[], aspect: number, partial: Partial<SignStyle> = {}, heightM = 0.2): SignRect {
    const s = { ...DEFAULT, ...partial };
    const key = JSON.stringify([lines, aspect.toFixed(3), heightM.toFixed(3), s]);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const rect = this.place(lines, aspect, s, heightM);
    this.cache.set(key, rect);
    return rect;
  }

  private place(lines: string[], aspect: number, s: SignStyle, heightM: number): SignRect {
    let h = Math.round(Math.min(170, Math.max(lines.length > 1 ? 52 : 30, heightM * 330)));
    let w = Math.max(16, Math.round(h * aspect));
    if (w > 1400) {
      w = 1400;
      h = Math.max(24, Math.round(1400 / aspect));
    }
    if (this.x + w > this.width) {
      this.x = 0;
      this.y += this.rowH + 4;
      this.rowH = 0;
    }
    if (this.y + h > this.height) {
      console.warn('Sign atlas full');
      this.overflow = true;
      this.y = 0;
    }
    this.count++;
    this.area += w * h;
    const x0 = this.x;
    const y0 = this.y;
    this.x += w + 4;
    this.rowH = Math.max(this.rowH, h);
    this.draw(x0, y0, w, h, lines, s);
    // Inset UVs by half a texel to avoid bleeding.
    const W = this.width;
    const H = this.height;
    return {
      u0: (x0 + 0.5) / W,
      u1: (x0 + w - 0.5) / W,
      v0: 1 - (y0 + h - 0.5) / H,
      v1: 1 - (y0 + 0.5) / H,
    };
  }

  private draw(x: number, y: number, w: number, h: number, lines: string[], s: SignStyle) {
    const g = this.ctx;
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    if (s.bg) {
      g.fillStyle = s.bg;
      g.fillRect(x, y, w, h);
    }
    let left = x + h * 0.14;
    if (s.hazard) {
      const hw = h * 0.5;
      g.save();
      g.beginPath();
      g.rect(x, y, hw, h);
      g.clip();
      g.fillStyle = '#e0a21c';
      g.fillRect(x, y, hw, h);
      g.fillStyle = '#141414';
      for (let i = -4; i < 8; i++) {
        g.beginPath();
        const o = i * h * 0.36;
        g.moveTo(x + o, y + h);
        g.lineTo(x + o + h * 0.18, y + h);
        g.lineTo(x + o + h * 0.18 + h, y);
        g.lineTo(x + o + h, y);
        g.closePath();
        g.fill();
      }
      g.restore();
      left = x + hw + h * 0.14;
    }
    if (s.border) {
      g.strokeStyle = s.border;
      g.lineWidth = Math.max(3, h * 0.05);
      g.strokeRect(x + g.lineWidth, y + g.lineWidth, w - g.lineWidth * 2, h - g.lineWidth * 2);
    }
    let right = x + w - h * 0.14;
    if (s.arrow) {
      const a = h * 0.34;
      const cx = s.arrow === 'left' ? left + a : right - a;
      const cy = y + h / 2;
      g.fillStyle = s.fg;
      g.beginPath();
      const dirs = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 };
      const r = dirs[s.arrow];
      const pt = (dx: number, dy: number) => [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)];
      const pts = [pt(a, 0), pt(-a * 0.2, -a * 0.9), pt(-a * 0.2, -a * 0.35), pt(-a, -a * 0.35), pt(-a, a * 0.35), pt(-a * 0.2, a * 0.35), pt(-a * 0.2, a * 0.9)];
      g.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
      g.closePath();
      g.fill();
      if (s.arrow === 'left') left += a * 2.3;
      else right -= a * 2.3;
    }
    g.fillStyle = s.fg;
    g.textBaseline = 'middle';
    const n = lines.length;
    const lineH = h / (n + (n > 1 ? 0.6 : 0.35));
    const avail = right - left;
    lines.forEach((text, i) => {
      const size = lineH * (i === 0 ? 0.82 * s.headline : 0.6);
      g.font = `700 ${size}px ${FONT}`;
      // Condense wide text to fit rather than shrinking it.
      const tw = g.measureText(text).width;
      const sx = Math.min(1, avail / Math.max(1, tw));
      const cy = y + h / 2 + (i - (n - 1) / 2) * lineH;
      g.save();
      const tx = s.align === 'center' ? (left + right) / 2 : left;
      g.translate(tx, cy);
      g.scale(sx * 0.92, 1);
      g.textAlign = s.align === 'center' ? 'center' : 'left';
      g.fillText(text, 0, 0);
      g.restore();
    });
    // Wear: scuffs that remove paint.
    if (s.wear > 0) {
      g.globalCompositeOperation = s.bg ? 'source-atop' : 'destination-out';
      const count = Math.round(w * h * 0.0009 * s.wear);
      for (let i = 0; i < count; i++) {
        const px = x + this.rand.next() * w;
        const py = y + this.rand.next() * h;
        const r = 0.5 + this.rand.next() * this.rand.next() * h * 0.05;
        g.fillStyle = s.bg ? `rgba(60,58,54,${0.25 + this.rand.next() * 0.4})` : `rgba(0,0,0,${0.5 + this.rand.next() * 0.5})`;
        g.beginPath();
        g.arc(px, py, r, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }

  finalize() {
    this.texture.needsUpdate = true;
    const used = Math.round(((this.y + this.rowH) / this.height) * 100);
    console.info(`Sign atlas: ${this.count} unique signs, ${(this.area / 1e6).toFixed(2)} Mpx, ${this.overflow ? 'OVERFLOWED' : `${used}% of rows used`}`);
  }
}
