# Geopuesto

**Two spherical-geometry web tools sharing a math kernel.**

- **[Geopuesto](https://maxwellhowegis.com/geopuesto/)** — consumer antipode lookup.
  Type a place, see what's on the exact opposite side of Earth: Wikipedia card,
  Street View, satellite, weather, sea traffic, radio stations, plus the
  "Personal Equator" great circle perpendicular to your antipodal axis with
  every nearby GeoNames city pinned on the ring. Mission Control aesthetic —
  IBM Plex Mono, console title bar, instrument-cluster modules.

- **[Playground](https://maxwellhowegis.com/geopuesto/playground/)** — research
  sandbox for spherical geometry. Pure JS, no API keys, no enrichment.
  Two-Point Mode, Polyhedra Suite (17 shapes), Curves Suite (4 loci variants),
  Analysis Suite with Monte Carlo null-hypothesis testing for "is this
  Earth-grid coincidence real?"

Both deploy as static HTML/JS on GitHub Pages. No build step, no `node_modules`,
no service tier. Just Leaflet, IBM Plex Mono, and ~50 KB of geometry kernel.

---

## What you can do in each app

### Antipodal app (`/`)

Click a map, type a city, or use geolocation:

- **Antipode reveal** with reverse-geocode + Wikipedia + Wikimedia Commons
  photo gallery + Google Street View + Sentinel-2 satellite + Open-Meteo
  weather + Open-Meteo air quality + REST Countries data + sunrise/sunset.
- **Personal Equator** — great circle perpendicular to your antipodal axis,
  rendered on both maps with every GeoNames city along it (~150k cities,
  filterable by population, tolerance band, sort by closeness/population/bearing).
- **"Right Now Over There"** time/weather/aurora/radio module.
- **Big-deal callouts** when there's an M5+ earthquake, active volcano,
  aurora visible, or ISS overhead at the antipode.

The full feature list and module-priority order is in [`CLAUDE.md`](CLAUDE.md).

### Playground (`/playground/`)

Three top-level suites + a Sprint C export layer:

**Two-Point Mode** — pick two points A and B; see the great-circle orthodrome
between them, the perpendicular-bisector great circle, the four named
equidistant points (M, −M, n, −n), plus initial / final / asymmetry bearings
and cross-track / along-track readouts for an arbitrary test point.

**Polyhedra Suite** — 17-shape catalog including 5 Platonics, cuboctahedron,
truncated icosahedron (soccer ball), rhombic triacontahedron (Becker-Hagens
32-vertex grid), the parametric family (Fibonacci sphere, geodesic
icosahedron at frequency *k*, n-prism, n-antiprism), Kepler-Poinsot stars
(small + great stellated dodecahedron), and the major compounds (Stella
Octangula, 5-tetrahedra, 5-cubes). Anchor + spin controls; chainable click
on any vertex to recenter.

**Curves Suite** — four loci variants on a sphere, all with shared math in
`geometry.js`:
- Small circle at distance *d* (constant angular distance)
- Loxodrome / rhumb line (constant bearing)
- Portolan windrose (32 rhumb lines from a center, every 11.25°)
- Isoazimuthal heading ring (constant back-bearing to center)

**Analysis Suite** — overlay real geophysical datasets (currently USGS
earthquakes via GeoJSON feeds), with **Monte Carlo null-hypothesis testing**:
pick any polyhedron, set a search radius, and the playground compares the
observed count of dataset points within radius of any vertex against 1000
random rotations of the same polyhedron. p-value tells you whether the
"Earth grid" coincidence is statistically real or random chance.

**Sprint C** — frozen-state share links (URL-hash encoding for any
configuration) + GeoJSON / KML download.

---

## Repo layout

```
geopuesto/
├── index.html              ← Antipodal app (~200 KB single file)
├── geometry.js             ← Shared sphere-math kernel (latLon↔XYZ,
│                              sampleGreatCircle, sampleSmallCircle,
│                              sampleLoxodrome, sampleIsoazimuthal,
│                              equidistantRing, midpointPair, …)
├── cities.js               ← GeoNames cities1000 loader (~150k cities)
├── data/cities1000.json    ← Shared dataset (~14 MB raw, ~4.7 MB gzipped)
├── geometry-tests.html     ← Invariant tests for the shared kernel
├── generate-og.py · og-image.* · preview-ring.html
│
├── playground/             ← Geometry research sandbox
│   ├── index.html          ← Playground entry point
│   ├── twoPoint.js, bearings.js, rotation.js, shapeEngine.js,
│   │   shapeCatalog.json, vertexCache.js, shareLink.js, exportGeo.js
│   └── docs/V2_PLAN.md, V3_VISION.md, V3_ADDITIONS_2026-05-24.md,
│       geopuesto_master_spec.md, equidistant_geometry_demo.jsx
│
├── CLAUDE.md               ← Repo-wide dev notes (deploy, stack, gotchas)
└── README.md               ← (this file)
```

The two apps **share `geometry.js` and `cities.js` at the top level**.
The playground references them via `../geometry.js` from inside `playground/index.html`.

---

## Run locally

```powershell
cd path/to/geopuesto
python -m http.server 8001
```

Then open <http://localhost:8001/> (antipodal app) or
<http://localhost:8001/playground/> (playground sandbox).

> A real HTTP origin is required — `file://` won't work because of
> CORS restrictions on `fetch()` (used by `cities.js` and the playground's
> shape catalog), and because Google Maps Platform / Geolocation only
> work on an origin.

Port 8001 because port 8000 conflicts with the sibling TappyMaps dev
server. Any free port works.

---

## Deploy

This repo is consumed two ways:

- **As a submodule** in [`mapzimus/maxwellhowegis`](https://github.com/mapzimus/maxwellhowegis),
  which serves it at <https://maxwellhowegis.com/geopuesto/> via the parent's
  GitHub Pages workflow (which checks out submodules recursively, same as
  the parent's `ma-atlas` and `whydah` siblings).

- **Direct GitHub Pages** at <https://mapzimus.github.io/geopuesto/>
  (`source: main branch root`).

Both deploys are kept in sync — pushes to this repo's `main` rebuild
both URLs within ~1-2 minutes.

---

## Tech stack

- **Plain HTML/CSS/JS**. No build step, no bundler, no `package.json`.
  The antipodal app is a single ~200 KB `index.html`; the playground is
  ~1500 KB across ~10 files plus the catalog JSON.
- **Leaflet 1.9.4** from CDN for all maps.
- **CARTO Dark Matter** + **Esri Dark Gray Canvas** tiles (both keyless).
- **IBM Plex Mono** + **IBM Plex Sans** via Google Fonts.
- **Math precision**: pure spherical (no ellipsoidal corrections). Earth
  radius = 6371 km. Most operations machine-precise (max error ~1e-15 rad ≈
  sub-millimeter on Earth's surface).

API keys (antipodal app only — required for full functionality, listed in
the `CONFIG` block of `index.html`): Google Maps Platform, Mapillary
Graph API, AISStream WebSocket, N2YO satellite tracking. All have generous
free tiers; the app degrades gracefully when any are missing.

---

## Status & roadmap

**Antipodal app**: mature. v1 + Phase 3b polish shipped. Ongoing items
in [`CLAUDE.md`](CLAUDE.md) "Smaller roadmap items."

**Playground**: actively expanding. Current state in
[`playground/docs/V2_PLAN.md`](playground/docs/V2_PLAN.md); forward-looking
in [`playground/docs/V3_VISION.md`](playground/docs/V3_VISION.md) and
[`playground/docs/V3_ADDITIONS_2026-05-24.md`](playground/docs/V3_ADDITIONS_2026-05-24.md).

Recent landings (last 24 hours of commits):
- Polyhedra Suite catalog from 6 → 17 shapes (parametric, compound, Kepler-Poinsot)
- Curves Suite added: 4 variants (small-circle / loxodrome / windrose / isoazimuthal)
- Analysis Suite with USGS earthquake overlay + Monte Carlo null-hypothesis test
- Vertex enrichment via GeoNames (Sprint B Stage 2)
- README (this file)

Still deferred:
- Catalan duals beyond rhombic triacontahedron
- Voronoi cells around polyhedron vertices
- Spherical-harmonics decomposition of overlay datasets (V3_VISION Phase 5)
- Real-Earth Mode (ellipsoidal geodesics via Vincenty/Karney; V3_VISION Phase 6)

---

## License

Code: see repo. Geometry math and constants are from public spherical-geometry
literature (great-circle formulas, Mercator inverse-Gudermannian for
loxodromes, Shoemake 1992 for uniform-random SO(3), etc.). GeoNames data
under CC BY 4.0 — see <https://www.geonames.org/>.

Built by [Max Howe](https://maxwellhowegis.com). Geometry kernel + playground
designed and implemented in collaboration with Claude.
