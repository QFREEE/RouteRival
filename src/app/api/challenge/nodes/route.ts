import { NodeType } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const MODE_TO_NODE_TYPE: Record<string, NodeType | undefined> = {
  WALK: undefined,
  BIKE_SHARE: NodeType.BIKE_DOCK,
  SUBWAY: NodeType.SUBWAY_STATION,
  BUS: NodeType.BUS_STOP,
  FERRY: NodeType.FERRY_TERMINAL,
};

function parseNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cityId = url.searchParams.get("cityId");
  const mode = (url.searchParams.get("mode") ?? "WALK").toUpperCase();
  const minLat = parseNumber(url.searchParams.get("minLat"));
  const maxLat = parseNumber(url.searchParams.get("maxLat"));
  const minLng = parseNumber(url.searchParams.get("minLng"));
  const maxLng = parseNumber(url.searchParams.get("maxLng"));
  const currentNodeId = url.searchParams.get("currentNodeId");

  if (!cityId) {
    return NextResponse.json({ error: "cityId is required" }, { status: 400 });
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
    return NextResponse.json({ nodes });
  }

  const currentNode = await prisma.node.findFirst({
    where: {
      id: currentNodeId,
      cityId,
    },
  });

  if (!currentNode || nodes.some((node) => node.id === currentNode.id)) {
    return NextResponse.json({ nodes });
  }

  return NextResponse.json({ nodes: [currentNode, ...nodes] });
}
