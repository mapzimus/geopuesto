/**
 * Geopuesto v2 — URL state encoding for shareable / restorable configurations
 *
 * Encodes the current Geopuesto state (mode, A, B, shape, spin, tolerance,
 * pop filter) into the URL hash fragment so any configuration can be linked,
 * pasted, or restored on reload. Hash params (not query string) so they
 * don't trigger a page reload on change and don't get sent to the server.
 *
 * Format: `#mode=twoPoint&a=42.360,-71.059&b=35.690,139.692&tol=100&pop=15000`
 *
 * Schema (all fields optional, omitted when null/unset):
 *   mode: 'antipodal' | 'twoPoint' | 'polyhedra'
 *   a:   "lat,lon" (3 decimals)         — origin / point A (antipodal) or polyhedra anchor (playground)
 *   b:   "lat,lon" (3 decimals)         — second point (twoPoint only)
 *   tpa: "lat,lon" (3 decimals)         — playground Two-Point origin A (distinct from `a`)
 *   p:   "lat,lon" (3 decimals)         — playground cross/along-track test point P
 *   shape: catalog id                   — polyhedra only, e.g. "cuboctahedron"
 *   spin: int degrees [0, 360)          — polyhedra only
 *   tol: int km                         — tolerance ring width
 *   pop: int                            — minimum-population filter
 *
 * No DOM dependencies beyond `window.location` reads/writes; safe to load
 * before any other module.
 *
 * Spec sections this file implements:
 *   V3_VISION.md §"Content/Export" — frozen-state share links
 *   Plan §Sprint C — first deliverable
 */
(function (window) {
  'use strict';

  const VALID_MODES = ['antipodal', 'twoPoint', 'polyhedra'];

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  function encodePoint(p) {
    if (!p || !isFiniteNumber(p.lat) || !isFiniteNumber(p.lon)) return null;
    return p.lat.toFixed(3) + ',' + p.lon.toFixed(3);
  }

  function decodePoint(s) {
    if (typeof s !== 'string') return null;
    const parts = s.split(',');
    if (parts.length !== 2) return null;
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat: lat, lon: lon };
  }

  function isValidShapeId(id) {
    // Light validation — catalog membership is checked by ShapeEngine.
    // Here we just reject obviously bad strings (empty, very long, special chars).
    return typeof id === 'string' && id.length > 0 && id.length < 64 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Serialize a configuration object into a URL hash string (with leading '#').
   * Omits fields that are null, undefined, or invalid. Returns '' (empty)
   * when no field is set, so the caller can use it directly without trimming.
   *
   * @param {object} config
   * @returns {string} hash string starting with '#', or '' if config is empty
   */
  function serialize(config) {
    if (!config || typeof config !== 'object') return '';
    const params = [];
    if (config.mode && VALID_MODES.indexOf(config.mode) !== -1) {
      params.push('mode=' + encodeURIComponent(config.mode));
    }
    const aEnc = encodePoint(config.A);
    if (aEnc) params.push('a=' + aEnc);
    const bEnc = encodePoint(config.B);
    if (bEnc) params.push('b=' + bEnc);
    const tpaEnc = encodePoint(config.tpA);
    if (tpaEnc) params.push('tpa=' + tpaEnc);
    const pEnc = encodePoint(config.P);
    if (pEnc) params.push('p=' + pEnc);
    if (isValidShapeId(config.shape)) {
      params.push('shape=' + encodeURIComponent(config.shape));
    }
    if (isFiniteNumber(config.spinDeg)) {
      const spin = ((Math.round(config.spinDeg) % 360) + 360) % 360;
      params.push('spin=' + spin);
    }
    if (isFiniteNumber(config.toleranceKm) && config.toleranceKm > 0) {
      params.push('tol=' + Math.round(config.toleranceKm));
    }
    if (isFiniteNumber(config.minPop) && config.minPop >= 0) {
      params.push('pop=' + Math.round(config.minPop));
    }
    return params.length ? ('#' + params.join('&')) : '';
  }

  /**
   * Parse a URL hash fragment back into a configuration object.
   * Accepts the hash with or without the leading '#'. Invalid or unknown
   * params are silently dropped (intentional — old links should still
   * produce a usable partial config rather than throwing).
   *
   * @param {string} hash
   * @returns {object} partial configuration; fields are null/absent when not present
   */
  function parse(hash) {
    const out = {
      mode: null, A: null, B: null, tpA: null, P: null, shape: null,
      spinDeg: null, toleranceKm: null, minPop: null,
    };
    if (typeof hash !== 'string' || hash.length === 0) return out;
    const cleaned = hash.charAt(0) === '#' ? hash.slice(1) : hash;
    if (cleaned.length === 0) return out;

    const pairs = cleaned.split('&');
    for (let i = 0; i < pairs.length; i++) {
      const eq = pairs[i].indexOf('=');
      if (eq < 0) continue;
      const key = pairs[i].slice(0, eq);
      const value = decodeURIComponent(pairs[i].slice(eq + 1));
      switch (key) {
        case 'mode':
          if (VALID_MODES.indexOf(value) !== -1) out.mode = value;
          break;
        case 'a': out.A = decodePoint(value); break;
        case 'b': out.B = decodePoint(value); break;
        case 'tpa': out.tpA = decodePoint(value); break;
        case 'p': out.P = decodePoint(value); break;
        case 'shape':
          if (isValidShapeId(value)) out.shape = value;
          break;
        case 'spin': {
          const v = parseInt(value, 10);
          if (isFinite(v)) out.spinDeg = ((v % 360) + 360) % 360;
          break;
        }
        case 'tol': {
          const v = parseFloat(value);
          if (isFinite(v) && v > 0) out.toleranceKm = v;
          break;
        }
        case 'pop': {
          const v = parseFloat(value);
          if (isFinite(v) && v >= 0) out.minPop = v;
          break;
        }
        default:
          // Unknown key — ignore so future schemas can layer in without
          // breaking older clients.
          break;
      }
    }
    return out;
  }

  /**
   * Read and parse the configuration from the current `window.location.hash`.
   * @returns {object} configuration (see `parse`)
   */
  function fromCurrentLocation() {
    return parse(window.location.hash || '');
  }

  /**
   * Update the current page's URL hash with a serialized config — without
   * triggering a navigation. Uses history.replaceState when available so
   * the hash change doesn't pollute the browser back-stack on every spin
   * tick; falls back to assigning `location.hash` otherwise.
   *
   * @param {object} config
   */
  function updateUrl(config) {
    const hash = serialize(config);
    if (window.history && typeof window.history.replaceState === 'function') {
      const url = window.location.pathname + window.location.search + hash;
      window.history.replaceState(null, '', url);
    } else {
      window.location.hash = hash;
    }
  }

  /**
   * Build a full shareable URL from a base URL and config.
   *
   * @param {string} baseUrl   e.g. 'https://maxwellhowegis.com/geopuesto/'
   * @param {object} config
   * @returns {string}
   */
  function makeUrl(baseUrl, config) {
    const hash = serialize(config);
    // Strip any existing hash from baseUrl, then append the new one.
    const hashIdx = baseUrl.indexOf('#');
    const clean = hashIdx >= 0 ? baseUrl.slice(0, hashIdx) : baseUrl;
    return clean + hash;
  }

  // ---------------------------------------------------------------------------
  // Attach
  // ---------------------------------------------------------------------------

  window.ShareLink = {
    VALID_MODES: VALID_MODES,
    serialize: serialize,
    parse: parse,
    fromCurrentLocation: fromCurrentLocation,
    updateUrl: updateUrl,
    makeUrl: makeUrl,
  };

})(window);
