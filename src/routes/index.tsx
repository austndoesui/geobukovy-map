import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Layers,
  Locate,
  Plus,
  Minus,
  MapPin,
  Map as MapIcon,
  Mountain,
  Satellite,
  X,
  Loader2,
  Shield,
  LogIn,
  ExternalLink,
  Square,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import logo from "@/assets/logo-removebg-preview.png";
import type { MapMarker, MapViewHandle, ParcelInfo } from "@/components/MapView";
import { checkSession, logout, type Session } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GeoBukový — Mapový portál Slovensko" },
      {
        name: "description",
        content:
          "Mapový portál pre Slovensko — kataster nehnuteľností, ortofotomapy, parcely a vyhľadávanie adries. GeoBukový — geodetická kancelária GEO2.",
      },
      { property: "og:title", content: "GeoBukový — Mapový portál" },
      {
        property: "og:description",
        content: "Mapový portál pre kataster a geodetické služby na Slovensku.",
      },
    ],
  }),
  component: Portal,
});

const MapView = lazy(() => import("@/components/MapView"));

type BaseLayer = "osm" | "satellite" | "topo" | "ortofoto";

interface PlaceHit {
  kind: "place";
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
}
interface ParcelHit {
  kind: "parcel";
  id: string;
  lat: number;
  lng: number;
  title: string;
  subtitle: string;
  layerName: string;
  rawAttributes?: Record<string, unknown>;
}
type Hit = PlaceHit | ParcelHit;

const PARCEL_TOKEN = /\b\d{1,6}(?:\s*[/-]\s*\d{1,4})?\b/;

function Portal() {
  const mapRef = useRef<MapViewHandle>(null);
  const [mounted, setMounted] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [base, setBase] = useState<BaseLayer>("ortofoto");

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [marker, setMarker] = useState<MapMarker | null>(null);
  const [selectedParcel, setSelectedParcel] = useState<ParcelInfo | null>(null);
  const selectedParcelRef = useRef(selectedParcel);
  selectedParcelRef.current = selectedParcel;

  const [selectionMode, setSelectionMode] = useState(false);
  const [multiParcels, setMultiParcels] = useState<Record<string, unknown>[]>([]);
  const [multiLoading, setMultiLoading] = useState(false);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [showHits, setShowHits] = useState(false);
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setShowHits(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setMounted(true);
    checkSession().then((s) => {
      setSession(s);
      setAuthLoading(false);
      if (!s) navigate({ to: "/login" });
    });
  }, [navigate]);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setHits(null);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);

    const looksLikeParcel = PARCEL_TOKEN.test(q);

    const placesPromise = (async () => {
      try {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("q", q);
        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "6");
        url.searchParams.set("countrycodes", "sk");
        url.searchParams.set("accept-language", "sk");
        const res = await fetch(url.toString(), { signal: ctrl.signal });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data: any[] = await res.json();
        return data.map<PlaceHit>((h) => ({
          kind: "place",
          id: `p-${h.place_id}`,
          lat: parseFloat(h.lat),
          lng: parseFloat(h.lon),
          title: h.display_name.split(",")[0],
          subtitle: h.display_name,
        }));
      } catch {
        return [] as PlaceHit[];
      }
    })();

    const parcelPromise = looksLikeParcel
      ? (async () => {
          try {
            const ku = selectedParcelRef.current?.ku || "";
            const res = await fetch(
              `/api/public/kataster/search?q=${encodeURIComponent(q)}${ku ? `&ku=${encodeURIComponent(ku)}` : ""}`,
              { signal: ctrl.signal },
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const data: any = await res.json();
            const arr = Array.isArray(data?.results) ? data.results : [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (arr as any[]).map((r, i): ParcelHit => ({
              kind: "parcel",
              id: `k-${i}-${r.layer}`,
              lat: r.lat,
              lng: r.lng,
              title: r.label,
              subtitle: r.sublabel || r.layerName,
              layerName: r.layerName,
              rawAttributes: r.attributes || {},
            }));
          } catch {
            return [] as ParcelHit[];
          }
        })()
      : Promise.resolve<ParcelHit[]>([]);

    try {
      const [places, parcels] = await Promise.all([placesPromise, parcelPromise]);
      if (ctrl.signal.aborted) return;
      setHits(parcels.length > 0 ? parcels : [...parcels, ...places]);
      setShowHits(true);
    } finally {
      if (!ctrl.signal.aborted) setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setHits(null);
      return;
    }
    debounceRef.current = window.setTimeout(() => runSearch(query), 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const pickHit = async (h: Hit) => {
    setMarker({ lat: h.lat, lng: h.lng, label: h.title, zoom: h.kind === "parcel" ? 18 : 17 });
    setShowHits(false);
    setQuery(h.title);

    const buildParcelInfo = (info: {
      parcelNo: string;
      ku: string;
      lv: string | null;
      vymera: string | null;
      druh: string | null;
      layer: string;
      rawAttributes: Record<string, unknown>;
    }) => ({
      parcelNo: info.parcelNo,
      ku: info.ku,
      lv: info.lv,
      vymera: info.vymera,
      druh: info.druh,
      layer: info.layer,
      lat: h.lat,
      lng: h.lng,
      zbgisUrl: `https://zbgis.skgeodesy.sk/mkzbgis/sk/kataster?pos=${h.lat.toFixed(6)},${h.lng.toFixed(6)},19&bm=zbgis&sc_p=kn`,
      rawAttributes: info.rawAttributes,
    });

    const a = h.kind === "parcel" ? (h.rawAttributes || {}) : {};
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        for (const key of Object.keys(a)) {
          if (key.toLowerCase().includes(k.toLowerCase()) && a[key] != null && String(a[key]).trim() !== "") {
            return String(a[key]);
          }
        }
      }
      return null;
    };

    const parcelNo = pick("číslo parcely", "parcelné číslo", "cislo_parcely", "parcelné", "parcelne");
    const ku = pick("názov katastrálneho", "názov_ku", "nazov_ku");

    if (parcelNo && ku) {
      setSelectedParcel(buildParcelInfo({
        parcelNo: parcelNo,
        ku: ku,
        lv: pick("list vlastníctva", "listu vlastníctva", "číslo listu", "cislo_lv", "list vlast"),
        vymera: pick("vymera", "výmera"),
        druh: pick("druh pozemku", "druh_pozemku", "druh"),
        layer: h.kind === "parcel" ? h.layerName : "Parcela",
        rawAttributes: a,
      }));
      return;
    }

    // Fallback: call WMS identify at these coordinates
    try {
      const buf = 0.001;
      const bbox = `${h.lat - buf},${h.lng - buf},${h.lat + buf},${h.lng + buf}`;
      const qs =
        `SERVICE=WMS&VERSION=1.3.0&REQUEST=GetFeatureInfo` +
        `&LAYERS=5,8&QUERY_LAYERS=5,8&I=250&J=250&WIDTH=501&HEIGHT=501` +
        `&BBOX=${bbox}&CRS=EPSG:4326&INFO_FORMAT=application%2Fgeo%2Bjson&FEATURE_COUNT=3`;
      const res = await fetch(`/api/public/kataster/identify?${qs}`);
      if (res.ok) {
        const data: { features?: Array<{ geometry?: unknown; properties: Record<string, unknown>; layerName?: string }> } = await res.json();
        const feature = data?.features?.find((f) => /parcel/i.test(f.properties?.LAYER_NAME as string || ""));
        if (feature) {
          const props = feature.properties;
          const pickProp = (...keys: string[]) => {
            for (const k of keys) {
              for (const key of Object.keys(props)) {
                if (key.toLowerCase().includes(k.toLowerCase()) && props[key] != null && String(props[key]).trim() !== "") {
                  return String(props[key]);
                }
              }
            }
            return null;
          };
          const pn = pickProp("číslo parcely", "parcelné číslo", "cislo_parcely", "parcelné", "parcelne") || "—";
          const kn = pickProp("názov katastrálneho", "názov_ku", "nazov_ku") || "—";
          setSelectedParcel(buildParcelInfo({
            parcelNo: pn,
            ku: kn,
            lv: pickProp("list vlastníctva", "listu vlastníctva", "číslo listu", "cislo_lv", "list vlast"),
            vymera: pickProp("vymera", "výmera"),
            druh: pickProp("druh pozemku", "druh_pozemku", "druh"),
            layer: feature.properties?.LAYER_NAME as string || feature.layerName || "Parcela",
            rawAttributes: props,
          }));
          return;
        }
      }
    } catch {
      // identify failed — show basic info
    }

    setSelectedParcel(buildParcelInfo({
      parcelNo: parcelNo || "—",
      ku: ku || "—",
      lv: null,
      vymera: null,
      druh: null,
      layer: h.kind === "parcel" ? h.layerName : "Parcela",
      rawAttributes: a,
    }));
  };

  const handleParcelSelect = useCallback((info: ParcelInfo) => {
    setSelectedParcel(info);
  }, []);

  const locateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (latitude >= 47.4 && latitude <= 49.9 && longitude >= 16.4 && longitude <= 22.9) {
          setMarker({ lat: latitude, lng: longitude, label: "Vaša poloha", zoom: 15 });
        } else {
          // eslint-disable-next-line no-alert
          alert("Vaša poloha je mimo územia Slovenska.");
        }
      },
      () => {
        // eslint-disable-next-line no-alert
        alert("Polohu sa nepodarilo získať.");
      },
    );
  };

  const backToSearch = useCallback(() => {
    setSelectedParcel(null);
    setMultiParcels([]);
    mapRef.current?.clearParcel();
  }, []);

  const handleAreaSelect = useCallback(async (bbox: { south: number; west: number; north: number; east: number }) => {
    setMultiLoading(true);
    setSelectionMode(false);
    try {
      const res = await fetch(
        `/api/public/kataster/parcels-by-bbox?south=${bbox.south}&west=${bbox.west}&north=${bbox.north}&east=${bbox.east}`,
      );
      const data = await res.json();
      setMultiParcels(data.parcels || []);
      setSelectedParcel(null);
      setMarker(null);
    } catch {
      setMultiParcels([]);
    } finally {
      setMultiLoading(false);
    }
  }, []);

  if (authLoading) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return null;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-[1000] flex h-14 items-center border-b border-border bg-surface">
        <a
          href="https://geobukovy.sk"
          className="flex h-full shrink-0 items-center gap-2.5 border-r border-border px-4"
        >
          <img src={logo} alt="GEO2" className="h-9 w-9 object-contain" />
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold tracking-tight">GeoBukový</div>
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Mapový portál · Slovensko
            </div>
          </div>
        </a>

        {/* Search */}
        <div className="flex flex-1 items-center justify-center px-4">
          <div ref={searchWrapRef} className="relative w-full max-w-[560px]">
            {searching ? (
              <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : (
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => hits && setShowHits(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hits && hits.length > 0) pickHit(hits[0]);
                if (e.key === "Escape") setShowHits(false);
              }}
              placeholder="Hľadať parcelu, obec, ulicu alebo adresu…"
              className="h-10 w-full rounded-md border border-border bg-surface-2 pl-9 pr-9 text-[13.5px] placeholder:text-muted-foreground/60 focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ring/25"
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  setHits(null);
                  setShowHits(false);
                  if (selectedParcel) backToSearch();
                }}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Vymazať"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}

            {showHits && hits && (
              <div className="absolute left-0 right-0 top-full z-[1001] mt-1.5 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-surface">
                {hits.length === 0 ? (
                  <div className="px-3 py-4 text-center text-[12.5px] text-muted-foreground">
                    Žiadne výsledky pre „{query}"
                  </div>
                ) : (
                  hits.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => pickHit(h)}
                      className="flex w-full items-start gap-2.5 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-muted"
                    >
                      <MapPin className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${h.kind === "parcel" ? "text-red-600" : "text-primary"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-foreground">
                          {h.title}
                        </div>
                        <div className="truncate text-[11.5px] text-muted-foreground">
                          {h.subtitle}
                        </div>
                      </div>
                      <span className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[9.5px] uppercase text-muted-foreground">
                        {h.kind === "parcel" ? "KN" : "SK"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex h-full shrink-0 items-center gap-1.5 px-2">
          <button
            onClick={async () => { await logout(); navigate({ to: "/login" }); }}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Odhlásiť"
          >
            <LogIn className="h-4 w-4 rotate-180" />
            <span className="hidden sm:inline">Odhlásiť</span>
          </button>
          {session.role === "admin" && (
            <Link
              to="/admin"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-[12.5px] font-medium text-primary-foreground hover:opacity-90"
            >
              <Shield className="h-4 w-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
        </div>
      </header>

      {/* Sidebar — pure detail panel */}
      <aside className="absolute left-0 top-14 bottom-0 z-[900] flex w-[340px] flex-col border-r border-border bg-surface">
        {multiParcels.length > 0 ? (
          <MultiOwnerPanel parcels={multiParcels} onClear={backToSearch} />
        ) : selectedParcel ? (
          <ParcelDetail info={selectedParcel} onClear={backToSearch} />
        ) : multiLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Vyhľadávam parcely v oblasti…</p>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
            <MapPin className="mb-3 h-8 w-8 text-muted-foreground/20" strokeWidth={1.5} />
            <p className="text-sm font-medium text-foreground">Vyberte parcelu</p>
            <p className="mt-1.5 max-w-[200px] text-[12px] leading-relaxed text-muted-foreground">
              Kliknite na mapu alebo vyhľadajte parcelu v hornom vyhľadávaní.
            </p>
            <p className="mt-4 max-w-[200px] text-[11px] text-muted-foreground">
              Pre výber viacerých parciel použite tlačidlo <Square className="inline h-3 w-3" /> v pravom paneli a ťahaním myši označte oblasť.
            </p>
          </div>
        )}
      </aside>

      {/* Map */}
      <main className="absolute inset-0 top-14" style={{ left: "340px" }}>
        {mounted ? (
          <Suspense fallback={<MapSkeleton />}>
            <MapView
              ref={mapRef}
              base={base}
              marker={marker}
              onCoords={(lat, lng) => setCoords({ lat, lng })}
              onParcelSelect={handleParcelSelect}
              selectionMode={selectionMode}
              onAreaSelect={handleAreaSelect}
            />
          </Suspense>
        ) : (
          <MapSkeleton />
        )}
      </main>

      {/* Right-side controls */}
      <div className="absolute top-[60px] right-3 z-[997] flex flex-col items-end gap-1">
        <button
          onClick={() => setSelectionMode((v) => !v)}
          className={`flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
            selectionMode
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
          }`}
          title={selectionMode ? "Ukončiť výber" : "Výber viacerých parciel"}
          aria-label="Výber viacerých parciel"
        >
          <Square className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={() => mapRef.current?.zoomIn()}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Priblížiť"
          aria-label="Priblížiť"
        >
          <Plus className="h-[18px] w-[18px]" />
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Oddialiť"
          aria-label="Oddialiť"
        >
          <Minus className="h-[18px] w-[18px]" />
        </button>
        <div className="my-0.5 h-px w-8 bg-border" />
        <button
          onClick={locateMe}
          className="flex h-10 w-10 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Moja poloha"
          aria-label="Moja poloha"
        >
          <Locate className="h-[18px] w-[18px]" />
        </button>

        <div className="relative">
          <button
            onClick={() => setShowLayers((v) => !v)}
            className={`flex h-10 w-10 items-center justify-center rounded-md border transition-colors ${
              showLayers
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-surface text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title="Mapové vrstvy"
            aria-label="Mapové vrstvy"
          >
            <Layers className="h-[18px] w-[18px]" />
          </button>

          {showLayers && (
            <div className="absolute right-0 top-full mt-1.5 w-[300px] origin-top-right rounded-lg border border-border bg-surface">
              <div className="border-b border-border px-3 py-2.5">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  Podkladová mapa
                </div>
                <div className="flex gap-1.5">
                    <BaseTile tileKey="osm" label="Mapa" active={base === "osm"} onClick={() => setBase("osm")} />
                    <BaseTile tileKey="satellite" label="Satelit" active={base === "satellite"} onClick={() => setBase("satellite")} />
                    <BaseTile tileKey="topo" label="Reliéf" active={base === "topo"} onClick={() => setBase("topo")} />
                    <BaseTile tileKey="ortofoto" label="Ortofoto" active={base === "ortofoto"} onClick={() => setBase("ortofoto")} />
                  </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Coordinate HUD */}
      <div className="pointer-events-none absolute bottom-2 right-3 z-[997] flex items-center gap-3 rounded-md border border-border bg-surface/95 px-3 py-1.5 font-mono text-[11px] text-foreground shadow-sm backdrop-blur-md">
        <span className="text-muted-foreground">WGS-84</span>
        <span>{coords ? `${coords.lat.toFixed(5)}° N` : "—"}</span>
        <span>{coords ? `${coords.lng.toFixed(5)}° E` : "—"}</span>
      </div>
    </div>
  );
}

/* ---------------- subcomponents ---------------- */

/* --- Map tile snapshot (Google Maps-style header image) --- */

function MapSnapshot({ lat, lng }: { lat: number; lng: number }) {
  const zoom = 16;
  const TILE = 256;
  const n = Math.pow(2, zoom);

  const tiles = useMemo(() => {
    const ftx = ((lng + 180) / 360) * n;
    const fty =
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;

    const cx = Math.floor(ftx);
    const cy = Math.floor(fty);
    const ox = (ftx - cx) * TILE;
    const oy = (fty - cy) * TILE;

    const result: { x: number; y: number; left: string; top: string }[] = [];

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const x = (((cx + dx) % n) + n) % n;
        const y = cy + dy;
        if (y < 0 || y >= n) continue;
        result.push({
          x,
          y,
          left: `calc(50% - ${ox}px + ${dx * TILE}px)`,
          top: `calc(50% - ${oy}px + ${dy * TILE}px)`,
        });
      }
    }

    return result;
  }, [lat, lng]);

  return (
    <div className="relative w-full aspect-[16/9] shrink-0 overflow-hidden bg-[#e8edf1]">
      {tiles.map((t) => (
        <div
          key={`${t.x}-${t.y}`}
          className="absolute bg-cover bg-no-repeat"
          style={{
            width: TILE,
            height: TILE,
            left: t.left,
            top: t.top,
            backgroundImage: `url(https://a.tile.openstreetmap.org/${zoom}/${t.x}/${t.y}.png)`,
          }}
        />
      ))}
    </div>
  );
}

/* --- Place card detail --- */

function ParcelDetail({ info, onClear }: { info: ParcelInfo; onClear: () => void }) {
  const a = info.rawAttributes || {};
  const [lvData, setLvData] = useState<{ owners: { meno: string; adresa: string; podiel: string }[]; loading: boolean }>({ owners: [], loading: false });

  // Extract KU numeric code from raw attributes for LV lookup
  const kuCodeRaw = useMemo(() => {
    for (const [key, val] of Object.entries(a)) {
      const k = key.toLowerCase();
      if (/kód katastrálneho|katu|ku_kod|kód k\.ú\./.test(k) && val != null && String(val).trim() !== "") {
        return String(val);
      }
    }
    for (const val of Object.values(a)) {
      const s = String(val ?? "").trim();
      if (/^\d{6}$/.test(s)) return s;
    }
    return null;
  }, [a]);

  useEffect(() => {
    if (!info.lv || !kuCodeRaw) return;
    let cancelled = false;
    setLvData({ owners: [], loading: true });
    fetch(`/api/public/kataster/lv?ku=${encodeURIComponent(kuCodeRaw)}&lv=${encodeURIComponent(info.lv)}&lat=${info.lat}&lng=${info.lng}&parcel=${encodeURIComponent(info.parcelNo)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setLvData({ owners: data?.owners || [], loading: false });
      })
      .catch(() => {
        if (cancelled) return;
        setLvData({ owners: [], loading: false });
      });
    return () => { cancelled = true; };
  }, [info.lv, kuCodeRaw]);

  const categorizeFields = () => {
    const locFields: { label: string; val: string; key: string }[] = [];
    const paramFields: { label: string; val: string; key: string }[] = [];
    const otherFields: { label: string; val: string; key: string }[] = [];

    for (const [key, val] of Object.entries(a)) {
      const k = key.toLowerCase();
      const v = String(val);
      // skip fields already shown via info.xxx props
      if (/objectid|shape|globalid|layer_name|layername/.test(k)) continue;
      if (/názov katastrálneho|nazov_ku|katastrálne územie|názovku/.test(k)) continue;
      if (/list vlastníctva|listu vlastníctva|cislo_lv|list_vlast/.test(k)) continue;
      if (/vymera|výmera/.test(k)) continue;
      if (/druh pozemku|druh_pozemku/.test(k)) continue;
      if (/číslo parcely|parcelné číslo|cislo_parcely|parcelne_cislo/.test(k)) continue;

      if (/obec|municip/.test(k)) { locFields.push({ label: "Obec", val: v, key }); continue; }
      if (/okres/.test(k)) { locFields.push({ label: "Okres", val: v, key }); continue; }
      if (/kraj/.test(k)) { locFields.push({ label: "Kraj", val: v, key }); continue; }
      if (/kód katastrálneho|katu|ku_kod|kód k\.ú\./.test(k)) { locFields.push({ label: "Kód k.ú.", val: v, key }); continue; }

      if (/kód druhu|kod_druhu/.test(k)) { paramFields.push({ label: "Kód druhu", val: v, key }); continue; }
      if (/spôsob vyu|sposob_vyu/.test(k)) { paramFields.push({ label: "Spôsob využitia", val: v, key }); continue; }
      if (/bpej/.test(k)) { paramFields.push({ label: "BPEJ", val: v, key }); continue; }
      if (/typ parcely|typ_parcely/.test(k)) { paramFields.push({ label: "Typ parcely", val: v, key }); continue; }
      if (/druh ochrany|druh_chrany/.test(k)) { paramFields.push({ label: "Druh ochrany", val: v, key }); continue; }

      if (/poznámka|poznamka/.test(k)) { otherFields.push({ label: "Poznámka", val: v, key }); continue; }
      if (/stav/.test(k)) { otherFields.push({ label: "Stav", val: v, key }); continue; }
      if (/dátum|datum/.test(k)) { otherFields.push({ label: key, val: v, key }); continue; }
      otherFields.push({ label: key, val: v, key });
    }
    return { locFields, paramFields, otherFields };
  };

  const { locFields, paramFields, otherFields } = categorizeFields();
  const hasParams = info.vymera || paramFields.length > 0;

  // Resolve KU name — raw attributes may have the name under a different key
  let kuName = info.ku;
  if (/^\d+$/.test(kuName)) {
    for (const [key, val] of Object.entries(a)) {
      const k = key.toLowerCase();
      if (/názov katastrálneho|názov_ku|nazov_ku|katastrálne územie/.test(k)) {
        kuName = String(val);
        break;
      }
    }
  }
  const kuCode = locFields.find((f) => f.label === "Kód k.ú.")?.val;
  const obec = locFields.find((f) => f.label === "Obec")?.val;

  const subtitle = [
    kuName ? `k.ú. ${kuName}${kuCode ? ` (${kuCode})` : ""}` : null,
    obec ? `obec ${obec}` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="flex h-full flex-col">
      {/* Map snapshot header — flush, no padding, X button overlaid */}
      <div className="relative shrink-0">
        <MapSnapshot lat={info.lat} lng={info.lng} />
        <button
          onClick={onClear}
          className="absolute right-2 top-2 z-10 rounded-md border border-border bg-background/90 p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
          aria-label="Zatvoriť"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Title block */}
      <div className="shrink-0 px-4 pb-3 pt-3">
        <h2 className="text-[16px] font-semibold text-foreground">{info.parcelNo}</h2>
        {subtitle && (
          <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{subtitle}</p>
        )}
        {info.lv && (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground">
            <span>LV {info.lv}</span>
            {info.vymera && <><span className="text-border">·</span><span>{info.vymera} m²</span></>}
            {info.druh && <><span className="text-border">·</span><span>{info.druh}</span></>}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="shrink-0 mx-4 border-t border-border" />

      {/* Scrollable info sections */}
      <div className="flex-1 overflow-y-auto pt-3">
        {lvData.loading && (
          <div className="px-4 pb-4">
            <div className="mb-2 flex items-center gap-2">
              <div className="h-3 w-0.5 shrink-0 rounded-full bg-muted-foreground/20" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Vlastníci</span>
            </div>
            <div className="py-2 text-[12px] text-muted-foreground">Načítavam údaje o vlastníkoch…</div>
          </div>
        )}

        {!lvData.loading && lvData.owners.length > 0 && (
          <Section title="Vlastníci">
            {lvData.owners.map((o, i) => (
              <Row key={i} label={o.meno} value={o.adresa ? `${o.adresa}${o.podiel ? ` · ${o.podiel}` : ""}` : o.podiel || "—"} />
            ))}
          </Section>
        )}

        {(kuName || locFields.some((f) => f.label !== "Kód k.ú." && f.label !== "Obec")) && (
          <Section title="Poloha">
            {kuName && <Row label="Katastrálne územie" value={kuName} />}
            {locFields
              .filter((f) => f.label !== "Kód k.ú." && f.label !== "Obec")
              .map((f) => <Row key={f.key} label={f.label} value={f.val} />)}
            <Row label="Súradnice" value={`${info.lat.toFixed(5)}° N, ${info.lng.toFixed(5)}° E`} mono />
          </Section>
        )}

        {hasParams && (
          <Section title="Parametre">
            {info.vymera && <Row label="Výmera" value={`${info.vymera} m²`} />}
            {paramFields.map((f) => <Row key={f.key} label={f.label} value={f.val} />)}
          </Section>
        )}

        {otherFields.length > 0 && (
          <Section title="Ďalšie údaje">
            {otherFields.map((f) => <Row key={f.key} label={f.label} value={f.val} />)}
          </Section>
        )}
      </div>

      {/* ZBGIS footer */}
      <div className="shrink-0 border-t border-border px-4 py-3">
        <a
          href={info.zbgisUrl}
          target="_blank"
          rel="noopener"
          className="flex items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
        >
          <ExternalLink className="h-4 w-4" />
          Zobraziť v ZBGIS
        </a>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 pb-4">
      <div className="mb-2 flex items-center gap-2">
        <div className="h-3 w-0.5 shrink-0 rounded-full bg-muted-foreground/20" />
        <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</span>
      </div>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="py-1">
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{label}</div>
      <div className={`mt-px text-[13px] text-foreground ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

interface OwnerSummary {
  name: string;
  address: string;
  share: string;
  parcelCount: number;
  totalArea: number;
  parcels: { parcelNo: string; vymera: string }[];
}

function MultiOwnerPanel({ parcels, onClear }: { parcels: Record<string, unknown>[]; onClear: () => void }) {
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  // Group parcels by unique (kuCode, lv) for owner lookup
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const uniqueLVs = new Map<string, { ku: string; lv: string; parcels: Record<string, unknown>[] }>();
    for (const p of parcels) {
      const lv = String(p.lv || "");
      const ku = String(p.ku || "");
      if (!lv || !ku) continue;
      const key = `${ku}_${lv}`;
      if (!uniqueLVs.has(key)) uniqueLVs.set(key, { ku, lv, parcels: [] });
      uniqueLVs.get(key)!.parcels.push(p);
    }

    Promise.all(
      Array.from(uniqueLVs.values()).map(async (group) => {
        const kuCode = extractKuCode(group.parcels[0]);
        if (!kuCode) return [];
        const res = await fetch(
          `/api/public/kataster/lv?ku=${encodeURIComponent(kuCode)}&lv=${encodeURIComponent(group.lv)}`,
        );
        const data = await res.json();
        return (data?.owners || []).map((o: { meno: string; adresa: string; podiel: string }) => ({
          ...o,
          parcels: group.parcels,
        }));
      }),
    ).then((results) => {
      if (cancelled) return;
      const flat = results.flat();
      const byOwner = new Map<string, OwnerSummary>();
      for (const item of flat) {
        const key = item.meno;
        if (!byOwner.has(key)) {
          byOwner.set(key, { name: item.meno, address: item.adresa, share: item.podiel, parcelCount: 0, totalArea: 0, parcels: [] });
        }
        const entry = byOwner.get(key)!;
        for (const p of item.parcels) {
          const vymera = parseFloat(String(p.vymera || "0").replace(/\s/g, "").replace(",", "."));
          entry.parcels.push({ parcelNo: String(p.parcelNo || "—"), vymera: String(p.vymera || "—") });
          entry.parcelCount++;
          if (!isNaN(vymera)) entry.totalArea += vymera;
        }
      }
      setOwners(Array.from(byOwner.values()).sort((a, b) => b.totalArea - a.totalArea));
      setLoading(false);
    }).catch(() => { if (!cancelled) { setLoading(false); } });

    return () => { cancelled = true; };
  }, [parcels]);

  const totalParcels = parcels.length;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-[14px] font-semibold">Výber viacerých parciel</h2>
          <p className="text-[11px] text-muted-foreground">{totalParcels} parciel</p>
        </div>
        <button onClick={onClear} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Načítavam vlastníkov…</p>
        </div>
      ) : owners.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center">
          <p className="text-[13px] text-muted-foreground">Nepodarilo sa načítať údaje o vlastníkoch.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {owners.map((o, i) => (
            <div key={i}>
              <button
                onClick={() => setExpanded(expanded === i ? null : i)}
                className={`flex w-full items-center gap-2 px-4 py-2 text-left text-[13px] hover:bg-muted/40 ${
                  expanded === i ? "bg-muted/20" : ""
                }`}
              >
                <span className="w-6 shrink-0 font-mono text-muted-foreground">{i + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-medium">{o.name}</span>
                <span className="shrink-0 text-muted-foreground">{o.parcelCount} parc.</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {o.totalArea.toLocaleString("sk-SK", { maximumFractionDigits: 0 })} m²
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {expanded === i ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </span>
              </button>
              {expanded === i && (
                <div className="border-b border-border px-10 pb-2 pt-1 text-[12px] text-muted-foreground">
                  {o.address && <div className="py-0.5">{o.address}</div>}
                  {o.share && <div className="py-0.5">Podiel: {o.share}</div>}
                  <div className="mt-1 space-y-0.5">
                    {o.parcels.map((p, j) => (
                      <div key={j} className="flex items-center justify-between rounded-sm bg-muted/30 px-2 py-0.5">
                        <span>{p.parcelNo}</span>
                        <span>{p.vymera !== "—" ? `${p.vymera} m²` : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function extractKuCode(props: Record<string, unknown>): string | null {
  const direct = props.kuCode ?? props.ku_kod ?? props.katu;
  if (direct && String(direct).trim() !== "") return String(direct);
  for (const [key, val] of Object.entries(props)) {
    const k = key.toLowerCase();
    if (/kód katastrálneho|katu|ku_kod|kód k\.ú\./.test(k) && val != null && String(val).trim() !== "") {
      return String(val);
    }
  }
  for (const val of Object.values(props)) {
    const s = String(val ?? "").trim();
    if (/^\d{6}$/.test(s)) return s;
  }
  return null;
}

function BaseTile({ label, active, onClick, tileKey }: { label: string; active: boolean; onClick: () => void; tileKey: string }) {
  const tiles = useMemo(() => {
    const z = 9;
    const lat = 48.7;
    const lng = 19.5;
    const n = Math.pow(2, z);
    const ftx = ((lng + 180) / 360) * n;
    const fty = (1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2 * n;
    const cx = Math.floor(ftx);
    const cy = Math.floor(fty);
    const T = 256;
    const ox = (ftx - cx) * T;
    const oy = (fty - cy) * T;
    const result: { x: number; y: number; left: string; top: string; url: string }[] = [];
    const templates: Record<string, string> = {
      osm: `https://a.tile.openstreetmap.org/{z}/{x}/{y}.png`,
      satellite: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
      topo: `https://a.tile.opentopomap.org/{z}/{x}/{y}.png`,
      ortofoto: `https://ofmozaika.tiles.freemap.sk/{z}/{x}/{y}.jpg`,
    };
    const tpl = templates[tileKey] || templates.osm;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = (((cx + dx) % n) + n) % n;
        const ty = cy + dy;
        if (ty < 0 || ty >= n) continue;
        const url = tpl.replace("{z}", String(z)).replace(/\{x\}/g, String(tx)).replace(/\{y\}/g, String(ty));
        result.push({ x: tx, y: ty, left: `calc(50% - ${ox}px + ${dx * T}px)`, top: `calc(50% - ${oy}px + ${dy * T}px)`, url });
      }
    }
    return result;
  }, [tileKey]);

  return (
    <button
      onClick={onClick}
      className={`flex flex-1 min-w-0 flex-col items-center gap-0.5 rounded-md border text-[11px] font-medium transition-colors overflow-hidden ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground"
      }`}
    >
      <div className="relative h-[52px] w-full bg-[#e8edf1]">
        {tiles.map((t) => (
          <div
            key={`${t.x}-${t.y}`}
            className="absolute bg-cover bg-no-repeat"
            style={{
              width: 256,
              height: 256,
              left: t.left,
              top: t.top,
              backgroundImage: `url(${t.url})`,
            }}
          />
        ))}
        {active && (
          <div className="absolute inset-0 flex items-center justify-center bg-primary/30">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-4">
          <span className="text-[10px] font-medium text-white leading-tight">{label}</span>
        </div>
      </div>
    </button>
  );
}

function MapSkeleton() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-muted">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <div className="font-mono text-[11px] uppercase tracking-wider">Načítavam mapu</div>
      </div>
    </div>
  );
}
