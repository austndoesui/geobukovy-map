import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

interface Owner {
  meno: string;
  adresa: string;
  podiel: string;
}

interface ParcelResult {
  lv: string;
  ku: string;
  kuName: string;
  parcelNo: string;
  owners: Owner[];
  error?: string;
}

const OWNER_RE = /^\((\d+\/\d+)\)\s+(.+?),\s+(.*)$/;

function parseVla(vlaJson: string): Owner[] {
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

async function queryMpt(baseUrl: string, kuCode: string, parcelNo: string) {
  const where = `KU=${kuCode} AND PARCELA='${parcelNo.replace(/'/g, "''")}'`;
  const url = `${baseUrl}?where=${encodeURIComponent(where)}&outFields=lv,vla,ku_str,PARCELA&returnGeometry=false&f=json`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const d: any = await res.json();
  return d?.features || [];
}

async function getOwnersByParcel(kuCode: string, parcelNo: string): Promise<ParcelResult> {
  try {
    let features = await queryMpt(MPT_E, kuCode, parcelNo);
    if (!features || features.length === 0) {
      features = await queryMpt(MPT_C, kuCode, parcelNo);
    }
    if (!features || features.length === 0) {
      return { lv: "", ku: kuCode, kuName: "", parcelNo, owners: [], error: "not_found" };
    }

    const attr = features[0].attributes;
    const vlaRaw: string = attr.vla || "[]";
    const owners = parseVla(vlaRaw);

    return {
      lv: String(attr.lv ?? ""),
      ku: kuCode,
      kuName: attr.ku_str || "",
      parcelNo: attr.PARCELA || parcelNo,
      owners,
    };
  } catch (err: any) {
    return { lv: "", ku: kuCode, kuName: "", parcelNo, owners: [], error: err?.message || "fetch_failed" };
  }
}

export const Route = createFileRoute("/api/public/kataster/owners-batch")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const body = await request.json();
        const requests: Array<{ kuCode: string; parcelNo: string }> = body.requests || [];

        if (requests.length === 0) {
          return new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        const results = await Promise.all(
          requests.map((r) => getOwnersByParcel(r.kuCode, r.parcelNo)),
        );

        return new Response(JSON.stringify({ results }), {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      },
    },
  },
});
