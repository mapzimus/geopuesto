import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const EARTH_R_KM = 6371;

const PRESETS = {
  antipodal: {
    name: "Antipodal",
    a: { lat: 42.52, lon: -70.9, label: "Salem, MA" },
    b: { lat: -42.52, lon: 109.1, label: "Antipode · Indian Ocean" },
    note: "The classic case. Every point on the ring is exactly 90° from both — about 10,007 km away from each.",
  },
  salemTokyo: {
    name: "Salem ↔ Tokyo",
    a: { lat: 42.52, lon: -70.9, label: "Salem, MA" },
    b: { lat: 35.68, lon: 139.69, label: "Tokyo" },
    note: "Non-antipodal. The ring is closer in — every point on it is ~5,400 km from each city.",
  },
  salemCapeTown: {
    name: "Salem ↔ Cape Town",
    a: { lat: 42.52, lon: -70.9, label: "Salem, MA" },
    b: { lat: -33.92, lon: 18.42, label: "Cape Town" },
    note: "Crossing the Atlantic. The equidistant ring threads through Europe, West Africa, the Americas, and the Pacific.",
  },
  bostonNYC: {
    name: "Boston ↔ NYC",
    a: { lat: 42.36, lon: -71.06, label: "Boston" },
    b: { lat: 40.71, lon: -74.01, label: "NYC" },
    note: "Two cities close together produce a ring that wraps the planet almost like a meridian — equidistant from both means roughly ~150 km from either.",
  },
};

function latLonToVec3(lat, lon, r = 1) {
  const phi = (lat * Math.PI) / 180;
  const lam = (lon * Math.PI) / 180;
  return new THREE.Vector3(
    r * Math.cos(phi) * Math.cos(lam),
    r * Math.sin(phi),
    -r * Math.cos(phi) * Math.sin(lam)
  );
}

function makeGreatCircle(normal, segments = 360, r = 1.004) {
  const n = normal.clone().normalize();
  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(n.dot(up)) > 0.98) up = new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(n, up).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const p = u
      .clone()
      .multiplyScalar(Math.cos(t))
      .add(v.clone().multiplyScalar(Math.sin(t)));
    p.multiplyScalar(r);
    pts.push(p);
  }
  return pts;
}

function makeArc(a, b, segments = 128, r = 1.008) {
  const A = a.clone().normalize();
  const B = b.clone().normalize();
  const dot = Math.max(-1, Math.min(1, A.dot(B)));
  const omega = Math.acos(dot);
  if (omega < 1e-5) return [A.clone().multiplyScalar(r), B.clone().multiplyScalar(r)];
  const s = Math.sin(omega);
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const w1 = Math.sin((1 - t) * omega) / s;
    const w2 = Math.sin(t * omega) / s;
    const p = A.clone().multiplyScalar(w1).add(B.clone().multiplyScalar(w2));
    p.multiplyScalar(r);
    pts.push(p);
  }
  return pts;
}

function angularKm(a, b) {
  const A = a.clone().normalize();
  const B = b.clone().normalize();
  return Math.acos(Math.max(-1, Math.min(1, A.dot(B)))) * EARTH_R_KM;
}

export default function App() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const [presetKey, setPresetKey] = useState("antipodal");

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth;
    const h = mount.clientHeight;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    camera.position.set(2.4, 1.4, 2.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    // Dark Earth core (semi-transparent so the interior chord is visible)
    const coreGeo = new THREE.SphereGeometry(0.985, 64, 64);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0x0a1424,
      transparent: true,
      opacity: 0.35,
    });
    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.renderOrder = -1;
    scene.add(coreMesh);

    // Wireframe grid
    const wireGeo = new THREE.SphereGeometry(1.0, 36, 18);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x3a4f7a,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    scene.add(new THREE.Mesh(wireGeo, wireMat));

    // Equator + prime meridian highlighted slightly
    const eqPts = [];
    for (let i = 0; i <= 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      eqPts.push(new THREE.Vector3(Math.cos(t) * 1.001, 0, Math.sin(t) * 1.001));
    }
    const eqLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(eqPts),
      new THREE.LineBasicMaterial({ color: 0x5a7099, transparent: true, opacity: 0.5 })
    );
    scene.add(eqLine);

    const pmPts = [];
    for (let i = 0; i <= 128; i++) {
      const t = (i / 128) * Math.PI * 2;
      pmPts.push(new THREE.Vector3(Math.cos(t) * 1.001, Math.sin(t) * 1.001, 0));
    }
    const pmLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pmPts),
      new THREE.LineBasicMaterial({ color: 0x5a7099, transparent: true, opacity: 0.4 })
    );
    scene.add(pmLine);

    // Dynamic group
    const dyn = new THREE.Group();
    scene.add(dyn);

    // Rotation state
    let rotY = 0.6;
    let rotX = 0.25;
    let autoRot = true;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let lastT = performance.now();

    function frame(now) {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (autoRot && !dragging) rotY += dt * 0.12;
      scene.rotation.y = rotY;
      scene.rotation.x = rotX;
      renderer.render(scene, camera);
      reqRef = requestAnimationFrame(frame);
    }
    let reqRef = requestAnimationFrame(frame);

    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    dom.style.cursor = "grab";

    function down(x, y) {
      dragging = true;
      autoRot = false;
      lastX = x;
      lastY = y;
      dom.style.cursor = "grabbing";
    }
    function move(x, y) {
      if (!dragging) return;
      rotY += (x - lastX) * 0.006;
      rotX += (y - lastY) * 0.006;
      rotX = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, rotX));
      lastX = x;
      lastY = y;
    }
    function up() {
      dragging = false;
      dom.style.cursor = "grab";
    }
    const onMD = (e) => down(e.clientX, e.clientY);
    const onMM = (e) => move(e.clientX, e.clientY);
    const onTS = (e) => {
      const t = e.touches[0];
      down(t.clientX, t.clientY);
    };
    const onTM = (e) => {
      const t = e.touches[0];
      move(t.clientX, t.clientY);
    };

    dom.addEventListener("mousedown", onMD);
    window.addEventListener("mousemove", onMM);
    window.addEventListener("mouseup", up);
    dom.addEventListener("touchstart", onTS, { passive: true });
    dom.addEventListener("touchmove", onTM, { passive: true });
    dom.addEventListener("touchend", up);

    function onResize() {
      if (!mount) return;
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    }
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    sceneRef.current = { scene, dyn, renderer, dom };

    return () => {
      cancelAnimationFrame(reqRef);
      ro.disconnect();
      dom.removeEventListener("mousedown", onMD);
      window.removeEventListener("mousemove", onMM);
      window.removeEventListener("mouseup", up);
      dom.removeEventListener("touchstart", onTS);
      dom.removeEventListener("touchmove", onTM);
      dom.removeEventListener("touchend", up);
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    const { dyn } = sceneRef.current;

    while (dyn.children.length) {
      const c = dyn.children[0];
      dyn.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }

    const p = PRESETS[presetKey];
    const A = latLonToVec3(p.a.lat, p.a.lon);
    const B = latLonToVec3(p.b.lat, p.b.lon);

    // Point A
    const aMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a })
    );
    aMesh.position.copy(A).multiplyScalar(1.025);
    dyn.add(aMesh);
    const aGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.18 })
    );
    aGlow.position.copy(A).multiplyScalar(1.025);
    dyn.add(aGlow);

    // Point B
    const bMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.028, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0x4fa3ff })
    );
    bMesh.position.copy(B).multiplyScalar(1.025);
    dyn.add(bMesh);
    const bGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0x4fa3ff, transparent: true, opacity: 0.18 })
    );
    bGlow.position.copy(B).multiplyScalar(1.025);
    dyn.add(bGlow);

    // Equidistant great circle (the ring)
    const normal = A.clone().sub(B);
    const ringPts = makeGreatCircle(normal, 360, 1.006);
    const ringLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({ color: 0xf2a949, linewidth: 2 })
    );
    dyn.add(ringLine);

    // Arc between A and B
    const arcPts = makeArc(A, B, 128, 1.012);
    const arcLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(arcPts),
      new THREE.LineDashedMaterial({
        color: 0xe8d8b8,
        dashSize: 0.04,
        gapSize: 0.025,
        transparent: true,
        opacity: 0.7,
      })
    );
    arcLine.computeLineDistances();
    dyn.add(arcLine);

    // Chord straight through Earth from A to B
    const chordGeo = new THREE.BufferGeometry().setFromPoints([
      A.clone().multiplyScalar(1.02),
      B.clone().multiplyScalar(1.02),
    ]);
    const chordLine = new THREE.Line(
      chordGeo,
      new THREE.LineBasicMaterial({
        color: 0xffaa33,
        transparent: true,
        opacity: 0.9,
      })
    );
    dyn.add(chordLine);

    // Interior midpoint of the chord (inside Earth; at center for antipodes)
    const interiorMid = A.clone().add(B).multiplyScalar(0.5);
    const interiorMidMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.032, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xf2a949 })
    );
    interiorMidMesh.position.copy(interiorMid);
    dyn.add(interiorMidMesh);

    const interiorMidGlow = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0xf2a949, transparent: true, opacity: 0.18 })
    );
    interiorMidGlow.position.copy(interiorMid);
    dyn.add(interiorMidGlow);

    // Earth center reference (small marker at origin for comparison)
    const centerMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x6a7a99, transparent: true, opacity: 0.7 })
    );
    dyn.add(centerMesh);

    // The Midpoint Pair: surface midpoint (near) + its antipode (far)
    // Both sit on the equidistant ring. The "new discovery."
    const surfaceDir = A.clone().add(B);
    if (surfaceDir.length() > 1e-6) {
      surfaceDir.normalize();

      // Near surface midpoint — closest equidistant point on the ring
      const nearMid = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 18, 18),
        new THREE.MeshBasicMaterial({ color: 0xf2d985 })
      );
      nearMid.position.copy(surfaceDir).multiplyScalar(1.028);
      dyn.add(nearMid);

      // Far surface midpoint — antipode of near, farthest equidistant point on the ring
      const farMid = new THREE.Mesh(
        new THREE.SphereGeometry(0.026, 18, 18),
        new THREE.MeshBasicMaterial({ color: 0xf2d985 })
      );
      farMid.position.copy(surfaceDir).multiplyScalar(-1.028);
      dyn.add(farMid);

      // Axis line connecting near to far, passing through Earth's center
      // and the interior chord midpoint
      const axisGeo = new THREE.BufferGeometry().setFromPoints([
        surfaceDir.clone().multiplyScalar(1.028),
        surfaceDir.clone().multiplyScalar(-1.028),
      ]);
      const axisLine = new THREE.Line(
        axisGeo,
        new THREE.LineBasicMaterial({
          color: 0xf2d985,
          transparent: true,
          opacity: 0.45,
        })
      );
      dyn.add(axisLine);
    }
  }, [presetKey]);

  const p = PRESETS[presetKey];
  const A = latLonToVec3(p.a.lat, p.a.lon);
  const B = latLonToVec3(p.b.lat, p.b.lon);
  const arcKm = angularKm(A, B);
  const halfKm = arcKm / 2;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(180deg, #060912 0%, #0a1224 100%)",
        color: "#e8e4d8",
        fontFamily: "'Fraunces', Georgia, serif",
        padding: "20px 16px 40px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700&family=JetBrains+Mono:wght@400;600&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      <header style={{ maxWidth: 640, margin: "0 auto 16px" }}>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 11,
            letterSpacing: "0.18em",
            color: "#f2a949",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          Geopuesto · Field Diagram 01
        </div>
        <h1
          style={{
            fontFamily: "'Fraunces', serif",
            fontWeight: 500,
            fontSize: "clamp(28px, 7vw, 42px)",
            lineHeight: 1.05,
            margin: "0 0 10px",
            letterSpacing: "-0.02em",
          }}
        >
          The Equidistant Ring of <em>Any</em> Two Points
        </h1>
        <p
          style={{
            fontFamily: "'Fraunces', serif",
            fontSize: 15,
            lineHeight: 1.5,
            margin: 0,
            color: "#b8b2a0",
          }}
        >
          Pick any two points on a sphere. Draw a straight chord through the
          Earth between them — its midpoint sits inside the planet (at the
          center for antipodes, off-center otherwise). The set of all surface
          locations equidistant from both points is a great circle perpendicular
          to that chord.
        </p>
      </header>

      <div
        ref={mountRef}
        style={{
          width: "100%",
          maxWidth: 640,
          height: "min(70vh, 560px)",
          aspectRatio: "1 / 1",
          margin: "0 auto",
          background: "radial-gradient(circle at 50% 45%, #0e1a30 0%, #060912 70%)",
          borderRadius: 14,
          border: "1px solid #2a3550",
          overflow: "hidden",
        }}
      />

      <div
        style={{
          maxWidth: 640,
          margin: "16px auto 0",
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 8,
        }}
      >
        {Object.entries(PRESETS).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setPresetKey(k)}
            style={{
              padding: "12px 10px",
              background:
                presetKey === k
                  ? "linear-gradient(180deg, #1e2a48 0%, #15203a 100%)"
                  : "transparent",
              border: `1px solid ${presetKey === k ? "#f2a949" : "#2a3550"}`,
              color: presetKey === k ? "#f2a949" : "#b8b2a0",
              borderRadius: 8,
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.05em",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {v.name}
          </button>
        ))}
      </div>

      <div
        style={{
          maxWidth: 640,
          margin: "20px auto 0",
          padding: 18,
          background: "rgba(20, 30, 55, 0.5)",
          border: "1px solid #2a3550",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 14,
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <div>
            <div style={{ color: "#ff5a4a", marginBottom: 4 }}>● POINT A</div>
            <div style={{ color: "#e8e4d8" }}>{p.a.label}</div>
            <div style={{ color: "#7c8aa8" }}>
              {p.a.lat.toFixed(2)}°, {p.a.lon.toFixed(2)}°
            </div>
          </div>
          <div>
            <div style={{ color: "#4fa3ff", marginBottom: 4 }}>● POINT B</div>
            <div style={{ color: "#e8e4d8" }}>{p.b.label}</div>
            <div style={{ color: "#7c8aa8" }}>
              {p.b.lat.toFixed(2)}°, {p.b.lon.toFixed(2)}°
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid #2a3550",
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ color: "#7c8aa8" }}>arc A↔B</span>
            <span style={{ color: "#e8e4d8" }}>{arcKm.toFixed(0)} km</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#f2a949" }}>ring distance from each</span>
            <span style={{ color: "#f2a949" }}>{halfKm.toFixed(0)} km</span>
          </div>
        </div>

        <p
          style={{
            marginTop: 16,
            marginBottom: 0,
            fontFamily: "'Fraunces', serif",
            fontSize: 14,
            lineHeight: 1.55,
            color: "#b8b2a0",
            fontStyle: "italic",
          }}
        >
          {p.note}
        </p>
      </div>

      <div
        style={{
          maxWidth: 640,
          margin: "20px auto 0",
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          lineHeight: 1.7,
          color: "#7c8aa8",
          letterSpacing: "0.02em",
        }}
      >
        <div>
          <span style={{ color: "#f2a949" }}>──</span> equidistant great circle
          (the &ldquo;ring&rdquo;) — on the surface
        </div>
        <div>
          <span style={{ color: "#ffaa33" }}>──</span> chord straight through
          Earth from A to B
        </div>
        <div>
          <span style={{ color: "#e8d8b8" }}>- -</span> shortest great-circle
          arc on the surface between A and B
        </div>
        <div>
          <span style={{ color: "#f2a949" }}>●</span> midpoint of the chord
          (inside Earth; at Earth&rsquo;s center for antipodes)
        </div>
        <div>
          <span style={{ color: "#f2d985" }}>● ●</span> the Midpoint Pair —
          near + far surface midpoints, both on the ring (antipodal to each
          other)
        </div>
        <div>
          <span style={{ color: "#6a7a99" }}>·</span> Earth&rsquo;s geometric
          center (reference)
        </div>
        <div style={{ marginTop: 10, color: "#5a6488", fontStyle: "italic", fontFamily: "'Fraunces', serif", fontSize: 13 }}>
          Drag to rotate · auto-rotation pauses on touch
        </div>
      </div>
    </div>
  );
}
