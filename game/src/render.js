// Drawing only: the world's state and the current screen in, pixels out. The 1280x720
// playfield is scaled to fit the window and centred. The train's loop encloses a wide
// empty yard, and the HUD lives there as a glass dashboard — score, heat, waves,
// furnaces, switches — so no track is ever covered by chrome. Flat shapes, canvas
// text, one amber accent on a dark blue-grey night. Numbers are tabular.
import { FIELD, FONT, FURNACE, PALETTE, STATIONS, SWITCH_LABELS, SWITCH_NAMES, TRACK, UPGRADES, WIN_SCORE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';
export const SCREEN_SHOP = 'shop';

const TILE = FIELD.tile;
const key = (tile) => `${tile[0]},${tile[1]}`;
const centre = (tile) => ({ x: (tile[0] + 0.5) * TILE, y: (tile[1] + 0.5) * TILE });

/** The dashboard panel in the loop's eye: x, y, width, height. */
const DASH = { x: 288, y: 196, w: 704, h: 360 };

/**
 * The between-wave shop panel and its three cards, in field coordinates.
 * shopCardAt() answers which card a field point falls on (-1 for none).
 */
const SHOP = { x: 200, y: 150, w: 880, h: 420 };
const SHOP_CARDS = [
  { x: SHOP.x + 24, y: SHOP.y + 148, w: 264, h: 196 },
  { x: SHOP.x + 308, y: SHOP.y + 148, w: 264, h: 196 },
  { x: SHOP.x + 592, y: SHOP.y + 148, w: 264, h: 196 },
];

export function shopCardAt(x, y) {
  for (let i = 0; i < SHOP_CARDS.length; i += 1) {
    const card = SHOP_CARDS[i];
    if (x >= card.x && x <= card.x + card.w && y >= card.y && y <= card.y + card.h) return i;
  }
  return -1;
}

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const scoreLabel = cachedLabel('');
  const bestLabel = cachedLabel('BEST ');
  const waveLabel = cachedLabel('WAVE ');
  const delivLabel = cachedLabel('');

  // A fixed starfield, seeded once so screenshots are repeatable.
  let seed = 123456789;
  const stars = [];
  for (let i = 0; i < 70; i += 1) {
    seed = (seed * 1664525 + 1013904223) | 0;
    const x = ((seed >>> 0) % 1280);
    seed = (seed * 1664525 + 1013904223) | 0;
    const y = ((seed >>> 0) % 560);
    seed = (seed * 1664525 + 1013904223) | 0;
    const r = 0.6 + (((seed >>> 0) % 100) / 100) * 1.1;
    stars.push({ x, y, r });
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / FIELD.width, height / FIELD.height);
    view.x = (width - FIELD.width * view.scale) / 2;
    view.y = (height - FIELD.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function rr(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawSky() {
    const grad = context.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, PALETTE.skyTop);
    grad.addColorStop(1, PALETTE.skyBottom);
    context.fillStyle = grad;
    context.fillRect(0, 0, FIELD.width, FIELD.height);
    context.fillStyle = 'rgba(255,255,255,0.5)';
    for (const star of stars) {
      context.globalAlpha = 0.25 + (star.r - 0.6) * 0.5;
      context.fillRect(star.x, star.y, star.r, star.r);
    }
    context.globalAlpha = 1;
    // A low moon, top-left, out of the train's way.
    context.fillStyle = '#e8ecf4';
    context.beginPath();
    context.arc(96, 44, 22, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#c9d2e0';
    context.beginPath();
    context.arc(88, 38, 5, 0, Math.PI * 2);
    context.arc(102, 52, 3.5, 0, Math.PI * 2);
    context.fill();
  }

  function drawGround() {
    // No opaque fill here: the sky gradient, stars and moon stay visible through
    // the grid. The field reads as night ground, not a painted board.
    context.strokeStyle = PALETTE.grid;
    context.lineWidth = 1;
    context.beginPath();
    for (let x = 0; x <= FIELD.width; x += TILE) {
      context.moveTo(x, 0);
      context.lineTo(x, FIELD.height);
    }
    for (let y = 0; y <= FIELD.height; y += TILE) {
      context.moveTo(0, y);
      context.lineTo(FIELD.width, y);
    }
    context.stroke();
  }

  function drawRails() {
    // Ballast under every track tile.
    context.fillStyle = PALETTE.ballast;
    for (const tileKey of TRACK.keys()) {
      const [x, y] = tileKey.split(',').map(Number);
      context.fillRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
    }
    // One rail segment per tile (centre to its next centre), plus the spur segment
    // out of each junction.
    function segment(a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      const ux = dx / len;
      const uy = dy / len;
      const px = -uy;
      const py = ux;
      context.strokeStyle = PALETTE.tie;
      context.lineWidth = 5;
      context.beginPath();
      for (const t of [0.2, 0.45, 0.7, 0.95]) {
        const cx = a.x + dx * t;
        const cy = a.y + dy * t;
        context.moveTo(cx - px * 11, cy - py * 11);
        context.lineTo(cx + px * 11, cy + py * 11);
      }
      context.stroke();
      context.strokeStyle = PALETTE.railLight;
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(a.x + px * 6, a.y + py * 6);
      context.lineTo(b.x + px * 6, b.y + py * 6);
      context.moveTo(a.x - px * 6, a.y - py * 6);
      context.lineTo(b.x - px * 6, b.y - py * 6);
      context.stroke();
    }
    for (const [tileKey, node] of TRACK) {
      const [x, y] = tileKey.split(',').map(Number);
      const from = centre([x, y]);
      segment(from, centre(node.next));
      if (node.spur) segment(from, centre(node.spur));
    }
  }

  function drawStations(state, time) {
    for (const tileKey of Object.keys(STATIONS)) {
      const station = STATIONS[tileKey];
      const [x, y] = tileKey.split(',').map(Number);
      const c = centre([x, y]);
      // Labels must not run off the field's edge: edge stations align inward
      // with a real margin, so the whole label stays inside the frame.
      const align = c.x < 70 ? 'left' : c.x > FIELD.width - 70 ? 'right' : 'center';
      const lx = align === 'left' ? 18 : align === 'right' ? FIELD.width - 18 : c.x;
      if (station.kind === 'coal') {
        const pile = state.coal[tileKey];
        context.fillStyle = PALETTE.coal;
        context.beginPath();
        context.arc(c.x - 14, c.y + 8, 14, 0, Math.PI * 2);
        context.arc(c.x + 12, c.y + 10, 12, 0, Math.PI * 2);
        context.arc(c.x, c.y - 4, 15, 0, Math.PI * 2);
        context.fill();
        if (pile.available) {
          context.fillStyle = PALETTE.coalGlint;
          context.beginPath();
          context.arc(c.x - 8, c.y - 8, 2.5, 0, Math.PI * 2);
          context.arc(c.x + 6, c.y - 2, 2.5, 0, Math.PI * 2);
          context.arc(c.x + 14, c.y + 6, 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillStyle = PALETTE.muted;
          context.font = `11px ${FONT}`;
          context.textAlign = align;
          context.fillText(`${Math.ceil(pile.timer)}s`, lx, c.y + 26);
        }
        text('COAL', lx, c.y + 38, 10, PALETTE.muted, align);
      } else {
        const furnace = state.furnaces[station.id];
        // Kiln body.
        context.fillStyle = PALETTE.furnaceBrick;
        rr(c.x - 30, c.y - 22, 60, 46, 8);
        context.fill();
        context.fillStyle = PALETTE.furnace;
        rr(c.x - 30, c.y + 8, 60, 16, 6);
        context.fill();
        // Chimney.
        context.fillStyle = PALETTE.furnaceBrick;
        context.fillRect(c.x + 14, c.y - 36, 12, 16);
        if (furnace.lit) {
          // Flame in the kiln mouth, flickering.
          const flick = 1 + 0.18 * Math.sin(time * 7 + c.x) + 0.1 * Math.sin(time * 13);
          const glow = context.createRadialGradient(c.x, c.y - 2, 2, c.x, c.y - 2, 34 * flick);
          glow.addColorStop(0, PALETTE.flameCore);
          glow.addColorStop(0.55, PALETTE.flame);
          glow.addColorStop(1, 'rgba(255,122,26,0)');
          context.fillStyle = glow;
          context.beginPath();
          context.arc(c.x, c.y - 2, 34 * flick, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = PALETTE.flameCore;
          context.beginPath();
          context.arc(c.x, c.y + 2, 9 * flick, 0, Math.PI * 2);
          context.fill();
          text(`FURNACE ${station.id}`, lx, c.y + 40, 11, PALETTE.flame, align);
          text('LIT — DELIVER', lx, c.y + 54, 9, PALETTE.good, align);
        } else {
          // Dark kiln, cooling down.
          context.fillStyle = 'rgba(139,147,163,0.5)';
          context.beginPath();
          context.arc(c.x - 8, c.y - 30, 4, 0, Math.PI * 2);
          context.arc(c.x + 2, c.y - 40, 5, 0, Math.PI * 2);
          context.fill();
          text(`FURNACE ${station.id}`, lx, c.y + 40, 11, PALETTE.muted, align);
          text(`DARK ${Math.ceil(furnace.timer)}s`, lx, c.y + 54, 9, PALETTE.muted, align);
        }
      }
    }
    // Switch levers on the junction tiles.
    for (const [tileKey, node] of TRACK) {
      if (node.junction < 0) continue;
      const [x, y] = tileKey.split(',').map(Number);
      const c = centre([x, y]);
      const spurOn = state.switches[node.junction];
      context.fillStyle = 'rgba(10,13,19,0.85)';
      rr(c.x - 26, c.y + 18, 52, 20, 10);
      context.fill();
      context.strokeStyle = spurOn ? PALETTE.accent : PALETTE.muted;
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = spurOn ? PALETTE.accent : PALETTE.text;
      context.font = `bold 12px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(`${SWITCH_LABELS[node.junction]} ${spurOn ? 'SPUR' : 'LOOP'}`, c.x, c.y + 29);
      context.textBaseline = 'alphabetic';
    }
  }

  function drawBandits(state, time) {
    for (const bandit of state.bandits) {
      if (!bandit.active) continue;
      const c = centre(bandit.tile);
      const bob = Math.sin(time * 5 + bandit.tile[0]) * 2;
      context.fillStyle = PALETTE.bandit;
      context.beginPath();
      context.arc(c.x, c.y - 6 + bob, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.banditRed;
      context.fillRect(c.x - 11, c.y - 12 + bob, 22, 6);
      context.fillStyle = '#e8ecf4';
      context.beginPath();
      context.arc(c.x - 4, c.y - 7 + bob, 1.8, 0, Math.PI * 2);
      context.arc(c.x + 4, c.y - 7 + bob, 1.8, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCar(x, y, angle, kind, heat, time) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    if (kind === 'loco') {
      context.fillStyle = '#2b3242';
      rr(-30, -15, 60, 30, 8);
      context.fill();
      context.fillStyle = '#39415a';
      rr(-18, -19, 30, 8, 4);
      context.fill();
      context.fillStyle = PALETTE.accent;
      context.fillRect(-14, -9, 10, 7);
      context.fillRect(2, -9, 10, 7);
      // Headlamp.
      context.fillStyle = '#ffe08a';
      context.beginPath();
      context.arc(30, 0, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#2b3242';
      context.beginPath();
      context.moveTo(30, -12);
      context.lineTo(40, 0);
      context.lineTo(30, 12);
      context.closePath();
      context.fill();
    } else if (kind === 'ember') {
      context.fillStyle = '#232a3a';
      rr(-24, -13, 48, 26, 6);
      context.fill();
      const glowR = 16 + (heat / 100) * 14 + Math.sin(time * 6) * 2;
      const glow = context.createRadialGradient(0, 0, 2, 0, 0, glowR);
      const hot = heat > 50 ? PALETTE.emberHot : heat > 25 ? PALETTE.emberMid : PALETTE.emberLow;
      glow.addColorStop(0, hot);
      glow.addColorStop(1, 'rgba(255,122,26,0)');
      context.fillStyle = glow;
      context.beginPath();
      context.arc(0, 0, glowR, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = hot;
      context.beginPath();
      context.arc(-8, 2, 6, 0, Math.PI * 2);
      context.arc(6, -2, 7, 0, Math.PI * 2);
      context.arc(10, 4, 5, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = '#232a3a';
      rr(-24, -13, 48, 26, 6);
      context.fill();
      context.fillStyle = PALETTE.coal;
      context.beginPath();
      context.arc(-8, 0, 9, 0, Math.PI * 2);
      context.arc(8, 0, 9, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = PALETTE.coalGlint;
      context.beginPath();
      context.arc(-10, -3, 1.8, 0, Math.PI * 2);
      context.arc(8, -4, 1.8, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawTrain(state, time) {
    const pos = state.trainPos;
    const angle = Math.atan2(state.train.dir[1], state.train.dir[0]);
    const history = state.history;
    function historyAt(back) {
      const index = history.length - 1 - back;
      if (index < 0) {
        return { x: pos.x - Math.cos(angle) * back * 1.2, y: pos.y - Math.sin(angle) * back * 1.2, angle };
      }
      return history[index];
    }
    const wagon2 = historyAt(44);
    const wagon1 = historyAt(22);
    drawCar(wagon2.x, wagon2.y, wagon2.angle, 'coal', state.heat, time);
    drawCar(wagon1.x, wagon1.y, wagon1.angle, 'ember', state.heat, time);
    // Invulnerability blink after an ember dies.
    if (state.train.grace === 0 || Math.floor(state.train.grace * 10) % 2 === 1) {
      drawCar(pos.x, pos.y, angle, 'loco', state.heat, time);
    }
    if (state.train.halt > 0) {
      text('!', pos.x, pos.y - 34, 22, PALETTE.bad, 'center');
    }
  }

  function drawPopups(state) {
    for (const popup of state.popups) {
      if (!popup.active) continue;
      // Popups rise from a station or a smash: clamp them inside the frame so
      // an edge popup never runs off the side or sits on a station label, and
      // give the text a dark pill so it reads over rails and kilns alike.
      const px = Math.max(70, Math.min(FIELD.width - 70, popup.x));
      const py = Math.max(30, Math.min(FIELD.height - 14, popup.y));
      context.font = `bold 20px ${FONT}`;
      const w = context.measureText(popup.text).width;
      context.globalAlpha = Math.min(1, popup.ttl / 0.5) * 0.85;
      context.fillStyle = 'rgba(10,13,19,0.85)';
      rr(px - w / 2 - 10, py - 23, w + 20, 30, 15);
      context.fill();
      context.globalAlpha = Math.min(1, popup.ttl / 0.5);
      text(popup.text, px, py, 20, popup.color, 'center');
      context.globalAlpha = 1;
    }
  }

  function chip(x, y, w, h, label, value, valueColor) {
    context.fillStyle = PALETTE.panel;
    rr(x, y, w, h, 9);
    context.fill();
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 1;
    context.stroke();
    text(label, x + 12, y + 13, 10, PALETTE.muted, 'left');
    text(value, x + 12, y + 34, 20, valueColor || PALETTE.text, 'left');
  }

  function drawDashboard(state, best, time) {
    const d = DASH;
    context.fillStyle = 'rgba(13,17,26,0.88)';
    rr(d.x, d.y, d.w, d.h, 16);
    context.fill();
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 1;
    context.stroke();

    // Title row.
    text('EMBERLINE', d.x + 24, d.y + 34, 24, PALETTE.text, 'left');
    text(`Reach ${WIN_SCORE} — dawn breaks when the line holds`, d.x + 24, d.y + 56, 13, PALETTE.muted, 'left');
    const mult = Math.min(FURNACE.comboCap, 1 + FURNACE.comboStep * state.combo);
    if (state.combo >= 2) {
      context.fillStyle = 'rgba(245,165,36,0.14)';
      rr(d.x + d.w - 150, d.y + 16, 126, 30, 15);
      context.fill();
      context.strokeStyle = 'rgba(245,165,36,0.5)';
      context.stroke();
      text(`COMBO x${mult.toFixed(2).replace(/0$/, '')}`, d.x + d.w - 87, d.y + 37, 15, PALETTE.accent, 'center');
    }

    // Stat strip: score, best, wave, deliveries.
    const stripY = d.y + 74;
    chip(d.x + 24, stripY, 170, 56, 'SCORE', scoreLabel(state.score), PALETTE.text);
    chip(d.x + 206, stripY, 130, 56, 'BEST', bestLabel(best), PALETTE.muted);
    chip(d.x + 348, stripY, 110, 56, 'WAVE', waveLabel(state.wave), PALETTE.text);
    chip(d.x + 470, stripY, 130, 56, 'DELIVERIES', delivLabel(state.deliveries), PALETTE.good);
    // Lives as ember dots (up to the capacity the Spare Ember upgrades bought).
    text('EMBERS', d.x + 624, stripY + 13, 10, PALETTE.muted, 'left');
    for (let i = 0; i < state.maxLives; i += 1) {
      const cx = d.x + 632 + i * 22;
      const cy = stripY + 38;
      context.fillStyle = i < state.lives ? PALETTE.emberMid : 'rgba(255,255,255,0.12)';
      context.beginPath();
      context.arc(cx, cy, 7, 0, Math.PI * 2);
      context.fill();
    }

    // Heat gauge.
    const gaugeY = stripY + 76;
    text('EMBER HEAT', d.x + 24, gaugeY, 11, PALETTE.muted, 'left');
    text(`${Math.max(0, Math.round(state.heat))}%`, d.x + d.w - 24, gaugeY, 13, state.heat < 25 ? PALETTE.bad : PALETTE.text, 'right');
    const gx = d.x + 24;
    const gw = d.w - 48;
    context.fillStyle = 'rgba(255,255,255,0.07)';
    rr(gx, gaugeY + 8, gw, 16, 8);
    context.fill();
    const heatFrac = Math.max(0, Math.min(1, state.heat / 100));
    const grad = context.createLinearGradient(gx, 0, gx + gw, 0);
    grad.addColorStop(0, PALETTE.emberLow);
    grad.addColorStop(0.55, PALETTE.emberMid);
    grad.addColorStop(1, PALETTE.emberHot);
    context.fillStyle = grad;
    if (heatFrac > 0.02) {
      rr(gx, gaugeY + 8, Math.max(16, gw * heatFrac), 16, 8);
      context.fill();
    }
    if (state.heat < 25) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 8);
      context.strokeStyle = `rgba(248,113,113,${0.4 + pulse * 0.6})`;
      context.lineWidth = 2;
      rr(gx - 2, gaugeY + 6, gw + 4, 20, 10);
      context.stroke();
      text('EMBER DYING — FIND COAL!', d.x + d.w / 2, gaugeY + 48, 14, PALETTE.bad, 'center');
    } else if (state.stoked) {
      text('STOKED — BURNING FAST', d.x + d.w / 2, gaugeY + 48, 13, PALETTE.accent, 'center');
    } else {
      text('Coal restores heat · Furnaces pay points + heat', d.x + d.w / 2, gaugeY + 48, 12, PALETTE.muted, 'center');
    }

    // Furnace + coal status row.
    const rowY = gaugeY + 70;
    function statusChip(x, label, lit, timer) {
      context.fillStyle = PALETTE.panel;
      rr(x, rowY, 150, 40, 9);
      context.fill();
      context.strokeStyle = lit ? 'rgba(52,211,153,0.45)' : PALETTE.panelBorder;
      context.lineWidth = 1;
      context.stroke();
      context.fillStyle = lit ? PALETTE.good : PALETTE.muted;
      context.beginPath();
      context.arc(x + 14, rowY + 20, 5, 0, Math.PI * 2);
      context.fill();
      text(label, x + 26, rowY + 16, 11, PALETTE.text, 'left');
      text(lit ? 'LIT' : `DARK ${Math.ceil(timer)}s`, x + 26, rowY + 32, 11, lit ? PALETTE.good : PALETTE.muted, 'left');
    }
    statusChip(d.x + 24, 'FURNACE A', state.furnaces.A.lit, state.furnaces.A.timer);
    statusChip(d.x + 190, 'FURNACE B', state.furnaces.B.lit, state.furnaces.B.timer);
    const coalReady = Object.values(state.coal).some((pile) => pile.available);
    statusChip(d.x + 356, 'COAL YARD', coalReady, 0);
    // Switch states.
    for (let i = 0; i < 3; i += 1) {
      const x = d.x + 522 + i * 58;
      const on = state.switches[i];
      context.fillStyle = on ? 'rgba(245,165,36,0.16)' : PALETTE.panel;
      rr(x, rowY, 50, 40, 9);
      context.fill();
      context.strokeStyle = on ? 'rgba(245,165,36,0.55)' : PALETTE.panelBorder;
      context.lineWidth = 1;
      context.stroke();
      text(SWITCH_LABELS[i], x + 25, rowY + 17, 12, on ? PALETTE.accent : PALETTE.text, 'center');
      text(on ? 'SPUR' : 'LOOP', x + 25, rowY + 33, 9, on ? PALETTE.accent : PALETTE.muted, 'center');
    }

    // Upgrades owned: name plus level pips, so the shop's effect stays visible.
    const upY = rowY + 52;
    text('UPGRADES', d.x + 24, upY + 19, 11, PALETTE.muted, 'left');
    const upgradeNames = ['COAL', 'FIREBOX', 'EMBER'];
    const upgradeKeys = ['coal', 'insulation', 'ember'];
    for (let i = 0; i < 3; i += 1) {
      const x0 = d.x + 116 + i * 192;
      const level = state.upgrades[upgradeKeys[i]];
      const max = UPGRADES[i].maxLevel;
      text(upgradeNames[i], x0, upY + 19, 11, level > 0 ? PALETTE.text : PALETTE.muted, 'left');
      for (let j = 0; j < max; j += 1) {
        context.fillStyle = j < level ? PALETTE.accent : 'rgba(255,255,255,0.14)';
        context.beginPath();
        context.arc(x0 + 78 + j * 15, upY + 15, 4.5, 0, Math.PI * 2);
        context.fill();
      }
      text(`Lv ${level}`, x0 + 78 + max * 15 + 8, upY + 19, 11, level > 0 ? PALETTE.accent : PALETTE.muted, 'left');
    }

    // Controls legend.
    text('1 / 2 / 3  switches    ·    SPACE hold to stoke (smashes bandits)    ·    CLICK a junction to flip it    ·    P pause    ·    M mute',
      d.x + d.w / 2, d.y + d.h - 16, 12, PALETTE.muted, 'center');
  }

  /**
   * The between-wave shop: the wave's title, the score to spend, three
   * upgrade cards (key, name, effect, level pips, cost) and the way out.
   * Cards the player cannot afford are shown dimmed with their cost in red.
   */
  function drawShop(state) {
    const s = SHOP;
    context.fillStyle = 'rgba(10,13,19,0.94)';
    rr(s.x, s.y, s.w, s.h, 18);
    context.fill();
    context.strokeStyle = 'rgba(245,165,36,0.45)';
    context.lineWidth = 1;
    context.stroke();
    text(`WAVE ${state.wave} — THE NIGHT DEEPENS`, FIELD.width / 2, s.y + 52, 30, PALETTE.accent, 'center');
    text('The line holds — for now. Spend points on ONE upgrade, or keep rolling.', FIELD.width / 2, s.y + 82, 14, PALETTE.muted, 'center');
    text(`Points spent don't count toward dawn (${WIN_SCORE}).   Score ${state.score}`, FIELD.width / 2, s.y + 106, 14, PALETTE.text, 'center');
    for (let i = 0; i < 3; i += 1) {
      const track = UPGRADES[i];
      const card = SHOP_CARDS[i];
      const level = state.upgrades[track.id];
      const maxed = level >= track.maxLevel;
      const cost = maxed ? null : track.costs[level];
      const affordable = cost !== null && state.score >= cost;
      context.fillStyle = affordable ? 'rgba(245,165,36,0.07)' : PALETTE.panel;
      rr(card.x, card.y, card.w, card.h, 12);
      context.fill();
      context.strokeStyle = affordable ? 'rgba(245,165,36,0.55)' : PALETTE.panelBorder;
      context.lineWidth = 1;
      context.stroke();
      // Key number in a circle.
      context.fillStyle = affordable ? PALETTE.accent : PALETTE.muted;
      context.beginPath();
      context.arc(card.x + card.w / 2, card.y + 34, 15, 0, Math.PI * 2);
      context.fill();
      text(String(i + 1), card.x + card.w / 2, card.y + 39, 15, '#0a0d13', 'center');
      text(track.name, card.x + card.w / 2, card.y + 78, 17, PALETTE.text, 'center');
      text(track.desc, card.x + card.w / 2, card.y + 102, 12, PALETTE.muted, 'center');
      // Level pips: filled for levels owned, hollow for the next one.
      for (let j = 0; j < track.maxLevel; j += 1) {
        context.fillStyle = j < level ? PALETTE.accent : 'rgba(255,255,255,0.16)';
        context.beginPath();
        context.arc(card.x + card.w / 2 + (j - (track.maxLevel - 1) / 2) * 18, card.y + 126, 5, 0, Math.PI * 2);
        context.fill();
      }
      if (maxed) {
        text('MAXED OUT', card.x + card.w / 2, card.y + 164, 15, PALETTE.muted, 'center');
      } else {
        text(`${cost} PTS`, card.x + card.w / 2, card.y + 164, 18, affordable ? PALETTE.accent : PALETTE.bad, 'center');
        if (!affordable) text("CAN'T AFFORD", card.x + card.w / 2, card.y + 186, 11, PALETTE.bad, 'center');
      }
    }
    text('1 / 2 / 3 buy  ·  SPACE keep rolling', FIELD.width / 2, s.y + s.h - 22, 13, PALETTE.muted, 'center');
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32 + 64;
    const x = (FIELD.width - width) / 2;
    const y = (FIELD.height - height) / 2;
    context.fillStyle = 'rgba(10,13,19,0.92)';
    rr(x, y, width, height, 18);
    context.fill();
    context.strokeStyle = PALETTE.panelBorder;
    context.lineWidth = 1;
    context.stroke();
    context.textBaseline = 'alphabetic';
    // Long titles (THE EMBER DIED) get a smaller size so they stay inside the panel.
    const titleSize = title.length > 12 ? 40 : 52;
    text(title, FIELD.width / 2, y + 74, titleSize, accent || PALETTE.text, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], FIELD.width / 2, y + 126 + index * 32, 19, PALETTE.muted, 'center');
    }
    text(prompt, FIELD.width / 2, y + height - 36, 20, PALETTE.accent, 'center');
  }

  const TITLE_LINES = [
    'The night is cold and the furnaces are dark. Keep the ember alive.',
    'Flip the switches (1 / 2 / 3 or click a junction) to route the train.',
    'Coal restores heat · Lit furnaces pay points · Bandits halt the train.',
    'Stoke with SPACE to smash bandits — but stoking burns the ember faster.',
    'Between waves, spend points on upgrades — coal wagons, insulation, spare embers.',
  ];

  /** One line for the end screens: what the shop bought on this run. */
  function upgradesLine(state) {
    const u = state.upgrades;
    return `Upgrades: Coal Lv${u.coal} · Firebox Lv${u.insulation} · Ember Lv${u.ember}`;
  }

  /** Paint one frame: field, dashboard, then a panel for the screen the game is on. */
  function draw(state, screen, best, time) {
    const t = time || 0;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    drawSky();
    drawGround();
    drawRails();
    drawStations(state, t);
    drawBandits(state, t);
    drawTrain(state, t);
    drawPopups(state);
    if (screen === SCREEN_TITLE) {
      drawPanel('EMBERLINE', TITLE_LINES, 'Press Space or click to start', PALETTE.accent);
      // Best sits below the panel, not above it: with five title lines the
      // panel grew tall enough that the old spot collided with the switch chip.
      const panelHeight = 150 + TITLE_LINES.length * 32 + 64;
      text(`BEST ${best}`, FIELD.width / 2, (FIELD.height + panelHeight) / 2 + 30, 15, PALETTE.muted, 'center');
      return;
    }
    // End screens show the panel alone: dim the field and the dashboard behind it
    // so the result reads cleanly instead of fighting the HUD.
    if (screen === SCREEN_OVER || screen === SCREEN_WIN) {
      context.fillStyle = 'rgba(5,7,10,0.62)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      if (screen === SCREEN_OVER) {
        drawPanel('THE EMBER DIED', [`Score ${state.score}`, `Best ${best}`, `${state.deliveries} deliveries · Wave ${state.wave}`, upgradesLine(state)], 'Press Space or click to try again', PALETTE.bad);
      } else {
        drawPanel('DAWN BREAKS', [`The line holds. Score ${state.score}`, `Best ${best}`, `${state.deliveries} deliveries · Wave ${state.wave}`, upgradesLine(state)], 'Press Space or click to play again', PALETTE.good);
      }
      return;
    }
    // The shop pauses the run: dim the field and show the wave's offer.
    if (screen === SCREEN_SHOP) {
      context.fillStyle = 'rgba(5,7,10,0.62)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      drawShop(state);
      return;
    }
    drawDashboard(state, best, t);
    if (state.waveBanner > 0 && screen === SCREEN_PLAY) {
      const banner = `WAVE ${state.wave} — THE NIGHT DEEPENS`;
      context.globalAlpha = Math.min(1, state.waveBanner);
      context.font = `30px ${FONT}`;
      const bw = context.measureText(banner).width + 48;
      context.fillStyle = 'rgba(10,13,19,0.85)';
      rr((FIELD.width - bw) / 2, 96, bw, 46, 23);
      context.fill();
      context.strokeStyle = 'rgba(245,165,36,0.4)';
      context.lineWidth = 1;
      context.stroke();
      text(banner, FIELD.width / 2, 128, 30, PALETTE.accent, 'center');
      context.globalAlpha = 1;
    }
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(5,7,10,0.55)';
      context.fillRect(0, 0, FIELD.width, FIELD.height);
      drawPanel('Paused', ['The ember waits for you.'], 'Press P to resume');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
