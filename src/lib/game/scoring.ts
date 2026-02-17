import type { Mode, Segment } from "@/types/game";
import { haversineMiles } from "./haversine";

const SPEEDS_MPH: Record<Mode, number> = {
  WALK: 3,
  BIKE_SHARE: 10,
  SUBWAY: 17,
  BUS: 12,
  FERRY: 15,
};

const LEG_PENALTY_MINUTES: Record<Mode, number> = {
  WALK: 0,
  BIKE_SHARE: 1,
  SUBWAY: 4,
  BUS: 3,
  FERRY: 5,
};

const MODE_SWITCH_PENALTY_MINUTES = 2;

export function scoreSegmentMinutes(segment: Segment, previousMode?: Mode): number {
  const distanceMiles = haversineMiles(
    segment.from.lat,
    segment.from.lng,
    segment.to.lat,
    segment.to.lng,
  );

  const travelMinutes = (distanceMiles / SPEEDS_MPH[segment.mode]) * 60;
  const legPenalty = LEG_PENALTY_MINUTES[segment.mode];
  const switchPenalty = previousMode && previousMode !== segment.mode ? MODE_SWITCH_PENALTY_MINUTES : 0;

  return travelMinutes + legPenalty + switchPenalty;
}

export function scoreRouteMinutes(segments: Segment[]): number {
  let total = 0;
  for (let i = 0; i < segments.length; i += 1) {
    const previousMode = i > 0 ? segments[i - 1].mode : undefined;
    total += scoreSegmentMinutes(segments[i], previousMode);
  }
  return Number(total.toFixed(2));
}
