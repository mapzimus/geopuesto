/**
 * Geopuesto v2 — Two-Point Mode computations
 *
 * Pure functions for everything you can derive from two surface points A and B:
 * the great-circle midpoint M and its antipode (the Geomate pair from §23),
 * the poles n and -n of the A-B great circle, cross-track / along-track
 * distances of an off-route point P, and the Voronoi assignment (closer to A
 * or B).
 *
 * No state. All inputs are {lat, lon} surface points (degrees). All distances
 * returned in km on the Earth-sphere model. Depends on `window.Geometry`.
 *
 * Spec sections this file implements:
 *   §6.4  Perpendicular bisector great circle (M, -M, n, -n derivation)
 *   §11   Cross-track / along-track navigation distances
 *   §22   General equidistant ring (M, n basis)
 *   §23   Midpoint pair / Geomates (M, -M)
 */
(function (window) {
  'use strict';

  if (!window.Geometry) {
    throw new Error('TwoPoint: window.Geometry must be loaded first');
  }

  const G = window.Geometry;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** True when a 3-vector is numerically indistinguishable from zero. */
  function nearZero(v) {
    return G.norm(v) < 1e-9;
  }

  /** Scale a 3-vector by a scalar. */
  function scale(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Derive the four named points and arc distance from two surface points.
   *
   * `degenerate` is non-null when A=B (identical) or A=-B (antipodal). In both
   * cases the perpendicular bisector great circle is not unique, so M, n and
   * their antipodes are returned as null. `distanceKm` is still meaningful in
   * the degenerate cases (0 km or ~20,015 km respectively).
   *
   * @param {{lat:number, lon:number}} A
   * @param {{lat:number, lon:number}} B
   * @returns {{
   *   M: ({lat:number, lon:number}|null),
   *   mAntipode: ({lat:number, lon:number}|null),
   *   n: ({lat:number, lon:number}|null),
   *   nAntipode: ({lat:number, lon:number}|null),
   *   distanceKm: number,
   *   degenerate: ('identical'|'antipodal'|null)
   * }}
   */
  function derive(A, B) {
    const a = G.latLonToXYZ(A.lat, A.lon);
    const b = G.latLonToXYZ(B.lat, B.lon);

    const sum = G.add(a, b);
    const cross = G.cross(a, b);
    const distanceKm = G.angularKm(a, b);

    let degenerate = null;
    if (nearZero(sum)) {
      degenerate = 'antipodal';
    } else if (nearZero(cross)) {
      degenerate = 'identical';
    }

    if (degenerate) {
      return {
        M: null, mAntipode: null, n: null, nAntipode: null,
        distanceKm: distanceKm, degenerate: degenerate,
      };
    }

    const mVec = G.normalize(sum);
    const nVec = G.normalize(cross);
    return {
      M: G.xyzToLatLon(mVec),
      mAntipode: G.xyzToLatLon(G.negate(mVec)),
      n: G.xyzToLatLon(nVec),
      nAntipode: G.xyzToLatLon(G.negate(nVec)),
      distanceKm: distanceKm,
      degenerate: null,
    };
  }

  /**
   * Signed perpendicular distance from P to the A-B great circle.
   *
   * The sign follows the orientation of (a × b): positive when P lies on the
   * same hemisphere as the cross product, negative on the opposite side.
   * Callers wanting "left of route" semantics should fix the sign based on
   * their own convention for the route direction.
   *
   * @param {{lat:number, lon:number}} P
   * @param {{lat:number, lon:number}} A
   * @param {{lat:number, lon:number}} B
   * @returns {number} signed km. NaN if A=B or A=-B (no unique great circle).
   */
  function crossTrackDistanceKm(P, A, B) {
    const a = G.latLonToXYZ(A.lat, A.lon);
    const b = G.latLonToXYZ(B.lat, B.lon);
    const cross = G.cross(a, b);
    if (nearZero(cross)) return NaN;
    const nVec = G.normalize(cross);
    const p = G.latLonToXYZ(P.lat, P.lon);
    return Math.asin(G.clamp(G.dot(p, nVec), -1, 1)) * G.EARTH_R_KM;
  }

  /**
   * Signed distance from A to the foot-of-perpendicular projection of P onto
   * the A-B great circle. Positive when the projection lies on the A→B forward
   * direction; negative when it's behind A.
   *
   * Implementation: project P onto the orthonormal frame {A, T} where T is the
   * unit tangent at A pointing toward B. Then atan2(p·T, p·A) gives the signed
   * arc length naturally.
   *
   * @param {{lat:number, lon:number}} P
   * @param {{lat:number, lon:number}} A
   * @param {{lat:number, lon:number}} B
   * @returns {number} signed km. NaN if A=B or A=-B.
   */
  function alongTrackDistanceKm(P, A, B) {
    const a = G.latLonToXYZ(A.lat, A.lon);
    const b = G.latLonToXYZ(B.lat, B.lon);
    const p = G.latLonToXYZ(P.lat, P.lon);

    const aDotB = G.dot(a, b);
    const tRaw = G.sub(b, scale(a, aDotB));
    if (nearZero(tRaw)) return NaN;
    const tHat = G.normalize(tRaw);

    const pAlongA = G.dot(p, a);
    const pAlongT = G.dot(p, tHat);
    return Math.atan2(pAlongT, pAlongA) * G.EARTH_R_KM;
  }

  /**
   * Voronoi assignment: which of A or B is P closer to (great-circle distance)?
   * Uses dot-product comparison instead of computing arc lengths since the
   * comparison only depends on the sign of (p·a - p·b), which is the same as
   * the sign of arc(a,p) - arc(b,p) when both are in [0, π].
   *
   * @param {{lat:number, lon:number}} P
   * @param {{lat:number, lon:number}} A
   * @param {{lat:number, lon:number}} B
   * @returns {'A'|'B'|'equidistant'}
   */
  function closerTo(P, A, B) {
    const p = G.latLonToXYZ(P.lat, P.lon);
    const a = G.latLonToXYZ(A.lat, A.lon);
    const b = G.latLonToXYZ(B.lat, B.lon);
    const diff = G.dot(p, a) - G.dot(p, b);
    if (Math.abs(diff) < 1e-12) return 'equidistant';
    return diff > 0 ? 'A' : 'B';
  }

  // ---------------------------------------------------------------------------
  // Attach
  // ---------------------------------------------------------------------------

  window.TwoPoint = {
    derive: derive,
    crossTrackDistanceKm: crossTrackDistanceKm,
    alongTrackDistanceKm: alongTrackDistanceKm,
    closerTo: closerTo,
  };

})(window);
