// geopuesto live-feeds proxy — a Cloudflare Worker
// ---------------------------------------------------------------------------
// WHY THIS EXISTS
// geopuesto is a static GitHub Pages site, so every fetch runs in the visitor's
// browser. Three "fun stuff" feeds simply cannot be called from a browser:
//
//   • OpenSky (flights overhead) — sends an Access-Control-Allow-Origin header
//     hardcoded to its OWN domain, so the browser rejects the cross-origin read.
//   • N2YO (satellites overhead) — sends no CORS header at all, AND requires a
//     secret apiKey that must never ship inside public client HTML.
//   • Windy Webcams (live cams)  — sends no CORS header, AND requires a secret
//     x-windy-key header.
//
// This Worker is a thin same-origin shim. Server-to-server requests have no CORS
// preflight, so it fetches each upstream freely, adds CORS headers the browser
// WILL accept, injects the secret keys server-side (from Worker secrets, never
// committed), and lightly caches at Cloudflare's edge to protect the free-tier
// API quotas. It relays the RAW upstream JSON untouched — the geopuesto client
// keeps its existing parsing, so swapping a vendor later only touches this file.
//
// DEPLOY: see README.md in this folder.
// ---------------------------------------------------------------------------

// Only these origins may call the proxy. Anything else gets a 403 — this keeps
// the Worker from becoming an open relay that burns your API quota for strangers.
const ALLOWED_ORIGINS = [
  "https://maxwellhowegis.com",
  "https://www.maxwellhowegis.com",
];
// Plus localhost / 127.0.0.1 on any port, for local development.
const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

// Edge + browser cache lifetimes (seconds). Flights/sats are near-real-time so
// they stay short; webcams change slowly so they cache longer.
const TTL = { flights: 10, satellites: 15, webcams: 300 };

function allowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  if (ALLOWED_ORIGINS.includes(origin) || LOCALHOST_RE.test(origin)) return origin;
  return null;
}

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function jsonResponse(body, { status = 200, origin, cacheSeconds = 0 } = {}) {
  const headers = { "Content-Type": "application/json", ...corsHeaders(origin) };
  if (cacheSeconds > 0) headers["Cache-Control"] = `public, max-age=${cacheSeconds}`;
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers });
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Fetch an upstream URL (server-side, no CORS), relay its body verbatim, and
// stamp it with the caller's CORS + cache headers. Edge-cache via cf.cacheTtl.
async function relay(upstreamUrl, { origin, cacheSeconds, upstreamHeaders } = {}) {
  const upstream = await fetch(upstreamUrl, {
    headers: upstreamHeaders || {},
    cf: { cacheTtl: cacheSeconds, cacheEverything: true },
  });
  if (!upstream.ok) {
    return jsonResponse(
      { error: "upstream_error", status: upstream.status },
      { status: 502, origin },
    );
  }
  const body = await upstream.text();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${cacheSeconds}`,
      ...corsHeaders(origin),
    },
  });
}

export default {
  async fetch(request, env) {
    const origin = allowedOrigin(request);

    // CORS preflight.
    if (request.method === "OPTIONS") {
      return origin
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : new Response(null, { status: 403 });
    }
    if (!origin) return new Response("Forbidden origin", { status: 403 });
    if (request.method !== "GET") {
      return jsonResponse({ error: "method_not_allowed" }, { status: 405, origin });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      // Flights overhead — OpenSky. Keyless (anonymous), CORS-blocked in-browser.
      if (path === "/flights" || path === "/opensky") {
        const lamin = num(url.searchParams.get("lamin"));
        const lomin = num(url.searchParams.get("lomin"));
        const lamax = num(url.searchParams.get("lamax"));
        const lomax = num(url.searchParams.get("lomax"));
        if ([lamin, lomin, lamax, lomax].some((v) => v === null)) {
          return jsonResponse({ error: "bad_bbox" }, { status: 400, origin });
        }
        const u = `https://opensky-network.org/api/states/all`
          + `?lamin=${clamp(lamin, -90, 90)}&lomin=${clamp(lomin, -180, 180)}`
          + `&lamax=${clamp(lamax, -90, 90)}&lomax=${clamp(lomax, -180, 180)}`;
        return await relay(u, { origin, cacheSeconds: TTL.flights });
      }

      // Satellites overhead — N2YO. Needs secret apiKey, no CORS header.
      if (path === "/satellites" || path === "/n2yo") {
        const lat = num(url.searchParams.get("lat"));
        const lng = num(url.searchParams.get("lng"));
        if (lat === null || lng === null) {
          return jsonResponse({ error: "bad_coords" }, { status: 400, origin });
        }
        if (!env.N2YO_API_KEY) {
          return jsonResponse({ error: "n2yo_key_not_configured" }, { status: 503, origin });
        }
        // /above/{lat}/{lng}/{alt}/{searchRadius°}/{categoryId}/  — radius 70°, all categories.
        const u = `https://api.n2yo.com/rest/v1/satellite/above/`
          + `${clamp(lat, -90, 90)}/${clamp(lng, -180, 180)}/0/70/0/&apiKey=${env.N2YO_API_KEY}`;
        return await relay(u, { origin, cacheSeconds: TTL.satellites });
      }

      // Live webcams — Windy. Needs secret x-windy-key header, no CORS header.
      if (path === "/webcams") {
        const lat = num(url.searchParams.get("lat"));
        const lng = num(url.searchParams.get("lng"));
        if (lat === null || lng === null) {
          return jsonResponse({ error: "bad_coords" }, { status: 400, origin });
        }
        if (!env.WINDY_WEBCAMS_KEY) {
          return jsonResponse({ error: "windy_key_not_configured" }, { status: 503, origin });
        }
        const radius = clamp(num(url.searchParams.get("radius")) ?? 250, 1, 250);
        const u = `https://api.windy.com/webcams/api/v3/webcams`
          + `?nearby=${clamp(lat, -90, 90)},${clamp(lng, -180, 180)},${Math.round(radius)}`
          + `&limit=10&include=images,location,player`;
        return await relay(u, {
          origin,
          cacheSeconds: TTL.webcams,
          upstreamHeaders: { "x-windy-key": env.WINDY_WEBCAMS_KEY },
        });
      }

      // Health check / route listing.
      if (path === "/") {
        return jsonResponse(
          { ok: true, service: "geopuesto-live-feeds", routes: ["/flights", "/satellites", "/webcams"] },
          { origin },
        );
      }

      return jsonResponse({ error: "not_found" }, { status: 404, origin });
    } catch (err) {
      return jsonResponse(
        { error: "proxy_error", detail: String((err && err.message) || err) },
        { status: 502, origin },
      );
    }
  },
};
