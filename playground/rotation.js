/**
 * Geopuesto v2 — 3D rotation primitives
 *
 * Rodrigues rotation matrices for anchoring polyhedra on the sphere, plus
 * spherical linear interpolation (SLERP) for drawing great-circle edge arcs
 * between vertex pairs.
 *
 * Matrices are stored as flat 9-element row-major arrays so they compose
 * cheaply and can be applied to many vertices without rebuilding. The polyhedra
 * suite anchors all vertices of a shape with a single matrix; only the
 * anchor + spin change between frames, not the per-vertex cost.
 *
 * Depends on `window.Geometry` for vector primitives.
 *
 * Spec sections this file implements:
 *   §9   Reference implementation (vertex rotation pipeline)
 *   §22  Polyhedra suite anchor controls
 *   §11.3 SLERP for great-circle edge sampling
 */
(function (window) {
  'use strict';

  if (!window.Geometry) {
    throw new Error('Rotation: window.Geometry must be loaded first');
  }

  const G = window.Geometry;

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** True when a 3-vector is numerically indistinguishable from zero. */
  function nearZero(v) {
    return G.norm(v) < 1e-9;
  }

  /**
   * Build a unit vector perpendicular to v. Used when v0 = -target and we
   * need ANY perpendicular axis to flip 180° around.
   */
  function anyPerpendicular(v) {
    // Pick the world axis least aligned with v, then cross it with v.
    const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
    let ref;
    if (ax <= ay && ax <= az) ref = [1, 0, 0];
    else if (ay <= az) ref = [0, 1, 0];
    else ref = [0, 0, 1];
    return G.normalize(G.cross(v, ref));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** The 3x3 identity matrix as a 9-element row-major array. */
  const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  /**
   * Build a rotation matrix R such that R·axis = axis and R rotates the plane
   * perpendicular to axis by angleRad (right-hand rule around axis).
   *
   * Rodrigues:
   *   R = I + sin(θ)·[k]× + (1 − cos(θ))·[k]×²
   * where [k]× is the skew-symmetric cross-product matrix of unit axis k.
   *
   * @param {number[]} axis  unit 3-vector
   * @param {number} angleRad
   * @returns {number[]} 9-element row-major matrix
   */
  function axisAngleMatrix(axis, angleRad) {
    const c = Math.cos(angleRad);
    const s = Math.sin(angleRad);
    const t = 1 - c;
    const x = axis[0], y = axis[1], z = axis[2];
    return [
      t * x * x + c,       t * x * y - s * z,   t * x * z + s * y,
      t * x * y + s * z,   t * y * y + c,       t * y * z - s * x,
      t * x * z - s * y,   t * y * z + s * x,   t * z * z + c,
    ];
  }

  /**
   * Build a rotation matrix that maps unit vector v0 onto unit vector target.
   *
   * Edge cases:
   *   - v0 ≈ target  → identity matrix (no rotation needed)
   *   - v0 ≈ -target → 180° flip around an arbitrary perpendicular axis
   *
   * @param {number[]} v0      unit 3-vector
   * @param {number[]} target  unit 3-vector
   * @returns {number[]} 9-element row-major matrix
   */
  function alignMatrix(v0, target) {
    const cosTheta = G.clamp(G.dot(v0, target), -1, 1);
    if (cosTheta > 1 - 1e-12) {
      return IDENTITY.slice();
    }
    if (cosTheta < -1 + 1e-12) {
      const axis = anyPerpendicular(v0);
      return axisAngleMatrix(axis, Math.PI);
    }
    const cp = G.cross(v0, target);
    const axis = G.normalize(cp);
    const angle = Math.acos(cosTheta);
    return axisAngleMatrix(axis, angle);
  }

  /**
   * Apply a 3x3 row-major matrix to a 3-vector. Returns a new vector.
   *
   * @param {number[]} M  9-element row-major matrix
   * @param {number[]} v  3-vector
   * @returns {number[]} new 3-vector
   */
  function apply(M, v) {
    return [
      M[0] * v[0] + M[1] * v[1] + M[2] * v[2],
      M[3] * v[0] + M[4] * v[1] + M[5] * v[2],
      M[6] * v[0] + M[7] * v[1] + M[8] * v[2],
    ];
  }

  /**
   * Compose two rotation matrices: result = A · B. Applying `result` to a
   * vector is the same as applying B first, then A.
   *
   * @param {number[]} A  outer (applied second)
   * @param {number[]} B  inner (applied first)
   * @returns {number[]} 9-element row-major matrix
   */
  function compose(A, B) {
    const out = new Array(9);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let s = 0;
        for (let k = 0; k < 3; k++) {
          s += A[i * 3 + k] * B[k * 3 + j];
        }
        out[i * 3 + j] = s;
      }
    }
    return out;
  }

  /**
   * Spherical linear interpolation between unit vectors A and B.
   * At t=0 returns A; at t=1 returns B; for t in (0, 1) returns a unit vector
   * on the great circle from A to B, parameterized by arc length.
   *
   * Falls back to linear interpolation + renormalize when A and B are very
   * close (sin(Ω) underflow), which is geometrically correct in the limit.
   *
   * @param {number[]} A  unit 3-vector
   * @param {number[]} B  unit 3-vector
   * @param {number} t    parameter in [0, 1]
   * @returns {number[]} unit 3-vector on the great circle from A to B
   */
  function slerp(A, B, t) {
    const cosOmega = G.clamp(G.dot(A, B), -1, 1);
    const omega = Math.acos(cosOmega);
    const sinOmega = Math.sin(omega);
    if (sinOmega < 1e-9) {
      const lerped = [
        A[0] + t * (B[0] - A[0]),
        A[1] + t * (B[1] - A[1]),
        A[2] + t * (B[2] - A[2]),
      ];
      return G.normalize(lerped);
    }
    const wA = Math.sin((1 - t) * omega) / sinOmega;
    const wB = Math.sin(t * omega) / sinOmega;
    return [
      wA * A[0] + wB * B[0],
      wA * A[1] + wB * B[1],
      wA * A[2] + wB * B[2],
    ];
  }

  /**
   * Generate a uniformly random rotation on SO(3) via the Shoemake 1992
   * quaternion method. Three independent uniform [0,1] inputs produce a
   * unit quaternion whose distribution is the Haar measure on SO(3) —
   * the genuinely uniform "pick a random orientation" distribution.
   *
   * Why not uniform Euler angles? They oversample orientations near gimbal-
   * lock poles. Why not random axis + random angle? Same problem unless you
   * use the right marginal distributions. Shoemake's is the closed-form
   * answer that gets uniformity right with three uniforms and minimal trig.
   *
   * Used by the Monte Carlo null-hypothesis test in the Analysis Suite:
   * thousands of random rotations of a polyhedron to estimate the null
   * distribution of vertex-vs-dataset proximity statistics.
   *
   * @returns {number[]} 9-element row-major rotation matrix
   */
  function randomMatrix() {
    const u1 = Math.random();
    const u2 = Math.random();
    const u3 = Math.random();
    const sqrt1mU1 = Math.sqrt(1 - u1);
    const sqrtU1 = Math.sqrt(u1);
    // Shoemake quaternion (x, y, z, w):
    const x = sqrt1mU1 * Math.sin(2 * Math.PI * u2);
    const y = sqrt1mU1 * Math.cos(2 * Math.PI * u2);
    const z = sqrtU1   * Math.sin(2 * Math.PI * u3);
    const w = sqrtU1   * Math.cos(2 * Math.PI * u3);
    // Convert unit quaternion → 3×3 row-major rotation matrix:
    const xx = x*x, yy = y*y, zz = z*z;
    const xy = x*y, xz = x*z, yz = y*z;
    const xw = x*w, yw = y*w, zw = z*w;
    return [
      1 - 2*(yy + zz),    2*(xy - zw),        2*(xz + yw),
      2*(xy + zw),        1 - 2*(xx + zz),    2*(yz - xw),
      2*(xz - yw),        2*(yz + xw),        1 - 2*(xx + yy),
    ];
  }

  // ---------------------------------------------------------------------------
  // Attach
  // ---------------------------------------------------------------------------

  window.Rotation = {
    IDENTITY: IDENTITY,
    axisAngleMatrix: axisAngleMatrix,
    alignMatrix: alignMatrix,
    apply: apply,
    compose: compose,
    slerp: slerp,
    randomMatrix: randomMatrix,
  };

})(window);
