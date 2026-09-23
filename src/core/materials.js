// Material library. Physically based throughout; the environment map built in
// stage.js does most of the lighting work, so metals are tuned against it.
import * as THREE from 'three';
import * as T from './textures.js';

export function createMaterials() {
  const leatherN = T.leatherNormal();
  leatherN.repeat.set(1 / 16, 1 / 16);
  const clothN = T.clothNormal();
  clothN.repeat.set(1 / 6, 1 / 6);
  const ribN = T.ribbedNormal();
  const turnedN = T.turnedNormal();

  const M = {};

  // Satin chrome: brushed along the tangent, a touch of anisotropy.
  M.chrome = new THREE.MeshPhysicalMaterial({
    name: 'chrome', color: 0xd6d6d2, metalness: 1, roughness: 0.2,
    anisotropy: 0.35, envMapIntensity: 1.15,
  });
  M.chromePolished = new THREE.MeshPhysicalMaterial({
    name: 'chromePolished', color: 0xe6e6e4, metalness: 1, roughness: 0.07, envMapIntensity: 1.2,
  });
  M.chromeTurned = new THREE.MeshPhysicalMaterial({
    name: 'chromeTurned', color: 0xd9d9d6, metalness: 1, roughness: 0.16,
    normalMap: turnedN, normalScale: new THREE.Vector2(0.25, 0.25),
  });
  // Black paint (swapped in for the "black paint" finish).
  M.blackPaint = new THREE.MeshPhysicalMaterial({
    name: 'blackPaint', color: 0x070707, metalness: 0.0, roughness: 0.3,
    clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.0,
  });
  M.anodized = new THREE.MeshPhysicalMaterial({
    name: 'anodized', color: 0x0c0c0d, metalness: 0.55, roughness: 0.36,
    clearcoat: 0.35, clearcoatRoughness: 0.3,
  });
  M.anodizedMatte = new THREE.MeshPhysicalMaterial({
    name: 'anodizedMatte', color: 0x101011, metalness: 0.4, roughness: 0.55,
  });
  M.leather = new THREE.MeshPhysicalMaterial({
    name: 'leather', color: 0x0c0c0c, metalness: 0, roughness: 0.6,
    normalMap: leatherN, normalScale: new THREE.Vector2(0.9, 0.9),
    sheen: 0.15, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x2a2a2a),
  });
  M.chassis = new THREE.MeshPhysicalMaterial({
    name: 'chassis', color: 0x2c2d30, metalness: 0.7, roughness: 0.5,
  });
  M.matteBlack = new THREE.MeshStandardMaterial({
    name: 'matteBlack', color: 0x050505, metalness: 0, roughness: 0.92, side: THREE.DoubleSide,
  });
  M.brass = new THREE.MeshPhysicalMaterial({
    name: 'brass', color: 0xd9a55b, metalness: 1, roughness: 0.24, anisotropy: 0.45,
  });
  M.steel = new THREE.MeshPhysicalMaterial({
    name: 'steel', color: 0x9a9da3, metalness: 1, roughness: 0.28,
  });
  M.blueSteel = new THREE.MeshPhysicalMaterial({
    name: 'blueSteel', color: 0x1c2330, metalness: 0.9, roughness: 0.3,
    iridescence: 0.4, iridescenceIOR: 1.4, iridescenceThicknessRange: [250, 500],
  });
  M.blade = new THREE.MeshPhysicalMaterial({
    name: 'blade', color: 0x3a3c40, metalness: 0.9, roughness: 0.26, side: THREE.DoubleSide,
    clearcoat: 0.4, clearcoatRoughness: 0.2,
  });
  // Optical glass with multi-coating: iridescence gives the green/violet cast.
  M.glass = new THREE.MeshPhysicalMaterial({
    name: 'glass', color: 0xffffff, metalness: 0, roughness: 0.02,
    transmission: 1, thickness: 4, ior: 1.72, dispersion: 0.4,
    attenuationColor: new THREE.Color(0xe8f4ea), attenuationDistance: 60,
    iridescence: 0.85, iridescenceIOR: 1.35, iridescenceThicknessRange: [180, 420],
    specularIntensity: 1, envMapIntensity: 1.4, transparent: false,
  });
  M.glassDark = new THREE.MeshPhysicalMaterial({
    name: 'glassDark', color: 0x030405, metalness: 0, roughness: 0.02,
    clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6,
    iridescence: 0.6, iridescenceIOR: 1.3, iridescenceThicknessRange: [200, 380],
  });
  M.frosted = new THREE.MeshPhysicalMaterial({
    name: 'frosted', color: 0xdedcd4, metalness: 0, roughness: 0.35,
    normalMap: ribN, normalScale: new THREE.Vector2(0.6, 0.6),
    emissive: 0x2a2a28, clearcoat: 1, clearcoatRoughness: 0.05,
  });
  M.redEnamel = new THREE.MeshPhysicalMaterial({
    name: 'redEnamel', color: 0xd0101e, metalness: 0, roughness: 0.25,
    clearcoat: 1, clearcoatRoughness: 0.04,
  });
  M.rubber = new THREE.MeshPhysicalMaterial({
    name: 'rubber', color: 0x111111, metalness: 0, roughness: 0.55, clearcoat: 0.2,
  });
  M.cloth = new THREE.MeshPhysicalMaterial({
    name: 'cloth', color: 0x0b0b0b, metalness: 0, roughness: 0.55, side: THREE.DoubleSide,
    normalMap: clothN, normalScale: new THREE.Vector2(0.5, 0.5),
    sheen: 0.6, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x3a3a3a),
  });
  M.pcb = new THREE.MeshPhysicalMaterial({
    name: 'pcb', map: T.pcbTexture(), metalness: 0.1, roughness: 0.4,
    clearcoat: 0.8, clearcoatRoughness: 0.15,
  });
  M.chip = new THREE.MeshPhysicalMaterial({ name: 'chip', color: 0x111112, roughness: 0.5 });
  M.gold = new THREE.MeshPhysicalMaterial({ name: 'gold', color: 0xf0c060, metalness: 1, roughness: 0.2 });
  M.film = new THREE.MeshPhysicalMaterial({
    name: 'film', map: T.filmStrip(), alphaTest: 0.5, side: THREE.DoubleSide,
    roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    emissive: 0x2a0e02,
  });
  M.canister = new THREE.MeshPhysicalMaterial({
    name: 'canister', map: T.canisterLabel(), metalness: 0.35, roughness: 0.35, clearcoat: 0.6,
  });
  M.white = new THREE.MeshPhysicalMaterial({ name: 'white', color: 0xf2f0ea, roughness: 0.4 });
  M.lightRay = new THREE.MeshBasicMaterial({
    name: 'lightRay', color: new THREE.Color(1.0, 0.82, 0.55).multiplyScalar(3.2),
    transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  M.frameline = new THREE.MeshBasicMaterial({
    name: 'frameline', color: new THREE.Color(1, 0.97, 0.9).multiplyScalar(2.2),
  });
  M.led = new THREE.MeshBasicMaterial({ name: 'led', color: new THREE.Color(3.5, 0.2, 0.15) });

  // Finishes: the swappable "body metal" is the top plate, base plate and dials.
  M.body = M.chrome.clone();
  M.body.name = 'bodyMetal';
  const finishes = {
    // Non-zero clearcoat/anisotropy on both keeps one shader program, so switching never recompiles.
    chrome: { color: 0xd6d6d2, metalness: 1, roughness: 0.2, clearcoat: 0.02, anisotropy: 0.35 },
    black: { color: 0x080808, metalness: 0.0, roughness: 0.3, clearcoat: 1, anisotropy: 0.02 },
  };
  M.setFinish = (name) => {
    const f = finishes[name];
    M.body.color.set(f.color);
    M.body.metalness = f.metalness;
    M.body.roughness = f.roughness;
    M.body.clearcoat = f.clearcoat;
    M.body.clearcoatRoughness = 0.06;
    M.body.anisotropy = f.anisotropy;
  };
  M.setFinish('chrome');
  return M;
}
