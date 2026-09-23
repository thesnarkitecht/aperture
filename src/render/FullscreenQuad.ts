/**
 * A single oversized triangle covering the viewport, rendered with an identity camera.
 * Vertex shaders should output `vec4(position.xy, 0, 1)`; `uv` spans [0,1] over the screen.
 */
import * as THREE from 'three';

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

export class FullscreenQuad {
  readonly mesh: THREE.Mesh;
  constructor(material: THREE.Material) {
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.frustumCulled = false;
  }
  get material(): THREE.Material {
    return this.mesh.material as THREE.Material;
  }
  set material(m: THREE.Material) {
    this.mesh.material = m;
  }
  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.mesh, camera);
  }
  dispose(): void {
    /* shared geometry is kept alive */
  }
}

export const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Convenience: create a ShaderMaterial for a fullscreen pass. */
export function passMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, defines: Record<string, string | number> = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FS_VERT,
    fragmentShader,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
}
