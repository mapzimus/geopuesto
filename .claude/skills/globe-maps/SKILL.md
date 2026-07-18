---
name: globe-maps
description: Build interactive 3D globe web maps with MapLibre GL JS, or convert existing flat maps (Leaflet, plain Mercator MapLibre) to the globe presentation. Use this whenever the user wants a spinning/3D globe, an "atlas" or world map of routes, arcs, flows, or points, a trainrouter.com-style map, or asks to port a Leaflet map to a globe — even if they just say "make it 3D" or "make it look like a planet". Also use it when adding GeoJSON route/point layers to any MapLibre map, or when a MapLibre map must run under a strict Content-Security-Policy.
---

# 3D Globe Maps with MapLibre GL

The "3D globe" look (trainrouter.com, Google Earth-ish) is not a special
rendering stack — since MapLibre GL JS v5 it is a **projection setting** on an
otherwise ordinary web map. Everything you know about sources, layers, popups,
and expressions still applies; the globe unrolls to flat Mercator
automatically as the user zooms in. This skill captures the setup, the
gotchas that cost real debugging time, and the porting recipe from Leaflet.

A complete, self-contained working page is at `references/starter.html` —
read it when you want the full wiring (sidebar list, filters, selection
dimming, popups) rather than fragments. Copy it as the starting point for new
globe pages instead of writing from scratch.

## Minimal globe

```js
const map = new maplibregl.Map({
  container: "map",
  center: [20, 25],
  zoom: 1.4,
  style: {
    version: 8,
    projection: { type: "globe" },
    sky: { "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0] },
    light: { anchor: "map", intensity: 0.4 },
    sources: {
      osm: {
        type: "raster",
        tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
        tileSize: 256, maxzoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      },
    },
    layers: [{ id: "osm", type: "raster", source: "osm" }],
  },
});
```

`sky.atmosphere-blend` is what gives the glowing-limb "planet in space" look;
fading it out by zoom ~7 avoids a hazy sky once the map has unrolled flat. A
vector basemap style URL works in place of the raster source (e.g. a
Protomaps/OpenFreeMap style), and removes the external raster-tile
dependency. Use MapLibre **v5 or later** — globe in v4 was experimental and
spelled differently.

## The gotchas (each of these has burned an hour before)

1. **Densify your lines.** MapLibre interpolates between vertices in
   *projected* space, so a sparse LineString cuts visible chords through the
   globe instead of hugging it. Insert a vertex roughly every degree:

   ```js
   function densify(coords, stepDeg = 1) {
     const out = [coords[0]];
     for (let i = 1; i < coords.length; i++) {
       const [x0, y0] = coords[i - 1], [x1, y1] = coords[i];
       const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) / stepDeg));
       for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
     }
     return out;
   }
   ```

   For true geodesics (a flight-route look), generate the line with
   `turf.greatCircle` instead — it comes out densified. Lines crossing the
   antimeridian need splitting (`turf.greatCircle` handles this; hand-drawn
   data crossing ±180° does not).

2. **Coordinates are `[lng, lat]` everywhere.** MapLibre speaks GeoJSON
   order in every API (`center`, `setLngLat`, bounds). If porting from
   Leaflet, delete the `[lat, lng]` flipping rather than carrying it over.

3. **Build the UI on `style.load`, not `load`.** The `load` event waits for
   every visible tile, so a slow or blocked tile host freezes your sidebar
   and data layers. `map.once("style.load", ...)` fires as soon as the style
   is ready, which is all that adding sources/layers needs.

4. **CSP.** MapLibre spawns its tile workers from `blob:` URLs and fetches
   raster tiles with `fetch()` (not `<img>`). Under a strict policy you need:
   `worker-src 'self' blob:`, `child-src 'self' blob:`,
   `img-src 'self' data: blob:`, and the **tile host under `connect-src`**
   (putting it under img-src looks right and silently fails).

5. **Weight.** maplibre-gl.js is ~900 KB (vs Leaflet's ~145 KB). Vendor it
   (self-host `maplibre-gl.js` + `maplibre-gl.css` with a versioned README)
   on sites with `script-src 'self'`; note the exact version and source URL.

6. **Headless testing.** In headless Chromium, launch with
   `--use-angle=swiftshader --enable-unsafe-swiftshader` for software WebGL,
   and abort external tile requests (`page.route(tileUrl, r => r.abort())`)
   so hanging tile fetches don't stall the test. Assert on your own DOM
   (sidebar, readouts, popups) — the canvas itself is opaque to selectors.

## Data layers on the globe

Load GeoJSON, one FeatureCollection per dataset, properties carrying
everything the UI needs (category, name, stats). Style with data-driven
expressions rather than one layer per feature:

```js
map.addSource("routes", { type: "geojson", data: geojson });
map.addLayer({ id: "routes-casing", type: "line", source: "routes",
  layout: { "line-cap": "round", "line-join": "round" },
  paint: { "line-color": "#fff", "line-width": 7 } });      // halo for legibility
map.addLayer({ id: "routes", type: "line", source: "routes",
  layout: { "line-cap": "round", "line-join": "round" },
  paint: {
    "line-width": 3.5,
    "line-color": ["match", ["get", "category"],
      "high-speed", "#ff6b4a", "scenic", "#2f9e44", "night", "#7455d9", "#c47f17"],
  } });
```

Selection/hover without touching the data: swap paint expressions —

```js
const slugEq = (s) => ["==", ["get", "slug"], s ?? ""];
map.setPaintProperty("routes", "line-opacity",
  selected ? ["case", slugEq(selected), 0.95, 0.25] : 0.9);
```

Category filters are `map.setFilter(layerId, ["==", ["get", "category"], cat])`
(and `null` to clear). Zoom to a feature by folding its coordinates into a
`maplibregl.LngLatBounds` and calling `fitBounds(bounds, { padding: 60, maxZoom: 7 })`.
Popups: `new maplibregl.Popup().setLngLat(...).setHTML(...).addTo(map)`; in a
line's click handler use `e.lngLat`, from a sidebar use the line's midpoint
vertex. On the map's plain `click`, call `e.preventDefault()` in the layer
handler and check `e.defaultPrevented` in the map handler to distinguish
"clicked a route" from "clicked empty globe → deselect".

## Porting an existing Leaflet map

Mechanical mapping — do it in one pass:

| Leaflet | MapLibre |
|---|---|
| `L.map(el).setView([lat, lng], z)` | `new maplibregl.Map({ container, center: [lng, lat], zoom, style })` |
| `L.tileLayer(url)` | raster source + layer in the style object |
| `L.polyline` / `L.geoJSON(data, {style})` | geojson source + line layer with expressions |
| `L.circleMarker` | circle layer |
| `layer.bindPopup(html)` | `maplibregl.Popup` created in a click handler |
| `map.fitBounds(L.latLngBounds)` | `map.fitBounds(new maplibregl.LngLatBounds(...))` |
| per-layer `setStyle` on events | paint-property expressions (see above) |

Spherical constructions (great circles, equidistant rings, polyhedra edges —
anything computed with Turf) look *better* after the port: generate them as
densified GeoJSON and they finally follow the sphere they were computed on.

## Scaling up

One GeoJSON file is comfortable to a few hundred routes / tens of thousands
of vertices. Beyond that: cut vector tiles with `tippecanoe`, emit a single
PMTiles file, and serve it as a static asset (any static host handles the
range requests — no tile server). The layer/expression code stays identical;
only the source type changes.
