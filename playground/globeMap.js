/* globeMap.js — MapLibre GL globe adapter for the playground's four maps.
 *
 * The playground's render functions were written against a small slice of
 * Leaflet: lazy map init, layer groups, clear-and-redraw with polylines and
 * circle markers, hover tooltips. This module keeps that calling shape but
 * renders onto a MapLibre GL globe (projection: globe), so every map is a
 * draggable 3D planet that unrolls to a flat map as you zoom in.
 *
 * Design notes:
 * - One GeoJSON source for lines and one for points per map, shared by all
 *   groups. A "group" is just a tag on features; clearLayers() drops that
 *   tag's features. Adds are batched through a microtask so a render pass
 *   that pushes hundreds of segments (windrose, USGS quakes) triggers one
 *   setData, not hundreds.
 * - Geometry arrives already densified and antimeridian-split from
 *   geometry.js, and clipped to |lat| <= 85 — which stays correct here:
 *   MapLibre's globe is still built on Web Mercator tiles, so latitudes
 *   beyond ±85.05° don't exist on it either.
 * - Dashed lines live on their own layer (line-dasharray isn't per-feature),
 *   filtered on a "dashed" property.
 * - Coordinates: call sites speak Leaflet [lat, lon]; everything is flipped
 *   to GeoJSON [lon, lat] exactly once, here.
 */
(function () {
  'use strict';

  const ESRI_DARK = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

  // Dark tooltip styling to match the mission-control aesthetic.
  const css = document.createElement('style');
  css.textContent =
    '.globe-tip .maplibregl-popup-content{background:#0a0e14;color:#e8e4d8;border:1px solid #2a3548;' +
    'border-radius:3px;padding:6px 9px;font-family:inherit;font-size:11px;line-height:1.5;box-shadow:none;}' +
    '.globe-tip .maplibregl-popup-tip{border-top-color:#2a3548;border-bottom-color:#2a3548;}';
  document.head.appendChild(css);

  function create(containerId, opts) {
    opts = opts || {};
    const center = opts.center || [20, 0]; // [lat, lon], Leaflet order
    // Leaflet zoom ≈ MapLibre zoom + 1, but the sphere reads small in these
    // short containers at the exact equivalent, so keep a bit more of it.
    const zoom = Math.max(0, (opts.zoom || 1) - 0.4);

    const map = new maplibregl.Map({
      container: containerId,
      center: [center[1], center[0]],
      zoom: zoom,
      attributionControl: { compact: true },
      style: {
        version: 8,
        projection: { type: 'globe' },
        sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.6, 5, 0.6, 7, 0] },
        light: { anchor: 'map', intensity: 0.4 },
        sources: {
          esri: {
            type: 'raster', tiles: [ESRI_DARK], tileSize: 256, maxzoom: 16,
            attribution: 'Esri Dark Gray Canvas',
          },
        },
        layers: [{ id: 'esri', type: 'raster', source: 'esri' }],
      },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));

    const lines = { type: 'FeatureCollection', features: [] };
    const points = { type: 'FeatureCollection', features: [] };
    let ready = false;
    let flushQueued = false;

    map.once('style.load', function () {
      map.addSource('lines', { type: 'geojson', data: lines });
      map.addSource('points', { type: 'geojson', data: points });
      map.addLayer({
        id: 'lines-solid', type: 'line', source: 'lines',
        filter: ['!', ['get', 'dashed']],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'weight'],
          'line-opacity': ['get', 'opacity'],
        },
      });
      map.addLayer({
        id: 'lines-dashed', type: 'line', source: 'lines',
        filter: ['get', 'dashed'],
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['get', 'weight'],
          'line-opacity': ['get', 'opacity'],
          'line-dasharray': [2.5, 2],
        },
      });
      map.addLayer({
        id: 'points', type: 'circle', source: 'points',
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'fillColor'],
          'circle-opacity': ['get', 'fillOpacity'],
          'circle-stroke-color': ['get', 'color'],
          'circle-stroke-width': ['get', 'weight'],
        },
      });

      const tip = new maplibregl.Popup({
        closeButton: false, closeOnClick: false, className: 'globe-tip', offset: 10,
      });
      map.on('mousemove', 'points', function (e) {
        const f = e.features[0];
        if (!f || !f.properties.tooltip) return;
        map.getCanvas().style.cursor = 'default';
        tip.setLngLat(f.geometry.coordinates).setHTML(f.properties.tooltip).addTo(map);
      });
      map.on('mouseleave', 'points', function () {
        map.getCanvas().style.cursor = '';
        tip.remove();
      });

      ready = true;
      flush();
    });

    function flush() {
      flushQueued = false;
      if (!ready) return;
      map.getSource('lines').setData(lines);
      map.getSource('points').setData(points);
    }
    function scheduleFlush() {
      if (flushQueued) return;
      flushQueued = true;
      queueMicrotask(flush);
    }

    let nextGroupId = 0;
    function group() {
      const id = nextGroupId++;
      return {
        polyline: function (latlngs, style) {
          lines.features.push({
            type: 'Feature',
            properties: {
              group: id,
              color: style.color || '#fff',
              weight: style.weight != null ? style.weight : 3,
              opacity: style.opacity != null ? style.opacity : 1,
              dashed: !!style.dashArray,
            },
            geometry: { type: 'LineString', coordinates: latlngs.map(function (p) { return [p[1], p[0]]; }) },
          });
          scheduleFlush();
        },
        circleMarker: function (latlng, style, tooltipHtml) {
          points.features.push({
            type: 'Feature',
            properties: {
              group: id,
              radius: style.radius != null ? style.radius : 6,
              color: style.color || '#fff',
              weight: style.weight != null ? style.weight : 2,
              fillColor: style.fillColor || style.color || '#fff',
              fillOpacity: style.fillOpacity != null ? style.fillOpacity : 1,
              tooltip: tooltipHtml || '',
            },
            geometry: { type: 'Point', coordinates: [latlng[1], latlng[0]] },
          });
          scheduleFlush();
        },
        clearLayers: function () {
          lines.features = lines.features.filter(function (f) { return f.properties.group !== id; });
          points.features = points.features.filter(function (f) { return f.properties.group !== id; });
          scheduleFlush();
        },
      };
    }

    return { map: map, group: group };
  }

  window.GlobeMap = { create: create };
})();
