import { Page } from "playwright";

const ESKN_PORTAL = "https://kataster.skgeodesy.sk/Portal45";
const ODATA_BASE = "https://kataster.skgeodesy.sk/PortalODataPublic";
const BO_API = "https://kataster.skgeodesy.sk/Portal45/api/Bo";

interface Owner {
  meno: string;
  adresa: string;
  podiel: string;
}

interface ExtractResult {
  lv: string;
  ku: string;
  parcelNo: string;
  owners: Owner[];
}

function log(msg: string) {
  console.log(`[extract] ${new Date().toISOString()} ${msg}`);
}

async function safeGoto(page: Page, url: string, timeout = 30000): Promise<boolean> {
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout });
    return true;
  } catch (e) {
    log(`goto failed: ${url} — ${String(e).substring(0, 200)}`);
    return false;
  }
}

async function extractOwnersFromPage(page: Page): Promise<Owner[]> {
  await page.waitForTimeout(2000);

  const debug = await page.evaluate(() => {
    return { title: document.title, tables: document.querySelectorAll("table").length };
  });
  log(`Page: title="${debug.title}" tables=${debug.tables}`);

  if (!debug.title.includes("LV")) return [];

  // The LV document has a "Vlastník" section header (table index varies)
  // Find it by looking for a table cell containing "Vlastník"
  const owners = await page.evaluate(() => {
    const results: Array<{ meno: string; adresa: string; podiel: string }> = [];

    // Find the "Vlastník" header table, then get the next sibling table with data
    const allTables = Array.from(document.querySelectorAll("table"));
    let ownerDataTable: HTMLTableElement | null = null;

    for (const table of allTables) {
      const text = table.textContent || "";
      // The header table says "Vlastník" and "Počet vlastníkov: X"
      if (text.includes("Vlastník") && text.includes("Počet vlastníkov")) {
        // The data table is the next table after this one
        const nextTable = table.nextElementSibling;
        if (nextTable && nextTable.tagName === "TABLE") {
          ownerDataTable = nextTable as HTMLTableElement;
        }
        break;
      }
    }

    if (!ownerDataTable) return results;

    const rows = ownerDataTable.querySelectorAll("tr");
    for (let i = 0; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll("td");
      if (cells.length < 2) continue;

      // Header row has "Poradové číslo" - skip it
      const firstCellText = cells[0]?.textContent?.trim() || "";
      if (firstCellText === "Poradové číslo" || firstCellText === "") continue;

      // Data rows: cell[0] = order number, cell[1] = name + address, cell[2] = share
      const rawName = cells[1]?.textContent?.replace(/\s+/g, " ").trim() || "";
      const podiel = cells[2]?.textContent?.replace(/\s+/g, " ").trim() || "";

      if (rawName && rawName.length > 3) {
        // Split name from address at first comma (name is before first comma)
        const parts = rawName.split(/,\s*/);
        const meno = parts[0] || rawName;
        const adresa = parts.length > 1 ? parts.slice(1).join(", ").replace(/,?\s*IČO:.*$/, "").trim() : "";
        results.push({ meno, adresa, podiel });
      }
    }

    return results;
  });

  if (owners.length > 0) {
    log(`Found ${owners.length} owners from DOM: ${JSON.stringify(owners)}`);
    return owners;
  }

  // Fallback: dump all table structures for debugging
  const tableDump = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("table")).map((t, i) => {
      const text = t.textContent?.substring(0, 100) || "";
      return `[${i}] rows=${t.querySelectorAll("tr").length} text="${text.replace(/\s+/g, " ").trim()}"`;
    });
  });
  log(`Fallback: no owners found. Tables: ${tableDump.join(" | ")}`);

  return [];
}

export async function extractOwners(
  page: Page,
  lat: number,
  lng: number,
  kuCode?: string,
  parcelNo?: string,
  lvNumber?: string
): Promise<ExtractResult> {
  const result: ExtractResult = {
    lv: lvNumber || "",
    ku: kuCode || "",
    parcelNo: parcelNo || "",
    owners: [],
  };

  log(`Starting extraction: lv=${result.lv} ku=${result.ku} parcel=${result.parcelNo}`);

  // Strategy 1: If we have LV + KU, go straight to GeneratePrfPublic
  if (result.lv && result.ku) {
    log(`Strategy 1: GeneratePrfPublic for LV ${result.lv} KU ${result.ku}`);
    const prfUrl = `${BO_API}/GeneratePrfPublic?prfNumber=${result.lv}&cadastralUnitCode=${result.ku}&outputType=html`;
    if (await safeGoto(page, prfUrl)) {
      result.owners = await extractOwnersFromPage(page);
      log(`Strategy 1: found ${result.owners.length} owners`);
      if (result.owners.length > 0) return result;
    }
  }

  // Strategy 2: Use OData to find LV from page context, then fetch owner doc
  if (!result.lv && result.ku && result.parcelNo) {
    log(`Strategy 2: OData search for KU ${result.ku} parcel ${result.parcelNo}`);
    await safeGoto(page, ESKN_PORTAL + "/");
    await page.waitForTimeout(2000);

    const odataResult = await page.evaluate(async (args: { odataBase: string; ku: string; parcel: string }) => {
      try {
        const filter = `CadastralUnit/Code eq ${args.ku} and ParcelsC/any(p: p/No eq '${args.parcel}')`;
        const odataUrl = `${args.odataBase}/Folios?$filter=${encodeURIComponent(filter)}&$select=No&$top=5`;
        const res = await fetch(odataUrl, { credentials: "include" });
        if (!res.ok) return { lv: null, status: res.status };
        const data = await res.json();
        if (data.value?.length > 0) return { lv: String(data.value[0].No), status: res.status };
        return { lv: null, status: res.status, count: data.value?.length || 0 };
      } catch (e) {
        return { lv: null, error: String(e) };
      }
    }, { odataBase: ODATA_BASE, ku: result.ku, parcel: result.parcelNo });

    log(`OData result: LV=${odataResult.lv} status=${odataResult.status} error=${odataResult.error || ""}`);

    if (odataResult.lv) {
      result.lv = odataResult.lv;
    }
  }

  // Strategy 3: GeneratePrfPublic with found LV
  if (result.lv && result.ku) {
    log(`Strategy 3: GeneratePrfPublic for LV ${result.lv} KU ${result.ku}`);
    const prfUrl = `${BO_API}/GeneratePrfPublic?prfNumber=${result.lv}&cadastralUnitCode=${result.ku}&outputType=html`;
    if (await safeGoto(page, prfUrl)) {
      result.owners = await extractOwnersFromPage(page);
      log(`Strategy 3: found ${result.owners.length} owners`);
    }
  }

  log(`Final result: ${result.owners.length} owners, LV=${result.lv}`);
  return result;
}
