// engine.js — RNG, spin resolution, win evaluation.
// PURE VANILLA: imports nothing. Runs in a bare browser console or Node.
// Uses Web Crypto (crypto.getRandomValues), available in browsers and Node 18+.

const cryptoObj = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : null;

// Cryptographically-fair integer in [0, max) via rejection sampling.
export function secureRandomInt(max) {
  if (max <= 0) throw new Error('secureRandomInt: max must be > 0');
  if (!cryptoObj || !cryptoObj.getRandomValues) {
    throw new Error('Web Crypto unavailable — refusing to fall back to Math.random()');
  }
  const uint32 = new Uint32Array(1);
  const limit = Math.floor(0xFFFFFFFF / max) * max; // largest unbiased multiple
  let x;
  do {
    cryptoObj.getRandomValues(uint32);
    x = uint32[0];
  } while (x >= limit);
  return x % max;
}

// Build cumulative weight table for a strip. Returns { cum, total }.
export function buildCumulative(strip, weightOf) {
  const cum = new Array(strip.length);
  let total = 0;
  for (let i = 0; i < strip.length; i++) {
    total += weightOf ? weightOf(strip[i], i) : strip[i].weight;
    cum[i] = total;
  }
  return { cum, total };
}

// Pick a stop index on a strip, weighted by each stop's weight.
export function pickStop(strip, weightOf) {
  const { cum, total } = buildCumulative(strip, weightOf);
  const r = secureRandomInt(total);
  // binary search the cumulative table
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (r < cum[mid]) hi = mid; else lo = mid + 1;
  }
  return lo;
}

// The window shown for a given stop index: 3 consecutive strip symbols (wrap).
export function windowForStop(strip, stop) {
  const n = strip.length;
  return [
    strip[stop % n].symbol,
    strip[(stop + 1) % n].symbol,
    strip[(stop + 2) % n].symbol,
  ];
}

// Spin the machine. Returns { stops, columns, grid }.
//   columns[c] = [row0, row1, row2] symbol names for reel c
//   grid[r][c] = symbol name at row r, column c
export function spin(config, weightOf) {
  const stops = [];
  const columns = [];
  for (let c = 0; c < config.reels.length; c++) {
    const strip = config.reels[c];
    const wf = weightOf ? (e, i) => weightOf(e, i, c) : undefined;
    const stop = pickStop(strip, wf);
    stops.push(stop);
    columns.push(windowForStop(strip, stop));
  }
  return { stops, columns, grid: columnsToGrid(columns, config.rows) };
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
  if (count >= 3 && pays[3] != null) {
    return { symbol: base, count: 3, pay: pays[3] * lineBet };
  }
  if (count >= 2 && pays[2] != null) {
    return { symbol: base, count: 2, pay: pays[2] * lineBet };
  }
  return null;
}

// Evaluate a full spin grid. Returns { totalWin, lineWins, scatter }.
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

export default { secureRandomInt, buildCumulative, pickStop, windowForStop, spin, columnsToGrid, evaluateLine, evaluateWin };
