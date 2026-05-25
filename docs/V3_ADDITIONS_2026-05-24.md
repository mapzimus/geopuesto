# Geopuesto v2 — Additional Concepts to Fold In

Followup notes, 2026-05-24. Captures concepts surfaced from the Wikipedia "See also" list on loxodromes/rhumb lines that weren't covered in the main planning doc. To be merged into Geopuesto v2 architecture when convenient.

---

## Already covered in main doc (no action needed)

- Great circle, great-circle distance, rhumb line / loxodromic navigation, geographical distance, spherical trigonometry, compass rose. Mentioning here only to confirm they're handled.

---

## New concept: Geodesics on an ellipsoid

The true shortest path between two points on WGS84 — what GPS and real navigation actually use. Different from both great circles (sphere math) and great ellipses.

### Why it matters

Every great-circle calculation in Geopuesto v1 implicitly uses the spherical approximation. For visualization that's fine. For sub-100-meter accuracy or for users who care about real-world correctness, the geodesic-on-ellipsoid is the right answer.

### Math reference

- **Vincenty's formulae** (1975) — iterative method, accurate to about 0.5 mm. Slow convergence near antipodal points.
- **Karney's algorithm** (2013) — better convergence, handles antipodal cases. Library: GeographicLib (Python: `geographiclib` package; JS: `geographiclib-geodesic`).
- Both give: geodesic distance, initial bearing, final bearing — same outputs as great-circle math, just on the ellipsoid.

### Where it fits in Geopuesto

- **Real-Earth Mode toggle** (Phase 6 in main doc): when ellipsoid mode is on, swap great-circle math for geodesic math in:
  - Antipode distance display
  - Two-point orthodrome rendering
  - Thickness ring widths (real ground distance vs angular distance)
  - Cross-track and along-track distance
- The polyhedron-vertex math doesn't need geodesic upgrades — vertices are points, not paths. Only paths between points change.

### Antipode behavior on an ellipsoid

Worth noting: the antipode of a point on an ellipsoid is still well-defined geometrically (the point diametrically opposite through the center), but the geodesic from a point to its antipode is *not unique* on an ellipsoid. There are infinitely many geodesics of equal length between antipodal points (just like on a sphere — every meridian for the poles, or every great circle through any antipodal pair). For Geopuesto display, pick one consistently (probably the prime-meridian-aligned one) and note the non-uniqueness in the "what's this?" popover.

---

## New concept: Isoazimuthal curves

The locus of points on a sphere (or ellipsoid) that share the same azimuth/bearing from a fixed reference point.

### What it is

Pick Salem. Pick a bearing, say 045° (northeast). The isoazimuthal curve at 045° from Salem is *every* point on Earth where the initial bearing back to Salem is 045°. Not a great circle — it's a curve that spirals as it crosses latitudes.

Compare to other "from a point" loci:
- **Small circle**: constant *distance* from Salem.
- **Great circle through Salem**: constant *azimuth in both directions* (only meridians and the equator).
- **Isoazimuthal**: constant *initial azimuth from Salem* — generally a spiral.

### Why it's useful for Geopuesto

A new visualization mode: "Show me all places I'd reach by heading exactly NNE from here." Pairs well with the existing rhumb-line/loxodrome content because loxodromes ARE isoazimuthal curves where the azimuth is measured continuously, not just at the starting point.

Subtle distinction worth getting right:
- **Loxodrome** (rhumb line): the path where bearing stays constant *along the path itself*.
- **Isoazimuthal**: the locus where bearing back to the origin is constant *from each point on the locus*.

These are the same curve only in simple cases. The general isoazimuthal is more exotic.

### Where it fits in Geopuesto

New mode in the Polyhedra/Curves Suite — or rather, a new sibling to "small circle at distance d." Same point-input pattern, different output:

- **"Ring of cities"** = small circle (existing concept)
- **"Heading ring"** = isoazimuthal curve at a chosen bearing (new)

User picks Salem, picks "045°," sees a curve sweep across the globe. Cities along that curve get the v1 enrichment treatment.

---

## New concept: Portolan maps + Windrose networks

Pre-Mercator (roughly 1300–1500) European navigation charts based on compass bearings rather than latitude/longitude grids.

### What they are

A **portolan chart** has no graticule (lat/lon grid). Instead, it has multiple **windroses** scattered across the map — each one a compass rose showing 32 directions. From every windrose, **rhumb lines** radiate outward in all 32 directions. Together, these intersecting rhumb-line networks form the **windrose network** that sailors used to plot courses by compass bearing.

Sailors didn't compute "where am I" in coordinates. They computed "what direction do I head to get from here to there" using the rhumb-line web on the chart.

### Why this matters for Geopuesto

Two distinct angles:

**Whydah / Pirate Mode (Phase 7)**:
The Whydah's navigators in 1717 were transitioning *off* portolan techniques toward latitude-based celestial navigation, but pre-modern Atlantic and Caribbean navigation was still heavily portolan-influenced. A Pirate Mode that actually simulates portolan navigation — rhumb-line plotting, no longitude, windrose-based course setting — would be a *more historically accurate* simulation than just "latitude only, dead reckoning."

**Visual aesthetic for the app overall**:
Portolan charts are visually gorgeous. The radiating rhumb-line networks have a distinctive look. Geopuesto could borrow this aesthetic for:
- The "ring of cities" feature (already exists in v1) — show the rhumb lines as a windrose pattern instead of just one circle.
- The two-point mode — show rhumb lines emanating from both anchor points and find their intersection (which is approximately where the AB orthodrome midpoint sits, plus a portolan-historical layer).
- Generally as a visual mode toggle: "Modern view" (clean great circles) vs "Portolan view" (windrose networks overlaid).

### Where it fits in Geopuesto

- **Phase 7 Pirate Mode**: full portolan-navigation simulator with windrose plotting.
- **Visual toggle anywhere in the app**: switch between "modern" and "portolan" rendering of paths and rings. Mapzimus-content-friendly aesthetic.

### Implementation notes

A windrose at point P is just 32 rhumb lines (loxodromes) at evenly-spaced bearings (0°, 11.25°, 22.5°, ... 348.75°). Rhumb-line math is well-known (closed form, no Vincenty-style iteration needed):

```python
# Given start (lat1, lon1), bearing θ, and distance d
# Constant-bearing path (rhumb line) endpoint:
lat2 = lat1 + (d * cos(θ)) / R
Δψ = log(tan(π/4 + lat2/2) / tan(π/4 + lat1/2))
q = (lat2 - lat1) / Δψ  if Δψ != 0 else cos(lat1)
lon2 = lon1 + (d * sin(θ)) / (R * q)
```

For a windrose network, pre-compute the 32 rhumb-line paths from each chosen anchor point and render them as a stylized overlay.

---

## Smaller concepts worth a sentence each

- **Great ellipse**: the ellipsoidal analog of a great circle. Worth a footnote in the Real-Earth Mode section. Doesn't need its own feature.
- **Marine sandglass**: historical timekeeping (ship's hourglass for measuring watches). Pure Whydah-research material, not Geopuesto material.
- **Compass rose**: already implicit in any bearing/azimuth display. No new work.

---

## Where these slot into the build order

| Concept | Phase | Effort | Notes |
|---|---|---|---|
| Geodesics on an ellipsoid | Phase 6 (Real-Earth Mode) | Medium | Library exists; refactor great-circle calls to swap math when toggled |
| Isoazimuthal curves | Phase 4-5 (Analysis Suite) | Small | New mode, same pattern as "small circle at d" |
| Portolan visual toggle | Phase 3-4 | Small-medium | Pure rendering, no new math |
| Pirate Mode portolan simulator | Phase 7 | Medium-large | Full historical-navigation simulator |
| Great ellipse | Phase 6 footnote | Tiny | Just mention it |

---

## Deep-math territory worth flagging

Genuinely PhD-level / research-frontier areas that connect to what Geopuesto is doing. These are not for the v1 build, not for the user-facing app, and not things to invent novel mathematics in — they're real subfields with active publications. Listed here as: (a) "what's actually deep about the sphere," (b) potential blog-post / Mapparatus-serious-GIS content, (c) reading list for the GIS coursework or the elective course, (d) framing for any future grad-school adjacent thinking.

### Spectral geometry of the sphere

The eigenvalues of the Laplace-Beltrami operator on S² are exactly the numbers l(l+1) for l = 0, 1, 2, ... — the same indices as spherical harmonics. Each eigenvalue has multiplicity 2l+1. This is the mathematical structure *underneath* the spherical harmonics test of the Earth-grid claim in the main doc.

Active research: **Steklov eigenvalues, Robin eigenvalues, isoperimetric inequalities on spheres**. Researchers like Karpukhin, Nadirashvili, Polterovich, Penskoi are working on which spherical regions extremize various eigenvalues. This is the research frontier the Earth-grid spherical-harmonics test lives inside.

Connection to Geopuesto: the spherical harmonics analysis mode (Phase 5 in main doc) is an applied case of spectral geometry. If that mode ever gets formalized into a paper, the framing belongs in spectral-geometry language. The Mark Kac question "can you hear the shape of a drum?" (1966) is the canonical entry point — and on spheres specifically, the answer is "almost yes, with caveats" which is itself an interesting story.

Approachability: closest of the four to undergraduate-accessible. Requires linear algebra and basic PDE. Good entry point for the future GIS elective course or for personal study.

### Sub-Riemannian geometry and rolling-ball problems

Geometry where you can only move in certain allowed directions. On a sphere, ordinary geometry lets you move in any tangent direction; sub-Riemannian geometry constrains motion to a subset (a "distribution"). The resulting geodesics, distances, and curvatures behave wildly differently — geodesics can be tangent to themselves, distances grow non-Euclidean in counterintuitive ways.

Connection to Geopuesto and the polyhedra suite: this is the math of **rolling a polyhedron on the sphere without slipping**. If you took a cube and rolled it around the surface of the Earth, the path traced by a specific vertex is a sub-Riemannian geodesic. Could be a Pirate Mode 2.0 visualization: "watch a cube tumble across the Atlantic."

It's also the math of **path planning under constraints** — cars (which can't move sideways), robots, satellites in restricted orbits. The Reeds-Shepp curves used in autonomous vehicle path planning are sub-Riemannian geodesics.

Approachability: hard. Requires differential geometry and Lie groups. PhD-level entry point.

### The Hopf fibration

The most aesthetically striking object in spherical geometry. S³ (the 3-sphere — sphere in 4D space) fibers over S² (the ordinary sphere) in a non-trivial way, meaning S² is the base of a U(1)-bundle. Every point of S² corresponds to a circle in S³, and these circles link with each other in a pattern that's impossible to draw faithfully but breathtaking when visualized.

The Hopf fibration is *the* canonical bridge between sphere geometry and physics:
- **Dirac monopoles** (hypothetical magnetic charges) live naturally on the Hopf fibration.
- **Qubits** (quantum bits) are represented as points on the Bloch sphere, which is exactly S² presented this way — the global phase of a qubit is the U(1) fiber.
- **Spin systems** in quantum mechanics use this structure.

Connection to Geopuesto: probably none directly — Geopuesto operates on S² (the surface of Earth), and the Hopf fibration is about how S² embeds in higher-dimensional sphere geometry. But it's the kind of "wait, what?" content that explainer videos thrive on. Could be Mapzimus content one day ("the secret 4D structure underneath every sphere").

Approachability: medium-hard. Requires complex numbers, quaternions, basic topology. Very visualizable once you have those — there are gorgeous animations on YouTube and shadertoy.

### CR-geometry on S³

Cauchy-Riemann geometry — the geometry that combines complex-analytic and real-geometric data on odd-dimensional spheres. S³ in ℂ² carries this structure. Active research: the **CR Yamabe problem** (finding canonical metrics) and **embeddability of CR-manifolds**. Charles Fefferman won a Fields Medal partly for work in this area.

Deep concept: the **Heisenberg group** is the "flat model" of CR-geometry the way ℝⁿ is the flat model of Euclidean geometry. The sphere S³ is *curved* CR-geometry. The analog of the antipodal map exists but behaves bizarrely.

Connection to Geopuesto: none for the consumer app. Mentioned here because it's a genuine research frontier where "spherical geometry" still produces publishable mathematics decades after the basics were locked down. The lesson: spherical geometry is not a closed subject.

Approachability: hard. Requires several complex variables, differential geometry. Not entry-level.

### Thurston geometrization and 3-manifolds

After Perelman proved the Poincaré conjecture (2003), the deeper structural result is **Thurston's geometrization conjecture**: every closed 3-manifold decomposes into pieces with one of eight specific geometric structures. Spherical (S³) is one. Hyperbolic is another. Most 3-manifolds turn out to be hyperbolic, which is surprising.

Active research: **moduli spaces of hyperbolic 3-manifolds** — the space of all possible hyperbolic structures on a fixed topological manifold has its own geometry. Mirzakhani's Fields Medal (2014) was for related work on Riemann surface moduli.

Connection to Geopuesto: indirect. The geometrization result tells you that S² geometry (what Geopuesto does) is one of several "natural" geometries, and that sphere-vs-hyperbolic-vs-flat is the deep trichotomy the main doc's Theorema Egregium section pointed at.

Approachability: hard. Requires topology, differential geometry, group theory. PhD-level.

### Recommended order of personal exploration

If picking one for personal reading or future study:

1. **Spectral geometry** first. Directly applicable, undergrad-accessible, leads naturally into the Earth-grid spherical-harmonics test. Could form the basis of a Mapparatus serious-GIS blog post.
2. **Hopf fibration** second. Pure aesthetic and conceptual payoff, plus excellent existing visualization material.
3. **Sub-Riemannian** third, if pursuing the rolling-polyhedra-on-sphere idea for Geopuesto Phase 7+ content.
4. CR-geometry and 3-manifold geometrization are for "if I ever do a math PhD" territory.

### Honest framing

Inventing genuinely new spherical geometry is a multi-year research project requiring deep familiarity with these subfields and adjacent ones (algebraic geometry, geometric topology, differential operator theory, etc.). What's achievable on a shorter timescale:

- **Novel combinations of existing concepts**, branded distinctively (e.g., the "Geopuesto coordinate system" naming for the A–B-anchored frame from the main doc).
- **Novel visualizations of existing concepts** — where the math is centuries old but the interactive web visualization is new (e.g., interactive Borsuk-Ulam pair finder, interactive Hopf fibration).
- **Novel applications of existing concepts to new datasets** — e.g., the spherical-harmonics test of the Earth-grid claim using EGM2008 or USGS data.

Any of these can be original, publishable, and impressive on a GIS portfolio without requiring you to invent new mathematics. The third path (novel application) is the one closest to the GIS job-search target.

---

## Open question

The isoazimuthal/loxodrome/rhumb-line family is becoming a meaningful chunk of the app's surface area. Worth considering whether the architecture in the main doc should have a top-level **"Curves Suite"** alongside the Polyhedra Suite and Analysis Suite — a single mode for all the "from a point, draw this kind of line/curve" features:

- Great circle (orthodrome) through point and antipode — already exists
- Great circle between two points
- Small circle at distance d (ring of cities) — already exists
- Isoazimuthal at bearing θ (new)
- Loxodrome/rhumb line at bearing θ (new)
- Portolan windrose at point (new)

Same UI pattern across all of these: pick a point, pick a curve type, see it drawn, get cities along it with full v1 enrichment.

Worth raising next session.
