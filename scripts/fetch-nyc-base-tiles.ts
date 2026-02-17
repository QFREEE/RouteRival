import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const NYC_BOUNDS = {
  minLat: 40.4774,
  maxLat: 40.9176,
  minLng: -74.2591,
  maxLng: -73.7004,
};

const MIN_ZOOM = 10;
const MAX_ZOOM = 14;
const TILE_SOURCE = "https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png";

function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function latToTileY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  const n = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return Math.floor(((1 - n / Math.PI) / 2) * 2 ** zoom);
}

function tileUrl(zoom: number, x: number, y: number): string {
  return TILE_SOURCE.replace("{z}", String(zoom)).replace("{x}", String(x)).replace("{y}", String(y));
}

async function fetchTile(z: number, x: number, y: number, outputRoot: string): Promise<boolean> {
  const response = await fetch(tileUrl(z, x, y));
  if (!response.ok) {
    return false;
  }

  const arrayBuffer = await response.arrayBuffer();
  const destination = path.join(outputRoot, String(z), String(x), `${y}.png`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(arrayBuffer));
  return true;
}

async function runBatch<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const running = new Set<Promise<void>>();

  async function launch(item: T) {
    await worker(item);
  }

  while (index < items.length || running.size > 0) {
    while (index < items.length && running.size < limit) {
      const promise = launch(items[index]);
      running.add(promise);
      void promise.finally(() => running.delete(promise));
      index += 1;
    }

    if (running.size > 0) {
      await Promise.race(running);
    }
  }
}

async function main() {
  const root = process.cwd();
  const outputRoot = path.join(root, "public", "tiles", "nyc");
  let requested = 0;
  let downloaded = 0;

  for (let z = MIN_ZOOM; z <= MAX_ZOOM; z += 1) {
    const minX = lonToTileX(NYC_BOUNDS.minLng, z);
    const maxX = lonToTileX(NYC_BOUNDS.maxLng, z);
    const minY = latToTileY(NYC_BOUNDS.maxLat, z);
    const maxY = latToTileY(NYC_BOUNDS.minLat, z);

    const jobs: Array<{ z: number; x: number; y: number }> = [];
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        jobs.push({ z, x, y });
      }
    }

    requested += jobs.length;
    await runBatch(jobs, 10, async (job) => {
      const ok = await fetchTile(job.z, job.x, job.y, outputRoot);
      if (ok) {
        downloaded += 1;
      }
    });

    console.log(`zoom ${z}: ${jobs.length} tiles requested`);
  }

  const metadata = {
    generatedAt: new Date().toISOString(),
    source: TILE_SOURCE,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    requested,
    downloaded,
    bounds: NYC_BOUNDS,
  };

  await writeFile(path.join(outputRoot, "metadata.json"), JSON.stringify(metadata, null, 2));
  console.log(`Saved ${downloaded}/${requested} NYC tiles to public/tiles/nyc`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
