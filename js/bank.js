// bank.js — points ledger, bets, spin lifecycle, versioned persistence.
// PURE VANILLA: imports nothing. Works in the browser (localStorage) and in
// Node (in-memory shim) so the tests can exercise it headlessly.
//
// Persistence is a single versioned, validated state object. Anything that
// fails validation (malformed JSON, NaN/Infinity, negative balance, bad bet
// index, corrupt ledger, unknown schema version) recovers to safe defaults.

const memoryStore = new Map();
const storage = (typeof localStorage !== 'undefined' && localStorage)
  ? localStorage
  : {
      getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
      setItem: (k, v) => memoryStore.set(k, String(v)),
      removeItem: (k) => memoryStore.delete(k),
    };

const isFiniteInt = (n) => typeof n === 'number' && Number.isInteger(n) && Number.isFinite(n);
const isGrid = (g) => Array.isArray(g) && g.every((row) => Array.isArray(row) && row.every((s) => typeof s === 'string'));

export class Bank {
  constructor(config) {
    this.config = config;
    this.betSteps = config.betSteps;
    this.key = config.storage.key;
    this.schemaVersion = config.storage.schemaVersion;

    const s = this._loadState();
    this.balance = s.balance;
    this.betIndex = s.betIndex;
    this.mute = s.mute;
    this.ledger = s.ledger;

    this.pending = null;       // active wager, in-memory only
    this._seq = 0;             // per-session id counter
    this.lastSettledId = null;
  }

  // ── Defaults / validation ────────────────────────────────────────────────
  _defaultState() {
    return {
      schemaVersion: this.schemaVersion,
      balance: this.config.startingBalance,
      betIndex: 0,
      mute: false,
      ledger: [],
    };
  }

  _loadState() {
    const def = this._defaultState();
    const raw = storage.getItem(this.key);
    if (raw == null) return def;

    let parsed;
    try { parsed = JSON.parse(raw); } catch { return def; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return def;
    // Unknown / mismatched schema → reset rather than trust it.
    if (parsed.schemaVersion !== this.schemaVersion) return def;

    return {
      schemaVersion: this.schemaVersion,
      balance: (isFiniteInt(parsed.balance) && parsed.balance >= 0) ? parsed.balance : def.balance,
      betIndex: (isFiniteInt(parsed.betIndex) && parsed.betIndex >= 0 && parsed.betIndex < this.betSteps.length) ? parsed.betIndex : 0,
      mute: typeof parsed.mute === 'boolean' ? parsed.mute : false,
      ledger: this._coerceLedger(parsed.ledger),
    };
  }

  _coerceLedger(arr) {
    if (!Array.isArray(arr)) return [];
    const clean = arr.filter((e) =>
      e && typeof e === 'object' &&
      (typeof e.id === 'string' || typeof e.id === 'number') &&
      isFiniteInt(e.ts) &&
      isFiniteInt(e.lineBet) && e.lineBet >= 0 &&
      isFiniteInt(e.totalBet) && e.totalBet >= 0 &&
      isFiniteInt(e.win) && e.win >= 0 &&
      isFiniteInt(e.net) &&
      isGrid(e.grid));
    return clean.slice(0, this.config.maxLedger);
  }

  // ── Bet controls (apply to the NEXT spin) ────────────────────────────────
  get lineBet() { return this.betSteps[this.betIndex]; }
  get totalBet() { return this.lineBet * this.config.lines; }

  betUp() { if (this.betIndex < this.betSteps.length - 1) this.betIndex++; this._persist(); return this.lineBet; }
  betDown() { if (this.betIndex > 0) this.betIndex--; this._persist(); return this.lineBet; }
  maxBet() { this.betIndex = this.betSteps.length - 1; this._persist(); return this.lineBet; }

  canSpin() { return !this.pending && this.balance >= this.totalBet; }

  // ── Spin lifecycle ───────────────────────────────────────────────────────
  _nextId() { return `${Date.now().toString(36)}-${(this._seq++).toString(36)}`; }

  // Begin a spin: capture the wager, deduct it, and open a pending settlement.
  // Returns the pending object, or false if a spin is already pending or the
  // balance is insufficient.
  placeBet() {
    if (this.pending) return false;          // no second wager while pending
    if (this.balance < this.totalBet) return false;
    this.pending = {
      id: this._nextId(),
      lineBet: this.lineBet,                 // wager captured at spin start
      totalBet: this.totalBet,
    };
    this.balance -= this.pending.totalBet;
    this._persist();
    return this.pending;
  }

  // Settle the pending spin exactly once. Throws if there is no pending spin
  // (which also prevents duplicate settlement, since pending is cleared here).
  settle(win, grid) {
    if (!this.pending) throw new Error('settle() called without a pending spin');
    if (!isFiniteInt(win) || win < 0) throw new Error(`settle() win must be a non-negative integer, got ${win}`);

    const { id, lineBet, totalBet } = this.pending;
    this.balance += win;
    const entry = { id, ts: Date.now(), lineBet, totalBet, win, net: win - totalBet, grid };
    this.ledger.unshift(entry);
    if (this.ledger.length > this.config.maxLedger) this.ledger.length = this.config.maxLedger;

    this.lastSettledId = id;
    this.pending = null;
    this._persist();
    return this.balance;
  }

  // ── Points ────────────────────────────────────────────────────────────────
  addPoints(amount = this.config.addPointsAmount) {
    if (!isFiniteInt(amount) || amount <= 0) throw new Error(`addPoints() amount must be a positive integer, got ${amount}`);
    this.balance += amount;
    this._persist();
    return this.balance;
  }

  // ── Mute ────────────────────────────────────────────────────────────────
  setMute(value) { this.mute = !!value; this._persist(); return this.mute; }
  toggleMute() { return this.setMute(!this.mute); }

  // ── Misc ────────────────────────────────────────────────────────────────
  reset() {
    const def = this._defaultState();
    this.balance = def.balance;
    this.betIndex = def.betIndex;
    this.mute = def.mute;
    this.ledger = [];
    this.pending = null;
    this.lastSettledId = null;
    this._persist();
  }

  // Snapshot for the debug panel.
  getState() {
    return {
      schemaVersion: this.schemaVersion,
      balance: this.balance,
      betIndex: this.betIndex,
      lineBet: this.lineBet,
      totalBet: this.totalBet,
      mute: this.mute,
      pending: this.pending,
      ledgerCount: this.ledger.length,
      ledger: this.ledger,
    };
  }

  _persist() {
    const state = {
      schemaVersion: this.schemaVersion,
      balance: this.balance,
      betIndex: this.betIndex,
      mute: this.mute,
      ledger: this.ledger,
    };
    storage.setItem(this.key, JSON.stringify(state));
  }
}

export default Bank;
