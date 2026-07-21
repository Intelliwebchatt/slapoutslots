// main.js — bootstrap: wire the pure math modules to a placeholder PixiJS grid.
// Phase 1 renders the 3×3 grid as flat colored squares with labels. The engine
// is injected into rtp.js (which imports nothing). Art drops in during Phase 2.

import { config } from './config.js';
import * as engine from './engine.js';
import { tune, makeWeightOf, simulateChunked } from './rtp.js';
import { Bank } from './bank.js';

const R = config.render;
const GRID_W = config.reelCount * R.cell + (config.reelCount - 1) * R.gap + R.pad * 2;
const GRID_H = config.rows * R.cell + (config.rows - 1) * R.gap + R.pad * 2;

const $ = (id) => document.getElementById(id);
const pct = (x) => `${(x * 100).toFixed(2)}%`;
const pct4 = (x) => `${(x * 100).toFixed(4)}%`;

async function boot() {
  // Tune the RTP on load (engine injected — rtp.js imports nothing).
  const tuneResult = tune(config, engine);
  const weightOf = makeWeightOf(config, tuneResult.tunedK);
  const rng = engine.cryptoRng(); // production RNG for live spins

  const bank = new Bank(config);
  let lastGrid = null;

  // ── PixiJS placeholder grid ───────────────────────────────────────────
  const app = new PIXI.Application();
  await app.init({ width: GRID_W, height: GRID_H, background: R.background, antialias: true });
  $('stage').appendChild(app.canvas);

  const cells = [];
  for (let r = 0; r < config.rows; r++) {
    for (let c = 0; c < config.reelCount; c++) {
      const cell = new PIXI.Container();
      cell.x = R.pad + c * (R.cell + R.gap);
      cell.y = R.pad + r * (R.cell + R.gap);
      const box = new PIXI.Graphics();
      const label = new PIXI.Text({
        text: '',
        style: { fill: R.labelColor, fontSize: 20, fontWeight: 'bold', fontFamily: 'Courier New' },
      });
      label.anchor.set(0.5);
      label.x = R.cell / 2;
      label.y = R.cell / 2;
      cell.addChild(box, label);
      app.stage.addChild(cell);
      cells.push({ box, label });
    }
  }

  function drawCell(cell, symbolName, highlight) {
    const meta = config.symbols[symbolName];
    cell.box.clear();
    cell.box.roundRect(0, 0, R.cell, R.cell, 8).fill(meta.color);
    cell.box.stroke(highlight ? { width: 5, color: R.winBorder } : { width: 2, color: R.cellBorder });
    cell.label.text = meta.label;
  }

  function renderGrid(grid, winningCells = new Set()) {
    for (let r = 0; r < config.rows; r++) {
      for (let c = 0; c < config.reelCount; c++) {
        drawCell(cells[r * config.reelCount + c], grid[r][c], winningCells.has(`${r},${c}`));
      }
    }
  }

  function refreshMeters(win = 0) {
    $('balance').textContent = bank.balance.toLocaleString();
    $('bet').textContent = bank.totalBet.toLocaleString();
    $('win').textContent = win.toLocaleString();
    $('spin').disabled = !bank.canSpin();
  }

  const blankGrid = Array.from({ length: config.rows }, () =>
    Array.from({ length: config.reelCount }, () => 'boot'));
  renderGrid(blankGrid);
  lastGrid = blankGrid;
  refreshMeters();

  // ── Spin handler ────────────────────────────────────────────────────────
  let spinning = false;
  async function doSpin() {
    if (spinning) return;
    const pending = bank.placeBet();
    if (!pending) { refreshMeters(); return; }
    spinning = true;
    $('spin').disabled = true;
    $('win').classList.remove('win-flash');

    const { grid } = engine.spin(config, rng, (e) => weightOf(e));

    // Staggered reveal for feel (GSAP choreography arrives in Phase 3).
    for (let c = 0; c < config.reelCount; c++) {
      await new Promise((res) => setTimeout(res, R.revealDelayMs));
      for (let r = 0; r < config.rows; r++) {
        drawCell(cells[r * config.reelCount + c], grid[r][c], false);
      }
    }

    const { totalWin, lineWins, scatter } = engine.evaluateWin(grid, config, pending.lineBet);
    bank.settle(totalWin, grid);
    lastGrid = grid;

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
    updateLiveDebug();
    spinning = false;
    $('spin').disabled = !bank.canSpin();
  }

  // ── Controls ──────────────────────────────────────────────────────────
  $('spin').addEventListener('click', doSpin);
  $('bet-up').addEventListener('click', () => { bank.betUp(); refreshMeters(); updateLiveDebug(); });
  $('bet-down').addEventListener('click', () => { bank.betDown(); refreshMeters(); updateLiveDebug(); });
  $('max-bet').addEventListener('click', () => { bank.maxBet(); refreshMeters(); updateLiveDebug(); });
  $('add-points').addEventListener('click', () => { bank.addPoints(); refreshMeters(); updateLiveDebug(); });

  // ── Debug panel (?debug=1) ──────────────────────────────────────────────
  const debugOn = new URLSearchParams(location.search).get('debug') === '1';

  function renderEnumReport() {
    const rep = tuneResult.report;
    const status = tuneResult.success
      ? `MATCHED (Δ ${(tuneResult.difference * 100).toFixed(4)} pts)`
      : `NOT MATCHED (${tuneResult.reason}, Δ ${(tuneResult.difference * 100).toFixed(4)} pts)`;
    const sym = Object.entries(rep.symbolContribution).sort((a, b) => b[1] - a[1])
      .map(([s, v]) => `    ${s.padEnd(9)} ${pct(v)}`).join('\n');
    const lineNames = ['top', 'middle', 'bottom', 'diag ↘', 'diag ↗'];
    const lines = Object.entries(rep.paylineContribution).sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([i, v]) => `    line ${i} (${lineNames[i] || i}) ${pct(v)}`).join('\n');
    $('debug-enum').textContent =
      `target RTP     : ${pct(tuneResult.targetRTP)}\n` +
      `tuner          : ${tuneResult.success ? 'success' : 'FAILURE'}  →  ${status}\n` +
      `exact RTP      : ${pct4(rep.rtp)}\n` +
      `difference     : ${(tuneResult.difference * 100).toFixed(4)} pts\n` +
      `tuned k        : ${tuneResult.tunedK.toFixed(6)}\n` +
      `selected branch: ${tuneResult.branch} (curve ${tuneResult.diagnostics.curveShape}, ${tuneResult.diagnostics.crossingCount} crossings)\n` +
      `hit freq       : ${pct(rep.hitFrequency)}\n` +
      `net-positive   : ${pct(rep.netPositiveFrequency)}\n` +
      `break-even     : ${pct(rep.breakEvenFrequency)}\n` +
      `loss freq      : ${pct(rep.lossFrequency)}\n` +
      `maximum win    : ${rep.maxWin} × line bet\n` +
      `combinations   : ${rep.combinationCount.toLocaleString()}\n` +
      `total prob     : ${rep.totalProbability.toFixed(10)}\n` +
      `scatter contrib: ${pct(rep.scatterContribution)}\n` +
      `per-symbol RTP contribution:\n${sym}\n` +
      `per-payline RTP contribution:\n${lines}`;
  }

  function updateLiveDebug() {
    if (!debugOn) return;
    $('debug-grid').textContent = lastGrid
      ? lastGrid.map((row) => row.map((s) => config.symbols[s].label.padEnd(5)).join(' ')).join('\n')
      : '—';
    const st = bank.getState();
    $('debug-bank').textContent =
      `schema ${st.schemaVersion} | balance ${st.balance} | bet ${st.totalBet} (line ${st.lineBet}) | ` +
      `mute ${st.mute} | pending ${st.pending ? st.pending.id : 'none'} | ledger ${st.ledgerCount}`;
    $('debug-ledger').textContent = st.ledger.slice(0, 8)
      .map((e) => `${e.id}  bet ${e.totalBet}  win ${e.win}  net ${e.net >= 0 ? '+' : ''}${e.net}`)
      .join('\n') || '(empty)';
  }

  if (debugOn) {
    $('debug').hidden = false;
    renderEnumReport();
    updateLiveDebug();

    // Simulation controls.
    const sizeSel = $('sim-size');
    for (const n of config.simulation.sizes) {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = n.toLocaleString();
      if (n === config.simulation.defaultSize) opt.selected = true;
      sizeSel.appendChild(opt);
    }
    $('sim-seed').value = String(config.simulation.defaultSeed);

    let simCancel = false;
    let simRunning = false;
    $('sim-start').addEventListener('click', async () => {
      if (simRunning) return;
      simRunning = true; simCancel = false;
      $('sim-start').disabled = true;
      $('sim-cancel').disabled = false;
      const spins = Number(sizeSel.value);
      const seed = Math.trunc(Number($('sim-seed').value)) || config.simulation.defaultSeed;
      const enumRtp = tuneResult.report.rtp;
      const result = await simulateChunked(config, engine, {
        k: tuneResult.tunedK, spins, seed,
        onProgress: (p) => {
          $('sim-out').textContent =
            `running… ${(p.fraction * 100).toFixed(1)}%  (${p.done.toLocaleString()}/${spins.toLocaleString()})\n` +
            `rtp ${pct4(p.rtp)}  hit ${pct(p.hitFrequency)}  ${p.elapsedMs.toFixed(0)} ms`;
        },
        shouldCancel: () => simCancel,
      });
      $('sim-out').textContent =
        `${result.cancelled ? 'CANCELLED' : 'done'}  seed ${result.seed}  spins ${result.spins.toLocaleString()}/${spins.toLocaleString()}\n` +
        `sim RTP  : ${pct4(result.rtp)}\n` +
        `sim hit  : ${pct(result.hitFrequency)}\n` +
        `Δ vs enum: ${((result.rtp - enumRtp) * 100).toFixed(4)} pts\n` +
        `elapsed  : ${result.elapsedMs.toFixed(0)} ms`;
      simRunning = false;
      $('sim-start').disabled = false;
      $('sim-cancel').disabled = true;
    });
    $('sim-cancel').addEventListener('click', () => { simCancel = true; });
  }

  $('loading').hidden = true;
  $('app').hidden = false;
}

boot().catch((err) => {
  console.error(err);
  document.getElementById('loading').textContent = 'Failed to load: ' + err.message;
});
