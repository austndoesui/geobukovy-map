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

export const Route = createFileRoute("/api/auth/setup")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async () => {
        try {
          const { getDb } = await import("@/lib/db");
          const sql = getDb();
          const existing = await sql`SELECT 1 FROM users LIMIT 1`;
          if (existing.length) return json({ error: "Users already exist" }, 409);

          const salt = crypto.randomUUID();
          const passwordHash = await hashPassword("geobukovy2025", salt);
          await sql`
            INSERT INTO users (username, password_hash, salt, role)
            VALUES ('Tomáš Bukový', ${passwordHash}, ${salt}, 'admin')
          `;
          return json({ ok: true, message: "Root admin created: username='Tomáš Bukový', password='geobukovy2025'" });
        } catch (err) {
          return json({ error: "Setup failed: " + String(err) }, 500);
        }
      },
    },
  },
});
