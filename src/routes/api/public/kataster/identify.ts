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

async function tryUpstream(url: string, signal: AbortSignal): Promise<Response | null> {
  try {
    const res = await fetch(url, {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent": UA,
        Referer: "https://kataster.skgeodesy.sk/",
      },
    });
    return res;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/kataster/identify")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const qs = u.searchParams.toString();
        const errors: string[] = [];

        for (const base of UPSTREAMS) {
          const ctrl = new AbortController();
          const id = setTimeout(() => ctrl.abort(), 8000);
          try {
            const res = await tryUpstream(`${base}?${qs}`, ctrl.signal);
            clearTimeout(id);
            if (res) {
              const body = await res.text();
              return new Response(body, {
                status: res.status,
                headers: {
                  ...CORS,
                  "Content-Type": "application/json",
                  "Cache-Control": "public, max-age=60",
                },
              });
            }
            errors.push(`${base}: no response`);
          } catch (e) {
            clearTimeout(id);
            errors.push(`${base}: ${String(e)}`);
          }
        }

        return new Response(
          JSON.stringify({ error: "upstream_failed", detail: "All upstreams unreachable", attempts: errors }),
          { status: 502, headers: { ...CORS, "Content-Type": "application/json" } },
        );
      },
    },
  },
});
