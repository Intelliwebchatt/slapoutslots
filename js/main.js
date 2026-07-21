// main.js — bootstrap: wire the pure math modules to a placeholder PixiJS grid.
// Phase 1 renders the 3×3 grid as flat colored squares with labels. Art drops
// in during Phase 2 with zero logic changes.

import { config } from './config.js';
import { spin, evaluateWin } from './engine.js';
import { tune, makeWeightOf, simulate } from './rtp.js';
import { Bank } from './bank.js';

const CELL = 120;
const GAP = 8;
const PAD = 10;
const GRID_W = config.reelCount * CELL + (config.reelCount - 1) * GAP + PAD * 2;
const GRID_H = config.rows * CELL + (config.rows - 1) * GAP + PAD * 2;

const $ = (id) => document.getElementById(id);

async function boot() {
  // Tune the RTP on load — provably matches config.targetRTP.
  const tuned = tune(config);
  const weightOf = makeWeightOf(config, tuned.k);

  const bank = new Bank(config);

  // ── PixiJS placeholder grid ───────────────────────────────────────────
  const app = new PIXI.Application();
  await app.init({ width: GRID_W, height: GRID_H, background: 0x0a0f14, antialias: true });
  $('stage').appendChild(app.canvas);

  const cells = [];
  for (let r = 0; r < config.rows; r++) {
    for (let c = 0; c < config.reelCount; c++) {
      const cell = new PIXI.Container();
      cell.x = PAD + c * (CELL + GAP);
      cell.y = PAD + r * (CELL + GAP);

      const box = new PIXI.Graphics();
      const label = new PIXI.Text({
        text: '',
        style: { fill: 0x101820, fontSize: 20, fontWeight: 'bold', fontFamily: 'Courier New' },
      });
      label.anchor.set(0.5);
      label.x = CELL / 2;
      label.y = CELL / 2;

      cell.addChild(box, label);
      app.stage.addChild(cell);
      cells.push({ box, label, container: cell });
    }
  }

  function drawCell(cell, symbolName, highlight) {
    const meta = config.symbols[symbolName];
    cell.box.clear();
    cell.box.roundRect(0, 0, CELL, CELL, 8).fill(meta.color);
    // Always draw a border so every cell boundary is visible; winning cells
    // get a thicker ember stroke.
    cell.box.stroke(highlight ? { width: 5, color: 0xE8722C } : { width: 2, color: 0x1C2A33 });
    cell.label.text = meta.label;
  }

  function renderGrid(grid, winningCells = new Set()) {
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.reelCount; c++) {
        drawCell(cells[r * config.reelCount + c], grid[r][c], winningCells.has(`${r},${c}`));
      }
    }
  }

  // ── Meters ────────────────────────────────────────────────────────────
  function refreshMeters(win = 0) {
    $('balance').textContent = bank.balance.toLocaleString();
    $('bet').textContent = bank.totalBet.toLocaleString();
    $('win').textContent = win.toLocaleString();
    $('spin').disabled = !bank.canSpin();
  }

  // Initial blank grid (placeholder symbols before the first spin).
  const blankGrid = Array.from({ length: config.rows }, () =>
    Array.from({ length: config.reelCount }, () => 'boot'));
  renderGrid(blankGrid);
  refreshMeters();

  // ── Spin handler ────────────────────────────────────────────────────────
  let spinning = false;
  async function doSpin() {
    if (spinning || !bank.placeBet()) { refreshMeters(); return; }
    spinning = true;
    $('spin').disabled = true;
    $('win').classList.remove('win-flash');

    const { grid } = spin(config, (entry) => weightOf(entry));

    // Simple staggered reveal for feel (no GSAP yet — Phase 3).
    for (let c = 0; c < config.reelCount; c++) {
      await new Promise((res) => setTimeout(res, 120));
      for (let r = 0; r < config.rows; r++) {
        drawCell(cells[r * config.reelCount + c], grid[r][c], false);
      }
    }

    const { totalWin, lineWins, scatter } = evaluateWin(grid, config, bank.lineBet);
    bank.settle(totalWin, grid);

    const winners = new Set();
    for (const lw of lineWins) lw.positions.forEach((row, col) => winners.add(`${row},${col}`));
    if (scatter) {
      for (let r = 0; r < config.rows; r++) {
        for (let c = 0; c < config.reelCount; c++) if (grid[r][c] === 'scatter') winners.add(`${r},${c}`);
      }
    }
    renderGrid(grid, winners);

    if (totalWin > 0) $('win').classList.add('win-flash');
    refreshMeters(totalWin);
    spinning = false;
    $('spin').disabled = !bank.canSpin();
  }

  // ── Wire controls ─────────────────────────────────────────────────────
  $('spin').addEventListener('click', doSpin);
  $('bet-up').addEventListener('click', () => { bank.betUp(); refreshMeters(); });
  $('bet-down').addEventListener('click', () => { bank.betDown(); refreshMeters(); });
  $('max-bet').addEventListener('click', () => { bank.maxBet(); refreshMeters(); });
  $('add-points').addEventListener('click', () => { bank.addPoints(); refreshMeters(); });

  // ── Debug panel (?debug=1) ──────────────────────────────────────────────
  if (new URLSearchParams(location.search).get('debug') === '1') {
    $('debug').hidden = false;
    const contrib = Object.entries(tuned.contribution)
      .sort((a, b) => b[1] - a[1])
      .map(([s, v]) => `  ${s.padEnd(9)} ${(v * 100).toFixed(2)}%`)
      .join('\n');
    $('debug-out').textContent =
      `target RTP : ${(config.targetRTP * 100).toFixed(2)}%\n` +
      `tuned RTP  : ${(tuned.rtp * 100).toFixed(4)}%\n` +
      `tuned k    : ${tuned.k.toFixed(5)}\n` +
      `hit freq   : ${(tuned.hitFrequency * 100).toFixed(2)}%\n` +
      `per-symbol RTP contribution:\n${contrib}`;
    $('sim-btn').addEventListener('click', () => {
      $('sim-out').textContent = 'simulating…';
      setTimeout(() => {
        const sim = simulate(config, tuned.k, 1_000_000);
        $('sim-out').textContent =
          `sim RTP   : ${(sim.rtp * 100).toFixed(4)}%  (${sim.spins.toLocaleString()} spins)\n` +
          `sim hit   : ${(sim.hitFrequency * 100).toFixed(2)}%\n` +
          `Δ vs enum : ${((sim.rtp - tuned.rtp) * 100).toFixed(4)} pts`;
      }, 30);
    });
  }

  $('loading').hidden = true;
  $('app').hidden = false;
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = 'Failed to load: ' + err.message;
});
