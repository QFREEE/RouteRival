import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Source = {
  key: string;
  url: string;
  fileName: string;
};

const SOURCES: Source[] = [
  { key: "subway", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip", fileName: "gtfs_subway.zip" },
  { key: "bus-brooklyn", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_b.zip", fileName: "gtfs_b.zip" },
  { key: "bus-bronx", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_bx.zip", fileName: "gtfs_bx.zip" },
  { key: "bus-manhattan", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip", fileName: "gtfs_m.zip" },
  { key: "bus-queens", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip", fileName: "gtfs_q.zip" },
  { key: "bus-staten-island", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_si.zip", fileName: "gtfs_si.zip" },
  { key: "bus-company", url: "https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip", fileName: "gtfs_busco.zip" },
  {
    key: "citibike-station-information",
    url: "https://gbfs.citibikenyc.com/gbfs/en/station_information.json",
    fileName: "citibike_station_information.json",
  },
];

function getArg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .map((item) => item.trim())
    .find((item) => item.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

function dateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function main() {
  const snapshotDate = getArg("date") ?? dateKey();
  const root = process.cwd();
  const rawDir = path.join(root, "data", "snapshots", snapshotDate, "raw");

  await mkdir(rawDir, { recursive: true });

  const downloads: Array<{
    key: string;
    url: string;
    fileName: string;
    bytes: number;
    sha256: string;
  }> = [];

  for (const source of SOURCES) {
    const payload = await fetchBuffer(source.url);
    const destination = path.join(rawDir, source.fileName);
    await writeFile(destination, payload);

    downloads.push({
      key: source.key,
      url: source.url,
      fileName: source.fileName,
      bytes: payload.byteLength,
      sha256: sha256(payload),
    });

    console.log(`Downloaded ${source.fileName} (${payload.byteLength} bytes)`);
  }

  const metadata = {
    snapshotDate,
    generatedAt: new Date().toISOString(),
    downloads,
  };

  await writeFile(path.join(rawDir, "metadata.json"), JSON.stringify(metadata, null, 2));
  console.log(`Snapshot raw data saved to data/snapshots/${snapshotDate}/raw`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
