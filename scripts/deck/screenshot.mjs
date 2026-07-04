// Screenshot script for the EchoID deck.
//
// Uses puppeteer-core driving the system Chrome. Captures ~6 screenshots
// straight to /tmp/echoid-deck/shots/ at 1440x900 (16:10 to match slide 16:9
// with a small letterbox).
//
// It handles:
//  - dark theme rendering with fonts loaded
//  - reveal page: wait past the 3s "listening" then screenshot the reveal
//  - reveal page: click "unlock" and screenshot the full card
//  - debug/roles gallery (mosaic of 12 role posters)

import puppeteer from "puppeteer-core";
import fs from "node:fs/promises";

const BROWSER = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:3000";
const RESULT_ID = process.env.RESULT_ID;
const CARD_ID = process.env.CARD_ID;
const OUT_DIR = "/tmp/echoid-deck/shots";

if (!RESULT_ID) {
  console.error("RESULT_ID env is required");
  process.exit(1);
}

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

async function shot(page, url, name, opts = {}) {
  console.log(`→ ${name}: ${url}`);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
  // Web-font settle.
  await new Promise((r) => setTimeout(r, opts.settleMs ?? 1200));
  if (opts.before) await opts.before(page);
  const path = `${OUT_DIR}/${name}.png`;
  await page.screenshot({
    path,
    fullPage: !!opts.fullPage,
    omitBackground: false,
  });
  console.log(`  saved ${path}`);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath: BROWSER,
    headless: "new",
    defaultViewport: VIEWPORT,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--font-render-hinting=medium",
      "--force-color-profile=srgb",
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(VIEWPORT);
    // Kill autoplay of any animation-heavy things — none, but this reduces flicker.
    await page.emulateMediaFeatures([
      { name: "prefers-reduced-motion", value: "no-preference" },
    ]);
    // Disable debug overlay so it doesn't clutter marketing shots.
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("echoid_debug", "0"); } catch {}
    });

    // 1. Landing hero.
    await shot(page, `${BASE}/`, "01-landing");

    // 2. Recording page (idle state).
    await shot(page, `${BASE}/record`, "02-record-idle");

    // 3. Reveal — wait past 3s "listening" phase.
    await shot(page, `${BASE}/result/${RESULT_ID}`, "03-reveal", {
      settleMs: 3800,
    });

    // 4. Full card — click "unlock" and wait for the full card to render.
    await shot(page, `${BASE}/result/${RESULT_ID}`, "04-fullcard", {
      settleMs: 3600,
      before: async (p) => {
        // Click the unlock button by text ("解锁完整卡片").
        const clicked = await p.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const b = btns.find((el) => (el.textContent || "").includes("解锁"));
          if (b) { b.click(); return true; }
          return false;
        });
        if (!clicked) console.warn("  ! unlock button not found");
        // Wait for radar (marker of the FullCard mount).
        await p
          .waitForSelector('svg[aria-label="六维雷达图"]', { timeout: 8000 })
          .catch(() => console.warn("  ! radar did not appear"));
        await new Promise((r) => setTimeout(r, 1500));
      },
      fullPage: true,
    });

    // 5. Debug roles gallery.
    await shot(page, `${BASE}/debug/roles`, "05-roles", { fullPage: true });

    // 6. Share landing page (if we have a cardId).
    if (CARD_ID) {
      await shot(page, `${BASE}/s/${CARD_ID}`, "06-share");
    }

    console.log("done");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
