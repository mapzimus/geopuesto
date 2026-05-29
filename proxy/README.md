# geopuesto live-feeds proxy

A tiny [Cloudflare Worker](https://workers.cloudflare.com/) that revives the three
"fun stuff" feeds the browser can't call directly:

| Route | Upstream | Why the browser can't call it directly |
|---|---|---|
| `/flights` | OpenSky Network | Sends a CORS header locked to its own domain |
| `/satellites` | N2YO | No CORS header **and** needs a secret API key |
| `/webcams` | Windy Webcams | No CORS header **and** needs a secret API key |

geopuesto is a static site (GitHub Pages), so its fetches run in the visitor's
browser — where these three are blocked. The Worker runs server-side (no CORS
rules apply server-to-server), adds the CORS headers the browser will accept,
and injects the secret keys from **Worker secrets** so they never live in the
public repo. It returns the raw upstream JSON; the site's existing code parses it.

Until you deploy this and set `CONFIG.proxyBase`, those three modules simply stay
hidden — nothing else on the site is affected.

---

## One-time deploy (about 10 minutes)

You need a free Cloudflare account. The free Workers plan (100,000 requests/day)
is far more than this hobby site will ever use.

**1. Install Wrangler** (Cloudflare's CLI) — Node 18+ required:

```bash
npm install -g wrangler
# or run it ad-hoc with: npx wrangler <command>
```

**2. Log in** (opens a browser to authorize your own Cloudflare account):

```bash
wrangler login
```

**3. Set the two secret keys.** Run each command, then paste the key when prompted.
Run these from inside this `proxy/` folder:

```bash
wrangler secret put N2YO_API_KEY
wrangler secret put WINDY_WEBCAMS_KEY
```

> The values are the keys that used to sit in `index.html`'s `CONFIG` block
> (`n2yoApiKey` and `windyWebcamsKey`). **Rotate them first** — see Security below.
> OpenSky (`/flights`) is anonymous and needs no secret.

**4. Deploy:**

```bash
wrangler deploy
```

Wrangler prints a URL like:

```
https://geopuesto-live-feeds.YOUR-SUBDOMAIN.workers.dev
```

**5. Wire it into the site.** Open `geopuesto/index.html`, find the `CONFIG`
block, and set `proxyBase` to that URL (no trailing slash):

```js
proxyBase: "https://geopuesto-live-feeds.YOUR-SUBDOMAIN.workers.dev",
```

Commit + push, bump the submodule pointer in `maxwellhowegis`, and the three
modules light up on the next Pages deploy.

---

## Test it

Health check (should return JSON listing the routes):

```bash
curl https://geopuesto-live-feeds.YOUR-SUBDOMAIN.workers.dev/
```

A real call must include an allowed `Origin` header (the Worker rejects others
with 403 — that's the anti-abuse guard):

```bash
curl -H "Origin: https://maxwellhowegis.com" \
  "https://geopuesto-live-feeds.YOUR-SUBDOMAIN.workers.dev/satellites?lat=40.7&lng=-74.0"
```

## Local development

```bash
wrangler dev        # serves the Worker at http://localhost:8787
```

`localhost` and `127.0.0.1` (any port) are already in the CORS allowlist, so a
locally-served copy of geopuesto with `proxyBase: "http://localhost:8787"` works.

---

## Security

- **Rotate the N2YO and Windy keys before using them here.** They were committed
  to this public repo's history, so treat them as compromised: regenerate both in
  their dashboards, put the *new* values into the Worker secrets above, and delete
  the old ones. After that the live keys exist only as Worker secrets, never in git.
- The CORS allowlist in `worker.js` (`ALLOWED_ORIGINS` + the localhost regex) is
  what stops anyone else from pointing their site at your Worker and draining your
  API quota. Edit that list if your domain changes.
- The Worker only accepts `GET` (plus `OPTIONS` preflight) and only builds upstream
  URLs from validated numeric params — it can't be used as a general-purpose relay.

## Costs / limits

- Cloudflare Workers free tier: 100k requests/day. Edge caching (10s flights,
  15s satellites, 5min webcams) keeps repeat lookups from hitting the upstreams.
- N2YO and Windy free tiers have their own per-day caps; the edge cache stretches
  them. OpenSky anonymous access is rate-limited — if flights get flaky under load,
  OpenSky's OAuth2 client-credentials can be added as secrets later.
