import * as THREE from 'three';
import { Batcher } from '../engine/batcher';
import { Builder, V, col, type ShipContext } from './kit';

export interface DoorDef {
  id: string;
  /** Centre of the opening at deck level. */
  x: number;
  z: number;
  /** 'x' = door sits in a wall of constant x (leaves slide along z); 'z' = wall of constant z. */
  wall: 'x' | 'z';
  width: number;
  height: number;
  /** Zones on the negative and positive side of the wall. */
  zones: [string, string];
  kind?: 'interior' | 'hatch';
  /** Labels shown above the door, seen from the negative / positive side. */
  labels?: [string | null, string | null];
  /** Half-depths of the wall on each side (skin thickness), for frame placement. */
  depth?: [number, number];
  /** Auto-open radius in meters. */
  radius?: number;
}

export class Door {
  readonly group = new THREE.Group();
  open = 0;
  target = 0;
  private leaves: THREE.Object3D[] = [];
  private closedOffsets: number[] = [];
  private openOffsets: number[] = [];
  private statusMats: THREE.MeshBasicMaterial[] = [];
  /** Forced state for scripted moments (null = automatic). */
  force: number | null = null;
  onMove?: () => void;

  constructor(readonly def: DoorDef, private ctx: ShipContext) {}

  get center() {
    return V(this.def.x, 1.2, this.def.z);
  }

  build() {
    const { def, ctx } = this;
    const b = new Builder(ctx);
    const kind = def.kind ?? 'interior';
    const [dNeg, dPos] = def.depth ?? [0.12, 0.12];
    // Local frame: origin at opening centre, +x along the wall, +z towards zones[1].
    const rotY = def.wall === 'x' ? -Math.PI / 2 : 0;
    const w = def.width;
    const h = def.height;

    // ---- Static frame, split per side so each half lives in its zone. ----
    for (let side = 0; side < 2; side++) {
      const zone = def.zones[side];
      if (zone === 'exterior' && kind !== 'hatch') continue;
      const s = side === 0 ? -1 : 1;
      const depth = side === 0 ? dNeg : dPos;
      b.inZone(zone, () =>
        b.at(def.x, 0, def.z, rotY, () => {
          const face = s * depth;
          const frameCol = kind === 'hatch' ? 0x3b3f44 : 0x2f3338;
          const jw = kind === 'hatch' ? 0.22 : 0.14;
          const pz = face + s * 0.035;
          // Jambs.
          for (const jx of [-1, 1]) {
            const x = jx * (w / 2 + jw / 2);
            b.box(b.M.painted, jw, h + jw, 0.09, x, (h + jw) / 2, pz, { color: frameCol, bevel: 0.015 });
            // Hazard-striped inner reveal.
            b.span(b.M.hazard, jx * (w / 2) - jx * 0.005, 0, face * 0.02, jx * (w / 2) + jx * 0.001, h, face, { uvScale: 0.6 });
          }
          // Header with status light and label.
          b.box(b.M.painted, w + jw * 2, jw, 0.09, 0, h + jw / 2, pz, { color: frameCol, bevel: 0.015 });
          b.span(b.M.painted, -w / 2, h - 0.001, face * 0.02, w / 2, h + 0.004, face, { color: 0x44484c });
          // Threshold.
          b.span(b.M.tread, -w / 2 - 0.02, 0, 0, w / 2 + 0.02, 0.012, face + s * 0.05, {});
          // Label plate.
          const label = def.labels?.[side];
          if (label) {
            b.at(0, h + jw + 0.16, face + s * 0.012, side === 0 ? Math.PI : 0, () => {
              b.box(b.M.painted, Math.min(1.4, w + 0.2), 0.2, 0.02, 0, 0, -0.012, { color: 0x1d2024 });
              b.sign([label], Math.min(1.36, w + 0.16), 0.16, 0, 0, 0.001, { bg: '#1d2024', fg: '#e8e2d2', wear: 0.3 });
            });
          }
          // Hazard chevrons on the floor for heavy hatches.
          if (kind === 'hatch') {
            b.span(b.M.hazard, -w / 2, 0.001, face + s * 0.08, w / 2, 0.006, face + s * 0.6, { uvScale: 0.7 });
          }
        }),
      );
    }

    // ---- Moving leaves: built in local space with a private batcher. ----
    const leafBatcher = new Batcher();
    const lb = new Builder({ ...ctx, batcher: leafBatcher });
    const thick = kind === 'hatch' ? 0.16 : 0.07;
    const nLeaves = kind === 'hatch' ? 1 : 2;
    const lw = w / nLeaves + 0.04;
    const leafIds: string[] = [];
    for (let i = 0; i < nLeaves; i++) {
      const id = `leaf${i}`;
      leafIds.push(id);
      lb.inZone(id, () => {
        const mirror = nLeaves === 2 && i === 1 ? -1 : 1;
        const body = kind === 'hatch' ? 0x5a5f63 : 0x55606a;
        lb.box(lb.M.painted, lw, h + 0.04, thick, 0, (h + 0.04) / 2, 0, { color: body, bevel: 0.012 });
        // Raised panels on both faces.
        for (const fz of [-1, 1]) {
          const z = fz * (thick / 2 + 0.008);
          lb.box(lb.M.painted, lw - 0.16, h * 0.34, 0.02, 0, h * 0.24, z, { color: 0x4b545d, bevel: 0.006 });
          if (kind === 'hatch') {
            lb.box(lb.M.hazard, lw - 0.1, 0.18, 0.02, 0, 0.18, z, { uvScale: 0.5 });
            lb.cyl(lb.M.painted, 0.2, 0.05, 0, h * 0.55, z + fz * 0.02, { axis: 'z', color: 0xb8341e, seg: 20 });
            lb.cyl(lb.M.brushed, 0.04, 0.09, 0, h * 0.55, z + fz * 0.04, { axis: 'z', seg: 12 });
            for (let k = 0; k < 4; k++) {
              const a = (k / 4) * Math.PI * 2;
              lb.rod(lb.M.painted, V(0, h * 0.55, z + fz * 0.045), V(Math.cos(a) * 0.19, h * 0.55 + Math.sin(a) * 0.19, z + fz * 0.045), 0.012, { color: 0xb8341e });
            }
            lb.box(lb.M.glass, 0.3, 0.22, 0.01, 0, h * 0.8, z + fz * 0.012, {});
            lb.box(lb.M.painted, 0.36, 0.28, 0.015, 0, h * 0.8, z, { color: 0x2a2d30 });
          } else {
            // Vision slot + glass.
            lb.box(lb.M.painted, 0.12, 0.62, 0.02, mirror * (lw / 2 - 0.16), h * 0.62, z, { color: 0x2a2d30 });
            lb.box(lb.M.glass, 0.07, 0.56, 0.012, mirror * (lw / 2 - 0.16), h * 0.62, z + fz * 0.004, {});
            lb.box(lb.M.painted, lw - 0.16, 0.16, 0.02, 0, h * 0.87, z, { color: 0x4b545d, bevel: 0.006 });
            // Leading-edge hazard stripe.
            lb.box(lb.M.hazard, 0.07, h - 0.1, 0.012, -mirror * (lw / 2 - 0.05), h / 2, z, { uvScale: 0.35 });
            // Handle recess.
            lb.box(lb.M.brushed, 0.03, 0.22, 0.03, -mirror * (lw / 2 - 0.14), h * 0.5, z, {});
          }
        }
        // Rubber seal on the leading edge.
        lb.box(lb.M.rubber, 0.03, h, thick + 0.01, -mirror * (lw / 2), h / 2, 0, {});
      });
    }
    const meshes = leafBatcher.build();
    const rotYLocal = new THREE.Object3D();
    rotYLocal.position.set(def.x, 0, def.z);
    rotYLocal.rotation.y = rotY;
    this.group.add(rotYLocal);
    leafIds.forEach((id, i) => {
      const leaf = new THREE.Group();
      for (const m of meshes.filter((mm) => mm.userData.zone === id)) {
        m.castShadow = false;
        m.receiveShadow = true;
        if ((m.material as THREE.Material).userData.fx) m.layers.set(1);
        leaf.add(m);
      }
      const sign = nLeaves === 2 ? (i === 0 ? -1 : 1) : 1;
      const closed = nLeaves === 2 ? sign * (w / 4) : 0;
      const openOff = nLeaves === 2 ? sign * (w / 4 + w / 2 + 0.06) : w + 0.1;
      leaf.position.x = closed;
      rotYLocal.add(leaf);
      this.leaves.push(leaf);
      this.closedOffsets.push(closed);
      this.openOffsets.push(openOff);
    });

    // Status lights (one per side), recoloured as the door opens.
    for (let side = 0; side < 2; side++) {
      if (def.zones[side] === 'exterior' && kind !== 'hatch') continue;
      const s = side === 0 ? -1 : 1;
      const depth = side === 0 ? dNeg : dPos;
      const mat = new THREE.MeshBasicMaterial({ color: col(0xff3020, 4) });
      this.statusMats.push(mat);
      for (const lx of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.03), mat);
        lamp.position.set(lx * (w / 2 - 0.1), h + 0.07, s * (depth + 0.09));
        rotYLocal.add(lamp);
      }
    }
    return this;
  }

  update(eye: THREE.Vector3, dt: number, visible: boolean) {
    const def = this.def;
    this.group.visible = visible;
    const dx = eye.x - def.x;
    const dz = eye.z - def.z;
    const r = def.radius ?? 2.6;
    const near = dx * dx + dz * dz < r * r && eye.y > -0.5 && eye.y < def.height + 1.5;
    this.target = this.force ?? (near ? 1 : 0);
    const speed = (def.kind === 'hatch' ? 0.6 : 1.9) * dt;
    const prev = this.open;
    if (this.open < this.target) this.open = Math.min(this.target, this.open + speed);
    else if (this.open > this.target) this.open = Math.max(this.target, this.open - speed);
    if (this.open !== prev || !Number.isFinite(dt)) {
      const e = this.open < 0.5 ? 4 * this.open ** 3 : 1 - Math.pow(-2 * this.open + 2, 3) / 2;
      this.leaves.forEach((leaf, i) => {
        leaf.position.x = THREE.MathUtils.lerp(this.closedOffsets[i], this.openOffsets[i], e);
      });
      const c = this.open > 0.98 ? col(0x30ff60, 3.5)! : col(0xff3020, 4)!;
      for (const m of this.statusMats) m.color.copy(c);
      this.onMove?.();
    }
  }
}
