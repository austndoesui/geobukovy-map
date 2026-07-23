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

const OWNER_RE = /^\((\d+\/\d+)\)\s+(.+?),\s+(.*)$/;

function parseVla(vlaJson: string): Array<{ meno: string; adresa: string; podiel: string }> {
  try {
    const raw: string[] = JSON.parse(vlaJson);
    return raw.map((entry) => {
      const m = OWNER_RE.exec(entry);
      if (m) {
        return { meno: m[2].trim(), adresa: m[3].trim(), podiel: m[1] };
      }
      return { meno: entry.replace(/^\([^)]+\)\s*/, "").trim(), adresa: "", podiel: "" };
    });
  } catch {
    return [];
  }
}

const MPT_E = "https://mpt.svp.sk/server/rest/services/portal/kataster_E/MapServer/0/query";
const MPT_C = "https://mpt.svp.sk/server/rest/services/portal/kataster_C/MapServer/0/query";

export const Route = createFileRoute("/api/public/kataster/lv")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const ku = url.searchParams.get("ku") || "";
        const lv = url.searchParams.get("lv") || "";
        const parcelNo = url.searchParams.get("parcel") || "";

        if (!ku || !lv) {
          return json({ error: "missing_params", detail: "Both 'ku' and 'lv' parameters are required" }, 400);
        }

        if (!parcelNo) {
          return json({ lv, ku, owners: [], parcels: [], note: "missing parcel number" });
        }

        try {
          const where = `KU=${ku} AND PARCELA='${parcelNo.replace(/'/g, "''")}'`;

          async function queryMpt(baseUrl: string) {
            const url = `${baseUrl}?where=${encodeURIComponent(where)}&outFields=lv,vla,ku_str,PARCELA&returnGeometry=false&f=json`;
            const res = await fetch(url);
            if (!res.ok) return null;
            const d: any = await res.json();
            return d?.features || [];
          }

          let features = await queryMpt(MPT_E);
          if (!features || features.length === 0) {
            features = await queryMpt(MPT_C);
          }
          if (!features || features.length === 0) {
            return json({ lv, ku, owners: [], parcels: [], note: "not_found" });
          }

          const attr = features[0].attributes;
          return json({
            lv: String(attr.lv ?? lv),
            ku,
            owners: parseVla(attr.vla || "[]"),
            parcels: [],
            note: "mpt",
          });
        } catch (err: any) {
          return json({ lv, ku, owners: [], parcels: [], note: err?.message || "error" });
        }
      },
    },
  },
});
