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
