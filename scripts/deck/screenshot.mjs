// Screenshot script for the VBTI hackathon deck (2nd generation).
//
// Captures the actual production VBTI UI pages (dark detective theme):
//   01-landing            /
//   02-record-intro       /record  (default first phase — case-file menu)
//   03-result-reveal      /result/<id>  during the 2.4s "取证中" listening phase
//   04-result-full        /result/<id>  after unlock (the 判决书 view)
//   05-share              /s/<cardId>   public 判决书 landing
//   06-persona-gallery    /debug/roles  if still around, else skip
//
// Uses puppeteer-core driving system Chrome. Renders at 1440x900 @2x
// (so screenshots come out ~2880x1800 for print-quality slide placement).

import puppeteer from "puppeteer-core";
import fs from "node:fs/promises";

const BROWSER = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.BASE || "http://localhost:3000";
const RESULT_ID = process.env.RESULT_ID;
const CARD_ID = process.env.CARD_ID;
const OUT_DIR = "/tmp/echoid-deck/shots";

if (!RESULT_ID || !CARD_ID) {
  console.error("RESULT_ID and CARD_ID env vars are required");
  process.exit(1);
}

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 2 };

async function shot(page, url, name, opts = {}) {
  console.log(`→ ${name}: ${url}`);
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, opts.settleMs ?? 1400));
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
    // Disable the dev debug overlay if it's on.
    await page.evaluateOnNewDocument(() => {
      try { localStorage.setItem("echoid_debug", "0"); } catch {}
    });

    // 01 · Landing
    await shot(page, `${BASE}/`, "01-landing", { fullPage: true });

    // 02 · Record intro (case-file menu — the default first phase)
    await shot(page, `${BASE}/record`, "02-record-intro", { fullPage: true });

    // 03 · Result reveal — capture during the "取证中" listening stage.
    // ResultReveal spends 2400ms in "listening" before advancing to "reveal".
    // We wait ~1600ms so the scan line and copy are visible.
    await shot(
      page,
      `${BASE}/result/${RESULT_ID}`,
      "03-result-reveal",
      { settleMs: 1500 },
    );

    // 04 · Result full — click the "公开处刑 · 解锁完整判决书" button,
    // wait for the radar / stat bars to render.
    await shot(
      page,
      `${BASE}/result/${RESULT_ID}`,
      "04-result-full",
      {
        settleMs: 3600,
        fullPage: true,
        before: async (p) => {
          // Wait past the 2400ms listening phase → reveal button appears
          await new Promise((r) => setTimeout(r, 2600));
          const clicked = await p.evaluate(() => {
            const btns = Array.from(document.querySelectorAll("button, a"));
            const b = btns.find((el) => (el.textContent || "").includes("解锁"));
            if (b instanceof HTMLElement) { b.click(); return true; }
            return false;
          });
          if (!clicked) console.warn("  ! reveal-unlock button not found");
          // Wait for the FullCard to mount — look for '声音暴露指数' text
          // which is unique to the unlocked view.
          await p
            .waitForFunction(
              () => document.body.innerText.includes("声音暴露指数"),
              { timeout: 8000 },
            )
            .catch(() => console.warn("  ! 声音暴露指数 did not appear"));
          await new Promise((r) => setTimeout(r, 1400));
        },
      },
    );

    // 05 · Share landing
    await shot(page, `${BASE}/s/${CARD_ID}`, "05-share", { fullPage: true });

    // 06 · Persona gallery (dev-only debug page)
    await shot(page, `${BASE}/debug/roles`, "06-personas", { fullPage: true });

    console.log("done");
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
