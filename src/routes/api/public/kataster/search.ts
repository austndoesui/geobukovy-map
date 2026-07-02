import { createFileRoute } from "@tanstack/react-router";

// Server-side parcel search via ÚGKK MapServer /find and /query (bypasses CORS)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const BASE = "https://kataster.skgeodesy.sk/eskn/rest/services/NR/kn_wms_norm/MapServer";

// Layer indices in the ÚGKK MapServer. Parcely C-KN is around layer 3, E-KN around layer 8.
// We query both and merge.
const PARCEL_LAYERS = "3,8";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });
}

// Parse "1155/14" or "1155" -> { main: "1155", sub: "14" | null }
function parseParcelNumber(s: string): { main: string; sub: string | null } | null {
  const m = s.trim().match(/^(\d+)(?:\s*[/-]\s*(\d+))?$/);
  if (!m) return null;
  return { main: m[1], sub: m[2] ?? null };
}

// Extract "obec parcela" — user types e.g. "Oravská Polhora 1155/14" or "1155/14 oravská polhora"
function splitQuery(q: string): { municipality: string | null; parcel: { main: string; sub: string | null } | null } {
  const parts = q.trim().split(/\s+/);
  // find a token that looks like a parcel number
  let parcelIdx = -1;
  let parcel: { main: string; sub: string | null } | null = null;
  for (let i = 0; i < parts.length; i++) {
    const p = parseParcelNumber(parts[i]);
    if (p) {
      parcel = p;
      parcelIdx = i;
      break;
    }
  }
  const municipality = parts
    .filter((_, i) => i !== parcelIdx)
    .join(" ")
    .trim() || null;
  return { municipality, parcel };
}

export const Route = createFileRoute("/api/public/kataster/search")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const q = (url.searchParams.get("q") || "").trim();
          if (q.length < 2) return json({ results: [] });

          const { municipality, parcel } = splitQuery(q);

          // If user typed just a parcel number without municipality → use /find (slower, whole SR)
          // Otherwise use /query with WHERE on parcel number + LIKE on k.ú. name
          const results: Array<{
            layer: number;
            layerName: string;
            attributes: Record<string, unknown>;
            geometry: unknown;
            lat: number;
            lng: number;
            label: string;
            sublabel: string;
          }> = [];

          const layers = PARCEL_LAYERS.split(",").map(Number);

          for (const layer of layers) {
            let upstream: string;
            if (parcel) {
              // Build a tolerant WHERE across common field name variants
              const parcelValue = parcel.sub ? `${parcel.main}/${parcel.sub}` : parcel.main;
              const parcelValueAlt = parcel.sub ? `${parcel.main}-${parcel.sub}` : parcel.main;
              const parcelFields = ["CISLO_PARCELY", "PARCELNE_CISLO", "CISLOPARCELY"];
              const kuFields = ["NAZOV_KU", "KATASTRALNE_UZEMIE", "NAZOVKU"];
              const parcelClause = parcelFields
                .map((f) => `${f}='${parcelValue}' OR ${f}='${parcelValueAlt}'`)
                .join(" OR ");
              const kuClause =
                municipality
                  ? " AND (" +
                    kuFields
                      .map((f) => `UPPER(${f}) LIKE UPPER('%${municipality.replace(/'/g, "''")}%')`)
                      .join(" OR ") +
                    ")"
                  : "";
              const where = `(${parcelClause})${kuClause}`;
              upstream =
                `${BASE}/${layer}/query?f=json&where=${encodeURIComponent(where)}` +
                `&outFields=*&returnGeometry=true&outSR=4326&resultRecordCount=25`;
            } else {
              // Fallback: /find on layer for text
              upstream =
                `${BASE}/find?f=json&contains=true&returnGeometry=true` +
                `&sr=4326&layers=${layer}&searchText=${encodeURIComponent(q)}`;
            }

            const res = await fetch(upstream, {
              headers: {
                Accept: "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Referer: "https://kataster.skgeodesy.sk/",
              },
            });
            if (!res.ok) continue;
            const data = (await res.json()) as {
              features?: Array<{ attributes: Record<string, unknown>; geometry: unknown }>;
              results?: Array<{
                layerId: number;
                layerName: string;
                attributes: Record<string, unknown>;
                geometry: unknown;
              }>;
            };

            const items = parcel
              ? (data.features || []).map((f) => ({
                  layerId: layer,
                  layerName: layer === 3 ? "Parcela C-KN" : layer === 8 ? "Parcela E-KN" : `Parcela ${layer}`,
                  attributes: f.attributes,
                  geometry: f.geometry,
                }))
              : (data.results || []).map((r) => ({
                  layerId: r.layerId,
                  layerName: r.layerName,
                  attributes: r.attributes,
                  geometry: r.geometry,
                }));

            for (const it of items.slice(0, 15)) {
              const a = it.attributes;
              const pick = (...names: string[]) => {
                for (const n of names) {
                  for (const k of Object.keys(a)) {
                    if (k.toLowerCase() === n.toLowerCase() && a[k] != null && String(a[k]).trim() !== "") {
                      return String(a[k]);
                    }
                  }
                }
                return "";
              };
              const cislo = pick("CISLO_PARCELY", "PARCELNE_CISLO", "CISLOPARCELY") || "?";
              const ku = pick("NAZOV_KU", "KATASTRALNE_UZEMIE", "NAZOVKU") || "";
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const geom: any = it.geometry;
              let lat = 0;
              let lng = 0;
              if (geom?.rings?.length) {
                // centroid-ish: average of first ring
                const ring: [number, number][] = geom.rings[0];
                let sx = 0;
                let sy = 0;
                for (const [x, y] of ring) {
                  sx += x;
                  sy += y;
                }
                lng = sx / ring.length;
                lat = sy / ring.length;
              } else if (geom?.x != null && geom?.y != null) {
                lng = geom.x;
                lat = geom.y;
              }
              results.push({
                layer: it.layerId,
                layerName: it.layerName,
                attributes: a,
                geometry: geom,
                lat,
                lng,
                label: `Parcela ${cislo}${ku ? " · k.ú. " + ku : ""}`,
                sublabel: it.layerName,
              });
            }
          }

          return json({ results });
        } catch (err) {
          return json({ error: "search_failed", detail: String(err) }, 502);
        }
      },
    },
  },
});
