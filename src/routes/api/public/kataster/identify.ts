import { createFileRoute } from "@tanstack/react-router";

// Server-side proxy to ÚGKK cadastre identify (bypasses browser CORS)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const UPSTREAM =
  "https://kataster.skgeodesy.sk/eskn/rest/services/NR/kn_wms_norm/MapServer/identify";

export const Route = createFileRoute("/api/public/kataster/identify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        try {
          const u = new URL(request.url);
          const qs = u.searchParams.toString();
          const upstreamUrl = `${UPSTREAM}?${qs}`;
          const res = await fetch(upstreamUrl, {
            headers: { Accept: "application/json" },
          });
          const body = await res.text();
          return new Response(body, {
            status: res.status,
            headers: {
              ...CORS,
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=60",
            },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ error: "upstream_failed", detail: String(err) }),
            { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
