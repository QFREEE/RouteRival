import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

const url = getArg("url", "http://localhost:3000/challenge/today");
const outPath = getArg("out", "artifacts/challenge-today.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".challenge-map", { timeout: 30000 });
  await page.waitForFunction(() => {
    const map = document.querySelector(".challenge-map");
    if (!map) {
      return false;
    }
    const rect = map.getBoundingClientRect();
    return rect.width > 300 && rect.height > 250;
  });

  const diagnostics = await page.evaluate(() => {
    const map = document.querySelector(".challenge-map");
    const markerCount = document.querySelectorAll(".leaflet-interactive").length;
    if (!map) {
      return { hasMap: false, width: 0, height: 0, markerCount };
    }

    const rect = map.getBoundingClientRect();
    return {
      hasMap: true,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      markerCount,
    };
  });

  if (!diagnostics.hasMap || diagnostics.width < 300 || diagnostics.height < 250) {
    throw new Error(`Map container invalid: ${JSON.stringify(diagnostics)}`);
  }

  await mkdir(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath, fullPage: true });
  console.log(`Screenshot saved: ${outPath}`);
  console.log(`Map diagnostics: ${JSON.stringify(diagnostics)}`);
} finally {
  await browser.close();
}
