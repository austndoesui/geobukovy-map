import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Plus, Shield, Trash2, UserIcon } from "lucide-react";
import { checkSession, listUsers, createUser, deleteUser, logout, type Session } from "@/lib/auth";
import logo from "@/assets/logo-removebg-preview.png";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Administrácia — GeoBukový" }] }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [users, setUsers] = useState<{ id: string; username: string; role: string; created_at: string }[]>([]);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    checkSession().then((s) => {
      if (!s) {
        navigate({ to: "/login" });
        return;
      }
      setSession(s);
      if (s.role === "admin") {
        listUsers(s).then(setUsers);
      }
    });
  }, [navigate]);

  if (!session) return null;

  const refresh = async () => {
    const users = await listUsers(session);
    setUsers(users);
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await createUser(session, u, p, role);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "Chyba" });
      return;
    }
    setU("");
    setP("");
    setRole("user");
    setMsg({ kind: "ok", text: "Účet bol vytvorený." });
    refresh();
  };

  const onDelete = async (userId: string, name: string) => {
    if (!confirm(`Naozaj odstrániť účet „${name}"?`)) return;
    const r = await deleteUser(session, userId);
    if (!r.ok) setMsg({ kind: "err", text: r.error ?? "Chyba" });
    else setMsg({ kind: "ok", text: "Účet bol odstránený." });
    refresh();
  };

  const onLogout = async () => {
    await logout();
    navigate({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex h-14 items-center border-b border-border bg-surface px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={logo} alt="" className="h-8 w-8 object-contain" />
          <div className="leading-tight">
            <div className="font-display text-[14px] font-semibold tracking-tight">GeoBukový</div>
            <div className="text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Administrácia
            </div>
          </div>
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[12.5px] text-muted-foreground sm:inline">
            Prihlásený: <span className="font-medium text-foreground">{session.username}</span>
          </span>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Mapa
          </Link>
          <button
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-muted"
          >
            <LogOut className="h-4 w-4" /> Odhlásiť
          </button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 p-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-xl border border-border bg-surface">
          <header className="flex items-center justify-between border-b border-border px-5 py-3.5">
            <h2 className="font-display text-[14px] font-semibold">Používatelia</h2>
            <span className="text-[11.5px] text-muted-foreground">{users.length} účtov</span>
          </header>
          <ul className="divide-y divide-border">
            {users.map((acc) => (
              <li key={acc.id} className="flex items-center gap-3 px-5 py-3">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground">
                  {acc.role === "admin" ? <Shield className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-medium">{acc.username}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {acc.role === "admin" ? "Administrátor" : "Používateľ"} ·{" "}
                    {new Date(acc.created_at).toLocaleDateString("sk-SK")}
                  </div>
                </div>
                <button
                  onClick={() => onDelete(acc.id, acc.username)}
                  disabled={acc.username === "Tomáš Bukový"}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                  title={acc.username === "Tomáš Bukový" ? "Hlavného administrátora nemožno odstrániť" : "Odstrániť"}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="h-fit rounded-xl border border-border bg-surface">
          <header className="border-b border-border px-5 py-3.5">
            <h2 className="font-display text-[14px] font-semibold">Nový účet</h2>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">Vytvorte prístup pre kolegu.</p>
          </header>
          <form onSubmit={onCreate} className="space-y-3 p-5">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Meno
              </span>
              <input
                value={u}
                onChange={(e) => setU(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                placeholder="napr. Jana Nováková"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Heslo
              </span>
              <input
                type="text"
                value={p}
                onChange={(e) => setP(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 font-mono text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                placeholder="aspoň 4 znaky"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Rola
              </span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "user")}
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-2 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
              >
                <option value="user">Používateľ</option>
                <option value="admin">Administrátor</option>
              </select>
            </label>

            {msg && (
              <div
                className={`rounded-md px-3 py-2 text-[12px] ${
                  msg.kind === "ok"
                    ? "border border-primary/30 bg-primary/5 text-primary"
                    : "border border-destructive/40 bg-destructive/5 text-destructive"
                }`}
              >
                {msg.text}
              </div>
            )}

            <button
              type="submit"
              className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-[13px] font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Vytvoriť účet
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
