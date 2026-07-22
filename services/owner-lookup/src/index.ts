import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { getPage, getSearchPage, closeBrowser } from "./browser.js";
import { extractOwners } from "./extract.js";
import { searchFolios } from "./search.js";


const app = new Hono();
app.use("/*", cors());

app.get("/api/health", (c) => c.json({ ok: true }));

app.post("/api/owners/batch", async (c) => {
  const body = await c.req.json();
  const requests: Array<{ lat: number; lng: number; kuCode: string; parcelNo: string; lv: string }> = body.requests || [];

  if (requests.length === 0) {
    return c.json({ error: "no requests provided" }, 400);
  }

  let page;
  try {
    page = await getPage();
    const results = [];
    for (const req of requests) {
      const detail = await extractOwners(page, req.lat, req.lng, req.kuCode, req.parcelNo, req.lv);
      results.push(detail);
    }
    return c.json({ results });
  } catch (err: any) {
    return c.json({ error: "batch_extraction_failed", detail: err?.message || String(err) }, 502);
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

app.post("/api/owners", async (c) => {
  const body = await c.req.json();
  const { lat, lng, kuCode, parcelNo, lv } = body;

  if (lat == null || lng == null) {
    return c.json({ error: "lat and lng are required" }, 400);
  }

  let page;
  try {
    page = await getPage();
    const detail = await extractOwners(page, lat, lng, kuCode, parcelNo, lv);
    return c.json(detail);
  } catch (err: any) {
    return c.json({ error: "extraction_failed", detail: err?.message || String(err) }, 502);
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

app.post("/api/search", async (c) => {
  const body = await c.req.json();
  const { kuCode, kuName, parcelNo, lvNo } = body;

  try {
    const page = await getSearchPage();
    console.log(`[search] Starting searchFolios with kuCode=${kuCode} lvNo=${lvNo}`);
    const result = await searchFolios(page, { kuCode, kuName, parcelNo, lvNo });
    console.log(`[search] Result: ${JSON.stringify(result)}`);
    return c.json(result);
  } catch (err: any) {
    console.log(`[search] Error: ${err?.message || String(err)}`);
    console.log(`[search] Stack: ${err?.stack || ""}`);
    return c.json({ error: "search_failed", detail: err?.message || String(err) }, 502);
  }
});

app.get("/api/captcha-setup", async (c) => {
  let page;
  try {
    page = await getPage();
    await page.goto("https://kataster.skgeodesy.sk/Portal45/api/Bo/GeneratePrfPublic?prfNumber=3681&cadastralUnitCode=839914&outputType=html", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    const title = await page.title();
    const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || "");
    const hasCaptcha = bodyText.includes("reCAPTCHA") || bodyText.includes("Prebieha") || bodyText.includes("spracovanie");
    return c.json({
      status: "ok",
      title,
      hasCaptcha,
      note: hasCaptcha
        ? "reCAPTCHA detected. Open http://localhost:6080/vnc.html to solve it. After solving, cookies persist automatically."
        : "No captcha detected — portal may already be accessible!",
      vncUrl: "http://localhost:6080/vnc.html",
    });
  } catch (err: any) {
    return c.json({ status: "error", detail: err?.message || String(err) }, 502);
  } finally {
    if (page) await page.close().catch(() => {});
  }
});

const PORT = parseInt(process.env.PORT || "3001", 10);
serve({ fetch: app.fetch, port: PORT });
console.log("owner-lookup service listening on :" + PORT);
console.log("noVNC available at http://localhost:6080/vnc.html");

process.on("SIGTERM", async () => {
  await closeBrowser();
  process.exit(0);
});
