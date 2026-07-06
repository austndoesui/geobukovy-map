import { Page } from "playwright";
import { ensureSearchPagePortal } from "./browser.js";

const ESKN = "https://kataster.skgeodesy.sk";
const OData = `${ESKN}/PortalODataPublic`;

interface SearchResult {
  lvNumber: string;
  kuCode: string;
  kuName: string;
  parcelNo: string;
}

interface SearchResponse {
  results: SearchResult[];
  captchaDetected: boolean;
}

function log(msg: string) {
  console.log(`[search] ${new Date().toISOString()} ${msg}`);
}

export async function searchFolios(
  page: Page,
  params: { kuCode?: string; kuName?: string; parcelNo?: string; lvNo?: string }
): Promise<SearchResponse> {
  const { parcelNo, lvNo } = params;
  log(`Search: parcel=${parcelNo} lv=${lvNo}`);

  const query = parcelNo || lvNo;
  if (!query) return { results: [], captchaDetected: false };

  // Ensure page is on Portal45 (captcha cookies needed for OData)
  await ensureSearchPagePortal(page);

  return await odataSearch(page, query);
}

async function xhrFetch(page: Page, url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await page.evaluate((fetchUrl) => {
        return new Promise((resolve) => {
          try {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", fetchUrl, true);
            xhr.withCredentials = true;
            xhr.onload = () => {
              if (xhr.status >= 400) {
                resolve({ _status: xhr.status, _body: (xhr.responseText || "").substring(0, 300) });
                return;
              }
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch {
                resolve({ _raw: (xhr.responseText || "").substring(0, 500) });
              }
            };
            xhr.onerror = () => resolve({ _error: "XHR error" });
            xhr.send();
          } catch (e: any) {
            resolve({ _error: e.message });
          }
        });
      }, url);
    } catch (err: any) {
      if (i < retries && (err.message?.includes("Execution context was destroyed") || err.message?.includes("navigation"))) {
        log(`xhrFetch navigation conflict, retry ${i + 1}/${retries}`);
        await page.waitForTimeout(2000);
        continue;
      }
      throw err;
    }
  }
}

async function odataSearch(page: Page, query: string): Promise<SearchResponse> {
  log(`OData: searching for "${query}"`);

  const isParcel = /[\d\/-]/.test(query) && !/^[a-zA-Z\s]+$/.test(query);
  let parcels: Array<{ no: string; folioId: number | null; cadastralUnitId: number }> = [];

  if (isParcel) {
    const esc = query.replace(/'/g, "''");
    const url = `${OData}/ParcelsC?$top=20&$filter=No eq '${esc}'&$select=Id,No,FolioId,CadastralUnitId`;
    let data = await xhrFetch(page, url);
    log(`OData: status=${data._status} value=${data?.value?.length || 0}`);
    if (data?._status === 401) return { results: [], captchaDetected: true };
    if (data?.value?.length) {
      parcels = data.value.map((p: any) => ({ no: p.No, folioId: p.FolioId, cadastralUnitId: p.CadastralUnitId }));
    }
    if (parcels.length === 0) {
      const url2 = `${OData}/ParcelsC?$top=20&$filter=contains(No, '${esc}')&$select=Id,No,FolioId,CadastralUnitId`;
      data = await xhrFetch(page, url2);
      if (data?._status === 401) return { results: [], captchaDetected: true };
      if (data?.value?.length) {
        parcels = data.value.map((p: any) => ({ no: p.No, folioId: p.FolioId, cadastralUnitId: p.CadastralUnitId }));
      }
    }
  }

  if (parcels.length === 0) {
    log("OData: no parcels found");
    return { results: [], captchaDetected: false };
  }

  const cuIds = [...new Set(parcels.map(p => p.cadastralUnitId))].filter(Boolean) as number[];
  const folioIds = [...new Set(parcels.map(p => p.folioId).filter(Boolean))] as number[];

  const cuMap: Record<number, { code: string; name: string }> = {};
  for (const cuId of cuIds.slice(0, 10)) {
    const d = await xhrFetch(page, `${OData}/CadastralUnits(${cuId})?$select=Id,Code,Name`);
    if (d?.Code != null) cuMap[cuId] = { code: String(d.Code), name: d.Name || "" };
  }

  const folioMap: Record<number, string> = {};
  for (const folioId of folioIds.slice(0, 10)) {
    const d = await xhrFetch(page, `${OData}/Folios(${folioId})?$select=Id,No`);
    if (d?.No != null) folioMap[folioId] = String(d.No);
  }

  const results: SearchResult[] = parcels.map(p => ({
    lvNumber: p.folioId ? (folioMap[p.folioId] || "") : "",
    kuCode: p.cadastralUnitId ? (cuMap[p.cadastralUnitId]?.code || "") : "",
    kuName: p.cadastralUnitId ? (cuMap[p.cadastralUnitId]?.name || "") : "",
    parcelNo: p.no,
  }));

  return { results, captchaDetected: false };
}
