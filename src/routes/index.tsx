import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Search,
  Layers,
  MapPin,
  Ruler,
  Info,
  Compass,
  Mountain,
  Satellite,
  Map as MapIcon,
  Trees,
  Phone,
  Mail,
  ExternalLink,
  Crosshair,
  ChevronLeft,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GeoBukový — Mapový portál | Kataster a geodetické služby" },
      { name: "description", content: "Profesionálny mapový portál pre geodetické služby. Kataster nehnuteľností, ortofotomapy, parcely. Orava a celé Slovensko." },
      { property: "og:title", content: "GeoBukový — Mapový portál" },
      { property: "og:description", content: "Profesionálny mapový portál pre kataster a geodetické služby." },
    ],
  }),
  component: Portal,
});

const MapView = lazy(() => import("@/components/MapView"));

type BaseLayer = "osm" | "satellite" | "topo";

function Portal() {
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [base, setBase] = useState<BaseLayer>("osm");
  const [showCadastre, setShowCadastre] = useState(true);
  const [showOrtho, setShowOrtho] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => setMounted(true), []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Header */}
      <header className="absolute inset-x-0 top-0 z-[1000] flex h-16 items-center justify-between border-b border-border/60 bg-surface/85 px-4 backdrop-blur-md md:px-6">
        <div className="flex items-center gap-3">
          <a href="https://geobukovy.sk" className="flex items-center gap-2.5 group">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_4px_14px_oklch(0.45_0.12_155/0.35)] transition-transform group-hover:scale-105">
              <Trees className="h-5 w-5" strokeWidth={2.25} />
            </div>
            <div className="leading-tight">
              <div className="font-display text-[17px] font-bold tracking-tight">GeoBukový</div>
              <div className="text-[11px] text-muted-foreground -mt-0.5">Mapový portál · Kataster SR</div>
            </div>
          </a>
        </div>

        <nav className="hidden items-center gap-1 md:flex">
          {[
            { label: "Mapa", active: true },
            { label: "Služby" },
            { label: "Cenník" },
            { label: "Kontakt" },
          ].map((item) => (
            <a
              key={item.label}
              href="#"
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                item.active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="tel:+421900000000"
            className="hidden h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-sm font-medium text-foreground hover:bg-muted md:inline-flex"
          >
            <Phone className="h-3.5 w-3.5" /> Konzultácia
          </a>
          <a
            href="https://geobukovy.sk"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary-glow"
          >
            Cenová ponuka <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`absolute left-0 top-16 bottom-0 z-[999] w-[340px] transform border-r border-border/60 bg-surface/95 backdrop-blur-md transition-transform duration-300 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ boxShadow: "var(--shadow-panel)" }}
      >
        <div className="flex h-full flex-col">
          {/* Search */}
          <div className="border-b border-border/60 p-4">
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Vyhľadávanie
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Parcela, adresa, k.ú., obec..."
                className="h-10 w-full rounded-lg border border-border bg-surface-elevated pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {["Parcela C", "Parcela E", "Adresa", "K.ú."].map((chip) => (
                <button
                  key={chip}
                  className="rounded-md border border-border bg-surface px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-primary"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Layers */}
          <div className="border-b border-border/60 p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Mapové vrstvy
              </span>
            </div>
            <LayerToggle
              icon={<MapPin className="h-4 w-4" />}
              label="Kataster nehnuteľností"
              hint="Hranice parciel C/E, čísla"
              active={showCadastre}
              onToggle={() => setShowCadastre((v) => !v)}
            />
            <LayerToggle
              icon={<Satellite className="h-4 w-4" />}
              label="Ortofotomozaika 2023"
              hint="Letecké snímky ÚGKK SR"
              active={showOrtho}
              onToggle={() => setShowOrtho((v) => !v)}
            />
          </div>

          {/* Basemap */}
          <div className="border-b border-border/60 p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <MapIcon className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Podkladová mapa
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <BaseChoice icon={<MapIcon className="h-4 w-4" />} label="Mapa" active={base === "osm"} onClick={() => setBase("osm")} />
              <BaseChoice icon={<Satellite className="h-4 w-4" />} label="Satelit" active={base === "satellite"} onClick={() => setBase("satellite")} />
              <BaseChoice icon={<Mountain className="h-4 w-4" />} label="Topo" active={base === "topo"} onClick={() => setBase("topo")} />
            </div>
          </div>

          {/* Tools */}
          <div className="border-b border-border/60 p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <Compass className="h-3.5 w-3.5 text-primary" />
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Nástroje
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ToolButton icon={<Ruler className="h-4 w-4" />} label="Meranie" />
              <ToolButton icon={<Crosshair className="h-4 w-4" />} label="Súradnice" />
              <ToolButton icon={<Info className="h-4 w-4" />} label="Identifikácia" />
              <ToolButton icon={<MapPin className="h-4 w-4" />} label="Bod záujmu" />
            </div>
          </div>

          {/* CTA */}
          <div className="mt-auto p-4">
            <div className="rounded-xl border border-primary/15 bg-gradient-to-br from-primary/8 to-primary-glow/8 p-4">
              <div className="font-display text-sm font-bold text-foreground">Potrebujete geodeta?</div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Vypracujeme geometrický plán, vytýčime hranice alebo zameriame adresný bod.
              </p>
              <div className="mt-3 flex gap-2">
                <a href="tel:+421900000000" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-glow">
                  <Phone className="h-3 w-3" /> Zavolať
                </a>
                <a href="mailto:info@geobukovy.sk" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted">
                  <Mail className="h-3 w-3" /> Email
                </a>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Sidebar toggle */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className={`absolute top-1/2 z-[999] grid h-12 w-6 -translate-y-1/2 place-items-center rounded-r-lg border border-l-0 border-border/60 bg-surface/95 text-muted-foreground shadow-md backdrop-blur-md transition-all hover:text-primary ${
          sidebarOpen ? "left-[340px]" : "left-0"
        }`}
        aria-label="Prepnúť panel"
      >
        <ChevronLeft className={`h-4 w-4 transition-transform ${sidebarOpen ? "" : "rotate-180"}`} />
      </button>

      {/* Map */}
      <main className="absolute inset-0 top-16">
        {mounted ? (
          <Suspense fallback={<MapSkeleton />}>
            <MapView base={base} showCadastre={showCadastre} showOrtho={showOrtho} onCoords={(lat, lng) => setCoords({ lat, lng })} />
          </Suspense>
        ) : (
          <MapSkeleton />
        )}
      </main>

      {/* Coordinates HUD */}
      {coords && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-[998] -translate-x-1/2 rounded-full border border-border/60 bg-surface/90 px-3.5 py-1.5 font-mono text-[11px] text-muted-foreground shadow-md backdrop-blur-md">
          {coords.lat.toFixed(5)}° N · {coords.lng.toFixed(5)}° E
        </div>
      )}
    </div>
  );
}

function LayerToggle({ icon, label, hint, active, onToggle }: { icon: React.ReactNode; label: string; hint: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`mb-1.5 flex w-full items-center gap-3 rounded-lg border p-2.5 text-left transition-all ${
        active ? "border-primary/30 bg-primary/5" : "border-border bg-surface hover:bg-muted/60"
      }`}
    >
      <div className={`grid h-8 w-8 place-items-center rounded-md ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium leading-tight">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <div className={`relative h-5 w-9 rounded-full transition-colors ${active ? "bg-primary" : "bg-border"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${active ? "left-[18px]" : "left-0.5"}`} />
      </div>
    </button>
  );
}

function BaseChoice({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs font-medium transition-all ${
        active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border bg-surface text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ToolButton({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex items-center gap-2 rounded-lg border border-border bg-surface px-2.5 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:bg-accent">
      <span className="text-primary">{icon}</span>
      {label}
    </button>
  );
}

function MapSkeleton() {
  return (
    <div className="absolute inset-0 grid place-items-center bg-muted">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <div className="text-sm">Načítavam mapu…</div>
      </div>
    </div>
  );
}
