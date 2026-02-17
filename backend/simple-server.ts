import { NodeType, PrismaClient } from "@prisma/client";
import { createServer } from "node:http";
import { scoreRouteMinutes } from "../src/lib/game/scoring";
import { validateRoute } from "../src/lib/game/validation";
import { toDateKey } from "../src/lib/date";
import { MODES, type Segment } from "../src/types/game";

type SubmissionPayload = {
  challengeId: string;
  playerName: string;
  segments: Segment[];
};

const prisma = new PrismaClient();
const port = Number.parseInt(process.env.BACKEND_PORT ?? "4001", 10);

const MODE_TO_NODE_TYPE: Record<string, NodeType | undefined> = {
  WALK: undefined,
  BIKE_SHARE: NodeType.BIKE_DOCK,
  SUBWAY: NodeType.SUBWAY_STATION,
  BUS: NodeType.BUS_STOP,
  FERRY: NodeType.FERRY_TERMINAL,
};

function setCorsHeaders(response: import("node:http").ServerResponse) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,x-admin-key");
}

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown) {
  setCorsHeaders(response);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function parseNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (!request.url || !request.method) {
    sendJson(response, 400, { error: "Invalid request." });
    return;
  }

  if (request.method === "OPTIONS") {
    setCorsHeaders(response);
    response.statusCode = 204;
    response.end();
    return;
  }

  try {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/challenge/today") {
      let challenge = await prisma.challenge.findFirst({
        where: {
          dateKey: toDateKey(),
          city: { name: "NYC" },
        },
      });

      if (!challenge) {
        challenge = await prisma.challenge.findFirst({
          where: {
            city: { name: "NYC" },
          },
          orderBy: {
            dateKey: "desc",
          },
        });
      }

      if (!challenge) {
        sendJson(response, 404, { error: "No challenge found for today." });
        return;
      }

      const nodes = await prisma.node.findMany({
        where: { cityId: challenge.cityId },
        orderBy: [{ type: "asc" }, { name: "asc" }],
      });

      sendJson(response, 200, { challenge, nodes });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/challenge/nodes") {
      const cityId = url.searchParams.get("cityId");
      const mode = (url.searchParams.get("mode") ?? "WALK").toUpperCase();
      const minLat = parseNumber(url.searchParams.get("minLat"));
      const maxLat = parseNumber(url.searchParams.get("maxLat"));
      const minLng = parseNumber(url.searchParams.get("minLng"));
      const maxLng = parseNumber(url.searchParams.get("maxLng"));
      const currentNodeId = url.searchParams.get("currentNodeId");

      if (!cityId) {
        sendJson(response, 400, { error: "cityId is required" });
        return;
      }

      const nodeType = MODE_TO_NODE_TYPE[mode];
      const where = {
        cityId,
        ...(nodeType ? { type: nodeType } : {}),
        ...(minLat !== null && maxLat !== null ? { lat: { gte: minLat, lte: maxLat } } : {}),
        ...(minLng !== null && maxLng !== null ? { lng: { gte: minLng, lte: maxLng } } : {}),
      };

      const nodes = await prisma.node.findMany({
        where,
        orderBy: [{ type: "asc" }, { name: "asc" }],
        take: mode === "WALK" ? 400 : 600,
      });

      if (!currentNodeId) {
        sendJson(response, 200, { nodes });
        return;
      }

      const currentNode = await prisma.node.findFirst({
        where: {
          id: currentNodeId,
          cityId,
        },
      });

      if (!currentNode || nodes.some((node) => node.id === currentNode.id)) {
        sendJson(response, 200, { nodes });
        return;
      }

      sendJson(response, 200, { nodes: [currentNode, ...nodes] });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/leaderboard/today") {
      let challenge = await prisma.challenge.findFirst({
        where: {
          dateKey: toDateKey(),
          city: { name: "NYC" },
        },
      });

      if (!challenge) {
        challenge = await prisma.challenge.findFirst({
          where: {
            city: { name: "NYC" },
          },
          orderBy: {
            dateKey: "desc",
          },
        });
      }

      if (!challenge) {
        sendJson(response, 200, { leaderboard: [] });
        return;
      }

      const leaderboard = await prisma.submission.findMany({
        where: { challengeId: challenge.id },
        orderBy: [{ totalTimeMinutes: "asc" }, { createdAt: "asc" }],
        take: 50,
        select: {
          id: true,
          playerName: true,
          totalTimeMinutes: true,
          createdAt: true,
        },
      });

      sendJson(response, 200, { challengeId: challenge.id, leaderboard });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/submissions") {
      const body = (await readJsonBody(request)) as Partial<SubmissionPayload>;
      if (!body.challengeId || !body.playerName || !isSegmentArray(body.segments)) {
        sendJson(response, 400, { error: "Invalid submission payload." });
        return;
      }

      const playerName = body.playerName.trim().slice(0, 30);
      if (!playerName) {
        sendJson(response, 400, { error: "Player name is required." });
        return;
      }

      const challenge = await prisma.challenge.findUnique({ where: { id: body.challengeId } });
      if (!challenge) {
        sendJson(response, 404, { error: "Challenge not found." });
        return;
      }

      const nodes = await prisma.node.findMany({ where: { cityId: challenge.cityId } });
      const validation = validateRoute(challenge, nodes, body.segments);
      if (!validation.ok) {
        sendJson(response, 400, { error: validation.error });
        return;
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

      sendJson(response, 200, {
        submissionId: submission.id,
        totalTimeMinutes,
        rank: betterCount,
      });
      return;
    }

    sendJson(response, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { error: "Internal server error." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`RouteRival simple backend listening on http://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    server.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}
