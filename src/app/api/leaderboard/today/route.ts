import { prisma } from "@/lib/prisma";
import { toDateKey } from "@/lib/date";
import { NextResponse } from "next/server";

export async function GET() {
  const challenge = await prisma.challenge.findFirst({
    where: {
      dateKey: toDateKey(),
      city: {
        name: "NYC",
      },
    },
  });

  if (!challenge) {
    return NextResponse.json({ leaderboard: [] });
  }

  const leaderboard = await prisma.submission.findMany({
    where: {
      challengeId: challenge.id,
    },
    orderBy: [{ totalTimeMinutes: "asc" }, { createdAt: "asc" }],
    take: 50,
    select: {
      id: true,
      playerName: true,
      totalTimeMinutes: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ challengeId: challenge.id, leaderboard });
}
