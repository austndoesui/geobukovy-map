import { createFileRoute } from "@tanstack/react-router";

// Server-side proxy to ÚGKK cadastre identify (bypasses browser CORS)
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const UPSTREAMS = [
  "https://kataster.skgeodesy.sk/eskn/services/NR/kn_wms_norm/MapServer/WMSServer",
  "https://kataster.skgeodesy.sk/eskn/services/BA/kn_wms_norm/MapServer/WMSServer",
  "https://kataster.skgeodesy.sk/eskn/services/KE/kn_wms_norm/MapServer/WMSServer",
];

export const Route = createFileRoute("/api/public/kataster/identify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const qs = u.searchParams.toString();

        const results = await Promise.allSettled(
          UPSTREAMS.map(async (base) => {
            const ctrl = new AbortController();
            const id = setTimeout(() => ctrl.abort(), 4000);
            try {
              const res = await fetch(`${base}?${qs}`, {
                signal: ctrl.signal,
                headers: {
                  Accept: "application/json",
                  "User-Agent": UA,
                  Referer: "https://kataster.skgeodesy.sk/",
                },
              });
              clearTimeout(id);
              if (!res.ok) return null;
              const buf = await res.arrayBuffer();
              return new TextDecoder("utf-8").decode(buf);
            } catch {
              clearTimeout(id);
              return null;
            }
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled" && r.value) {
            return new Response(r.value, {
              status: 200,
              headers: {
                ...CORS,
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=60",
              },
            });
          }
        }

        return new Response(
          JSON.stringify({ error: "upstream_failed", detail: "All upstreams unreachable" }),
          { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      },
    },
  },
});
