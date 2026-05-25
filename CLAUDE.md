# Geopuesto

Antipodal observation system. Shows what's on the exact opposite side of Earth from any location, plus "Your Personal Equator" — the great circle perpendicular to your antipodal axis with every GeoNames city along it. Mission Control aesthetic — IBM Plex Mono, console title bar, instrument-cluster modules.

This is the consumer app at the repo root. Sibling research-geometry sandbox lives at [`playground/`](playground/) (Two-Point Mode, Geomates, Polyhedra Suite, Curves Suite).

## Stack

- Plain HTML/CSS/JS — `index.html` plus the shared spherical-geometry kernel at top level (`geometry.js`, `cities.js`) used by both this app and `playground/`. No build step, no package.json, no node_modules.
- Leaflet 1.9.4 from CDN for the two side-by-side maps
- Esri Dark Gray Canvas + Reference labels (keyless tiles)
- IBM Plex Mono + IBM Plex Sans via Google Fonts

## How to run locally

Geolocation, Google APIs, and AISStream all need a real HTTP origin (not `file://`). Spin up a server:

```powershell
cd C:\Users\mhowe\Documents\dev\geopuesto
python -m http.server 8001
```

Then open http://localhost:8001 for the antipodal app, or http://localhost:8001/playground/ for the geometry sandbox.

> Note: port 8001, not 8000 — TappyMaps runs on 8000 locally. See `playground/docs/` for sandbox-specific docs.

## Configuration

The `CONFIG` block at the top of the script holds four API keys. Three are required for full functionality:

- **`googleMapsApiKey`** — covers Maps Embed API (Street View), Time Zone API, Geocoding API, and Maps Elevation API. Get from https://console.cloud.google.com/apis/credentials. Must be restricted to HTTP referrers `maxwellhowegis.com/*`, `www.maxwellhowegis.com/*`, `localhost/*` and restricted to the 4 enabled APIs before going public.
- **`mapillaryToken`** — community street-level photos. Get from https://www.mapillary.com/dashboard/developers. Format `MLY|client_id|client_token`. Only use the public client token, never the client secret.
- **`aisstreamToken`** — live vessel positions via WebSocket. Get from https://aisstream.io.
- **`n2yoApiKey`** — live satellite/debris counts overhead. Get from https://www.n2yo.com/api/. Optional — ISS data works without it.

## Data sources

All free-tier, CORS-enabled, no auth wall:

- **OpenStreetMap Nominatim** — forward search + reverse geocoding
- **Wikipedia GeoSearch + REST summary API** — nearest article + intro/thumbnail
- **Wikimedia Commons GeoSearch + imageinfo** — geotagged photo gallery
- **Open-Meteo Forecast** — current weather (temp, conditions, wind, humidity, is_day)
- **Open-Meteo Air Quality** — European AQI, US AQI, PM2.5, PM10, NO₂, O₃, SO₂, CO
- **sunrise-sunset.org** — sunrise/sunset times
- **REST Countries** — flag, capital, languages, currency, population
- **wheretheiss.at** — ISS current position
- **OpenSky Network** — live aircraft positions (anonymous, rate-limited)
- **USGS FDSN** — earthquake feed (last 7 days, 500 km radius, M2.0+)
- **NOAA SWPC** — planetary K-index (geomagnetic activity / aurora forecast)
- **NOAA NCEI World Magnetic Model** — magnetic declination at a point
- **OpenStreetMap Overpass** — nearby POIs (viewpoints, peaks, monuments, etc.)
- **radio-browser.info** — live internet-radio stations in the antipode's country
- **Smithsonian GVP** — active volcanoes (static cached list, refreshed manually)
- **Copernicus Data Space Ecosystem (Sentinel Hub WMS)** — recent cloud-free Sentinel-2 imagery (free 30k req/month, needs WMS Instance ID)
- **CARTO Dark Matter** — basemap tiles (keyless)
- **N2YO** — full satellite/debris overhead counts (needs key)
- **AISStream.io** — vessel positions via WebSocket (needs key)
- **Mapillary Graph API** — community street imagery (needs token, sessionStorage-cached by 10km grid)
- **Google Maps Platform** — Street View embed, Time Zone, Elevation, Geocoding (needs key)
- **MarineTraffic** — public ship tracker iframe embed (no key)

## Module order (dynamic, by signal strength)

Modules now render via priority sort, not a static list. Each module declares a `prio` integer; signal-strength boosts let big-deal events float to the top. See the `modules = [...]` array in `renderInfo`.

Hero is pinned at the top (prio 10000). Big-deal boosts (additive +8000–+8500) surface when:
- An M5+ earthquake hit within 24h in the 500 km radius
- An active volcano is within 250 km of the antipode
- Aurora is visible at the antipode's latitude (Kp + lat lookup)
- The ISS is within 500 km of the antipode
- European AQI ≥ 80 (Poor or worse)

Base priority order (no signals):
1. Hero — photo + standout facts + headline. Hero callouts now include earthquake, aurora, active volcano, extreme weather (>=35°C, <=-20°C, >=60 km/h winds) alongside elevation/depth and ISS.
2. Wikipedia card
3. Photo gallery (Commons)
4. Right Now Over There (time/weather grid)
5. Air Quality (Open-Meteo)
6. Street View (Google)
7. Satellite View (Google)
8. Now Playing at the Antipode (radio-browser.info live audio)
9. Mapillary
10. What's at This Exact Spot (Overpass POIs)
11. Recent Earthquakes (USGS)
12. Active Volcanoes Nearby (Smithsonian GVP cached)
13. Geomagnetic Activity / Aurora (NOAA SWPC Kp)
14. Overhead Right Now (ISS + N2YO)
15. Aircraft Overhead (OpenSky)
16. Vessels Nearby (AIS + MarineTraffic)
17. Live Weather (Windy iframe)
18. Magnetic Field (NOAA WMM)
19. Country (REST Countries)
20. Position (reverse-geocoded address)

Hero photo cascades: Wikipedia thumb → Commons photo → Mapillary image → generated SVG fallback (lat/lng art in brand colors).

## Quick Picks

105 curated cities/landmarks whose antipodes land on or within ~300 km of land. Two-row horizontal scroller in the input panel. Geographically balanced — East Asia, SE Asia, Oceania (NZ + Pacific Islands), Iberia, UK (→ Antipodes Islands), Hawaii (→ Botswana), Patagonia (→ Russia/Mongolia), Argentina/Paraguay (→ China), Andes (→ Vietnam), Indonesia/Colombia pairs, Brazilian Amazon, Falklands, Bermuda/Perth pair.

## Features

- Click left map → drops origin pin, computes antipode, both maps fly there
- Search → Nominatim autocomplete with 6 suggestions, debounced 400ms
- Coordinates → manual lat/lng entry
- 📍 Use my location → browser `navigator.geolocation` API
- Swap button → flips origin and target so you can inspect either point's info
- Active state on Quick Picks persists until another input is used
- Photo gallery → click thumbnail to open full-size in modal
- Wikipedia card → only renders if there's an article within 10km
- Photo gallery → only renders if there are geotagged Commons photos within 5km
- Hero photo cascades through Wikipedia thumb → Commons photo → Mapillary image
- Nearest-land lookup for ocean antipodes (hardcoded landmark list, ~70 reference points)
- Real timezone display when Google API key is set, falls back to solar-time-from-longitude
- Ocean depth shown as negative elevation ("4,210 m below sea level")

## Brand

- Orange `#F26522`, Teal `#00BFA5` (TappyMaps palette)
- Brand name "Geopuesto" with shared "o" — gradient pivot from orange to teal lives inside that letter via `background-clip: text`
- Subtle CRT scanline overlay (2px repeating linear gradient at very low opacity)
- Corner brackets on map viewports and hero photo
- Status LED (green pulse) in header next to UTC clock

## Deploy

Lives at `https://maxwellhowegis.com/geopuesto/`. This repo (`mapzimus/geopuesto`) is referenced as a git submodule by the parent portfolio repo `mapzimus/maxwellhowegis`. The portfolio's GitHub Pages workflow checks out submodules recursively, so the deploy flow is:

1. Commit + push changes to `mapzimus/geopuesto` `main`.
2. In the parent `maxwellhowegis` repo: `git submodule update --remote geopuesto`, then commit the bumped pointer and push.
3. The Pages workflow on `mapzimus/maxwellhowegis` fires automatically and re-deploys the whole site (fast — the build is just file copy plus submodule fetch).

Promotion from subfolder to standalone repo followed the `ma-atlas` precedent: `git filter-repo --subdirectory-filter geopuesto` against a clone of `maxwellhowegis`, push to a new GitHub repo, replace the subfolder with `git submodule add`. The 14 commits of pre-promotion history are preserved.

## Known limitations

- Ocean basin detection is coordinate-based heuristic — imprecise at boundaries
- Blitzortung lightning is not feasible from a static browser (X-Frame-Options blocks the public map iframe, and their WebSocket handshake is obfuscated). Removed from the UI.
- Nominatim has a 1 req/sec policy; spam-clicking will get throttled. Google Geocoding API is enabled as a backup but not wired up yet.
- N2YO API returns search radius in degrees (currently 70°) which is a big sky cap, not a horizon-accurate cone.
- MarineTraffic iframe loads slow over slow connections.
- Mapillary tier search costs up to 3 API calls per antipode. Free tier has a generous quota but watch usage if traffic grows.

## Repo layout

This repo holds **two related apps** that share a sphere-math core:

```
geopuesto/
├── index.html              ← the antipodal app (production, deployed at maxwellhowegis.com/geopuesto/)
├── geometry.js             ← shared sphere kernel (used by BOTH apps)
├── cities.js               ← shared GeoNames loader (used by BOTH apps)
├── data/cities1000.json    ← shared dataset (~14 MB)
├── geometry-tests.html     ← invariant tests for the shared kernel
├── generate-og.py · og-image.* · preview-ring.html · CLAUDE.md (this file)
└── playground/             ← geometry sandbox (Two-Point Mode, Polyhedra Suite, Curves Suite)
    ├── index.html          ← the playground app entry point
    ├── twoPoint.js, bearings.js, rotation.js, shapeEngine.js,
    │   shapeCatalog.json, vertexCache.js, shareLink.js, exportGeo.js
    └── docs/               ← V2_PLAN.md, V3_VISION.md, V3_ADDITIONS, master spec, previews
```

**Top level = the consumer antipode app.** Single-file, rich enrichment (Wikipedia / Street View / satellite / AIS / radio), as documented above. This is what `maxwellhowegis.com/geopuesto/` serves.

**`playground/` = the geometry research sandbox.** Pure geometry — no API keys, no enrichment, no Wikipedia. Pick points, pick curves/shapes, see the math rendered. Deliberately stripped down. See [`playground/docs/V3_VISION.md`](playground/docs/V3_VISION.md) for the full architecture and [`playground/docs/V2_PLAN.md`](playground/docs/V2_PLAN.md) for the phased plan.

## Current development

The two apps evolve independently now:

- **Antipodal app (this file's main subject):** mature. v1 + Phase 3b polish shipped. Ongoing roadmap items in "Smaller roadmap items" below.
- **Playground (`playground/`):** ships three top-level categories live.
  - **Two-Point Mode**: A→B orthodrome, perpendicular bisector, four named equidistant points (M, −M, n, −n), cross-track / along-track, bearing asymmetry.
  - **Polyhedra Suite**: 13 shapes in catalog. 5 Platonics + cuboctahedron (explicit vertices). Truncated icosahedron, geodesic icosahedron at frequency k, n-prism, n-antiprism, Fibonacci sphere (parametric, via the `generators` registry in `shapeEngine.js`). Rhombic triacontahedron / Becker-Hagens grid (32 inline vertices, edges suppressed). Stella octangula (cube vertices, explicit star edges).
  - **Curves Suite**: 4 variants — small-circle-at-d, loxodrome / rhumb line, portolan windrose (32 rhumb lines), isoazimuthal heading ring.
  - Share + Export (Sprint C): URL-hash state for any configuration; GeoJSON + KML download.

The two apps **share `geometry.js` and `cities.js` at the top level**. `geometry.js` now exports
`sampleGreatCircle`, `sampleSmallCircle`, `sampleLoxodrome`, `sampleIsoazimuthal` alongside the
original kernel. If you modify these, verify both `geometry-tests.html` (top-level invariants)
and `playground/index.html` (which uses them via `../geometry.js`).

### Deferred (still on the playground roadmap)

- **Compound polyhedra**: 5-tetrahedra and 5-cubes compounds — share dodecahedron vertices, need
  explicit edge lists for the 5 interpenetrating subsets.
- **Kepler-Poinsot stars**: 4 regular star polyhedra. Share Platonic vertex sets; differ only in
  the star edge lists (pentagrams as faces, etc.).
- **Vertex enrichment list (Polyhedra Stage 2 polish)**: nearest-city name per polyhedron vertex
  via throttled Nominatim. Adds the "explore each vertex" UX the v2 docs emphasize. Needs the
  Tier-1 rate-limit pipeline established before enabling.
- **Analysis Suite (V3_VISION Phase 4)**: dataset overlays (NOAA earthquakes, magnetic anomalies,
  shipwrecks), Monte Carlo random-rotation null model, spherical-harmonics decomposition. The
  Becker-Hagens point set is in the catalog specifically to support these tests.
- **Real-Earth Mode (Phase 6)**: ellipsoidal geodesics via Vincenty/Karney. Deferred indefinitely.

### Parallel-session notes

The other Claude session sometimes works in this repo concurrently (e.g., the share-link
scroll-restore fix landed during a feature push and the rebase resolved cleanly). Pattern:
small commits, frequent `git status` checks, push promptly. Rebase-then-push handles
conflicts when both sessions modify nearby files.

## Smaller roadmap items (not in v2 scope)

- Wire up Google Geocoding as Nominatim fallback when Nominatim returns null/error
- Persist last-visited location in localStorage
- Mobile layout audit (covered by v2 Phase 7 but also relevant standalone)
- Replace nearest-landmark hardcoded list with an Overpass API call to OSM for nearest coastal POI
