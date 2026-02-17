import { prisma } from "@/lib/prisma";
import { scoreRouteMinutes } from "@/lib/game/scoring";
import { validateRoute } from "@/lib/game/validation";
import { MODES, type Segment } from "@/types/game";
import { NextResponse } from "next/server";

type SubmissionPayload = {
  challengeId: string;
  playerName: string;
  segments: Segment[];
};

function isSegmentArray(value: unknown): value is Segment[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((segment) => {
    if (!segment || typeof segment !== "object") {
      return false;
    }

    const candidate = segment as Segment;
    return (
      MODES.includes(candidate.mode) &&
      candidate.from &&
      typeof candidate.from.lat === "number" &&
      typeof candidate.from.lng === "number" &&
      candidate.to &&
      typeof candidate.to.lat === "number" &&
      typeof candidate.to.lng === "number"
    );
  });
}

export async function POST(request: Request) {
  const body = (await request.json()) as Partial<SubmissionPayload>;

  if (!body.challengeId || !body.playerName || !isSegmentArray(body.segments)) {
    return NextResponse.json({ error: "Invalid submission payload." }, { status: 400 });
  }

  const playerName = body.playerName.trim().slice(0, 30);
  if (!playerName) {
    return NextResponse.json({ error: "Player name is required." }, { status: 400 });
  }

  const challenge = await prisma.challenge.findUnique({ where: { id: body.challengeId } });
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found." }, { status: 404 });
  }

  const nodes = await prisma.node.findMany({ where: { cityId: challenge.cityId } });
  const validation = validateRoute(challenge, nodes, body.segments);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const totalTimeMinutes = scoreRouteMinutes(body.segments);

  const submission = await prisma.submission.create({
    data: {
      challengeId: challenge.id,
      playerName,
      segments: body.segments,
      totalTimeMinutes,
    },
  });

  const betterCount = await prisma.submission.count({
    where: {
      challengeId: challenge.id,
      OR: [
        { totalTimeMinutes: { lt: totalTimeMinutes } },
        {
          totalTimeMinutes,
          createdAt: { lt: submission.createdAt },
        },
        {
          totalTimeMinutes,
          createdAt: submission.createdAt,
          id: { lte: submission.id },
        },
      ],
    },
  });

  return NextResponse.json({
    submissionId: submission.id,
    totalTimeMinutes,
    rank: betterCount,
  });
}
