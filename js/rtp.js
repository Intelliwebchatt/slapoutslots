// rtp.js — exhaustive RTP enumeration + binary-search auto-tuner.
// PURE VANILLA: imports only the pure engine evaluation helpers.

import { windowForStop, columnsToGrid, evaluateWin, spin } from './engine.js';

// Weight function factory: scales low-tier symbol weights by k.
export function makeWeightOf(config, k) {
  const low = new Set(config.lowTierSymbols);
  return (entry) => (low.has(entry.symbol) ? entry.weight * k : entry.weight);
}

// Exhaustively enumerate every weighted stop combination and compute exact RTP.
// lineBet is fixed at 1; RTP = expectedPay / totalBetUnits (lines × lineBet).
export function enumerateRTP(config, k = 1) {
  const weightOf = makeWeightOf(config, k);
  const lineBet = 1;
  const totalBet = lineBet * config.lines;

  // Precompute per-reel: window symbols per stop, stop probability.
  const reelData = config.reels.map((strip) => {
    let total = 0;
    const weights = strip.map((e) => { const w = weightOf(e); total += w; return w; });
    const windows = strip.map((_, i) => windowForStop(strip, i));
    return { windows, probs: weights.map((w) => w / total), n: strip.length };
  });

  const [r0, r1, r2] = reelData;
  let expectedPay = 0;
  let hitProb = 0;
  const symbolContribution = {};

  for (let i = 0; i < r0.n; i++) {
    const p0 = r0.probs[i], col0 = r0.windows[i];
    for (let j = 0; j < r1.n; j++) {
      const p1 = r1.probs[j], col1 = r1.windows[j];
      const p01 = p0 * p1;
      for (let m = 0; m < r2.n; m++) {
        const p = p01 * r2.probs[m];
        const grid = columnsToGrid([col0, col1, r2.windows[m]], config.rows);
        const { totalWin, lineWins, scatter } = evaluateWin(grid, config, lineBet);
        if (totalWin > 0) {
          expectedPay += p * totalWin;
          hitProb += p;
          for (const lw of lineWins) {
            symbolContribution[lw.symbol] = (symbolContribution[lw.symbol] || 0) + p * lw.pay;
          }
          if (scatter) {
            symbolContribution.scatter = (symbolContribution.scatter || 0) + p * scatter.pay;
          }
        }
      }
    }
  }

  const rtp = expectedPay / totalBet;
  // Normalize contributions into a fraction of RTP.
  const contribution = {};
  for (const [sym, ev] of Object.entries(symbolContribution)) {
    contribution[sym] = (ev / totalBet);
  }
  return { rtp, hitFrequency: hitProb, k, contribution };
}

// Tune k until enumerated RTP matches config.targetRTP.
//
// k scales low-tier symbol weights. In the low-k region, raising k floods the
// reels with cheap symbols and RTP falls (the blueprint's intuition); at very
// high k a single cheap symbol dominates and RTP climbs again, so RTP(k) is
// U-shaped rather than monotonic. We therefore scan a log-spaced grid, take the
// FIRST target crossing (the decreasing branch), then bisect that bracket.
export function tune(config) {
  const target = config.targetRTP;
  const tol = config.rtpTolerance;
  const kMin = 1e-3, kMax = 50, steps = 400;

  let prevK = kMin;
  let prevR = enumerateRTP(config, kMin).rtp;
  let best = { diff: Math.abs(prevR - target), result: enumerateRTP(config, prevK) };

  for (let i = 1; i <= steps; i++) {
    const k = kMin * Math.pow(kMax / kMin, i / steps);
    const r = enumerateRTP(config, k).rtp;
    const diff = Math.abs(r - target);
    if (diff < best.diff) best = { diff, result: enumerateRTP(config, k) };

    // Bracket found when target lies between prevR and r.
    if ((prevR - target) * (r - target) <= 0) {
      const decreasing = prevR > r;
      let lo = prevK, hi = k, result = enumerateRTP(config, k);
      for (let iter = 0; iter < config.tunerIterations; iter++) {
        const mid = (lo + hi) / 2;
        result = enumerateRTP(config, mid);
        if (Math.abs(result.rtp - target) < tol) return result;
        const higherK = decreasing ? result.rtp > target : result.rtp < target;
        if (higherK) lo = mid; else hi = mid;
      }
      return result;
    }
    prevK = k;
    prevR = r;
  }

  // Target unreachable within the scan range — return the closest achievable.
  return best.result;
}

// Empirical Monte-Carlo confirmation of the enumeration.
export function simulate(config, k, nSpins) {
  const weightOf = makeWeightOf(config, k);
  const lineBet = 1;
  const totalBet = lineBet * config.lines;
  let totalWin = 0;
  let hits = 0;
  for (let s = 0; s < nSpins; s++) {
    const { grid } = spin(config, (entry) => weightOf(entry));
    const { totalWin: w } = evaluateWin(grid, config, lineBet);
    totalWin += w;
    if (w > 0) hits++;
  }
  return { rtp: totalWin / (nSpins * totalBet), hitFrequency: hits / nSpins, spins: nSpins };
}

export default { makeWeightOf, enumerateRTP, tune, simulate };
