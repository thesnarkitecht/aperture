/**
 * 2D collision for a walking player: walls and furniture are line segments on
 * the deck plane; the player is a circle. A uniform grid keeps queries local.
 * Raised floor regions (steps, platforms) provide walkable heights.
 */
export interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

export interface FloorRegion {
  /** Convex polygon (x, z) or circle. */
  poly?: [number, number][];
  circle?: { x: number; z: number; r: number };
  y: number;
}

const CELL = 2;

export class CollisionWorld {
  readonly segments: Segment[] = [];
  readonly floors: FloorRegion[] = [];
  private grid = new Map<number, number[]>();
  private finalized = false;

  addSegment(ax: number, az: number, bx: number, bz: number) {
    this.segments.push({ ax, az, bx, bz });
    this.finalized = false;
  }

  addBox(cx: number, cz: number, hw: number, hd: number, rot = 0) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const pts: [number, number][] = [
      [-hw, -hd],
      [hw, -hd],
      [hw, hd],
      [-hw, hd],
    ].map(([x, z]) => [cx + x * c + z * s, cz - x * s + z * c]);
    for (let i = 0; i < 4; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % 4];
      this.addSegment(a[0], a[1], b[0], b[1]);
    }
  }

  addCircle(cx: number, cz: number, r: number, n = 10) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      this.addSegment(cx + Math.cos(a0) * r, cz + Math.sin(a0) * r, cx + Math.cos(a1) * r, cz + Math.sin(a1) * r);
    }
  }

  addFloor(region: FloorRegion) {
    this.floors.push(region);
  }

  private key(ix: number, iz: number) {
    return (ix + 512) * 4096 + (iz + 512);
  }

  finalize() {
    this.grid.clear();
    this.segments.forEach((s, i) => {
      const x0 = Math.floor(Math.min(s.ax, s.bx) / CELL) - 1;
      const x1 = Math.floor(Math.max(s.ax, s.bx) / CELL) + 1;
      const z0 = Math.floor(Math.min(s.az, s.bz) / CELL) - 1;
      const z1 = Math.floor(Math.max(s.az, s.bz) / CELL) + 1;
      for (let ix = x0; ix <= x1; ix++)
        for (let iz = z0; iz <= z1; iz++) {
          const k = this.key(ix, iz);
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(i);
        }
    });
    this.finalized = true;
  }

  /** Height of the walkable floor at (x, z): the highest region containing the point, else 0. */
  floorAt(x: number, z: number) {
    let y = 0;
    for (const f of this.floors) {
      if (f.y <= y) continue;
      if (f.circle) {
        const dx = x - f.circle.x;
        const dz = z - f.circle.z;
        if (dx * dx + dz * dz <= f.circle.r * f.circle.r) y = f.y;
      } else if (f.poly && pointInPoly(x, z, f.poly)) {
        y = f.y;
      }
    }
    return y;
  }

  /** Push a circle out of all nearby segments. Mutates and returns p. */
  resolve(p: { x: number; z: number }, radius: number) {
    if (!this.finalized) this.finalize();
    for (let iter = 0; iter < 4; iter++) {
      let moved = false;
      const list = this.grid.get(this.key(Math.floor(p.x / CELL), Math.floor(p.z / CELL)));
      if (!list) return p;
      for (const i of list) {
        const s = this.segments[i];
        const dx = s.bx - s.ax;
        const dz = s.bz - s.az;
        const len2 = dx * dx + dz * dz || 1e-9;
        let t = ((p.x - s.ax) * dx + (p.z - s.az) * dz) / len2;
        t = Math.max(0, Math.min(1, t));
        const qx = s.ax + dx * t;
        const qz = s.az + dz * t;
        let ox = p.x - qx;
        let oz = p.z - qz;
        const d2 = ox * ox + oz * oz;
        if (d2 >= radius * radius) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) {
          // Exactly on the segment: push along its normal.
          const l = Math.sqrt(len2);
          ox = -dz / l;
          oz = dx / l;
          d = 1;
          p.x = qx + ox * radius;
          p.z = qz + oz * radius;
        } else {
          p.x = qx + (ox / d) * radius;
          p.z = qz + (oz / d) * radius;
        }
        moved = true;
      }
      if (!moved) break;
    }
    return p;
  }
}

export function pointInPoly(x: number, z: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
