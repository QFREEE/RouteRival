import { prisma } from "@/lib/prisma";
import { toDateKey } from "@/lib/date";
import { NextResponse } from "next/server";

type Body = {
  cityName?: string;
  dateKey?: string;
  title?: string;
  originLat?: number;
  originLng?: number;
  destLat?: number;
  destLng?: number;
};

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Admin endpoint disabled in production." }, { status: 403 });
  }

  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || request.headers.get("x-admin-key") !== adminKey) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const cityName = body.cityName ?? "NYC";
  const dateKey = body.dateKey ?? toDateKey();

  if (
    !Number.isFinite(body.originLat) ||
    !Number.isFinite(body.originLng) ||
    !Number.isFinite(body.destLat) ||
    !Number.isFinite(body.destLng)
  ) {
    return NextResponse.json({ error: "origin/destination coordinates are required." }, { status: 400 });
  }

  const originLat = Number(body.originLat);
  const originLng = Number(body.originLng);
  const destLat = Number(body.destLat);
  const destLng = Number(body.destLng);

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
      title: body.title ?? "Daily RouteRival Challenge",
      originLat,
      originLng,
      destLat,
      destLng,
    },
    create: {
      cityId: city.id,
      dateKey,
      title: body.title ?? "Daily RouteRival Challenge",
      originLat,
      originLng,
      destLat,
      destLng,
    },
  });

  return NextResponse.json({ challenge });
}
