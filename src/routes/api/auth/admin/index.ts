import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const hash = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
    key,
    256,
  );
  const b = new Uint8Array(hash);
  return Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
}

async function requireAdmin(request: Request): Promise<{ id: string; username: string } | null> {
  const auth = request.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  const { getDb } = await import("@/lib/db");
  const sql = getDb();
  const rows = await sql`
    SELECT u.id, u.username
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ${auth.slice(7)} AND s.expires_at > NOW() AND u.role = 'admin'
    LIMIT 1
  `;
  return rows.length ? { id: (rows[0] as { id: string }).id, username: (rows[0] as { username: string }).username } : null;
}

export const Route = createFileRoute("/api/auth/admin/")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const admin = await requireAdmin(request);
        if (!admin) return json({ error: "Unauthorized" }, 401);

        const { action, username, password, role, id } = (await request.json()) as {
          action: string; username?: string; password?: string; role?: string; id?: string;
        };
        const { getDb } = await import("@/lib/db");
        const sql = getDb();

        if (action === "list") {
          const users = await sql`SELECT id, username, role, created_at FROM users ORDER BY created_at`;
          return json({ users });
        }

        if (action === "create") {
          if (!username?.trim() || username.trim().length < 2) return json({ error: "Meno musí mať aspoň 2 znaky." }, 400);
          if (!password || password.length < 4) return json({ error: "Heslo musí mať aspoň 4 znaky." }, 400);
          if (role !== "admin" && role !== "user") return json({ error: "Neplatná rola." }, 400);

          const exists = await sql`SELECT 1 FROM users WHERE LOWER(username) = ${username.trim().toLowerCase()} LIMIT 1`;
          if (exists.length) return json({ error: "Používateľ s týmto menom už existuje." }, 409);

          const salt = crypto.randomUUID();
          const passwordHash = await hashPassword(password, salt);
          await sql`
            INSERT INTO users (username, password_hash, salt, role)
            VALUES (${username.trim()}, ${passwordHash}, ${salt}, ${role})
          `;
          return json({ ok: true });
        }

        if (action === "delete") {
          if (!id) return json({ error: "Missing id" }, 400);
          const target = await sql`SELECT username FROM users WHERE id = ${id} LIMIT 1`;
          if (!target.length) return json({ error: "User not found" }, 404);
          if ((target[0] as { username: string }).username === "Tomáš Bukový") {
            return json({ error: "Hlavného administrátora nemožno odstrániť." }, 403);
          }
          await sql`DELETE FROM users WHERE id = ${id}`;
          return json({ ok: true });
        }

        return json({ error: "Unknown action" }, 400);
      },
    },
  },
});
