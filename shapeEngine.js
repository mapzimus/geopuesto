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

  function getEdgesInternal(shapeId, shape) {
    if (edgeCache[shapeId]) return edgeCache[shapeId];
    const explicit = shape.edges;
    const computed = explicit ? explicit : computeEdges(shape.vertices);
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

  /** Get the canonical (unrotated) vertex list for a shape. */
  function getVertices(shapeId) {
    return requireShape(shapeId).vertices;
  }

  /** Get the edge list for a shape (cached, auto-computed if not explicit). */
  function getEdges(shapeId) {
    const shape = requireShape(shapeId);
    return getEdgesInternal(shapeId, shape);
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
   * @returns {{
   *   vertices: {lat:number, lon:number}[],
   *   edges: number[][],
   *   edgePolylines: number[][][],
   *   anchor: {lat:number, lon:number},
   *   shape: {id, technicalLabel, userLabel, description, vertexCount}
   * }}
   */
  function configure(shapeId, anchor, spinAngleRad) {
    const shape = requireShape(shapeId);
    const spin = spinAngleRad || 0;

    const target = G.latLonToXYZ(anchor.lat, anchor.lon);
    const v0 = shape.vertices[0];
    const alignM = R.alignMatrix(v0, target);
    const spinM = R.axisAngleMatrix(target, spin);
    const fullM = R.compose(spinM, alignM);

    const rotated = shape.vertices.map(function (v) { return R.apply(fullM, v); });
    const vertexLatLons = rotated.map(function (v) { return G.xyzToLatLon(v); });

    const edges = getEdgesInternal(shapeId, shape);
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
