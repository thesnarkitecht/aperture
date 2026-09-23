// Material library. Physically based throughout; the environment map built in
// stage.js does most of the lighting work, so metals are tuned against it.
import * as THREE from 'three';
import * as T from './textures.js';

export function createMaterials() {
  const leather = T.leatherMaps();
  leather.normal.repeat.set(1 / 30, 1 / 30);
  leather.rough.repeat.set(1 / 30, 1 / 30);
  const brushed = T.brushedRoughness();
  brushed.repeat.set(1 / 48, 1 / 48);
  const clothN = T.clothNormal();
  clothN.repeat.set(1 / 6, 1 / 6);
  const ribN = T.ribbedNormal();
  const turnedN = T.turnedNormal();

  const M = {};

  // Satin chrome: brushed along the tangent, a touch of anisotropy.
  M.chrome = new THREE.MeshPhysicalMaterial({
    name: 'chrome', color: 0xdcdcd8, metalness: 1, roughness: 0.17, roughnessMap: brushed,
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
  M.crate = new THREE.MeshPhysicalMaterial({
    name: 'crate', color: 0x7a7d82, metalness: 1, roughness: 0.34, roughnessMap: brushed,
  });
  M.anodizedMatte = new THREE.MeshPhysicalMaterial({
    name: 'anodizedMatte', color: 0x101011, metalness: 0.4, roughness: 0.55,
  });
  M.leather = new THREE.MeshPhysicalMaterial({
    name: 'leather', color: 0x111111, metalness: 0, roughness: 0.72,
    normalMap: leather.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: leather.rough,
    sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x303030),
    clearcoat: 0.08, clearcoatRoughness: 0.5,
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
    name: 'pcb', map: T.pcbTexture({ labels: [['FL-11  R2', 0.06, 0.09]] }), metalness: 0.1, roughness: 0.4,
    clearcoat: 0.8, clearcoatRoughness: 0.15,
  });
  M.pcbBlack = new THREE.MeshPhysicalMaterial({
    name: 'pcbBlack', map: T.pcbTexture({ base: '#101112', trace: 'rgba(170,150,90,0.55)', seed: 41, labels: [['M11 MAIN  REV 04', 0.05, 0.07], ['U1', 0.46, 0.3], ['J3', 0.8, 0.8]] }),
    metalness: 0.15, roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.12,
  });
  M.chip = new THREE.MeshPhysicalMaterial({ name: 'chip', color: 0x111112, roughness: 0.5 });
  M.gold = new THREE.MeshPhysicalMaterial({ name: 'gold', color: 0xf0c060, metalness: 1, roughness: 0.2 });
  M.flex = new THREE.MeshPhysicalMaterial({ name: 'flex', color: 0xc4741c, roughness: 0.35, clearcoat: 0.7, side: THREE.DoubleSide, transmission: 0.25, thickness: 0.2 });
  M.ceramic = new THREE.MeshPhysicalMaterial({ name: 'ceramic', map: T.sensorPackage(), roughness: 0.55, metalness: 0.1, clearcoat: 0.3 });
  // Sensor die: micro-lens array + colour filter array read as a shifting rainbow sheen.
  M.sensorDie = new THREE.MeshPhysicalMaterial({
    name: 'sensorDie', color: 0x0e0b16, metalness: 0.65, roughness: 0.1,
    normalMap: T.microlensNormal(), normalScale: new THREE.Vector2(0.35, 0.35),
    iridescence: 1, iridescenceIOR: 1.95, iridescenceThicknessRange: [180, 950],
    anisotropy: 0.4, clearcoat: 1, clearcoatRoughness: 0.03,
  });
  M.sensorDie.normalMap.repeat.set(1 / 1.2, 1 / 1.2);
  // IR-cut cover glass: cyan body, magenta/green dichroic reflections.
  M.irGlass = new THREE.MeshPhysicalMaterial({
    name: 'irGlass', color: 0xc9ecff, metalness: 0, roughness: 0.02, transmission: 1, thickness: 1, ior: 1.52,
    iridescence: 1, iridescenceIOR: 2.1, iridescenceThicknessRange: [320, 720],
    attenuationColor: new THREE.Color(0x9fdcff), attenuationDistance: 6, specularIntensity: 1,
  });
  M.aluminium = new THREE.MeshPhysicalMaterial({
    name: 'aluminium', color: 0xb9bcc0, metalness: 1, roughness: 0.38, roughnessMap: brushed,
  });
  M.rearCover = new THREE.MeshPhysicalMaterial({
    name: 'rearCover', color: 0x0d0d0e, metalness: 0.2, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4,
  });
  M.screen = new THREE.MeshPhysicalMaterial({
    name: 'screen', color: 0x020203, metalness: 0, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.01,
    emissive: 0xffffff, emissiveMap: T.screenImage(), emissiveIntensity: 0,
  });
  M.battery = new THREE.MeshPhysicalMaterial({
    name: 'battery', color: 0x151516, metalness: 0.1, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.3,
  });
  M.ledLens = new THREE.MeshPhysicalMaterial({ name: 'ledLens', color: 0x5a0a08, roughness: 0.05, clearcoat: 1, emissive: 0x200000 });
  M.white = new THREE.MeshPhysicalMaterial({ name: 'white', color: 0xf2f0ea, roughness: 0.4 });
  M.frameline = new THREE.MeshBasicMaterial({
    name: 'frameline', color: new THREE.Color(1, 0.97, 0.9).multiplyScalar(4),
  });
  M.led = new THREE.MeshBasicMaterial({ name: 'led', color: new THREE.Color(6, 0.3, 0.2) });

  // Finishes: the swappable "body metal" is the top plate, base plate and dials.
  M.body = M.chrome.clone();
  M.body.name = 'bodyMetal';
  const finishes = {
    // Non-zero clearcoat/anisotropy on both keeps one shader program, so switching never recompiles.
    chrome: { color: 0xdcdcd8, metalness: 1, roughness: 0.17, clearcoat: 0.02, anisotropy: 0.35 },
    // Black M11: matte-coated aluminium top cover.
    black: { color: 0x0a0a0a, metalness: 0.15, roughness: 0.48, clearcoat: 0.25, anisotropy: 0.02 },
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
