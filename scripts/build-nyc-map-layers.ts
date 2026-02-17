import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CsvRecord = Record<string, string>;

type NodeSeed = {
  sourceId: string;
  type: "SUBWAY_STATION" | "BUS_STOP" | "BIKE_DOCK";
  name: string;
  lat: number;
  lng: number;
};

type LineFeature = {
  type: "Feature";
  properties: Record<string, string | number>;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
};

const NYC_BOUNDS = {
  minLat: 40.4774,
  maxLat: 40.9176,
  minLng: -74.2591,
  maxLng: -73.7004,
};

const BUS_FEED_FILES = ["gtfs_b.zip", "gtfs_bx.zip", "gtfs_m.zip", "gtfs_q.zip", "gtfs_si.zip", "gtfs_busco.zip"];

const OUTPUT_FILES = [
  "subway_lines.geojson",
  "bus_lines.geojson",
  "subway_stations.json",
  "bus_stops.json",
  "bike_stations.json",
  "nodes.seed.json",
  "metadata.json",
] as const;

function getArg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .map((item) => item.trim())
    .find((item) => item.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

function defaultSnapshotDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function csvLineToFields(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      fields.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  fields.push(current);
  return fields;
}

function parseCsv(text: string): CsvRecord[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) {
    return [];
  }

  const headers = csvLineToFields(lines[0]);
  const rows: CsvRecord[] = [];

  for (let index = 1; index < lines.length; index += 1) {
    const fields = csvLineToFields(lines[index]);
    if (fields.length === 1 && fields[0] === "") {
      continue;
    }

    const record: CsvRecord = {};
    for (let headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
      record[headers[headerIndex]] = fields[headerIndex] ?? "";
    }
    rows.push(record);
  }

  return rows;
}

function readZipText(zipFilePath: string, innerFileName: string): string {
  return execFileSync("unzip", ["-p", zipFilePath, innerFileName], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 512,
  });
}

function isWithinNyc(lat: number, lng: number): boolean {
  return lat >= NYC_BOUNDS.minLat && lat <= NYC_BOUNDS.maxLat && lng >= NYC_BOUNDS.minLng && lng <= NYC_BOUNDS.maxLng;
}

function toNumber(value: string): number {
  return Number.parseFloat(value);
}

function buildLineFeatures(zipFilePath: string, routeType: "1" | "3", feed: string): LineFeature[] {
  const routes = parseCsv(readZipText(zipFilePath, "routes.txt"));
  const trips = parseCsv(readZipText(zipFilePath, "trips.txt"));
  const shapes = parseCsv(readZipText(zipFilePath, "shapes.txt"));

  const routeById = new Map(
    routes
      .filter((route) => route.route_type === routeType)
      .map((route) => [route.route_id, route] as const),
  );

  const shapeByRoute = new Map<string, string>();
  for (const trip of trips) {
    if (!routeById.has(trip.route_id) || !trip.shape_id) {
      continue;
    }
    if (!shapeByRoute.has(trip.route_id)) {
      shapeByRoute.set(trip.route_id, trip.shape_id);
    }
  }

  const pointsByShape = new Map<string, Array<{ lat: number; lng: number; seq: number }>>();
  for (const row of shapes) {
    const shapeId = row.shape_id;
    if (!shapeId) {
      continue;
    }
    const lat = toNumber(row.shape_pt_lat);
    const lng = toNumber(row.shape_pt_lon);
    const seq = Number.parseInt(row.shape_pt_sequence, 10);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(seq) || !isWithinNyc(lat, lng)) {
      continue;
    }

    const existing = pointsByShape.get(shapeId) ?? [];
    existing.push({ lat, lng, seq });
    pointsByShape.set(shapeId, existing);
  }

  const features: LineFeature[] = [];
  for (const [routeId, shapeId] of shapeByRoute.entries()) {
    const route = routeById.get(routeId);
    const points = pointsByShape.get(shapeId);
    if (!route || !points || points.length < 2) {
      continue;
    }

    points.sort((a, b) => a.seq - b.seq);
    const coordinates = points.map((point) => [point.lng, point.lat]);

    features.push({
      type: "Feature",
      properties: {
        feed,
        routeId,
        routeShortName: route.route_short_name ?? "",
        routeLongName: route.route_long_name ?? "",
        routeType: route.route_type ?? "",
      },
      geometry: {
        type: "LineString",
        coordinates,
      },
    });
  }

  return features;
}

function uniqueNodes(nodes: NodeSeed[]): NodeSeed[] {
  const byId = new Map<string, NodeSeed>();
  for (const node of nodes) {
    byId.set(node.sourceId, node);
  }
  return Array.from(byId.values());
}

async function buildBikeStations(rawDir: string): Promise<NodeSeed[]> {
  const source = await readFile(path.join(rawDir, "citibike_station_information.json"), "utf8");
  const payload = JSON.parse(source) as {
    data?: {
      stations?: Array<{
        station_id: string;
        name: string;
        lat: number;
        lon: number;
      }>;
    };
  };

  const stations = payload.data?.stations ?? [];
  return stations
    .filter((station) => Number.isFinite(station.lat) && Number.isFinite(station.lon) && isWithinNyc(station.lat, station.lon))
    .map((station) => ({
      sourceId: `citibike:${station.station_id}`,
      type: "BIKE_DOCK" as const,
      name: `Citi Bike ${station.name}`,
      lat: station.lat,
      lng: station.lon,
    }));
}

function buildSubwayStations(subwayZipPath: string): NodeSeed[] {
  const stops = parseCsv(readZipText(subwayZipPath, "stops.txt"));
  const stationCandidates = stops.filter((stop) => stop.location_type === "1");
  const chosen = stationCandidates.length > 0 ? stationCandidates : stops.filter((stop) => stop.location_type !== "1");

  return chosen
    .map((stop) => {
      const lat = toNumber(stop.stop_lat);
      const lng = toNumber(stop.stop_lon);
      return {
        sourceId: `subway:${stop.stop_id}`,
        type: "SUBWAY_STATION" as const,
        name: `Subway ${stop.stop_name}`,
        lat,
        lng,
      };
    })
    .filter((node) => Number.isFinite(node.lat) && Number.isFinite(node.lng) && isWithinNyc(node.lat, node.lng));
}

function buildBusStops(busZipPath: string, feed: string): NodeSeed[] {
  const stops = parseCsv(readZipText(busZipPath, "stops.txt"));
  return stops
    .filter((stop) => stop.location_type !== "1")
    .map((stop) => {
      const lat = toNumber(stop.stop_lat);
      const lng = toNumber(stop.stop_lon);
      return {
        sourceId: `bus:${feed}:${stop.stop_id}`,
        type: "BUS_STOP" as const,
        name: `Bus Stop ${stop.stop_name}`,
        lat,
        lng,
      };
    })
    .filter((node) => Number.isFinite(node.lat) && Number.isFinite(node.lng) && isWithinNyc(node.lat, node.lng));
}

async function main() {
  const snapshotDate = getArg("date") ?? defaultSnapshotDate();
  const root = process.cwd();
  const rawDir = path.join(root, "data", "snapshots", snapshotDate, "raw");
  const processedDir = path.join(root, "data", "snapshots", snapshotDate, "processed");
  const currentDir = path.join(root, "data", "nyc", "current");
  const publicCurrentDir = path.join(root, "public", "data", "nyc", "current");

  await mkdir(processedDir, { recursive: true });
  await mkdir(currentDir, { recursive: true });
  await mkdir(publicCurrentDir, { recursive: true });

  const subwayZipPath = path.join(rawDir, "gtfs_subway.zip");
  const subwayStations = uniqueNodes(buildSubwayStations(subwayZipPath));
  const bikeStations = uniqueNodes(await buildBikeStations(rawDir));

  const busStops = uniqueNodes(
    BUS_FEED_FILES.flatMap((fileName) => {
      const feed = fileName.replace("gtfs_", "").replace(".zip", "");
      return buildBusStops(path.join(rawDir, fileName), feed);
    }),
  );

  const subwayLineFeatures = buildLineFeatures(subwayZipPath, "1", "subway");
  const busLineFeatures = BUS_FEED_FILES.flatMap((fileName) => {
    const feed = fileName.replace("gtfs_", "").replace(".zip", "");
    return buildLineFeatures(path.join(rawDir, fileName), "3", feed);
  });

  const subwayLines = { type: "FeatureCollection", features: subwayLineFeatures };
  const busLines = { type: "FeatureCollection", features: busLineFeatures };

  const nodeSeed = [...subwayStations, ...busStops, ...bikeStations];
  const metadata = {
    snapshotDate,
    generatedAt: new Date().toISOString(),
    counts: {
      subwayStations: subwayStations.length,
      busStops: busStops.length,
      bikeStations: bikeStations.length,
      subwayLines: subwayLineFeatures.length,
      busLines: busLineFeatures.length,
      nodeSeed: nodeSeed.length,
    },
    sources: {
      subway: "gtfs_subway.zip",
      bus: BUS_FEED_FILES,
      bike: "citibike_station_information.json",
    },
  };

  await writeFile(path.join(processedDir, "subway_lines.geojson"), JSON.stringify(subwayLines));
  await writeFile(path.join(processedDir, "bus_lines.geojson"), JSON.stringify(busLines));
  await writeFile(path.join(processedDir, "subway_stations.json"), JSON.stringify(subwayStations));
  await writeFile(path.join(processedDir, "bus_stops.json"), JSON.stringify(busStops));
  await writeFile(path.join(processedDir, "bike_stations.json"), JSON.stringify(bikeStations));
  await writeFile(path.join(processedDir, "nodes.seed.json"), JSON.stringify(nodeSeed));
  await writeFile(path.join(processedDir, "metadata.json"), JSON.stringify(metadata, null, 2));

  for (const fileName of OUTPUT_FILES) {
    const source = path.join(processedDir, fileName);
    await cp(source, path.join(currentDir, fileName));
    await cp(source, path.join(publicCurrentDir, fileName));
  }

  console.log(`Built snapshot ${snapshotDate} transit layers and copied to data/nyc/current + public/data/nyc/current`);
  console.log(JSON.stringify(metadata.counts, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
