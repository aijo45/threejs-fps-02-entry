// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain browser
// APIs only. Besides the held-key set it reports single presses (B, G, E, R, digits) once
// per keydown, so menus and actions never double-fire on a held key.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0 };

  function setKey(event, down) {
    if (event.code === 'Space') event.preventDefault();
    if (down) {
      if (!event.repeat) pressed.add(event.code);
      keys.add(event.code);
    } else {
      keys.delete(event.code);
    }
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => {
    keys.clear();
    pressed.clear();
    state.firing = false;
  });
  window.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.lookX += event.movementX;
    state.lookY += event.movementY;
  });
  window.addEventListener('mousedown', (event) => {
    if (state.locked && event.button === 0) state.firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      pressed.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      canvas.requestPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
    // True once for a key pressed since the last call; drains the press queue.
    takePressed(code) {
      if (!pressed.has(code)) return false;
      pressed.delete(code);
      return true;
    },
    drainPressed() {
      pressed.clear();
    },
  };
}
