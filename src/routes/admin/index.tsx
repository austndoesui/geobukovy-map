import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Shield, Users, Settings, BarChart3 } from "lucide-react";
import { checkSession, logout, type Session } from "@/lib/auth";
import logo from "@/assets/logo-removebg-preview.png";

export const Route = createFileRoute("/admin/")({
  head: () => ({ meta: [{ title: "Administrácia — GeoBukový" }] }),
  component: AdminHub,
});

const sections = [
  { to: "/admin/users", icon: Users, label: "Správa používateľov", desc: "Vytváranie a správa účtov" },
  { to: null, icon: Settings, label: "Nastavenia", desc: "Čoskoro k dispozícii", disabled: true },
  { to: null, icon: BarChart3, label: "Štatistiky", desc: "Čoskoro k dispozícii", disabled: true },
];

function AdminHub() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    checkSession().then((s) => {
      if (!s) { navigate({ to: "/login" }); return; }
      setSession(s);
    });
  }, [navigate]);

  if (!session) return null;

  const onLogout = async () => {
    await logout();
    navigate({ to: "/" });
  };

  if (session.role !== "admin") {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <header className="flex h-14 items-center border-b border-border bg-surface px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img src={logo} alt="" className="h-8 w-8 object-contain" />
            <div className="leading-tight">
              <div className="font-display text-[14px] font-semibold tracking-tight">GeoBukový</div>
              <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Administrácia</div>
            </div>
          </Link>
          <div className="ml-auto">
            <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-muted">
              <LogOut className="h-4 w-4" /> Odhlásiť
            </button>
          </div>
        </header>
        <main className="mx-auto max-w-md p-6">
          <div className="mt-16 flex flex-col items-center gap-3 text-center">
            <Shield className="h-12 w-12 text-muted-foreground" />
            <h2 className="font-display text-[18px] font-semibold">Obmedzený prístup</h2>
            <p className="text-[13px] text-muted-foreground">Nemáte administrátorské oprávnenie.</p>
            <Link to="/" className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-[13px] font-medium text-primary-foreground hover:opacity-90">
              <ArrowLeft className="h-4 w-4" /> Späť na mapu
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center border-b border-border bg-surface px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="" className="h-8 w-8 object-contain" />
          <div className="leading-tight">
            <div className="font-display text-[14px] font-semibold tracking-tight">GeoBukový</div>
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">Administrácia</div>
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[12.5px] text-muted-foreground sm:inline">
            Prihlásený: <span className="font-medium text-foreground">{session.username}</span>
          </span>
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Mapa
          </Link>
          <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-muted">
            <LogOut className="h-4 w-4" /> Odhlásiť
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-6">
        <h1 className="font-display text-[22px] font-semibold">Administrácia</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">Správa systému GeoBukový</p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((sec) => {
            const Icon = sec.icon;
            if (sec.disabled) {
              return (
                <div key={sec.label} className="flex cursor-not-allowed flex-col gap-3 rounded-xl border border-border bg-surface/50 p-5 opacity-40">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-[14px] font-medium">{sec.label}</div>
                    <div className="text-[12px] text-muted-foreground">{sec.desc}</div>
                  </div>
                </div>
              );
            }
            return (
              <Link
                key={sec.label}
                to={sec.to!}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-primary/40 hover:bg-primary/[0.02]"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-[14px] font-medium">{sec.label}</div>
                  <div className="text-[12px] text-muted-foreground">{sec.desc}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </main>
    </div>
  );
}
