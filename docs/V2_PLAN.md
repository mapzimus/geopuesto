# Geopuesto v2 — Implementation Plan

**Status:** Phase 3 (Antipodal Ring) shipped 2026-05-24 through sub-phases 3a → 3b.9. Phases 5–6 (general equidistant ring + Geomates) now equivalent to V3_VISION.md's "Two-Point Mode" and tracked in [`../../.claude/plans/cozy-crunching-mist.md`](../../.claude/plans/cozy-crunching-mist.md).
**Companion files:** [`geopuesto_master_spec.md`](geopuesto_master_spec.md) (full math + ambition), [`equidistant_geometry_demo.jsx`](equidistant_geometry_demo.jsx) (Three.js visualization reference), [`V3_VISION.md`](V3_VISION.md) (forward-looking spherical-geometry playground architecture — items beyond this plan's scope are tracked there), [`V3_ADDITIONS_2026-05-24.md`](V3_ADDITIONS_2026-05-24.md) (followup notes — geodesics on ellipsoid, isoazimuthal curves, portolan windroses, deep-math reading list, open "Curves Suite" architectural question).
**Parent CLAUDE.md:** [`../CLAUDE.md`](../CLAUDE.md).

This document captures the **strategic decisions** that scope v2 down from the full master spec, and the **phased plan** to ship it. The master spec is the math + research bible; this is the build plan.

---

## 1. Strategic decisions (locked 2026-05-23)

| Decision | Choice | Implication |
|---|---|---|
| Stack direction | **A — Pure JS extension** | No FastAPI, no Python backend. All math in vanilla JS inside the existing static site. Cities dataset shipped as a static asset on GitHub Pages. |
| Scope of first build | **v1 + v2 + Geomates in one effort, but ship in slices** | Antipodal ring (v1) ships before general ring + Geomates (v2). Single dev effort, two public ship points. |
| Geomates IP strategy | **Build first, retrospective post after** | No pre-publication blog post. Ship the feature; the deploy timestamp is the public claim. Retrospective on `tools.html` or as a `/blog/geomates-discovery` page after launch. |
| End-game ambition | **Free portfolio feature** | Lives at `maxwellhowegis.com/geopuesto/` indefinitely. No `geopuesto.com` domain, no Stripe billing, no API tier, no OSS Python package. |
| Spec/demo location | **`geopuesto/docs/` subfolder** | Master spec + JSX demo live in the repo for future-Claude context. Not deployed (only `geopuesto/*.html|png|svg|js` need to deploy). |
| Geomates user-facing name | **"Geomates"** | Locked. Plays on Geo (geography + geometry). Use throughout code, UI, and retrospective post. |
| Ring-city enrichment scope | **Slim cards in v1** | Name, country, population, distance only. Tap a city → it becomes the new origin → existing full 20-source enrichment applies. No new per-city API budget for ring view. |

---

## 2. What's IN scope (from master spec)

- §6 — Geometric foundation (unit-sphere vectors, perpendicular GC, equidistant ring)
- §8 — Math pipeline (lat/lon ↔ XYZ, perpendicular basis, polar fallback)
- §9 — Reference implementation (**port from Python to vanilla JS**)
- §10 — Cities along the great circle (vanilla JS, no NumPy)
- §11 — Map visualization (Leaflet polylines + antimeridian split)
- §12 — Integration with existing Geopuesto (extend `index.html`)
- §13 — Verification tests
- §17 — All P0 blockers
- §20 — Pre-launch validation plan (50 origins, ≥70% interesting, 3 non-Max users)
- §22 — General equidistant ring (2 arbitrary points)
- §23 — **The Midpoint Pair / Geomates** (the IP)

## 3. What's OUT of scope (deferred or never)

- §7.5 / §7.6 — Ellipsoidal upgrade / `geographiclib` (sphere accuracy is fine for this product)
- §11.3 — 3D globe (Cesium / Globe.gl)
- §24 — Triangulation (3-point spherical circumcenter)
- §25 — Spherical triangles & Girard's theorem visualization
- §26 — Loxodromes
- §27 — Spherical Voronoi diagrams
- §28 — Spherical caps
- §29 — Mind-bender theorems (Borsuk–Ulam realtime, etc.)
- §30 — H3 / geodesic grids
- §31 — Stretch / speculative ideas
- **All of Part VI (§32–§38)** — API service, hosting, pricing, OSS strategy, multi-tier rollout
- The Field Diagram aesthetic from the JSX demo (Fraunces serif + JetBrains Mono + navy/amber)

The current **Mission Control** brand (IBM Plex Mono, orange `#F26522`, teal `#00BFA5`, CRT scanlines) stays. New features must visually integrate with the existing modules, not introduce a second aesthetic.

---

## 4. Phased implementation

Two public ship points (end of Phase 3 → v1 live; end of Phase 6 → v2 + Geomates live).

### Phase 0 — Planning artifacts ✅ done 2026-05-23
- Master spec + JSX demo moved to `geopuesto/docs/`
- This `V2_PLAN.md` written
- CLAUDE.md updated to reference the plan

### Phase 1 — Pure-JS math kernel + invariant tests
**Effort:** 2–3 days. **Output:** `geopuesto/geometry.js` + a `geopuesto/geometry-tests.html` page.

Port from master spec §9 + §22 + §23:
- `latLonToXYZ(lat, lon) → [x, y, z]`
- `xyzToLatLon([x, y, z]) → {lat, lon}` with longitude normalized to [-180, 180]
- `perpendicularBasis(P) → {Nperp, Eperp}` with polar fallback (|P·Z| > 0.9999 ⇒ swap reference axis)
- `sampleGreatCircle(normal, nSamples=360) → [[lat,lon],...]`
- `antimeridianSplit(polyline) → [[[lat,lon],...], ...]` — splits on longitude wrap
- `citiesOnGreatCircle(P, cities, toleranceKm=100, minPop=15000)` → ranked list (see §10.3)
- `equidistantRing(A, B, nSamples=360)` → polyline (see §22)
- `citiesOnEquidistantRing(A, B, cities, toleranceKm=100, minPop=15000)` → ranked list (§22)
- `midpointPair(A, B) → {near: {lat,lon}, far: {lat,lon}}` (§23 — the Geomates math)

Invariant tests (§13) executed in-browser with visible pass/fail counters:
- Origin ↔ antipode = 180° / ~20,015 km
- Origin ↔ any perpendicular point = 90°
- N\* ↔ S\* = 180°; N\* ↔ E\* = 90°
- M_near ↔ M_far = 180°
- arc(M_near, A) ≈ arc(M_near, B)
- arc(M_far, A) ≈ arc(M_far, B)
- Polar edge case: origin at (89.9°, 0) computes without NaN
- Antimeridian crossing: origin at (0°, 175°) yields a valid 2-segment polyline

No UI integration in this phase. Math layer must be correct before anything else builds on it.

### Phase 2 — GeoNames data pipeline
**Effort:** 1–2 days. **Output:** `geopuesto/data/cities15000.json` (compact, lazy-loaded).

- Download `cities15000.zip` from https://download.geonames.org/export/dump/ (CC BY 4.0)
- Filter to needed columns: `name`, `country_code`, `lat`, `lon`, `population` (drop ASCII name, alt names, admin codes, etc.)
- Compact JSON: array of arrays, not objects, to minimize size. Schema: `[[name, cc, lat, lon, pop], ...]`. Expected ~25k rows, ~1.5–2 MB raw, ~500 KB gzipped via GitHub Pages.
- Lazy-load on first user request to a ring feature; don't block initial page TTI
- License attribution required by CC BY 4.0 — add to existing footer

**Refresh cadence:** Pin a snapshot for v1. GeoNames updates monthly; we'll refresh manually if/when needed. Acceptable staleness.

### Phase 3 — v1 ship: Antipodal Ring module 🚢 **ship point 1**
**Effort:** 4–5 days. **Output:** Live at `maxwellhowegis.com/geopuesto/` as a new module.

- New module: "Your Personal Equator" — sits in the existing module priority system (§module order in CLAUDE.md), probably default `prio` around 1500–2000 to surface above the lower-tier modules but below hero
- Ring polyline rendered on **both** Leaflet maps (origin map + antipode map) with antimeridian split
- Cities-on-ring panel: scrollable list of slim cards
- Tolerance slider: 50 / 100 / 250 km presets
- Population filter: 1k / 15k / 100k / 1M slider
- Sort options: closeness to ring / population / bearing along ring
- Tap a city in the list → it becomes the new origin (existing flow handles full enrichment)
- Mobile: collapse panel to a swipe-up drawer

### Phase 4 — Pre-launch validation gate ⚠️ **go/no-go**
**Effort:** 1–2 days. **Output:** A scored sample + ≥3 user walkthroughs.

Per master spec §20:
- Run v1 against 50 representative origins (mix of land/ocean antipodes)
- Manually rate each output for "interestingness" (land hits, recognizable cities, named countries)
- **Target ≥70% rated interesting before ship**
- 3 non-Max users walk through the feature; capture reactions
- Antimeridian crossing test (origin at lat 0, lon 175)
- Polar input test (origin at lat 89.9, lon 0)
- Query latency target: <200 ms (likely trivially met in browser at 25k cities)

**If validation fails:** widen tolerance band, consider whether the framing needs rethinking, OR jump ahead to Phase 5–6 sooner (general ring solves the ocean-antipode problem more directly).

### Phase 5 — v2 ring: general 2-point picker
**Effort:** 3–4 days.

- Second-point picker UI in the input panel: toggle between "antipodal" (current behavior) and "custom B"
- Custom B input modes:
  - Search (Nominatim, reusing existing autocomplete)
  - Click second map
  - Quick-pick from a small curated list (e.g., "halfway to Tokyo", "halfway to London")
- Equidistant ring computed and rendered using the general normal `n = A − B`
- Show ring distance (= arc(A,B) / 2) prominently — *"every point on this ring is X km from both"*
- Reuse Phase 3 city-list panel; relabel as "Cities equidistant from A and B"

### Phase 6 — Geomates feature ⭐ **the IP**
**Effort:** 3–4 days. **Output:** v2 + Geomates live. **🚢 ship point 2**

- Compute M_near and M_far from Phase 1 `midpointPair()`
- Render both as **distinguished pins** on both maps (different icon / color than antipode pin)
- Dedicated "Geomates" panel showing:
  - Both points side-by-side with names, countries, distances from A and B
  - Slim enrichment (Wikipedia card, photo from Commons if available — reuse existing data sources but compact format)
  - Verification line: *"Both are exactly X km from {A_name} and {B_name}"* (anchors the math)
- Branded label: "**Geomates**" with a one-line definition: *"The two surface midpoints of any pair — your near compromise and your shared antipode."*
- Mobile: a third tab in the swipe-up drawer

### Phase 7 — Polish + retrospective post + parent-site integration
**Effort:** 2–3 days.

- Mobile audit across all new modules
- Performance check (25k-city queries on cold cache)
- Add new module to `og-image` if relevant (probably not — current OG is fine)
- Write retrospective: `geopuesto/geomates-discovery.html` (or merge into existing `index.html` as an "about the math" expandable section). Explain the M_far novelty claim with the JSX demo screenshot.
- Add a link/card on the parent `maxwellhowegis.com/tools.html` or `portfolio.html` advertising the new feature
- Tweet / Hacker News post optional (post-launch, low pressure)

---

## 5. Open decisions deferred to their phase

- **Phase 5 second-point picker mode** (search / click-map / quick-pick) — decide when wireframing the picker UI in context
- **Phase 6 Geomates enrichment depth** — slim vs medium-rich card; decide when seeing both pins on the map
- **Phase 7 retrospective post format** — separate page vs inline expandable — decide when post is drafted
- **City dataset refresh cadence** — quarterly manual refresh OR pinned forever — decide based on actual usage signals after v1 launches

## 6. Verification approach (continuous, not just Phase 4)

- **Phase 1:** §13 invariants pass in-browser before any UI work
- **Phase 3:** §20 validation gate before ring ships publicly
- **Phase 6:** Re-run invariants extended to v2 ring + Geomates (`arc(M_near, A) == arc(M_near, B)`, etc.) before ship
- **Post-ship:** Add a `?debug=1` URL flag that runs invariants on every page load and surfaces failures in console (no-op for normal users)

## 7. References

- Master spec: [`geopuesto_master_spec.md`](geopuesto_master_spec.md)
- JSX demo (visual reference for Geomates layout): [`equidistant_geometry_demo.jsx`](equidistant_geometry_demo.jsx)
- Existing project context: [`../CLAUDE.md`](../CLAUDE.md)
- GeoNames data source: https://download.geonames.org/export/dump/ (CC BY 4.0)
- Earth radius constant: 6,371 km (sphere; consistent with current Geopuesto's haversine usage)

---

**Plan owner:** Max Howe.
**Cadence:** Update this doc when phase scope changes, when an open decision is locked, or when a phase ships.
