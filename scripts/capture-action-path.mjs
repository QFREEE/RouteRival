import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

function getArg(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function findSubwayMarker(page, excludeLabel = "") {
  const markers = page.locator(".leaflet-interactive");
  const count = await markers.count();

  for (let index = 0; index < count; index += 1) {
    const marker = markers.nth(index);
    try {
      await marker.hover({ force: true, timeout: 700 });
      await sleep(120);
      const tooltip = page.locator(".leaflet-tooltip").last();
      const text = (await tooltip.textContent({ timeout: 500 })) ?? "";
      if (text.includes("SUBWAY_STATION") && (!excludeLabel || !text.includes(excludeLabel))) {
        return { marker, label: text.trim() };
      }
    } catch {
    }
  }

  return null;
}

const url = getArg("url", "http://localhost:3000/challenge/today");
const outDir = getArg("outDir", "artifacts/action-path");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  await mkdir(outDir, { recursive: true });
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector(".challenge-map", { timeout: 30000 });
  await page.waitForFunction(() => {
    const map = document.querySelector(".challenge-map");
    if (!map) return false;
    const rect = map.getBoundingClientRect();
    return rect.width > 300 && rect.height > 250;
  });

  await page.screenshot({ path: `${outDir}/01-start.png`, fullPage: true });

  const firstSubway = await findSubwayMarker(page);
  if (!firstSubway) {
    throw new Error("Could not find a visible subway station marker.");
  }

  await firstSubway.marker.hover({ force: true });
  await sleep(180);
  await page.screenshot({ path: `${outDir}/02-hover-subway-preview.png`, fullPage: true });

  await firstSubway.marker.click({ force: true });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${outDir}/03-after-walk-to-subway.png`, fullPage: true });

  const stationName = firstSubway.label.split(" (")[0]?.trim() ?? "";
  const secondSubway = await findSubwayMarker(page, stationName);
  if (secondSubway) {
    await secondSubway.marker.click({ force: true });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/04-after-subway-hop.png`, fullPage: true });
  }

  console.log(`Action path screenshots saved in: ${outDir}`);
} finally {
  await browser.close();
}
