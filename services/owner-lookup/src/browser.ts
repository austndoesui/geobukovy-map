import { chromium, BrowserContext, Browser, Page } from "playwright";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

const USER_DATA_DIR =
  process.env.PLAYWRIGHT_DATA_DIR || join(process.cwd(), ".browser-data");
const HEADLESS = process.env.HEADLESS !== "false";
const CDP_URL = process.env.CDP_URL || "http://localhost:9222";

let ctx: BrowserContext | null = null;
let cdpBrowser: Browser | null = null;
let searchPage: Page | null = null;

export async function getContext(): Promise<BrowserContext> {
  if (ctx) return ctx;

  if (!HEADLESS) {
    console.log(`[browser] Connecting to Chromium via CDP at ${CDP_URL}`);
    try {
      cdpBrowser = await chromium.connectOverCDP(CDP_URL);
      const contexts = cdpBrowser.contexts();
      if (contexts.length > 0) {
        ctx = contexts[0];
      } else {
        ctx = await cdpBrowser.newContext({
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          locale: "sk-SK",
          timezoneId: "Europe/Bratislava",
          bypassCSP: true,
        });
      }
      return ctx;
    } catch (e) {
      console.log(`[browser] CDP connect failed: ${String(e).substring(0, 200)}`);
      console.log(`[browser] Falling back to launchPersistentContext`);
    }
  }

  if (!existsSync(USER_DATA_DIR)) {
    mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  console.log(
    `[browser] Launching persistent context (headless=${HEADLESS}, profile=${USER_DATA_DIR})`
  );

  ctx = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: HEADLESS,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
    ],
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    locale: "sk-SK",
    timezoneId: "Europe/Bratislava",
    bypassCSP: true,
  });

  return ctx;
}

export async function getPage() {
  const context = await getContext();
  return await context.newPage();
}

export async function getSearchPage(): Promise<Page> {
  if (searchPage && !searchPage.isClosed()) {
    return searchPage;
  }
  const context = await getContext();
  searchPage = await context.newPage();
  console.log("[browser] Created persistent search page");
  return searchPage;
}

export async function ensureSearchPagePortal(page: Page): Promise<void> {
  const url = page.url();
  if (!url || url === "about:blank") {
    await page.goto("https://kataster.skgeodesy.sk/Portal45/sk/Home/Index", {
      waitUntil: "domcontentloaded", timeout: 20000,
    }).catch(() => {});
    // Wait for Portal45 redirects to settle
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const finalUrl = page.url();
    console.log(`[browser] ensureSearchPagePortal: final URL = ${finalUrl}`);
  }
}

export async function closeBrowser() {
  if (cdpBrowser) await cdpBrowser.close().catch(() => {});
  if (searchPage && !searchPage.isClosed()) await searchPage.close().catch(() => {});
  if (ctx) await ctx.close().catch(() => {});
  cdpBrowser = null;
  searchPage = null;
  ctx = null;
}

process.on("SIGTERM", () => {
  closeBrowser().catch(() => {});
});
