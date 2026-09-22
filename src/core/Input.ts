/**
 * Keyboard / mouse / gamepad input. Mouse look uses pointer lock when available and falls
 * back to click-drag (e.g. inside sandboxed iframes where pointer lock is blocked).
 */

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  /** Accumulated absolute look motion since last `consumeLookActivity` (used to interrupt cinematics). */
  lookActivity = 0;
  pointerLocked = false;
  private dragging = false;
  private onFirstGesture: (() => void)[] = [];
  private gestured = false;

  constructor(element: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F3' || e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.gesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    element.addEventListener('mousedown', (e) => {
      this.gesture();
      if (e.button === 0) {
        this.dragging = true;
        if (!this.pointerLocked && element.requestPointerLock) {
          try {
            const r = element.requestPointerLock() as unknown as Promise<void> | undefined;
            if (r && typeof r.catch === 'function') r.catch(() => undefined);
          } catch {
            /* pointer lock not permitted: drag-look fallback */
          }
        }
      }
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === element;
    });
    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked || this.dragging) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
        this.lookActivity += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private gesture(): void {
    if (this.gestured) return;
    this.gestured = true;
    for (const f of this.onFirstGesture) f();
  }

  /** Register a callback for the first user gesture (audio unlock). */
  whenGesture(f: () => void): void {
    if (this.gestured) f();
    else this.onFirstGesture.push(f);
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock();
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  /** True once per physical key press. Cleared by `endFrame`. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** Movement axes in [-1,1]: x = strafe right, y = forward. Includes gamepad left stick. */
  moveAxes(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    const gp = this.gamepad();
    if (gp) {
      const gx = gp.axes[0] ?? 0;
      const gy = -(gp.axes[1] ?? 0);
      if (Math.hypot(gx, gy) > 0.15) {
        x += gx;
        y += gy;
      }
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  gamepad(): Gamepad | null {
    if (!navigator.getGamepads) return null;
    for (const g of navigator.getGamepads()) if (g && g.connected) return g;
    return null;
  }

  /** Right-stick look in "pixels" per second equivalent. */
  gamepadLook(): { x: number; y: number } {
    const gp = this.gamepad();
    if (!gp) return { x: 0, y: 0 };
    const x = gp.axes[2] ?? 0;
    const y = gp.axes[3] ?? 0;
    return { x: Math.abs(x) > 0.12 ? x : 0, y: Math.abs(y) > 0.12 ? y : 0 };
  }

  gamepadButton(i: number): boolean {
    const gp = this.gamepad();
    return !!gp && !!gp.buttons[i]?.pressed;
  }

  consumeLookActivity(): number {
    const a = this.lookActivity;
    this.lookActivity = 0;
    return a;
  }

  endFrame(): void {
    this.pressed.clear();
    this.mouseDX = 0;
    this.mouseDY = 0;
  }
}
