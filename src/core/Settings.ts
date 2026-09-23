/**
 * Graphics quality presets. Every system reads its budget from here so a preset switch
 * is a single call to `applyPreset`.
 */

export type QualityName = 'ultra' | 'high' | 'medium' | 'low';

export interface Quality {
  name: QualityName;
  /** Internal render scale relative to the device pixel ratio (capped). */
  renderScale: number;
  maxPixelRatio: number;
  msaa: number;
  shadowNear: number;
  shadowFar: number;
  shadowTaps: number;
  /** Cloud raymarch resolution divisor (1 = full, 2 = half, 4 = quarter). */
  cloudDivisor: number;
  cloudSteps: number;
  cloudLightSteps: number;
  cloudDetail: boolean;
  grassNear: number; // instances per side of the near grass grid
  grassNearSpacing: number;
  grassFar: number;
  grassFarSpacing: number;
  flowers: number;
  forestDensity: number;
  bloom: boolean;
  godRays: boolean;
  dof: boolean;
  motionBlur: boolean;
  ssao: boolean;
  particles: number;
  dynamicResolution: boolean;
}

export const PRESETS: Record<QualityName, Quality> = {
  ultra: {
    name: 'ultra',
    renderScale: 1,
    maxPixelRatio: 2,
    msaa: 4,
    shadowNear: 4096,
    shadowFar: 4096,
    shadowTaps: 16,
    cloudDivisor: 1,
    cloudSteps: 96,
    cloudLightSteps: 6,
    cloudDetail: true,
    grassNear: 640,
    grassNearSpacing: 0.085,
    grassFar: 320,
    grassFarSpacing: 0.3,
    flowers: 200,
    forestDensity: 1,
    bloom: true,
    godRays: true,
    dof: true,
    motionBlur: true,
    ssao: true,
    particles: 1,
    dynamicResolution: false,
  },
  high: {
    name: 'high',
    renderScale: 1,
    maxPixelRatio: 1.5,
    msaa: 4,
    shadowNear: 2048,
    shadowFar: 4096,
    shadowTaps: 12,
    cloudDivisor: 2,
    cloudSteps: 80,
    cloudLightSteps: 6,
    cloudDetail: true,
    grassNear: 512,
    grassNearSpacing: 0.1,
    grassFar: 256,
    grassFarSpacing: 0.34,
    flowers: 160,
    forestDensity: 0.8,
    bloom: true,
    godRays: true,
    dof: true,
    motionBlur: true,
    ssao: true,
    particles: 1,
    dynamicResolution: true,
  },
  medium: {
    name: 'medium',
    renderScale: 0.85,
    maxPixelRatio: 1.25,
    msaa: 2,
    shadowNear: 2048,
    shadowFar: 2048,
    shadowTaps: 8,
    cloudDivisor: 2,
    cloudSteps: 56,
    cloudLightSteps: 4,
    cloudDetail: true,
    grassNear: 384,
    grassNearSpacing: 0.13,
    grassFar: 160,
    grassFarSpacing: 0.45,
    flowers: 110,
    forestDensity: 0.55,
    bloom: true,
    godRays: true,
    dof: false,
    motionBlur: true,
    ssao: false,
    particles: 0.7,
    dynamicResolution: true,
  },
  low: {
    name: 'low',
    renderScale: 0.7,
    maxPixelRatio: 1,
    msaa: 0,
    shadowNear: 1024,
    shadowFar: 1024,
    shadowTaps: 4,
    cloudDivisor: 4,
    cloudSteps: 40,
    cloudLightSteps: 3,
    cloudDetail: false,
    grassNear: 256,
    grassNearSpacing: 0.18,
    grassFar: 96,
    grassFarSpacing: 0.7,
    flowers: 64,
    forestDensity: 0.3,
    bloom: true,
    godRays: false,
    dof: false,
    motionBlur: false,
    ssao: false,
    particles: 0.4,
    dynamicResolution: true,
  },
};

export interface UserSettings {
  quality: QualityName;
  mouseSensitivity: number;
  invertY: boolean;
  volume: number;
  music: boolean;
}

type Listener = (q: Quality) => void;

class SettingsStore {
  quality: Quality = PRESETS.high;
  user: UserSettings = { quality: 'high', mouseSensitivity: 1, invertY: false, volume: 0.8, music: true };
  private listeners: Listener[] = [];

  load(): void {
    try {
      const raw = localStorage.getItem('aperture.settings');
      if (raw) Object.assign(this.user, JSON.parse(raw));
    } catch {
      /* storage unavailable — keep defaults */
    }
    const params = new URLSearchParams(location.search);
    const q = params.get('quality') as QualityName | null;
    if (q && q in PRESETS) this.user.quality = q;
    this.quality = { ...PRESETS[this.user.quality] };
  }

  save(): void {
    try {
      localStorage.setItem('aperture.settings', JSON.stringify(this.user));
    } catch {
      /* ignore */
    }
  }

  applyPreset(name: QualityName): void {
    this.user.quality = name;
    this.quality = { ...PRESETS[name] };
    this.save();
    for (const l of this.listeners) l(this.quality);
  }

  onChange(l: Listener): void {
    this.listeners.push(l);
  }
}

export const Settings = new SettingsStore();
