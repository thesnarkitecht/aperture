import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { FX_LAYER, shared, whiteTexture } from './shared';

export type QualityName = 'low' | 'medium' | 'high' | 'cinematic';

export interface Quality {
  name: QualityName;
  /** Upper bound on the device pixel ratio used for rendering. */
  maxPixelRatio: number;
  /** SSAO resolution scale (0 = off). */
  ao: number;
  aoSamples: number;
  bloom: boolean;
  lights: number;
  shadowSize: number;
  aa: 'smaa' | 'fxaa' | 'none';
  /** Allow dynamic resolution scaling when frame time exceeds budget. */
  dynamicResolution: boolean;
}

export const QUALITY: Record<QualityName, Quality> = {
  low: { name: 'low', maxPixelRatio: 1, ao: 0, aoSamples: 8, bloom: true, lights: 6, shadowSize: 1024, aa: 'fxaa', dynamicResolution: true },
  medium: { name: 'medium', maxPixelRatio: 1.25, ao: 0.5, aoSamples: 12, bloom: true, lights: 8, shadowSize: 2048, aa: 'fxaa', dynamicResolution: true },
  high: { name: 'high', maxPixelRatio: 2, ao: 0.5, aoSamples: 16, bloom: true, lights: 12, shadowSize: 4096, aa: 'smaa', dynamicResolution: true },
  cinematic: { name: 'cinematic', maxPixelRatio: 1, ao: 0.5, aoSamples: 16, bloom: true, lights: 12, shadowSize: 4096, aa: 'smaa', dynamicResolution: false },
};

const FinalShader = {
  name: 'FinalGradeShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tOverlay: { value: null as THREE.Texture | null },
    uOverlay: { value: 0 },
    uExposure: { value: 1 },
    uFade: { value: 1 },
    uTime: shared.uTime,
    uResolution: { value: new THREE.Vector2(1, 1) },
    uVignette: { value: 0.55 },
    uGrain: { value: 0.035 },
    uAberration: { value: 0.0035 },
    uSaturation: { value: 1.06 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform sampler2D tOverlay;
    uniform float uOverlay;
    uniform float uExposure;
    uniform float uFade;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    uniform float uSaturation;
    varying vec2 vUv;

    // ACES fitted (Stephen Hill) - filmic highlight roll-off.
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 acesFitted(vec3 color) {
      const mat3 ACESInputMat = mat3(
        0.59719, 0.07600, 0.02840,
        0.35458, 0.90834, 0.13383,
        0.04823, 0.01566, 0.83777);
      const mat3 ACESOutputMat = mat3(
         1.60475, -0.10208, -0.00327,
        -0.53108,  1.10813, -0.07276,
        -0.07367, -0.00605,  1.07602);
      color = ACESInputMat * color;
      color = RRTAndODTFit(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 off = d * r2 * uAberration * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv - off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv + off).b;

      col *= uExposure;
      col = acesFitted(col);

      // Split toning: cool shadows, warm highlights.
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col * vec3(0.93, 1.0, 1.07), col, smoothstep(0.0, 0.45, l));
      col = mix(col, col * vec3(1.05, 1.0, 0.95), smoothstep(0.35, 1.0, l) * 0.6);
      col = mix(vec3(l), col, uSaturation);

      // Vignette.
      float v = smoothstep(0.95, 0.25, length(d * vec2(1.0, 0.82)));
      col *= mix(1.0, v, uVignette);

      col = toSRGB(clamp(col, 0.0, 1.0));

      // Film grain (luma-weighted so blacks stay clean).
      float g = hash(vUv * uResolution + fract(uTime * 13.37) * 311.0) - 0.5;
      col += g * uGrain * (0.35 + 0.65 * (1.0 - l));

      if (uOverlay > 0.0) {
        vec4 o = texture2D(tOverlay, vUv);
        col = mix(col, o.rgb, o.a * uOverlay);
      }

      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/**
 * Render pipeline:
 *   GTAO pre-pass (normals + depth, half res) -> shared SSAO texture sampled by PBR materials
 *   HDR beauty pass -> bloom -> tone map + grade -> SMAA/FXAA
 * AO is applied inside the material shaders to indirect light only, so emissive
 * screens and direct highlights are never muddied by it.
 */
export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  readonly composer: EffectComposer;
  quality: Quality;
  private renderPass: RenderPass;
  private bloom: UnrealBloomPass;
  private finalPass: ShaderPass;
  private aaPass: ShaderPass | SMAAPass | null = null;
  private gtao: GTAOPass | null = null;
  private width = 1;
  private height = 1;
  pixelRatio = 1;
  dynamicScale = 1;

  constructor(
    container: HTMLElement,
    readonly scene: THREE.Scene,
    readonly camera: THREE.PerspectiveCamera,
    quality: Quality,
    opts: { preserveDrawingBuffer?: boolean } = {},
  ) {
    this.quality = quality;
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
      stencil: false,
    });
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.info.autoReset = false;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.32, 0.45, 1.4);
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass(FinalShader);
    this.composer.addPass(this.finalPass);

    camera.layers.enable(FX_LAYER);
    this.applyQuality(quality);
  }

  get finalUniforms() {
    return this.finalPass.uniforms as unknown as typeof FinalShader.uniforms;
  }

  applyQuality(q: Quality) {
    this.quality = q;
    this.bloom.enabled = q.bloom;
    if (this.aaPass) {
      this.composer.removePass(this.aaPass);
      this.aaPass.dispose();
      this.aaPass = null;
    }
    if (q.aa === 'smaa') this.aaPass = new SMAAPass();
    else if (q.aa === 'fxaa') this.aaPass = new FXAAPass();
    if (this.aaPass) this.composer.addPass(this.aaPass);

    if (this.gtao) {
      this.gtao.dispose();
      this.gtao = null;
    }
    if (q.ao > 0) {
      this.gtao = new GTAOPass(this.scene, this.camera, 2, 2);
      this.gtao.output = GTAOPass.OUTPUT.Off;
      this.gtao.updateGtaoMaterial({
        radius: 0.55,
        distanceExponent: 1.4,
        thickness: 1.2,
        scale: 1.15,
        samples: q.aoSamples,
        distanceFallOff: 1.0,
        screenSpaceRadius: false,
      });
      this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, radiusExponent: 1, rings: 2, samples: 12 });
    }
    shared.tSSAO.value = whiteTexture;
    this.setSize(this.width, this.height);
  }

  setSize(width: number, height: number) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.pixelRatio = Math.min(dpr, this.quality.maxPixelRatio) * this.dynamicScale;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer.setPixelRatio(this.pixelRatio);
    this.composer.setSize(this.width, this.height);
    const pw = Math.round(this.width * this.pixelRatio);
    const ph = Math.round(this.height * this.pixelRatio);
    shared.uResolution.value.set(pw, ph);
    this.finalUniforms.uResolution.value.set(pw, ph);
    // Bloom at half resolution is visually identical and 4x cheaper.
    this.bloom.setSize(Math.max(1, pw >> 1), Math.max(1, ph >> 1));
    if (this.gtao) {
      const s = this.quality.ao;
      this.gtao.setSize(Math.max(1, Math.round(pw * s)), Math.max(1, Math.round(ph * s)));
    }
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
  }

  /** Re-render the (static) sun shadow map on the next frame. */
  invalidateShadows() {
    this.renderer.shadowMap.needsUpdate = true;
  }

  render() {
    const renderer = this.renderer;
    renderer.info.reset();
    if (this.gtao) {
      const bg = this.scene.background;
      this.scene.background = null;
      this.camera.layers.disable(FX_LAYER);
      this.gtao.render(renderer, null as never, null as never, 0, false);
      this.camera.layers.enable(FX_LAYER);
      this.scene.background = bg;
      shared.tSSAO.value = this.gtao.gtaoMap;
      shared.uSSAOStrength.value = 1;
    } else {
      shared.tSSAO.value = whiteTexture;
    }
    this.composer.render();
  }
}
