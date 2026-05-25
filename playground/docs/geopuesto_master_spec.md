# Geopuesto: Master Specification

**Status:** Consolidated master document (supersedes `geopuesto_perpendicular_points_spec.md` and `geopuesto_gaps_to_address.md`)
**Target machine:** BRONTOSAURUS
**Language:** Python (FastAPI + NumPy stack, matches existing Geopuesto)
**Companion files:** `equidistant_geometry_demo.jsx` (interactive 3D visualization)

This document is the single source of truth for the Geopuesto extension project: the math, the v1 build, the gaps, the v2+ roadmap, and the path to scaling it as a hosted service.

---

## Table of Contents

**Part I — Concept & Foundation**
1. Executive Summary
2. Background
3. Mental Model
4. Novel Discoveries (what's actually new)
5. Research Landscape

**Part II — Core Math**
6. Geometric Foundation
7. Earth Shape Model
8. Math Pipeline
9. Python Reference Implementation

**Part III — V1 Build (The Antipodal Ring)**
10. Cities Along the Great Circle
11. Map Visualization
12. Integration with Existing Geopuesto
13. Verification Tests
14. Naming Decisions
15. Branding Note
16. v1 Build Notes

**Part IV — Gaps & Open Decisions**
17. Blockers (P0)
18. v1.x Fixes (P1)
19. Open Design Calls
20. Pre-Launch Validation Plan

**Part V — V2+ Feature Roadmap**
21. The Equidistant-from-N-Points Hierarchy
22. The General Equidistant Ring (2 arbitrary points)
23. The Midpoint Pair (the new discovery)
24. Triangulation: 3-Point Spherical Circumcenter
25. Spherical Triangles & Girard's Theorem
26. Loxodromes (Rhumb Lines)
27. Spherical Voronoi Diagrams
28. Spherical Caps
29. Mind-Benders (Theorems Worth Knowing)
30. H3 / Geodesic Grids
31. Stretch / Speculative Ideas

**Part VI — Scale & Service**
32. API Service Architecture
33. Performance & Caching
34. Hosting & Deployment
35. Pricing & Access Model
36. Real-World Use Cases
37. Open-Source Strategy
38. Implementation Order Across Tiers

---

# PART I — Concept & Foundation

## 1. Executive Summary

Geopuesto today answers one question: *what's on the other side of Earth from me?* The antipode + sea state + Sentinel imagery enrichment works, but the antipode lands in open ocean ~70% of the time and the result feels flat.

This spec extends Geopuesto into a full spherical-geometry discovery platform built around three layered ideas:

1. **The antipodal ring (v1).** Every location has a "personal equator" — the great circle perpendicular to its antipodal axis — and that ring is a meaningful set of equidistant points on Earth. Surface the cities sitting on it.
2. **The general equidistant ring (v2).** Generalize from one input + automatic antipode to *any* two user-supplied points. Each pair defines its own ring of equidistant locations. The antipodal case becomes a special case.
3. **The Midpoint Pair (v2 discovery).** For any two non-antipodal points, two surface points emerge naturally: the surface midpoint of the arc between them, and its antipode. Both sit on the equidistant ring. The first is the "compromise" location; the second is the geographic "shared antipode" of the pair. **This pair appears to be a novel geographic feature** — every existing tool surfaces the first; none surface the second; none present them as a unified discovery.

Beyond v2, the same spherical math extends to triangulation (3 points → spherical circumcenter), spherical Voronoi partitions, loxodromes, and more. The full roadmap is in Part V.

Part VI lays out hosting this as a public API service, integrating with Max's existing FastAPI / Neon / Cloudflare / Railway / Stripe / Clerk stack.

## 2. Background

Geopuesto already does:

- Antipode calculation via the standard geodetic convention (negate lat, ±180° to lon)
- Sea state lookup over ocean antipodes
- Sentinel-2 cloudless imagery overlay
- Nearest-land calculation
- Reverse geocoding

What it doesn't do, and what this spec adds:

- A ring of equidistant cities derived from the antipodal axis
- The ability to define the second pole as any user-chosen location, not just the automatic antipode
- The two distinguished "midpoint" surface points naturally derived from any two inputs
- A unified geometric framework that scales from 1 input (v1) to 2 inputs (v2) to 3+ inputs (v3+)

## 3. Mental Model

The cleanest way to think about the v1 feature:

> **"Your location and its antipode are the two poles of a new planet-wide coordinate system. The great circle perpendicular to that axis is your personal equator. Everywhere on that equator is exactly 10,007 km from you and 10,007 km from your antipode."**

The cleanest way to think about the v2 feature:

> **"Any two locations on Earth define a chord through the planet. The plane perpendicular to that chord, passing through Earth's center, intersects the surface in a great circle — the set of all places equidistant from both points. The chord's midpoint sits inside the Earth; projecting it outward to the surface gives the near midpoint (closest equidistant spot), and projecting it through Earth's center gives the far midpoint (farthest equidistant spot). Both surface midpoints sit on the ring."**

The v1 case is a degenerate version of v2 where the chord becomes a diameter and the chord midpoint collapses to Earth's center.

## 4. Novel Discoveries

Three things in this spec appear to be genuinely novel as **geographic discovery features**, even though the underlying math is well-established. They are the IP of the project.

### 4.1 The Antipodal Ring as a Discovery Surface

Spherical geometry has known for centuries that every antipodal axis has a perpendicular great circle. No existing antipode tool (Antipodes Map, Antipode Finder, Antipode Calculator, OtherSideMap, etc.) surfaces this ring as a feature, much less the populated places that intersect it.

### 4.2 The General Equidistant Ring of Two Points

The math (normal = A − B, the perpendicular bisector of the chord) is taught in spherical geometry. Half a dozen libraries can compute it (Apache Commons Geometry Spherical, the various spherical-geometry JS ports, scipy). No existing tool packages "the ring of cities equidistant from any two user inputs" as a UX feature.

### 4.3 The Midpoint Pair

This is the newest and most defensible discovery. For any two non-antipodal points A and B:

- The **near midpoint** = (A + B) / |A + B| — the surface midpoint of the great-circle arc between them. Well-known. Every "halfway between two cities" tool computes this.
- The **far midpoint** = −(A + B) / |A + B| — the antipode of the near midpoint. **No existing tool surfaces this as a paired discovery feature.**

The far midpoint is the geographic "shared antipode" of two locations — the unique surface point that is both (a) on the equidistant great circle and (b) farthest from both inputs. It is the symmetric counterpart of the midpoint everyone already calculates, sitting on the opposite side of the planet, and existing tooling has overlooked it.

Naming candidates for the new pair concept (decide before launch):

| Name | Pros | Cons |
|---|---|---|
| **Midpoint Pair** | Plain, descriptive, immediately understandable | Generic |
| **Geomates** | Plays on Geopuesto's geo (geography + geometry) brand; "mates" implies pair | Cute, possibly too whimsical |
| **Bipodes** | Parallel construction to "antipodes" but for two-point case | Coined term, unfamiliar |
| **Mediopodes** | Latin "medio" (middle) + Greek "podes" (feet); follows antipode etymology | Mouthful |
| **Antimidpoints** | Technically correct (antipode of midpoint) | Awkward |
| **Cross-points** | Echoes v1's "cross" framing | Could confuse with §4.1 |

**Recommendation:** ship internal name as "Midpoint Pair" (descriptive); brand the user-facing name as **Geomates** for the geo+geometry double-meaning consistency. Final call rests with Max.

## 5. Research Landscape

Documenting what exists in the wild so the novelty claims above are honest.

### 5.1 Well-Established Math (Borrowed)

- **Antipodal points.** Trivial lat/lon transform.
- **Great circles.** Geodesics of the sphere.
- **Great-circle distance.** Haversine / spherical law of cosines.
- **Perpendicular great circles.** Standard spherical trigonometry.
- **Spherical coordinate systems with arbitrary poles.** Used in oblique-aspect map projections (oblique Mercator, oblique azimuthal). Mathematically equivalent to choosing any antipodal pair as new poles.
- **Cross-track distance.** Perpendicular distance from a point to a great circle. Standard navigation math.
- **Surface midpoint of a great-circle arc.** Computed via spherical linear interpolation (Slerp) at t = 0.5. Widely implemented (Turf.js `midpoint`, geographiclib, scipy).
- **Borsuk–Ulam theorem.** Antipodal pairs share continuous-function values.
- **Lexell's theorem.** Locus of triangle apexes giving equal area lies on a small circle.

### 5.2 Existing Antipode Tools

All single-point antipode lookups. None surface the perpendicular ring or any derived structure:

- Antipodes Map (antipodesmap.com)
- Antipode Finder (multiple variants)
- Antipode Calculator (Omnicalculator)
- OtherSideMap
- Tunnel-to-the-other-side-of-the-world
- Geopuesto (current production version)

### 5.3 Existing Great-Circle Tools

All path-between-two-points calculators. None surface the perpendicular bisector ring:

- Great Circle Mapper (gcmap.com) — aviation routes
- Maptitude / ArcGIS / QGIS — generic GIS
- Apache Commons Geometry Spherical
- `spherical-geometry` JS library

### 5.4 Existing Midpoint Tools

All compute the near midpoint. None pair it with the far midpoint:

- **GeoMidpoint** (iOS app) — average of locations, geographic midpoint
- **Mitad** (iOS app) — halfway meeting point
- **Trippy halfway point** — road-trip midpoint along routes
- **Turf.js `midpoint`** — JS library for the spherical midpoint
- **GIS workflows** — standard midpoint calculations in ArcGIS, QGIS

### 5.5 Fringe / Adjacent Claims

The Jim Alison "ancient sites on a single great circle" theory (Easter Island, Nazca, Giza, etc.) is the closest cultural analog to Geopuesto's framing, though it's fringe rather than peer-reviewed. Demonstrates the concept of "interesting places along a great circle" has surface area in popular geography.

### 5.6 Summary of Novelty Claims

| Concept | Math is novel? | Geographic discovery feature is novel? |
|---|---|---|
| Antipodal ring (v1) | No | **Yes** |
| General equidistant ring (v2) | No | **Yes** |
| Midpoint Pair (v2) | No (math is trivial) | **Yes** — strongest novelty claim |
| Triangulation circumcenter | No | Yes |
| Spherical Voronoi | No | Borderline — research datasets exist but no consumer tool |

---

# PART II — Core Math

## 6. Geometric Foundation

### 6.1 Definitions

Let **P** be the user's location as a unit vector from Earth's center:

```
P = (cos φ cos λ, cos φ sin λ, sin φ)
```

where φ is latitude and λ is longitude in radians.

The **antipode** is **P′ = −P**.

The **antipodal axis** is the line through Earth's center connecting P and P′.

The **perpendicular great circle** (G) is the intersection of Earth's surface with the plane through the origin perpendicular to the antipodal axis. Equivalently: G is the set of all points **Q** on the unit sphere such that **Q · P = 0**.

### 6.2 Properties of G

- Every point on G is exactly 90° of arc from P and 90° from P′ (~10,007.5 km on Earth's surface from each).
- G has the same circumference as Earth (~40,030 km on a perfect sphere).
- G passes through exactly two points on the geographic equator (when P is non-polar) and is bisected by the geographic equator into two semicircles.

### 6.3 The Perpendicular Quartet

Four canonical points on G, 90° apart:

- **N\*** — closest to geographic North Pole
- **S\*** — antipode of N\* on G
- **E\*** — 90° along G easterly from N\*
- **W\*** — antipode of E\* on G

N/S/E/W labeling uses Earth's North Pole as the reference. Polar inputs trigger a fallback (see §8.3).

### 6.4 The Generalization to Two Arbitrary Points

For any two distinct unit vectors A and B (not necessarily antipodal), the set of points equidistant from both is the great circle with normal vector **(A − B)**. Derivation: `Q · A = Q · B` iff `Q · (A − B) = 0`.

The antipodal case is the special case: when B = −A, then (A − B) = 2A and the normal aligns with the antipodal axis, recovering §6.1.

The Midpoint Pair on this generalized ring:

- **M_near** = (A + B) / |A + B| — surface midpoint of the arc, on the ring
- **M_far** = −M_near — antipode of the near midpoint, also on the ring
- Verification: (A + B) · (A − B) = |A|² − |B|² = 0, so M_near ⊥ (A − B), confirming M_near is on the ring.

## 7. Earth Shape Model

All math here assumes Earth is a perfect sphere. It isn't. This section documents the assumption honestly and sketches the upgrade path.

### 7.1 The Actual Shape

```
geoid  →  ellipsoid (WGS84)  →  sphere
~bumpy potato   ~smooth M&M       ~baseball
```

- **Geoid:** mean sea level surface, varies ±100 m from the ellipsoid. Modeled by EGM2008/EGM2020.
- **WGS84 ellipsoid:** equatorial radius 6,378.137 km; polar radius 6,356.752 km; flattening 1/298.257223563; equator−pole gap ≈ 21.4 km.
- **Sphere:** mean radius 6,371 km. Used by virtually all consumer geographic tools.

### 7.2 What the Spherical Approximation Breaks

| Concept | Sphere | True ellipsoid |
|---|---|---|
| Great circle | Exists, closed | Replaced by geodesic, which generally doesn't close |
| Antipode | Clean lat/lon negate | Coordinate antipode diverges from line-through-center antipode by up to ~20 km |
| Equidistant ring | Clean great circle | Closed curve, no closed-form parameterization |
| Distance | Haversine | Vincenty / Karney iterative |

### 7.3 Practical Error from Spherical Math

| Quantity | Worst-case error |
|---|---|
| Distance between two points | ~0.5% (~50 km on 10,000 km) |
| Antipodal point | ~20 km offset |
| Equidistant ring position | ~50 km |
| Local distances (<100 km) | <1 m |

For Geopuesto's 100 km tolerance band on city matching, this is invisible.

### 7.4 Three Precision Tiers

| Tier | Math | Library | Accuracy | Notes |
|---|---|---|---|---|
| **Spherical** | unit sphere + haversine | NumPy only | ~0.5% error | v1 default |
| **Ellipsoidal (WGS84)** | true geodesics | `geographiclib` | mm-level | Pro upgrade |
| **Geoidal** | gravity-aware | EGM2008 lookups | cm-level | Overkill |

### 7.5 Recommended Approach

Ship v1 spherical with an honest "Geopuesto models Earth as a perfect sphere" footer in the UI. Build the math layer behind an `EarthModel` interface so the WGS84 backend can be slotted in later without rewriting. Re-evaluate after v1 launches.

### 7.6 Sample Ellipsoidal Code

```python
from geographiclib.geodesic import Geodesic
geod = Geodesic.WGS84

# Distance and azimuth between two points
g = geod.Inverse(lat1, lon1, lat2, lon2)
distance_m = g['s12']
azimuth_initial = g['azi1']
azimuth_final = g['azi2']

# Walk along a geodesic
line = geod.Line(lat1, lon1, azimuth_initial)
pos = line.Position(distance_m)
```

## 8. Math Pipeline

### 8.1 Lat/Lon → 3D Cartesian (unit sphere)

```
x = cos(lat) * cos(lon)
y = cos(lat) * sin(lon)
z = sin(lat)
```

### 8.2 Antipode

```
P′ = −P
```

### 8.3 Perpendicular Basis Vectors

Construct two orthonormal vectors perpendicular to P, using Earth's North Pole **Z** as reference:

```
E_perp = normalize(Z × P)
N_perp = normalize(P × E_perp)
```

Polar edge case: if |P · Z| > 0.9999, P is near a pole. Fall back to **X** = (1, 0, 0) as the reference.

### 8.4 The Four Perpendicular Points

```
N* =  N_perp;  S* = -N_perp;  E* =  E_perp;  W* = -E_perp
```

### 8.5 The Midpoint Pair (v2)

```
M_near = normalize(A + B)
M_far  = -M_near
```

Both lie on the equidistant ring with normal (A − B).

### 8.6 3D Cartesian → Lat/Lon

```
lat = asin(z)
lon = atan2(y, x)
```

Normalize longitude to [-180°, 180°].

## 9. Python Reference Implementation

```python
import numpy as np

EARTH_R_KM = 6371.0
POLAR_THRESHOLD = 0.9999

def lat_lon_to_xyz(lat_deg, lon_deg):
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    return np.array([
        np.cos(lat) * np.cos(lon),
        np.cos(lat) * np.sin(lon),
        np.sin(lat),
    ])

def xyz_to_lat_lon(v):
    v = v / np.linalg.norm(v)
    lat = np.degrees(np.arcsin(np.clip(v[2], -1.0, 1.0)))
    lon = np.degrees(np.arctan2(v[1], v[0]))
    return float(lat), float(lon)

def geopuesto_cross(lat, lon):
    """v1: the 6-point cross + perpendicular ring from a single input."""
    P = lat_lon_to_xyz(lat, lon)
    Z = np.array([0.0, 0.0, 1.0])
    if abs(np.dot(P, Z)) > POLAR_THRESHOLD:
        Z = np.array([1.0, 0.0, 0.0])
    E_perp = np.cross(Z, P);     E_perp /= np.linalg.norm(E_perp)
    N_perp = np.cross(P, E_perp); N_perp /= np.linalg.norm(N_perp)
    return {
        "origin":     (lat, lon),
        "antipode":   xyz_to_lat_lon(-P),
        "perp_north": xyz_to_lat_lon( N_perp),
        "perp_south": xyz_to_lat_lon(-N_perp),
        "perp_east":  xyz_to_lat_lon( E_perp),
        "perp_west":  xyz_to_lat_lon(-E_perp),
    }

def midpoint_pair(lat_a, lon_a, lat_b, lon_b):
    """v2: the Midpoint Pair (Geomates) of two input locations."""
    A = lat_lon_to_xyz(lat_a, lon_a)
    B = lat_lon_to_xyz(lat_b, lon_b)
    s = A + B
    if np.linalg.norm(s) < 1e-9:
        raise ValueError("A and B are antipodal; midpoint pair undefined (use v1).")
    M_near = s / np.linalg.norm(s)
    return {
        "near": xyz_to_lat_lon( M_near),
        "far":  xyz_to_lat_lon(-M_near),
        "chord_midpoint_xyz": tuple((A + B) / 2),  # inside Earth
    }
```

---

# PART III — V1 Build (The Antipodal Ring)

## 10. Cities Along the Great Circle

### 10.1 Concept

For every populated place on Earth, compute its perpendicular distance to G (the antipodal ring). Keep the ones within tolerance (default 100 km). Result: a list of cities all roughly 10,007 km from the user and their antipode.

### 10.2 Math

```
α = asin(|Q · P|)              # perpendicular angular distance
d_km = EARTH_R_KM * α
```

Filter cities where `d_km < tolerance_km`.

### 10.3 Reference Implementation

```python
def cities_on_great_circle(lat, lon, cities, tolerance_km=100, min_pop=15000):
    P = lat_lon_to_xyz(lat, lon)
    Z = np.array([0.0, 0.0, 1.0])
    if abs(np.dot(P, Z)) > POLAR_THRESHOLD:
        Z = np.array([1.0, 0.0, 0.0])
    E_perp = np.cross(Z, P); E_perp /= np.linalg.norm(E_perp)
    N_perp = np.cross(P, E_perp); N_perp /= np.linalg.norm(N_perp)

    results = []
    for city in cities:
        if city.get("population", 0) < min_pop:
            continue
        Q = lat_lon_to_xyz(city["lat"], city["lon"])
        dot_QP = float(np.dot(Q, P))
        d_circle = EARTH_R_KM * np.arcsin(min(abs(dot_QP), 1.0))
        if d_circle >= tolerance_km:
            continue
        d_origin   = EARTH_R_KM * np.arccos(np.clip( dot_QP, -1.0, 1.0))
        d_antipode = EARTH_R_KM * np.arccos(np.clip(-dot_QP, -1.0, 1.0))
        q_proj_n = float(np.dot(Q, N_perp))
        q_proj_e = float(np.dot(Q, E_perp))
        bearing = (np.degrees(np.arctan2(q_proj_e, q_proj_n)) + 360.0) % 360.0
        results.append({
            **city,
            "distance_from_circle_km":   float(d_circle),
            "distance_from_origin_km":   float(d_origin),
            "distance_from_antipode_km": float(d_antipode),
            "bearing_along_circle_deg":  float(bearing),
        })
    return sorted(results, key=lambda c: c["distance_from_circle_km"])
```

### 10.4 Vectorized for Performance

```python
def precompute_city_xyz(cities):
    lats = np.array([c["lat"] for c in cities])
    lons = np.array([c["lon"] for c in cities])
    lat_r, lon_r = np.radians(lats), np.radians(lons)
    return np.stack([
        np.cos(lat_r) * np.cos(lon_r),
        np.cos(lat_r) * np.sin(lon_r),
        np.sin(lat_r),
    ], axis=1)

def cities_on_great_circle_vec(lat, lon, cities, city_xyz, tolerance_km=100):
    P = lat_lon_to_xyz(lat, lon)
    dots = city_xyz @ P
    d_circle = EARTH_R_KM * np.arcsin(np.abs(dots))
    mask = d_circle < tolerance_km
    return [(cities[i], float(d_circle[i])) for i in np.where(mask)[0]]
```

### 10.5 Dataset Recommendations

| Dataset | Records | Pop threshold | License | Use case |
|---|---|---|---|---|
| GeoNames `cities15000` | ~25k | ≥15,000 | CC BY 4.0 | **v1 default** |
| GeoNames `cities5000` | ~50k | ≥5,000 | CC BY 4.0 | Regional centers |
| GeoNames `cities1000` | ~150k | ≥1,000 | CC BY 4.0 | Small-town discovery |
| Natural Earth populated_places | ~7k | major | Public domain | Clean curated |
| OpenStreetMap `place=*` | millions | varies | ODbL | Most complete |

### 10.6 Ranking & Filtering

- Minimum population slider (1k–1M)
- Tolerance band (50/100/250/500 km)
- Continent filter
- Sort by: closeness / population / bearing / distance from origin
- Capital cities only (`feature_code == PPLC`)

## 11. Map Visualization

### 11.1 Sampling G for Polyline Rendering

```python
def sample_great_circle(lat, lon, n_samples=360):
    P = lat_lon_to_xyz(lat, lon)
    Z = np.array([0.0, 0.0, 1.0])
    if abs(np.dot(P, Z)) > POLAR_THRESHOLD:
        Z = np.array([1.0, 0.0, 0.0])
    E_perp = np.cross(Z, P); E_perp /= np.linalg.norm(E_perp)
    N_perp = np.cross(P, E_perp); N_perp /= np.linalg.norm(N_perp)
    thetas = np.linspace(0, 2*np.pi, n_samples, endpoint=False)
    points = np.outer(np.cos(thetas), N_perp) + np.outer(np.sin(thetas), E_perp)
    return [xyz_to_lat_lon(p) for p in points]
```

### 11.2 Antimeridian Crossing

G typically crosses ±180° longitude. Split the polyline at crossings to render cleanly.

### 11.3 Globe View

A 3D globe (Cesium, Globe.gl, D3 orthographic) renders the ring without distortion. Strong v2 candidate.

## 12. Integration with Existing Geopuesto

### 12.1 API Response Shape (v1)

```json
{
  "origin": { "lat": 42.52, "lon": -70.90, "name": "Salem, MA" },
  "antipode": { "lat": -42.52, "lon": 109.10, "...": "enrichment" },
  "perpendicular_quartet": {
    "north": { "lat": 0, "lon": 0, "...": "enrichment" },
    "south": { "lat": 0, "lon": 0, "...": "enrichment" },
    "east":  { "lat": 0, "lon": 0, "...": "enrichment" },
    "west":  { "lat": 0, "lon": 0, "...": "enrichment" }
  },
  "great_circle": {
    "polyline": [[0, 0]],
    "cities": [
      {
        "name": "...", "country": "...", "population": 0,
        "lat": 0, "lon": 0,
        "distance_from_circle_km": 0,
        "distance_from_origin_km": 0,
        "distance_from_antipode_km": 0,
        "bearing_along_circle_deg": 0
      }
    ]
  },
  "earth_model": "sphere",
  "earth_radius_km": 6371.0
}
```

### 12.2 UI Direction

- Existing antipode view stays primary
- "Show full geometry" toggle reveals the four cardinal points
- "Cities on your equator" scrollable panel
- Great circle as colored polyline on the map
- Tap a city to zoom and see details

## 13. Verification Tests

| Invariant | Expected |
|---|---|
| Origin ↔ antipode | 180° / ~20,015 km |
| Origin ↔ any perpendicular point | 90° / ~10,007.5 km |
| Antipode ↔ any perpendicular point | 90° / ~10,007.5 km |
| N\* ↔ S\* | 180° |
| N\* ↔ E\* | 90° |
| Origin · N_perp | 0 |
| N_perp · E_perp | 0 |
| Distance from perpendicular point to G | 0 |
| (v2) M_near ↔ M_far | 180° |
| (v2) M_near ↔ A = M_near ↔ B | yes, equal |
| (v2) M_far ↔ A = M_far ↔ B | yes, equal |

Edge cases: lat = ±90°, lon = ±180°, A = B (degenerate), A = −B (degenerate for v2 midpoints; valid for v1 ring).

## 14. Naming Decisions

The four perpendicular cardinal points need labels. Internal IDs stay `perp_north / perp_south / perp_east / perp_west`. User-facing candidates:

- **Cardinal:** "Perpendicular North/South/East/West"
- **Branded:** "Cross Point N/E/S/W"
- **Geometric:** "Equator Point N/E/S/W"

Recommendation: decide after v1 is functional in context.

The great circle itself: **"your equator"** is the most accessible label.

The Midpoint Pair (v2): see §4.3. Recommendation: **Geomates**.

## 15. Branding Note

Geopuesto's name carries a dual meaning to lean into:

- **Geo** as in **geography** — places, maps, the physical world
- **Geo** as in **geometry** — the math underlying the feature

The product sits at that intersection. "The geometry of geography" captures the brand without being precious. Surface the math as a differentiator, not as something to hide.

## 16. v1 Build Notes

1. Pure-math layer (`lat_lon_to_xyz`, `xyz_to_lat_lon`, `geopuesto_cross`). Unit tests against §13.
2. Polar edge case fallback.
3. Great circle sampler for polyline rendering.
4. GeoNames loader (download `cities15000.zip`, parse TSV, cache as Parquet).
5. Vectorized city filter.
6. API integration into existing Geopuesto endpoint per §12.1.
7. Antimeridian polyline splitting.
8. Frontend rendering of ring + city list.
9. UI polish (filters from §10.6).
10. Naming pass.

**Architectural note:** wrap distance and geodesic functions behind an `EarthModel` interface (`SphericalEarth`, `WGS84Earth` implementations) so future ellipsoidal upgrade per §7.5 is a one-line swap.

---

# PART IV — Gaps & Open Decisions

## 17. Blockers (P0) — must resolve before v1 ships

### 17.1 Antimeridian wrapping in city-filtering code

**What.** §11.2 covers antimeridian splitting for the polyline. The city-filtering code in §10.3 does its math in Cartesian (safe), but downstream code that re-converts to lat/lon and assumes longitude monotonicity will break for rings crossing ±180°.

**Fix.** Keep all geometry in 3D Cartesian until the final API output. Add explicit test case: origin at lat 0, lon 175 → ring crosses antimeridian → verify city list is complete and polyline renders cleanly.

### 17.2 Tolerance band default is undefined

**What.** §10's `tolerance_km=100` is a guess. The number drives the entire feel of the feature.

**Fix.** Run the algorithm against 20 sample origins; check city counts at 10/50/100/250/500 km. Pick the value where median ring has 15–30 cities. Likely 100–150 km. Expose as a UI slider.

### 17.3 Fallback for locations not in GeoNames

**What.** Spec implicitly assumes input is a known city. Real users will type addresses, click coordinates, paste lat/lon.

**Fix.** Decouple origin (always lat/lon) from city-enrichment dataset. Origin reverse-geocodes for *display* only; ring geometry computes from raw lat/lon regardless. Degrade gracefully when GeoNames returns no matches.

### 17.4 Boring-antipode UX hypothesis is untested

**What.** The whole premise is that the new ring + city list solves the "antipode is ocean" problem. We have not actually shown this to anyone.

**Fix.** Before merging v1: run against 50 representative origins, manually rate each output for "interestingness" (land hits, recognizable cities, named countries). Target ≥70% interesting. If lower, widen tolerance, ship §22 (general 2-point) sooner, or reframe the UX. Show to 3 non-Max users before launch.

## 18. v1.x Fixes (P1)

### 18.1 Performance at 150k cities × many queries

**What.** v2 (§22) opens up "explore any two points" — users will fire many queries per session. `cities15000` is fast; `cities1000` may not be at scale.

**Fix.** Spatial index (R-tree or KD-tree on city XYZ) to pre-filter near the ring plane before cross-track math. Profile first; defer optimization until needed.

### 18.2 Ellipsoid vs sphere

**What.** Spherical math has ~50 km worst-case error. Most users won't notice; some will.

**Fix.** Ship spherical; build the `EarthModel` interface; watch for user complaints; ship WGS84 backend if needed.

### 18.3 Caching

**What.** Every query recomputes. Salem→Pacific has been hit 100 times today; computing it 100 times is wasteful.

**Fix.** Redis (or in-memory LRU) keyed on `(origin_lat, origin_lon, tolerance, min_pop, dataset_version)`. TTL ~24 hours.

### 18.4 Altitude / elevation

**What.** GeoNames has elevation. Spec treats all cities as sea-level points. Sub-km effect, invisible in 100 km tolerance.

**Fix.** Document explicitly. Don't actually fix unless someone complains.

## 19. Open Design Calls (DECISION)

### 19.1 v1 antipode-only vs flexible second-point picker

**Trade-off:**
- Focused v1: sharper marketing, simpler UI, faster ship
- Flexible v1: more powerful day one, addresses ocean-antipode problem directly

**Recommendation:** ship antipode-only, build math for arbitrary 2-point pairs from day one, flip on UI toggle in v1.5 / v2.0.

### 19.2 Which GeoNames dataset for v1

**Recommendation:** `cities15000` default, expose `cities1000` toggle as "show small towns too." Users opt in to depth; default UX stays clean.

### 19.3 Naming the four cardinal points

**Recommendation:** decide post-build when seen in actual UI. Lean toward "Cross Point N/E/S/W" or "Equator Point N/E/S/W."

### 19.4 v2+ roadmap demand is unvalidated

**Recommendation:** ship v1, add analytics, treat §21+ as possibility space, build next based on real usage signals.

### 19.5 Naming the Midpoint Pair

See §4.3. **Recommendation: Geomates** (brand-consistent, memorable, ties to geo+geometry).

## 20. Pre-Launch Validation Plan

- [ ] Algorithm against 50 representative origins; manually rate interestingness
- [ ] ≥70% rated interesting before launch
- [ ] 3 non-Max users walk through v1; capture reactions
- [ ] Antimeridian crossing test (origin at lat 0, lon 175)
- [ ] Polar input test (origin at lat 89.9, lon 0)
- [ ] Origin = known city in GeoNames; verify no double-counting
- [ ] Tolerance default produces median 15–30 cities
- [ ] Query latency <200 ms at chosen dataset
- [ ] Cache hit/miss rates if caching implemented
- [ ] Cross-platform render check (mobile + desktop)

---

# PART V — V2+ Feature Roadmap

## 21. The Equidistant-from-N-Points Hierarchy

The unifying pattern. Adds one input, drops the equidistant set's dimension by one:

| Inputs | Equidistant locus | Dim | Feature |
|---|---|---|---|
| 1 point | antipode | 0-d (point) | **v1: antipode** |
| 2 antipodal points | perpendicular great circle | 1-d (curve) | **v1: ring** |
| 2 arbitrary points | equidistant great circle | 1-d (curve) | **v2: general ring** |
| 2 arbitrary points | the Midpoint Pair on that ring | 0-d (point pair) | **v2: Geomates** |
| 3 points | spherical circumcenter | 0-d (point pair) | **v2: triangulation** |
| 4+ points | (overdetermined, empty) | — | **v3: 1-center optimization** |

## 22. The General Equidistant Ring of Two Points

> Interactive: `equidistant_geometry_demo.jsx`.

**Concept.** Generalize v1's automatic antipodal second pole to any user-supplied point B. The equidistant locus is the great circle with normal (A − B). Same math, different inputs.

**Implementation.**

```python
def equidistant_ring(lat_a, lon_a, lat_b, lon_b, n_samples=360):
    A = lat_lon_to_xyz(lat_a, lon_a)
    B = lat_lon_to_xyz(lat_b, lon_b)
    n = A - B
    norm_n = np.linalg.norm(n)
    if norm_n < 1e-12:
        raise ValueError("A and B coincide.")
    n /= norm_n
    up = np.array([0.0, 1.0, 0.0])
    if abs(np.dot(n, up)) > 0.98:
        up = np.array([1.0, 0.0, 0.0])
    u = np.cross(n, up); u /= np.linalg.norm(u)
    v = np.cross(n, u);  v /= np.linalg.norm(v)
    thetas = np.linspace(0, 2*np.pi, n_samples, endpoint=False)
    points = np.outer(np.cos(thetas), u) + np.outer(np.sin(thetas), v)
    return [xyz_to_lat_lon(p) for p in points]


def cities_on_equidistant_ring(lat_a, lon_a, lat_b, lon_b, cities,
                               tolerance_km=100, min_pop=15000):
    A = lat_lon_to_xyz(lat_a, lon_a)
    B = lat_lon_to_xyz(lat_b, lon_b)
    n = A - B; n /= np.linalg.norm(n)
    results = []
    for city in cities:
        if city.get("population", 0) < min_pop:
            continue
        Q = lat_lon_to_xyz(city["lat"], city["lon"])
        dot_Qn = float(np.dot(Q, n))
        d_circle = EARTH_R_KM * np.arcsin(min(abs(dot_Qn), 1.0))
        if d_circle < tolerance_km:
            d_a = EARTH_R_KM * np.arccos(np.clip(float(np.dot(Q, A)), -1.0, 1.0))
            d_b = EARTH_R_KM * np.arccos(np.clip(float(np.dot(Q, B)), -1.0, 1.0))
            results.append({
                **city,
                "distance_from_ring_km": float(d_circle),
                "distance_from_a_km":    float(d_a),
                "distance_from_b_km":    float(d_b),
            })
    return sorted(results, key=lambda c: c["distance_from_ring_km"])
```

**Properties.**

- Ring distance from each input = arc(A,B) / 2.
- Salem ↔ Tokyo: ring ~5,400 km from each.
- Boston ↔ NYC: ring ~152 km from each.
- M_near sits on the ring by construction (verification anchor).

**Use cases.**

- "Cities between me and a friend"
- "Cities between two landmarks"
- Meeting-point planning
- Wedding/event venue search

## 23. The Midpoint Pair (Geomates) — The New Discovery

> See §4.3 for novelty claim. This is the most defensible piece of original IP in the spec.

**Concept.** For any two non-antipodal points A and B, the chord through Earth has a midpoint inside the planet. Projecting that midpoint out to the surface gives two distinguished points:

- **M_near** = (A + B) / |A + B| — the "compromise" surface midpoint. Equidistant from A and B; the closest such point on the ring.
- **M_far** = −M_near — the antipode of M_near. Also equidistant from A and B; the farthest such point on the ring. **Never surfaced by existing geographic tooling.**

**Properties.**

- Both M_near and M_far lie on the equidistant ring (§22).
- M_near and M_far are antipodal to each other.
- arc(M_near, A) = arc(M_near, B) = arc(A, B) / 2.
- arc(M_far, A) = arc(M_far, B) = π − arc(A, B) / 2.
- For antipodal A, B: degenerate (every direction works); v1's antipodal ring handles this case.

**Implementation.** See §9 `midpoint_pair()`.

**Geographic interpretation.**

- M_near = "the geographic compromise" between two people/places
- M_far = "the shared antipode" — the surface location maximally far from both, while still being on their ring

**Use cases (the IP-defensible features).**

- **Long-distance couple discovery.** Show both Geomates for a couple: "your near midpoint" + "your shared antipode."
- **Travel planning.** "Halfway between us on land" (near) and "the most exotic compromise" (far) for vacation ideas.
- **Educational geography.** Visualize how chord geometry on a sphere generates a paired point structure.
- **Branded share content.** "My Geomates with [name] are X and Y" as a social-shareable feature.

**Verification.**

```python
# arc(M_near, A) ≈ arc(M_near, B), to within floating point
# arc(M_near, M_far) ≈ π
# M_near and M_far both satisfy: dot with (A - B) ≈ 0
```

**v2 priority.** This is the feature that turns v2 from "generalized v1" into a discovery story worth marketing. Ship it alongside §22.

## 24. Triangulation: 3-Point Spherical Circumcenter

**Concept.** Three locations A, B, C define a unique antipodal pair K and K′ such that all three inputs are equidistant from K. Angular distance from K to each input = angular radius of the circumcircle.

**Math.**

```
n = (B - A) × (C - A)
K = normalize(n)
if K · (A + B + C) < 0: K = -K
r_angular = acos(K · A)
```

**Implementation.**

```python
def spherical_circumcenter(lat_a, lon_a, lat_b, lon_b, lat_c, lon_c):
    A = lat_lon_to_xyz(lat_a, lon_a)
    B = lat_lon_to_xyz(lat_b, lon_b)
    C = lat_lon_to_xyz(lat_c, lon_c)
    n = np.cross(B - A, C - A)
    norm = np.linalg.norm(n)
    if norm < 1e-12:
        raise ValueError("Inputs are colinear on a great circle.")
    K = n / norm
    if np.dot(K, A + B + C) < 0:
        K = -K
    r_angular = np.arccos(np.clip(np.dot(K, A), -1.0, 1.0))
    return {
        "circumcenter":          xyz_to_lat_lon(K),
        "circumcenter_antipode": xyz_to_lat_lon(-K),
        "radius_km":             float(EARTH_R_KM * r_angular),
        "radius_deg":            float(np.degrees(r_angular)),
    }
```

**Use cases.** "Where's the geographic mediator of three cities?" "Three friends, one equidistant spot." Cities on the circumcircle = another ring discovery.

## 25. Spherical Triangles & Girard's Theorem

**Area = (α + β + γ − π) × R²** where α, β, γ are interior angles.

Surface area from angular excess. Demonstrates Earth's non-flatness visually. Strong educational angle (howe2math tie-in).

**Display:** edge lengths, interior angles, area, spherical excess as "curvature signature."

## 26. Loxodromes (Rhumb Lines)

Paths of constant compass bearing. Not great circles. Spiral toward the poles infinitely with finite total length. Historically: why Mercator projection was invented.

**Math.** Loxodrome from (φ₀, λ₀) at bearing θ:

```
λ(φ) = λ₀ + tan(θ) × ln(tan(π/4 + φ/2) / tan(π/4 + φ₀/2))
L = R × |φ₁ − φ₀| / cos(θ)        (for θ ≠ 90°)
```

**Use case.** "Follow constant northeast from Salem — where do you end up?" Show the spiral on a globe.

## 27. Spherical Voronoi Diagrams

Partition Earth into cells, one per seed point. Each cell = all points closer to its seed than any other. **Every Voronoi edge is a piece of an equidistant great circle between two seeds** — direct connection to §22's math.

**Implementation.** `scipy.spatial.SphericalVoronoi`.

**Use cases.** "Closest UNESCO site," "closest active volcano," "your nearest McDonald's." Cell visualization.

## 28. Spherical Caps

Points within angular distance r of center P. Area = `2π R² (1 − cos r)`.

**Membership:** Q in cap iff `Q · P > cos r`.

**Use cases.** "Within 500 km of you." Compare caps around you vs antipode.

## 29. Mind-Benders (Theorems Worth Knowing)

- **Borsuk–Ulam.** At every instant, two antipodal Earth points share both temperature *and* barometric pressure.
- **Hairy ball.** At every instant, somewhere on Earth has exactly zero surface wind.
- **Girard's.** (§25) Area = angular excess × R².
- **Lexell's.** Locus of equal-area triangle apexes lies on a small circle.
- **Ham sandwich.** Three measurable objects in 3-space can be bisected by one plane.
- **Four-color theorem.** Holds on a sphere as well as the plane.

## 30. H3 / Geodesic Grids

Uber's open-source hex hierarchical spatial index. 122 cells at res 0, ~1 m² at res 15. Python: `h3`.

**Use cases.** Spatial indexing, neighbor discovery, analytics aggregation.

## 31. Stretch / Speculative Ideas

- Antipodal climate twins (Borsuk–Ulam in real time via weather API)
- Time-zone twins on the ring
- Historical great-circle cities (how rings have shifted with population over centuries)
- N-point 1-center optimization for 4+ inputs
- The Bellamy ring (Sam Bellamy's last known position → ring; ties to Whydah research)
- Cities on the Geomates' connecting line (the chord midpoint axis)

---

# PART VI — Scale & Service

## 32. API Service Architecture

The math is cheap; the service infrastructure is where this becomes a product. Architecture proposal:

```
┌─────────────────────────────────────────────────────────────┐
│                    Edge (Cloudflare)                         │
│  • Auth (API key validation)                                 │
│  • Rate limiting                                             │
│  • CDN cache for deterministic raw-geometry endpoints        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  FastAPI Application                         │
│  /v1/antipode             — single-point + perp ring         │
│  /v1/ring                 — 2-point equidistant ring         │
│  /v1/geomates             — Midpoint Pair (the new IP)       │
│  /v1/triangulate          — 3-point circumcenter             │
│  /v1/loxodrome            — constant-bearing spiral          │
│  /v1/voronoi              — nearest-cell lookup              │
│  /v1/cap                  — within-radius query              │
│  /v1/raw/*                — geometry only, no enrichment     │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┼───────────┐
                ▼           ▼           ▼
        ┌────────────┐ ┌─────────┐ ┌─────────────┐
        │   Redis    │ │ GeoNames│ │ Sentinel /  │
        │   cache    │ │ in mem  │ │ weather /   │
        │            │ │ (~30MB) │ │ sea state   │
        └────────────┘ └─────────┘ └─────────────┘
                            │
                            ▼
                    ┌─────────────────┐
                    │  Neon (Postgres)│
                    │  • analytics    │
                    │  • API keys     │
                    │  • billing      │
                    └─────────────────┘
```

### 32.1 Endpoints

| Endpoint | Inputs | Output |
|---|---|---|
| `POST /v1/antipode` | `{lat, lon, options}` | antipode + perp ring + cities |
| `POST /v1/ring` | `{lat1, lon1, lat2, lon2, options}` | equidistant ring + cities |
| `POST /v1/geomates` | `{lat1, lon1, lat2, lon2}` | M_near + M_far + enrichment |
| `POST /v1/triangulate` | `{lat1, lon1, lat2, lon2, lat3, lon3}` | circumcenter + radius |
| `POST /v1/loxodrome` | `{lat, lon, bearing_deg, distance_km}` | spiral polyline |
| `POST /v1/voronoi` | `{lat, lon, dataset}` | cell + neighbors |
| `POST /v1/cap` | `{lat, lon, radius_km, dataset}` | cities within |
| `GET /v1/raw/ring?...` | query params | polyline only (CDN-cacheable) |
| `GET /v1/raw/geomates?...` | query params | two lat/lon points |

### 32.2 Auth & Quotas

- API keys in `Authorization: Bearer ...` header
- Clerk user accounts (existing stack)
- Stripe billing (existing stack)
- Rate limits enforced at the edge

## 33. Performance & Caching

### 33.1 Cold-Start

- Load GeoNames `cities15000` (~5 MB compressed, ~30 MB in memory) at boot
- Precompute city XYZ as `numpy.ndarray` (`n × 3` float64) once
- Boot time: ~2 seconds

### 33.2 Hot-Path

- Vectorized NumPy filter: ~10–50 ms per query for `cities15000`
- ~100–300 ms for `cities1000`
- Add R-tree spatial pre-filter if `cities1000` becomes the default

### 33.3 Caching Strategy

- **Edge cache (Cloudflare):** deterministic raw geometry endpoints. TTL 30 days. Massive hit-rate boost for repeat queries.
- **Application cache (Redis):** enriched responses (with weather, sea state, Sentinel). TTL 24 hours.
- **In-memory LRU:** hot lat/lon → city XYZ projections.

### 33.4 Scaling

- Stateless FastAPI containers
- Horizontal scale on Railway
- Sticky sessions not required (no per-user state in compute path)
- Postgres only for analytics and billing — not in hot path

## 34. Hosting & Deployment

Recommended stack (matches Max's existing Geopuesto setup):

| Layer | Choice | Notes |
|---|---|---|
| Compute | **Railway** | Already in use; supports FastAPI + autoscaling |
| Database | **Neon (Postgres)** | Already in use; analytics + billing data |
| Cache | **Upstash Redis** or **Railway Redis** | Cheap, fast |
| Edge | **Cloudflare** | Workers for auth + caching |
| Auth | **Clerk** | Already in use |
| Payments | **Stripe** | Already in use |
| Monitoring | **Sentry** + **Posthog** | Errors + product analytics |
| Domain | **api.geopuesto.com** | Subdomain off existing |

Deployment: GitHub Actions → Railway. Branch-based preview environments for testing.

## 35. Pricing & Access Model

| Tier | Price | Quotas | Use case |
|---|---|---|---|
| **Free / Public** | $0 | 1,000 req/day, public API key | Hobby, educational, demos |
| **Hobby** | $5/mo | 10k req/day | Side projects, small apps |
| **Pro** | $25/mo | 100k req/day | Production apps |
| **Enterprise** | Custom | Custom | High-volume, SLA, dedicated support |

Free tier should be generous enough to drive viral adoption. The math is cheap; the moat is the brand, the framing, and the discoverability.

Add a "show your support" donation tier even for free users — most won't pay but some will.

## 36. Real-World Use Cases

Customers who would use this API:

- **Dating / relationship apps** — long-distance couples, "where's our Geomate?"
- **Travel / meetup planning** — "halfway between us"
- **Wedding planning** — destination-equidistant venue picker
- **Conference / event organizers** — fair-distance host city selection
- **Educational geography tools** — interactive geometry learning
- **GIS workflows** — drop-in equidistant analysis
- **Custom map applications** — Mapbox / Leaflet integrations
- **Geographic curiosity tools** — "facts about your location"
- **Genealogy services** — ancestral midpoints between branches
- **Logistics / shipping** — multi-warehouse optimization (with v3 N-point)

## 37. Open-Source Strategy

Recommended split:

- **Open-source:** `geopuesto-math` Python package on PyPI. Pure math, no enrichment, no hosting. Pure marketing — every blog post that references the math links back. Apache 2.0 license. Reputation builder.
- **Closed-source / hosted:** the API service. Enrichment (Sentinel, sea state, GeoNames pipeline), caching, scale, dashboard, analytics. Stripe-gated.

The open package becomes the canonical reference; the hosted service is the convenience layer.

Documentation site at `docs.geopuesto.com` — auto-generated OpenAPI + examples in curl / Python / JS, interactive playground (use the v2 demo as the basis).

## 38. Implementation Order Across Tiers

| Tier | Sections | Effort | Dependencies |
|---|---|---|---|
| **v1.0** | §6–§16 (sphere + antipodal ring + cities) | ~1 week | NumPy, GeoNames |
| **v1.1** | §28 spherical caps | ~1 day | none new |
| **v2.0** | §22 general 2-point ring | ~3 days | none new |
| **v2.1** | **§23 Midpoint Pair (Geomates)** | ~2 days | none new — *the new IP, ship this aggressively* |
| **v2.2** | §24 triangulation | ~2 days | none new |
| **v2.3** | §25 spherical triangle visualization | ~3 days | globe view (Cesium / Globe.gl) |
| **v2.4** | §26 loxodromes | ~2 days | none new |
| **v3.0** | §27 spherical Voronoi | ~1 week | scipy.spatial, dataset curation |
| **v3.1** | §30 H3 grid integration | ~3 days | h3 library |
| **service** | §32–§37 hosted API | ~2 weeks | FastAPI scaffolding, Stripe integration, docs |
| **v4.0** | §7.5 ellipsoidal upgrade | ~1 week | geographiclib |
| **stretch** | §29 Borsuk–Ulam realtime | ongoing | global weather API |

**Most natural ship order:**

1. v1.0 (the antipodal ring) — proves the framing, builds an audience
2. v2.0 + v2.1 in the same release — generalize the ring AND introduce Geomates as the headline new feature. This is the marketing moment.
3. service tier opens up alongside v2 — API + dashboard
4. v2.2+ as iterative additions

The Midpoint Pair (Geomates, §23) is the headline of v2 and the strongest IP claim in the project. Frame the v2 release around it.

---

## Appendix A: Companion Files

- **`equidistant_geometry_demo.jsx`** — interactive 3D visualization (React + Three.js). Shows the chord through Earth, interior midpoint, and the Geomates pair (near + far surface midpoints). Mobile-friendly. Use as visual reference for v2 UI work and as embedded demo content on `docs.geopuesto.com`.

## Appendix B: Glossary

| Term | Definition |
|---|---|
| **Antipode** | Point diametrically opposite on a sphere |
| **Antipodal ring** | The great circle perpendicular to a point's antipodal axis (v1) |
| **Chord** | Straight line through the sphere's interior between two surface points |
| **Equidistant ring** | Great circle of points equidistant from two given points (v2) |
| **Geomates** | Proposed name for the Midpoint Pair — see §4.3 |
| **Great circle** | Intersection of a sphere with a plane through its center |
| **M_near** | Near surface midpoint — (A + B) / \|A + B\| |
| **M_far** | Far surface midpoint — antipode of M_near |
| **Midpoint Pair** | Internal name for {M_near, M_far} |
| **Perpendicular quartet** | The four cardinal points on the antipodal ring (N\*, S\*, E\*, W\*) |
| **Spherical circumcenter** | Point equidistant from three inputs |
| **WGS84** | World Geodetic System 1984 — Earth ellipsoid model |

---

**End of master specification.**
