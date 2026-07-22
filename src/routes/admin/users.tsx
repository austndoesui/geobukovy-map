import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, LogOut, Shield, UserIcon, Plus, Trash2, X, Check, AlertTriangle } from "lucide-react";
import { checkSession, listUsers, createUser, deleteUser, logout, type Session } from "@/lib/auth";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import logo from "@/assets/logo-removebg-preview.png";

export const Route = createFileRoute("/admin/users")({
  head: () => ({ meta: [{ title: "Správa používateľov — GeoBukový" }] }),
  component: AdminUsers,
});

type User = { id: string; username: string; role: string; created_at: string };

function AdminUsers() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [users, setUsers] = useState<User[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  useEffect(() => {
    checkSession().then((s) => {
      if (!s) { navigate({ to: "/login" }); return; }
      setSession(s);
    });
  }, [navigate]);

  useEffect(() => {
    if (session?.role === "admin") {
      listUsers(session).then(setUsers);
    }
  }, [session]);

  if (!session) return null;

  const refresh = async () => {
    const u = await listUsers(session);
    setUsers(u);
  };

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!u.trim() || p.length < 4) {
      setMsg({ kind: "err", text: "Meno je povinné a heslo musí mať aspoň 4 znaky." });
      return;
    }
    setMsg(null);
    const r = await createUser(session, u.trim(), p, role);
    if (!r.ok) {
      setMsg({ kind: "err", text: r.error ?? "Chyba" });
      return;
    }
    setU(""); setP(""); setRole("user"); setMsg(null);
    setCreateOpen(false);
    refresh();
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    const r = await deleteUser(session, deleteTarget.id);
    setDeleteTarget(null);
    refresh();
  };

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
          <Link to="/admin" className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Administrácia
          </Link>
          <button onClick={onLogout} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] font-medium hover:bg-muted">
            <LogOut className="h-4 w-4" /> Odhlásiť
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-[22px] font-semibold">Správa používateľov</h1>
            <p className="mt-0.5 text-[13px] text-muted-foreground">{users.length} účet / účtov</p>
          </div>
          <button
            onClick={() => { setMsg(null); setU(""); setP(""); setRole("user"); setCreateOpen(true); }}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nový účet
          </button>
        </div>

        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-surface">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-[11.5px] uppercase tracking-wider text-muted-foreground">
                <th className="px-5 py-3 text-left font-medium">Používateľ</th>
                <th className="px-5 py-3 text-left font-medium">Rola</th>
                <th className="hidden px-5 py-3 text-left font-medium sm:table-cell">Vytvorený</th>
                <th className="px-5 py-3 text-right font-medium">Akcie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {users.map((acc) => (
                <tr key={acc.id} className="group transition-colors hover:bg-muted/20">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                        {acc.role === "admin" ? <Shield className="h-4 w-4" /> : <UserIcon className="h-4 w-4" />}
                      </div>
                      <div>
                        <div className="text-[13.5px] font-medium">{acc.username}</div>
                        <div className="text-[11px] text-muted-foreground sm:hidden">
                          {new Date(acc.created_at).toLocaleDateString("sk-SK")}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        acc.role === "admin"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {acc.role === "admin" ? (
                        <><Shield className="h-3 w-3" /> Administrátor</>
                      ) : (
                        <><UserIcon className="h-3 w-3" /> Používateľ</>
                      )}
                    </span>
                  </td>
                  <td className="hidden px-5 py-3.5 text-[13px] text-muted-foreground sm:table-cell">
                    {new Date(acc.created_at).toLocaleDateString("sk-SK", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => setDeleteTarget(acc)}
                      disabled={acc.username === "Tomáš Bukový"}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 disabled:opacity-0"
                      title={acc.username === "Tomáš Bukový" ? "Hlavného administrátora nemožno odstrániť" : "Odstrániť"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-[13px] text-muted-foreground">
                    Žiadni používatelia
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Nový účet</DialogTitle>
            <DialogDescription>Vytvorte prístup pre kolegu.</DialogDescription>
          </DialogHeader>
          <form id="create-form" onSubmit={onCreate} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Meno</span>
              <input
                value={u}
                onChange={(e) => setU(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                placeholder="napr. Jana Nováková"
                autoFocus
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Heslo</span>
              <input
                type="text"
                value={p}
                onChange={(e) => setP(e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-surface-2 px-3 font-mono text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/25"
                placeholder="aspoň 4 znaky"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Rola</span>
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
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-[12px] ${
                  msg.kind === "ok"
                    ? "border border-primary/30 bg-primary/5 text-primary"
                    : "border border-destructive/40 bg-destructive/5 text-destructive"
                }`}
              >
                {msg.kind === "ok" ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                {msg.text}
              </div>
            )}
          </form>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-3.5 text-[13px] font-medium hover:bg-muted"
            >
              Zrušiť
            </button>
            <button
              type="submit"
              form="create-form"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> Vytvoriť účet
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Odstrániť účet</AlertDialogTitle>
            <AlertDialogDescription>
              Naozaj chcete odstrániť účet <strong>{deleteTarget?.username}</strong>? Túto akciu nemožno vrátiť.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zrušiť</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Odstrániť
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
