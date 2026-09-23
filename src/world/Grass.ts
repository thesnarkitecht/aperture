/**
 * GPU grass: a fixed pool of instanced blades laid on a world-snapped grid around the camera.
 * Placement, height and density come from the island's baked texture; bending comes from
 * a travelling gust field plus per-blade flutter, and blades part around the hero.
 * No per-frame CPU work besides uniforms.
 */
import * as THREE from 'three';
import { withGlobals } from '../render/ShaderLib';
import { Island } from './Island';
import { ISLAND_Y } from './WorldConfig';

function bladeGeometry(segments: number): THREE.InstancedBufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    if (i < segments) {
      pos.push(-0.5, t, 0, 0.5, t, 0);
    } else pos.push(0, 1, 0);
  }
  for (let i = 0; i < segments - 1; i++) {
    const a = i * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const last = (segments - 1) * 2;
  idx.push(last, last + 1, last + 2);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

const VERT = /* glsl */ `
uniform sampler2D uHeight;
uniform float uTexScale;
uniform float uGrid;
uniform float uSpacing;
uniform float uInner;
uniform float uOuter;
uniform float uWidth;
uniform float uIslandY;
uniform vec3 uPlayerPos;
uniform vec4 uWind;
uniform float uTime;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vT;
varying float vVar;
varying float vPath;
#include <aw_common>
void main() {
  float id = float(gl_InstanceID);
  vec2 cell = vec2(mod(id, uGrid), floor(id / uGrid)) - uGrid * 0.5;
  vec2 camCell = floor(cameraPosition.xz / uSpacing);
  vec2 wc = camCell + cell;
  vec2 h2 = aw_hash22(wc);
  vec2 xz = (wc + h2) * uSpacing;
  vec4 hd = texture(uHeight, xz * uTexScale + 0.5);
  float dist = length(xz - cameraPosition.xz);
  float keep = step(aw_hash12(wc * 1.37), hd.g) * step(uInner, dist);
  float fade = 1.0 - smoothstep(uOuter * 0.72, uOuter, dist);
  float rnd = aw_hash12(wc + 17.3);
  float h = mix(0.28, 0.72, rnd * rnd) * (0.55 + 0.45 * hd.g) * fade * keep;
  h *= mix(0.4, 1.0, smoothstep(0.6, 2.6, hd.b));
  vec3 base = vec3(xz.x, uIslandY + hd.r - 0.03, xz.y);
  float t = position.y;
  vT = t;
  vVar = rnd;
  vPath = hd.b;
  float ang = aw_hash12(wc + 3.1) * AW_TAU;
  vec2 facing = vec2(cos(ang), sin(ang));
  // Wind: travelling gusts + flutter.
  vec2 wdir = uWind.xy;
  float gust = aw_vnoise(xz * 0.06 - wdir * uTime * 2.2) ;
  gust = gust * gust * 1.6 + 0.2;
  float flutter = sin(uTime * 3.1 + rnd * 12.0 + dot(xz, vec2(0.7, 0.4))) * 0.12;
  vec2 bendDir = wdir * (gust * uWind.z) + facing * 0.15 + vec2(flutter);
  // Part around the hero.
  vec2 away = xz - uPlayerPos.xz;
  float pd = length(away);
  float push = (1.0 - smoothstep(0.2, 0.9, pd)) * step(abs(uPlayerPos.y - base.y), 1.5);
  bendDir += normalize(away + 1e-4) * push * 2.2;
  float bend = t * t;
  vec3 p = base;
  float w = uWidth * (1.0 - t * 0.85) * (0.7 + rnd * 0.6);
  vec2 side = vec2(-facing.y, facing.x);
  p.xz += side * position.x * w;
  p.y += t * h * (1.0 - 0.35 * min(length(bendDir), 1.5) * bend);
  p.xz += bendDir * bend * h * 0.55;
  vWorld = p;
  vNormal = normalize(vec3(facing.x * 0.6 + bendDir.x * 0.3, 1.0, facing.y * 0.6 + bendDir.y * 0.3));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uNoise2D;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vT;
varying float vVar;
varying float vPath;
#include <aw_common>
#include <aw_atmosphere>
#include <aw_shadows>
#include <aw_lighting>
void main() {
  float patchN = texture(uNoise2D, vWorld.xz * 0.012).r;
  vec3 baseC = vec3(0.10, 0.22, 0.07);
  vec3 tipA = vec3(0.30, 0.52, 0.12);
  vec3 tipB = vec3(0.62, 0.64, 0.20);
  vec3 tip = mix(tipA, tipB, smoothstep(0.35, 0.75, patchN) * 0.8 + vVar * 0.2);
  AwSurface s = aw_defaultSurface();
  s.albedo = mix(baseC, tip, smoothstep(0.0, 1.0, vT));
  s.normal = normalize(vNormal);
  s.roughness = 0.6;
  s.wrap = 0.6;
  s.sssColor = vec3(0.9, 1.0, 0.45);
  s.translucency = 0.55;
  s.ao = mix(0.6, 1.0, vT);
  s.specular = 0.35;
  s.rim = 0.15;
  vec3 V = normalize(cameraPosition - vWorld);
  float sh = aw_sunShadow(vWorld, vec3(0.0, 1.0, 0.0), 0.5, gl_FragCoord.xy, 4);
  vec3 col = aw_shade(s, vWorld, V, mix(sh, 1.0, 0.0));
  gl_FragColor = vec4(col, 1.0);
}`;

export class Grass {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];

  constructor(island: Island, nearGrid: number, nearSpacing: number, farGrid: number, farSpacing: number) {
    this.build(island, nearGrid, nearSpacing, farGrid, farSpacing);
  }

  private layer(island: Island, grid: number, spacing: number, inner: number, width: number, segs: number): THREE.Mesh {
    const geo = bladeGeometry(segs);
    geo.instanceCount = grid * grid;
    const outer = grid * spacing * 0.5;
    const mat = new THREE.ShaderMaterial({
      uniforms: withGlobals({
        uHeight: { value: island.heightTexture },
        uTexScale: { value: Island.texScale },
        uGrid: { value: grid },
        uSpacing: { value: spacing },
        uInner: { value: inner },
        uOuter: { value: outer },
        uWidth: { value: width },
        uIslandY: { value: ISLAND_Y },
      }),
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  }

  build(island: Island, nearGrid: number, nearSpacing: number, farGrid: number, farSpacing: number): void {
    for (const m of this.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    const nearOuter = nearGrid * nearSpacing * 0.5;
    this.meshes = [
      this.layer(island, nearGrid, nearSpacing, 0, 0.045, 4),
      this.layer(island, farGrid, farSpacing, nearOuter * 0.85, 0.11, 2),
    ];
    for (const m of this.meshes) this.group.add(m);
  }

  /** Hide grass when the camera is far from the island (saves the whole vertex cost). */
  update(camera: THREE.Camera): void {
    const far = camera.position.y < ISLAND_Y - 120 || Math.hypot(camera.position.x, camera.position.z) > 420;
    this.group.visible = !far;
  }
}
