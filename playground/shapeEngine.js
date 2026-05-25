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
      computed = computeEdges(shape.vertices);
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
