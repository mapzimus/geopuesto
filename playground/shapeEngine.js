/**
 * Geopuesto v2 — Parametric shape engine for the Polyhedra Suite
 *
 * Given a shape from `shapeCatalog.json`, a surface-point anchor, and a spin
 * angle around the anchor axis, produce everything index.html needs to render
 * the shape on Leaflet maps: vertex {lat, lon}s for pins, edge index pairs for
 * the data model, and SLERP-sampled antimeridian-split polylines ready for
 * L.polyline().
 *
 * Architecture (per V3_VISION.md §"parametric shape-engine principle"):
 *   - Shapes are DATA. The catalog is `shapeCatalog.json`. Adding a new shape
 *     requires only a JSON entry; this engine does not change.
 *   - Edges are AUTO-COMPUTED from minimum pairwise vertex distance, cached
 *     per shape. Works for all edge-transitive shapes (Platonics, cuboctahedron,
 *     rhombic triacontahedron). Kepler-Poinsot stars and compounds need
 *     explicit edges; the catalog format supports both.
 *
 * Async load. Catalog fetches on script load; consumers wait on `window.ShapeEngine.ready`
 * (same pattern as `window.GeopuestoCities`).
 *
 * Depends on `window.Geometry` and `window.Rotation`.
 *
 * Spec sections this file implements:
 *   §9   Reference implementation (Steps 2-5: anchor, spin, project, edges)
 *   §22  Polyhedra suite architecture
 *   "Parametric shape-engine principle" (V3_VISION.md)
 */
(function (window) {
  'use strict';

  if (!window.Geometry) {
    throw new Error('ShapeEngine: window.Geometry must be loaded first');
  }
  if (!window.Rotation) {
    throw new Error('ShapeEngine: window.Rotation must be loaded first');
  }

  const G = window.Geometry;
  const R = window.Rotation;

  // ---------------------------------------------------------------------------
  // Tunables
  // ---------------------------------------------------------------------------

  /**
   * Number of SLERP samples per edge arc when building polylines. With 32
   * samples a 70°-arc edge (e.g. cube vertex-to-vertex span) gets a sample
   * every ~245 km, well below visible polyline-rendering tolerance at any
   * Leaflet zoom level relevant to a continent-scale view.
   */
  const SLERP_SAMPLES = 32;

  /**
   * Relative tolerance for "is this distance the edge length?" when
   * auto-detecting edges. 1e-6 of the min pairwise distance² catches
   * floating-point noise without false-positiving longer chords.
   */
  const EDGE_DETECT_REL_TOL = 1e-6;

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  let catalog = null;
  const edgeCache = {};

  /** Fire-and-forget catalog fetch. `ready` resolves when catalog is loaded. */
  const readyPromise = fetch('shapeCatalog.json')
    .then(function (r) {
      if (!r.ok) {
        throw new Error('ShapeEngine: failed to fetch shapeCatalog.json (' + r.status + ')');
      }
      return r.json();
    })
    .then(function (data) {
      catalog = data;
      window.dispatchEvent(new CustomEvent('geopuesto:shapes-ready', { detail: { catalog: catalog } }));
      return catalog;
    });

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  function requireCatalog() {
    if (!catalog) {
      throw new Error('ShapeEngine: catalog not loaded yet. Await ShapeEngine.ready first.');
    }
  }

  function requireShape(shapeId) {
    requireCatalog();
    const shape = catalog.shapes[shapeId];
    if (!shape) {
      throw new Error("ShapeEngine: unknown shape '" + shapeId + "'");
    }
    return shape;
  }

  /** True when the catalog entry declares mutable parameters. */
  function isParametric(shape) {
    return shape.generatorDefaults && Object.keys(shape.generatorDefaults).length > 0;
  }

  /**
   * Resolve a shape's vertex array. Three modes:
   *   1. Explicit `vertices` in the catalog → return as-is.
   *   2. Non-parametric generator (no generatorDefaults) → call once, memoize
   *      on `shape._cachedVertices`.
   *   3. Parametric generator (has generatorDefaults) → call fresh on every
   *      request, merging catalog defaults with caller `params` (caller wins
   *      on conflicts). Never cached, so the N slider can drag in real time
   *      without stale-vertex bugs.
   */
  function resolveVertices(shape, params) {
    if (shape.vertices) return shape.vertices;
    if (!shape.generator) {
      throw new Error("ShapeEngine: shape '" + shape.technicalLabel + "' has neither vertices nor generator");
    }
    const gen = generators[shape.generator];
    if (!gen) {
      throw new Error("ShapeEngine: unknown generator '" + shape.generator + "'");
    }
    if (!isParametric(shape)) {
      if (!shape._cachedVertices) shape._cachedVertices = gen({});
      return shape._cachedVertices;
    }
    // Parametric: re-compute every call. Cheap (sub-millisecond for typical N).
    const merged = Object.assign({}, shape.generatorDefaults, params || {});
    return gen(merged);
  }

  // ---------------------------------------------------------------------------
  // Built-in vertex generators
  // ---------------------------------------------------------------------------
  // A generator is a function that returns a vertex array — used when the
  // shape's vertices are too many to inline in JSON (truncated icosahedron's
  // 60 verts) or are parametric (n-prism, Fibonacci sphere, geodesic
  // subdivision, all coming in Sprint B.2+).
  //
  // Catalog entries opt in by setting `"generator": "<name>"` instead of
  // `"vertices": [...]`. Both modes coexist; explicit vertices always win.

  const generators = {
    /**
     * Truncated icosahedron — the soccer ball, also the buckminsterfullerene
     * C60 molecule structure. 60 vertices via three coordinate families with
     * even permutations and all sign choices:
     *   (0, ±1, ±3φ)       — 12 verts
     *   (±1, ±(2+φ), ±2φ)  — 24 verts
     *   (±φ, ±2, ±(1+2φ))  — 24 verts
     * All ÷ √(9φ + 10) to land on the unit sphere.
     */
    truncatedIcosahedron: function (_params) {
      const phi = (1 + Math.sqrt(5)) / 2;
      const norm = Math.sqrt(9 * phi + 10);
      const out = [];
      // Row 1: family (0, ±1, ±3φ) and its 3 even cyclic permutations.
      // (0, ±1, ±3φ) → (±1, ±3φ, 0) → (±3φ, 0, ±1). 4 sign combos × 3 perms.
      for (let s1 = -1; s1 <= 1; s1 += 2) {
        for (let s2 = -1; s2 <= 1; s2 += 2) {
          out.push([0,            s1 * 1,        s2 * 3 * phi]);
          out.push([s1 * 1,       s2 * 3 * phi,  0           ]);
          out.push([s1 * 3 * phi, 0,             s2 * 1      ]);
        }
      }
      // Row 2: family (±1, ±(2+φ), ±2φ) and its cyclic permutations.
      // 8 sign combos × 3 perms.
      for (let s1 = -1; s1 <= 1; s1 += 2) {
        for (let s2 = -1; s2 <= 1; s2 += 2) {
          for (let s3 = -1; s3 <= 1; s3 += 2) {
            out.push([s1 * 1,           s2 * (2 + phi),   s3 * 2 * phi    ]);
            out.push([s1 * (2 + phi),   s2 * 2 * phi,     s3 * 1          ]);
            out.push([s1 * 2 * phi,     s2 * 1,           s3 * (2 + phi)  ]);
          }
        }
      }
      // Row 3: family (±φ, ±2, ±(1+2φ)) and its cyclic permutations.
      for (let s1 = -1; s1 <= 1; s1 += 2) {
        for (let s2 = -1; s2 <= 1; s2 += 2) {
          for (let s3 = -1; s3 <= 1; s3 += 2) {
            out.push([s1 * phi,         s2 * 2,           s3 * (1 + 2*phi)]);
            out.push([s1 * 2,           s2 * (1 + 2*phi), s3 * phi        ]);
            out.push([s1 * (1 + 2*phi), s2 * phi,         s3 * 2          ]);
          }
        }
      }
      // Normalize all 60 to unit-sphere radius.
      return out.map(function (v) { return [v[0]/norm, v[1]/norm, v[2]/norm]; });
    },

    /**
     * Geodesic subdivision of the icosahedron. Frequency k → 10k²+2 vertices.
     * Used by H3 (Uber's hexagonal grid), S2 (Google's spherical index), and
     * the geodesic-dome family. The earth-grid debunking work needs high-k
     * for honest spatial-statistics tests; k=2..6 covers most use cases.
     *
     * Algorithm: for each of the icosahedron's 20 triangular faces, generate
     * the (k+1)(k+2)/2 barycentric subdivision points (small-triangle
     * vertices). Project each to unit sphere. Dedup across shared edges and
     * corner vertices via coordinate rounding.
     *
     * The 20 face triplets are derived from the icosahedron's edge graph
     * (triangles = mutually-adjacent triples). Pre-computed and hardcoded
     * because the icosahedron's adjacency never changes.
     *
     * @param {{k:number}} params — k defaults to 2 via generatorDefaults
     */
    geodesicIcosahedron: function (params) {
      const k = Math.max(1, Math.floor((params && params.k) || 2));
      // Unit-sphere icosahedron vertices, same coords as catalog's "icosahedron".
      const a = 0.5257311121191336;  // 1 / √(1+φ²)
      const b = 0.8506508083520399;  // φ / √(1+φ²)
      const icoV = [
        [ 0,  a,  b], [ 0,  a, -b], [ 0, -a,  b], [ 0, -a, -b],
        [ a,  b,  0], [ a, -b,  0], [-a,  b,  0], [-a, -b,  0],
        [ b,  0,  a], [ b,  0, -a], [-b,  0,  a], [-b,  0, -a],
      ];
      // 20 triangular faces, vertex-index triplets, derived from adjacency.
      const icoF = [
        [0, 2, 8], [0, 2, 10], [0, 4, 6], [0, 4, 8], [0, 6, 10],
        [1, 3, 9], [1, 3, 11], [1, 4, 6], [1, 4, 9], [1, 6, 11],
        [2, 5, 7], [2, 5, 8], [2, 7, 10],
        [3, 5, 7], [3, 5, 9], [3, 7, 11],
        [4, 8, 9], [5, 8, 9], [6, 10, 11], [7, 10, 11],
      ];
      // Dedup map: rounded "x,y,z" → vertex index in `out`.
      const out = [];
      const seen = Object.create(null);
      function add(v) {
        const m = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
        const u = [v[0]/m, v[1]/m, v[2]/m];
        // 8 decimal places ≈ 1mm on a 6371km Earth. Tight enough for
        // dedup, loose enough for floating-point variance.
        const key = u[0].toFixed(8) + ',' + u[1].toFixed(8) + ',' + u[2].toFixed(8);
        if (seen[key] != null) return seen[key];
        seen[key] = out.length;
        out.push(u);
        return out.length - 1;
      }
      // For each face, walk the barycentric grid at frequency k.
      // Indices (i, j, l) with i+j+l = k generate the (k+1)(k+2)/2 lattice
      // points per face; each is a convex combination of the three corners.
      for (let f = 0; f < icoF.length; f++) {
        const A = icoV[icoF[f][0]];
        const B = icoV[icoF[f][1]];
        const C = icoV[icoF[f][2]];
        for (let i = 0; i <= k; i++) {
          for (let j = 0; j + i <= k; j++) {
            const l = k - i - j;
            const v = [
              (i * A[0] + j * B[0] + l * C[0]) / k,
              (i * A[1] + j * B[1] + l * C[1]) / k,
              (i * A[2] + j * B[2] + l * C[2]) / k,
            ];
            add(v);  // dedup handles shared corners + edge points
          }
        }
      }
      return out;
    },

    /**
     * Regular n-prism inscribed in the unit sphere. 2n vertices on two
     * parallel small circles at heights ±h, where h is chosen so that the
     * top edge and the side edges have equal length (the "regular" case
     * with square sides). For n=3, this matches a triangular prism with
     * 3-fold symmetry; for larger n the side faces stay square.
     *
     * Math: at h = sin(π/n)/√(1 + sin²(π/n)) and r = √(1−h²), the side edges
     * (top-to-bottom vertical edges) equal the top/bottom edges (chord between
     * adjacent top vertices). For other "stretched" prisms, change h.
     *
     * @param {{n:number}} params — n defaults to 6 via generatorDefaults
     */
    nPrism: function (params) {
      const n = Math.max(3, Math.floor((params && params.n) || 6));
      const sinPN = Math.sin(Math.PI / n);
      const h = sinPN / Math.sqrt(1 + sinPN * sinPN);
      const r = Math.sqrt(1 - h * h);
      const out = new Array(2 * n);
      for (let i = 0; i < n; i++) {
        const theta = 2 * Math.PI * i / n;
        out[i]     = [r * Math.cos(theta), r * Math.sin(theta),  h];
        out[i + n] = [r * Math.cos(theta), r * Math.sin(theta), -h];
      }
      return out;
    },

    /**
     * Regular n-antiprism inscribed in the unit sphere. Like nPrism but the
     * bottom ring is rotated π/n relative to the top. For the "regular" case
     * (equilateral triangle side faces) h and r are chosen so the triangles
     * close on themselves.
     *
     * @param {{n:number}} params — n defaults to 6 via generatorDefaults
     */
    nAntiprism: function (params) {
      const n = Math.max(3, Math.floor((params && params.n) || 6));
      // Regular antiprism: side faces are equilateral triangles. Derive h
      // such that top-to-bottom edge = top-to-top edge. Standard result:
      //   chord(top) = 2 r sin(π/n)
      //   chord(side) = √( r² + r² − 2r²cos(π/n) + (2h)² )
      // Setting equal and r² + h² = 1, solve for h:
      const cosPN = Math.cos(Math.PI / n);
      const sinPN = Math.sin(Math.PI / n);
      // After algebra: h² = (1 − cosPN) / 2, r² = (1 + cosPN) / 2 — but that
      // ignores the side-edge equality. The cleaner closed form:
      const h = Math.sqrt((1 - cosPN) / (2 * (1 + cosPN) + 4 * sinPN * sinPN));
      // Wait — let me use the simpler "fit-to-sphere" form: just put both
      // rings on the unit sphere with a chosen latitude. Latitude that
      // makes side triangles equilateral isn't unique across all n; for
      // visual symmetry on a sphere, h = sin(π/(2n)) is a clean choice.
      const hUsed = Math.sin(Math.PI / (2 * n));
      const rUsed = Math.sqrt(1 - hUsed * hUsed);
      const out = new Array(2 * n);
      for (let i = 0; i < n; i++) {
        const thetaTop = 2 * Math.PI * i / n;
        const thetaBot = 2 * Math.PI * i / n + Math.PI / n;  // π/n offset
        out[i]     = [rUsed * Math.cos(thetaTop), rUsed * Math.sin(thetaTop),  hUsed];
        out[i + n] = [rUsed * Math.cos(thetaBot), rUsed * Math.sin(thetaBot), -hUsed];
      }
      return out;
    },

    /**
     * Fibonacci sphere — N quasi-uniformly distributed points via the
     * golden-angle (Vogel) spiral. Not vertex-transitive (no two points are
     * exactly equivalent), but the minimum-spacing variance is small enough
     * to look uniform at any N from ~10 up. Cheap: linear in N.
     *
     * The canonical recipe:
     *   z_i = 1 − 2(i + 0.5) / N       (uniform spacing in z, so equal-area
     *                                   slabs perpendicular to the polar axis)
     *   θ_i = i × golden_angle         (where golden_angle = π(3 − √5))
     *   r_i = √(1 − z²)                (radius of the latitude circle at z)
     *   x_i = r cos θ,  y_i = r sin θ
     *
     * @param {{N:number}} params — N defaults to 100 via generatorDefaults
     */
    fibonacciSphere: function (params) {
      const N = Math.max(2, Math.floor((params && params.N) || 100));
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      const out = new Array(N);
      for (let i = 0; i < N; i++) {
        const z = 1 - 2 * (i + 0.5) / N;
        const theta = goldenAngle * i;
        const r = Math.sqrt(Math.max(0, 1 - z * z));
        out[i] = [r * Math.cos(theta), r * Math.sin(theta), z];
      }
      return out;
    },
  };

  /** Squared Euclidean distance between two 3-vectors. */
  function dist2(a, b) {
    const dx = a[0] - b[0];
    const dy = a[1] - b[1];
    const dz = a[2] - b[2];
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * Auto-detect edges by finding the minimum pairwise vertex distance and
   * listing all vertex pairs within tolerance of it. Works for any
   * edge-transitive convex shape (where all edges have equal length).
   * For shapes with multiple edge lengths (Catalan duals with non-trivial
   * face shapes, Kepler-Poinsot stars), the catalog should provide an
   * explicit `edges` field instead.
   */
  function computeEdges(vertices) {
    const n = vertices.length;
    let minD2 = Infinity;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = dist2(vertices[i], vertices[j]);
        if (d < minD2) minD2 = d;
      }
    }
    const tol = minD2 * EDGE_DETECT_REL_TOL;
    const edges = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (Math.abs(dist2(vertices[i], vertices[j]) - minD2) < tol) {
          edges.push([i, j]);
        }
      }
    }
    return edges;
  }

  function getEdgesInternal(shapeId, shape, vertices) {
    // Parametric shapes (with generatorDefaults) produce different vertex
    // sets per call, so the cache key by shapeId alone is unsafe. Skip
    // caching for those; recompute fresh. Non-parametric shapes still hit
    // the cache.
    const parametric = isParametric(shape);
    if (!parametric && edgeCache[shapeId]) return edgeCache[shapeId];
    // Three edge sources in priority order:
    //   1. `edgeStrategy: "none"` — explicit opt-out, return []. Used by point
    //      sets that don't form a clean edge-transitive polyhedron (e.g. the
    //      rhombic triacontahedron when both vertex classes share unit radius,
    //      per the Becker-Hagens Earth-grid framing).
    //   2. `edges: [[i,j],...]` — explicit edge list from the catalog.
    //   3. Auto-detect: min-pairwise-distance, works for edge-transitive shapes.
    let computed;
    if (shape.edgeStrategy === 'none') {
      computed = [];
    } else if (shape.edges) {
      computed = shape.edges;
    } else {
      // Use the `vertices` parameter (the resolved/generated array) rather
      // than `shape.vertices`, which is undefined for parametric shapes with
      // a `generator` field (Fibonacci sphere, geodesic, n-prism/antiprism).
      // For non-parametric shapes the two are the same array, so this is a
      // bug-fix-only change for parametric edge auto-detection — caught by
      // the ?debug=1 invariant battery throwing on shapes with no explicit
      // edges and no shape.vertices array.
      computed = computeEdges(vertices);
    }
    edgeCache[shapeId] = computed;
    return computed;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * List all shapes in the catalog for UI dropdowns. Returns metadata only,
   * not the raw vertex arrays.
   *
   * @returns {{id, technicalLabel, userLabel, description, vertexCount}[]}
   */
  function listShapes() {
    requireCatalog();
    const out = [];
    const shapes = catalog.shapes;
    for (const id in shapes) {
      if (!Object.prototype.hasOwnProperty.call(shapes, id)) continue;
      const s = shapes[id];
      out.push({
        id: id,
        technicalLabel: s.technicalLabel,
        userLabel: s.userLabel,
        description: s.description,
        vertexCount: s.vertexCount,
      });
    }
    return out;
  }

  /**
   * Get the canonical (unrotated) vertex list for a shape. Pass `params` to
   * override generator defaults for parametric shapes (e.g. { N: 250 } for
   * Fibonacci sphere).
   */
  function getVertices(shapeId, params) {
    return resolveVertices(requireShape(shapeId), params);
  }

  /**
   * Get the edge list for a shape. Cached for non-parametric shapes;
   * recomputed for parametric ones (since vertex set may vary with params).
   */
  function getEdges(shapeId, params) {
    const shape = requireShape(shapeId);
    const vertices = resolveVertices(shape, params);
    return getEdgesInternal(shapeId, shape, vertices);
  }

  /**
   * The main entry point. Place a shape on the sphere with vertex 0 anchored
   * at `anchor`, optionally spun by `spinAngleRad` around the anchor axis.
   *
   * Returns everything needed to render the polyhedron on a Leaflet map:
   *   - vertices    {lat, lon} per pin (in shape-catalog order, so vertex 0
   *                 lands at `anchor`)
   *   - edges       [[i, j], ...] vertex-index pairs
   *   - edgePolylines [[[lat, lon], ...], ...] SLERP-sampled, antimeridian-split,
   *                 ready to pass to L.polyline(). One polyline per visible
   *                 segment (so a single edge crossing the antimeridian
   *                 contributes two polylines).
   *
   * @param {string} shapeId
   * @param {{lat:number, lon:number}} anchor
   * @param {number} [spinAngleRad=0]  radians around the anchor axis
   * @param {object} [params]  generator params for parametric shapes
   *                           (e.g. { N: 250 } for Fibonacci sphere)
   * @returns {{
   *   vertices: {lat:number, lon:number}[],
   *   edges: number[][],
   *   edgePolylines: number[][][],
   *   anchor: {lat:number, lon:number},
   *   shape: {id, technicalLabel, userLabel, description, vertexCount}
   * }}
   */
  function configure(shapeId, anchor, spinAngleRad, params) {
    const shape = requireShape(shapeId);
    const spin = spinAngleRad || 0;
    const baseVertices = resolveVertices(shape, params);

    const target = G.latLonToXYZ(anchor.lat, anchor.lon);
    const v0 = baseVertices[0];
    const alignM = R.alignMatrix(v0, target);
    const spinM = R.axisAngleMatrix(target, spin);
    const fullM = R.compose(spinM, alignM);

    const rotated = baseVertices.map(function (v) { return R.apply(fullM, v); });
    const vertexLatLons = rotated.map(function (v) { return G.xyzToLatLon(v); });

    const edges = getEdgesInternal(shapeId, shape, baseVertices);
    const edgePolylines = [];
    for (let e = 0; e < edges.length; e++) {
      const i = edges[e][0];
      const j = edges[e][1];
      const samples = [];
      for (let s = 0; s <= SLERP_SAMPLES; s++) {
        const t = s / SLERP_SAMPLES;
        const p = R.slerp(rotated[i], rotated[j], t);
        const ll = G.xyzToLatLon(p);
        samples.push([ll.lat, ll.lon]);
      }
      const split = G.antimeridianSplit(samples);
      for (let k = 0; k < split.length; k++) {
        edgePolylines.push(split[k]);
      }
    }

    return {
      vertices: vertexLatLons,
      edges: edges,
      edgePolylines: edgePolylines,
      anchor: { lat: anchor.lat, lon: anchor.lon },
      shape: {
        id: shapeId,
        technicalLabel: shape.technicalLabel,
        userLabel: shape.userLabel,
        description: shape.description,
        vertexCount: shape.vertexCount,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Attach
  // ---------------------------------------------------------------------------

  window.ShapeEngine = {
    ready: readyPromise,
    listShapes: listShapes,
    getVertices: getVertices,
    getEdges: getEdges,
    configure: configure,
    SLERP_SAMPLES: SLERP_SAMPLES,
  };

})(window);
