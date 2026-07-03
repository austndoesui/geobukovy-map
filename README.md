# GeoBukový Map — GIS Parcel Viewer

Interactive map portal for Slovak cadastre (ÚGKK). Click any parcel on the map to see its details (parcel number, area, land use, cadastral unit) and look up owner data from the ESKN Portal.

---

## Prerequisites

- **Node.js 18+**
- **Docker Desktop** (for the Playwright microservice)
- **VPN connection to Slovakia** — all `skgeodesy.sk` endpoints (WMS, ESKN Portal) are geo-blocked and will time out without one

---

## Local Development

### 1. Main App

```bash
npm install
npm run dev
```

Opens at `http://localhost:8080`. Click any parcel on the map to identify it — this works immediately using the WMS proxy at `kataster.skgeodesy.sk`. All core features (map, search, identify, parcel detail panel) are available.

### 2. Owner Lookup (Playwright Microservice)

The "Vlastníci" section in the left panel fetches owner data from the ESKN Portal. This requires a Docker container running Playwright to navigate the portal, solve captcha, and extract owner information.

```bash
cd services/owner-lookup

# Build and start
docker compose up --build
```

This starts:
| Port | Service | Purpose |
|------|---------|---------|
| `3001` | Hono API | `POST /api/owners` — returns owner data for a given LV |
| `6080` | noVNC | Visual browser access for one-time captcha solve |
| `9222` | Chromium CDP | Shared browser instance used by the API |

#### One-Time Captcha Solve

1. Open `http://localhost:6080/vnc.html` in your browser
2. Click the **Connect** button
3. You'll see a Chromium browser already navigated to the ESKN Portal
4. Tick the **"I'm not a robot"** reCAPTCHA checkbox
5. That's it — cookies are saved automatically to a Docker volume

After solving, owner data will load when you click any parcel. You do **not** need to solve it again — cookies persist across container restarts.

> If you delete the Docker volume (`docker compose down -v`) or the cookie expires, repeat steps 1–5.

### 3. Environment

The `.env` file already contains:

```
PLAYWRIGHT_SERVICE_URL=http://localhost:3001
```

This tells the app where to reach the Playwright service. The default is `http://localhost:3001`, so it works without any changes in local dev.

---

## Production (VPS) Deployment

### 1. Main App

Build and run with your preferred Node.js process manager:

```bash
npm run build
npm start
```

Or use a reverse proxy (nginx, Caddy) to serve port `8080` on your domain.

Set environment variables as needed:

```bash
PLAYWRIGHT_SERVICE_URL=http://localhost:3001
```

### 2. Owner Lookup Microservice

Same container as local dev, but without noVNC if you don't need visual debugging:

```bash
cd services/owner-lookup
docker compose up --build -d
```

#### Captcha Solve (First Run Only)

On a fresh VPS with no cached cookies, do the one-time solve:

1. Forward port `6080` (or use SSH tunnel) to reach noVNC
2. Solve the captcha as described in [Local Development](#one-time-captcha-solve)
3. Done — cookies are persisted in the `browser-data` Docker volume

On subsequent restarts, the cookies are still there. You won't need to solve again.

#### Disable noVNC in Production (Optional)

To reduce attack surface, remove noVNC from `docker-compose.yml` after the captcha is solved:

```yaml
ports:
  - "3001:3001"
  # - "6080:6080"   # comment out or remove
```

### 3. Docker Volume Persistence

The `docker-compose.yml` mounts a named volume:

```yaml
volumes:
  - browser-data:/data/browser-session
```

This is where the Chromium profile (cookies, local storage) lives. It survives `docker compose restart` and `docker compose up` — only destroyed by `docker compose down -v`.

---

## Architecture

```
User clicks map
      ↓
WMS GetFeatureInfo → identify.ts (proxy → kataster.skgeodesy.sk)
      ↓
ParcelDetail component → /api/public/kataster/lv?ku=&lv=&lat=&lng=
      ↓
lv.ts (server route) → POST localhost:3001/api/owners
      ↓
Playwright service → Chromium CDP → ESKN Portal GeneratePrfPublic
      ↓
Owners extracted via DOM (page.evaluate) → JSON → frontend
```

### Key Files

| File | Purpose |
|------|---------|
| `src/routes/api/public/kataster/identify.ts` | WMS GetFeatureInfo proxy (bypasses CORS, fixes encoding) |
| `src/routes/api/public/kataster/lv.ts` | LV owner lookup proxy → Playwright service |
| `src/routes/api/public/kataster/search.ts` | Parcel search proxy → ÚGKK MapServer |
| `src/routes/index.tsx` | Main page: Portal, ParcelDetail, Section, Row components |
| `services/owner-lookup/src/index.ts` | Hono API server (/api/owners, /api/captcha-setup, /api/health) |
| `services/owner-lookup/src/browser.ts` | CDP connect to pre-launched Chromium |
| `services/owner-lookup/src/extract.ts` | DOM-based owner extraction from GeneratePrfPublic HTML |
| `services/owner-lookup/start.sh` | Bootstrap: Xvfb → x11vnc → noVNC → Chromium → Node app |

---

## Troubleshooting

**WMS identify returns no data** — Make sure your VPN is connected to Slovakia. `kataster.skgeodesy.sk` is geo-blocked.

**Owner lookup returns empty** — Check that the captcha was solved. Open `http://localhost:6080/vnc.html` and verify the ESKN Portal loads without a captcha prompt.

**"Reached the timeout" from Playwright** — The portal may be slow. The timeout is 45 seconds. Retry.

**CRLF warnings from Git** — On Windows, run `git config core.autocrlf false` before committing.
