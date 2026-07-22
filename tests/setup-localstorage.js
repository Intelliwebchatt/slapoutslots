// Test setup: provide a localStorage polyfill on globalThis BEFORE bank.js is
// imported, so the Bank exercises the real (browser) storage path and tests can
// inject corrupt/edge-case values. Must be imported before ../js/bank.js.

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

export const __store = store;
