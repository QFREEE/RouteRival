import { NextResponse } from "next/server";
import { toDateKey } from "@/lib/date";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const dateKey = toDateKey();
  void request;

  let challenge = await prisma.challenge.findFirst({
    where: {
      dateKey,
      city: {
        name: "NYC",
      },
    },
  });

  if (!challenge) {
    challenge = await prisma.challenge.findFirst({
      where: {
        city: {
          name: "NYC",
        },
      },
      orderBy: {
        dateKey: "desc",
      },
    });
  }

  if (!challenge) {
    return NextResponse.json({ error: "No challenge found for today." }, { status: 404 });
  }

  const nodes = await prisma.node.findMany({
    where: { cityId: challenge.cityId },
    orderBy: [{ type: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ challenge, nodes });
}
