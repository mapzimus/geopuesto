/**
 * Geopuesto v2 — Eager city dataset loader.
 *
 * Phase 2 of the v2 build. Fetches data/cities1000.json (GeoNames,
 * CC BY 4.0, ~33,742 cities with population ≥ 15,000) and exposes
 * the result as a Promise on window.GeopuestoCities.
 *
 * Loading strategy: EAGER, non-blocking. As soon as this script runs,
 * the fetch kicks off in parallel with the rest of page init. By the
 * time the user clicks into the v1/v2 ring features, the data is
 * almost always already in memory.
 *
 * Wired up: NOT YET. Phase 2 ships this file standalone. Phase 3 adds
 * <script src="cities.js"></script> to index.html when the ring UI
 * actually consumes the data. Until then, opening index.html does NOT
 * trigger the 2.8 MB fetch.
 *
 * Usage (Phase 3+):
 *   const cities = await window.GeopuestoCities;
 *   const ring = Geometry.citiesOnGreatCircle(originXYZ, cities, {
 *     toleranceKm: 100,
 *     minPop: 15000
 *   });
 *
 * City object schema (matches what Geometry.citiesOnGreatCircle expects):
 *   { name: string, country: string (ISO 3166-1 alpha-2), lat: number,
 *     lon: number, population: number }
 *
 * Failure mode: graceful. If the fetch fails (network, 404, parse error),
 * GeopuestoCities resolves to an empty array — dependent UI shows an empty
 * ring list rather than breaking the page.
 *
 * License: cities1000.json is derived from GeoNames (CC BY 4.0).
 *   Source: https://download.geonames.org/export/dump/cities1000.zip
 *   Dataset: ~169k cities with population >= 1,000. ~14 MB raw JSON,
 *   ~4.7 MB gzipped on the wire (GitHub Pages auto-gzips). Replaced
 *   cities15000 in Phase 3b.5 so the "1k+" min-pop filter is honest.
 *   Attribution required in any deployment — see footer in index.html.
 */
(function (window) {
  'use strict';

  if (typeof window === 'undefined' || !window.fetch) {
    return;
  }

  // Path-override hook: pages in subdirectories (e.g. playground/) can set
  //   window.GeopuestoCitiesDataPath = '../data/cities1000.json'
  // BEFORE loading this script. Falls through to the relative default that
  // works from the antipodal app at the repo root.
  const _citiesPath = window.GeopuestoCitiesDataPath || 'data/cities1000.json';
  window.GeopuestoCities = fetch(_citiesPath)
    .then(function (r) {
      if (!r.ok) {
        throw new Error('cities1000.json HTTP ' + r.status);
      }
      return r.json();
    })
    .then(function (cities) {
      if (!Array.isArray(cities)) {
        throw new Error('cities1000.json did not parse as an array');
      }
      return cities;
    })
    .catch(function (err) {
      // Graceful degradation: empty dataset → empty ring lists, but the rest
      // of Geopuesto continues to work.
      if (typeof console !== 'undefined') {
        console.warn('Geopuesto: city data failed to load —', err);
      }
      return [];
    });

  // Sync-readable cache for the renderInfo path, which is itself sync. Stays
  // undefined until the fetch resolves; consumers should treat null/undefined
  // as a "still loading" state and render a placeholder.
  window.GeopuestoCitiesResolved = null;
  window.GeopuestoCities.then(function (cities) {
    window.GeopuestoCitiesResolved = cities;
    // Notify any UI that wants to re-render itself when data arrives.
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('geopuesto:cities-ready', { detail: { count: cities.length } }));
    }
  });
})(window);
