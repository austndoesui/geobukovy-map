import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const auth = request.headers.get("Authorization");
          if (auth?.startsWith("Bearer ")) {
            const { getDb } = await import("@/lib/db");
            const sql = getDb();
            await sql`DELETE FROM sessions WHERE token = ${auth.slice(7)}`;
          }
          return json({ ok: true });
        } catch {
          return json({ ok: true });
        }
      },
    },
  },
});
