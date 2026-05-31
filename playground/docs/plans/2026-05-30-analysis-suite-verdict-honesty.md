# Analysis Suite — Verdict & Honesty Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Monte Carlo test's wall-of-numbers output with a plain-English verdict card, and add a session honesty meter that applies a Bonferroni multiple-comparisons correction so the tool can't be used to launder a cherry-picked "STRIKING" result into false significance.

**Architecture:** A new pure module `playground/verdict.js` (zero DOM, zero globals beyond `window.Verdict`, fully deterministic) owns all interpretation math — `interpret()`, `correctForAttempts()`, and a `formatP()` display helper. `playground/index.html` imports it as a plain `<script>` (matching the existing `rotation.js` / `shapeEngine.js` convention) and does only DOM wiring: pushing each run to `state.mcAttempts`, rendering the verdict card into `#mc-result`, and rendering the honesty meter into a new `#mc-honesty`. Unit tests live in the existing repo-root harness `geometry-tests.html`.

**Tech Stack:** Vanilla ES6 (no build, no npm, no bundler). Single static HTML app + sibling `.js` modules, all loaded via CDN/relative `<script>` tags. Browser-based test harness (`geometry-tests.html`) served over a local static server.

**Spec:** `playground/docs/specs/2026-05-30-analysis-suite-verdict-honesty-design.md`

---

## Critical context for the engineer

You have **zero context** on this codebase. Read this section before Task 1.

- **Two apps, one repo.** Repo root is `C:\Users\mhowe\Documents\dev\geopuesto`. The feature lives entirely in `playground/index.html` (a spherical-geometry playground) and a new sibling `playground/verdict.js`. The repo-root `index.html` is a *different* app — do not touch it.
- **Module convention (copy it exactly).** Sibling modules are plain `<script>` files (NOT ES modules), each an IIFE that attaches ONE global. Example, `playground/rotation.js`:
  ```js
  (function (window) {
    'use strict';
    if (!window.Geometry) {
      throw new Error('Rotation: window.Geometry must be loaded first');
    }
    const G = window.Geometry;
    // ... functions ...
    window.Rotation = { /* public API */ };
  })(window);
  ```
  `verdict.js` follows the same shape but has **no dependency** — it does arithmetic and string formatting only — so it omits the `if (!window.Geometry) throw` guard.
- **The test harness is `geometry-tests.html` at the repo ROOT.** (The spec text says `v2-tests.html`; that file does not exist — it is a stale name. This plan uses the real file. A sub-task at the end corrects the spec.) The harness loads `geometry.js` at line 66 and defines private helpers inside one big IIFE (lines 68–530): `record(section, label, ok, detail)`, `isTrue(label, section, ok, detail)`, `near(label, section, actual, expected, tol, units)`, `el(...)`. Because the helpers are private to that IIFE, **every test group must be a nested IIFE inside it** (see the existing `roundTrip` / `polarEdgeCase` groups). The summary chips are written at lines 520–522, just after the last test group (which closes at line 515).
- **Running tests = open the harness in a browser.** There is no CLI test runner. Serve the repo root over a static server and open the page; the green/red rows and the pass/fail chips are the result. Exact commands are in each task.
- **Shell working directory gotcha.** Your shell may open in an unrelated directory. **Always** pass absolute paths or `git -C "C:/Users/mhowe/Documents/dev/geopuesto"` for git. Relative `Read`/`Glob`/`Edit` paths may resolve to the wrong repo — use absolute paths for every file op in this plan.
- **Do NOT commit unless the plan's commit step says so**, and never amend.
- **A benign PostToolUse hook error** (`python3 ".../check-sql-files.py" ... No such file or directory`) prints on every Edit/Write. It is unrelated environmental noise from a broken plugin; your edits still succeed. Ignore it.

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `playground/verdict.js` | Pure interpretation module. `interpret(input)→{tier,badge,color,sentence}`, `correctForAttempts(attempts)→{n,bestRawP,bestConfig,correctedP,sessionTier}`, `formatP(p)→string`. No DOM, no globals beyond `window.Verdict`. | **Create** |
| `geometry-tests.html` (repo root) | Browser test harness. Gains a `<script src="playground/verdict.js">` tag and two new test-group IIFEs. | **Modify** |
| `playground/index.html` | DOM wiring only: `<script>` tag, `state.mcAttempts`, `#mc-honesty` markup + Reset button, four `.verdict-*` CSS classes, `runMonteCarlo()` tail rewrite, three new render helpers, Reset handler. | **Modify** |
| `playground/docs/specs/2026-05-30-analysis-suite-verdict-honesty-design.md` | Correct the stale `v2-tests.html` → `geometry-tests.html` references. | **Modify (final sub-task)** |

## Test-running commands (used by every task)

From the **repo root**, start a static server (the harness loads `playground/verdict.js` and `geometry.js` via relative paths):

```bash
cd "C:/Users/mhowe/Documents/dev/geopuesto"
python -m http.server 8000
# If `python` is not on PATH, use the full interpreter path from CLAUDE.md:
#   "C:/Users/mhowe/AppData/Local/Python/bin/python.exe" -m http.server 8000
```

Then open **http://localhost:8000/geometry-tests.html** in a browser. Look at:
- The **summary chips** at the top (`N passed`, `N failed`, `N total`).
- The new **`Verdict · …`** section(s) — every row should show a green `✓`.

> **Agentic executor note:** instead of a human eyeball, you may verify with the Playwright MCP: `browser_navigate` to the URL, then `browser_evaluate` returning `document.getElementById('chip-fail').textContent` (expect `"0 failed"`) and the text of the `Verdict · …` section. Either method satisfies the "run the test" steps below.

---

## Task 1: `verdict.js` — `interpret()` + `formatP()` with unit tests

**Files:**
- Create: `playground/verdict.js`
- Modify: `geometry-tests.html` (add `<script>` tag after line 66; add test group after line 515)

This task builds the verdict classifier (tier → badge/color/sentence) and the `formatP` display clamp, fully test-driven.

- [ ] **Step 1: Wire the (not-yet-existing) module into the harness**

In `geometry-tests.html`, find line 66:

```html
  <script src="geometry.js"></script>
```

Change it to add the verdict module immediately after (the harness is at repo root, so the path is `playground/verdict.js`):

```html
  <script src="geometry.js"></script>
  <script src="playground/verdict.js"></script>
```

- [ ] **Step 2: Write the failing test group**

In `geometry-tests.html`, find the end of the last existing test group and the summary-update block (lines 515–520):

```js
        isTrue('exactly the synthetic on-ring city is returned', sec, ok, detail);
      })();

      // ---------------------------------------------------------------------
      // Update header summary
      // ---------------------------------------------------------------------
```

Insert the new test group between the `})();` (line 515) and the `// Update header summary` comment (line 517):

```js
        isTrue('exactly the synthetic on-ring city is returned', sec, ok, detail);
      })();

      // ---------------------------------------------------------------------
      // Verdict module — interpret() tier boundaries + color guard (spec §10)
      // ---------------------------------------------------------------------
      (function verdictInterpret() {
        const sec = 'Verdict · interpret() tiers';
        const V = window.Verdict;
        // Defensive: if verdict.js failed to load, record one clean red row
        // instead of throwing (which would abort the summary update below).
        if (!V || typeof V.interpret !== 'function') {
          isTrue('verdict.js loaded and exposes interpret()', sec, false,
                 'window.Verdict.interpret missing');
          return;
        }

        function tierAt(rawP) {
          return V.interpret({ observedCount: 1, rawP: rawP, nDataPoints: 10,
                               vertexCount: 12, radiusKm: 250 }).tier;
        }
        // Half-open bands: [0.20,∞)=coincidence, [0.05,0.20)=nothing,
        // [0.01,0.05)=mild, [0,0.01)=striking.
        const cases = [
          [0.25, 'coincidence'], [0.20, 'coincidence'],
          [0.19, 'nothing'],     [0.05, 'nothing'],
          [0.049, 'mild'],       [0.01, 'mild'],
          [0.009, 'striking'],   [0, 'striking'],
        ];
        for (const c of cases) {
          const got = tierAt(c[0]);
          isTrue('rawP ' + c[0] + ' → ' + c[1], sec, got === c[1], 'got "' + got + '"');
        }

        // Color guard: striking must NOT be the reassuring green of coincidence.
        const striking = V.interpret({ observedCount: 1, rawP: 0.001, nDataPoints: 10,
                                       vertexCount: 12, radiusKm: 250 });
        const coincidence = V.interpret({ observedCount: 1, rawP: 0.5, nDataPoints: 10,
                                          vertexCount: 12, radiusKm: 250 });
        isTrue('striking color ≠ coincidence color', sec,
               striking.color !== coincidence.color,
               'striking=' + striking.color + ' coincidence=' + coincidence.color);
        isTrue('striking color is the orange token', sec,
               striking.color === '#ff7a3d', 'got ' + striking.color);
        isTrue('striking badge says "read why"', sec,
               /read why/i.test(striking.badge), 'got "' + striking.badge + '"');

        // datasetNoun: default vs provided.
        const def = V.interpret({ observedCount: 3, rawP: 0.5, nDataPoints: 700,
                                  vertexCount: 32, radiusKm: 250 });
        isTrue('sentence uses default noun "data points"', sec,
               def.sentence.indexOf('data points') !== -1, def.sentence);
        const quake = V.interpret({ observedCount: 3, rawP: 0.5, nDataPoints: 700,
                                    vertexCount: 32, radiusKm: 250, datasetNoun: 'earthquakes' });
        isTrue('sentence uses provided noun "earthquakes"', sec,
               quake.sentence.indexOf('700 earthquakes') !== -1, quake.sentence);

        // formatP clamp (spec §4.1 / §8): 0 → "p < 0.001".
        isTrue('formatP(0) clamps to "p < 0.001"', sec,
               V.formatP(0) === 'p < 0.001', 'got "' + V.formatP(0) + '"');
        isTrue('formatP(0.123) → "p = 0.123"', sec,
               V.formatP(0.123) === 'p = 0.123', 'got "' + V.formatP(0.123) + '"');
      })();

      // ---------------------------------------------------------------------
      // Update header summary
      // ---------------------------------------------------------------------
```

- [ ] **Step 3: Run to verify it fails**

Start the server and open the harness (see "Test-running commands" above).
Expected: the **`Verdict · interpret() tiers`** section shows ONE red row — `✗ verdict.js loaded and exposes interpret()` — because `playground/verdict.js` doesn't exist yet (404 → `window.Verdict` undefined). The chips still update (the defensive guard prevents an abort). `failed` count is ≥ 1.

- [ ] **Step 4: Create the module to make it pass**

Create `playground/verdict.js` with this exact content:

```js
/**
 * Geopuesto playground — Verdict & Honesty interpretation module.
 *
 * Pure, deterministic, DOM-free. Turns a Monte Carlo p-value into a
 * plain-English verdict, and turns a session's worth of attempts into a
 * Bonferroni-corrected honesty readout. All wording is editable; the math
 * (tier thresholds, Bonferroni multiplier, p-display clamp) is fixed.
 *
 * Design intent: DEBUNK, not celebrate. A low p-value the user went looking
 * for is a prompt to apply the correction — never a jackpot. The "striking"
 * tier is deliberately orange ("read why"), not a triumphant green.
 *
 * Spec: docs/specs/2026-05-30-analysis-suite-verdict-honesty-design.md
 *
 * No dependencies — attaches window.Verdict. Loaded as a plain <script>,
 * same convention as rotation.js / shapeEngine.js.
 */
(function (window) {
  'use strict';

  /**
   * Classify a raw p-value into one of four tiers. Half-open bands:
   *   [0.20, ∞)   → coincidence
   *   [0.05, 0.20) → nothing
   *   [0.01, 0.05) → mild
   *   [0, 0.01)   → striking
   * Returns the tier id, badge text, badge color (hex), and the sentence tail.
   * Shared by interpret() and correctForAttempts() so the bands never drift.
   */
  function tierOf(rawP) {
    if (rawP >= 0.20) {
      return { tier: 'coincidence', badge: 'COINCIDENCE', color: '#3ea66a',
               tail: ' — about what you\'d expect from luck alone.' };
    }
    if (rawP >= 0.05) {
      return { tier: 'nothing', badge: 'NOTHING UNUSUAL', color: '#8a93a0',
               tail: ' — nothing that stands out from chance.' };
    }
    if (rawP >= 0.01) {
      return { tier: 'mild', badge: 'MILDLY UNUSUAL — read on', color: '#e0a83a',
               tail: ' — a little more than you\'d want for a clean coincidence. Keep reading.' };
    }
    return { tier: 'striking', badge: 'STRIKING — read why', color: '#ff7a3d',
             tail: ' — rarely. Read why before reading anything into it.' };
  }

  /**
   * Format a p-value for any NUMERIC display. 1000 trials can't resolve below
   * 0.001, so 0 (and anything below the floor) renders as "p < 0.001". The
   * stored rawP keeps its true 0 for the correction math.
   */
  function formatP(p) {
    if (p < 0.001) return 'p < 0.001';
    return 'p = ' + p.toFixed(3);
  }

  /**
   * Interpret a single Monte Carlo result.
   *
   * input: { observedCount, rawP, nDataPoints, vertexCount, radiusKm, datasetNoun? }
   * returns: { tier, badge, color, sentence }
   */
  function interpret(input) {
    const observedCount = input.observedCount;
    const rawP = input.rawP;
    const nDataPoints = input.nDataPoints;
    const vertexCount = input.vertexCount;
    const radiusKm = input.radiusKm;
    const datasetNoun = input.datasetNoun || 'data points';

    const t = tierOf(rawP);

    // === USER CONTRIBUTION POINT (Verdict phrasing) ===
    // The tier math above is fixed; this sentence is the most user-facing
    // string in the feature. Keep the skeptical, non-triumphant tone. The
    // tier tail (t.tail) carries the per-tier nudge.
    const pct = Math.round(rawP * 100);
    const sentence =
      'Of your ' + nDataPoints + ' ' + datasetNoun + ', ' + observedCount +
      ' fell within ' + radiusKm + ' km of one of this shape\'s ' + vertexCount +
      ' vertices. Random orientations of the same shape matched or beat that ' +
      pct + '% of the time' + t.tail;
    // ===================================================

    return { tier: t.tier, badge: t.badge, color: t.color, sentence: sentence };
  }

  /**
   * Apply a multiple-comparisons correction across a session's attempts.
   *
   * attempts: array of { rawP, config } — one per completed Monte Carlo run.
   *   config = { shape, anchorLat, anchorLon, spinDeg, radiusKm, datasetId }
   * returns: { n, bestRawP, bestConfig, correctedP, sessionTier }
   *
   * correctedP = min(bestRawP * n, 1.0)  — Bonferroni, capped at 1.0.
   * When n === 1 there is nothing to correct (correctedP === bestRawP).
   */
  function correctForAttempts(attempts) {
    const n = attempts.length;
    let bestRawP = Infinity;
    let bestConfig = null;
    for (let i = 0; i < n; i++) {
      if (attempts[i].rawP < bestRawP) {
        bestRawP = attempts[i].rawP;
        bestConfig = attempts[i].config;
      }
    }
    const correctedP = Math.min(bestRawP * n, 1.0);
    return {
      n: n,
      bestRawP: bestRawP,
      bestConfig: bestConfig,
      correctedP: correctedP,
      sessionTier: tierOf(correctedP).tier,
    };
  }

  window.Verdict = {
    interpret: interpret,
    correctForAttempts: correctForAttempts,
    formatP: formatP,
  };

})(window);
```

- [ ] **Step 5: Run to verify it passes**

Reload **http://localhost:8000/geometry-tests.html**.
Expected: the **`Verdict · interpret() tiers`** section shows all green `✓` (18 rows: 8 tier boundaries + 1 color-≠ + 1 orange-token + 1 read-why + 2 datasetNoun + 2 formatP). The `failed` chip returns to its prior count (0 if it was 0 before).

- [ ] **Step 6: Commit**

```bash
git -C "C:/Users/mhowe/Documents/dev/geopuesto" add playground/verdict.js geometry-tests.html
git -C "C:/Users/mhowe/Documents/dev/geopuesto" commit -m "$(cat <<'EOF'
feat(playground): add verdict.js interpret() + formatP() with tests

Pure interpretation module for the Analysis Suite. interpret() classifies a
Monte Carlo p-value into four deliberately-non-triumphant tiers (striking is
orange "read why", not green). formatP() clamps sub-0.001 p-values to
"p < 0.001". Unit tests cover all tier boundaries and the color guard in
geometry-tests.html.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `verdict.js` — `correctForAttempts()` Bonferroni math with unit tests

**Files:**
- Modify: `playground/verdict.js` (function already added in Task 1 — this task only adds its tests; if you split strictly, the function lives here)
- Modify: `geometry-tests.html` (add a second test group)

> **Note:** `correctForAttempts()` is already in the Task 1 module code above (it shares `tierOf` with `interpret`). This task adds its dedicated test group and verifies the math. If you prefer strict red-green, you may temporarily comment out `correctForAttempts` in `verdict.js` before Step 1, but it is simpler to keep it and just add the tests.

- [ ] **Step 1: Write the test group**

In `geometry-tests.html`, find the closing of the `verdictInterpret` group you added in Task 1:

```js
        isTrue('formatP(0.123) → "p = 0.123"', sec,
               V.formatP(0.123) === 'p = 0.123', 'got "' + V.formatP(0.123) + '"');
      })();

      // ---------------------------------------------------------------------
      // Update header summary
      // ---------------------------------------------------------------------
```

Insert the second group between that `})();` and the `// Update header summary` comment:

```js
        isTrue('formatP(0.123) → "p = 0.123"', sec,
               V.formatP(0.123) === 'p = 0.123', 'got "' + V.formatP(0.123) + '"');
      })();

      // ---------------------------------------------------------------------
      // Verdict module — correctForAttempts() Bonferroni math (spec §10)
      // ---------------------------------------------------------------------
      (function verdictCorrect() {
        const sec = 'Verdict · correctForAttempts()';
        const V = window.Verdict;
        if (!V || typeof V.correctForAttempts !== 'function') {
          isTrue('verdict.js exposes correctForAttempts()', sec, false,
                 'window.Verdict.correctForAttempts missing');
          return;
        }

        function mk(rawP, tag) { return { rawP: rawP, config: { shape: tag } }; }

        // 14 attempts each 0.02 → best 0.02, corrected 0.02 * 14 = 0.28.
        const a14 = [];
        for (let i = 0; i < 14; i++) a14.push(mk(0.02, 's' + i));
        const r14 = V.correctForAttempts(a14);
        isTrue('n = 14', sec, r14.n === 14, 'got ' + r14.n);
        near('bestRawP = 0.02', sec, r14.bestRawP, 0.02, 1e-12);
        near('correctedP = 0.28', sec, r14.correctedP, 0.28, 1e-12);
        isTrue('sessionTier(0.28) = coincidence', sec,
               r14.sessionTier === 'coincidence', 'got ' + r14.sessionTier);

        // 60 attempts each 0.02 → 1.2, capped at 1.0.
        const a60 = [];
        for (let i = 0; i < 60; i++) a60.push(mk(0.02, 'x'));
        const r60 = V.correctForAttempts(a60);
        near('correctedP capped at 1.0', sec, r60.correctedP, 1.0, 1e-12);

        // 1 attempt 0.03 → no correction; corrected === best.
        const r1 = V.correctForAttempts([mk(0.03, 'solo')]);
        isTrue('n = 1', sec, r1.n === 1, 'got ' + r1.n);
        near('correctedP === bestRawP (no correction)', sec, r1.correctedP, 0.03, 1e-12);
        isTrue('sessionTier(0.03) = mild', sec, r1.sessionTier === 'mild',
               'got ' + r1.sessionTier);

        // Mixed values → bestRawP is the min and bestConfig is its config.
        const mixed = V.correctForAttempts([mk(0.4, 'A'), mk(0.05, 'B'), mk(0.2, 'C')]);
        near('bestRawP is the min (0.05)', sec, mixed.bestRawP, 0.05, 1e-12);
        isTrue('bestConfig is the min\'s config (B)', sec,
               !!mixed.bestConfig && mixed.bestConfig.shape === 'B',
               'got ' + (mixed.bestConfig && mixed.bestConfig.shape));
      })();

      // ---------------------------------------------------------------------
      // Update header summary
      // ---------------------------------------------------------------------
```

- [ ] **Step 2: Run to verify it passes**

Reload **http://localhost:8000/geometry-tests.html**.
Expected: a new **`Verdict · correctForAttempts()`** section, all green (10 rows). `failed` chip unchanged (0).

> If you chose the strict red-green path and commented out `correctForAttempts` first: this run shows the single red `✗ verdict.js exposes correctForAttempts()` row. Restore the function in `verdict.js`, reload, confirm green.

- [ ] **Step 3: Commit**

```bash
git -C "C:/Users/mhowe/Documents/dev/geopuesto" add geometry-tests.html playground/verdict.js
git -C "C:/Users/mhowe/Documents/dev/geopuesto" commit -m "$(cat <<'EOF'
test(playground): cover correctForAttempts() Bonferroni math

Asserts best-p selection, the n× multiplier, the 1.0 cap, the n===1
no-correction case, and that sessionTier reuses the interpret() bands.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire the verdict card into `runMonteCarlo()`

**Files:**
- Modify: `playground/index.html` (script tag line 429; `state.mcAttempts` line 506; four CSS classes before line 136; `datasetNoun()` helper + `runMonteCarlo()` tail lines ~1517–1547)

This task replaces the flat number-list output with the verdict card (badge pill + sentence + collapsed diagnostics expander). The honesty meter comes in Task 4 — for now `runMonteCarlo()` will call a `renderHonestyMeter()` you stub here and flesh out next.

- [ ] **Step 1: Load the module**

In `playground/index.html`, find line 429:

```html
  <script src="exportGeo.js"></script>
```

Add the verdict module after it (sibling path — `index.html` is inside `playground/`):

```html
  <script src="exportGeo.js"></script>
  <script src="verdict.js"></script>
```

- [ ] **Step 2: Add session-attempts state**

Find the `mcRadiusKm` line in the `state` object (line 506):

```js
        mcRadiusKm: 250,  // Monte Carlo search radius (km) for vertex-vs-dataset proximity test
      };
```

Add `mcAttempts` (session-only — deliberately NOT added to `currentShareConfig()`):

```js
        mcRadiusKm: 250,  // Monte Carlo search radius (km) for vertex-vs-dataset proximity test
        // Honesty meter: one entry per completed run this session,
        // { rawP, config }. Session-only — NOT serialized into share links;
        // every visitor starts their own clean shot.
        mcAttempts: [],
      };
```

- [ ] **Step 3: Add the four badge CSS classes**

Find the end of the `<style>` block (lines 130–136):

```css
    /* Honor reduced-motion: kill the toast slide/fade transition for users
       who opt out of animation (the globe is drag-only, no auto-rotate). */
    @media (prefers-reduced-motion: reduce) {
      .toast { transition: none; }
      .control-row button { transition: none; }
    }
  </style>
```

Add the verdict badge classes just before `</style>`:

```css
    /* Honor reduced-motion: kill the toast slide/fade transition for users
       who opt out of animation (the globe is drag-only, no auto-rotate). */
    @media (prefers-reduced-motion: reduce) {
      .toast { transition: none; }
      .control-row button { transition: none; }
    }

    /* Verdict badge pill. Colors mirror verdict.js tierOf() — JS also sets
       background-color inline from result.color, so these class colors are a
       fallback. Dark text reads on all four mid-bright backgrounds. */
    .verdict-badge {
      display: inline-block; padding: 4px 12px; border-radius: 999px;
      font-family: var(--mono); font-size: 12px; font-weight: 700;
      letter-spacing: 0.04em; color: #0a0e14; margin-bottom: 8px;
    }
    .verdict-coincidence { background: #3ea66a; }
    .verdict-nothing     { background: #8a93a0; }
    .verdict-mild        { background: #e0a83a; }
    .verdict-striking    { background: #ff7a3d; }
  </style>
```

- [ ] **Step 4: Replace the `runMonteCarlo()` verdict tail**

In `playground/index.html`, find this exact block (lines 1517–1547 — the `USER CONTRIBUTION POINT` comment through the final `Compute time` line):

```js
        // === USER CONTRIBUTION POINT (Verdict phrasing) ===
        // TODO (Max): edit the three branches below — this is the most
        // user-facing string in the whole feature. The math is fixed; the
        // wording isn't. Some options to consider:
        //   "STATISTICALLY UNUSUAL — only N/1000 random rotations matched or beat this"
        //   "Random rotations rarely match this — p = 0.0XX"
        //   "12 out of 1000 random orientations did at least as well"
        // ===
        let verdict;
        if (pValue < 0.05) {
          verdict = 'STATISTICALLY UNUSUAL — the observed match beat ' + (100 - 100 * pValue).toFixed(1) + '% of random rotations (p = ' + pValue.toFixed(3) + ').';
        } else if (pValue < 0.20) {
          verdict = 'MARGINALLY UNUSUAL — observed beats ' + (100 - 100 * pValue).toFixed(0) + '% of random rotations (p = ' + pValue.toFixed(3) + '). Not strong evidence either way.';
        } else {
          verdict = 'TYPICAL — this is what you would expect by chance (p = ' + pValue.toFixed(3) + ').';
        }

        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);
        appendLine('Polyhedron: ' + state.shape + ' (' + nV + ' vertices) anchored at ' + state.anchor.lat.toFixed(2) + ', ' + state.anchor.lon.toFixed(2) + ', spin ' + state.spinDeg + '°');
        appendLine('Dataset: ' + lastDatasetFeatures.length + ' points');
        appendLine('Radius: ' + R_KM + ' km (' + (R_KM / EARTH_R * 180 / Math.PI).toFixed(2) + '° of arc)');
        appendLine('');
        appendLine('OBSERVED: ' + observed + ' dataset points within ' + R_KM + ' km of any vertex');
        appendLine('NULL DISTRIBUTION (' + N_TRIALS + ' random rotations):');
        appendLine('  min ' + minC + ' · median ' + median + ' · mean ' + mean.toFixed(1) + ' · max ' + maxC);
        appendLine('  middle 95% ≈ [' + p025 + ', ' + p975 + ']');
        appendLine('p-value: ' + pValue.toFixed(3) + '  (' + (pValue * N_TRIALS) + ' of ' + N_TRIALS + ' random rotations matched or exceeded the observed count)');
        appendLine('');
        appendLine(verdict);
        appendLine('');
        appendLine('Compute time: ' + (t1 - t0).toFixed(0) + ' ms');
      }
```

Replace the whole block with:

```js
        // --- Verdict & Honesty layer (spec docs/specs/2026-05-30-…) ---
        // Build this run's config descriptor (spec §4.2 schema). Used by the
        // honesty meter and the attempt log.
        const sourceEl = document.getElementById('analysis-source');
        const config = {
          shape: state.shape,
          anchorLat: state.anchor.lat,
          anchorLon: state.anchor.lon,
          spinDeg: state.spinDeg,
          radiusKm: R_KM,
          datasetId: sourceEl ? sourceEl.value : null,
        };
        // Every completed run is an attempt — switching dataset/shape and
        // re-running is exactly the forking-paths behavior the meter surfaces.
        state.mcAttempts.push({ rawP: pValue, config: config });

        // Plain-English verdict (pure module, spec §4.1).
        const verdict = window.Verdict.interpret({
          observedCount: observed,
          rawP: pValue,
          nDataPoints: lastDatasetFeatures.length,
          vertexCount: nV,
          radiusKm: R_KM,
          datasetNoun: datasetNoun(config.datasetId),
        });

        // --- Render the verdict card into #mc-result ---
        while (resultEl.firstChild) resultEl.removeChild(resultEl.firstChild);

        const badge = document.createElement('div');
        badge.className = 'verdict-badge verdict-' + verdict.tier;
        badge.style.backgroundColor = verdict.color;  // spec §5: background = result.color
        badge.textContent = verdict.badge;
        resultEl.appendChild(badge);

        const sentenceEl = document.createElement('p');
        sentenceEl.style.margin = '0 0 10px';
        sentenceEl.textContent = verdict.sentence;
        resultEl.appendChild(sentenceEl);

        // Diagnostics, demoted into a collapsed expander — nothing is lost.
        const details = document.createElement('details');
        details.style.whiteSpace = 'pre-wrap';  // preserve the indented number lines
        const summaryEl = document.createElement('summary');
        summaryEl.textContent = 'What does this mean?';
        summaryEl.style.cursor = 'pointer';
        details.appendChild(summaryEl);
        function diag(text) {
          const d = document.createElement('div');
          d.textContent = text;
          details.appendChild(d);
        }
        diag('Polyhedron: ' + state.shape + ' (' + nV + ' vertices) anchored at ' + state.anchor.lat.toFixed(2) + ', ' + state.anchor.lon.toFixed(2) + ', spin ' + state.spinDeg + '°');
        diag('Dataset: ' + lastDatasetFeatures.length + ' points');
        diag('Radius: ' + R_KM + ' km (' + (R_KM / EARTH_R * 180 / Math.PI).toFixed(2) + '° of arc)');
        diag('');
        diag('OBSERVED: ' + observed + ' dataset points within ' + R_KM + ' km of any vertex');
        diag('NULL DISTRIBUTION (' + N_TRIALS + ' random rotations):');
        diag('  min ' + minC + ' · median ' + median + ' · mean ' + mean.toFixed(1) + ' · max ' + maxC);
        diag('  middle 95% ≈ [' + p025 + ', ' + p975 + ']');
        diag(window.Verdict.formatP(pValue) + '  (' + atOrAbove + ' of ' + N_TRIALS + ' random rotations matched or exceeded the observed count)');
        diag('');
        diag('Compute time: ' + (t1 - t0).toFixed(0) + ' ms');
        resultEl.appendChild(details);

        // Honesty meter (Task 4 fills this in).
        renderHonestyMeter();
      }
```

- [ ] **Step 5: Add the `datasetNoun()` helper and a `renderHonestyMeter()` stub**

`runMonteCarlo()` now calls `datasetNoun(...)` and `renderHonestyMeter()`. Add both as function declarations (they hoist, so placement is flexible) immediately AFTER the `runMonteCarlo()` closing brace. Find the end of `runMonteCarlo` and the comment that follows (originally lines 1548–1552):

```js
        diag('Compute time: ' + (t1 - t0).toFixed(0) + ' ms');
        resultEl.appendChild(details);

        // Honesty meter (Task 4 fills this in).
        renderHonestyMeter();
      }

      // ---------------------------------------------------------------
      // Sprint C — Share + Export from current state
      // ---------------------------------------------------------------
```

Insert the helpers between `runMonteCarlo`'s closing `}` and the `// Sprint C` comment:

```js
        // Honesty meter (Task 4 fills this in).
        renderHonestyMeter();
      }

      // Human plural noun for the active dataset, used in verdict copy.
      // All current options are USGS earthquakes; volcanoes is the planned next.
      function datasetNoun(sourceValue) {
        if (sourceValue && sourceValue.indexOf('volcano') !== -1) return 'volcanoes';
        return 'earthquakes';
      }

      // Renders the session honesty meter into #mc-honesty. Fully implemented
      // in Task 4; this stub keeps runMonteCarlo() working in the meantime.
      function renderHonestyMeter() { /* Task 4 */ }

      // ---------------------------------------------------------------
      // Sprint C — Share + Export from current state
      // ---------------------------------------------------------------
```

- [ ] **Step 6: Verify the card renders in the browser**

Start the server (or reuse it) and open the **playground** (NOT the test harness):

```bash
cd "C:/Users/mhowe/Documents/dev/geopuesto"
python -m http.server 8000
# open http://localhost:8000/playground/index.html
```

In the page: scroll to **Analysis Suite**, click **Load + render** (waits for USGS fetch), click a **quick-pick polyhedron** (e.g. "Becker-Hagens (32 verts)"), then click **Run Monte Carlo**. Expected:
- A colored **badge pill** (one of COINCIDENCE / NOTHING UNUSUAL / MILDLY UNUSUAL / STRIKING) appears in `#mc-result`.
- A one-sentence plain-English summary below it (e.g. "Of your 700 earthquakes, 3 fell within 250 km …").
- A collapsed **"What does this mean?"** expander; clicking it reveals the old diagnostic lines (OBSERVED / NULL DISTRIBUTION / p / compute time), with the p-line reading `p = 0.xxx` or `p < 0.001`.
- The browser console (open devtools) shows **no errors**.

> Agentic executor: verify with Playwright MCP — `browser_navigate` to the playground URL, `browser_evaluate` to click the buttons (or call the handlers), then assert `document.querySelector('#mc-result .verdict-badge')` is non-null and `browser_console_messages` has no errors.

- [ ] **Step 7: Commit**

```bash
git -C "C:/Users/mhowe/Documents/dev/geopuesto" add playground/index.html
git -C "C:/Users/mhowe/Documents/dev/geopuesto" commit -m "$(cat <<'EOF'
feat(playground): verdict card replaces flat Monte Carlo output

runMonteCarlo() now logs each run to state.mcAttempts, calls
Verdict.interpret(), and renders a badge pill + plain-English sentence with
the diagnostic numbers demoted into a "What does this mean?" expander. Adds
the datasetNoun() helper, four .verdict-* badge CSS classes, and a
renderHonestyMeter() stub (filled in next task).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Honesty meter + Reset session button

**Files:**
- Modify: `playground/index.html` (`#mc-honesty` + Reset markup after line 383; `renderHonestyMeter()` + `describeConfig()` bodies; Reset handler near line 1345)

This task fills in the meter: clean-shot framing on run #1, and from run #2 the attempts count, best result, Bonferroni-corrected p with a session badge, the forking-paths narrative, and the footnote.

- [ ] **Step 1: Add the meter markup + Reset button**

In `playground/index.html`, find the `#mc-result` div and its container close (lines 383–384):

```html
      <div id="mc-result" style="margin-top: 10px; font-family: var(--mono); font-size: 12px; line-height: 1.55; color: var(--fg); white-space: pre-wrap;"></div>
    </div>
```

The card needs real block elements, so drop `white-space: pre-wrap` from `#mc-result` (the diagnostics expander sets its own), and add the meter + Reset button after it:

```html
      <div id="mc-result" style="margin-top: 10px; font-family: var(--mono); font-size: 12px; line-height: 1.55; color: var(--fg);"></div>
      <div id="mc-honesty" style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed var(--border); font-family: var(--mono); font-size: 12px; line-height: 1.55; color: var(--fg); display: none;"></div>
      <button id="mc-reset-btn" style="margin-top: 10px; display: none;">Reset session (start a clean shot)</button>
    </div>
```

- [ ] **Step 2: Implement `renderHonestyMeter()` and `describeConfig()`**

Replace the Task 3 stub. Find:

```js
      // Renders the session honesty meter into #mc-honesty. Fully implemented
      // in Task 4; this stub keeps runMonteCarlo() working in the meantime.
      function renderHonestyMeter() { /* Task 4 */ }
```

Replace it with the full implementation plus the config formatter:

```js
      // Formats a config descriptor for the "best result" line, e.g.
      // "rhombicTriacontahedron @ 42.5,-70.9, spin 18°, 250 km, earthquakes".
      function describeConfig(c) {
        if (!c) return '(no runs)';
        return c.shape + ' @ ' + c.anchorLat.toFixed(1) + ',' + c.anchorLon.toFixed(1) +
               ', spin ' + c.spinDeg + '°, ' + c.radiusKm + ' km, ' + datasetNoun(c.datasetId);
      }

      // Renders the session honesty meter into #mc-honesty (spec §6). Run #1 is
      // the "clean shot"; run #2+ shows the Bonferroni-corrected readout. Both
      // the meter and the Reset button hide when there are no attempts.
      function renderHonestyMeter() {
        const host = document.getElementById('mc-honesty');
        const resetBtn = document.getElementById('mc-reset-btn');
        if (!host) return;
        while (host.firstChild) host.removeChild(host.firstChild);

        const attempts = state.mcAttempts;
        if (!attempts || attempts.length === 0) {
          host.style.display = 'none';
          if (resetBtn) resetBtn.style.display = 'none';
          return;
        }
        host.style.display = 'block';
        if (resetBtn) resetBtn.style.display = 'inline-block';

        const summary = window.Verdict.correctForAttempts(attempts);

        function line(text) {
          const d = document.createElement('div');
          d.textContent = text;
          host.appendChild(d);
        }

        // Run #1 — the clean shot.
        if (summary.n === 1) {
          const h = document.createElement('div');
          h.style.fontWeight = '700';
          h.textContent = 'Attempt 1 — your clean shot.';
          host.appendChild(h);
          line('One shape, one test. The p-value above means what it says.');
          return;
        }

        // Run #2+ — persistent meter.
        line('Attempts this session: ' + summary.n);
        line('Best result so far: ' + window.Verdict.formatP(summary.bestRawP) +
             ' — ' + describeConfig(summary.bestConfig));

        // Corrected p + a session badge (reuse the module so colors never drift).
        const correctedRow = document.createElement('div');
        correctedRow.style.margin = '6px 0';
        correctedRow.appendChild(document.createTextNode(
          'Corrected for ' + summary.n + ' tries (Bonferroni): ' +
          window.Verdict.formatP(summary.correctedP) + '  '));
        const sInfo = window.Verdict.interpret({
          observedCount: 0, rawP: summary.correctedP, nDataPoints: 0,
          vertexCount: 0, radiusKm: 0,
        });
        const sBadge = document.createElement('span');
        sBadge.className = 'verdict-badge verdict-' + summary.sessionTier;
        sBadge.style.backgroundColor = sInfo.color;
        sBadge.style.fontSize = '11px';
        sBadge.textContent = sInfo.badge;
        correctedRow.appendChild(sBadge);
        host.appendChild(correctedRow);

        // Forking-paths narrative.
        const narrative = document.createElement('p');
        narrative.style.margin = '8px 0';
        narrative.textContent =
          'Every shape, anchor, spin, and radius you try is another roll of the dice. ' +
          'Try enough combinations and one will look striking by pure chance. The corrected ' +
          'value multiplies your best raw p by the number of tries — the honest way to read a ' +
          'result you went hunting for. The clean version of this test is one shape, chosen ' +
          'before you looked at the data (pre-registration).';
        host.appendChild(narrative);

        // Footnote caveat.
        const foot = document.createElement('p');
        foot.style.margin = '8px 0 0';
        foot.style.fontSize = '11px';
        foot.style.color = 'var(--muted, #7c8aa8)';
        foot.textContent =
          'Footnote: Bonferroni assumes your tries were independent. They aren\'t quite — a cube ' +
          'and a cuboctahedron share structure, so some "tries" overlap, which means this ' +
          'correction slightly over-penalizes. We round toward skepticism on purpose: a result ' +
          'that survives an over-strict correction is real; one that doesn\'t, you haven\'t lost ' +
          'much by doubting.';
        host.appendChild(foot);
      }
```

- [ ] **Step 3: Wire the Reset button**

Find the Monte Carlo handler block (lines 1338–1346):

```js
        const mcBtn = document.getElementById('mc-run-btn');
        if (mcBtn) mcBtn.addEventListener('click', runMonteCarlo);
        const mcSlider = document.getElementById('mc-radius-slider');
        if (mcSlider) mcSlider.addEventListener('input', function (e) {
          const km = Math.max(50, Math.min(5000, parseInt(e.target.value, 10) || 250));
          document.getElementById('mc-radius-display').textContent = km;
          state.mcRadiusKm = km;
        });
        updateMonteCarloButton();
```

Add the Reset handler before `updateMonteCarloButton();`:

```js
        const mcBtn = document.getElementById('mc-run-btn');
        if (mcBtn) mcBtn.addEventListener('click', runMonteCarlo);
        const mcSlider = document.getElementById('mc-radius-slider');
        if (mcSlider) mcSlider.addEventListener('input', function (e) {
          const km = Math.max(50, Math.min(5000, parseInt(e.target.value, 10) || 250));
          document.getElementById('mc-radius-display').textContent = km;
          state.mcRadiusKm = km;
        });
        const mcReset = document.getElementById('mc-reset-btn');
        if (mcReset) mcReset.addEventListener('click', function () {
          state.mcAttempts = [];   // back to a clean shot; meter hides on re-render
          renderHonestyMeter();
        });
        updateMonteCarloButton();
```

- [ ] **Step 4: Verify the meter in the browser**

Open **http://localhost:8000/playground/index.html**, go to Analysis Suite, **Load + render**, pick a shape, **Run Monte Carlo**. Expected:
- **After run #1:** below the card, "**Attempt 1 — your clean shot.** One shape, one test…", plus a visible **Reset session** button.
- **After run #2** (click Run again, or change shape/radius and Run): the meter switches to "Attempts this session: 2", a "Best result so far: p = … — <config>" line, a "Corrected for 2 tries (Bonferroni): p = …" line with a session **badge pill**, the forking-paths paragraph, and the footnote.
- **Click Reset session:** the meter and the Reset button disappear; the next run is "Attempt 1 — your clean shot" again.
- Console shows no errors.

> Agentic executor: drive it with Playwright MCP. After two runs assert `#mc-honesty` text contains `"Attempts this session: 2"` and `"Bonferroni"`, and a `#mc-honesty .verdict-badge` exists. After clicking `#mc-reset-btn`, assert `#mc-honesty` is `display:none`.

- [ ] **Step 5: Confirm `mcAttempts` is NOT in the share config**

Open `playground/index.html`, find `currentShareConfig()` (line ~1553) and confirm `mcAttempts` is absent (it should never have been added). The function should still serialize `mcRadiusKm` and `analysisSource` but NOT `mcAttempts`. No code change expected — this is a guard check. If `mcAttempts` somehow appears there, remove it.

- [ ] **Step 6: Commit**

```bash
git -C "C:/Users/mhowe/Documents/dev/geopuesto" add playground/index.html
git -C "C:/Users/mhowe/Documents/dev/geopuesto" commit -m "$(cat <<'EOF'
feat(playground): session honesty meter with Bonferroni correction

Adds #mc-honesty + a Reset button under the verdict card. Run #1 is framed as
the "clean shot"; run #2+ shows attempts count, best raw p + its config, the
Bonferroni-corrected p with a deliberately-non-triumphant session badge, the
forking-paths narrative, and the over-correction footnote. Reset clears the
session back to a clean shot. mcAttempts stays session-only (not shared).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Full regression + spec correction

**Files:**
- Modify: `playground/docs/specs/2026-05-30-analysis-suite-verdict-honesty-design.md` (stale filename fix)

- [ ] **Step 1: Re-run the full test harness**

Open **http://localhost:8000/geometry-tests.html**. Expected: `0 failed`, both `Verdict · …` sections fully green, and all pre-existing geometry sections still green (no regressions).

- [ ] **Step 2: Run the playground's debug invariants**

Open **http://localhost:8000/playground/index.html?debug=1**. Expected: the existing runtime invariant checks (Two-Point + Polyhedra geometry) still pass — the verdict feature touches none of that math, so this confirms no collateral damage. Console shows no new errors.

- [ ] **Step 3: Correct the spec's stale test-file references**

In `playground/docs/specs/2026-05-30-analysis-suite-verdict-honesty-design.md`, replace every `v2-tests.html` with `geometry-tests.html` and note its repo-root location. Specifically:
- §2 Goals bullet "Add unit assertions to `v2-tests.html`." → "Add unit assertions to `geometry-tests.html` (repo root)."
- §3 architecture diagram line `playground/v2-tests.html (MODIFIED)` → `geometry-tests.html (repo root, MODIFIED)`.
- §10 heading "Testing (`v2-tests.html`)" → "Testing (`geometry-tests.html`)".
- §11 manifest "`playground/v2-tests.html`" → "`geometry-tests.html` (repo root)".

- [ ] **Step 4: Commit the spec fix**

```bash
git -C "C:/Users/mhowe/Documents/dev/geopuesto" add "playground/docs/specs/2026-05-30-analysis-suite-verdict-honesty-design.md"
git -C "C:/Users/mhowe/Documents/dev/geopuesto" commit -m "$(cat <<'EOF'
docs(playground): point verdict spec at the real test harness

The harness is geometry-tests.html at the repo root, not v2-tests.html
(which never existed). Fixes the stale references in §2/§3/§10/§11.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Done criteria (acceptance)

- `geometry-tests.html` shows `0 failed` with two new green `Verdict · …` sections.
- In the playground, running the Monte Carlo test renders a colored badge + plain-English sentence + a collapsed diagnostics expander (no numbers lost).
- The "striking" badge is **orange and says "read why"** — never a green jackpot.
- Run #1 reads "your clean shot"; run #2+ shows a Bonferroni-corrected p and a session badge that gets *less* impressive as you try more combinations.
- Reset returns cleanly to the clean-shot state.
- Share links restore the test *setup* (shape/anchor/radius/dataset) but NOT the attempt count — every visitor starts their own clean shot.
- No console errors; `?debug=1` invariants still pass.

## Out of scope (do not build — from spec §9)

- Empirical family-wise null ("rigorous mode" re-running the null across all tried shapes).
- Tier 3 guided/interactive walkthrough.
- New datasets.
- Cross-reload persistence of attempts (session-only is intentional).
