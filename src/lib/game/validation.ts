import type { ChallengeDTO, Mode, NodeDTO, Segment } from "@/types/game";
import { haversineMeters } from "./haversine";

const NODE_MATCH_TOLERANCE_METERS = 5;
const CONTINUITY_TOLERANCE_METERS = 5;
const FINISH_TOLERANCE_METERS = 50;

const MODE_TO_NODE_TYPE: Record<Exclude<Mode, "WALK">, NodeDTO["type"]> = {
  BIKE_SHARE: "BIKE_DOCK",
  SUBWAY: "SUBWAY_STATION",
  BUS: "BUS_STOP",
  FERRY: "FERRY_TERMINAL",
};

export type RouteValidationResult = {
  ok: boolean;
  error?: string;
};

function isFiniteCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function isNear(aLat: number, aLng: number, bLat: number, bLng: number, meters: number): boolean {
  return haversineMeters(aLat, aLng, bLat, bLng) <= meters;
}

export function validateRoute(
  challenge: ChallengeDTO,
  nodes: NodeDTO[],
  segments: Segment[],
): RouteValidationResult {
  if (segments.length === 0) {
    return { ok: false, error: "Route must include at least one segment." };
  }

  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];

    if (
      !isFiniteCoordinate(segment.from.lat, segment.from.lng) ||
      !isFiniteCoordinate(segment.to.lat, segment.to.lng)
    ) {
      return { ok: false, error: "Segment coordinates are invalid." };
    }

    if (i === 0) {
      if (
        !isNear(
          segment.from.lat,
          segment.from.lng,
          challenge.originLat,
          challenge.originLng,
          CONTINUITY_TOLERANCE_METERS,
        )
      ) {
        return { ok: false, error: "Route must start at the challenge origin." };
      }
    } else {
      const previous = segments[i - 1];
      if (
        !isNear(
          previous.to.lat,
          previous.to.lng,
          segment.from.lat,
          segment.from.lng,
          CONTINUITY_TOLERANCE_METERS,
        )
      ) {
        return { ok: false, error: "Each segment must continue from the last endpoint." };
      }
    }

    if (segment.from.nodeId) {
      const fromNode = nodeById.get(segment.from.nodeId);
      if (!fromNode) {
        return { ok: false, error: "Segment start node is invalid." };
      }
      if (
        !isNear(
          segment.from.lat,
          segment.from.lng,
          fromNode.lat,
          fromNode.lng,
          NODE_MATCH_TOLERANCE_METERS,
        )
      ) {
        return { ok: false, error: "Segment start coordinate does not match its node." };
      }
    }

    if (segment.to.nodeId) {
      const toNode = nodeById.get(segment.to.nodeId);
      if (!toNode) {
        return { ok: false, error: "Segment end node is invalid." };
      }
      if (
        !isNear(segment.to.lat, segment.to.lng, toNode.lat, toNode.lng, NODE_MATCH_TOLERANCE_METERS)
      ) {
        return { ok: false, error: "Segment end coordinate does not match its node." };
      }
    }

    if (segment.mode === "WALK") {
      if (!segment.to.nodeId) {
        if (
          !isNear(
            segment.to.lat,
            segment.to.lng,
            challenge.destLat,
            challenge.destLng,
            FINISH_TOLERANCE_METERS,
          )
        ) {
          return { ok: false, error: "Walk segments without a node must end at destination." };
        }
      }
    } else {
      if (!segment.from.nodeId || !segment.to.nodeId) {
        return { ok: false, error: `${segment.mode} segments must start and end at nodes.` };
      }

      const fromNode = nodeById.get(segment.from.nodeId);
      const toNode = nodeById.get(segment.to.nodeId);
      if (!fromNode || !toNode) {
        return { ok: false, error: `${segment.mode} segment references unknown nodes.` };
      }

      const requiredType = MODE_TO_NODE_TYPE[segment.mode];
      if (fromNode.type !== requiredType || toNode.type !== requiredType) {
        return { ok: false, error: `${segment.mode} segment must connect ${requiredType} nodes.` };
      }
    }
  }

  const lastSegment = segments[segments.length - 1];
  if (
    !isNear(lastSegment.to.lat, lastSegment.to.lng, challenge.destLat, challenge.destLng, FINISH_TOLERANCE_METERS)
  ) {
    return { ok: false, error: "Route must end within 50 meters of destination." };
  }

  return { ok: true };
}
