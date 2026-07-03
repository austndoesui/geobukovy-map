import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });
}

interface Owner {
  meno: string;
  adresa: string;
  podiel: string;
}

interface PlaywrightResponse {
  lv: string;
  ku: string;
  parcelNo: string;
  owners: Owner[];
  vymera?: string;
  druh?: string;
}

const PLAYWRIGHT_URL = process.env.PLAYWRIGHT_SERVICE_URL || "http://localhost:3001";

async function tryPlaywright(
  ku: string,
  lv: string,
  lat: number,
  lng: number,
  parcelNo: string,
): Promise<PlaywrightResponse | null> {
  if (!PLAYWRIGHT_URL) return null;
  try {
    const res = await fetch(PLAYWRIGHT_URL + "/api/owners", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lat, lng, kuCode: ku, parcelNo, lv }),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return null;
    return (await res.json()) as PlaywrightResponse;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/kataster/lv")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ku = url.searchParams.get("ku") || "";
        const lv = url.searchParams.get("lv") || "";
        const lat = parseFloat(url.searchParams.get("lat") || "");
        const lng = parseFloat(url.searchParams.get("lng") || "");
        const parcelNo = url.searchParams.get("parcel") || "";
        if (!ku || !lv) {
          return json({ error: "missing_params", detail: "Both 'ku' and 'lv' parameters are required" }, 400);
        }

        if (!isNaN(lat) && !isNaN(lng)) {
          const result = await tryPlaywright(ku, lv, lat, lng, parcelNo);
          if (result) {
            return json({ lv: result.lv || lv, ku, owners: result.owners || [], parcels: [] });
          }
        }

        return json({
          lv,
          ku,
          owners: [],
          parcels: [],
          note: "No LV data available. Playwright service unreachable or coordinates missing.",
        });
      },
    },
  },
});