/**
 * Small bird flocks: instanced flapping V shapes circling lazily near the glide corridor.
 * Entirely animated in the vertex shader from a flock centre, per-bird offset and time.
 */
import * as THREE from 'three';
import { mulberry32 } from '../../core/noise';
import { withGlobals } from '../../render/ShaderLib';
import { corridorToWorld } from './TerrainGen';
import { FS_PRE, VS_PRE } from './geo';

const VS = /* glsl */ `
${VS_PRE}
attribute float aWing; // -1 left tip, 0 body, 1 right tip
attribute vec4 iFlock; // centre xyz, orbit radius
attribute vec4 iBird;  // phase, offset radius, height offset, speed
uniform float uDwTime;
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  float t = uDwTime * iBird.w;
  float ang = iBird.x + t / max(iFlock.w, 1.0) * 14.0;
  float wob = sin(t * 0.7 + iBird.x * 3.0);
  vec3 c = iFlock.xyz + vec3(cos(ang) * iFlock.w, iBird.z + wob * 6.0, sin(ang) * iFlock.w);
  c += vec3(cos(iBird.x * 7.0), 0.0, sin(iBird.x * 5.0)) * iBird.y;
  vec3 fwd = normalize(vec3(-sin(ang), 0.0, cos(ang)));
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  float flap = sin(uDwTime * 7.0 + iBird.x * 11.0);
  float span = 2.2;
  vec3 p = c + fwd * position.z * 1.2 + right * position.x * span;
  p.y += abs(aWing) * flap * 0.9;
  vWorld = p;
  vNormal = normalize(vec3(0.0, 1.0, 0.0) - right * aWing * flap * 0.5);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  #include <logdepthbuf_vertex>
}
`;

const FS = /* glsl */ `
${FS_PRE}
varying vec3 vWorld;
varying vec3 vNormal;
void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  AwSurface s = aw_defaultSurface();
  s.albedo = vec3(0.06, 0.055, 0.05);
  s.normal = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
  s.wrap = 0.5;
  s.rim = 1.0;
  s.translucency = 0.2;
  s.specular = 0.1;
  vec3 col = aw_shade(s, vWorld, V, aw_cloudShadow(vWorld));
  gl_FragColor = vec4(col, 1.0);
  #include <logdepthbuf_fragment>
}
`;

export function buildBirds(): { mesh: THREE.Mesh; time: THREE.IUniform } {
  // V shape: two triangles hinged at the body.
  const pos = new Float32Array([
    0, 0, 0.5, -1, 0, -0.4, 0, 0, -0.2,
    0, 0, 0.5, 0, 0, -0.2, 1, 0, -0.4,
  ]);
  const wing = new Float32Array([0, -1, 0, 0, 0, 1]);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.BufferAttribute(wing, 1));
  const flocks: [number, number, number, number, number][] = [
    // along, side, y, orbit radius, count
    [2200, -500, 420, 160, 14],
    [4600, 700, 360, 220, 18],
    [7600, -300, 300, 180, 12],
    [10200, 400, 240, 260, 16],
  ];
  const rnd = mulberry32(777);
  const f: number[] = [];
  const b: number[] = [];
  for (const [al, sd, y, r, cnt] of flocks) {
    const [x, z] = corridorToWorld(al, sd);
    for (let i = 0; i < cnt; i++) {
      f.push(x, y, z, r);
      b.push(rnd() * 0.6, 8 + rnd() * 35, (rnd() - 0.5) * 30, 0.8 + rnd() * 0.3);
    }
  }
  g.setAttribute('iFlock', new THREE.InstancedBufferAttribute(new Float32Array(f), 4));
  g.setAttribute('iBird', new THREE.InstancedBufferAttribute(new Float32Array(b), 4));
  g.instanceCount = f.length / 4;
  const time = { value: 0 };
  const mesh = new THREE.Mesh(
    g,
    new THREE.ShaderMaterial({
      uniforms: withGlobals({ uDwTime: time }),
      vertexShader: VS,
      fragmentShader: FS,
      side: THREE.DoubleSide,
    }),
  );
  mesh.name = 'Birds';
  mesh.frustumCulled = false; // positions are computed on the GPU
  mesh.matrixAutoUpdate = false;
  return { mesh, time };
}
