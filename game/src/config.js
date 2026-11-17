// EMBERLINE — every tuning number, colour and the track itself in one place.
// The playfield is a fixed 1280x720 logical area (16x9 tiles of 80px); the renderer
// scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720, cols: 16, rows: 9, tile: 80 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Score that wins the game: light the furnaces until dawn breaks. */
export const WIN_SCORE = 2000;

export const TRAIN = {
  /** Tiles per second at wave 1. */
  speed: 2.2,
  speedPerWave: 0.18,
  maxSpeed: 3.4,
  /** Speed multiplier while stoking (Space held). */
  stokeSpeed: 1.6,
  /** Seconds a bandit ambush halts the train. */
  haltSeconds: 1.5,
  /** Seconds of grace after an ember dies before it can die again. */
  graceSeconds: 2,
};

export const EMBER = {
  max: 100,
  start: 70,
  /** Heat lost per second while rolling. */
  decay: 3.4,
  /** Extra heat lost per second while stoking. */
  stokeDecay: 1.4,
  /** Heat regained by rolling over a coal pile. */
  coalHeat: 25,
  /** Seconds before a spent coal pile comes back. */
  coalRespawn: 6,
  /** Heat regained by delivering an ember to a lit furnace. */
  furnaceHeat: 5,
  /** Heat lost when the train smashes a bandit while stoked. */
  smashCost: 2,
};

export const FURNACE = {
  /** Points for one delivery, before the combo multiplier. */
  basePoints: 80,
  /** Each consecutive delivery without an ember death adds 15% (cap x2). */
  comboStep: 0.15,
  comboCap: 2,
  /** Seconds a delivered furnace stays dark before it calls for ember again. */
  cooldown: 16,
};

export const BANDIT = {
  /** Points for smashing a bandit while stoked. */
  smashPoints: 10,
  /** Seconds between spawns at wave 1; shortens each wave. */
  interval: 8,
  intervalPerWave: 0.6,
  minInterval: 3.5,
  /** Most bandits on the line at once at wave 1; +1 per wave. */
  maxStart: 2,
  maxCap: 4,
};

/** Deliveries per wave: wave = 1 + floor(deliveries / 4). */
export const WAVE = { deliveriesPerWave: 4 };

export const LIVES = 3;

/** The track: a closed loop plus three switchable spurs. Tiles are [col, row]. */
const LOOP = [
  [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],
  [13, 2], [13, 3], [13, 4], [13, 5], [13, 6], [13, 7],
  [12, 7], [11, 7], [10, 7], [9, 7], [8, 7], [7, 7], [6, 7], [5, 7], [4, 7], [3, 7], [2, 7],
  [2, 6], [2, 5], [2, 4], [2, 3], [2, 2],
];
// Spurs: [junctionTile, spurTiles..., rejoinTile]. The switch at the junction chooses
// the spur instead of the loop's next tile; the spur's last tile leads back to the loop.
const SPURS = [
  { junction: [13, 1], tiles: [[14, 1], [15, 1], [15, 2], [15, 3], [14, 3]], rejoin: [13, 3], switchIndex: 0, station: 'coal' },
  { junction: [2, 7], tiles: [[1, 7], [0, 7], [0, 6], [0, 5], [1, 5]], rejoin: [2, 5], switchIndex: 1, station: 'furnaceA' },
  { junction: [7, 1], tiles: [[7, 0], [8, 0], [9, 0]], rejoin: [9, 1], switchIndex: 2, station: 'furnaceB' },
];

const key = (tile) => `${tile[0]},${tile[1]}`;

/** TRACK: key "x,y" -> { next: [x,y], spur: [x,y] | null, junction: -1 | 0 | 1 | 2 }. */
export const TRACK = new Map();
for (let i = 0; i < LOOP.length; i += 1) {
  const tile = LOOP[i];
  const next = LOOP[(i + 1) % LOOP.length];
  TRACK.set(key(tile), { next, spur: null, junction: -1 });
}
for (const spur of SPURS) {
  const junctionTile = TRACK.get(key(spur.junction));
  junctionTile.spur = spur.tiles[0];
  junctionTile.junction = spur.switchIndex;
  for (let i = 0; i < spur.tiles.length; i += 1) {
    const tile = spur.tiles[i];
    const next = i + 1 < spur.tiles.length ? spur.tiles[i + 1] : spur.rejoin;
    TRACK.set(key(tile), { next, spur: null, junction: -1 });
  }
}

/** Stations by tile key: coal piles and furnaces the train serves. */
export const STATIONS = {
  '15,2': { kind: 'coal', label: 'Coal Yard' },
  '10,7': { kind: 'coal', label: 'Coal Yard' },
  '0,6': { kind: 'furnace', id: 'A', label: 'Furnace A' },
  '8,0': { kind: 'furnace', id: 'B', label: 'Furnace B' },
};

/** Tiles a bandit may spawn on: loop tiles that are not junctions or stations. */
export const BANDIT_TILES = LOOP.filter((tile) => {
  const node = TRACK.get(key(tile));
  if (node.junction >= 0) return false;
  if (STATIONS[key(tile)]) return false;
  return true;
});

export const SWITCH_LABELS = ['1', '2', '3'];
export const SWITCH_NAMES = ['Coal Spur', 'Furnace A Spur', 'Furnace B Spur'];

export const PALETTE = {
  backdrop: '#0a0d13',
  skyTop: '#0d1322',
  skyBottom: '#0a0d13',
  ground: '#10141d',
  grid: 'rgba(255,255,255,0.035)',
  mountain: '#0e1420',
  ballast: '#171c28',
  tie: '#232a3a',
  rail: '#4a5468',
  railLight: '#7d8aa5',
  player: '#f5a524',
  emberHot: '#ffd166',
  emberMid: '#ff7a1a',
  emberLow: '#c1440e',
  coal: '#1c1f26',
  coalGlint: '#f5a524',
  furnace: '#3a2a22',
  furnaceBrick: '#4a3428',
  flame: '#ffb020',
  flameCore: '#ffe08a',
  bandit: '#14161c',
  banditRed: '#e5484d',
  panel: 'rgba(255,255,255,0.045)',
  panelBorder: 'rgba(255,255,255,0.09)',
  text: '#eef1f5',
  muted: '#8b93a3',
  accent: '#f5a524',
  good: '#34d399',
  bad: '#f87171',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'emberline.best';
