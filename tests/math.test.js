// math.test.js — headless assertions for the pure math core.
// Run with `npm test` (node --test). Mirrors tests/math.test.html.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { config } from '../js/config.js';
import { evaluateWin, columnsToGrid } from '../js/engine.js';
import { enumerateRTP, tune, simulate, makeWeightOf } from '../js/rtp.js';
import { Bank } from '../js/bank.js';

const lineBet = 1;

// Build a grid from three columns of [row0,row1,row2] symbol names.
const gridOf = (c0, c1, c2) => columnsToGrid([c0, c1, c2], config.rows);

test('3-of-a-kind on the top line pays the paytable multiplier', () => {
  const grid = gridOf(
    ['ryder', 'boot', 'shell'],
    ['ryder', 'boot', 'shell'],
    ['ryder', 'boot', 'shell'],
  );
  const { totalWin, lineWins } = evaluateWin(grid, config, lineBet);
  // Top line = 3 ryder (250). Middle = 3 boot (8). Bottom = 3 shell (5).
  assert.equal(totalWin, 250 + 8 + 5);
  const top = lineWins.find((l) => l.line === 0);
  assert.equal(top.symbol, 'ryder');
  assert.equal(top.pay, 250);
});

test('wilds substitute to complete a line', () => {
  const grid = gridOf(
    ['unc', 'gator', 'gator'],
    ['wild', 'gator', 'gator'],
    ['unc', 'gator', 'gator'],
  );
  const { lineWins } = evaluateWin(grid, config, lineBet);
  const top = lineWins.find((l) => l.line === 0);
  assert.equal(top.symbol, 'unc');
  assert.equal(top.pay, 100);
});

test('three wilds award the wild jackpot line', () => {
  const grid = gridOf(
    ['wild', 'boot', 'boot'],
    ['wild', 'boot', 'boot'],
    ['wild', 'boot', 'boot'],
  );
  const top = evaluateWin(grid, config, lineBet).lineWins.find((l) => l.line === 0);
  assert.equal(top.symbol, 'wild');
  assert.equal(top.pay, 500);
});

test('two ryder left-aligned pays the 2x award, not more', () => {
  const grid = gridOf(
    ['ryder', 'shell', 'shell'],
    ['ryder', 'shell', 'shell'],
    ['gator', 'shell', 'shell'],
  );
  const top = evaluateWin(grid, config, lineBet).lineWins.find((l) => l.line === 0);
  assert.equal(top.symbol, 'ryder');
  assert.equal(top.count, 2);
  assert.equal(top.pay, 3);
});

test('three scatters pay 20x total bet from anywhere', () => {
  const grid = gridOf(
    ['scatter', 'boot', 'revolver'],
    ['boot', 'scatter', 'revolver'],
    ['revolver', 'boot', 'scatter'],
  );
  const { scatter } = evaluateWin(grid, config, lineBet);
  assert.ok(scatter);
  assert.equal(scatter.count, 3);
  assert.equal(scatter.pay, 20 * lineBet * config.lines);
});

test('no false positives on a dead grid', () => {
  const grid = gridOf(
    ['unc', 'gator', 'boot'],
    ['jessie', 'rose', 'shell'],
    ['gator', 'jug', 'revolver'],
  );
  assert.equal(evaluateWin(grid, config, lineBet).totalWin, 0);
});

test('enumeration produces a plausible base RTP', () => {
  const { rtp } = enumerateRTP(config, 1);
  assert.ok(rtp > 0 && rtp < 5, `unexpected rtp ${rtp}`);
});

test('auto-tuner hits the configured target RTP within tolerance', () => {
  const tuned = tune(config);
  assert.ok(Math.abs(tuned.rtp - config.targetRTP) < config.rtpTolerance,
    `tuned RTP ${tuned.rtp} not within ${config.rtpTolerance} of ${config.targetRTP}`);
});

test('tuner hits an arbitrary target too (0.85)', () => {
  const alt = { ...config, targetRTP: 0.85 };
  const tuned = tune(alt);
  assert.ok(Math.abs(tuned.rtp - 0.85) < config.rtpTolerance);
});

test('Monte-Carlo simulation agrees with enumeration within 0.3%', () => {
  const tuned = tune(config);
  const sim = simulate(config, tuned.k, 200_000);
  assert.ok(Math.abs(sim.rtp - tuned.rtp) < 0.03,
    `sim ${sim.rtp} vs enum ${tuned.rtp}`);
});

test('bank places bets, settles wins and persists across instances', () => {
  const bank = new Bank(config);
  bank.reset();
  assert.equal(bank.balance, config.startingBalance);
  const bet = bank.totalBet;
  assert.ok(bank.placeBet());
  assert.equal(bank.balance, config.startingBalance - bet);
  bank.settle(100, [['ryder']]);
  assert.equal(bank.balance, config.startingBalance - bet + 100);

  const reloaded = new Bank(config);
  assert.equal(reloaded.balance, bank.balance);
  assert.equal(reloaded.ledger.length, 1);
});

test('makeWeightOf scales only low-tier symbols', () => {
  const wf = makeWeightOf(config, 2);
  assert.equal(wf({ symbol: 'shell', weight: 6 }), 12);
  assert.equal(wf({ symbol: 'ryder', weight: 1 }), 1);
});
