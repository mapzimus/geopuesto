/**
 * Geopuesto v2 — Great-circle bearings
 *
 * Initial and final bearings for the great-circle path from A to B. These are
 * asymmetric in general: the bearing you start out with from A is NOT the
 * reverse of the bearing you start with from B back to A. The asymmetry is
 * what makes great-circle navigation feel surprising — it's why a plane from
 * Boston to Tokyo crosses the Arctic instead of flying due west, and why a
 * compass on a great-circle route doesn't read constant.
 *
 * No state. No dependencies. All inputs are {lat, lon} surface points in
 * degrees. Bearings are returned in degrees clockwise from true north,
 * normalized to [0, 360).
 *
 * Spec sections this file implements:
 *   §11   Bearings, azimuths, and the asymmetry
 */
(function (window) {
  'use strict';

  const DEG2RAD = Math.PI / 180;
  const RAD2DEG = 180 / Math.PI;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Map any real number to the [0, 360) bearing range. */
  function normalizeDeg(deg) {
    return ((deg % 360) + 360) % 360;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Initial bearing at A pointing toward B along the A→B great circle.
   * Standard great-circle formula. Returns 0 when A=B (no defined heading)
   * and 0 when A=-B (any heading is valid; we pick due north arbitrarily).
   *
   * @param {{lat:number, lon:number}} A
   * @param {{lat:number, lon:number}} B
   * @returns {number} degrees in [0, 360), measured clockwise from true north
   */
  function initial(A, B) {
    const phi1 = A.lat * DEG2RAD;
    const phi2 = B.lat * DEG2RAD;
    const dLon = (B.lon - A.lon) * DEG2RAD;
    const y = Math.sin(dLon) * Math.cos(phi2);
    const x = Math.cos(phi1) * Math.sin(phi2) -
              Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
    if (x === 0 && y === 0) return 0;
    return normalizeDeg(Math.atan2(y, x) * RAD2DEG);
  }

  /**
   * Final bearing at B — the direction you're heading WHEN YOU ARRIVE, looking
   * forward as if you were continuing past B along the same great circle.
   * Computed as the initial bearing from B to A, rotated 180°: if you were
   * going to turn around at B and walk back to A, you'd head in the reverse
   * direction; flipping gives the "continuing past B" heading.
   *
   * @param {{lat:number, lon:number}} A
   * @param {{lat:number, lon:number}} B
   * @returns {number} degrees in [0, 360)
   */
  function finalBearing(A, B) {
    return normalizeDeg(initial(B, A) + 180);
  }

  /**
   * Both bearings plus a single asymmetry summary.
   *
   * `asymmetryDeg` is the unsigned smallest angle between the two compass
   * directions, in [0, 180]. Zero ⇒ same heading (the A→B path is along a
   * meridian or the equator); larger values indicate the great circle is
   * bending significantly between A and B. For Boston → Tokyo it's roughly
   * 60°; for Boston → London about 22°; for any two points on the equator,
   * exactly 0°.
   *
   * Alternative conventions you might want for the UI but that I'm not
   * computing here (one-line each, derivable from `initial` and `final`):
   *   - signed delta (`final - initial`, normalized to [-180, 180]) — useful
   *     for "the compass rotated X° to the right" framing
   *   - back-azimuth (`(final + 180) mod 360`) — the bearing from B's
   *     perspective for the return trip
   *
   * @param {{lat:number, lon:number}} A
   * @param {{lat:number, lon:number}} B
   * @returns {{initial:number, final:number, asymmetryDeg:number}}
   */
  function pair(A, B) {
    const initBrg = initial(A, B);
    const finalBrg = finalBearing(A, B);
    let raw = Math.abs(finalBrg - initBrg);
    if (raw > 180) raw = 360 - raw;
    return { initial: initBrg, final: finalBrg, asymmetryDeg: raw };
  }

  // ---------------------------------------------------------------------------
  // Attach
  // ---------------------------------------------------------------------------

  window.Bearings = {
    initial: initial,
    final: finalBearing,
    pair: pair,
  };

})(window);
