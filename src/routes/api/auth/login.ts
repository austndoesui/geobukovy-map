import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const { username, password } = (await request.json()) as { username: string; password: string };
          if (!username?.trim() || !password) return json({ ok: false, error: "Vyplňte meno a heslo." });

          const { getDb } = await import("@/lib/db");
          const sql = getDb();
          const users = await sql`
            SELECT id, username, password_hash, salt, role FROM users
            WHERE LOWER(username) = ${username.trim().toLowerCase()} LIMIT 1
          `;
          if (!users.length) return json({ ok: false, error: "Nesprávne meno alebo heslo." });

          const u = users[0] as { id: string; username: string; password_hash: string; salt: string; role: string };
          const hash = await hashPassword(password, u.salt);
          if (hash !== u.password_hash) return json({ ok: false, error: "Nesprávne meno alebo heslo." });

          const token = crypto.randomUUID();
          await sql`
            INSERT INTO sessions (user_id, token, expires_at)
            VALUES (${u.id}, ${token}, NOW() + INTERVAL '7 days')
          `;

          return json({ ok: true, token, user: { id: u.id, username: u.username, role: u.role } });
        } catch (err) {
          return json({ ok: false, error: "Chyba servera: " + String(err) });
        }
      },
    },
  },
});
