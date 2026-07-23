# GeoBukový Map — GIS Parcel Viewer

Interactive map portal for Slovak cadastre (ÚGKK). Click any parcel on the map to see its details (parcel number, area, land use, cadastral unit) and look up owner data.

---

## Prerequisites

- **Node.js 18+**
- **VPN connection to Slovakia** — `kataster.skgeodesy.sk` WMS endpoints are geo-blocked and will time out without one

---

## Local Development

```bash
npm install
npm run dev
```

Opens at `http://localhost:8080`. Click any parcel on the map to identify it.

---

## Architecture

```
User clicks map
      ↓
WMS GetFeatureInfo → identify.ts (proxy → kataster.skgeodesy.sk)
      ↓
Parcel detail panel → owners-batch.ts or lv.ts
      ↓
Direct HTTP fetch → mpt.svp.sk ArcGIS REST service → returns owner data (vla field)
      ↓
JSON → frontend
```

No Docker, no Playwright, no captcha. Owner data comes directly from the open ArcGIS REST endpoint at `mpt.svp.sk/server/rest/services/portal/kataster_E/MapServer/0/query`.

### Key Files

| File | Purpose |
|------|---------|
| `src/routes/api/public/kataster/identify.ts` | WMS GetFeatureInfo proxy (bypasses CORS, fixes encoding) |
| `src/routes/api/public/kataster/owners-batch.ts` | Batch owner lookup via `mpt.svp.sk` |
| `src/routes/api/public/kataster/lv.ts` | Single-parcel owner lookup via `mpt.svp.sk` |
| `src/routes/api/public/kataster/search.ts` | Parcel search via ZBGIS suggest API |
| `src/routes/api/public/kataster/parcels-by-bbox.ts` | Grid-sampling parcel identification via WMS |
| `src/routes/index.tsx` | Main page |

---

## API Endpoints

| Route | Method | Description |
|-------|--------|-------------|
| `/api/public/kataster/owners-batch` | POST | Batch owner lookup by `{ kuCode, parcelNo }[]` |
| `/api/public/kataster/lv` | GET | Single owner lookup by `?ku=&lv=&parcel=` |
| `/api/public/kataster/identify` | GET | Parcel identify by `?lat=&lng=` |
| `/api/public/kataster/search` | GET | Address/parcel search by `?q=` |
| `/api/public/kataster/parcels-by-bbox` | GET | Parcels within bounding box |

---

## Troubleshooting

**WMS identify returns no data** — Make sure your VPN is connected to Slovakia. `kataster.skgeodesy.sk` is geo-blocked.

**Owner data returns empty** — `mpt.svp.sk` may be temporarily down. Check if the ArcGIS REST service is accessible.
