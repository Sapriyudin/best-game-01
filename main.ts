// Emberline — the entrypoint for best-game-01 (Node 22, standard library only).
// The game itself lives in game/ as plain static files a desktop browser loads
// offline (index.html plus its ES modules, no library, no network request). This
// program hands it in: it copies game/ and screenshots/ from beside this file to
// /output and writes /output/dossier.json, the summary the judge reads, with the
// vendored make.fun library. It also checks the entry's own caps before handing
// anything in — at most four screenshots, each at most 256 KiB — so a bad build
// fails here, loudly, instead of at the scorer.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The scorer's own caps (reference/gate.json): more than four screenshots, or one
 * over 256 KiB, is an entry the scorer would refuse. */
const MAX_SCREENSHOTS = 4;
const MAX_SCREENSHOT_BYTES = 262144;

function fail(message) {
  console.error(`emberline: ${message}`);
  process.exit(1);
}

// 1. The playable game, copied whole.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });

// 2. The screenshots: real frames of the game, the first by name is the cover.
const shotsDir = join(repoRoot, 'screenshots');
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  const shots = readdirSync(shotsDir)
    .filter((name) => /\.(png|jpe?g)$/i.test(name))
    .sort();
  if (shots.length === 0) fail('no screenshots in screenshots/');
  if (shots.length > MAX_SCREENSHOTS) fail(`${shots.length} screenshots, at most ${MAX_SCREENSHOTS}`);
  for (const shot of shots) {
    const bytes = statSync(join(shotsDir, shot)).size;
    if (bytes > MAX_SCREENSHOT_BYTES) fail(`${shot} is ${bytes} bytes, over the 256 KiB cap`);
  }
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
  console.log(`emberline: ${shots.length} screenshots, cover is ${shots[0]}`);
}

// 3. The dossier the judge reads: the source outline plus the screenshots.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: MAX_SCREENSHOTS, max_bytes: MAX_SCREENSHOT_BYTES },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
console.log(`emberline: wrote ${join(outputDir, 'dossier.json')}`);
