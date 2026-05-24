/**
 * Geopuesto v2 — Vertex enrichment cache
 *
 * localStorage-backed key-value store for the Polyhedra Suite's enrichment
 * pipeline. Keyed by rounded lat/lon (3 decimal places ≈ 110m precision), so
 * the same anchor at the same spin angle hits the cache on every reload.
 *
 * Namespaced — separate "nearestCity", "wikipedia", "weather" buckets share
 * the same storage without colliding. Each entry has a TTL (default 7 days)
 * after which it's treated as missing and lazily evicted on the next read.
 *
 * No dependencies. Safe to load before geometry.js or any other module.
 *
 * Spec sections this file implements:
 *   "API cost / rate-limiting concern" (V3_VISION.md)
 *   Plan §"API cost strategy: 4-tier gating" — Tier 1 cache layer
 */
(function (window) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Tunables
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = 'geopuesto:vertexCache:v1';
  const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const KEY_PRECISION = 3;  // decimal places of lat/lon precision in cache keys

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  /**
   * In-memory mirror of the localStorage blob. Loaded lazily on first
   * access, written back on every set/clear. Shape:
   *   { [namespace]: { [key]: { v: any, exp: number } } }
   */
  let store = null;
  let storageAvailable = null;

  function detectStorage() {
    if (storageAvailable !== null) return storageAvailable;
    try {
      const probe = '__geopuesto_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      storageAvailable = true;
    } catch (e) {
      storageAvailable = false;
    }
    return storageAvailable;
  }

  function loadStore() {
    if (store !== null) return store;
    if (!detectStorage()) {
      store = {};
      return store;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      store = raw ? JSON.parse(raw) : {};
    } catch (e) {
      store = {};
    }
    return store;
  }

  function persist() {
    if (!detectStorage()) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch (e) {
      // localStorage quota likely exceeded. Drop everything and try once more
      // with a fresh slate — better to lose cache than to crash the page.
      store = {};
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      } catch (e2) {
        // Storage genuinely broken. Continue in-memory only.
      }
    }
  }

  function nsBucket(namespace) {
    const s = loadStore();
    if (!s[namespace]) s[namespace] = {};
    return s[namespace];
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Stable cache key for a {lat, lon} point. Rounds to KEY_PRECISION decimals
   * so floating-point jitter in geometry computations doesn't fragment the
   * cache. Two points within ~110m share a key.
   *
   * @param {{lat:number, lon:number}} point
   * @returns {string}
   */
  function keyFor(point) {
    return point.lat.toFixed(KEY_PRECISION) + ',' + point.lon.toFixed(KEY_PRECISION);
  }

  /**
   * Look up a cached value. Returns `undefined` for misses, expired entries,
   * or any other access failure. Expired entries are evicted on read.
   *
   * @param {string} namespace
   * @param {{lat:number, lon:number}} point
   * @returns {*} cached value or undefined
   */
  function get(namespace, point) {
    const bucket = nsBucket(namespace);
    const key = keyFor(point);
    const entry = bucket[key];
    if (!entry) return undefined;
    if (entry.exp && Date.now() > entry.exp) {
      delete bucket[key];
      persist();
      return undefined;
    }
    return entry.v;
  }

  /**
   * Store a value with optional TTL. `value` must be JSON-serializable.
   *
   * @param {string} namespace
   * @param {{lat:number, lon:number}} point
   * @param {*} value      JSON-serializable
   * @param {number} [ttlMs=DEFAULT_TTL_MS]
   */
  function set(namespace, point, value, ttlMs) {
    const bucket = nsBucket(namespace);
    const key = keyFor(point);
    const ttl = ttlMs == null ? DEFAULT_TTL_MS : ttlMs;
    bucket[key] = { v: value, exp: Date.now() + ttl };
    persist();
  }

  /**
   * Delete a single entry, an entire namespace, or the whole cache.
   *
   * @param {string} [namespace]  if omitted, clears everything
   * @param {{lat:number, lon:number}} [point]  if both given, deletes just that entry
   */
  function clear(namespace, point) {
    const s = loadStore();
    if (!namespace) {
      store = {};
      persist();
      return;
    }
    if (point) {
      if (s[namespace]) {
        delete s[namespace][keyFor(point)];
        persist();
      }
      return;
    }
    delete s[namespace];
    persist();
  }

  /**
   * Number of (non-expired) entries in a namespace, or in the entire cache
   * if no namespace given. Walks the store; not free if the cache is large.
   *
   * @param {string} [namespace]
   * @returns {number}
   */
  function size(namespace) {
    const s = loadStore();
    const now = Date.now();
    let count = 0;
    const nsList = namespace ? [namespace] : Object.keys(s);
    for (const ns of nsList) {
      const bucket = s[ns];
      if (!bucket) continue;
      for (const key in bucket) {
        if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
        const entry = bucket[key];
        if (!entry.exp || now <= entry.exp) count++;
      }
    }
    return count;
  }

  /**
   * Walk the cache and evict all expired entries. Returns the number removed.
   * Useful to call once on page load to keep the storage blob trim.
   *
   * @returns {number}
   */
  function prune() {
    const s = loadStore();
    const now = Date.now();
    let removed = 0;
    for (const ns in s) {
      if (!Object.prototype.hasOwnProperty.call(s, ns)) continue;
      const bucket = s[ns];
      for (const key in bucket) {
        if (!Object.prototype.hasOwnProperty.call(bucket, key)) continue;
        const entry = bucket[key];
        if (entry.exp && now > entry.exp) {
          delete bucket[key];
          removed++;
        }
      }
    }
    if (removed > 0) persist();
    return removed;
  }

  // ---------------------------------------------------------------------------
  // Attach
  // ---------------------------------------------------------------------------

  window.VertexCache = {
    KEY_PRECISION: KEY_PRECISION,
    DEFAULT_TTL_MS: DEFAULT_TTL_MS,
    keyFor: keyFor,
    get: get,
    set: set,
    clear: clear,
    size: size,
    prune: prune,
  };

})(window);
