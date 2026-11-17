// Keyboard and pointer input. The train drives itself; the player routes it.
// Held Space stokes the boiler. One-shot presses (start/restart, pause, mute,
// switch flips) are queued as bit flags and taken once by the loop, so a press
// between two frames is never lost and never counted twice. Clicking a junction
// tile flips that switch; clicking anywhere else confirms (start / restart).
import { FIELD, TRACK } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const SWITCH_KEYS = new Map([['Digit1', 0], ['Digit2', 1], ['Digit3', 2], ['Numpad1', 0], ['Numpad2', 1], ['Numpad3', 2]]);

const key = (tile) => `${tile[0]},${tile[1]}`;

export function createInput(target) {
  let stoke = false;
  let actions = 0;
  let toggles = 0;
  /** The last pointer press in field coordinates, for screens that need a
   * position (the shop's cards); consumed by takeClick(). */
  let click = null;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
      stoke = true;
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (SWITCH_KEYS.has(event.code)) {
      if (!event.repeat) toggles |= 1 << SWITCH_KEYS.get(event.code);
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') stoke = false;
  });
  // A key released while the tab is hidden never sends keyup: let go on blur.
  window.addEventListener('blur', () => {
    stoke = false;
  });

  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    const scale = Math.min(rect.width / FIELD.width, rect.height / FIELD.height);
    const ox = (rect.width - FIELD.width * scale) / 2;
    const oy = (rect.height - FIELD.height * scale) / 2;
    const fx = (event.clientX - rect.left - ox) / scale;
    const fy = (event.clientY - rect.top - oy) / scale;
    const tile = [Math.floor(fx / FIELD.tile), Math.floor(fy / FIELD.tile)];
    click = { x: fx, y: fy };
    const node = TRACK.get(key(tile));
    if (node && node.junction >= 0) {
      toggles |= 1 << node.junction;
    } else {
      actions |= ACTION_CONFIRM;
    }
  });

  return {
    /** True while Space is held. */
    stoke() {
      return stoke;
    },
    /** The last pointer press in field coordinates, or null if none since
     * the last call. */
    takeClick() {
      const taken = click;
      click = null;
      return taken;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The switch flips since the last call, as a bitmask (bit i = switch i). */
    takeToggles() {
      const taken = toggles;
      toggles = 0;
      return taken;
    },
  };
}
