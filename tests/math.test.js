// math.test.js — headless assertions for the pure math core. Run with
// `npm test` (node --test). The engine is injected into rtp.js (which imports
// nothing), mirroring how main.js wires the modules.

import './setup-localstorage.js'; // must precede bank.js import
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { config, deepFreeze } from '../js/config.js';
import * as engine from '../js/engine.js';
import { enumerateRTP, tune, simulate, simulateChunked } from '../js/rtp.js';
import { Bank } from '../js/bank.js';

const lineBet = 1;
const { evaluateWin, columnsToGrid, windowForStop, buildCumulative, pickStop } = engine;
const gridCols = (c0, c1, c2) => columnsToGrid([c0, c1, c2], config.rows);

// Tune once and reuse (tuning is comparatively expensive).
const tuned = tune(config, engine);

// ── Architecture / purity ─────────────────────────────────────────────────
test('rtp.js imports nothing (engine is injected)', async () => {
  const src = await (await import('node:fs/promises')).readFile(new URL('../js/rtp.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s.+from/m.test(src), false, 'rtp.js must not have import-from statements');
});

// ── Win evaluation: paytable ───────────────────────────────────────────────
test('3-of-a-kind on the top line pays the paytable multiplier', () => {
  const grid = gridCols(['ryder', 'boot', 'shell'], ['ryder', 'boot', 'shell'], ['ryder', 'boot', 'shell']);
  const { totalWin, lineWins } = evaluateWin(grid, config, lineBet);
  assert.equal(totalWin, 250 + 8 + 5);
  assert.equal(lineWins.find((l) => l.line === 0).pay, 250);
});

// ── Every payline separately ────────────────────────────────────────────────
const G = 'gator', u = 'unc', j = 'jessie', o = 'rose', J = 'jug', v = 'revolver', b = 'boot', s = 'shell';
const lineGrids = {
  0: [[G, G, G], [G, J, v], [b, s, u]],
  1: [[u, j, o], [G, G, G], [b, s, u]],
  2: [[u, j, o], [G, J, v], [G, G, G]],
  3: [[G, j, o], [G, G, v], [b, s, G]],
  4: [[u, j, G], [G, G, v], [G, s, u]],
};
for (const [line, grid] of Object.entries(lineGrids)) {
  test(`payline ${line} wins in isolation (3× gator = 30)`, () => {
    const { totalWin, lineWins } = evaluateWin(grid, config, lineBet);
    assert.equal(totalWin, 30, `line ${line} totalWin`);
    assert.equal(lineWins.length, 1);
    assert.equal(lineWins[0].line, Number(line));
    assert.equal(lineWins[0].symbol, 'gator');
  });
}

// ── Wild edge cases ─────────────────────────────────────────────────────────
test('wild completes 3-of-a-kind on a line', () => {
  const line = evaluateWin(gridCols(['unc', 'x', 'x'], ['wild', 'x', 'x'], ['unc', 'x', 'x']).map((r) => r.map((c) => (c === 'x' ? 'gator' : c))), config, lineBet).lineWins.find((l) => l.line === 0);
  assert.equal(line.symbol, 'unc');
  assert.equal(line.pay, 100);
});
test('three wilds award the wild jackpot line (500)', () => {
  const top = evaluateWin(gridCols(['wild', 'boot', 'boot'], ['wild', 'boot', 'boot'], ['wild', 'boot', 'boot']), config, lineBet).lineWins.find((l) => l.line === 0);
  assert.equal(top.symbol, 'wild');
  assert.equal(top.pay, 500);
});
test('two leading wilds + symbol → three of that symbol', () => {
  const top = evaluateWin(gridCols(['wild', 'x', 'x'], ['wild', 'x', 'x'], ['gator', 'x', 'x']).map((r) => r.map((c) => (c === 'x' ? 'shell' : c))), config, lineBet).lineWins.find((l) => l.line === 0);
  assert.equal(top.symbol, 'gator');
  assert.equal(top.pay, 30);
});
test('wild in the middle completes 3 ryder', () => {
  const top = evaluateWin(gridCols(['ryder', 'x', 'x'], ['wild', 'x', 'x'], ['ryder', 'x', 'x']).map((r) => r.map((c) => (c === 'x' ? 'shell' : c))), config, lineBet).lineWins.find((l) => l.line === 0);
  assert.equal(top.symbol, 'ryder');
  assert.equal(top.pay, 250);
});
test('two ryder left-aligned pays the 2x award, not more', () => {
  const top = evaluateWin(gridCols(['ryder', 'x', 'x'], ['ryder', 'x', 'x'], ['gator', 'x', 'x']).map((r) => r.map((c) => (c === 'x' ? 'shell' : c))), config, lineBet).lineWins.find((l) => l.line === 0);
  assert.equal(top.count, 2);
  assert.equal(top.pay, 3);
});
test('non-ryder 2-of-a-kind does not pay', () => {
  const res = evaluateWin(gridCols(['gator', 'x', 'x'], ['wild', 'x', 'x'], ['ryder', 'x', 'x']).map((r) => r.map((c) => (c === 'x' ? 'shell' : c))), config, lineBet);
  // top line: gator, wild, ryder → base gator, count 2, gator has no 2x → no line 0 win
  assert.equal(res.lineWins.find((l) => l.line === 0), undefined);
});

// ── Scatter ─────────────────────────────────────────────────────────────────
test('three scatters pay 20× total bet from anywhere', () => {
  const grid = gridCols(['scatter', 'boot', 'revolver'], ['boot', 'scatter', 'revolver'], ['revolver', 'boot', 'scatter']);
  const { scatter } = evaluateWin(grid, config, lineBet);
  assert.equal(scatter.count, 3);
  assert.equal(scatter.pay, 20 * lineBet * config.lines);
});
test('two scatters do not pay', () => {
  const grid = gridCols(['scatter', 'boot', 'revolver'], ['boot', 'scatter', 'revolver'], ['revolver', 'boot', 'unc']);
  assert.equal(evaluateWin(grid, config, lineBet).scatter, null);
});
test('scatter and a line win both pay in the same spin', () => {
  const grid = [['ryder', 'ryder', 'ryder'], ['scatter', 'scatter', 'scatter'], ['boot', 'shell', 'revolver']];
  const { totalWin, lineWins, scatter } = evaluateWin(grid, config, lineBet);
  assert.equal(lineWins.find((l) => l.line === 0).pay, 250);
  assert.equal(scatter.pay, 20 * config.lines);
  assert.equal(totalWin, 250 + 20 * config.lines);
});
test('no false positives on a dead grid', () => {
  const grid = gridCols(['unc', 'gator', 'boot'], ['jessie', 'rose', 'shell'], ['gator', 'jug', 'revolver']);
  assert.equal(evaluateWin(grid, config, lineBet).totalWin, 0);
});

// ── Reels: circular wrapping + weighted boundaries ──────────────────────────
test('windowForStop wraps circularly at the strip boundary', () => {
  const strip = [{ symbol: 'a' }, { symbol: 'b' }, { symbol: 'c' }];
  assert.deepEqual(windowForStop(strip, 2, 3), ['c', 'a', 'b']);
  assert.deepEqual(windowForStop(strip, 0, 3), ['a', 'b', 'c']);
});
test('buildCumulative supports fractional (tuned) weights', () => {
  const strip = [{ symbol: 'a', weight: 1 }, { symbol: 'b', weight: 1 }];
  const { cum, total } = buildCumulative(strip, (e) => (e.symbol === 'a' ? 0.5 : 1.5));
  assert.equal(total, 2);
  assert.deepEqual(cum, [0.5, 2]);
});
test('pickStop selects the correct weighted boundary via injected float', () => {
  const strip = [{ symbol: 'a', weight: 1 }, { symbol: 'b', weight: 1 }, { symbol: 'c', weight: 1 }];
  const rngAt = (f) => ({ float: () => f });
  assert.equal(pickStop(strip, rngAt(0)), 0);
  assert.equal(pickStop(strip, rngAt(0.34)), 1);
  assert.equal(pickStop(strip, rngAt(0.9999)), 2);
});

// ── RNG: deterministic seeding ──────────────────────────────────────────────
test('seeded RNG is deterministic and reproducible', () => {
  const a = engine.seededRng(42), b = engine.seededRng(42);
  const seqA = Array.from({ length: 8 }, () => a.int(1000));
  const seqB = Array.from({ length: 8 }, () => b.int(1000));
  assert.deepEqual(seqA, seqB);
  const c = engine.seededRng(43);
  assert.notDeepEqual(seqA, Array.from({ length: 8 }, () => c.int(1000)));
});
test('rng.int rejection sampling stays in range', () => {
  const r = engine.seededRng(7);
  for (let i = 0; i < 500; i++) { const x = r.int(13); assert.ok(x >= 0 && x < 13 && Number.isInteger(x)); }
});

// ── Enumeration report ──────────────────────────────────────────────────────
test('exact tiny hand-calculable RTP case', () => {
  const tiny = {
    rows: 3, reelCount: 3, lines: 1, lowTierSymbols: [],
    reels: [[{ symbol: 'a', weight: 1 }], [{ symbol: 'a', weight: 1 }], [{ symbol: 'a', weight: 1 }]],
    paytable: { a: { 3: 7 }, wild: { 3: 0 }, scatter: { 3: 0 } },
    paylines: [[0, 0, 0]],
  };
  const rep = enumerateRTP(tiny, engine, 1);
  assert.equal(rep.combinationCount, 1);
  assert.equal(rep.rtp, 7);
  assert.equal(rep.maxWin, 7);
  assert.equal(rep.totalProbability, 1);
});
test('combination count equals N1×N2×N3', () => {
  assert.equal(enumerateRTP(config, engine, 1).combinationCount, 24 * 24 * 24);
});
test('total enumerated probability is ~1', () => {
  assert.ok(Math.abs(enumerateRTP(config, engine, 1).totalProbability - 1) < 1e-9);
});
test('outcome frequencies partition the space (net-pos + break-even + loss ≈ 1)', () => {
  const r = enumerateRTP(config, engine, tuned.tunedK);
  assert.ok(Math.abs((r.netPositiveFrequency + r.breakEvenFrequency + r.lossFrequency) - 1) < 1e-9);
});
test('symbol contributions reconcile with total RTP', () => {
  const r = enumerateRTP(config, engine, tuned.tunedK);
  const sum = Object.values(r.symbolContribution).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - r.rtp) < 1e-9, `Σsymbol ${sum} vs rtp ${r.rtp}`);
});
test('payline + scatter contributions reconcile with total RTP', () => {
  const r = enumerateRTP(config, engine, tuned.tunedK);
  const sum = Object.values(r.paylineContribution).reduce((a, b) => a + b, 0) + r.scatterContribution;
  assert.ok(Math.abs(sum - r.rtp) < 1e-9, `Σpayline+scatter ${sum} vs rtp ${r.rtp}`);
});
test('maximum win is reproducible from its grid', () => {
  const r = enumerateRTP(config, engine, 1);
  assert.ok(r.maxWin >= 500, `maxWin ${r.maxWin} should reach the 3-wild line`);
  assert.equal(evaluateWin(r.maxWinGrid, config, 1).totalWin, r.maxWin);
});

// ── Tuner ───────────────────────────────────────────────────────────────────
test('tuner reaches a reachable target and reports success', () => {
  assert.equal(tuned.success, true);
  assert.ok(Math.abs(tuned.actualRTP - config.targetRTP) < config.rtpTolerance);
  assert.ok(tuned.report);
});
test('tuner detects the U-shaped curve and selects the decreasing branch', () => {
  assert.equal(tuned.diagnostics.curveShape, 'u-shaped');
  assert.equal(tuned.branch, 'decreasing');
  assert.ok(tuned.diagnostics.crossingCount >= 2);
  assert.ok(tuned.bracket && tuned.bracket.kLow < tuned.bracket.kHigh);
});
test('tuner hits an arbitrary reachable target (0.85)', () => {
  const t = tune({ ...config, targetRTP: 0.85 }, engine);
  assert.equal(t.success, true);
  assert.ok(Math.abs(t.actualRTP - 0.85) < config.rtpTolerance);
});
test('tuner returns success:false for an unreachable target (below the curve minimum)', () => {
  const t = tune({ ...config, targetRTP: 0.5 }, engine);
  assert.equal(t.success, false);
  assert.equal(t.reason, 'no-crossing');
  assert.ok(t.report); // nearest reported, but not claimed as a match
});
test('tuner returns success:false for an unreachable target (above the curve maximum)', () => {
  const t = tune({ ...config, targetRTP: 5 }, engine);
  assert.equal(t.success, false);
});

// ── Simulation ──────────────────────────────────────────────────────────────
test('seeded simulation is deterministic (same seed → same result)', () => {
  const opts = () => ({ k: tuned.tunedK, spins: 5000, rng: engine.seededRng(999) });
  const a = simulate(config, engine, opts());
  const b = simulate(config, engine, opts());
  assert.deepEqual(a, b);
});
test('chunked simulation matches synchronous simulation for the same seed', async () => {
  const sync = simulate(config, engine, { k: tuned.tunedK, spins: 4000, rng: engine.seededRng(2024) });
  const chunked = await simulateChunked(config, engine, { k: tuned.tunedK, spins: 4000, seed: 2024, chunkSize: 700 });
  assert.ok(Math.abs(sync.rtp - chunked.rtp) < 1e-12, `${sync.rtp} vs ${chunked.rtp}`);
  assert.equal(sync.hitFrequency, chunked.hitFrequency);
});
test('chunked simulation can be cancelled mid-run', async () => {
  let calls = 0;
  const res = await simulateChunked(config, engine, {
    k: tuned.tunedK, spins: 1_000_000, seed: 1, chunkSize: 1000,
    shouldCancel: () => (++calls > 2),
  });
  assert.equal(res.cancelled, true);
  assert.ok(res.spins < 1_000_000 && res.spins > 0);
});
test('Monte-Carlo simulation agrees with enumeration within 0.3%', () => {
  const sim = simulate(config, engine, { k: tuned.tunedK, spins: 60_000, rng: engine.seededRng(55) });
  assert.ok(Math.abs(sim.rtp - tuned.actualRTP) < 0.03, `sim ${sim.rtp} vs enum ${tuned.actualRTP}`);
});

// ── Config immutability ─────────────────────────────────────────────────────
test('base config is deeply frozen and immutable', () => {
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.reels));
  assert.ok(Object.isFrozen(config.reels[0]));
  assert.ok(Object.isFrozen(config.paytable));
  assert.throws(() => { config.targetRTP = 0.5; }, TypeError);
  assert.throws(() => { config.reels.push([]); }, TypeError);
  assert.equal(config.targetRTP, 0.94);
});
test('deepFreeze is idempotent', () => {
  const o = deepFreeze({ a: { b: 1 } });
  assert.ok(Object.isFrozen(o.a));
  assert.equal(deepFreeze(o), o);
});

// ── Bank ─────────────────────────────────────────────────────────────────────
const freshBank = () => { globalThis.localStorage.clear(); return new Bank(config); };

test('bank places bets, settles wins, records a schema-complete ledger entry', () => {
  const bank = freshBank();
  assert.equal(bank.balance, config.startingBalance);
  const pending = bank.placeBet();
  assert.ok(pending.id);
  assert.equal(bank.balance, config.startingBalance - pending.totalBet);
  bank.settle(100, [['ryder']]);
  assert.equal(bank.balance, config.startingBalance - pending.totalBet + 100);
  const e = bank.ledger[0];
  for (const key of ['id', 'ts', 'lineBet', 'totalBet', 'win', 'net', 'grid']) assert.ok(key in e, `ledger entry missing ${key}`);
  assert.equal(e.net, 100 - pending.totalBet);
});
test('bank persists across instances', () => {
  const bank = freshBank();
  bank.placeBet(); bank.settle(50, [['ryder']]);
  const reloaded = new Bank(config);
  assert.equal(reloaded.balance, bank.balance);
  assert.equal(reloaded.ledger.length, 1);
});
test('bank prevents a second wager while a spin is pending', () => {
  const bank = freshBank();
  assert.ok(bank.placeBet());
  assert.equal(bank.placeBet(), false);
  assert.equal(bank.canSpin(), false);
});
test('bank prevents settlement without a pending spin (and duplicate settlement)', () => {
  const bank = freshBank();
  assert.throws(() => bank.settle(10, [['ryder']]), /without a pending spin/);
  bank.placeBet();
  bank.settle(0, [['ryder']]);
  assert.throws(() => bank.settle(0, [['ryder']]), /without a pending spin/);
});
test('bank preserves the wager captured at spin start', () => {
  const bank = freshBank();
  const pending = bank.placeBet();       // lineBet 1, totalBet 5
  bank.maxBet();                         // change the current bet mid-spin
  bank.settle(0, [['ryder']]);
  assert.equal(bank.ledger[0].totalBet, pending.totalBet);
  assert.equal(bank.ledger[0].lineBet, pending.lineBet);
});
test('bank assigns unique spin ids', () => {
  const bank = freshBank();
  bank.addPoints(10000);
  const ids = new Set();
  for (let i = 0; i < 20; i++) { const p = bank.placeBet(); ids.add(p.id); bank.settle(0, [['ryder']]); }
  assert.equal(ids.size, 20);
});
test('bank enforces integer points on add and settle', () => {
  const bank = freshBank();
  assert.throws(() => bank.addPoints(10.5), /positive integer/);
  assert.throws(() => bank.addPoints(-5), /positive integer/);
  bank.placeBet();
  assert.throws(() => bank.settle(5.5, [['ryder']]), /non-negative integer/);
  assert.throws(() => bank.settle(-1, [['ryder']]), /non-negative integer/);
});
test('bank mute state persists', () => {
  const bank = freshBank();
  assert.equal(bank.mute, false);
  bank.toggleMute();
  assert.equal(new Bank(config).mute, true);
});
test('bank caps the ledger at maxLedger', () => {
  const bank = freshBank();
  bank.addPoints(1_000_000);
  for (let i = 0; i < config.maxLedger + 15; i++) { bank.placeBet(); bank.settle(0, [['ryder']]); }
  assert.equal(bank.ledger.length, config.maxLedger);
});
test('bank recovers from malformed JSON', () => {
  globalThis.localStorage.clear();
  globalThis.localStorage.setItem(config.storage.key, '{not valid json');
  const bank = new Bank(config);
  assert.equal(bank.balance, config.startingBalance);
  assert.deepEqual(bank.ledger, []);
});
test('bank recovers from Infinity / NaN / negative / non-integer balances', () => {
  const load = (raw) => { globalThis.localStorage.clear(); globalThis.localStorage.setItem(config.storage.key, raw); return new Bank(config).balance; };
  assert.equal(load('{"schemaVersion":1,"balance":1e999,"betIndex":0,"mute":false,"ledger":[]}'), config.startingBalance); // Infinity
  assert.equal(load('{"schemaVersion":1,"balance":null,"betIndex":0,"mute":false,"ledger":[]}'), config.startingBalance);
  assert.equal(load('{"schemaVersion":1,"balance":-50,"betIndex":0,"mute":false,"ledger":[]}'), config.startingBalance);
  assert.equal(load('{"schemaVersion":1,"balance":10.5,"betIndex":0,"mute":false,"ledger":[]}'), config.startingBalance);
});
test('bank clamps an invalid bet index', () => {
  const load = (idx) => { globalThis.localStorage.clear(); globalThis.localStorage.setItem(config.storage.key, `{"schemaVersion":1,"balance":100,"betIndex":${idx},"mute":false,"ledger":[]}`); return new Bank(config).betIndex; };
  assert.equal(load(99), 0);
  assert.equal(load(-1), 0);
  assert.equal(load(2), 2);
});
test('bank drops corrupt ledger entries but keeps valid ones', () => {
  globalThis.localStorage.clear();
  const good = { id: 'x', ts: 1, lineBet: 1, totalBet: 5, win: 0, net: -5, grid: [['ryder']] };
  const raw = JSON.stringify({ schemaVersion: 1, balance: 100, betIndex: 0, mute: false, ledger: [good, { id: 'bad' }, 42, { id: 'y', ts: 2, lineBet: 1, totalBet: 5, win: 'x', net: 0, grid: [] }] });
  globalThis.localStorage.setItem(config.storage.key, raw);
  const bank = new Bank(config);
  assert.equal(bank.ledger.length, 1);
  assert.equal(bank.ledger[0].id, 'x');
});
test('bank resets on an unknown schema version', () => {
  globalThis.localStorage.clear();
  globalThis.localStorage.setItem(config.storage.key, '{"schemaVersion":999,"balance":7,"betIndex":3,"mute":true,"ledger":[]}');
  const bank = new Bank(config);
  assert.equal(bank.balance, config.startingBalance);
  assert.equal(bank.betIndex, 0);
  assert.equal(bank.mute, false);
});
