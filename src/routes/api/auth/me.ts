import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const auth = request.headers.get("Authorization");
          if (!auth?.startsWith("Bearer ")) return json({ user: null });

          const { getDb } = await import("@/lib/db");
          const sql = getDb();
          const rows = await sql`
            SELECT u.id, u.username, u.role, u.created_at
            FROM sessions s JOIN users u ON u.id = s.user_id
            WHERE s.token = ${auth.slice(7)} AND s.expires_at > NOW()
            LIMIT 1
          `;
          if (!rows.length) return json({ user: null });
          const u = rows[0] as { id: string; username: string; role: string; created_at: string };
          return json({ user: { id: u.id, username: u.username, role: u.role, createdAt: u.created_at } });
        } catch {
          return json({ user: null });
        }
      },
    },
  },
});
