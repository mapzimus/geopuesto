/**
 * Geopuesto v2 — GeoJSON and KML export
 *
 * Convert a Geopuesto configuration (labelled points + great-circle polylines)
 * into a downloadable .geojson or .kml file. Decoupled from the modes that
 * produce the data: TwoPoint, ShapeEngine, and the legacy antipodal-ring
 * renderer all feed into the same `{ points: [...], polylines: [...] }`
 * shape and get the same export treatment.
 *
 * Important convention: GeoJSON stores coordinates as [longitude, latitude]
 * — opposite of Leaflet's [lat, lon] convention. This module does the swap
 * internally so callers can stay in lat/lon throughout the app.
 *
 * No dependencies. Safe to load before any other module.
 *
 * Spec sections this file implements:
 *   V3_VISION.md §"Content/Export" — GeoJSON / KML exports
 *   Plan §Sprint C — second deliverable
 */
(function (window) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  function isFiniteNumber(n) {
    return typeof n === 'number' && isFinite(n);
  }

  /** Validate {lat, lon} object. Returns false for anything malformed. */
  function isValidPoint(p) {
    return p && isFiniteNumber(p.lat) && isFiniteNumber(p.lon)
        && p.lat >= -90 && p.lat <= 90
        && p.lon >= -180 && p.lon <= 180;
  }

  /** Validate a [lat, lon] tuple from a polyline. */
  function isValidLatLonPair(pair) {
    return Array.isArray(pair) && pair.length >= 2
        && isFiniteNumber(pair[0]) && isFiniteNumber(pair[1])
        && pair[0] >= -90 && pair[0] <= 90
        && pair[1] >= -180 && pair[1] <= 180;
  }

  /** Escape characters that would break a KML XML payload. */
  function xmlEscape(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Convert a Geopuesto configuration into a GeoJSON FeatureCollection.
   *
   * Input format:
   *   {
   *     points: [
   *       { lat, lon, name?, props? },         // props merge into Feature.properties
   *       ...
   *     ],
   *     polylines: [
   *       { coords: [[lat, lon], ...], name?, props? },
   *       ...
   *     ],
   *     name?: string,                          // top-level collection label
   *   }
   *
   * @param {object} bundle
   * @returns {object} GeoJSON FeatureCollection (RFC 7946)
   */
  function build(bundle) {
    if (!bundle || typeof bundle !== 'object') {
      throw new Error('ExportGeo.build: bundle must be an object');
    }
    const features = [];

    const points = Array.isArray(bundle.points) ? bundle.points : [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!isValidPoint(p)) continue;
      const props = Object.assign({}, p.props || {});
      if (p.name) props.name = p.name;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [p.lon, p.lat],     // GeoJSON: [lon, lat]
        },
        properties: props,
      });
    }

    const polylines = Array.isArray(bundle.polylines) ? bundle.polylines : [];
    for (let j = 0; j < polylines.length; j++) {
      const line = polylines[j];
      if (!line || !Array.isArray(line.coords) || line.coords.length < 2) continue;
      const lonLatCoords = [];
      for (let k = 0; k < line.coords.length; k++) {
        const ll = line.coords[k];
        if (!isValidLatLonPair(ll)) continue;
        lonLatCoords.push([ll[1], ll[0]]);  // swap to [lon, lat]
      }
      if (lonLatCoords.length < 2) continue;
      const props = Object.assign({}, line.props || {});
      if (line.name) props.name = line.name;
      features.push({
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: lonLatCoords,
        },
        properties: props,
      });
    }

    const collection = {
      type: 'FeatureCollection',
      features: features,
    };
    if (bundle.name) collection.properties = { name: bundle.name };
    return collection;
  }

  /**
   * Convert a Geopuesto bundle into a KML string.
   *
   * KML is XML, so the output is a text blob. Same input shape as `build()`.
   * Less universal than GeoJSON but widely accepted by Google Earth and
   * desktop GIS tools.
   *
   * @param {object} bundle
   * @returns {string} XML
   */
  function toKML(bundle) {
    if (!bundle || typeof bundle !== 'object') {
      throw new Error('ExportGeo.toKML: bundle must be an object');
    }
    const lines = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push('<kml xmlns="http://www.opengis.net/kml/2.2">');
    lines.push('  <Document>');
    if (bundle.name) lines.push('    <name>' + xmlEscape(bundle.name) + '</name>');

    const points = Array.isArray(bundle.points) ? bundle.points : [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      if (!isValidPoint(p)) continue;
      lines.push('    <Placemark>');
      if (p.name) lines.push('      <name>' + xmlEscape(p.name) + '</name>');
      lines.push('      <Point><coordinates>' + p.lon + ',' + p.lat + ',0</coordinates></Point>');
      lines.push('    </Placemark>');
    }

    const polylines = Array.isArray(bundle.polylines) ? bundle.polylines : [];
    for (let j = 0; j < polylines.length; j++) {
      const line = polylines[j];
      if (!line || !Array.isArray(line.coords) || line.coords.length < 2) continue;
      const coordStrings = [];
      for (let k = 0; k < line.coords.length; k++) {
        const ll = line.coords[k];
        if (!isValidLatLonPair(ll)) continue;
        coordStrings.push(ll[1] + ',' + ll[0] + ',0');  // lon,lat,alt
      }
      if (coordStrings.length < 2) continue;
      lines.push('    <Placemark>');
      if (line.name) lines.push('      <name>' + xmlEscape(line.name) + '</name>');
      lines.push('      <LineString>');
      lines.push('        <coordinates>' + coordStrings.join(' ') + '</coordinates>');
      lines.push('      </LineString>');
      lines.push('    </Placemark>');
    }

    lines.push('  </Document>');
    lines.push('</kml>');
    return lines.join('\n');
  }

  /**
   * Trigger a browser download of `payload` (a string or Blob) with the given
   * filename and MIME type. Uses a Blob URL + hidden `<a download>`; the URL
   * is revoked on next tick.
   *
   * @param {string|Blob} payload
   * @param {string} filename
   * @param {string} mimeType
   */
  function triggerDownload(payload, filename, mimeType) {
    if (!window.Blob || !window.URL || !window.URL.createObjectURL) {
      throw new Error('ExportGeo: Blob URL download unsupported in this browser');
    }
    const blob = (payload instanceof window.Blob)
      ? payload
      : new window.Blob([payload], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    const a = window.document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
    // Defer revocation so the browser has time to start the download.
    setTimeout(function () { window.URL.revokeObjectURL(url); }, 1000);
  }

  /**
   * One-call helper: build a FeatureCollection from a bundle and trigger a
   * .geojson download.
   *
   * @param {object} bundle
   * @param {string} [filename='geopuesto.geojson']
   */
  function download(bundle, filename) {
    const fc = build(bundle);
    const json = JSON.stringify(fc, null, 2);
    triggerDownload(json, filename || 'geopuesto.geojson', 'application/geo+json');
  }

  /**
   * One-call helper: build a KML document from a bundle and trigger a .kml download.
   *
   * @param {object} bundle
   * @param {string} [filename='geopuesto.kml']
   */
  function downloadKML(bundle, filename) {
    const xml = toKML(bundle);
    triggerDownload(xml, filename || 'geopuesto.kml', 'application/vnd.google-earth.kml+xml');
  }

  // ---------------------------------------------------------------------------
  // Attach
  // ---------------------------------------------------------------------------

  window.ExportGeo = {
    build: build,
    toKML: toKML,
    download: download,
    downloadKML: downloadKML,
    triggerDownload: triggerDownload,
  };

})(window);
