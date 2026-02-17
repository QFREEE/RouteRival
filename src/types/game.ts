export const MODES = ["WALK", "BIKE_SHARE", "SUBWAY", "BUS", "FERRY"] as const;
export type Mode = (typeof MODES)[number];

export const NODE_TYPES = ["BIKE_DOCK", "SUBWAY_STATION", "BUS_STOP", "FERRY_TERMINAL"] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export type Coordinate = {
  lat: number;
  lng: number;
  nodeId?: string;
};

export type Segment = {
  mode: Mode;
  from: Coordinate;
  to: Coordinate;
};

export type ChallengeDTO = {
  id: string;
  cityId: string;
  dateKey: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  title: string;
};

export type NodeDTO = {
  id: string;
  cityId: string;
  type: NodeType;
  name: string;
  lat: number;
  lng: number;
};

export type LeaderboardEntry = {
  id: string;
  playerName: string;
  totalTimeMinutes: number;
  createdAt: string;
};
