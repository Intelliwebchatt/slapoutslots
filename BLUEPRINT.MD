# SLAPOUT GOLD — Ryder McCoy Slot Machine Build Blueprint

A 3×3, 5-payline video slot for rydermccoy.com. Fully static, no build step, deployed on Netlify. WebGL rendering via PixiJS, animation via GSAP, audio via Howler. All game math is pure vanilla JS with a mathematically exact, tunable RTP. All art is custom-made by you to specs defined below.

**Legal note:** points only, never real money. Put "For entertainment only — no purchase, no prizes" in the footer. Keeps it clean given the sweepstakes-adjacent world.

---

## 1. Repo Structure

```
slapout-slots/
├── index.html
├── css/
│   └── slots.css              (page shell, loading screen, responsive frame)
├── js/
│   ├── main.js                (bootstrap: load assets, wire modules)
│   ├── config.js              ★ THE CONTROL ROOM — all tunable math lives here
│   ├── engine.js              (RNG, spin resolution, win evaluation — pure vanilla)
│   ├── rtp.js                 (exhaustive enumeration + auto-tuner — pure vanilla)
│   ├── bank.js                (points ledger, bets, localStorage — pure vanilla)
│   ├── reels.js               (PixiJS reel rendering, spin animation)
│   ├── fx.js                  (GSAP win sequences, particles, filters, screen shake)
│   ├── ui.js                  (buttons, bet controls, paytable overlay, debug panel)
│   └── audio.js               (Howler: layers, ducking, anticipation riser)
├── assets/
│   ├── symbols/               (11 PNGs — see manifest)
│   ├── cabinet/               (background, frame, marquee)
│   ├── ui/                    (buttons, meters)
│   └── audio/                 (loops + stingers, mp3/webm)
└── tests/
    └── math.test.html         (opens in browser, runs engine + RTP assertions)
```

Rule that keeps this maintainable: **engine.js, rtp.js, and bank.js import nothing.** If every CDN on earth died, the math still runs in a bare browser console.

---

## 2. Art Asset Manifest (what you create)

### 2.1 Symbols — 11 pieces

| File | Symbol | Tier | Notes |
|---|---|---|---|
| `sym-ryder.png` | Ryder McCoy portrait | High 1 | Top payer. Hat brim shadow, eyes visible |
| `sym-unc.png` | Unc portrait | High 2 | Wild-eyed preacher energy |
| `sym-jessie.png` | Jessie portrait | High 3 | Smoke curl, cracked-belt attitude |
| `sym-rose.png` | Glass Rose | Mid 1 | Catalog callback, translucent look |
| `sym-gator.png` | Gator head | Mid 2 | Jaws slightly open |
| `sym-jug.png` | Moonshine jug | Mid 3 | XXX brand, cork |
| `sym-revolver.png` | Rusted revolver | Low 1 | |
| `sym-boot.png` | Muddy boot | Low 2 | |
| `sym-shell.png` | Shotgun shell | Low 3 | |
| `sym-wild.png` | "R" brand iron (glowing) | Wild | Substitutes for everything except Scatter |
| `sym-scatter.png` | The Warning (storm cloud + lightning) | Scatter | Pays anywhere; triggers bonus in Phase 4 |

**Symbol technical spec — every symbol identical format:**

- Canvas: **512 × 512 px**, PNG-24 with transparency
- Safe zone: keep all artwork inside a centered **440 × 440** area. The outer margin is reserved for the engine's glow/pulse effects on wins — art that touches the edge will look clipped when it glows
- Consistent framing: subject fills roughly the same visual mass in every symbol, centered. Portraits cropped the same way (shoulders-up) across all three characters
- One light source, same direction on all 11 (suggest: warm rim light from upper-left, like a bare bulb over the machine)
- Thick, readable silhouettes. Test: shrink to 96 px — if you can't instantly ID it, simplify. Reels move fast
- No baked-in drop shadows or outer glows — the engine adds those dynamically

### 2.2 Cabinet & environment

| File | Size | What it is |
|---|---|---|
| `bg-scene.png` | 1920 × 1080 | The room: back corner of a Slapout gas station at night. Dim, neon beer sign spill, moths. Reels sit on top of this |
| `cabinet-frame.png` | 1600 × 1200, transparency | The machine body: rusted steel, chipped paint, duct-tape repair, cigarette burns. Has a **transparent rectangular window** where the 3×3 reels show through — make that window exactly **900 × 900** centered horizontally, and note its x/y offset for config.js |
| `marquee.png` | 1200 × 300, transparency | Lit top sign: "SLAPOUT GOLD" (or your name). This is the piece the whole machine is remembered by — half-burnt-out letters, buzzing-neon vibe |
| `payline-guides.png` | optional | Faint etched line markers on the cabinet edges numbering paylines 1–5 |

### 2.3 UI pieces

| File | Size | Notes |
|---|---|---|
| `btn-spin.png` / `btn-spin-down.png` | 320 × 320 | Big physical arcade button. Worn center from use |
| `btn-bet-up.png` / `btn-bet-down.png` | 160 × 160 | |
| `btn-max.png` | 200 × 160 | "MAX BET" |
| `meter-plate.png` | 500 × 140 | Backplate for BALANCE / BET / WIN readouts (three uses of same plate) |

### 2.4 Style guide (keeps 20+ pieces feeling like one machine)

- Palette anchor (adjust to taste, but pick 5 and stay inside them): swamp green `#2E4034`, rust `#8C4A2F`, bone `#D9CBB0`, midnight `#101820`, ember `#E8722C`
- Ember is the *scarce* color — reserve it for the Wild, the marquee, and win moments so it reads as "money"
- Texture over gloss: this machine has lived in that gas station since 1987
- Export everything at the listed sizes; the engine scales down, never up

---

## 3. Game Math

### 3.1 Layout

- 3 reels × 3 rows, **5 paylines**: top row, middle row, bottom row, diagonal ↘, diagonal ↗
- Each reel is an independent weighted strip (array of `{symbol, weight}` entries), spun by its own RNG call
- RNG: `crypto.getRandomValues` mapped to cumulative weight ranges — no `Math.random()`

### 3.2 Draft paytable (multiplier × line bet, 3-of-a-kind left-to-right on a payline)

| Combo | Pays |
|---|---|
| 3 × Ryder | 250 |
| 3 × Unc | 100 |
| 3 × Jessie | 75 |
| 3 × Glass Rose | 40 |
| 3 × Gator | 30 |
| 3 × Jug | 25 |
| 3 × Revolver | 10 |
| 3 × Boot | 8 |
| 3 × Shell | 5 |
| 2 × Ryder (line, left-aligned) | 3 |
| 3 × Wild | 500 |
| Wild substitutes | any symbol except Scatter |
| 3 × Scatter (anywhere on grid) | 20 × **total** bet |

These numbers are *shape*, not final — the tuner makes the RTP exact regardless, so tweak them for feel (how big should a Ryder hit feel?) and let the weights absorb the correction.

### 3.3 Betting & bank (bank.js)

- Balance in points, persisted to localStorage (same pattern as FreePlayRoute)
- Bet = line bet × 5 lines. Line bet steps: 1 / 2 / 5 / 10 / 25
- "Add Points" button credits a configurable amount (e.g., +1,000) — it's a toy bank, be generous
- Ledger array of recent results for a history panel: `{ts, bet, win, grid}`

### 3.4 RTP engine (rtp.js) — the part that makes RTP a dial

**Exact enumeration, not simulation.** Each reel has N stop positions. A stop shows 3 consecutive strip symbols in the window. Total outcomes = N₁ × N₂ × N₃ weighted stop combinations — with ~24-stop strips that's ~13,800 combos, evaluated in under 50 ms.

```
for every (stop1, stop2, stop3):
    p = w(stop1)/W1 × w(stop2)/W2 × w(stop3)/W3
    pay = evaluate 5 lines + scatter on the resulting 3×3 grid
    expectedPay += p × pay
RTP = expectedPay / totalBetUnits
```

**Auto-tuner:** config.js declares `targetRTP: 0.94`. The tuner applies one scaling parameter `k` that multiplies the weights of low-tier symbols (raising k floods the reels with cheap symbols → RTP falls; lowering k does the reverse). Binary search k over ~30 iterations until `|RTP − target| < 0.001`. Runs on page load in milliseconds. Change `targetRTP` to 0.85 or 0.97, refresh, done — the RTP is *provably* what you set, not an estimate.

**Debug panel** (toggle with `?debug=1` or a long-press on the marquee): live display of enumerated RTP, tuned k, hit frequency, per-symbol contribution to RTP, plus a "simulate 1M spins" button that empirically confirms the enumeration. Pure investigator-brand: the machine shows its math.

### 3.5 config.js — the control room

Everything tunable in one file: symbol registry (name → texture path → tier), per-reel strips with base weights, paytable, paylines, `targetRTP`, bet steps, starting balance, add-points amount, cabinet window offsets, animation timings, volume levels. Nothing else in the codebase contains a magic number.

---

## 4. Presentation Layer

### 4.1 Stack (CDN, pinned versions, no build)

```html
<script src="https://cdn.jsdelivr.net/npm/pixi.js@8.x/dist/pixi.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.x/gsap.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.x/howler.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pixi-filters@6.x/dist/pixi-filters.min.js"></script>
```

(Pin exact versions in Cursor when you scaffold — grab current stable patch releases.)

### 4.2 Spin feel (reels.js + fx.js)

1. **Spin-up:** all 3 reels accelerate over ~250 ms; motion blur filter ramps in
2. **Cruise:** constant high speed, symbols streaking, reel tick audio
3. **Staggered stops:** reel 1 at ~900 ms, reel 2 +350 ms, reel 3 +350 ms. Each stop uses GSAP `back.out` easing — overshoot half a symbol, settle with a mechanical *thunk*
4. **Anticipation (the signature moment):** if reels 1–2 land two matching high symbols or two scatters on a live line, reel 3 drops to a slow crawl for +1.5 s, heat-shimmer displacement filter over it, audio riser builds, cabinet edge-lights pulse ember. This single moment is where the machine earns its keep — spend the polish budget here
5. **Wins:** winning line draws itself across the grid, winning symbols pulse with glow (that's the 440-px safe zone paying off), count-up ticker on the WIN meter, ember particle burst scaled to win size, screen shake only on 50×+ wins
6. **Jackpot (3 Ryder or 3 Wild):** full takeover — lightning flash on bg-scene, marquee strobes, ambient ducks under a "The Warning" sting

### 4.3 Audio layers (audio.js)

- Bed: low swamp-night loop (crickets, distant thunder), −18 dB under everything
- Mechanical: reel ticks, stop thunks, button press
- Musical: anticipation riser, win stingers in 3 sizes, jackpot sting
- All win audio ducks the bed via Howler volume tweens; mute toggle persisted in localStorage

---

## 5. Build Phases (Cursor workflow)

**Phase 1 — Math core, ugly on purpose.** engine.js, rtp.js, bank.js, config.js + tests/math.test.html. Render the grid as flat colored squares with letters in plain Pixi. Exit criteria: enumeration and 1M-spin simulation agree within 0.3%, tuner hits any target you type, all payline evaluations pass hand-checked cases. *Do not touch art until this is locked.*

**Phase 2 — Your art drops in.** Create the 20 assets to the manifest specs, load via Pixi Assets, position cabinet window from config offsets. Because Phase 1 was placeholder-driven, this is pure asset swap — zero logic changes.

**Phase 3 — Juice.** GSAP spin choreography, anticipation system, filters, particles, Howler layers, debug panel polish, responsive scaling (Pixi stage letterboxed, min touch target 48 px — most players hit this from a phone via the artist site).

**Phase 4 (optional) — Free spins bonus.** 3 scatters → 8 free spins with a heavier-weighted bonus strip set. ⚠️ This changes the math: RTP = base-game EV + trigger-probability × feature EV. The enumerator must compute feature EV separately and fold it in before tuning. Ship Phases 1–3 first; the machine is complete without this.

---

## 6. Suggested First Cursor Prompt

> "Scaffold Phase 1 of this blueprint: config.js, engine.js, rtp.js, bank.js, tests/math.test.html, and a minimal index.html + main.js that renders the 3×3 grid as placeholder colored squares in PixiJS from CDN. Engine/rtp/bank must be dependency-free ES modules. Implement the exhaustive RTP enumeration and binary-search tuner exactly as specified in §3.4, with the debug panel behind ?debug=1."

Then iterate module by module. Keep this file in the repo root as `BLUEPRINT.md` so Cursor's context always has the spec.
