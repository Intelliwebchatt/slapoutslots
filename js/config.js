// config.js — THE CONTROL ROOM
// Every tunable number in the game lives here. Nothing else in the codebase
// should contain a magic number. Pure data + no imports so it can be loaded
// in a bare browser or in Node without any dependencies.
//
// The exported `config` is deeply frozen so the base configuration is
// immutable at runtime; callers that need a variant spread it into a fresh
// object (e.g. `{ ...config, targetRTP: 0.85 }`).

const rawConfig = {
  // ── Layout ────────────────────────────────────────────────────────────
  rows: 3,
  reelCount: 3,
  lines: 5,

  // ── Symbol registry: name → { tier, texture, color, label } ──────────────
  // `color` is the Phase 1 placeholder fill; `texture` is the Phase 2 art path.
  // Every placeholder color must stay distinct from the canvas background
  // (see render.background) so no cell ever looks blank.
  symbols: {
    ryder:   { tier: 'high', texture: 'assets/symbols/sym-ryder.png',   color: 0xE8722C, label: 'RYD' },
    unc:     { tier: 'high', texture: 'assets/symbols/sym-unc.png',     color: 0xD9CBB0, label: 'UNC' },
    jessie:  { tier: 'high', texture: 'assets/symbols/sym-jessie.png',  color: 0x8C4A2F, label: 'JES' },
    rose:    { tier: 'mid',  texture: 'assets/symbols/sym-rose.png',    color: 0xC85C8E, label: 'ROSE' },
    gator:   { tier: 'mid',  texture: 'assets/symbols/sym-gator.png',   color: 0x2E4034, label: 'GTR' },
    jug:     { tier: 'mid',  texture: 'assets/symbols/sym-jug.png',     color: 0x6B8E5A, label: 'JUG' },
    revolver:{ tier: 'low',  texture: 'assets/symbols/sym-revolver.png',color: 0x8A8A8A, label: 'REV' },
    boot:    { tier: 'low',  texture: 'assets/symbols/sym-boot.png',    color: 0x5A4632, label: 'BOOT' },
    shell:   { tier: 'low',  texture: 'assets/symbols/sym-shell.png',   color: 0xB03A2E, label: 'SHEL' },
    wild:    { tier: 'wild', texture: 'assets/symbols/sym-wild.png',    color: 0xFFB347, label: 'WILD' },
    scatter: { tier: 'scatter', texture: 'assets/symbols/sym-scatter.png', color: 0x9AA7B0, label: 'SCAT' },
  },

  // Low-tier symbols whose weights the auto-tuner scales by `k`.
  lowTierSymbols: ['revolver', 'boot', 'shell'],

  // ── Per-reel strips: array of { symbol, weight } base weights ────────────
  // Each reel is an independent weighted strip. A stop shows `rows` consecutive
  // strip symbols in the window. These are "shape" — the tuner corrects RTP.
  reels: [
    [
      { symbol: 'ryder', weight: 1 },  { symbol: 'shell', weight: 6 },
      { symbol: 'gator', weight: 3 },  { symbol: 'boot', weight: 6 },
      { symbol: 'wild', weight: 1 },   { symbol: 'revolver', weight: 6 },
      { symbol: 'jug', weight: 3 },    { symbol: 'shell', weight: 6 },
      { symbol: 'unc', weight: 2 },    { symbol: 'boot', weight: 6 },
      { symbol: 'rose', weight: 3 },   { symbol: 'revolver', weight: 6 },
      { symbol: 'jessie', weight: 2 }, { symbol: 'shell', weight: 6 },
      { symbol: 'gator', weight: 3 },  { symbol: 'boot', weight: 6 },
      { symbol: 'scatter', weight: 1 },{ symbol: 'revolver', weight: 6 },
      { symbol: 'jug', weight: 3 },    { symbol: 'shell', weight: 6 },
      { symbol: 'rose', weight: 3 },   { symbol: 'boot', weight: 6 },
      { symbol: 'unc', weight: 2 },    { symbol: 'revolver', weight: 6 },
    ],
    [
      { symbol: 'shell', weight: 6 },  { symbol: 'ryder', weight: 1 },
      { symbol: 'boot', weight: 6 },   { symbol: 'gator', weight: 3 },
      { symbol: 'revolver', weight: 6 },{ symbol: 'wild', weight: 1 },
      { symbol: 'shell', weight: 6 },  { symbol: 'jug', weight: 3 },
      { symbol: 'boot', weight: 6 },   { symbol: 'unc', weight: 2 },
      { symbol: 'revolver', weight: 6 },{ symbol: 'rose', weight: 3 },
      { symbol: 'shell', weight: 6 },  { symbol: 'jessie', weight: 2 },
      { symbol: 'boot', weight: 6 },   { symbol: 'gator', weight: 3 },
      { symbol: 'revolver', weight: 6 },{ symbol: 'scatter', weight: 1 },
      { symbol: 'shell', weight: 6 },  { symbol: 'jug', weight: 3 },
      { symbol: 'boot', weight: 6 },   { symbol: 'rose', weight: 3 },
      { symbol: 'revolver', weight: 6 },{ symbol: 'unc', weight: 2 },
    ],
    [
      { symbol: 'boot', weight: 6 },   { symbol: 'gator', weight: 3 },
      { symbol: 'shell', weight: 6 },  { symbol: 'ryder', weight: 1 },
      { symbol: 'revolver', weight: 6 },{ symbol: 'jug', weight: 3 },
      { symbol: 'boot', weight: 6 },   { symbol: 'wild', weight: 1 },
      { symbol: 'shell', weight: 6 },  { symbol: 'unc', weight: 2 },
      { symbol: 'revolver', weight: 6 },{ symbol: 'rose', weight: 3 },
      { symbol: 'boot', weight: 6 },   { symbol: 'jessie', weight: 2 },
      { symbol: 'shell', weight: 6 },  { symbol: 'gator', weight: 3 },
      { symbol: 'revolver', weight: 6 },{ symbol: 'jug', weight: 3 },
      { symbol: 'boot', weight: 6 },   { symbol: 'scatter', weight: 1 },
      { symbol: 'shell', weight: 6 },  { symbol: 'rose', weight: 3 },
      { symbol: 'revolver', weight: 6 },{ symbol: 'unc', weight: 2 },
    ],
  ],

  // ── Paytable ─────────────────────────────────────────────────────────────
  // Multiplier × line bet for 3-of-a-kind left-to-right on a payline, unless
  // noted. `scatter` pays × TOTAL bet, anywhere on the grid.
  paytable: {
    ryder:    { 3: 250, 2: 3 },
    unc:      { 3: 100 },
    jessie:   { 3: 75 },
    rose:     { 3: 40 },
    gator:    { 3: 30 },
    jug:      { 3: 25 },
    revolver: { 3: 10 },
    boot:     { 3: 8 },
    shell:    { 3: 5 },
    wild:     { 3: 500 },
    scatter:  { 3: 20 }, // × total bet, anywhere
  },

  // ── Paylines ─────────────────────────────────────────────────────────────
  // Each payline lists the row index (0=top) it occupies on each reel/column.
  paylines: [
    [0, 0, 0], // top row
    [1, 1, 1], // middle row
    [2, 2, 2], // bottom row
    [0, 1, 2], // diagonal ↘
    [2, 1, 0], // diagonal ↗
  ],

  // ── Betting & bank ───────────────────────────────────────────────────────
  betSteps: [1, 2, 5, 10, 25],
  startingBalance: 1000,
  addPointsAmount: 1000,
  maxLedger: 50,

  // ── RTP target ─────────────────────────────────────────────────────────
  targetRTP: 0.94,
  rtpTolerance: 0.001,

  // ── Tuner ────────────────────────────────────────────────────────────────
  // The tuner scales low-tier weights by k. RTP(k) is U-shaped, so we scan a
  // log-spaced grid, detect every target crossing, and (by default) pick the
  // first crossing on the decreasing branch.
  tuner: {
    kMin: 1e-3,
    kMax: 50,
    scanSteps: 240,
    maxBisectIterations: 60,
    preferBranch: 'decreasing', // 'decreasing' | 'increasing'
  },

  // ── Simulation (empirical confirmation of the enumeration) ───────────────
  simulation: {
    sizes: [10000, 100000, 1000000],
    defaultSize: 100000,
    defaultSeed: 12345,
    chunkSize: 20000, // spins per async chunk (yields to the event loop between)
  },

  // ── Presentation (placeholder Pixi grid) ─────────────────────────────────
  render: {
    cell: 120,
    gap: 8,
    pad: 10,
    revealDelayMs: 120,
    background: 0x0a0f14,
    cellBorder: 0x1C2A33,
    winBorder: 0xE8722C,
    labelColor: 0x101820,
  },

  // ── UI gestures ──────────────────────────────────────────────────────────
  // Hidden debug toggle: long-press the marquee (ms). Normal taps never fire.
  ui: {
    longPressMs: 800,
  },

  // ── Storage ──────────────────────────────────────────────────────────────
  storage: {
    key: 'slapout.state',
    schemaVersion: 1,
  },

  // ── Cabinet & timings (used by reels.js / fx.js in later phases) ─────────
  cabinet: { windowX: 350, windowY: 150, windowSize: 900 },
  timings: { spinUp: 250, reelStop: 900, reelStagger: 350, anticipation: 1500 },
  volumes: { bed: -18, master: 0 },
};

// Recursively freeze so the base config is immutable.
export function deepFreeze(obj) {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const key of Object.keys(obj)) deepFreeze(obj[key]);
  }
  return obj;
}

export const config = deepFreeze(rawConfig);

export default config;
