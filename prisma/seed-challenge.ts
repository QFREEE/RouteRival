import { PrismaClient } from "@prisma/client";
import { toDateKey } from "../src/lib/date";

const prisma = new PrismaClient();

function getArg(name: string): string | undefined {
  return process.argv
    .slice(2)
    .map((item) => item.trim())
    .find((item) => item.startsWith(`--${name}=`))
    ?.split("=")
    .slice(1)
    .join("=");
}

function requireNumber(value: string | undefined, key: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Missing or invalid --${key}`);
  }
  return parsed;
}

async function main() {
  const cityName = getArg("city") ?? "NYC";
  const dateKey = getArg("dateKey") ?? toDateKey();
  const title = getArg("title") ?? "Daily RouteRival Challenge";
  const originLat = requireNumber(getArg("originLat"), "originLat");
  const originLng = requireNumber(getArg("originLng"), "originLng");
  const destLat = requireNumber(getArg("destLat"), "destLat");
  const destLng = requireNumber(getArg("destLng"), "destLng");

  const city = await prisma.city.upsert({
    where: { name: cityName },
    update: {},
    create: { name: cityName },
  });

  const challenge = await prisma.challenge.upsert({
    where: {
      cityId_dateKey: {
        cityId: city.id,
        dateKey,
      },
    },
    update: {
      title,
      originLat,
      originLng,
      destLat,
      destLng,
    },
    create: {
      cityId: city.id,
      dateKey,
      title,
      originLat,
      originLng,
      destLat,
      destLng,
    },
  });

  console.log(`Challenge upserted: ${challenge.id} (${cityName} ${dateKey})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
