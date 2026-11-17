// The game's rules and state, with no drawing and no browser in it: the train on its
// track, the ember's heat, coal piles, furnaces, bandits, switches, score, lives and
// waves. step() advances one fixed step and returns what happened as bit flags, so the
// caller can react without the world knowing about screens or sound. Nothing here
// allocates after createWorld returns (the history ring reuses its slots).
import {
  BANDIT, BANDIT_TILES, EMBER, FIELD, FURNACE, LIVES, STATIONS, TRACK, TRAIN, UPGRADE_EFFECT, UPGRADES, WAVE, WIN_SCORE,
} from './config.js';

export const EVENT_HIT = 1;
export const EVENT_COIN = 2;
export const EVENT_OVER = 4;
export const EVENT_WIN = 8;
export const EVENT_WAVE = 16;
export const EVENT_SMASH = 32;
export const EVENT_COAL = 64;

const key = (tile) => `${tile[0]},${tile[1]}`;
const tileCenter = (tile) => ({ x: (tile[0] + 0.5) * FIELD.tile, y: (tile[1] + 0.5) * FIELD.tile });
const sameTile = (a, b) => a[0] === b[0] && a[1] === b[1];

/** Tiles ahead of the train along the loop, in order, for bandit spawns. */
function tilesAhead(train, count) {
  const out = [];
  let tile = train.tile;
  for (let i = 0; i < count; i += 1) {
    const node = TRACK.get(key(tile));
    tile = node.next;
    out.push(tile);
  }
  return out;
}

export function createWorld(random) {
  const state = {
    train: { tile: [2, 1], next: [3, 1], t: 0, dir: [1, 0], halt: 0, grace: 0 },
    heat: EMBER.start,
    score: 0,
    lives: LIVES,
    combo: 0,
    deliveries: 0,
    wave: 1,
    elapsed: 0,
    switches: [false, false, false],
    stoked: false,
    won: false,
    waveBanner: 0,
    banditTimer: BANDIT.interval,
    coal: {},
    furnaces: { A: { lit: true, timer: 0 }, B: { lit: true, timer: 0 } },
    bandits: [],
    popups: [],
    history: [],
    /** Between-wave shop: levels bought, embers the train can still lose, and
     * whether the shop is open (the loop freezes while it is). */
    upgrades: { coal: 0, insulation: 0, ember: 0 },
    maxLives: LIVES,
    shopOpen: false,
  };
  for (let i = 0; i < BANDIT.maxCap; i += 1) state.bandits.push({ active: false, tile: [0, 0] });
  for (const popup of []) state.popups.push(popup);
  for (let i = 0; i < 8; i += 1) state.popups.push({ active: false, x: 0, y: 0, text: '', color: '', ttl: 0 });
  for (const tileKey of Object.keys(STATIONS)) {
    if (STATIONS[tileKey].kind === 'coal') state.coal[tileKey] = { available: true, timer: 0 };
  }

  function reset() {
    state.train.tile = [2, 1];
    state.train.next = [3, 1];
    state.train.t = 0;
    state.train.dir = [1, 0];
    state.train.halt = 0;
    state.train.grace = 0;
    state.heat = EMBER.start;
    state.score = 0;
    state.lives = LIVES;
    state.maxLives = LIVES;
    state.upgrades = { coal: 0, insulation: 0, ember: 0 };
    state.shopOpen = false;
    state.combo = 0;
    state.deliveries = 0;
    state.wave = 1;
    state.elapsed = 0;
    state.switches = [false, false, false];
    state.stoked = false;
    state.won = false;
    state.waveBanner = 0;
    state.banditTimer = BANDIT.interval;
    for (const tileKey of Object.keys(state.coal)) state.coal[tileKey] = { available: true, timer: 0 };
    state.furnaces = { A: { lit: true, timer: 0 }, B: { lit: true, timer: 0 } };
    for (const bandit of state.bandits) bandit.active = false;
    for (const popup of state.popups) popup.active = false;
    state.history.length = 0;
  }

  function popup(x, y, text, color) {
    for (const slot of state.popups) {
      if (slot.active) continue;
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.text = text;
      slot.color = color;
      slot.ttl = 1.4;
      return;
    }
  }

  function freeBandit() {
    for (const bandit of state.bandits) if (!bandit.active) return bandit;
    return null;
  }

  function spawnBandit() {
    const maxActive = Math.min(BANDIT.maxCap, BANDIT.maxStart + state.wave - 1);
    let active = 0;
    for (const bandit of state.bandits) if (bandit.active) active += 1;
    if (active >= maxActive) return;
    const ahead = tilesAhead(state.train, 14);
    const candidates = [];
    for (let i = 4; i < ahead.length; i += 1) {
      const tile = ahead[i];
      if (!BANDIT_TILES.some((t) => sameTile(t, tile))) continue;
      let occupied = false;
      for (const bandit of state.bandits) if (bandit.active && sameTile(bandit.tile, tile)) occupied = true;
      if (!occupied) candidates.push(tile);
    }
    if (candidates.length === 0) return;
    const bandit = freeBandit();
    if (bandit === null) return;
    bandit.active = true;
    bandit.tile = candidates[Math.floor(random() * candidates.length)];
  }

  /** Heat lost per second, after the insulation upgrades. */
  function heatDecay() {
    return Math.max(1.8, EMBER.decay - UPGRADE_EFFECT.decayPerLevel * state.upgrades.insulation);
  }

  /** Heat a coal pile restores, after the coal-wagon upgrades. */
  function coalHeat() {
    return EMBER.coalHeat + UPGRADE_EFFECT.coalHeatPerLevel * state.upgrades.coal;
  }

  /**
   * The shop's current offers: each track with its level, the cost of the
   * next level (null when maxed), and whether the player can afford it.
   */
  function shopOffers() {
    return UPGRADES.map((track) => {
      const level = state.upgrades[track.id];
      const cost = level >= track.maxLevel ? null : track.costs[level];
      return {
        id: track.id,
        name: track.name,
        desc: track.desc,
        level,
        maxLevel: track.maxLevel,
        cost,
        affordable: cost !== null && state.score >= cost,
      };
    });
  }

  /**
   * Buy one upgrade: deduct its cost from the score (points spent do not
   * count toward the win) and apply it. Returns true when the purchase
   * happened; a failed purchase changes nothing. Buying closes the shop.
   */
  function buyUpgrade(id) {
    const track = UPGRADES.find((t) => t.id === id);
    if (!track) return false;
    const level = state.upgrades[id];
    if (level >= track.maxLevel) return false;
    const cost = track.costs[level];
    if (state.score < cost) return false;
    state.score -= cost;
    state.upgrades[id] = level + 1;
    if (id === 'ember') {
      state.maxLives += 1;
      state.lives = Math.min(state.maxLives, state.lives + 1);
    }
    state.shopOpen = false;
    return true;
  }

  /** Leave the shop without buying. */
  function closeShop() {
    state.shopOpen = false;
  }

  function trainSpeed() {
    const base = Math.min(TRAIN.maxSpeed, TRAIN.speed + TRAIN.speedPerWave * (state.wave - 1));
    return base * (state.stoked ? TRAIN.stokeSpeed : 1);
  }

  function trainPosition() {
    const from = tileCenter(state.train.tile);
    const to = tileCenter(state.train.next);
    const t = state.train.t;
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
  }

  function arrive(tile) {
    const station = STATIONS[key(tile)];
    const centre = tileCenter(tile);
    if (station && station.kind === 'coal') {
      const pile = state.coal[key(tile)];
      if (pile.available) {
        pile.available = false;
        pile.timer = EMBER.coalRespawn;
        const heat = coalHeat();
        state.heat = Math.min(EMBER.max, state.heat + heat);
        popup(centre.x, centre.y - 30, `+${heat} HEAT`, '#ffd166');
        return EVENT_COAL;
      }
    }
    if (station && station.kind === 'furnace') {
      const furnace = state.furnaces[station.id];
      if (furnace.lit) {
        furnace.lit = false;
        furnace.timer = FURNACE.cooldown;
        const mult = Math.min(FURNACE.comboCap, 1 + FURNACE.comboStep * state.combo);
        const points = Math.round(FURNACE.basePoints * mult);
        state.score += points;
        state.combo += 1;
        state.deliveries += 1;
        state.heat = Math.min(EMBER.max, state.heat + EMBER.furnaceHeat);
        popup(centre.x, centre.y - 30, `+${points}`, '#34d399');
        return EVENT_COIN;
      }
    }
    for (const bandit of state.bandits) {
      if (!bandit.active || !sameTile(bandit.tile, tile)) continue;
      bandit.active = false;
      if (state.stoked) {
        state.score += BANDIT.smashPoints;
        state.heat = Math.max(0, state.heat - EMBER.smashCost);
        popup(centre.x, centre.y - 30, `SMASHED +${BANDIT.smashPoints}`, '#f5a524');
        return EVENT_SMASH;
      }
      state.train.halt = TRAIN.haltSeconds;
      popup(centre.x, centre.y - 30, 'AMBUSHED!', '#f87171');
      return EVENT_HIT;
    }
    return 0;
  }

  /**
   * One fixed step. `input` is { stoke: boolean, toggles: bitmask of switch flips }.
   * With `harmless` set (the title screen's backdrop) the train rolls but nothing
   * burns, scores or attacks: no heat decay, no stations, no bandits.
   */
  function step(dt, input, harmless) {
    let events = 0;
    state.elapsed += dt;
    if (input && input.toggles) {
      for (let i = 0; i < 3; i += 1) {
        if (input.toggles & (1 << i)) state.switches[i] = !state.switches[i];
      }
      // Consumed: several fixed steps share one frame's input, and a flip applied
      // twice would cancel itself.
      input.toggles = 0;
    }
    state.stoked = Boolean(input && input.stoke);

    const wave = 1 + Math.floor(state.deliveries / WAVE.deliveriesPerWave);
    if (wave !== state.wave) {
      state.wave = wave;
      state.waveBanner = 2;
      // The wave advance pauses the run for the between-wave shop: the caller
      // opens the shop on EVENT_WAVE and the world stays frozen until it
      // closes (buyUpgrade or closeShop), so no heat burns while choosing.
      state.shopOpen = true;
      events |= EVENT_WAVE;
    }
    if (state.waveBanner > 0) state.waveBanner -= dt;
    if (state.train.grace > 0) state.train.grace -= dt;

    // Heat always burns while the train rolls; a halted train burns too.
    if (!harmless) {
      state.heat -= (heatDecay() + (state.stoked ? EMBER.stokeDecay : 0)) * dt;
      if (state.heat <= 0 && state.train.grace <= 0) {
        state.heat = 0;
        state.lives -= 1;
        state.combo = 0;
        events |= EVENT_HIT;
        if (state.lives <= 0) {
          events |= EVENT_OVER;
          return events;
        }
        state.heat = EMBER.start;
        state.train.grace = TRAIN.graceSeconds;
        const pos = trainPosition();
        popup(pos.x, pos.y - 40, 'EMBER DIED', '#f87171');
      }
    }

    if (state.train.halt > 0) {
      state.train.halt -= dt;
    } else {
      state.train.t += trainSpeed() * dt;
      while (state.train.t >= 1) {
        state.train.t -= 1;
        state.train.tile = state.train.next;
        const node = TRACK.get(key(state.train.tile));
        let next = node.next;
        if (node.junction >= 0 && state.switches[node.junction] && node.spur) next = node.spur;
        state.train.next = next;
        state.train.dir = [next[0] - state.train.tile[0], next[1] - state.train.tile[1]];
        if (!harmless) events |= arrive(state.train.tile);
        if (events & EVENT_OVER) return events;
      }
    }

    // Record the train's centre for the trailing wagons.
    const pos = trainPosition();
    const angle = Math.atan2(state.train.dir[1], state.train.dir[0]);
    state.history.push({ x: pos.x, y: pos.y, angle });
    if (state.history.length > 120) state.history.splice(0, state.history.length - 120);

    if (!harmless) {
      for (const tileKey of Object.keys(state.coal)) {
        const pile = state.coal[tileKey];
        if (!pile.available) {
          pile.timer -= dt;
          if (pile.timer <= 0) pile.available = true;
        }
      }
      for (const id of ['A', 'B']) {
        const furnace = state.furnaces[id];
        if (!furnace.lit) {
          furnace.timer -= dt;
          if (furnace.timer <= 0) furnace.lit = true;
        }
      }
      state.banditTimer -= dt;
      if (state.banditTimer <= 0) {
        spawnBandit();
        state.banditTimer = Math.max(BANDIT.minInterval, BANDIT.interval - BANDIT.intervalPerWave * (state.wave - 1));
      }
    }

    for (const slot of state.popups) {
      if (!slot.active) continue;
      slot.ttl -= dt;
      slot.y -= 24 * dt;
      if (slot.ttl <= 0) slot.active = false;
    }

    if (!state.won && state.score >= WIN_SCORE) {
      state.won = true;
      events |= EVENT_WIN;
    }
    return events;
  }

  /** Test hook for the screenshot scenes: put a bandit on a chosen tile. */
  function placeBanditAt(tile) {
    const bandit = freeBandit();
    if (bandit === null) return false;
    bandit.active = true;
    bandit.tile = tile;
    return true;
  }

  function setSwitch(index, value) {
    state.switches[index] = value;
  }

  reset();
  return { state, reset, step, placeBanditAt, setSwitch, trainPosition, buyUpgrade, closeShop, shopOffers };
}
