// Keyboard and pointer input. Held keys give a steering direction every frame; one-shot
// presses (confirm, pause, get in a car, switch weapon, mute) are queued as bit flags
// and taken once by the loop, so a press between two frames is never lost and never
// counted twice. Pointer lock is never used: the mouse only aims.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_WEAPON = 8;
export const ACTION_MUTE = 16;
export const ACTION_MENU_UP = 32;
export const ACTION_MENU_DOWN = 64;

const MOVE = {
  up: new Set(['ArrowUp', 'KeyW']),
  down: new Set(['ArrowDown', 'KeyS']),
  left: new Set(['ArrowLeft', 'KeyA']),
  right: new Set(['ArrowRight', 'KeyD']),
};
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false, run: false };
  const mouse = { x: 0, y: 0, down: false, moved: false };
  let actions = 0;

  function keyDown(event) {
    if (MOVE.up.has(event.code)) held.up = true;
    else if (MOVE.down.has(event.code)) held.down = true;
    else if (MOVE.left.has(event.code)) held.left = true;
    else if (MOVE.right.has(event.code)) held.right = true;
    else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.run = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (event.code === 'KeyE') { if (!event.repeat) actions |= ACTION_INTERACT; }
    else if (event.code === 'KeyQ') { if (!event.repeat) actions |= ACTION_WEAPON; }
    else if (event.code === 'KeyM') { if (!event.repeat) actions |= ACTION_MUTE; }
    else return;
    event.preventDefault();
  }

  function keyUp(event) {
    if (MOVE.up.has(event.code)) held.up = false;
    else if (MOVE.down.has(event.code)) held.down = false;
    else if (MOVE.left.has(event.code)) held.left = false;
    else if (MOVE.right.has(event.code)) held.right = false;
    else if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') held.run = false;
  }

  function menuEdge(event) {
    if (event.repeat) return;
    if (MOVE.up.has(event.code)) actions |= ACTION_MENU_UP;
    else if (MOVE.down.has(event.code)) actions |= ACTION_MENU_DOWN;
  }

  window.addEventListener('keydown', keyDown);
  window.addEventListener('keydown', menuEdge);
  window.addEventListener('keyup', keyUp);
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.run = false;
    mouse.down = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    mouse.down = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouse.down = false;
  });
  window.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.moved = true;
  });

  return {
    held,
    mouse,
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** -1, 0 or 1 on each axis, from the held movement keys. */
    move() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
  };
}
