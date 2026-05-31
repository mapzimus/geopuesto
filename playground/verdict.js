/**
 * Geopuesto playground — Verdict & Honesty interpretation module.
 *
 * Pure, deterministic, DOM-free. Turns a Monte Carlo p-value into a
 * plain-English verdict, and turns a session's worth of attempts into a
 * Bonferroni-corrected honesty readout. All wording is editable; the math
 * (tier thresholds, Bonferroni multiplier, p-display clamp) is fixed.
 *
 * Design intent: DEBUNK, not celebrate. A low p-value the user went looking
 * for is a prompt to apply the correction, never a jackpot. The "striking"
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
