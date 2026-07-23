import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const UPSTREAMS = [
  "https://kataster.skgeodesy.sk/eskn/services/NR/kn_wms_norm/MapServer/WMSServer",
  "https://kataster.skgeodesy.sk/eskn/services/BA/kn_wms_norm/MapServer/WMSServer",
  "https://kataster.skgeodesy.sk/eskn/services/KE/kn_wms_norm/MapServer/WMSServer",
];

async function identifyPoint(lat: number, lng: number): Promise<Record<string, unknown>[]> {
  const bbox = `${lat - 0.001},${lng - 0.001},${lat + 0.001},${lng + 0.001}`;
  const qs = `SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo&LAYERS=5,8&QUERY_LAYERS=5,8&I=50&J=50&WIDTH=100&HEIGHT=100&BBOX=${bbox}&CRS=EPSG:4326&INFO_FORMAT=application/geo%2Bjson&FEATURE_COUNT=10`;

  const results = await Promise.allSettled(
    UPSTREAMS.map(async (base) => {
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), 4000);
      try {
        const res = await fetch(`${base}?${qs}`, {
          signal: ctrl.signal,
          headers: { Accept: "application/json", "User-Agent": UA, Referer: "https://kataster.skgeodesy.sk/" },
        });
        clearTimeout(id);
        if (!res.ok) return null;
        return res.json();
      } catch { clearTimeout(id); return null; }
    }),
  );

  for (const r of results) {
    if (r.status === "fulfilled" && r.value?.features?.length) {
      return r.value.features.map((f: { properties?: Record<string, unknown> }) => f.properties ?? {});
    }
  }
  return [];
}

function parseProps(props: Record<string, unknown>) {
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      for (const key of Object.keys(props)) {
        if (key.toLowerCase().includes(k.toLowerCase()) && props[key] != null && String(props[key]).trim() !== "") {
          return String(props[key]);
        }
      }
    }
    return null;
  };
  return {
    parcelNo: pick("číslo parcely", "parcelné číslo", "cislo_parcely", "parcelné", "parcelne") || "—",
    ku: pick("názov katastrálneho", "názov_ku", "nazov_ku") || "—",
    lv: pick("list vlastníctva", "listu vlastníctva", "číslo listu", "cislo_lv", "list vlast"),
    vymera: pick("vymera", "výmera"),
    druh: pick("druh pozemku", "druh_pozemku", "druh"),
    kuCode: pick("kód katastrálneho", "kód_ku", "katu", "ku_kod", "kod_katastra", "kod_katastralneho", "kod_ku", "kodu"),
  };
}

export const Route = createFileRoute("/api/public/kataster/parcels-by-bbox")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const s = parseFloat(u.searchParams.get("south") ?? "");
        const w = parseFloat(u.searchParams.get("west") ?? "");
        const n = parseFloat(u.searchParams.get("north") ?? "");
        const e = parseFloat(u.searchParams.get("east") ?? "");
        if (isNaN(s) || isNaN(w) || isNaN(n) || isNaN(e)) {
          return new Response(
            JSON.stringify({ error: "invalid bbox", detail: "Need south,west,north,east" }),
            { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }

        const step = Math.max(0.001, Math.min(n - s, e - w) / 5);
        const points: { lat: number; lng: number }[] = [];
        for (let lat = s; lat <= n; lat += step) {
          for (let lng = w; lng <= e; lng += step) {
            points.push({ lat, lng });
          }
        }

        if (points.length === 0) points.push({ lat: (s + n) / 2, lng: (w + e) / 2 });

        const seen = new Set<string>();
        const parcels: Record<string, unknown>[] = [];

        const BATCH = 8;
        for (let i = 0; i < points.length; i += BATCH) {
          const batch = points.slice(i, i + BATCH);
          const results = await Promise.allSettled(batch.map((p) => identifyPoint(p.lat, p.lng)));
          for (let ri = 0; ri < results.length; ri++) {
            const r = results[ri];
            if (r.status !== "fulfilled") continue;
            const pt = batch[ri];
            for (const props of r.value) {
              const parsed = parseProps(props);
              const key = `${parsed.kuCode}_${parsed.parcelNo}`;
              if (key === "null_—" || seen.has(key)) continue;
              seen.add(key);
              parcels.push({
                parcelNo: parsed.parcelNo,
                ku: parsed.ku,
                lv: parsed.lv,
                vymera: parsed.vymera,
                druh: parsed.druh,
                kuCode: parsed.kuCode,
                lat: pt.lat,
                lng: pt.lng,
              });
            }
          }
        }

        return new Response(JSON.stringify({ parcels, count: parcels.length }), {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
    },
  },
});
