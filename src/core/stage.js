// Renderer, studio environment, lights, backdrop and post-processing.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { glowSprite } from './textures.js';

// A small virtual photo studio: softboxes and strip lights rendered into a
// PMREM so every metal surface picks up believable product-shot reflections.
function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.SphereGeometry(30, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {},
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; void main(){
        float h = vP.y * 0.5 + 0.5;
        vec3 c = mix(vec3(0.012,0.012,0.014), vec3(0.05,0.05,0.056), smoothstep(0.2, 0.9, h));
        gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  env.add(room);
  const panel = (w, h, intensity, pos, look, tint = [1, 1, 1]) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(...tint).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(...look);
    env.add(m);
  };
  panel(10, 6, 1.3, [0, 12, 2], [0, 0, 0]);                         // overhead softbox
  panel(2.2, 12, 3.2, [-11, 3, 4], [0, 0, 0], [1, 0.97, 0.92]);      // key strip, warm
  panel(2.2, 12, 1.8, [11, 2, -3], [0, 0, 0], [0.9, 0.95, 1.05]);    // fill strip, cool
  panel(14, 1.6, 2.0, [0, 5, -12], [0, 0, 0]);                        // rim bar behind
  panel(8, 1.0, 0.5, [0, -3, 12], [0, 0, 0], [1, 0.9, 0.8]);           // low front kicker
  panel(3, 3, 2.6, [7, 9, 8], [0, 0, 0]);                              // small hot spot
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  return rt.texture;
}

const VignetteGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.9 },
    uGrain: { value: 0.045 },
    uAberration: { value: 0.0005 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uAberration;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uAberration * 40.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float v = smoothstep(0.95, 0.2, r2 * 2.2 * uVignette);
      col *= mix(0.55, 1.0, v);
      float g = hash(vUv * 1024.0 + fract(uTime * 7.0)) - 0.5;
      col += g * uGrain * (1.0 - dot(col, vec3(0.333)) * 0.6);
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

export function createStage(canvas) {
  const isMobile = matchMedia('(max-width: 820px)').matches || /Mobi|Android/i.test(navigator.userAgent);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
  const dpr = Math.min(window.devicePixelRatio, isMobile ? 1.5 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070708);
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 1.0;

  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.05, 60);

  // Backdrop: a screen-space radial gradient drawn behind everything.
  const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { uAspect: { value: 1 }, uGlow: { value: new THREE.Vector2(0.62, 0.55) }, uWarm: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
      fragmentShader: /* glsl */`
        uniform float uAspect; uniform vec2 uGlow; uniform float uWarm; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 p = vUv - uGlow; p.x *= uAspect;
          float d = length(p);
          vec3 base = vec3(0.018, 0.018, 0.021);
          vec3 glow = mix(vec3(0.05, 0.05, 0.056), vec3(0.07, 0.055, 0.045), uWarm);
          vec3 c = mix(glow, base, smoothstep(0.0, 0.95, d));
          c += (hash(vUv * 800.0) - 0.5) * 0.006;
          gl_FragColor = vec4(c, 1.0);
        }
      `,
      depthWrite: false, depthTest: false,
    }),
  );
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -100;
  scene.add(backdrop);

  // Direct lights: a shadow-casting key and a cool rim.
  const key = new THREE.DirectionalLight(0xfff4e8, 0.6);
  key.position.set(-2.5, 5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
  key.shadow.camera.left = -3;
  key.shadow.camera.right = 3;
  key.shadow.camera.top = 3;
  key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 14;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 5;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 0.7);
  rim.position.set(3, 2.5, -4);
  scene.add(rim);
  const fill = new THREE.HemisphereLight(0xffffff, 0x202022, 0.1);
  scene.add(fill);

  // Shadow catcher floor.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.28 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Dust motes drifting through the light.
  const count = isMobile ? 160 : 360;
  const dustPos = new Float32Array(count * 3);
  const dustSeed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * 8;
    dustPos[i * 3 + 1] = (Math.random() - 0.3) * 5;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * 8;
    dustSeed[i] = Math.random();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  dustGeo.setAttribute('seed', new THREE.BufferAttribute(dustSeed, 1));
  const dustMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uMap: { value: glowSprite() }, uPx: { value: dpr } },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime; uniform float uPx; varying float vA;
      void main(){
        vec3 p = position;
        p.y += mod(uTime * 0.03 * (0.5 + seed), 5.0) - 2.5;
        p.x += sin(uTime * 0.2 + seed * 40.0) * 0.15;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (4.0 + seed * 10.0) * uPx / -mv.z;
        vA = 0.25 + 0.75 * seed;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; varying float vA;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA * 0.35; gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // Post: HDR MSAA target → bloom → tone map → vignette/grain/aberration.
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: isMobile ? 2 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.12, 0.35, 2.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(VignetteGrainShader);
  composer.addPass(finish);

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    backdrop.material.uniforms.uAspect.value = w / h;
  };
  resize();
  window.addEventListener('resize', resize);

  return {
    renderer, scene, camera, composer, bloom, finish, key, floor, dust, dustMat, backdrop, isMobile,
    render(time) {
      finish.uniforms.uTime.value = time;
      dustMat.uniforms.uTime.value = time;
      composer.render();
    },
  };
}
