import { NodeType, PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";

type SnapshotNode = {
  sourceId: string;
  type: "SUBWAY_STATION" | "BUS_STOP" | "BIKE_DOCK";
  name: string;
  lat: number;
  lng: number;
};

const prisma = new PrismaClient();
const SNAPSHOT_TYPES = [NodeType.SUBWAY_STATION, NodeType.BUS_STOP, NodeType.BIKE_DOCK];

function chunk<T>(items: T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

async function main() {
  const sourcePath = path.join(process.cwd(), "data", "nyc", "current", "nodes.seed.json");
  const sourceText = await readFile(sourcePath, "utf8");
  const nodes = JSON.parse(sourceText) as SnapshotNode[];

  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error("Snapshot node file is empty or invalid.");
  }

  const city = await prisma.city.upsert({
    where: { name: "NYC" },
    update: {},
    create: { name: "NYC" },
  });

  await prisma.node.deleteMany({
    where: {
      cityId: city.id,
      type: { in: SNAPSHOT_TYPES },
    },
  });

  const batches = chunk(nodes, 500);
  for (const batch of batches) {
    await prisma.node.createMany({
      data: batch.map((node) => ({
        cityId: city.id,
        type: node.type,
        name: node.name,
        lat: node.lat,
        lng: node.lng,
      })),
    });
  }

  const counts = await prisma.node.groupBy({
    by: ["type"],
    where: { cityId: city.id },
    _count: { _all: true },
  });

  console.log(`Seeded ${nodes.length} snapshot nodes into NYC.`);
  console.log(counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
