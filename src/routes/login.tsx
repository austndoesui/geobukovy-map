import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { login } from "@/lib/auth";
import logo from "@/assets/logo-removebg-preview.png";
import { ArrowLeft, Lock, User } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [{ title: "Prihlásenie — GeoBukový" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await login(username, password);
    setBusy(false);
    if (!r.ok) {
      setError(r.error ?? "Chyba prihlásenia.");
      return;
    }
    navigate({ to: "/admin" });
  };

  return (
    <div className="relative grid min-h-screen place-items-center bg-background px-4 text-foreground">
      <Link
        to="/"
        className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Späť na mapu
      </Link>

      <div className="w-full max-w-[380px] rounded-xl border border-border bg-surface p-7 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <img src={logo} alt="" className="h-10 w-10 object-contain" />
          <div className="leading-tight">
            <div className="font-display text-[15px] font-semibold tracking-tight">GeoBukový</div>
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Prihlásenie do administrácie
            </div>
          </div>
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5">
          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Používateľské meno
            </span>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface-2 pl-9 pr-3 text-[13.5px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                placeholder="napr. Tomáš Bukový"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Heslo
            </span>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-surface-2 pl-9 pr-3 text-[13.5px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                placeholder="••••••••"
              />
            </div>
          </label>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="h-10 w-full rounded-md bg-primary text-[13.5px] font-medium text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Prihlasujem…" : "Prihlásiť sa"}
          </button>
        </form>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          Prístup len pre oprávnených pracovníkov geodetickej kancelárie.
        </p>
      </div>
    </div>
  );
}
