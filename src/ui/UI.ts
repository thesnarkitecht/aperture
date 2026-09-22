/**
 * APERTURE UI layer: loading screen, title cards, captions, controls hint,
 * letterbox bars, debug overlay and the pause menu.
 *
 * All DOM is created here and appended to the root element passed to the constructor.
 * Every overlay except the open pause menu is `pointer-events: none`, so the canvas
 * underneath always receives input. No global key bindings are registered here.
 */
import './ui.css';
import { Settings, type QualityName } from '../core/Settings';

export interface DebugInfo {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  resolution: string;
  gpu: string;
  characterState: string;
  animationState: string;
  camera: string;
  cinematicTime: string;
  quality: string;
  extra?: string;
}

type Callback = () => void;
type QualityCallback = (name: 'ultra' | 'high' | 'medium' | 'low') => void;

const QUALITY_OPTIONS: ReadonlyArray<{ name: QualityName; label: string }> = [
  { name: 'ultra', label: 'Ultra' },
  { name: 'high', label: 'High' },
  { name: 'medium', label: 'Medium' },
  { name: 'low', label: 'Low' },
];

const CONTROLS: ReadonlyArray<readonly [key: string, action: string]> = [
  ['WASD', 'Move'],
  ['Mouse', 'Look'],
  ['Space', 'Jump / Glide'],
  ['Shift', 'Sprint'],
  ['C', 'Cinematic'],
  ['Esc', 'Menu'],
  ['F3', 'Debug'],
];

/** Pointer/mouse events that must never bubble from the menu to the canvas or window. */
const MENU_STOP_EVENTS = [
  'mousedown',
  'mouseup',
  'click',
  'dblclick',
  'pointerdown',
  'pointerup',
  'touchstart',
  'touchend',
  'wheel',
  'contextmenu',
] as const;

type DebugKey =
  | 'fps'
  | 'frame'
  | 'draw'
  | 'tris'
  | 'res'
  | 'gpu'
  | 'quality'
  | 'char'
  | 'anim'
  | 'cam'
  | 'cine';

const DEBUG_ROWS: ReadonlyArray<readonly [DebugKey, string]> = [
  ['fps', 'FPS'],
  ['frame', 'Frame'],
  ['draw', 'Draw calls'],
  ['tris', 'Triangles'],
  ['res', 'Resolution'],
  ['gpu', 'GPU'],
  ['quality', 'Quality'],
  ['char', 'Character'],
  ['anim', 'Animation'],
  ['cam', 'Camera'],
  ['cine', 'Cinematic'],
];

// Timings (ms). Keep in sync with ui.css.
const LOADING_FADE_MS = 1200;
const TITLE_FADE_MS = 1800;
const TITLE_SWAP_MS = 550;
const CAPTION_FADE_MS = 900;
const CAPTION_SWAP_MS = 350;
const HINT_FADE_MS = 1200;
const HINT_HOLD_MS = 7000;

let uidCounter = 0;
const uid = (): string => `ap-ui-${++uidCounter}`;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: HTMLElement,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function formatCount(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e4) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

function emit<A extends unknown[]>(list: Array<(...args: A) => void>, ...args: A): void {
  for (const cb of list) {
    try {
      cb(...args);
    } catch (err) {
      console.error('[UI] callback failed', err);
    }
  }
}

/** A small set of cancellable timeouts, so repeated calls never stack stale fades. */
class Timers {
  private readonly ids = new Set<number>();

  set(fn: () => void, ms: number): void {
    const id = window.setTimeout(() => {
      this.ids.delete(id);
      fn();
    }, ms);
    this.ids.add(id);
  }

  clear(): void {
    for (const id of this.ids) window.clearTimeout(id);
    this.ids.clear();
  }
}

export class UI {
  private readonly layer: HTMLDivElement;

  // Loading
  private loading: HTMLDivElement | null;
  private readonly loadFill: HTMLDivElement;
  private readonly loadLabel: HTMLSpanElement;
  private readonly loadPct: HTMLSpanElement;
  private loadingLeaving = false;

  // Title card
  private readonly title: HTMLDivElement;
  private readonly titleMain: HTMLDivElement;
  private readonly titleSub: HTMLDivElement;
  private readonly titleTimers = new Timers();

  // Caption
  private readonly caption: HTMLDivElement;
  private readonly captionTimers = new Timers();

  // Controls hint
  private readonly hint: HTMLDivElement;
  private readonly hintTimers = new Timers();

  // Debug
  private readonly debug: HTMLDivElement;
  private readonly debugVals = {} as Record<DebugKey, HTMLSpanElement>;
  private readonly debugLast = {} as Record<DebugKey, string>;
  private readonly debugExtra: HTMLDivElement;
  private debugExtraLast = '';
  private debugPerfLast = '';
  private debugShown = false;
  private lastDebug: DebugInfo | null = null;

  // Menu
  private readonly menu: HTMLDivElement;
  private readonly menuPanel: HTMLDivElement;
  private readonly qualityButtons: HTMLButtonElement[] = [];
  private readonly syncSensitivity: (v: number) => void;
  private readonly syncVolume: (v: number) => void;
  private readonly syncInvertY: (on: boolean) => void;
  private readonly syncMusic: (on: boolean) => void;
  private isMenuOpen = false;

  private readonly resumeCbs: Callback[] = [];
  private readonly replayCbs: Callback[] = [];
  private readonly qualityCbs: QualityCallback[] = [];
  private readonly settingsCbs: Callback[] = [];

  constructor(root: HTMLElement) {
    const layer = el('div', 'ap-ui');
    layer.setAttribute('data-aperture-ui', '');
    this.layer = layer;

    // Letterbox bars
    for (const side of ['top', 'bottom'] as const) {
      el('div', `ap-bar ap-bar--${side}`, layer).setAttribute('aria-hidden', 'true');
    }

    // Title card
    this.title = el('div', 'ap-title ap-fade no-sub', layer);
    this.title.setAttribute('role', 'status');
    this.title.setAttribute('aria-live', 'polite');
    this.titleMain = el('div', 'ap-title__main', this.title);
    el('div', 'ap-title__rule', this.title).setAttribute('aria-hidden', 'true');
    this.titleSub = el('div', 'ap-title__sub', this.title);

    // Caption
    this.caption = el('div', 'ap-caption ap-fade', layer);
    this.caption.setAttribute('role', 'status');
    this.caption.setAttribute('aria-live', 'polite');

    // Controls hint
    this.hint = el('div', 'ap-hint', layer);
    this.hint.setAttribute('aria-hidden', 'true');
    for (const [key, action] of CONTROLS) {
      el('kbd', 'ap-hint__key', this.hint, key);
      el('span', 'ap-hint__act', this.hint, action);
    }

    // Debug panel
    this.debug = el('div', 'ap-debug', layer);
    this.debug.setAttribute('aria-hidden', 'true');
    el('div', 'ap-debug__head', this.debug, 'Aperture · Debug');
    for (const [key, label] of DEBUG_ROWS) {
      const row = el('div', 'ap-debug__row', this.debug);
      el('span', 'ap-debug__k', row, label);
      this.debugVals[key] = el('span', 'ap-debug__v', row, '—');
      this.debugLast[key] = '—';
    }
    this.debugExtra = el('div', 'ap-debug__extra', this.debug);

    // Pause menu
    this.menu = el('div', 'ap-menu', layer);
    const titleId = uid();
    this.menu.setAttribute('role', 'dialog');
    this.menu.setAttribute('aria-modal', 'true');
    this.menu.setAttribute('aria-labelledby', titleId);
    this.menu.setAttribute('aria-hidden', 'true');
    this.menu.inert = true;
    for (const type of MENU_STOP_EVENTS) {
      this.menu.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
    }

    const panel = el('div', 'ap-menu__panel', this.menu);
    panel.tabIndex = -1;
    this.menuPanel = panel;
    el('div', 'ap-menu__eyebrow', panel, 'Aperture');
    el('h2', 'ap-menu__title', panel, 'Paused').id = titleId;

    const actions = el('div', 'ap-menu__actions', panel);
    const resume = el('button', 'ap-btn ap-btn--primary', actions, 'Resume');
    resume.type = 'button';
    resume.addEventListener('click', () => emit(this.resumeCbs));
    const replay = el('button', 'ap-btn', actions, 'Replay cinematic');
    replay.type = 'button';
    replay.addEventListener('click', () => emit(this.replayCbs));

    const settings = el('div', 'ap-menu__settings', panel);

    // Quality segmented control
    const qField = el('div', 'ap-field', settings);
    const qHead = el('div', 'ap-field__head', qField);
    const qLabel = el('span', 'ap-field__label', qHead, 'Quality');
    qLabel.id = uid();
    const seg = el('div', 'ap-seg', qField);
    seg.setAttribute('role', 'radiogroup');
    seg.setAttribute('aria-labelledby', qLabel.id);
    for (const opt of QUALITY_OPTIONS) {
      const b = el('button', 'ap-seg__opt', seg, opt.label);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.q = opt.name;
      b.addEventListener('click', () => {
        this.highlightQuality(opt.name);
        emit(this.qualityCbs, opt.name);
      });
      this.qualityButtons.push(b);
    }

    this.syncSensitivity = this.makeRange(
      settings,
      'Mouse sensitivity',
      0.2,
      3,
      0.05,
      (v) => `${v.toFixed(2)}×`,
      (v) => {
        Settings.user.mouseSensitivity = v;
      },
    );
    this.syncInvertY = this.makeSwitch(settings, 'Invert Y', (on) => {
      Settings.user.invertY = on;
    });
    this.syncVolume = this.makeRange(
      settings,
      'Volume',
      0,
      1,
      0.01,
      (v) => `${Math.round(v * 100)}%`,
      (v) => {
        Settings.user.volume = v;
      },
    );
    this.syncMusic = this.makeSwitch(settings, 'Music', (on) => {
      Settings.user.music = on;
    });

    const ctl = el('p', 'ap-menu__controls', panel);
    CONTROLS.forEach(([key, action], i) => {
      if (i > 0) el('span', 'ap-menu__sep', ctl, ' · ');
      const item = el('span', 'ap-menu__ctl', ctl);
      el('b', undefined, item, key);
      item.append(` ${action}`);
    });

    this.syncMenu();

    // Loading screen (on top of everything, visible immediately)
    const loading = el('div', 'ap-loading', layer);
    loading.setAttribute('role', 'progressbar');
    loading.setAttribute('aria-label', 'Loading');
    loading.setAttribute('aria-valuemin', '0');
    loading.setAttribute('aria-valuemax', '100');
    loading.setAttribute('aria-valuenow', '0');
    const inner = el('div', 'ap-loading__inner', loading);
    el('div', 'ap-loading__brand', inner, 'Aperture');
    el('div', 'ap-loading__title', inner, 'Entering the sky');
    const track = el('div', 'ap-loading__track', inner);
    this.loadFill = el('div', 'ap-loading__fill', track);
    const status = el('div', 'ap-loading__status', inner);
    this.loadLabel = el('span', 'ap-loading__label', status, '');
    this.loadPct = el('span', 'ap-loading__pct', status, '0%');
    this.loading = loading;

    root.appendChild(layer);
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  setProgress(p: number, label?: string): void {
    if (!this.loading) return;
    const v = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
    const pct = Math.round(v * 100);
    this.loadFill.style.width = `${v * 100}%`;
    this.loadPct.textContent = `${pct}%`;
    this.loading.setAttribute('aria-valuenow', String(pct));
    if (label !== undefined) this.loadLabel.textContent = label;
  }

  hideLoading(): void {
    const loading = this.loading;
    if (!loading || this.loadingLeaving) return;
    this.loadingLeaving = true;
    loading.classList.add('is-leaving');
    window.setTimeout(() => {
      loading.remove();
      if (this.loading === loading) this.loading = null;
    }, LOADING_FADE_MS + 60);
  }

  // ─── Hints, titles, captions ──────────────────────────────────────────────

  showControlsHint(): void {
    this.hintTimers.clear();
    this.hint.classList.add('is-visible');
    this.hintTimers.set(() => this.hint.classList.remove('is-visible'), HINT_FADE_MS + HINT_HOLD_MS);
  }

  showTitle(title: string, subtitle?: string, holdSeconds = 4): void {
    this.titleTimers.clear();
    const present = (): void => {
      this.title.classList.remove('is-quick');
      this.titleMain.textContent = title;
      this.titleSub.textContent = subtitle ?? '';
      this.title.classList.toggle('no-sub', !subtitle);
      this.title.classList.add('is-visible');
      if (Number.isFinite(holdSeconds) && holdSeconds > 0) {
        this.titleTimers.set(
          () => this.title.classList.remove('is-visible'),
          TITLE_FADE_MS + holdSeconds * 1000,
        );
      }
    };
    if (this.title.classList.contains('is-visible')) {
      this.title.classList.add('is-quick');
      this.title.classList.remove('is-visible');
      this.titleTimers.set(present, TITLE_SWAP_MS);
    } else {
      present();
    }
  }

  showCaption(text: string, seconds = 4): void {
    this.captionTimers.clear();
    const present = (): void => {
      this.caption.classList.remove('is-quick');
      this.caption.textContent = text;
      this.caption.classList.add('is-visible');
      if (Number.isFinite(seconds) && seconds > 0) {
        this.captionTimers.set(
          () => this.caption.classList.remove('is-visible'),
          Math.max(CAPTION_FADE_MS, seconds * 1000),
        );
      }
    };
    if (this.caption.classList.contains('is-visible')) {
      this.caption.classList.add('is-quick');
      this.caption.classList.remove('is-visible');
      this.captionTimers.set(present, CAPTION_SWAP_MS);
    } else {
      present();
    }
  }

  /** Fade the current caption out early (e.g. once "Click for sound" has been satisfied). */
  hideCaption(): void {
    this.captionTimers.clear();
    this.caption.classList.remove('is-visible');
  }

  setCinematicBars(on: boolean): void {
    this.layer.classList.toggle('has-bars', on);
  }

  // ─── Debug ────────────────────────────────────────────────────────────────

  setDebugVisible(v: boolean): void {
    this.debugShown = v;
    this.debug.classList.toggle('is-visible', v);
    if (v && this.lastDebug) this.renderDebug(this.lastDebug);
  }

  get debugVisible(): boolean {
    return this.debugShown;
  }

  updateDebug(info: DebugInfo): void {
    this.lastDebug = info;
    if (this.debugShown) this.renderDebug(info);
  }

  private renderDebug(info: DebugInfo): void {
    const fps = Number.isFinite(info.fps) ? info.fps : 0;
    this.setDebug('fps', fps.toFixed(0));
    this.setDebug('frame', `${Number.isFinite(info.frameMs) ? info.frameMs.toFixed(2) : '—'} ms`);
    this.setDebug('draw', formatCount(info.drawCalls));
    this.setDebug('tris', formatCount(info.triangles));
    this.setDebug('res', info.resolution);
    this.setDebug('gpu', info.gpu);
    this.setDebug('quality', info.quality);
    this.setDebug('char', info.characterState);
    this.setDebug('anim', info.animationState);
    this.setDebug('cam', info.camera);
    this.setDebug('cine', info.cinematicTime);

    const perf = fps >= 55 ? 'good' : fps >= 30 ? 'ok' : 'bad';
    if (perf !== this.debugPerfLast) {
      this.debugPerfLast = perf;
      this.debugVals.fps.dataset.perf = perf;
    }
    const extra = info.extra ?? '';
    if (extra !== this.debugExtraLast) {
      this.debugExtraLast = extra;
      this.debugExtra.textContent = extra;
      this.debugExtra.hidden = extra === '';
    }
    if (this.debugVals.gpu.title !== info.gpu) this.debugVals.gpu.title = info.gpu;
  }

  private setDebug(key: DebugKey, value: string): void {
    if (this.debugLast[key] === value) return;
    this.debugLast[key] = value;
    this.debugVals[key].textContent = value;
  }

  // ─── Menu ─────────────────────────────────────────────────────────────────

  openMenu(): void {
    if (this.isMenuOpen) return;
    this.syncMenu();
    this.isMenuOpen = true;
    this.menu.inert = false;
    this.menu.setAttribute('aria-hidden', 'false');
    this.menu.classList.add('is-open');
    this.menuPanel.focus({ preventScroll: true });
  }

  closeMenu(): void {
    if (!this.isMenuOpen) return;
    this.isMenuOpen = false;
    const active = document.activeElement;
    if (active instanceof HTMLElement && this.menu.contains(active)) active.blur();
    this.menu.classList.remove('is-open');
    this.menu.setAttribute('aria-hidden', 'true');
    this.menu.inert = true;
  }

  get menuOpen(): boolean {
    return this.isMenuOpen;
  }

  onResume(cb: () => void): void {
    this.resumeCbs.push(cb);
  }

  onReplay(cb: () => void): void {
    this.replayCbs.push(cb);
  }

  onQualityChange(cb: (name: 'ultra' | 'high' | 'medium' | 'low') => void): void {
    this.qualityCbs.push(cb);
  }

  onSettingsChange(cb: () => void): void {
    this.settingsCbs.push(cb);
  }

  /** Pull current values from Settings.user into the menu controls. */
  private syncMenu(): void {
    const u = Settings.user;
    this.highlightQuality(u.quality);
    this.syncSensitivity(u.mouseSensitivity);
    this.syncInvertY(u.invertY);
    this.syncVolume(u.volume);
    this.syncMusic(u.music);
  }

  private highlightQuality(name: QualityName): void {
    for (const b of this.qualityButtons) {
      const on = b.dataset.q === name;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    // Keep every option reachable by keyboard if nothing matches.
    if (!this.qualityButtons.some((b) => b.tabIndex === 0)) {
      for (const b of this.qualityButtons) b.tabIndex = 0;
    }
  }

  private commitSettings(): void {
    Settings.save();
    emit(this.settingsCbs);
  }

  private makeRange(
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    step: number,
    format: (v: number) => string,
    apply: (v: number) => void,
  ): (v: number) => void {
    const field = el('div', 'ap-field', parent);
    const head = el('div', 'ap-field__head', field);
    const id = uid();
    const lab = el('label', 'ap-field__label', head, label);
    lab.htmlFor = id;
    const val = el('span', 'ap-field__val', head);
    const input = el('input', 'ap-range', field);
    input.type = 'range';
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);

    const paint = (v: number): void => {
      val.textContent = format(v);
      input.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
    };
    input.addEventListener('input', () => {
      const v = Math.min(max, Math.max(min, parseFloat(input.value)));
      if (!Number.isFinite(v)) return;
      paint(v);
      apply(v);
      this.commitSettings();
    });

    return (v: number) => {
      const c = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min;
      input.value = String(c);
      paint(c);
    };
  }

  private makeSwitch(parent: HTMLElement, label: string, apply: (on: boolean) => void): (on: boolean) => void {
    const field = el('div', 'ap-field ap-field--inline', parent);
    const lab = el('span', 'ap-field__label', field, label);
    lab.id = uid();
    const ctl = el('div', 'ap-field__ctl', field);
    const state = el('span', 'ap-field__val', ctl);
    const sw = el('button', 'ap-switch', ctl);
    sw.type = 'button';
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-labelledby', lab.id);

    let on = false;
    const paint = (v: boolean): void => {
      on = v;
      sw.setAttribute('aria-checked', String(v));
      state.textContent = v ? 'On' : 'Off';
    };
    const toggle = (): void => {
      paint(!on);
      apply(on);
      this.commitSettings();
    };
    sw.addEventListener('click', toggle);
    lab.addEventListener('click', toggle);
    state.addEventListener('click', toggle);

    return paint;
  }
}
