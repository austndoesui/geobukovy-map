import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";

const BASE_LAYERS: Record<string, { url: string; maxZoom: number }> = {
  osm: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", maxZoom: 19 },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", maxZoom: 19 },
  topo: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", maxZoom: 19 },
  ortofoto: { url: "https://ofmozaika.tiles.freemap.sk/{z}/{x}/{y}.jpg", maxZoom: 20 },
};

const SK_BOUNDS = L.latLngBounds([47.4, 16.4], [49.9, 22.9]);

interface Owner {
  meno: string;
  adresa: string;
  podiel: string;
}

interface OwnerResult {
  lv: string;
  ku: string;
  kuName: string;
  parcelNo: string;
  owners: Owner[];
}

interface ParcelItem {
  parcelNo: string;
  ku: string;
  kuCode: string | null;
  lv: string | null;
  vymera: string | null;
  druh: string | null;
}

export const Route = createFileRoute("/print")({
  component: PrintPage,
  validateSearch: (search: Record<string, unknown>) => ({
    lat: Number(search.lat) || 48.7,
    lng: Number(search.lng) || 19.5,
    zoom: Number(search.zoom) || 10,
    base: (search.base as string) || "ortofoto",
    parcels: (() => {
      const p = search.parcels;
      if (!p) return [] as ParcelItem[];
      if (Array.isArray(p)) return p as ParcelItem[];
      if (typeof p === "string") try { return JSON.parse(p) as ParcelItem[]; } catch { return []; }
      return [] as ParcelItem[];
    })(),
  }),
});

function PrintPage() {
  const { lat, lng, zoom, base, parcels } = Route.useSearch();
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapReady, setMapReady] = useState(false);
  const [ownerResults, setOwnerResults] = useState<OwnerResult[]>([]);
  const [ownerLoading, setOwnerLoading] = useState(true);

  const p = parcels[0];
  const now = new Date();
  const dateStr = now.toLocaleDateString("sk-SK", { day: "numeric", month: "numeric", year: "numeric" });

  useEffect(() => {
    if (!mapRef.current) return;
    const cfg = BASE_LAYERS[base] || BASE_LAYERS.ortofoto;
    const map = L.map(mapRef.current, {
      center: [lat, lng],
      zoom,
      minZoom: 7,
      maxZoom: 22,
      zoomControl: false,
      attributionControl: false,
      maxBounds: SK_BOUNDS,
      maxBoundsViscosity: 1.0,
    });
    L.tileLayer(cfg.url, { maxZoom: cfg.maxZoom, noWrap: true }).addTo(map);
    L.control.scale({ position: "bottomright", imperial: false, maxWidth: 160 }).addTo(map);

    let tilesLoaded = 0;
    let tilesTotal = 0;
    const onLoad = () => { tilesLoaded++; if (tilesLoaded >= tilesTotal) setMapReady(true); };
    map.on("tileloadstart", () => { tilesTotal++; });
    map.on("tileload", onLoad);
    map.on("tileerror", onLoad);
    const fallback = setTimeout(() => setMapReady(true), 4000);

    return () => { clearTimeout(fallback); map.remove(); };
  }, [lat, lng, zoom, base]);

  useEffect(() => {
    if (parcels.length === 0) { setOwnerLoading(false); return; }
    const reqs: { kuCode: string; parcelNo: string }[] = [];
    for (const p of parcels) {
      if (p.kuCode) reqs.push({ kuCode: p.kuCode, parcelNo: p.parcelNo });
    }
    if (reqs.length === 0) { setOwnerLoading(false); return; }

    fetch("/api/public/kataster/owners-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests: reqs }),
    })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setOwnerResults(d.results || []); setOwnerLoading(false); })
      .catch(() => { setOwnerLoading(false); });
  }, [parcels]);

  const printedRef = useRef(false);
  useEffect(() => {
    if (!mapReady || ownerLoading || printedRef.current) return;
    printedRef.current = true;

    // Force tile images to reload from browser cache so print engine can see them
    const tiles = document.querySelectorAll<HTMLImageElement>(".leaflet-tile-loaded");
    tiles.forEach((t) => {
      const src = t.src;
      t.src = "";
      t.src = src;
    });

    const timer = setTimeout(() => window.print(), 1500);
    return () => clearTimeout(timer);
  }, [mapReady, ownerLoading]);

  const getOwners = (parcelNo: string) => ownerResults.find((r) => r.parcelNo === parcelNo)?.owners;

  const hasPage2 = parcels.length > 0;
  const hasOwners = ownerResults.some((r) => r.owners.length > 0);

  const ready = mapReady && !ownerLoading;

  return (
    <div className="print-root">
      {/* Page 1 — Map */}
      <div className="print-page">
        <div className="ph">
          <div className="ph-l">
            <div className="ph-title">GeoBukový — Mapový portál</div>
            <div className="ph-sub">
              {p
                ? `Parcela ${p.parcelNo}${p.ku ? ` · k.ú. ${p.ku}` : ""}${p.lv ? ` · LV ${p.lv}` : ""}`
                : "Mapový výpis"}
            </div>
          </div>
          <div className="ph-r">{dateStr}</div>
        </div>

        <div className="pmw">
          {!mapReady && (
            <div className="p-load">
              <div className="p-spin" />
              <span>Načítavam mapu…</span>
            </div>
          )}
          <div ref={mapRef} className="pm" style={{ opacity: mapReady ? 1 : 0 }} />
        </div>

        {p && (
          <div className="ps">
            {p.lv && (
              <div className="psi">
                <span className="psl">LV</span>
                <span className="psv">{p.lv}</span>
              </div>
            )}
            {p.vymera && (
              <div className="psi">
                <span className="psl">Výmera</span>
                <span className="psv">{Number(p.vymera).toLocaleString("sk-SK")} m²</span>
              </div>
            )}
            {p.druh && (
              <div className="psi">
                <span className="psl">Druh</span>
                <span className="psv">{p.druh}</span>
              </div>
            )}
          </div>
        )}

        <div className="pf">
          <span className="pf-l">© ÚGKK SR, Freemap.sk · Nepoužiteľné na právne úkony</span>
          <span className="pf-r">{hasPage2 ? "1/2" : "1/1"}</span>
        </div>
      </div>

      {/* Page 2 — Details + Owners */}
      {hasPage2 && (
        <div className="print-page pp2">
          <div className="ph">
            <div className="ph-l">
              <div className="ph-title">GeoBukový — Mapový portál</div>
            </div>
            <div className="ph-r">{dateStr}</div>
          </div>

          {parcels.map((parcel, i) => (
            <div key={i} className="pp-sec">
              <h3 className="pps-h">Parcela {parcel.parcelNo}</h3>
              <div className="pdg">
                <D label="Číslo parcely" v={parcel.parcelNo} />
                <D label="Katastrálne územie" v={parcel.ku} />
                {parcel.lv && <D label="List vlastníctva" v={parcel.lv} />}
                {parcel.vymera && <D label="Výmera" v={`${Number(parcel.vymera).toLocaleString("sk-SK")} m²`} />}
                {parcel.druh && <D label="Druh pozemku" v={parcel.druh} />}
              </div>

              {!ownerLoading && (
                <div className="pp-own">
                  <h3 className="pps-h">Vlastníci</h3>
                  {(() => {
                    const owners = getOwners(parcel.parcelNo);
                    if (!owners || owners.length === 0) return <div className="pp-none">Nenašli sa žiadni vlastníci</div>;
                    return (
                      <div className="ppo">
                        {owners.map((o, j) => (
                          <div key={j} className="ppo-row">
                            <span className="ppo-n">{j + 1}.</span>
                            <div>
                              <div className="ppo-name">{o.meno}</div>
                              <div className="ppo-meta">{o.adresa} · Podiel: {o.podiel}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}

          {ownerLoading && (
            <div className="p-load p-load-sm">
              <div className="p-spin" />
              <span>Načítavam údaje o vlastníkoch…</span>
            </div>
          )}

          {!ready && !ownerLoading && (
            <div className="pp-none">Dokončuje sa načítanie údajov…</div>
          )}

          <div className="pp-bottom">
            <div className="pp-notice">
              <div className="ppn-line">Údaje platné k: {dateStr}</div>
              <div className="ppn-line">
                Meranie a grafické znázornenie je len informatívne a je nepoužiteľné na
                vytýčenie hraníc pozemkov a osadenie stavieb na pozemky. Vytýčenie hraníc
                pozemkov a osadenie stavieb na pozemky môže vykonať len odborne spôsobilá osoba.
              </div>
            </div>
            <div className="pf">
              <span className="pf-l">© ÚGKK SR, Freemap.sk · Nepoužiteľné na právne úkony</span>
              <span className="pf-r">2/2</span>
            </div>
          </div>
        </div>
      )}

      <div className="ptb">
        <button className="ptbb" onClick={() => window.close()}>Zatvoriť</button>
        <button className="ptbb ptbb-p" onClick={() => window.print()}>Tlačiť</button>
      </div>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        @page { size: A4 portrait; margin: 0; }

        @media print {
          html, body { margin: 0; padding: 0; width: 210mm; }
          .print-root { width: 210mm; }
          .ptb { display: none !important; }
          .print-root,
          .print-page { display: flex; flex-direction: column; }
          .print-page { width: 210mm; min-height: 297mm; padding: 8mm 10mm 6mm 10mm; }
          .pp2 { page-break-before: always; }
          .pmw { flex: 1; min-height: 0; position: relative; border: 1px solid #bbb; background: #eaeaea; }
          .pm { width: 100%; height: 100%; position: absolute; inset: 0; }
          .p-load { display: none !important; }
          .leaflet-control-scale { display: block !important; }
          img, .leaflet-tile-pane img { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }

        @media screen {
          body {
            margin: 0; padding: 0;
            background: #e2e2e2;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1a1a1a;
          }
          .print-root {
            display: flex; flex-direction: column; align-items: center;
            padding: 24px 16px; gap: 28px;
          }
          .print-page {
            width: 210mm; background: white; box-shadow: 0 2px 16px rgba(0,0,0,0.15);
            border-radius: 2px; display: flex; flex-direction: column;
            min-height: 297mm; padding: 6mm 8mm 5mm 8mm;
          }
        }

        .print-page, .print-root { display: flex; flex-direction: column; }

        .ph {
          display: flex; justify-content: space-between; align-items: flex-start;
          padding-bottom: 10px; border-bottom: 2.5px solid #1e3a5f; margin-bottom: 12px;
        }
        .ph-title { font-size: 20px; font-weight: 700; color: #1e3a5f; line-height: 1.3; }
        .ph-sub { font-size: 15px; color: #555; margin-top: 3px; }
        .ph-r { font-size: 14px; color: #666; white-space: nowrap; margin-top: 4px; }

        .pmw {
          flex: 1; min-height: 0; position: relative; background: #eaeaea;
          border: 1px solid #bbb; margin: 4px 0;
        }
        .pm { width: 100%; height: 100%; position: absolute; inset: 0; transition: opacity 0.4s; }
        .pm .leaflet-container { width: 100%; height: 100%; background: #e8e8e8; }

        .p-load {
          position: absolute; inset: 0; display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 10px; z-index: 10;
          background: #f5f5f5; color: #555; font-size: 15px;
        }
        .p-load-sm { position: static; padding: 20px; gap: 6px; font-size: 14px; border: 1px solid #ddd; border-radius: 4px; margin: 8px 0; }
        .p-spin { width: 30px; height: 30px; border: 3px solid #ddd; border-top-color: #1e3a5f; border-radius: 50%; animation: pspin 0.8s linear infinite; }
        @keyframes pspin { to { transform: rotate(360deg); } }

        .ps {
          display: flex; gap: 0; margin-top: 8px; border: 1px solid #bbb; border-radius: 4px; overflow: hidden;
        }
        .psi {
          flex: 1; display: flex; flex-direction: column; align-items: center;
          padding: 8px 10px; border-right: 1px solid #bbb; background: #fafafa;
        }
        .psi:last-child { border-right: none; }
        .psl { font-size: 12px; text-transform: uppercase; color: #777; letter-spacing: 0.5px; }
        .psv { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-top: 4px; }

        .pp-bottom { margin-top: auto; }
        .pf {
          display: flex; justify-content: space-between; align-items: center;
          padding-top: 8px; border-top: 1px solid #bbb; font-size: 12px; color: #777;
        }
        .pf-r { font-weight: 600; color: #555; }

        .pp2 { gap: 0; }
        .pp-sec { margin-top: 18px; }
        .pp-sec:first-of-type { margin-top: 10px; }
        .pps-h { font-size: 17px; font-weight: 700; color: #1e3a5f; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 0.5px; }

        .pdg { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; border: 1px solid #bbb; border-radius: 4px; padding: 14px 16px; background: #fafafa; }
        .pdgr { display: flex; padding: 4px 0; }
        .pdgl { font-size: 15px; color: #666; min-width: 110px; }
        .pdgv { font-size: 16px; font-weight: 500; color: #1a1a1a; }

        .pp-own { margin-top: 18px; }
        .ppo { border: 1px solid #bbb; border-radius: 4px; padding: 8px 0; }
        .ppo-row { display: flex; gap: 10px; padding: 8px 12px; border-bottom: 1px solid #eee; }
        .ppo-row:last-child { border-bottom: none; }
        .ppo-n { font-size: 15px; font-weight: 600; color: #1e3a5f; min-width: 24px; }
        .ppo-name { font-size: 16px; font-weight: 500; }
        .ppo-meta { font-size: 14px; color: #555; margin-top: 2px; }
        .pp-none { font-size: 14px; color: #888; font-style: italic; padding: 10px 0; }

        .pp-notice {
          padding-top: 8px; border-top: 1px solid #bbb;
        }
        .ppn-line { font-size: 12px; color: #777; line-height: 1.5; margin-top: 2px; }

        .ptb {
          display: flex; gap: 10px;
        }
        .ptbb {
          border: 1px solid #ccc; background: white; border-radius: 6px;
          padding: 10px 24px; font-size: 15px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.1);
        }
        .ptbb:hover { background: #f0f0f0; }
        .ptbb-p { background: #1e3a5f; color: white; border-color: #1e3a5f; }
        .ptbb-p:hover { opacity: 0.9; }
      `}</style>
    </div>
  );
}

function D({ label, v }: { label: string; v: string }) {
  return (
    <div className="pdgr">
      <span className="pdgl">{label}</span>
      <span className="pdgv">{v}</span>
    </div>
  );
}
