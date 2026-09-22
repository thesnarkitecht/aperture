import * as THREE from 'three';
import { bakeTextureSet, type TextureKind, type TextureSet } from './texgen';
import { FX_LAYER, shared } from '../engine/shared';

/**
 * Patch a MeshStandardMaterial so it:
 *  - samples the shared screen-space AO and applies it mostly to indirect light
 *  - keeps worn/chipped (metallic) texels untinted by vertex color, so bare metal
 *    shows through paint instead of looking like darker paint.
 */
function patchStandard(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.tSSAO = shared.tSSAO;
    shader.uniforms.uSSAOStrength = shared.uSSAOStrength;
    shader.uniforms.uResolution = shared.uResolution;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform sampler2D tSSAO;
        uniform float uSSAOStrength;
        uniform vec2 uResolution;`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        #if defined( USE_METALNESSMAP ) && defined( USE_MAP ) && defined( USE_COLOR )
          float chipMask = texture2D( metalnessMap, vMetalnessMapUv ).b;
          diffuseColor.rgb = mix( diffuseColor.rgb, sampledDiffuseColor.rgb * diffuse, chipMask * 0.85 );
        #endif`,
      )
      .replace(
        '#include <aomap_fragment>',
        /* glsl */ `#include <aomap_fragment>
        {
          float ssao = texture2D( tSSAO, gl_FragCoord.xy / uResolution ).r;
          ssao = mix( 1.0, ssao, uSSAOStrength );
          reflectedLight.indirectDiffuse *= ssao;
          reflectedLight.indirectSpecular *= mix( 1.0, ssao, 0.85 );
          reflectedLight.directDiffuse *= mix( 1.0, ssao, 0.45 );
          reflectedLight.directSpecular *= mix( 1.0, ssao, 0.3 );
        }`,
      );
  };
  material.customProgramCacheKey = () => 'perihelion-pbr-1';
  return material;
}

function texturedPBR(name: string, set: TextureSet, uvScale: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({
    name,
    map: set.map,
    normalMap: set.normalMap,
    roughnessMap: set.orm,
    metalnessMap: set.orm,
    aoMap: set.orm,
    aoMapIntensity: 1,
    roughness: 1,
    metalness: 1,
    vertexColors: true,
    ...extra,
  });
  m.userData.uvScale = uvScale;
  return patchStandard(m);
}

export interface Materials {
  panel: THREE.MeshStandardMaterial;
  hull: THREE.MeshStandardMaterial;
  painted: THREE.MeshStandardMaterial;
  grate: THREE.MeshStandardMaterial;
  tread: THREE.MeshStandardMaterial;
  deck: THREE.MeshStandardMaterial;
  hazard: THREE.MeshStandardMaterial;
  fabric: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  corrugated: THREE.MeshStandardMaterial;
  brushed: THREE.MeshStandardMaterial;
  chrome: THREE.MeshStandardMaterial;
  plastic: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  glow: THREE.MeshBasicMaterial;
  textures: Record<TextureKind, TextureSet>;
}

export function createMaterials(renderer: THREE.WebGLRenderer, onProgress?: (label: string) => void): Materials {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const kinds: TextureKind[] = ['panel', 'hull', 'painted', 'grate', 'tread', 'deck', 'hazard', 'fabric', 'rubber', 'corrugated', 'brushed'];
  const textures = {} as Record<TextureKind, TextureSet>;
  kinds.forEach((k, i) => {
    onProgress?.(k);
    textures[k] = bakeTextureSet(renderer, k, i * 0.37, aniso);
  });

  const glass = patchStandard(
    new THREE.MeshStandardMaterial({
      name: 'glass',
      color: 0x0b1318,
      roughness: 0.03,
      metalness: 0,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      envMapIntensity: 2.2,
      side: THREE.DoubleSide,
    }),
  );
  const baseCompile = glass.onBeforeCompile;
  glass.onBeforeCompile = (shader, r) => {
    baseCompile.call(glass, shader, r);
    // Fresnel: glass reflects strongly at grazing angles even though it is mostly transparent.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      /* glsl */ `
      {
        float fres = pow( 1.0 - clamp( abs( dot( normalize( vViewPosition ), normal ) ), 0.0, 1.0 ), 4.0 );
        diffuseColor.a = mix( diffuseColor.a, 0.9, fres );
      }
      #include <opaque_fragment>`,
    );
  };
  glass.customProgramCacheKey = () => 'perihelion-glass-1';
  glass.userData.fx = true;
  glass.userData.uvMode = 'keep';

  const glow = new THREE.MeshBasicMaterial({ name: 'glow', vertexColors: true });
  glow.userData.castShadow = false;
  glow.userData.uvMode = 'keep';

  const plastic = patchStandard(
    new THREE.MeshStandardMaterial({
      name: 'plastic',
      map: textures.painted.map,
      normalMap: textures.painted.normalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 0.55,
      metalness: 0,
      vertexColors: true,
    }),
  );
  plastic.userData.uvScale = 0.8;

  return {
    panel: texturedPBR('panel', textures.panel, 2.0),
    hull: texturedPBR('hull', textures.hull, 6.0),
    painted: texturedPBR('painted', textures.painted, 1.4),
    grate: texturedPBR('grate', textures.grate, 1.0, { alphaTest: 0.35, side: THREE.DoubleSide }),
    tread: texturedPBR('tread', textures.tread, 0.9),
    deck: texturedPBR('deck', textures.deck, 2.4),
    hazard: texturedPBR('hazard', textures.hazard, 1.0),
    fabric: texturedPBR('fabric', textures.fabric, 0.45, { metalness: 0 }),
    rubber: texturedPBR('rubber', textures.rubber, 0.6, { metalness: 0 }),
    corrugated: texturedPBR('corrugated', textures.corrugated, 2.6),
    brushed: texturedPBR('brushed', textures.brushed, 1.0),
    chrome: texturedPBR('chrome', textures.brushed, 1.0, { roughness: 0.45 }),
    plastic,
    glass,
    glow,
    textures,
  };
}

/** Mark an object (and children) as an additive/transparent effect excluded from the AO G-buffer. */
export function asFx<T extends THREE.Object3D>(obj: T): T {
  obj.traverse((o) => {
    o.layers.set(FX_LAYER);
    (o as THREE.Mesh).castShadow = false;
    (o as THREE.Mesh).receiveShadow = false;
  });
  return obj;
}
