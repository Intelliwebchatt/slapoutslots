// ui.js — Phase 1 UI helpers: paytable model, mute control labels, long-press.
// Pure vanilla: imports nothing. Config and callbacks are injected by callers
// (main.js / tests) so this stays headlessly testable.

const SYMBOL_NAMES = {
  ryder: 'Ryder',
  unc: 'Unc',
  jessie: 'Jessie',
  rose: 'Glass Rose',
  gator: 'Gator',
  jug: 'Jug',
  revolver: 'Revolver',
  boot: 'Boot',
  shell: 'Shell',
  wild: 'Wild',
  scatter: 'Scatter',
};

/** Human-readable symbol name for overlays (falls back to the key). */
export function symbolDisplayName(key) {
  return SYMBOL_NAMES[key] || key;
}

/**
 * Structured paytable rendering data derived from `config.paytable`.
 * Includes every payout entry plus the Wild / Scatter / 2-Ryder rules text.
 */
export function buildPaytableModel(config) {
  const entries = [];
  for (const [symbol, awards] of Object.entries(config.paytable)) {
    const name = symbolDisplayName(symbol);
    const counts = Object.keys(awards).map(Number).sort((a, b) => b - a);
    for (const count of counts) {
      const mult = awards[count];
      const isScatter = symbol === 'scatter';
      entries.push({
        symbol,
        name,
        count,
        multiplier: mult,
        basis: isScatter ? 'totalBet' : 'lineBet',
        label: isScatter
          ? `${count} × ${name}`
          : `${count} × ${name}`,
        pays: isScatter
          ? `${mult} × total bet`
          : `${mult} × line bet`,
      });
    }
  }

  const rules = [
    '2 × Ryder (left-aligned on a payline) awards 3 × line bet.',
    '3 × Wild awards 500 × line bet.',
    'Wild substitutes for any symbol except Scatter.',
    '3 × Scatter anywhere on the grid pays 20 × total bet (not line bet).',
  ];

  return { entries, rules, title: 'PAYTABLE' };
}

/** Visible label + ARIA state for the MUTE / SOUND control. */
export function muteControlState(mute) {
  const muted = !!mute;
  return {
    mute: muted,
    label: muted ? 'SOUND: OFF' : 'SOUND: ON',
    ariaPressed: muted,
    ariaLabel: muted ? 'Sound off. Activate to unmute.' : 'Sound on. Activate to mute.',
  };
}

/**
 * Long-press controller. Fires `onFire` only after `durationMs` of continuous
 * press; a normal tap (release early) never triggers. Injectable clock for tests.
 */
export function createLongPress({
  durationMs,
  onFire,
  now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id),
} = {}) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    throw new Error(`createLongPress() durationMs must be a positive number, got ${durationMs}`);
  }
  if (typeof onFire !== 'function') {
    throw new Error('createLongPress() requires an onFire callback');
  }

  let timer = null;
  let armedAt = null;
  let fired = false;

  function cancel() {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    armedAt = null;
  }

  function start() {
    cancel();
    fired = false;
    armedAt = now();
    timer = setTimer(() => {
      timer = null;
      fired = true;
      armedAt = null;
      onFire();
    }, durationMs);
  }

  function end() {
    // Short release before duration → no fire.
    cancel();
  }

  return {
    start,
    end,
    cancel,
    /** Test / debug helpers */
    get isArmed() { return timer != null; },
    get didFire() { return fired; },
    get armedAt() { return armedAt; },
  };
}

/**
 * Bind pointer + keyboard-safe long-press to a DOM element.
 * Pointer: press-and-hold. Keyboard: not used for accidental triggers —
 * callers that need a keyboard path should expose a separate control.
 * Returns an unbind function.
 */
export function bindLongPress(el, options) {
  const lp = createLongPress(options);
  const onDown = (e) => {
    // Ignore non-primary mouse buttons; allow touch/pen.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lp.start();
  };
  const onUp = () => lp.end();
  const onCancel = () => lp.cancel();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointerleave', onCancel);
  el.addEventListener('pointercancel', onCancel);
  // Prevent the browser from treating a long-press as text selection / context menu.
  el.addEventListener('contextmenu', (e) => e.preventDefault());

  return () => {
    lp.cancel();
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointerleave', onCancel);
    el.removeEventListener('pointercancel', onCancel);
  };
}
