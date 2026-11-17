// The screenshot scenes behind ?shot=start|play|wave|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by an autopilot that
// reads the switches the way a player would — take the coal spur when the ember runs
// low, take a furnace spur when it is lit, take any spur to dodge a bandit on the
// loop ahead — so the frame is what a short game really looks like and the same seed
// always gives the same frame. The autopilot also shops between waves, so the play
// and end scenes show what a bought upgrade looks like in the dashboard.
import { FIELD, STEP, TRACK, UPGRADES } from './config.js';
import { EVENT_OVER, EVENT_WAVE } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_SHOP, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 40;
const WAVE_LIMIT_SECONDS = 240;
const END_LIMIT_SECONDS = 600;
const LOOKAHEAD = 6;

const key = (tile) => `${tile[0]},${tile[1]}`;

/** The loop tiles ahead of the train, in order, following the loop's `next`. */
function aheadTiles(state, count) {
  const out = [];
  let tile = state.train.tile;
  for (let i = 0; i < count; i += 1) {
    tile = TRACK.get(key(tile)).next;
    out.push(tile);
  }
  return out;
}

/** What the autopilot wants each switch to be when the train reaches it. */
function desiredSwitches(state) {
  const want = [null, null, null];
  const ahead = aheadTiles(state, LOOKAHEAD);
  for (let distance = 0; distance < ahead.length; distance += 1) {
    const node = TRACK.get(key(ahead[distance]));
    if (node.junction < 0) continue;
    const j = node.junction;
    // A bandit on the loop between this junction and the next one: dodge it.
    let banditAhead = false;
    const after = aheadTiles(state, LOOKAHEAD + 8).slice(distance + 1);
    for (const tile of after) {
      for (const bandit of state.bandits) {
        if (bandit.active && bandit.tile[0] === tile[0] && bandit.tile[1] === tile[1]) banditAhead = true;
      }
      if (TRACK.get(key(tile)).junction >= 0) break;
    }
    if (j === 0) {
      want[j] = state.heat < 50 || banditAhead;
    } else {
      const furnace = state.furnaces[j === 1 ? 'A' : 'B'];
      want[j] = (furnace.lit && state.heat > 28) || banditAhead;
    }
    break; // Only the nearest junction: decide it fresh as the train closes in.
  }
  return want;
}

export function autopilot(state, careless) {
  const want = careless ? [false, false, false] : desiredSwitches(state);
  let toggles = 0;
  for (let i = 0; i < 3; i += 1) {
    if (want[i] !== null && want[i] !== state.switches[i]) toggles |= 1 << i;
  }
  let stoke = false;
  if (!careless) {
    const ahead = aheadTiles(state, 3);
    for (const tile of ahead) {
      for (const bandit of state.bandits) {
        if (bandit.active && bandit.tile[0] === tile[0] && bandit.tile[1] === tile[1] && state.heat > 15) stoke = true;
      }
    }
    if (!stoke && state.heat < 30) {
      const near = aheadTiles(state, 5);
      for (const tile of near) {
        const k = key(tile);
        if (k === '15,2' || k === '10,7') stoke = true;
        if (k === '0,6' && state.furnaces.A.lit) stoke = true;
        if (k === '8,0' && state.furnaces.B.lit) stoke = true;
      }
    }
  } else {
    stoke = true; // Reckless: burn the ember out.
  }
  return { stoke, toggles };
}

/**
 * What the autopilot buys when the shop opens: insulation first (it slows the
 * burn every second of the run), then coal, then a spare ember — only when the
 * price leaves a buffer of points toward dawn, only in the early waves, and
 * at most three purchases a run. A run that buys more would take too long to
 * win; the sims in /tmp/sim are the check on that.
 */
const SHOP_PRIORITY = ['insulation', 'coal', 'ember'];
const SHOP_BUFFER = 150;
const SHOP_LAST_WAVE = 4;
const SHOP_MAX_BUYS = 3;

export function shopPolicy(state, purchases) {
  if (state.wave > SHOP_LAST_WAVE) return null;
  if (purchases >= SHOP_MAX_BUYS) return null;
  for (const id of SHOP_PRIORITY) {
    const track = UPGRADES.find((t) => t.id === id);
    const level = state.upgrades[id];
    if (level >= track.maxLevel) continue;
    const cost = track.costs[level];
    if (state.score - cost >= SHOP_BUFFER) return id;
  }
  return null;
}

/**
 * Set `world` to the named scene (start, play, wave or end; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'wave' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, { stoke: false, toggles: 0 }, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    let purchases = 0;
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, autopilot(world.state, false), false);
      if (events & EVENT_OVER) break;
      if (events & EVENT_WAVE) {
        const buy = shopPolicy(world.state, purchases);
        if (buy && world.buyUpgrade(buy)) purchases += 1;
      }
    }
    const over = world.state.lives === 0;
    return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
  }
  if (name === 'wave') {
    // Stop at the wave advance without buying: the frame is the shop itself,
    // its title carrying the wave moment.
    for (let index = 0; index < WAVE_LIMIT_SECONDS / STEP; index += 1) {
      const events = world.step(STEP, autopilot(world.state, false), false);
      if (events & EVENT_OVER) break;
      if (world.state.waveBanner > 0) break;
    }
    const over = world.state.lives === 0;
    return { screen: over ? SCREEN_OVER : SCREEN_SHOP, best: world.state.score };
  }
  // end: play well for a minute, then play recklessly until the ember dies.
  let purchases = 0;
  for (let index = 0; index < 60 / STEP; index += 1) {
    const events = world.step(STEP, autopilot(world.state, false), false);
    if (events & EVENT_OVER) break;
    if (events & EVENT_WAVE) {
      const buy = shopPolicy(world.state, purchases);
      if (buy && world.buyUpgrade(buy)) purchases += 1;
    }
  }
  for (let index = 0; index < END_LIMIT_SECONDS / STEP; index += 1) {
    if (world.step(STEP, autopilot(world.state, true), false) & EVENT_OVER) break;
  }
  const over = world.state.lives === 0;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY, best: world.state.score };
}

export { FIELD };
