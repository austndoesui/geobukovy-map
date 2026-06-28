import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  Search,
  Layers,
  Ruler,
  Info,
  MapPin,
  Map as MapIcon,
  Mountain,
  Satellite,
  Printer,
  Share2,
  HelpCircle,
  X,
  Locate,
} from "lucide-react";
import logo from "@/assets/geo2-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "GeoBukový — Mapový portál" },
      { name: "description", content: "Mapový portál pre kataster nehnuteľností, ortofotomapy a parcely. GeoBukový — geodetická kancelária GEO2, Orava a celé Slovensko." },
      { property: "og:title", content: "GeoBukový — Mapový portál" },
      { property: "og:description", content: "Mapový portál pre kataster a geodetické služby." },
    ],
  }),
  component: Portal,
});

const MapView = lazy(() => import("@/components/MapView"));

type BaseLayer = "osm" | "satellite" | "topo";
type PanelKey = "layers" | "search" | "info" | "tools" | null;

function Portal() {
  const [mounted, setMounted] = useState(false);
  const [panel, setPanel] = useState<PanelKey>("layers");
  const [base, setBase] = useState<BaseLayer>("osm");
  const [showCadastre, setShowCadastre] = useState(true);
  const [cadastreOpacity, setCadastreOpacity] = useState(85);
  const [showOrtho, setShowOrtho] = useState(false);
  const [orthoOpacity, setOrthoOpacity] = useState(95);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => setMounted(true), []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Top bar */}
      <header className="absolute inset-x-0 top-0 z-[1000] flex h-14 items-center border-b border-border bg-surface">
        <a
          href="https://geobukovy.sk"
          className="flex h-full items-center gap-2.5 border-r border-border px-4"
        >
          <img src={logo.url} alt="GEO2" className="h-9 w-9 object-contain" />
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold tracking-tight">GeoBukový</div>
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Mapový portál
            </div>
          </div>
        </a>

        {/* Search */}
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="relative w-full max-w-[520px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Hľadať parcelu, adresu, katastrálne územie alebo obec…"
              className="h-10 w-full rounded-md border border-border bg-surface-2 pl-9 pr-20 text-[13.5px] placeholder:text-muted-foreground/80 focus:border-primary focus:bg-surface focus:outline-none focus:ring-2 focus:ring-ring/25"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘ K
            </kbd>
          </div>
        </div>

        <div className="hidden h-full items-center gap-1 border-l border-border px-3 md:flex">
          <TopAction icon={<Printer className="h-4 w-4" />} label="Tlač" />
          <TopAction icon={<Share2 className="h-4 w-4" />} label="Zdieľať" />
          <TopAction icon={<HelpCircle className="h-4 w-4" />} label="Pomoc" />
        </div>
      </header>

      {/* Left rail */}
      <nav className="absolute left-0 top-14 bottom-0 z-[999] flex w-14 flex-col items-center gap-1 border-r border-border bg-rail py-3 text-rail-foreground">
        <RailButton icon={<Layers className="h-[18px] w-[18px]" />} label="Vrstvy" active={panel === "layers"} onClick={() => setPanel(panel === "layers" ? null : "layers")} />
        <RailButton icon={<MapPin className="h-[18px] w-[18px]" />} label="Vyhľadávanie" active={panel === "search"} onClick={() => setPanel(panel === "search" ? null : "search")} />
        <RailButton icon={<Ruler className="h-[18px] w-[18px]" />} label="Meranie" active={panel === "tools"} onClick={() => setPanel(panel === "tools" ? null : "tools")} />
        <RailButton icon={<Info className="h-[18px] w-[18px]" />} label="Informácie" active={panel === "info"} onClick={() => setPanel(panel === "info" ? null : "info")} />

        <div className="mt-auto flex flex-col items-center gap-1">
          <RailDivider />
          <RailButton icon={<Locate className="h-[18px] w-[18px]" />} label="Moja poloha" />
        </div>
      </nav>

      {/* Side panel */}
      {panel && (
        <section
          className="absolute left-14 top-14 bottom-0 z-[998] w-[336px] border-r border-border bg-surface"
          style={{ boxShadow: "8px 0 24px -16px oklch(0.2 0.04 155 / 0.18)" }}
        >
          <header className="flex h-11 items-center justify-between border-b border-border px-4">
            <h2 className="font-display text-[13px] font-semibold uppercase tracking-[0.1em] text-foreground">
              {panel === "layers" && "Mapové vrstvy"}
              {panel === "search" && "Vyhľadávanie"}
              {panel === "tools" && "Meracie nástroje"}
              {panel === "info" && "O portáli"}
            </h2>
            <button
              onClick={() => setPanel(null)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Zavrieť"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="h-[calc(100%-2.75rem)] overflow-y-auto">
            {panel === "layers" && (
              <div className="divide-y divide-border">
                <Section title="Tematické vrstvy">
                  <LayerRow
                    label="Kataster nehnuteľností"
                    sublabel="ÚGKK SR · WMS"
                    swatch="cadastre"
                    active={showCadastre}
                    opacity={cadastreOpacity}
                    onToggle={() => setShowCadastre((v) => !v)}
                    onOpacity={setCadastreOpacity}
                  />
                  <LayerRow
                    label="Ortofotomozaika 2023"
                    sublabel="ÚGKK SR · WMS"
                    swatch="ortho"
                    active={showOrtho}
                    opacity={orthoOpacity}
                    onToggle={() => setShowOrtho((v) => !v)}
                    onOpacity={setOrthoOpacity}
                  />
                </Section>

                <Section title="Podkladová mapa">
                  <div className="grid grid-cols-3 gap-2 p-3 pt-2">
                    <BaseTile icon={<MapIcon className="h-4 w-4" />} label="Mapa" active={base === "osm"} onClick={() => setBase("osm")} />
                    <BaseTile icon={<Satellite className="h-4 w-4" />} label="Satelit" active={base === "satellite"} onClick={() => setBase("satellite")} />
                    <BaseTile icon={<Mountain className="h-4 w-4" />} label="Reliéf" active={base === "topo"} onClick={() => setBase("topo")} />
                  </div>
                </Section>

                <Section title="Legenda">
                  <ul className="space-y-2 px-4 pb-4 pt-1 text-[12px] text-muted-foreground">
                    <LegendItem color="oklch(0.55 0.22 28)" label="Hranica parcely C-KN" />
                    <LegendItem color="oklch(0.55 0.18 264)" label="Hranica parcely E-KN" dashed />
                    <LegendItem color="oklch(0.42 0.1 152)" label="Hranica k.ú." />
                    <LegendItem color="oklch(0.55 0.02 155)" label="Stavba" />
                  </ul>
                </Section>
              </div>
            )}

            {panel === "search" && (
              <div className="p-4">
                <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  Číslo parcely
                </label>
                <input className="mb-3 h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25" placeholder="napr. 1234/5" />
                <label className="mb-1.5 block text-[11px] font-medium text-muted-foreground">
                  Katastrálne územie
                </label>
                <input className="mb-3 h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25" placeholder="napr. Námestovo" />
                <button className="h-9 w-full rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:bg-primary-deep">
                  Vyhľadať
                </button>
                <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                  Dáta z verejne dostupných služieb ÚGKK SR. Pre úradné výpisy z katastra kontaktujte našu kanceláriu.
                </p>
              </div>
            )}

            {panel === "tools" && (
              <div className="p-3">
                <ToolRow label="Vzdialenosť" hint="Klikni do mapy pre meranie" icon={<Ruler className="h-4 w-4" />} />
                <ToolRow label="Plocha" hint="Polygónové meranie plôch" icon={<Layers className="h-4 w-4" />} />
                <ToolRow label="Súradnice bodu" hint="WGS-84 / S-JTSK" icon={<MapPin className="h-4 w-4" />} />
                <p className="px-2 pt-3 text-[11.5px] leading-relaxed text-muted-foreground">
                  Pre kataster-presné zameranie odporúčame geodetické zameranie v teréne — kontaktujte našu kanceláriu.
                </p>
              </div>
            )}

            {panel === "info" && (
              <div className="space-y-4 p-4 text-[12.5px] leading-relaxed text-muted-foreground">
                <div>
                  <h3 className="mb-1 font-display text-[13px] font-semibold text-foreground">GeoBukový — GEO2</h3>
                  <p>Ing. Tomáš Bukový, PhD. Geodetická kancelária pre Oravu a celé Slovensko.</p>
                </div>
                <div className="rounded-md border border-border bg-surface-2 p-3">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Kontakt</div>
                  <a href="https://geobukovy.sk" className="mt-1 block text-[13px] font-medium text-primary hover:underline">geobukovy.sk</a>
                  <a href="mailto:info@geobukovy.sk" className="block text-[13px] text-foreground hover:underline">info@geobukovy.sk</a>
                </div>
                <p className="text-[11px]">
                  Mapový portál využíva otvorené dátové služby ÚGKK SR. Údaje sú informatívne.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Map */}
      <main className="absolute inset-0 top-14 left-14">
        {mounted ? (
          <Suspense fallback={<MapSkeleton />}>
            <MapView base={base} showCadastre={showCadastre} cadastreOpacity={cadastreOpacity / 100} showOrtho={showOrtho} orthoOpacity={orthoOpacity / 100} onCoords={(lat, lng) => setCoords({ lat, lng })} />
          </Suspense>
        ) : (
          <MapSkeleton />
        )}
      </main>

      {/* Coordinate HUD */}
      <div className="pointer-events-none absolute bottom-2 right-14 z-[997] flex items-center gap-3 rounded-md border border-border bg-surface/95 px-3 py-1.5 font-mono text-[11px] text-foreground shadow-sm backdrop-blur-md">
        <span className="text-muted-foreground">WGS-84</span>
        <span>{coords ? `${coords.lat.toFixed(5)}° N` : "—"}</span>
        <span>{coords ? `${coords.lng.toFixed(5)}° E` : "—"}</span>
      </div>
    </div>
  );
}

/* ---------------- subcomponents ---------------- */

function TopAction({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
      {icon}
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

function RailButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`group relative grid h-11 w-11 place-items-center rounded-md transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-rail-foreground/70 hover:bg-white/5 hover:text-rail-foreground"
      }`}
    >
      {icon}
      {active && <span className="absolute left-0 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-r bg-gold" />}
      <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md bg-rail px-2 py-1 text-[11px] font-medium text-rail-foreground opacity-0 shadow-md transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </button>
  );
}

function RailDivider() {
  return <div className="my-1 h-px w-7 bg-white/10" />;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="px-4 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function LayerRow({
  label,
  sublabel,
  swatch,
  active,
  opacity,
  onToggle,
  onOpacity,
}: {
  label: string;
  sublabel: string;
  swatch: "cadastre" | "ortho";
  active: boolean;
  opacity: number;
  onToggle: () => void;
  onOpacity: (v: number) => void;
}) {
  return (
    <div className="px-4 py-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={active}
          onChange={onToggle}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border-strong accent-[var(--color-primary)]"
        />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <SwatchIcon kind={swatch} />
            <span className="text-[13px] font-medium text-foreground">{label}</span>
          </div>
          <div className="mt-0.5 pl-7 text-[11px] text-muted-foreground">{sublabel}</div>
        </div>
      </label>
      {active && (
        <div className="mt-2.5 flex items-center gap-2 pl-7">
          <span className="w-12 text-[10.5px] uppercase tracking-wider text-muted-foreground">Krytie</span>
          <input
            type="range"
            min={10}
            max={100}
            value={opacity}
            onChange={(e) => onOpacity(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-[var(--color-primary)]"
          />
          <span className="w-9 text-right font-mono text-[11px] text-muted-foreground">{opacity}%</span>
        </div>
      )}
    </div>
  );
}

function SwatchIcon({ kind }: { kind: "cadastre" | "ortho" }) {
  if (kind === "cadastre") {
    return (
      <div className="grid h-5 w-5 place-items-center rounded-sm border border-border bg-surface-2">
        <div className="h-2 w-2 border border-[oklch(0.55_0.22_28)]" />
      </div>
    );
  }
  return (
    <div className="h-5 w-5 rounded-sm bg-[linear-gradient(135deg,oklch(0.55_0.08_140),oklch(0.4_0.06_150)_45%,oklch(0.55_0.05_85)_75%,oklch(0.7_0.08_85))]" />
  );
}

function BaseTile({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2.5 text-[11.5px] font-medium transition-all ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ToolRow({ icon, label, hint }: { icon: React.ReactNode; label: string; hint: string }) {
  return (
    <button className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-accent text-accent-foreground">{icon}</div>
      <div className="flex-1">
        <div className="text-[13px] font-medium text-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
    </button>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      <span
        className="inline-block h-0 w-6"
        style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
      />
      {label}
    </li>
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
