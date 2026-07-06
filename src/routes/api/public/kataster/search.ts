import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const UA = "GeodetApp/1.0 (parcel-search)";
const PLAYWRIGHT_URL = process.env.PLAYWRIGHT_SERVICE_URL || "http://localhost:3001";
const WFS_URL = "https://inspirews.skgeodesy.sk/geoserver/cp/ows";
const ZBGIS_SUGGEST_URL = "https://zbgis.skgeodesy.sk/mapka/api/suggest/kataster";

const WMS_UPSTREAMS = [
  "https://kataster.skgeodesy.sk/eskn/services/NR/kn_wms_norm/MapServer/WMSServer",
  "https://kataster.skgeodesy.sk/eskn/services/BA/kn_wms_norm/MapServer/WMSServer",
  "https://kataster.skgeodesy.sk/eskn/services/KE/kn_wms_norm/MapServer/WMSServer",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });
}

interface SearchItem {
  lat: number;
  lng: number;
  label: string;
  sublabel: string;
  parcelNo: string;
  ku: string;
  kuCode: string;
  lvNumber: string;
  layerName?: string;
  source: "nominatim" | "wms" | "playwright" | "wfs" | "zbgis";
  attributes?: Record<string, string>;
}

const kuNameCache: Record<string, string> = {};

async function resolveKuName(kuCode: string): Promise<string> {
  if (kuNameCache[kuCode]) return kuNameCache[kuCode];
  try {
    const cql = `nationalCadastalZoningReference='${kuCode}'`;
    const url = `${WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeNames=cp:CP.CadastralZoning&count=1&outputFormat=application/json&cql_filter=${encodeURIComponent(cql)}`;
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return kuCode;
    const data = (await res.json()) as { features?: Array<{ properties?: { label?: string } }> };
    const name = data.features?.[0]?.properties?.label;
    if (name) {
      kuNameCache[kuCode] = name;
      return name;
    }
  } catch {
    // fall through
  }
  return kuCode;
}

async function wfsToItems(data: { features?: Array<{ properties?: { label?: string; nationalCadastralReference?: string; referencePoint?: { coordinates?: [number, number] }; areaValue?: { value?: number }; inspireId?: { localId?: string } } }> }): Promise<SearchItem[]> {
  if (!data.features?.length) return [];
  const kuCodes = new Set<string>();
  for (const f of data.features) {
    const kc = (f.properties?.nationalCadastralReference || "").split("_")[0] || "";
    if (kc) kuCodes.add(kc);
  }
  await Promise.all([...kuCodes].map((code) => resolveKuName(code)));
  const results: SearchItem[] = [];
  const seen = new Set<string>();
  for (const f of data.features) {
    const props = f.properties;
    if (!props?.label) continue;
    const kc = (props.nationalCadastralReference || "").split("_")[0] || "";
    const kn = kuNameCache[kc] || kc;
    const coord = props.referencePoint?.coordinates || [0, 0];
    const av = props.areaValue?.value;
    const key = `${kc}_${props.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({
      lat: coord[1], lng: coord[0],
      label: `Parcela ${props.label} · k.ú. ${kn}`,
      sublabel: av ? `${av} m²` : kc,
      parcelNo: props.label, ku: kn, kuCode: kc, lvNumber: "",
      layerName: "CP.CadastralParcel", source: "wfs",
      attributes: {
        "Číslo parcely": props.label,
        "Názov katastrálneho územia": kn,
        "Kód katastrálneho územia": kc,
        "Výmera": av ? String(av) : "",
        "INSPIRE ID": props.inspireId?.localId || "",
      },
    });
  }
  return results;
}

async function wfsSearch(parcelNo: string): Promise<SearchItem[]> {
  const cql = `label='${parcelNo.replace(/'/g, "''")}'`;
  const url = `${WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeNames=cp:CP.CadastralParcel&count=15&outputFormat=application/json&cql_filter=${encodeURIComponent(cql)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    return wfsToItems(await res.json());
  } catch {
    return [];
  }
}

async function wfsSearchFlex(parcelMain: string, parcelSub: string | null): Promise<SearchItem[]> {
  const exact = parcelSub ? `${parcelMain}/${parcelSub}` : parcelMain;
  const [exactResults, likeResults] = await Promise.all([
    wfsSearch(exact),
    !parcelSub
      ? (async () => {
          const cql = `label LIKE '${parcelMain.replace(/'/g, "''")}/%'`;
          const url = `${WFS_URL}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&typeNames=cp:CP.CadastralParcel&count=10&outputFormat=application/json&cql_filter=${encodeURIComponent(cql)}`;
          try {
            const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(15000) });
            if (!res.ok) return [] as SearchItem[];
            return wfsToItems(await res.json());
          } catch { return [] as SearchItem[]; }
        })()
      : (Promise.resolve([] as SearchItem[])),
  ]);
  const merged = [...exactResults];
  const seen = new Set(merged.map((r) => `${r.kuCode}_${r.parcelNo}`));
  for (const r of likeResults) {
    const key = `${r.kuCode}_${r.parcelNo}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(r);
  }
  return merged;
}

async function nominatimSearch(q: string): Promise<Array<{ lat: number; lng: number; displayName: string; osmType: string }>> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=8&countrycodes=sk`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string; osm_type: string }>;
    return data.map((d) => ({
      lat: parseFloat(d.lat),
      lng: parseFloat(d.lon),
      displayName: d.display_name,
      osmType: d.osm_type,
    }));
  } catch {
    return [];
  }
}

const ZBGIS_AREAS: Record<string, string> = {};

async function zbgisSuggest(q: string): Promise<Array<{ text: string; lat: number; lng: number; description: string }>> {
  try {
    const res = await fetch(`${ZBGIS_SUGGEST_URL}?q=${encodeURIComponent(q)}`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      items?: Array<{
        data?: {
          category?: string;
          text?: string;
          description?: string;
          extent?: { coordinates?: [[number, number], [number, number]] };
        };
      }>;
    };
    if (!data.items?.length) return [];
    const out: Array<{ text: string; lat: number; lng: number; description: string }> = [];
    for (const item of data.items) {
      const d = item.data;
      if (d?.category !== "adresa") continue;
      const coords = d.extent?.coordinates;
      if (!coords?.length) continue;
      const pair = coords[0];
      if (!pair || pair.length < 2) continue;
      out.push({ text: d.text || "", lat: pair[1], lng: pair[0], description: d.description || "" });
    }
    return out;
  } catch {
    return [];
  }
}

async function wmsIdentify(lat: number, lng: number): Promise<SearchItem | null> {
  const buf = 0.001;
  const bbox = `${lat - buf},${lng - buf},${lat + buf},${lng + buf}`;
  const qs =
    `SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo` +
    `&LAYERS=5,8&QUERY_LAYERS=5,8&I=250&J=250&WIDTH=501&HEIGHT=501` +
    `&BBOX=${bbox}&CRS=EPSG:4326&INFO_FORMAT=application%2Fgeo%2Bjson&FEATURE_COUNT=5`;

  for (const base of WMS_UPSTREAMS) {
    try {
      const res = await fetch(`${base}?${qs}`, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": UA, Referer: "https://kataster.skgeodesy.sk/" },
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { features?: Array<{ properties: Record<string, unknown>; layerName?: string }> };
      const feature = data?.features?.find((f) => /parcela.*c/i.test(f.layerName || ""));
      if (feature) {
        const p = feature.properties;
        const keys = Object.keys(p);
        const findKey = (matcher: (k: string) => boolean): string => {
          const k = keys.find(matcher);
          return k && p[k] != null && String(p[k]).trim() !== "" ? String(p[k]) : "";
        };
        const parcelNo = findKey((k) => /parcely/i.test(k) || /parcelne/i.test(k) || /parcela/i.test(k));
        const kuName = findKey((k) => /názov.*katastr|katastr.*názov|nazov.*katastr|katastr.*nazov/i.test(k));
        const kuCode = findKey((k) => /kód.*katastr|kod.*katastr/i.test(k) || /k\.ú\.?\s*kód/i.test(k));
        const lvNumber = findKey((k) => /list.*vlastn|cislo.*list/i.test(k) || /číslo.*list/i.test(k));
        const areaVal = findKey((k) => /vymera/i.test(k) || /výmera/i.test(k));
        return {
          lat, lng,
          label: `Parcela ${parcelNo} · k.ú. ${kuName}`,
          sublabel: `LV ${lvNumber}`,
          parcelNo, ku: kuName, kuCode, lvNumber,
          layerName: feature.layerName,
          source: "wms" as const,
          attributes: Object.fromEntries(
            keys.map((k) => [k, String(p[k] ?? "")])
          ),
        };
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function overpassFindHouseNumber(
  centerLat: number, centerLng: number,
  number: string
): Promise<{ lat: number; lng: number; street?: string; housenumber?: string; city?: string } | null> {
  const bbox = `${centerLat - 0.04},${centerLng - 0.04},${centerLat + 0.04},${centerLng + 0.04}`;
  const q = `[out:json];(node(${bbox})[~"addr:housenumber"~"${number.replace(/"/g, '\\"')}"];way(${bbox})[~"addr:housenumber"~"${number.replace(/"/g, '\\"')}"];);out center 1;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(q)}`,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { elements?: Array<{ lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }> };
    const el = data.elements?.[0];
    if (!el) return null;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (lat != null && lng != null) {
      return {
        lat, lng,
        street: el.tags?.["addr:street"],
        housenumber: el.tags?.["addr:housenumber"] || el.tags?.["addr:conscriptionnumber"],
        city: el.tags?.["addr:city"],
      };
    }
  } catch { /* ignore */ }
  return null;
}

function parseParcelNumber(s: string): { main: string; sub: string | null } | null {
  const m = s.trim().match(/^(\d{1,6})(?:\s*[/-]\s*(\d{1,6}))?$/);
  if (!m) return null;
  return { main: m[1], sub: m[2] ?? null };
}

function isParcelOnlyQuery(q: string): boolean {
  return /^[\d\s/-]{1,15}$/.test(q.trim());
}

function extractParcelNumbers(q: string): string[] {
  const nums: string[] = [];
  const compound = q.match(/\b(\d{1,6})\s*[/-]\s*(\d{1,6})\b/);
  if (compound) nums.push(`${compound[1]}/${compound[2]}`);
  const simples = q.match(/\b(\d{1,6})\b/g);
  if (simples) {
    for (const s of simples) {
      const val = s.replace(/^0+/, "") || s;
      if (!nums.some((n) => n.split("/")[0] === val)) nums.push(val);
    }
  }
  return nums;
}

function formatAddress(displayName: string): { label: string; sublabel: string } {
  const idx = displayName.indexOf(", okres ");
  if (idx === -1) return { label: displayName, sublabel: "" };
  const okresEnd = displayName.indexOf(",", idx + 8);
  return {
    label: displayName.slice(0, idx),
    sublabel: okresEnd === -1 ? displayName.slice(idx + 2) : displayName.slice(idx + 2, okresEnd),
  };
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

          const results: SearchItem[] = [];
          const seen = new Set<string>();
          const extracted = extractParcelNumbers(q);

          // Phase 1: Run all data sources in parallel
          const [zbgisResults, wfsResults, geoResults] = await Promise.all([
            zbgisSuggest(q),
            (async () => {
              for (const parcelVal of extracted) {
                const parsed = parseParcelNumber(parcelVal);
                if (parsed) {
                  const hits = await wfsSearchFlex(parsed.main, parsed.sub);
                  if (hits.length > 0) return hits;
                }
              }
              return [] as SearchItem[];
            })(),
            // Nominatim only needed when ZBGIS has no results
            Promise.resolve([] as Array<{ lat: number; lng: number; displayName: string; osmType: string }>),
          ]);

          // Phase 2: ZBGIS address results → WMS identify → parcel + LV
          // Only ZBGIS results shown here; WFS/Nominatim used only when ZBGIS finds nothing
          if (zbgisResults.length > 0) {
            for (const zr of zbgisResults) {
              const key = `${zr.lat.toFixed(4)},${zr.lng.toFixed(4)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              const wms = await wmsIdentify(zr.lat, zr.lng);
              const okres = zr.description.startsWith("okres ") ? zr.description : `okres ${zr.description}`;
              if (wms) {
                results.push({ ...wms, label: zr.text, sublabel: okres, source: "zbgis" });
              } else {
                results.push({
                  lat: zr.lat, lng: zr.lng,
                  label: zr.text, sublabel: okres,
                  parcelNo: "", ku: "", kuCode: "", lvNumber: "", source: "zbgis",
                });
              }
            }
          }

          // Phase 3: No ZBGIS results → fallback to Overpass + Nominatim + WMS
          if (zbgisResults.length === 0) {
            let geoData = geoResults;
            if (geoData.length === 0) {
              geoData = await nominatimSearch(q);
            }

            const firstNumber = extracted[0] || "";
            const overpassCoords = geoData.length > 0 && firstNumber
              ? await overpassFindHouseNumber(geoData[0].lat, geoData[0].lng, firstNumber)
              : null;

            if (overpassCoords) {
              const key = `${overpassCoords.lat.toFixed(4)},${overpassCoords.lng.toFixed(4)}`;
              if (!seen.has(key)) {
                seen.add(key);
                const wms = await wmsIdentify(overpassCoords.lat, overpassCoords.lng);
                if (wms) {
                  let label: string;
                  if (overpassCoords.street && overpassCoords.housenumber) {
                    const parts = [overpassCoords.street, overpassCoords.housenumber].join(" ");
                    label = overpassCoords.city ? `${parts}, ${overpassCoords.city}` : parts;
                  } else {
                    label = formatAddress(geoData[0].displayName).label;
                  }
                  const sublabel = formatAddress(geoData[0].displayName).sublabel;
                  results.push({ ...wms, label, sublabel, source: "wms" });
                }
              }
            }

            if (!overpassCoords) {
              for (const geo of geoData) {
                if (seen.has(`${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}`)) continue;
                seen.add(`${geo.lat.toFixed(4)},${geo.lng.toFixed(4)}`);
                const wms = await wmsIdentify(geo.lat, geo.lng);
                if (wms) {
                  const { label, sublabel } = formatAddress(geo.displayName);
                  results.push({ ...wms, label, sublabel, source: "nominatim" });
                } else {
                  const { label, sublabel } = formatAddress(geo.displayName);
                  results.push({
                    lat: geo.lat, lng: geo.lng,
                    label,
                    sublabel,
                    parcelNo: "", ku: "", kuCode: "", lvNumber: "", source: "nominatim",
                  });
                }
              }
            }

            const targetKuCode = overpassCoords
              ? results.find((r) => r.kuCode)?.kuCode
              : null;
            for (const r of wfsResults) {
              if (targetKuCode && r.kuCode !== targetKuCode) continue;
              const key = `${r.kuCode}_${r.parcelNo}`;
              if (seen.has(key)) continue;
              seen.add(key);
              results.push(r);
            }
          }

          // Phase 4: Parcel-only with no results → Playwright fallback
          if (results.length === 0 && isParcelOnlyQuery(q)) {
            const parcel = parseParcelNumber(q);
            if (parcel) {
              const parcelVal = parcel.sub ? `${parcel.main}/${parcel.sub}` : parcel.main;
              try {
                const pwRes = await fetch(PLAYWRIGHT_URL + "/api/search", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ parcelNo: parcelVal }),
                  signal: AbortSignal.timeout(25000),
                });
                if (pwRes.ok) {
                  const pwData = (await pwRes.json()) as {
                    results?: Array<{ lvNumber: string; kuCode: string; kuName: string; parcelNo: string }>;
                    captchaDetected?: boolean;
                  };
                  if (pwData.captchaDetected) {
                    results.push({
                      lat: 0, lng: 0, label: "Captcha potrebná — otvorte VNC a vyriešte captchu",
                      sublabel: "Portál ESKN vyžaduje overenie",
                      parcelNo: "", ku: "", kuCode: "", lvNumber: "", source: "playwright",
                    });
                  } else if (pwData.results?.length) {
                    for (const r of pwData.results) {
                      results.push({
                        lat: 0, lng: 0,
                        label: `LV ${r.lvNumber} · ${r.kuName} (${r.kuCode})`,
                        sublabel: r.parcelNo ? `Parcela ${r.parcelNo}` : "",
                        parcelNo: r.parcelNo, ku: r.kuName, kuCode: r.kuCode, lvNumber: r.lvNumber,
                        source: "playwright",
                      });
                    }
                  }
                }
              } catch {
                // Playwright unavailable
              }
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
