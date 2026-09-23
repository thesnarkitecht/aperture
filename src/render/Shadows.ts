/**
 * Two-cascade sun shadows rendered into depth textures (sampled manually with PCF in
 * aw_shadows). Cascade 0 is a tight box that follows the hero (crisp self-shadowing);
 * cascade 1 covers the whole starting island. Both are texel-snapped to avoid shimmering.
 *
 * Shadow casters opt in with `object.userData.castShadow = true` and may provide
 * `object.userData.shadowMaterial` (e.g. for wind or alpha-tested foliage); skinned meshes
 * fall back to MeshDepthMaterial which handles skinning.
 */
import * as THREE from 'three';
import { G } from './ShaderLib';

interface Cascade {
  target: THREE.WebGLRenderTarget;
  camera: THREE.OrthographicCamera;
  size: number;
  extent: number;
  depthRange: number;
}

const BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

export class Shadows {
  private cascades: Cascade[] = [];
  private casters: THREE.Mesh[] = [];
  private saved = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  private depthMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  private skinDepthMat = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  /** Fixed centre of the wide cascade. */
  wideCenter = new THREE.Vector3(0, 1650, 0);

  constructor(nearSize: number, farSize: number) {
    this.cascades.push(this.make(nearSize, 22, 120));
    this.cascades.push(this.make(farSize, 340, 900));
    G.uShadowMap0.value = this.cascades[0].target.depthTexture;
    G.uShadowMap1.value = this.cascades[1].target.depthTexture;
  }

  private make(size: number, extent: number, depthRange: number): Cascade {
    const depth = new THREE.DepthTexture(size, size, THREE.FloatType);
    depth.minFilter = depth.magFilter = THREE.NearestFilter;
    const target = new THREE.WebGLRenderTarget(size, size, {
      depthBuffer: true,
      depthTexture: depth,
      type: THREE.UnsignedByteType,
    });
    const camera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0, depthRange * 2);
    return { target, camera, size, extent, depthRange };
  }

  resize(nearSize: number, farSize: number): void {
    for (const c of this.cascades) {
      c.target.dispose();
      c.target.depthTexture?.dispose();
    }
    this.cascades = [this.make(nearSize, 22, 120), this.make(farSize, 340, 900)];
    G.uShadowMap0.value = this.cascades[0].target.depthTexture;
    G.uShadowMap1.value = this.cascades[1].target.depthTexture;
  }

  collect(scene: THREE.Object3D): void {
    this.casters = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData.castShadow) this.casters.push(o as THREE.Mesh);
    });
  }

  private place(c: Cascade, center: THREE.Vector3): void {
    const sun = G.uSunDir.value as THREE.Vector3;
    const cam = c.camera;
    // Build a light-space basis and snap the centre to whole texels.
    const fwd = sun.clone().negate();
    const up = Math.abs(fwd.y) > 0.99 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, fwd).normalize();
    const upv = new THREE.Vector3().crossVectors(fwd, right).normalize();
    const texel = (2 * c.extent) / c.size;
    const x = Math.round(center.dot(right) / texel) * texel;
    const y = Math.round(center.dot(upv) / texel) * texel;
    const z = center.dot(fwd);
    const snapped = right.multiplyScalar(x).add(upv.multiplyScalar(y)).add(fwd.clone().multiplyScalar(z));
    cam.position.copy(snapped).addScaledVector(sun, c.depthRange);
    cam.up.copy(new THREE.Vector3().crossVectors(fwd, new THREE.Vector3().crossVectors(up, fwd).normalize()).normalize());
    cam.lookAt(snapped);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, focus: THREE.Vector3): void {
    if (!this.casters.length) return;
    for (const m of this.casters) {
      this.saved.set(m, m.material);
      const sm = m.userData.shadowMaterial as THREE.Material | undefined;
      m.material = sm ?? ((m as THREE.SkinnedMesh).isSkinnedMesh ? this.skinDepthMat : this.depthMat);
    }
    const prevAuto = scene.matrixWorldAutoUpdate;
    const prevBg = scene.background;
    scene.background = null;
    const visible: THREE.Object3D[] = [];
    scene.traverse((o) => {
      if (((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) && o.visible && !o.userData.castShadow) {
        o.visible = false;
        visible.push(o);
      }
    });
    const prevRT = renderer.getRenderTarget();
    this.cascades.forEach((c, i) => {
      this.place(c, i === 0 ? focus : this.wideCenter);
      renderer.setRenderTarget(c.target);
      renderer.clear(true, true, true);
      renderer.render(scene, c.camera);
      const m = i === 0 ? G.uShadowMatrix0.value : G.uShadowMatrix1.value;
      m.multiplyMatrices(BIAS, c.camera.projectionMatrix).multiply(c.camera.matrixWorldInverse);
    });
    renderer.setRenderTarget(prevRT);
    for (const o of visible) o.visible = true;
    for (const m of this.casters) m.material = this.saved.get(m)!;
    this.saved.clear();
    scene.matrixWorldAutoUpdate = prevAuto;
    scene.background = prevBg;
    const t = G.uShadowTexel.value as THREE.Vector4;
    const c0 = this.cascades[0];
    const c1 = this.cascades[1];
    t.set(1 / c0.size, 1 / c1.size, (2 * c0.extent) / c0.size, (2 * c1.extent) / c1.size);
  }
}
