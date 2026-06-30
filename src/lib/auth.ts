// Lightweight client-side auth using localStorage.
// NOTE: This is a simple gate, not real security. Anyone with browser
// access can inspect localStorage. For real auth use Lovable Cloud.

export interface Account {
  username: string;
  password: string;
  role: "admin" | "user";
  createdAt: string;
}

const USERS_KEY = "geobukovy.users";
const SESSION_KEY = "geobukovy.session";

const ROOT_ADMIN: Account = {
  username: "Tomáš Bukový",
  password: "geobukovy2025",
  role: "admin",
  createdAt: "2025-01-01T00:00:00.000Z",
};

function readUsers(): Account[] {
  if (typeof window === "undefined") return [ROOT_ADMIN];
  try {
    const raw = window.localStorage.getItem(USERS_KEY);
    if (!raw) return [ROOT_ADMIN];
    const arr = JSON.parse(raw) as Account[];
    // ensure root admin always present
    if (!arr.find((u) => u.username === ROOT_ADMIN.username)) arr.unshift(ROOT_ADMIN);
    return arr;
  } catch {
    return [ROOT_ADMIN];
  }
}

function writeUsers(users: Account[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function listUsers(): Account[] {
  return readUsers();
}

export function createUser(username: string, password: string, role: "admin" | "user" = "user"): { ok: boolean; error?: string } {
  const u = username.trim();
  if (u.length < 2) return { ok: false, error: "Meno musí mať aspoň 2 znaky." };
  if (password.length < 4) return { ok: false, error: "Heslo musí mať aspoň 4 znaky." };
  const users = readUsers();
  if (users.find((x) => x.username.toLowerCase() === u.toLowerCase())) {
    return { ok: false, error: "Používateľ s týmto menom už existuje." };
  }
  users.push({ username: u, password, role, createdAt: new Date().toISOString() });
  writeUsers(users);
  return { ok: true };
}

export function deleteUser(username: string): { ok: boolean; error?: string } {
  if (username === ROOT_ADMIN.username) return { ok: false, error: "Hlavného administrátora nemožno odstrániť." };
  const users = readUsers().filter((u) => u.username !== username);
  writeUsers(users);
  return { ok: true };
}

function norm(s: string) {
  return s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function login(username: string, password: string): { ok: boolean; error?: string } {
  const want = norm(username);
  const user = readUsers().find((u) => norm(u.username) === want && u.password === password);
  if (!user) return { ok: false, error: "Nesprávne meno alebo heslo." };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ username: user.username, role: user.role }),
    );
  }
  return { ok: true };
}

export function logout() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SESSION_KEY);
}

export interface Session {
  username: string;
  role: "admin" | "user";
}

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
