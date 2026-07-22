import { createFileRoute } from "@tanstack/react-router";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const PLAYWRIGHT_URL = process.env.PLAYWRIGHT_SERVICE_URL || "http://localhost:3001";

export const Route = createFileRoute("/api/public/kataster/owners-batch")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        const body = await request.json();
        const requests = body.requests || [];

        if (requests.length === 0) {
          return new Response(JSON.stringify({ results: [] }), {
            status: 200,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }

        try {
          const res = await fetch(PLAYWRIGHT_URL + "/api/owners/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requests }),
            signal: AbortSignal.timeout(120000),
          });
          if (!res.ok) {
            return new Response(
              JSON.stringify({ error: "playwright_failed", detail: await res.text() }),
              { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
            );
          }
          const data = await res.json();
          return new Response(JSON.stringify({ results: data.results || [] }), {
            status: 200,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        } catch (err: any) {
          return new Response(
            JSON.stringify({ error: "batch_failed", detail: err?.message || String(err) }),
            { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
