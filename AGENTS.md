# AGENTS.md

## Cursor Cloud specific instructions

### What this repo is
`slapoutslots` (SLAPOUT GOLD) is a **static, no-build** 3×3 PixiJS slot machine described in `BLUEPRINT.MD`. There is no backend and no bundler — the browser loads ES modules from `js/` directly and pulls PixiJS/GSAP/Howler from CDNs. Only **Phase 1** of the blueprint is implemented so far: the dependency-free math core plus a placeholder colored-square grid.

### Single service: the static site
There is exactly one thing to run — a static file server for the repo root. Standard commands live in `package.json` (`scripts`); don't duplicate them, just use them:
- Run (dev): `npm run dev` → serves the site at `http://localhost:8000` (uses `python3 -m http.server`; any static server works, since there is no build step).
- Test: `npm test` → `node --test` runs `tests/math.test.js` headlessly and offline. There is also an in-browser mirror at `http://localhost:8000/tests/math.test.html`.
- Lint: `npm run lint` → ESLint (flat config in `eslint.config.js`).

### Non-obvious caveats (read before editing)
- `js/engine.js`, `js/rtp.js`, and `js/bank.js` are intentionally **dependency-free** and must run in **both** the browser and Node. `engine.js` uses `globalThis.crypto` (Web Crypto, present in Node 18+); `bank.js` falls back to an in-memory shim when `localStorage` is absent. Keep them import-free (the only allowed import is `rtp.js` → `engine.js`) so the math still runs in a bare console.
- **RTP as a function of the tuner knob `k` is U-shaped, not monotonic.** Flooding the reels with cheap-but-still-paying symbols first lowers RTP, then raises it again. `rtp.js#tune()` therefore scans a log grid and bisects the *first* (decreasing-branch) target crossing. Do **not** "simplify" it back to a plain monotonic binary search — that diverges.
- CDN libraries (PixiJS et al.) are fetched at runtime, so the **browser needs network egress**; the pure math (tests, tuner) needs none.
- Phase 1 renders placeholder colored squares. Keep every symbol's placeholder `color` in `js/config.js` visually distinct from the canvas background (`0x0a0f14`) — the scatter symbol was invisible when set to near-black midnight.
- The in-game debug panel (live RTP, tuned `k`, per-symbol contribution, "Simulate 1M spins") is gated behind the `?debug=1` query param.
