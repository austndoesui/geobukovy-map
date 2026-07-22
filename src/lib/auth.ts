export interface Session {
  id: string;
  username: string;
  role: "admin" | "user";
  createdAt: string;
}

const TOKEN_KEY = "geobukovy.token";
const SESSION_KEY = "geobukovy.session";

export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

function storeSession(token: string, user: Session) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

function clearSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(SESSION_KEY);
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export async function login(username: string, password: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || "Chyba prihlásenia." };
    storeSession(data.token, data.user);
    return { ok: true };
  } catch {
    return { ok: false, error: "Chyba spojenia so serverom." };
  }
}

export async function logout() {
  const token = getToken();
  if (token) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
    } catch { /* ignore */ }
  }
  clearSession();
}

export async function checkSession(): Promise<Session | null> {
  const token = getToken();
  if (!token) return null;
  const s = getSession();
  if (!s) return null;
  // Verify session is still valid server-side
  try {
    const res = await fetch("/api/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.user) {
      // Update stored session with fresh data
      storeSession(token, data.user);
      return data.user;
    }
  } catch { /* ignore */ }
  clearSession();
  return null;
}

// Admin API helpers
export async function listUsers(session: Session): Promise<{ id: string; username: string; role: string; created_at: string }[]> {
  const token = getToken();
  if (!token) return [];
  const res = await fetch("/api/auth/admin", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "list" }),
  });
  const data = await res.json();
  return data.users || [];
}

export async function createUser(session: Session, username: string, password: string, role: string): Promise<{ ok: boolean; error?: string }> {
  const token = getToken();
  if (!token) return { ok: false, error: "Not authenticated" };
  const res = await fetch("/api/auth/admin", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "create", username, password, role }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || "Chyba" };
  return { ok: true };
}

export async function deleteUser(session: Session, userId: string): Promise<{ ok: boolean; error?: string }> {
  const token = getToken();
  if (!token) return { ok: false, error: "Not authenticated" };
  const res = await fetch("/api/auth/admin", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "delete", id: userId }),
  });
  const data = await res.json();
  if (!res.ok) return { ok: false, error: data.error || "Chyba" };
  return { ok: true };
}
