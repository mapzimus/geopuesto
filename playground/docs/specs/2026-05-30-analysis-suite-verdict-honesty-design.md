# Analysis Suite — Verdict & Honesty Layer

- **Date:** 2026-05-30
- **Status:** Approved design, ready for implementation planning
- **Scope:** Single-feature upgrade to the playground's Monte Carlo test
- **Owner:** Max Howe (mapzimus/geopuesto)

## 1. Context

The playground's Analysis Suite already runs a real statistical test: overlay a
public dataset (USGS earthquakes) on the globe, pick a polyhedron, and ask
"do the dataset points cluster near this shape's vertices more than chance
predicts?" The engine answers honestly — it compares the observed match against
**1000 random rotations of the same shape** (so shape structure is held fixed;
only orientation varies) and reports a p-value.

The mission of this feature is to **rigorously debunk the pseudoscientific
Becker-Hagens "Earth grid"** — to let a curious person discover, with their own
hands, that the grid's apparent alignments are what you get from luck plus
trying many shapes. The math is already sound. What's missing is the
**interpretation layer**: the current output is a wall of numbers ending in a
one-line verdict, and — more importantly — it does nothing to stop a motivated
user from clicking "Run" across 40 shape/anchor/radius combinations and seizing
on the one that reads "STATISTICALLY UNUSUAL."

This spec adds two things:

1. **A verdict card** — leads with a plain-English badge + sentence, with the
   raw numbers tucked into an expander.
2. **An honesty meter** — tracks how many times you've run the test this
   session and applies a multiple-comparisons correction, so the tool can't be
   used to launder a cherry-picked result into false significance.

### What this upgrades (not greenfield)

`runMonteCarlo()` in `playground/index.html` (line 1434) already computes
`pValue` and renders a 3-branch inline verdict (lines 1525–1545) via a local
`appendLine()` helper into `#mc-result`. There is even a "USER CONTRIBUTION
POINT" comment (lines 1517–1524) inviting hand-tuned verdict phrasing. **This
spec replaces that inline verdict tail with a `window.Verdict` module call and
restructures the output into a card + meter.** The 1000-rotation null model,
`countPointsNearVertices()`, the radius slider, and the dataset loader are all
unchanged.

## 2. Goals / Non-goals

**Goals**

- Lead every result with a verdict a non-statistician understands in one read.
- Make the badge for a "significant" result *deliberately not celebratory* —
  the design intent is skepticism, not a slot-machine jackpot.
- Track session attempts and surface a Bonferroni-corrected p-value from run #2
  onward, with a narrative explaining forking paths / pre-registration.
- Keep all interpretation logic in a **pure, testable module** (`verdict.js`)
  with zero DOM and zero globals — DOM wiring stays in `index.html`.
- Add unit assertions to `geometry-tests.html` (repo root).

**Non-goals (explicitly out of scope — see §9)**

- An empirical family-wise null (re-running the null across *all* tried shapes).
- A guided/interactive walkthrough ("Tier 3").
- New datasets beyond what already ships.
- Persisting attempts across page reloads (session-only is intentional).

## 3. Architecture

```
playground/verdict.js   (NEW — pure module, no DOM, attaches window.Verdict)
   ├─ interpret(input)            → { tier, badge, color, sentence }
   └─ correctForAttempts(list)    → { n, bestRawP, bestConfig, correctedP, sessionTier }

playground/index.html   (MODIFIED)
   ├─ <script src="verdict.js">   after exportGeo.js (currently line 429)
   ├─ state.mcAttempts = []       near state.mcRadiusKm (line 506)
   ├─ #mc-honesty <div> + Reset   under #mc-result (line 383)
   └─ runMonteCarlo() tail        replace lines ~1516–1547 with:
        push attempt → render verdict card → render honesty meter

geometry-tests.html (repo root, MODIFIED)
   └─ assertions for interpret() thresholds + correctForAttempts() math
```

`verdict.js` follows the established sibling-module convention exactly: a plain
`<script>` (not an ES module) that attaches a single global, like `window.Rotation`
and `window.ShapeEngine` do. Both functions are **pure and deterministic** — same
input, same output, no `Date.now()`, no DOM reads — which is what makes them
unit-testable in `geometry-tests.html`.

## 4. `verdict.js` — the pure module

### 4.1 `interpret(input) → result`

**Input** (object):

| field | type | notes |
|---|---|---|
| `observedCount` | int | dataset points within radius of any vertex |
| `rawP` | float 0–1 | `atOrAbove / N_TRIALS` from the Monte Carlo run |
| `nDataPoints` | int | size of the loaded dataset |
| `vertexCount` | int | number of vertices in the shape |
| `radiusKm` | number | the proximity radius used |
| `datasetNoun` | string (optional) | e.g. `"earthquakes"`; defaults to `"data points"` |

> **Note — one addition to the approved 5-field signature:** `datasetNoun` is
> added as an optional 6th field so the sentence can read "…of your 700
> **earthquakes**…" instead of a generic "data points." The caller passes the
> human label for the active dataset. Defaulting keeps it backward-compatible
> and keeps the function pure.

**Output** (object): `{ tier, badge, color, sentence }`. `color` is a concrete
hex string (used directly as the badge background); `tier` is also returned so the
DOM can add a `.verdict-{tier}` class for any extra styling. Returning a concrete
`color` is what makes the §10 "striking is orange, not green" assertion meaningful.

**Tier thresholds** (half-open intervals, stated unambiguously so there is no
boundary guesswork). Hex values are starting tokens chosen for the playground's
dark theme — retune to match the `--*` CSS vars during implementation, but keep
the *relative* meaning (striking ≠ the reassuring green):

| condition on `rawP` | `tier` | `badge` | `color` (hex) |
|---|---|---|---|
| `rawP >= 0.20` | `"coincidence"` | `COINCIDENCE` | green `#3ea66a` |
| `0.05 <= rawP < 0.20` | `"nothing"` | `NOTHING UNUSUAL` | gray `#8a93a0` |
| `0.01 <= rawP < 0.05` | `"mild"` | `MILDLY UNUSUAL — read on` | amber `#e0a83a` |
| `rawP < 0.01` | `"striking"` | `STRIKING — read why` | orange `#ff7a3d` |

The `striking` badge is **orange, not green**, and its label says "read why"
rather than congratulating the user. This is the load-bearing UX decision of the
whole feature: a low p-value the user *went looking for* is a prompt to apply the
correction, not a victory.

**Sentence template** (the math is fixed; the wording is editable — preserve the
existing "USER CONTRIBUTION POINT" spirit and leave an edit comment in the code):

```
Of your {nDataPoints} {datasetNoun}, {observedCount} fell within {radiusKm} km
of one of this shape's {vertexCount} vertices. Random orientations of the same
shape matched or beat that {round(rawP*100)}% of the time{tierTail}
```

Tier tails (starting copy):

- `coincidence`: ` — about what you'd expect from luck alone.`
- `nothing`: ` — nothing that stands out from chance.`
- `mild`: ` — a little more than you'd want for a clean coincidence. Keep reading.`
- `striking`: ` — rarely. Read why before reading anything into it.`

**p-value display rule (edge case):** when `rawP === 0` (0 of 1000 rotations
matched or beat the observed count), the smallest value 1000 trials can resolve
is 0.001, so any displayed p must render as **`p < 0.001`**, never `p = 0.000`.
`round(rawP*100)` would show `0%` — acceptable in the sentence — but anywhere a
numeric p is printed, clamp the display to `< 0.001`. The stored `rawP` keeps its
true `0` value for the correction math.

### 4.2 `correctForAttempts(attempts) → result`

**Input:** `attempts` — an array of `{ rawP, config }`, one per Monte Carlo run
this session. `config` is a small descriptor used only for display:
`{ shape, anchorLat, anchorLon, spinDeg, radiusKm, datasetId }`.

**Output:** `{ n, bestRawP, bestConfig, correctedP, sessionTier }`

- `n` = `attempts.length`
- `bestRawP` = minimum `rawP` across all attempts (the most "impressive" result)
- `bestConfig` = the `config` that achieved `bestRawP`
- `correctedP` = `min(bestRawP * n, 1.0)` — **Bonferroni**, capped at 1.0
- `sessionTier` = the `tier` you get by running the §4.1 thresholds on
  `correctedP` (reuse the same four bands)

**Single-attempt rule:** when `n === 1`, `correctedP === bestRawP` (1× multiplier)
and there is no correction to apply — the caller frames this as "your clean shot"
(see §6).

## 5. Verdict card UX (`#mc-result`)

The card replaces the current flat list. Structure, top to bottom:

1. **Badge** — colored pill, text = `result.badge`, background = `result.color`.
2. **Sentence** — `result.sentence`, normal prose weight.
3. **"What does this mean?" expander** (`<details>`) — collapsed by default,
   containing the diagnostic lines that `runMonteCarlo()` currently prints
   always: the shape/anchor/spin line, dataset size, radius in km + degrees,
   OBSERVED count, NULL DISTRIBUTION (min/median/mean/max + middle-95%), the
   numeric p-value (with the `< 0.001` clamp), and compute time. Nothing is lost
   — it's demoted, not deleted.

`#mc-result` currently has `white-space: pre-wrap` for plain-text lines; the card
needs real elements (a pill div + a `<details>`), so that inline style is
replaced with normal block layout. Badge colors should reference existing CSS
custom properties where they exist and add four small classes
(`.verdict-coincidence/.nothing/.mild/.striking`) otherwise.

## 6. Honesty meter UX (`#mc-honesty`)

A new `<div id="mc-honesty">` directly below `#mc-result`, plus a **Reset session**
button. Driven by `state.mcAttempts` and `Verdict.correctForAttempts(...)`.

**Run #1 (`n === 1`)** — framed as the clean shot:

> **Attempt 1 — your clean shot.** One shape, one test. The p-value above means
> what it says.

**Run #2+ (`n >= 2`)** — persistent meter:

- `Attempts this session: {n}`
- `Best result so far: {p display} — {bestConfig summary}`
  (e.g. `p < 0.001 — rhombicTriacontahedron @ 42.5,-70.9, spin 18°, 250 km, earthquakes`)
- `Corrected for {n} tries (Bonferroni): {correctedP display}` + a session badge
  rendered from `sessionTier` (same four bands, same deliberately-non-triumphant
  styling)
- **Forking-paths narrative:**

  > Every shape, anchor, spin, and radius you try is another roll of the dice.
  > Try enough combinations and one *will* look striking by pure chance. The
  > corrected value multiplies your best raw p by the number of tries — the
  > honest way to read a result you went hunting for. The clean version of this
  > test is one shape, chosen *before* you looked at the data (pre-registration).

- **Footnote caveat** (open, small):

  > Footnote: Bonferroni assumes your tries were independent. They aren't quite —
  > a cube and a cuboctahedron share structure, so some "tries" overlap, which
  > means this correction slightly *over*-penalizes. We round toward skepticism
  > on purpose: a result that survives an over-strict correction is real; one
  > that doesn't, you haven't lost much by doubting.

**Reset session** button: clears `state.mcAttempts = []`, hides/zeroes the meter,
and the next run is "Attempt 1 — your clean shot" again. Label it
`Reset session (start a clean shot)`.

## 7. Integration points (exact)

| Location in `playground/index.html` | Change |
|---|---|
| line 429 (after `exportGeo.js`) | add `<script src="verdict.js"></script>` |
| line 383 (after `#mc-result`) | add `<div id="mc-honesty">` + Reset button |
| line 506 (next to `mcRadiusKm`) | add `mcAttempts: []` to `state` |
| `runMonteCarlo()` lines ~1516–1547 | after `pValue` is computed: (1) push `{ rawP: pValue, config }` to `state.mcAttempts`; (2) call `Verdict.interpret(...)` and render the §5 card; (3) call `Verdict.correctForAttempts(state.mcAttempts)` and render the §6 meter. The diagnostic `appendLine` block moves inside the card's expander. |
| Reset button handler | clears `state.mcAttempts`, re-renders the meter |

**Session-only, not shared:** `state.mcAttempts` is deliberately **not** added to
`currentShareConfig()` (line 1553). A shared link should restore the *test setup*
(shape, anchor, radius, dataset — already serialized via `mcRadiusKm` /
`analysisSource`), but every visitor starts their own clean shot. Attempt count is
personal session honesty state, not part of the configuration.

## 8. Edge cases (consolidated)

- `rawP === 0` → display `p < 0.001`; store `0` for the math.
- `correctedP` capped at `1.0` (never report > 1).
- `n === 1` → no correction; `correctedP === bestRawP`; "clean shot" framing.
- **Switching datasets still counts as an attempt** — any `runMonteCarlo()`
  completion pushes to `mcAttempts`, regardless of what the user changed. Hunting
  across datasets is just as much forking-paths as hunting across shapes.
- Reset returns to the Attempt-1 state cleanly (meter hidden, array empty).

## 9. Out of scope (do not build now — noted so the plan doesn't drift)

- **Approach B — empirical family-wise null** ("rigorous mode" toggle that
  re-runs the null distribution across the actual set of shapes tried). More
  correct than Bonferroni for correlated shapes, but heavier; revisit only if the
  feature gets real traffic.
- **Tier 3 interactive demo / guided walkthrough.**
- **New datasets.**
- **Cross-reload persistence of attempts.**

## 10. Testing (`geometry-tests.html`)

Add a `Verdict` test group:

**`interpret()` tier boundaries** (assert `tier` and `badge` at each edge):

| `rawP` | expected `tier` |
|---|---|
| `0.25` | `coincidence` |
| `0.20` | `coincidence` |
| `0.19` | `nothing` |
| `0.05` | `nothing` |
| `0.049` | `mild` |
| `0.01` | `mild` |
| `0.009` | `striking` |
| `0` | `striking` |

Also assert the `striking` color is the orange value (not the green
`coincidence` value) — this guards the "not triumphant" decision against a future
accidental swap.

**`correctForAttempts()` math:**

- 14 attempts each `rawP = 0.02` → `bestRawP === 0.02`, `correctedP === 0.28`.
- 60 attempts each `rawP = 0.02` → `1.2` → **capped at `1.0`**.
- 1 attempt `rawP = 0.03` → `n === 1`, `correctedP === 0.03` (no correction).
- mixed `rawP` values → `bestRawP` is the min and `bestConfig` is its config.

## 11. File manifest

**Create:**
- `playground/verdict.js`

**Modify:**
- `playground/index.html` (script tag, state field, `#mc-honesty` markup, Reset
  handler, `runMonteCarlo()` tail, four badge CSS classes)
- `geometry-tests.html` (repo root, Verdict test group)
