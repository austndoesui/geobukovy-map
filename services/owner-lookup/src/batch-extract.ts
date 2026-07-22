import { Page } from "playwright";

const ESKN_PORTAL = "https://kataster.skgeodesy.sk/Portal45";
const BO_API = "https://kataster.skgeodesy.sk/Portal45/api/Bo";

const cache = new Map<string, { data: Record<string, unknown>; ts: number }>();
const CACHE_TTL = 3600000;

async function ensureSession(page: Page): Promise<boolean> {
  try {
    await page.goto(ESKN_PORTAL + "/sk/Home/Index", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    const title = await page.title();
    console.log(`[batch-extract] Session page title="${title}"`);
    const hasCaptcha = await page.evaluate(() => {
      return (
        document.title.includes("Just a moment") ||
        document.querySelector("#cf-please-wait") !== null ||
        document.body?.innerText?.includes("reCAPTCHA")
      );
    });
    if (hasCaptcha) {
      console.log("[batch-extract] Captcha detected");
      return false;
    }
    return true;
  } catch (e) {
    console.log(`[batch-extract] Session failed: ${String(e).substring(0, 200)}`);
    return false;
  }
}

async function parseOwnerTable(page: Page) {
  await page.waitForTimeout(2000);

  const owners = await page.evaluate(() => {
    const results: Array<{ meno: string; adresa: string; podiel: string }> = [];
    const tables = Array.from(document.querySelectorAll("table"));
    let dataTable: HTMLTableElement | null = null;

    for (const t of tables) {
      const text = t.textContent || "";
      if (text.includes("Vlastník") && text.includes("Počet vlastníkov")) {
        const next = t.nextElementSibling;
        if (next && next.tagName === "TABLE") dataTable = next as HTMLTableElement;
        break;
      }
    }

    if (!dataTable) return results;

    const rows = dataTable.querySelectorAll("tr");
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll("td");
      if (cells.length < 2) continue;
      const first = (cells[0]?.textContent || "").trim();
      if (first === "Poradové číslo" || !first) continue;
      const raw = (cells[1]?.textContent || "").replace(/\s+/g, " ").trim();
      const podiel = (cells[2]?.textContent || "").replace(/\s+/g, " ").trim();
      if (raw && raw.length > 3) {
        const parts = raw.split(/,\s*/);
        results.push({
          meno: parts[0] || raw,
          adresa: parts.length > 1 ? parts.slice(1).join(", ").replace(/,?\s*IČO:.*$/, "").trim() : "",
          podiel,
        });
      }
    }
    return results;
  });

  return owners;
}

export async function batchExtractOwners(
  page: Page,
  requests: Array<{ lv: string; kuCode: string; lat: number; lng: number; parcelNo: string }>,
) {
  const sessionOk = await ensureSession(page);
  if (!sessionOk) {
    console.log("[batch-extract] No session — returning empty");
    return requests.map(() => ({ lv: "", ku: "", parcelNo: "", owners: [] }));
  }

  const results: Record<string, unknown>[] = [];

  for (const req of requests) {
    const key = `${req.kuCode}_${req.lv}`;
    const cached = cache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      results.push(cached.data);
      continue;
    }

    const url = `${BO_API}/GeneratePrfPublic?prfNumber=${req.lv}&cadastralUnitCode=${req.kuCode}&outputType=html`;
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    } catch (e) {
      console.log(`[batch-extract] goto failed ${key}: ${String(e).substring(0, 150)}`);
      results.push({ lv: req.lv, ku: req.kuCode, parcelNo: req.parcelNo, owners: [] });
      continue;
    }

    const owners = await parseOwnerTable(page);
    const data = { lv: req.lv, ku: req.kuCode, parcelNo: req.parcelNo, owners };
    cache.set(key, { data, ts: Date.now() });
    results.push(data);
  }

  return results;
}
