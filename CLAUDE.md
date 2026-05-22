# Geopuesto

Single-file web app that shows what's on the exact opposite side of Earth from any location. Mission Control aesthetic — IBM Plex Mono, console title bar, instrument-cluster modules.

## Stack

- Plain HTML/CSS/JS in one file (`index.html`)
- Leaflet 1.9.4 from CDN for the two side-by-side maps
- Esri Dark Gray Canvas + Reference labels (keyless tiles)
- IBM Plex Mono + IBM Plex Sans via Google Fonts
- No build step, no package.json, no node_modules

## How to run locally

Geolocation, Google APIs, and AISStream all need a real HTTP origin (not `file://`). Spin up a server:

```powershell
cd C:\Users\Calen\Documents\Geopuesto
python -m http.server 8000
```

Then open http://localhost:8000.

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

GitHub Pages at `maxwellhowegis.com/geopuesto/`:
1. Clone the existing `maxwellhowegis.com` repo
2. Create a `geopuesto/` subfolder at the repo root
3. Copy `index.html` into it
4. Commit and push to `main` (or `master`)
5. GitHub Pages serves it at `https://maxwellhowegis.com/geopuesto/`

## Known limitations

- Ocean basin detection is coordinate-based heuristic — imprecise at boundaries
- Blitzortung lightning is not feasible from a static browser (X-Frame-Options blocks the public map iframe, and their WebSocket handshake is obfuscated). Removed from the UI.
- Nominatim has a 1 req/sec policy; spam-clicking will get throttled. Google Geocoding API is enabled as a backup but not wired up yet.
- N2YO API returns search radius in degrees (currently 70°) which is a big sky cap, not a horizon-accurate cone.
- MarineTraffic iframe loads slow over slow connections.
- Mapillary tier search costs up to 3 API calls per antipode. Free tier has a generous quota but watch usage if traffic grows.

## Files

- `index.html` — the entire app
- `geopuesto.jsx` — original React artifact version (reference only, superseded by index.html)
- `CLAUDE.md` — this file

## Roadmap ideas

- Wire up Google Geocoding as Nominatim fallback when Nominatim returns null/error
- Persist last-visited location in localStorage
- Mobile layout audit (Mission Control may be cramped on phone screens)
- Replace nearest-landmark hardcoded list with an Overpass API call to OSM for nearest coastal POI
- OG preview image (currently no `og:image`, so link previews are just text)
