/**
 * Geopuesto v2 — Spherical Geometry Kernel
 *
 * Pure-JS port of the math from docs/geopuesto_master_spec.md §6, §8, §9, §22, §23.
 * No external dependencies. Attaches to `window.Geometry`.
 *
 * Conventions
 *   - Vectors:        3-element arrays [x, y, z] (unit-sphere convention)
 *   - Surface points: {lat, lon} objects, degrees, lat ∈ [-90, 90], lon ∈ [-180, 180]
 *   - Polylines:      [[lat, lon], [lat, lon], ...] arrays (Leaflet-ready)
 *   - Distances:      kilometers, assuming sphere of radius EARTH_R_KM
 *
 * Spec sections this file implements:
 *   §6  Geometric foundation       (definitions, perpendicular GC, equidistant ring)
 *   §8  Math pipeline              (lat/lon ↔ XYZ, perpendicular basis, polar fallback)
 *   §9  Reference implementation   (geopuesto_cross, midpoint_pair)
 *   §10 Cities along the great circle (citiesOnGreatCircle)
 *   §11 Map visualization sampling (sampleGreatCircle)
 *   §22 General equidistant ring   (equidistantRing, citiesOnEquidistantRing)
 *   §23 The Midpoint Pair / Geomates (midpointPair)
 */
(function (window) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  /** Mean Earth radius in km (sphere model). Spec §7.1. */
  const EARTH_R_KM = 6371.0;

  /**
   * |P · Z| > threshold ⇒ P is "near a pole." Fall back to X axis for the
   * perpendicular basis reference. 0.9999 ≈ 0.81° of arc from the pole.
   * Lowering this (e.g. 0.99) widens the polar fallback zone; raising it
   * narrows it and risks numerical instability for high-latitude inputs.
   * Spec §8.3.
   */
  const POLAR_THRESHOLD = 0.9999;

  // ---------------------------------------------------------------------------
  // Vector primitives (operating on 3-element arrays)
  // ---------------------------------------------------------------------------

  function norm(v) {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  }

  function normalize(v) {
    const m = norm(v);
    if (m < 1e-12) {
      throw new Error('Geometry.normalize: cannot normalize zero vector');
    }
    return [v[0] / m, v[1] / m, v[2] / m];
  }

  function dot(a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }

  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function negate(v) {
    return [-v[0], -v[1], -v[2]];
  }

  function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  /** Angular great-circle distance in km between two surface points (as unit vectors). */
  function angularKm(a, b) {
    const A = normalize(a);
    const B = normalize(b);
    return EARTH_R_KM * Math.acos(clamp(dot(A, B), -1, 1));
  }

  // ---------------------------------------------------------------------------
  // Surface ↔ Cartesian conversions (spec §8.1, §8.6)
  // ---------------------------------------------------------------------------

  /** lat/lon (degrees) → unit vector [x, y, z]. */
  function latLonToXYZ(lat, lon) {
    const phi = (lat * Math.PI) / 180;
    const lam = (lon * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    return [cosPhi * Math.cos(lam), cosPhi * Math.sin(lam), Math.sin(phi)];
  }

  /** Vector → {lat, lon} in degrees. Longitude normalized to [-180, 180]. */
  function xyzToLatLon(v) {
    const n = normalize(v);
    const lat = (Math.asin(clamp(n[2], -1, 1)) * 180) / Math.PI;
    let lon = (Math.atan2(n[1], n[0]) * 180) / Math.PI;
    // atan2 already returns (-180, 180], but normalize defensively
    while (lon > 180) lon -= 360;
    while (lon <= -180) lon += 360;
    return { lat, lon };
  }

  // ---------------------------------------------------------------------------
  // Perpendicular basis (spec §8.3)
  // ---------------------------------------------------------------------------

  /**
   * Construct two orthonormal vectors {Nperp, Eperp} both perpendicular to P,
   * using Earth's North Pole (Z) as the reference. If P is near a pole
   * (|P·Z| > POLAR_THRESHOLD), fall back to the X axis to avoid degeneracy.
   *
   * The basis defines a "personal equator" plane: any point on the great
   * circle perpendicular to P can be written as cos(θ)·Nperp + sin(θ)·Eperp.
   */
  function perpendicularBasis(P) {
    const Z = [0, 0, 1];
    const X = [1, 0, 0];
    const ref = Math.abs(dot(P, Z)) > POLAR_THRESHOLD ? X : Z;
    const Eperp = normalize(cross(ref, P));
    const Nperp = normalize(cross(P, Eperp));
    return { Nperp, Eperp };
  }

  // ---------------------------------------------------------------------------
  // Great-circle sampling (spec §11.1)
  // ---------------------------------------------------------------------------

  /**
   * Sample n points along the great circle whose normal is `normal`.
   * Returns a polyline as [[lat, lon], ...] in `[lat, lon]` form.
   * Note: does NOT split at the antimeridian — use antimeridianSplit() for that.
   */
  function sampleGreatCircle(normalVec, nSamples) {
    if (nSamples == null) nSamples = 360;
    const n = normalize(normalVec);
    // Pick any reference vector not (nearly) parallel to n
    const up = Math.abs(dot(n, [0, 1, 0])) > 0.98 ? [1, 0, 0] : [0, 1, 0];
    const u = normalize(cross(n, up));
    const v = normalize(cross(n, u));
    const out = new Array(nSamples);
    for (let i = 0; i < nSamples; i++) {
      const t = (i / nSamples) * 2 * Math.PI;
      const c = Math.cos(t);
      const s = Math.sin(t);
      const p = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s];
      const ll = xyzToLatLon(p);
      out[i] = [ll.lat, ll.lon];
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Antimeridian splitting (spec §11.2, §17.1 — P0 blocker)
  // ---------------------------------------------------------------------------

  /**
   * Split a polyline that crosses the ±180° meridian into multiple segments
   * so it renders cleanly on a Leaflet/Web Mercator map (which can't draw a
   * line that wraps from lon=+179 to lon=-179 — it would draw across the
   * whole map instead).
   *
   * Input:  [[lat, lon], [lat, lon], ...]  — single polyline, possibly wrapping
   * Output: [[[lat, lon], ...], [[lat, lon], ...], ...]  — array of segments,
   *         each segment a contiguous polyline that doesn't cross ±180°.
   *
   * Detection: a crossing exists between consecutive points i, i+1 when
   * |polyline[i+1][1] - polyline[i][1]| > 180 (a lon delta that large is only
   * possible if the line wrapped the short way around the antimeridian).
   *
   * Strategy: **interpolated split**. At each crossing, compute the latitude
   * where the great-circle leg meets the meridian via linear interpolation
   * in (lat, lon) space, then append `[lat, ±180]` as the last point of the
   * closing segment AND `[lat, ∓180]` as the first point of the opening
   * segment. The polyline visually butts up against the meridian — no gap.
   * (Linear interp is accurate to a fraction of an arc-second when samples
   * are ~1° apart, which is what sampleGreatCircle produces by default.)
   *
   * Direction convention:
   *   delta > +180  ⇒  line went west across −180/+180  ⇒  close at −180, open at +180
   *   delta < −180  ⇒  line went east across +180/−180  ⇒  close at +180, open at −180
   */
  function antimeridianSplit(polyline) {
    if (!polyline || polyline.length < 2) return [polyline || []];
    const segments = [];
    let current = [polyline[0]];
    for (let i = 1; i < polyline.length; i++) {
      const prev = polyline[i - 1];
      const cur = polyline[i];
      const lonDelta = cur[1] - prev[1];
      if (Math.abs(lonDelta) > 180) {
        const wentEast = lonDelta < 0;
        const closeLon = wentEast ? 180 : -180;
        const openLon = -closeLon;
        // Wrapped lon span = 360 − |delta| = the short way around through ±180.
        const wrappedSpan = 360 - Math.abs(lonDelta);
        const distToClose = wentEast ? (180 - prev[1]) : (prev[1] + 180);
        const t = wrappedSpan === 0 ? 0 : distToClose / wrappedSpan;
        const interpLat = prev[0] + t * (cur[0] - prev[0]);
        current.push([interpLat, closeLon]);
        segments.push(current);
        current = [[interpLat, openLon], cur];
      } else {
        current.push(cur);
      }
    }
    segments.push(current);
    return segments;
  }

  // ---------------------------------------------------------------------------
  // The general equidistant ring (spec §22)
  // ---------------------------------------------------------------------------

  /**
   * Great circle equidistant from two points A and B (as XYZ unit vectors).
   * Returns a polyline. The normal of this ring is (A − B).
   * Special case: when B = −A (antipodal), normal = 2A and this recovers
   * the personal-equator ring from spec §6.1.
   */
  function equidistantRing(A, B, nSamples) {
    const n = sub(A, B);
    if (norm(n) < 1e-12) {
      throw new Error('Geometry.equidistantRing: A and B coincide');
    }
    return sampleGreatCircle(n, nSamples);
  }

  // ---------------------------------------------------------------------------
  // The Midpoint Pair / Geomates (spec §23) — the novel IP claim
  // ---------------------------------------------------------------------------

  /**
   * For two unit-vector points A and B, return the surface midpoint pair:
   *   - near: (A + B) / |A + B|        — the closest equidistant point
   *   - far:  −near                     — the farthest equidistant point
   * Both lie on the equidistant ring of A and B. M_far appears to be a
   * novel paired-discovery feature unmatched by existing GIS tools.
   *
   * Throws if A and B are antipodal (|A + B| ≈ 0), where the midpoint is
   * geometrically undefined (every direction works). Caller should fall back
   * to the v1 antipodal-ring view in that case.
   */
  function midpointPair(A, B) {
    const s = add(A, B);
    if (norm(s) < 1e-9) {
      throw new Error(
        'Geometry.midpointPair: A and B are antipodal; midpoint pair undefined'
      );
    }
    const near = normalize(s);
    return {
      near: xyzToLatLon(near),
      far: xyzToLatLon(negate(near)),
    };
  }

  // ---------------------------------------------------------------------------
  // City filtering — v1 ring (spec §10.3, vectorized §10.4)
  // ---------------------------------------------------------------------------

  /**
   * Find all cities within `toleranceKm` of the great circle perpendicular
   * to P's antipodal axis (the user's "personal equator"). Each result
   * includes distance from the ring, from the origin, from the antipode,
   * and bearing along the ring (0–360°, measured from Nperp toward Eperp).
   *
   * @param P            XYZ unit vector of the origin point.
   * @param cities       Array of {lat, lon, population, ...city props}.
   * @param opts.toleranceKm  Default 100.
   * @param opts.minPop       Default 15000 (matches GeoNames cities15000).
   */
  function citiesOnGreatCircle(P, cities, opts) {
    opts = opts || {};
    const tolerance = opts.toleranceKm != null ? opts.toleranceKm : 100;
    const minPop = opts.minPop != null ? opts.minPop : 15000;
    const { Nperp, Eperp } = perpendicularBasis(P);
    const out = [];
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      if ((c.population || 0) < minPop) continue;
      const Q = latLonToXYZ(c.lat, c.lon);
      const dQP = dot(Q, P);
      const dCircle = EARTH_R_KM * Math.asin(Math.min(Math.abs(dQP), 1));
      if (dCircle >= tolerance) continue;
      const dOrigin = EARTH_R_KM * Math.acos(clamp(dQP, -1, 1));
      const dAntipode = EARTH_R_KM * Math.acos(clamp(-dQP, -1, 1));
      const qN = dot(Q, Nperp);
      const qE = dot(Q, Eperp);
      let bearing = (Math.atan2(qE, qN) * 180) / Math.PI;
      if (bearing < 0) bearing += 360;
      out.push(Object.assign({}, c, {
        distanceFromCircleKm: dCircle,
        distanceFromOriginKm: dOrigin,
        distanceFromAntipodeKm: dAntipode,
        bearingAlongCircleDeg: bearing,
      }));
    }
    out.sort((a, b) => a.distanceFromCircleKm - b.distanceFromCircleKm);
    return out;
  }

  // ---------------------------------------------------------------------------
  // City filtering — v2 general ring (spec §22)
  // ---------------------------------------------------------------------------

  /**
   * Find all cities within `toleranceKm` of the great circle equidistant
   * from A and B. Each result includes distance from the ring, from A,
   * and from B (which should be equal to within floating-point precision
   * for any city sitting on the ring).
   */
  function citiesOnEquidistantRing(A, B, cities, opts) {
    opts = opts || {};
    const tolerance = opts.toleranceKm != null ? opts.toleranceKm : 100;
    const minPop = opts.minPop != null ? opts.minPop : 15000;
    const n = normalize(sub(A, B));
    const out = [];
    for (let i = 0; i < cities.length; i++) {
      const c = cities[i];
      if ((c.population || 0) < minPop) continue;
      const Q = latLonToXYZ(c.lat, c.lon);
      const dQn = dot(Q, n);
      const dCircle = EARTH_R_KM * Math.asin(Math.min(Math.abs(dQn), 1));
      if (dCircle >= tolerance) continue;
      const dA = EARTH_R_KM * Math.acos(clamp(dot(Q, A), -1, 1));
      const dB = EARTH_R_KM * Math.acos(clamp(dot(Q, B), -1, 1));
      out.push(Object.assign({}, c, {
        distanceFromRingKm: dCircle,
        distanceFromAKm: dA,
        distanceFromBKm: dB,
      }));
    }
    out.sort((a, b) => a.distanceFromRingKm - b.distanceFromRingKm);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  window.Geometry = {
    // Constants
    EARTH_R_KM,
    POLAR_THRESHOLD,
    // Vector primitives
    norm,
    normalize,
    dot,
    cross,
    negate,
    add,
    sub,
    clamp,
    angularKm,
    // Surface ↔ Cartesian
    latLonToXYZ,
    xyzToLatLon,
    // Spherical geometry constructions
    perpendicularBasis,
    sampleGreatCircle,
    antimeridianSplit,
    equidistantRing,
    midpointPair,
    // City queries
    citiesOnGreatCircle,
    citiesOnEquidistantRing,
  };
})(window);
