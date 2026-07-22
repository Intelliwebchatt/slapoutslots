// rtp.js — exhaustive RTP enumeration + branch-aware auto-tuner + deterministic
// simulation.
//
// PURE VANILLA: imports NOTHING. The engine (spin/window/grid/evaluate helpers)
// is injected by the caller (main.js and the tests), keeping this module fully
// decoupled. Internal calculations are kept unrounded; formatting is the
// caller's job.

// Weight function factory: scales low-tier symbol weights by k.
export function makeWeightOf(config, k) {
  const low = new Set(config.lowTierSymbols);
  return (entry) => (low.has(entry.symbol) ? entry.weight * k : entry.weight);
}

// ── Exact enumeration ─────────────────────────────────────────────────────
// Enumerate every weighted stop combination and compute an exact RTP report.
// lineBet is fixed at 1; RTP = expectedPayout / totalBetUnits (lines × 1).
export function enumerateRTP(config, engine, k = 1) {
  const { windowForStop, columnsToGrid, evaluateWin } = engine;
  const lineBet = 1;
  const totalBetUnits = lineBet * config.lines;
  const weightOf = makeWeightOf(config, k);

  // Precompute each reel's stop windows and normalized stop probabilities.
  const reelData = config.reels.map((strip) => {
    let total = 0;
    const weights = strip.map((e) => { const w = weightOf(e); total += w; return w; });
    const windows = strip.map((_, i) => windowForStop(strip, i, config.rows));
    return { windows, probs: weights.map((w) => w / total), n: strip.length };
  });

  const [r0, r1, r2] = reelData;
  let expectedPayout = 0;
  let totalProbability = 0;
  let hitProb = 0, netPosProb = 0, breakEvenProb = 0, lossProb = 0;
  let maxWin = 0, maxWinGrid = null;
  let combinationCount = 0;
  const symbolContribution = {};
  const paylineContribution = {};
  let scatterEV = 0;

  for (let i = 0; i < r0.n; i++) {
    const p0 = r0.probs[i], col0 = r0.windows[i];
    for (let j = 0; j < r1.n; j++) {
      const p01 = p0 * r1.probs[j], col1 = r1.windows[j];
      for (let m = 0; m < r2.n; m++) {
        const p = p01 * r2.probs[m];
        combinationCount++;
        totalProbability += p;

        const grid = columnsToGrid([col0, col1, r2.windows[m]], config.rows);
        const { totalWin, lineWins, scatter } = evaluateWin(grid, config, lineBet);

        expectedPayout += p * totalWin;

        // Outcome classification (net = returned − staked).
        const net = totalWin - totalBetUnits;
        if (totalWin > 0) hitProb += p;
        if (net > 0) netPosProb += p;
        else if (net === 0) breakEvenProb += p;
        else lossProb += p;

        if (totalWin > maxWin) { maxWin = totalWin; maxWinGrid = grid; }

        for (const lw of lineWins) {
          symbolContribution[lw.symbol] = (symbolContribution[lw.symbol] || 0) + p * lw.pay;
          paylineContribution[lw.line] = (paylineContribution[lw.line] || 0) + p * lw.pay;
        }
        if (scatter) {
          symbolContribution.scatter = (symbolContribution.scatter || 0) + p * scatter.pay;
          scatterEV += p * scatter.pay;
        }
      }
    }
  }

  const rtp = expectedPayout / totalBetUnits;

  // Express contributions as fractions of total bet (i.e. RTP contribution),
  // so Σ(symbolContribution) === rtp and Σ(paylineContribution)+scatter === rtp.
  const toRtpFraction = (evMap) => {
    const out = {};
    for (const [key, ev] of Object.entries(evMap)) out[key] = ev / totalBetUnits;
    return out;
  };

  return {
    k,
    rtp,
    expectedPayout,
    totalBetUnits,
    combinationCount,
    totalProbability,
    hitFrequency: hitProb,
    anyAwardFrequency: hitProb,
    netPositiveFrequency: netPosProb,
    breakEvenFrequency: breakEvenProb,
    lossFrequency: lossProb,
    maxWin,
    maxWinGrid,
    symbolContribution: toRtpFraction(symbolContribution),
    paylineContribution: toRtpFraction(paylineContribution),
    scatterContribution: scatterEV / totalBetUnits,
  };
}

// ── Branch-aware tuner ─────────────────────────────────────────────────────
// Scans a log-spaced grid of k, detects every target crossing, classifies each
// as decreasing/increasing branch, and bisects the preferred crossing. Never
// silently claims success: returns success:false when no valid crossing exists
// or tolerance cannot be reached.
export function tune(config, engine) {
  const target = config.targetRTP;
  const tol = config.rtpTolerance;
  const { kMin, kMax, scanSteps, maxBisectIterations, preferBranch } = config.tuner;

  // Sample the curve.
  const samples = [];
  for (let i = 0; i <= scanSteps; i++) {
    const k = kMin * Math.pow(kMax / kMin, i / scanSteps);
    samples.push({ k, rtp: enumerateRTP(config, engine, k).rtp });
  }

  // Curve diagnostics.
  let minRtp = Infinity, maxRtp = -Infinity, minRtpK = kMin;
  for (const s of samples) {
    if (s.rtp < minRtp) { minRtp = s.rtp; minRtpK = s.k; }
    if (s.rtp > maxRtp) maxRtp = s.rtp;
  }
  const curveShape = (minRtpK > samples[0].k && minRtpK < samples[samples.length - 1].k)
    ? 'u-shaped' : 'monotonic';

  // Detect all sampled crossings.
  const crossings = [];
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if ((a.rtp - target) * (b.rtp - target) <= 0 && a.rtp !== b.rtp) {
      crossings.push({
        kLow: a.k, kHigh: b.k, rtpLow: a.rtp, rtpHigh: b.rtp,
        branch: a.rtp > b.rtp ? 'decreasing' : 'increasing',
      });
    }
  }

  const diagnostics = { scanSteps, kMin, kMax, minRtp, maxRtp, minRtpK, curveShape, crossingCount: crossings.length };

  // No crossing at all → target unreachable within the scan range.
  if (crossings.length === 0) {
    let best = samples[0];
    for (const s of samples) if (Math.abs(s.rtp - target) < Math.abs(best.rtp - target)) best = s;
    const report = enumerateRTP(config, engine, best.k);
    return {
      success: false,
      reason: 'no-crossing',
      targetRTP: target, actualRTP: report.rtp, difference: report.rtp - target,
      tunedK: best.k, iterations: 0, branch: null, bracket: null,
      crossings, diagnostics, report,
    };
  }

  // Prefer the first crossing on the requested branch; else the first crossing.
  const chosen = crossings.find((c) => c.branch === preferBranch) || crossings[0];

  // Bisect within the chosen bracket.
  let lo = chosen.kLow, hi = chosen.kHigh;
  const decreasing = chosen.branch === 'decreasing';
  let report = enumerateRTP(config, engine, (lo + hi) / 2);
  let iterations = 0;
  for (; iterations < maxBisectIterations; iterations++) {
    const mid = (lo + hi) / 2;
    report = enumerateRTP(config, engine, mid);
    if (Math.abs(report.rtp - target) < tol) break;
    const needHigherK = decreasing ? report.rtp > target : report.rtp < target;
    if (needHigherK) lo = mid; else hi = mid;
  }

  const difference = report.rtp - target;
  return {
    success: Math.abs(difference) < tol,
    reason: Math.abs(difference) < tol ? 'ok' : 'tolerance-not-reached',
    targetRTP: target, actualRTP: report.rtp, difference,
    tunedK: report.k, iterations,
    branch: chosen.branch,
    bracket: { kLow: chosen.kLow, kHigh: chosen.kHigh, rtpLow: chosen.rtpLow, rtpHigh: chosen.rtpHigh },
    crossings, diagnostics, report,
  };
}

// ── Simulation ─────────────────────────────────────────────────────────────
// Synchronous simulation for tests. rng is injected (seed for determinism).
export function simulate(config, engine, { k = 1, spins, rng }) {
  const weightOf = makeWeightOf(config, k);
  const totalBet = config.lines; // lineBet 1
  let totalWin = 0, hits = 0;
  for (let s = 0; s < spins; s++) {
    const { grid } = engine.spin(config, rng, (e) => weightOf(e));
    const { totalWin: w } = engine.evaluateWin(grid, config, 1);
    totalWin += w;
    if (w > 0) hits++;
  }
  return { rtp: totalWin / (spins * totalBet), hitFrequency: hits / spins, spins };
}

// Non-blocking chunked simulation for the browser. Deterministic for a given
// seed + spin count + config. Yields to the event loop between chunks so mobile
// browsers do not freeze. Supports progress reporting and cancellation.
export async function simulateChunked(config, engine, opts = {}) {
  const {
    k = 1,
    spins,
    seed = config.simulation.defaultSeed,
    chunkSize = config.simulation.chunkSize,
    onProgress,
    shouldCancel,
  } = opts;

  const rng = engine.seededRng(seed);
  const weightOf = makeWeightOf(config, k);
  const totalBet = config.lines;
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const started = now();

  let done = 0, totalWin = 0, hits = 0;
  while (done < spins) {
    if (shouldCancel && shouldCancel()) {
      return {
        cancelled: true, seed, requested: spins, spins: done,
        rtp: done ? totalWin / (done * totalBet) : 0,
        hitFrequency: done ? hits / done : 0,
        elapsedMs: now() - started,
      };
    }
    const n = Math.min(chunkSize, spins - done);
    for (let i = 0; i < n; i++) {
      const { grid } = engine.spin(config, rng, (e) => weightOf(e));
      const { totalWin: w } = engine.evaluateWin(grid, config, 1);
      totalWin += w;
      if (w > 0) hits++;
    }
    done += n;
    if (onProgress) {
      onProgress({
        done, requested: spins, fraction: done / spins,
        rtp: totalWin / (done * totalBet), hitFrequency: hits / done,
        elapsedMs: now() - started,
      });
    }
    // Yield so the UI stays responsive.
    await new Promise((r) => setTimeout(r, 0));
  }

  return {
    cancelled: false, seed, requested: spins, spins: done,
    rtp: totalWin / (done * totalBet),
    hitFrequency: hits / done,
    elapsedMs: now() - started,
  };
}

export default { makeWeightOf, enumerateRTP, tune, simulate, simulateChunked };
