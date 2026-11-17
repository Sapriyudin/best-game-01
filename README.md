# Emberline — Keep the Fire Moving

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/Sapriyudin/best-game-01/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/Sapriyudin/best-game-01/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![Node](https://img.shields.io/badge/node-22-green)](https://nodejs.org/)

A night-train routing game: **one train, one dying ember, three switches**. Route the
train around its loop, flip the switches to send it down the coal spur and the furnace
spurs, and keep the ember alive long enough to light the furnaces and reach dawn.

Built for the make.fun bounty
[Make the best game](https://make.fun/bounty/best-game-01) ($1,000).

## How it plays

The train drives itself around a loop. You route it.

- **Heat is the clock.** The ember burns 3.4 heat a second, faster while stoking.
  At 0 the ember dies and you lose one of 3 embers.
- **Coal restores heat** (+25). One pile sits on the loop; a second hides behind
  switch 1's spur.
- **Furnaces pay points.** A lit furnace pays 80 points times your combo (up to x2)
  and a little heat, then goes dark for 16 seconds. Reach **2000 points** and dawn
  breaks — you win.
- **Bandits halt the train.** A bandit on the loop stops you for 1.5 seconds while
  the ember keeps burning. Dodge one by taking a spur around it, or hold **Space**
  to stoke and smash straight through it.
- **Waves.** Every 4 deliveries the night deepens: the train gets faster and the
  bandits come more often.

## Controls

| Input | Does |
| --- | --- |
| `1` / `2` / `3` or click a junction | Flip that switch (loop ↔ spur) |
| `Space` (hold) | Stoke: faster, smashes bandits, burns heat faster |
| `P` / `Esc` | Pause |
| `M` | Mute |
| `Space` / `Enter` / click | Start, restart |

No network, no libraries: plain HTML + canvas + WebAudio, all vendored under `game/`.
The simulation runs at a fixed 60 steps a second, separate from rendering, and the
screenshots in `screenshots/` are real frames staged by the game's own autopilot
(`?shot=start|play|wave|end&seed=7`).

## Verified

- Headless simulation: a routing autopilot wins in ~3 minutes (15 deliveries, wave 4,
  one ember lost); a reckless autopilot (always stoking, never switching) dies in
  ~80 seconds; an idle train dies in ~3 minutes. The game is winnable with skill
  and punishes careless play.
- All four screenshots read and fixed by hand (sky/stars, edge labels, end-screen
  panel, wave banner).
- `node main.ts` builds `out/dossier.json` + `out/game` + `out/screenshots`.

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

## License

MIT — see [LICENSE](LICENSE).
