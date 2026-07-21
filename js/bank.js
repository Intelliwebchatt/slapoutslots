// bank.js — points ledger, bets, localStorage persistence.
// PURE VANILLA: imports nothing. Works in the browser (localStorage) and in
// Node (in-memory shim) so the math tests can exercise it headlessly.

const memoryStore = new Map();
const storage = (typeof localStorage !== 'undefined' && localStorage)
  ? localStorage
  : {
      getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
      setItem: (k, v) => memoryStore.set(k, String(v)),
      removeItem: (k) => memoryStore.delete(k),
    };

const KEY_BALANCE = 'slapout.balance';
const KEY_LEDGER = 'slapout.ledger';
const KEY_BETIDX = 'slapout.betIndex';

export class Bank {
  constructor(config) {
    this.config = config;
    this.betSteps = config.betSteps;

    const savedBalance = storage.getItem(KEY_BALANCE);
    this.balance = savedBalance != null ? Number(savedBalance) : config.startingBalance;

    const savedBetIdx = storage.getItem(KEY_BETIDX);
    this.betIndex = savedBetIdx != null ? Number(savedBetIdx) : 0;

    try {
      this.ledger = JSON.parse(storage.getItem(KEY_LEDGER) || '[]');
    } catch {
      this.ledger = [];
    }
  }

  get lineBet() { return this.betSteps[this.betIndex]; }
  get totalBet() { return this.lineBet * this.config.lines; }

  betUp() {
    if (this.betIndex < this.betSteps.length - 1) this.betIndex++;
    this._persistBet();
    return this.lineBet;
  }

  betDown() {
    if (this.betIndex > 0) this.betIndex--;
    this._persistBet();
    return this.lineBet;
  }

  maxBet() {
    this.betIndex = this.betSteps.length - 1;
    this._persistBet();
    return this.lineBet;
  }

  canSpin() { return this.balance >= this.totalBet; }

  // Deduct the bet at the start of a spin. Returns false if insufficient.
  placeBet() {
    if (!this.canSpin()) return false;
    this.balance -= this.totalBet;
    this._persistBalance();
    return true;
  }

  // Record the settled spin: credit the win and push to the ledger.
  settle(win, grid) {
    if (win > 0) this.balance += win;
    this.ledger.unshift({ ts: Date.now(), bet: this.totalBet, win, grid });
    if (this.ledger.length > this.config.maxLedger) this.ledger.length = this.config.maxLedger;
    this._persistBalance();
    this._persistLedger();
    return this.balance;
  }

  addPoints(amount = this.config.addPointsAmount) {
    this.balance += amount;
    this._persistBalance();
    return this.balance;
  }

  reset() {
    this.balance = this.config.startingBalance;
    this.betIndex = 0;
    this.ledger = [];
    this._persistBalance();
    this._persistBet();
    this._persistLedger();
  }

  _persistBalance() { storage.setItem(KEY_BALANCE, this.balance); }
  _persistBet() { storage.setItem(KEY_BETIDX, this.betIndex); }
  _persistLedger() { storage.setItem(KEY_LEDGER, JSON.stringify(this.ledger)); }
}

export default Bank;
