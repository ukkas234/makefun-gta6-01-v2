// Solmara — input.js
// createInput(canvas): keyboard + mouse for the whole game.
//   keys       — a Set of currently held key codes (event.code, e.g. 'KeyW').
//   mouseDX / mouseDY — pointer-drag deltas since the last update() call.
//   pressed(code) — edge-triggered: true once per physical press of that code,
//     consumed on read, so a press between frames is never lost or double-counted.
//   consumeClick() — true once per pointer press on the canvas (left mouse),
//     consumed on read; the player uses it to shoot / punch.
//   update()   — call once per frame after reading input: resets the drag deltas.
//
// Tracked codes: WASD + arrows, Shift (run / handbrake), Space (jump /
// handbrake in a car), E (enter/exit/steal), F (punch), Q (draw/holster),
// M (mute), R (flip/reset car), Esc and P (pause).
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;

export function createInput(canvas) {
  const keys = new Set();
  const justPressed = new Set();
  let mouseDX = 0;
  let mouseDY = 0;
  let clickQueued = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  const GAME_KEYS = new Set([
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'ShiftLeft', 'ShiftRight', 'Space',
    'KeyE', 'KeyF', 'KeyQ', 'KeyM', 'KeyR', 'Escape', 'KeyP',
  ]);

  function onKeyDown(event) {
    if (!GAME_KEYS.has(event.code)) return;
    event.preventDefault();
    if (!event.repeat) {
      keys.add(event.code);
      justPressed.add(event.code);
    }
  }

  function onKeyUp(event) {
    keys.delete(event.code);
    // A key released still counts as pressed if it was never read; only the
    // held state is cleared here.
  }

  function onBlur() {
    keys.clear();
    dragging = false;
  }

  function onPointerDown(event) {
    if (event.button !== 0) return;
    clickQueued = true;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event) {
    if (!dragging) return;
    mouseDX += event.clientX - lastX;
    mouseDY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  }

  function onPointerUp(event) {
    if (event.button !== 0) return;
    dragging = false;
  }

  function onContextMenu(event) {
    event.preventDefault();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', onContextMenu);

  const api = {
    keys,
    get mouseDX() { return mouseDX; },
    get mouseDY() { return mouseDY; },
    get dragging() { return dragging; },

    /** True once per physical press of `code`; consumed on read. */
    pressed(code) {
      if (justPressed.has(code)) {
        justPressed.delete(code);
        return true;
      }
      return false;
    },

    /** True once per left-button press on the canvas; consumed on read. */
    consumeClick() {
      if (clickQueued) {
        clickQueued = false;
        return true;
      }
      return false;
    },

    /** Call once per frame after the game has read the input state. */
    update() {
      mouseDX = 0;
      mouseDY = 0;
    },

    /**
     * Compatibility helpers for the starter main loop (Block Dodger shape):
     * takeActions() folds queued Space/Enter presses into ACTION_CONFIRM and
     * P/Escape into ACTION_PAUSE, consuming them; direction() is -1/0/1 from
     * A/D and the arrow keys. The Solmara main loop should prefer pressed()
     * instead — takeActions() consumes the presses it reports, so do not mix
     * the two for the same key in one frame.
     */
    takeActions() {
      let actions = 0;
      if (api.pressed('Space') || api.pressed('Enter')) actions |= ACTION_CONFIRM;
      if (api.pressed('KeyP') || api.pressed('Escape')) actions |= ACTION_PAUSE;
      if (clickQueued) {
        clickQueued = false;
        actions |= ACTION_CONFIRM;
      }
      return actions;
    },

    /** -1 for left, 1 for right, 0 for neither or both (A/D, arrows). */
    direction() {
      const left = keys.has('KeyA') || keys.has('ArrowLeft');
      const right = keys.has('KeyD') || keys.has('ArrowRight');
      return (right ? 1 : 0) - (left ? 1 : 0);
    },

    /** Remove all listeners (title-screen teardown / tests). */
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
    },
  };
  return api;
}
