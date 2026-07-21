// engine.js — RNG, spin resolution, win evaluation.
// PURE VANILLA: imports nothing. Runs in a bare browser console or Node.
//
// Randomness is injectable. Production uses crypto.getRandomValues with
// rejection sampling; tests/simulations can inject a seeded PRNG so the same
// seed reproduces the same spin sequence. Math.random() is never used.

// ── RNG sources ─────────────────────────────────────────────────────────
// A "source" is a function returning an unbiased uint32 in [0, 2^32).

// Crypto source (production). Throws rather than falling back to Math.random.
export function cryptoSource() {
  const c = (typeof globalThis !== 'undefined') ? globalThis.crypto : null;
  if (!c || !c.getRandomValues) {
    throw new Error('Web Crypto unavailable — refusing to fall back to Math.random()');
  }
  const buf = new Uint32Array(1);
  return () => { c.getRandomValues(buf); return buf[0] >>> 0; };
}

// Seeded PRNG source (mulberry32). Deterministic given the seed. Uses only
// integer math (Math.imul) — no Math.random().
export function seededSource(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t ^ (t >>> 14)) >>> 0;
  };
}

// Wrap a source into an RNG with int()/float() helpers.
export function makeRng(source) {
  const src = source || cryptoSource();
  return {
    raw: src,
    // Unbiased integer in [0, max) via rejection sampling.
    int(max) {
      if (!Number.isInteger(max) || max <= 0) throw new Error('rng.int: max must be a positive integer');
      const limit = Math.floor(0x100000000 / max) * max;
      let x;
      do { x = src() >>> 0; } while (x >= limit);
      return x % max;
    },
    // Float in [0, 1) with 32 bits of resolution (supports fractional weights).
    float() { return (src() >>> 0) / 0x100000000; },
  };
}

export function cryptoRng() { return makeRng(cryptoSource()); }
export function seededRng(seed) { return makeRng(seededSource(seed)); }

// ── Weighted strip selection ──────────────────────────────────────────────
export function buildCumulative(strip, weightOf) {
  const cum = new Array(strip.length);
  let total = 0;
  for (let i = 0; i < strip.length; i++) {
    const w = weightOf ? weightOf(strip[i], i) : strip[i].weight;
    total += w;
    cum[i] = total;
  }
  return { cum, total };
}

// Pick a stop index on a strip, weighted by each stop's (possibly fractional)
// weight. Uses rng.float() so tuned fractional weights select correctly.
export function pickStop(strip, rng, weightOf) {
  const { cum, total } = buildCumulative(strip, weightOf);
  const r = rng.float() * total;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r < cum[mid]) hi = mid; else lo = mid + 1;
  }
  return lo;
}

// The window shown for a given stop index: `rows` consecutive strip symbols
// with circular wrapping.
export function windowForStop(strip, stop, rows) {
  const n = strip.length;
  const out = new Array(rows);
  for (let r = 0; r < rows; r++) out[r] = strip[(stop + r) % n].symbol;
  return out;
}

export function columnsToGrid(columns, rows) {
  const grid = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < columns.length; c++) row.push(columns[c][r]);
    grid.push(row);
  }
  return grid;
}

// Spin the machine with an injected rng. Returns { stops, columns, grid }.
export function spin(config, rng, weightOf) {
  const stops = [];
  const columns = [];
  for (let c = 0; c < config.reels.length; c++) {
    const strip = config.reels[c];
    const wf = weightOf ? (e, i) => weightOf(e, i, c) : undefined;
    const stop = pickStop(strip, rng, wf);
    stops.push(stop);
    columns.push(windowForStop(strip, stop, config.rows));
  }
  return { stops, columns, grid: columnsToGrid(columns, config.rows) };
}

// ── Win evaluation ─────────────────────────────────────────────────────────
const isWild = (s) => s === 'wild';
const isScatter = (s) => s === 'scatter';

// Evaluate a single payline. Returns { symbol, count, pay } or null.
export function evaluateLine(lineSymbols, paytable, lineBet) {
  const [a, b, c] = lineSymbols;

  // All-wild is the top line award.
  if (isWild(a) && isWild(b) && isWild(c)) {
    return { symbol: 'wild', count: 3, pay: paytable.wild[3] * lineBet };
  }

  // Base symbol = first non-wild. Scatters never form line wins.
  let base = null;
  for (const s of lineSymbols) {
    if (!isWild(s)) { base = s; break; }
  }
  if (base === null || isScatter(base)) return null;

  // Count matching-from-left (base or wild), stopping at scatter or mismatch.
  let count = 0;
  for (const s of lineSymbols) {
    if (s === base || isWild(s)) count++; else break;
  }

  const pays = paytable[base] || {};
  if (count >= 3 && pays[3] != null) return { symbol: base, count: 3, pay: pays[3] * lineBet };
  if (count >= 2 && pays[2] != null) return { symbol: base, count: 2, pay: pays[2] * lineBet };
  return null;
}

// Evaluate a full spin grid. Returns { totalWin, lineWins, scatter, totalBet }.
export function evaluateWin(grid, config, lineBet) {
  const { paytable, paylines, lines } = config;
  const totalBet = lineBet * lines;
  const lineWins = [];
  let totalWin = 0;

  paylines.forEach((rowsForLine, idx) => {
    const lineSymbols = rowsForLine.map((row, col) => grid[row][col]);
    const res = evaluateLine(lineSymbols, paytable, lineBet);
    if (res) {
      lineWins.push({ line: idx, ...res, positions: rowsForLine });
      totalWin += res.pay;
    }
  });

  // Scatter pays anywhere on the grid.
  let scatterCount = 0;
  for (const rowArr of grid) for (const s of rowArr) if (isScatter(s)) scatterCount++;
  let scatter = null;
  if (scatterCount >= 3 && paytable.scatter[3] != null) {
    const pay = paytable.scatter[3] * totalBet;
    scatter = { count: scatterCount, pay };
    totalWin += pay;
  }

  return { totalWin, lineWins, scatter, totalBet };
}

export default {
  cryptoSource, seededSource, makeRng, cryptoRng, seededRng,
  buildCumulative, pickStop, windowForStop, columnsToGrid, spin,
  evaluateLine, evaluateWin,
};
