import { NodeType, PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/date";

const prisma = new PrismaClient();

const NYC_NODES: Array<{ name: string; type: NodeType; lat: number; lng: number }> = [
  { name: "Citi Bike - Union Sq", type: NodeType.BIKE_DOCK, lat: 40.7359, lng: -73.9904 },
  { name: "Citi Bike - Astor Pl", type: NodeType.BIKE_DOCK, lat: 40.7306, lng: -73.991 },
  { name: "Citi Bike - Brooklyn Bridge", type: NodeType.BIKE_DOCK, lat: 40.7115, lng: -73.9964 },
  {
    name: "Subway - 14 St Union Sq",
    type: NodeType.SUBWAY_STATION,
    lat: 40.7347,
    lng: -73.9899,
  },
  {
    name: "Subway - Brooklyn Bridge City Hall",
    type: NodeType.SUBWAY_STATION,
    lat: 40.7133,
    lng: -74.0046,
  },
  { name: "Subway - Fulton St", type: NodeType.SUBWAY_STATION, lat: 40.7104, lng: -74.0072 },
  { name: "Bus - M14D 1 Av", type: NodeType.BUS_STOP, lat: 40.7314, lng: -73.9828 },
  { name: "Bus - M15 South Ferry", type: NodeType.BUS_STOP, lat: 40.7024, lng: -74.0132 },
  { name: "Bus - M55 W 4 St", type: NodeType.BUS_STOP, lat: 40.7299, lng: -74.0009 },
  {
    name: "Ferry - East 34th St",
    type: NodeType.FERRY_TERMINAL,
    lat: 40.7446,
    lng: -73.9718,
  },
  {
    name: "Ferry - Pier 11 Wall St",
    type: NodeType.FERRY_TERMINAL,
    lat: 40.7046,
    lng: -74.0018,
  },
  {
    name: "Ferry - DUMBO Fulton Ferry",
    type: NodeType.FERRY_TERMINAL,
    lat: 40.7027,
    lng: -73.9959,
  },
];

async function main() {
  const city = await prisma.city.upsert({
    where: { name: "NYC" },
    update: {},
    create: { name: "NYC" },
  });

  await prisma.node.deleteMany({ where: { cityId: city.id } });
  await prisma.node.createMany({
    data: NYC_NODES.map((node) => ({
      cityId: city.id,
      type: node.type,
      name: node.name,
      lat: node.lat,
      lng: node.lng,
    })),
  });

  await prisma.challenge.upsert({
    where: {
      cityId_dateKey: {
        cityId: city.id,
        dateKey: toDateKey(),
      },
    },
    update: {
      title: "Downtown Dash",
      originLat: 40.7412,
      originLng: -73.9896,
      destLat: 40.706,
      destLng: -74.0087,
    },
    create: {
      cityId: city.id,
      dateKey: toDateKey(),
      title: "Downtown Dash",
      originLat: 40.7412,
      originLng: -73.9896,
      destLat: 40.706,
      destLng: -74.0087,
    },
  });

  console.log("Seed complete for NYC nodes and today's challenge.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
