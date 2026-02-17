"use client";

import type { ChallengeDTO, Coordinate, Mode, NodeDTO, Segment } from "@/types/game";
import "leaflet/dist/leaflet.css";
import { CircleMarker, GeoJSON, MapContainer, Polygon, Polyline, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";

type BoundsDTO = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type Props = {
  challenge: ChallengeDTO;
  nodes: NodeDTO[];
  segments: Segment[];
  selectedMode: Mode;
  currentPosition: Coordinate;
  currentNodeId?: string;
  onNodeClick: (node: NodeDTO) => void;
  onDestinationClick: () => void;
  onViewportChange: (bounds: BoundsDTO) => void;
};

type TransitLinesGeoJSON = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "LineString";
      coordinates: number[][];
    };
    properties?: Record<string, unknown> | null;
  }>;
};

type BoundaryGeometry =
  | {
      type: "Polygon";
      coordinates: number[][][];
    }
  | {
      type: "MultiPolygon";
      coordinates: number[][][][];
    };

type BoundaryFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    geometry: BoundaryGeometry;
  }>;
};

const MODE_TO_NODE_TYPE: Record<Exclude<Mode, "WALK">, NodeDTO["type"]> = {
  BIKE_SHARE: "BIKE_DOCK",
  SUBWAY: "SUBWAY_STATION",
  BUS: "BUS_STOP",
  FERRY: "FERRY_TERMINAL",
};

const NODE_COLORS: Record<NodeDTO["type"], string> = {
  BIKE_DOCK: "#22d3ee",
  SUBWAY_STATION: "#f97316",
  BUS_STOP: "#60a5fa",
  FERRY_TERMINAL: "#0f766e",
};

const NYC_BOUNDS: [[number, number], [number, number]] = [
  [40.4774, -74.2591],
  [40.9176, -73.7004],
];

const PRIMARY_TILE_URL = "/tiles/nyc/{z}/{x}/{y}.png";

const WORLD_RING: [number, number][] = [
  [90, -180],
  [90, 180],
  [-90, 180],
  [-90, -180],
];

function toLatLngRing(ring: number[][]): [number, number][] {
  return ring.map(([lng, lat]) => [lat, lng]);
}

function extractOuterRings(boundary: BoundaryFeatureCollection): [number, number][][] {
  const rings: [number, number][][] = [];

  for (const feature of boundary.features) {
    if (feature.geometry.type === "Polygon") {
      const outer = feature.geometry.coordinates[0];
      if (outer) {
        rings.push(toLatLngRing(outer));
      }
      continue;
    }

    for (const polygon of feature.geometry.coordinates) {
      const outer = polygon[0];
      if (outer) {
        rings.push(toLatLngRing(outer));
      }
    }
  }

  return rings;
}

function isNodeClickable(node: NodeDTO, selectedMode: Mode, currentNodeId?: string): boolean {
  if (selectedMode === "WALK") {
    return true;
  }

  const requiredType = MODE_TO_NODE_TYPE[selectedMode];
  if (node.type !== requiredType) {
    return false;
  }

  return currentNodeId !== node.id;
}

function FitBounds({ bounds }: { bounds: [[number, number], [number, number]] }) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [bounds, map]);

  return null;
}

function ViewportWatcher({ onViewportChange }: { onViewportChange: (bounds: BoundsDTO) => void }) {
  const map = useMapEvents({
    moveend: () => {
      const bounds = map.getBounds();
      onViewportChange({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
      });
    },
    zoomend: () => {
      const bounds = map.getBounds();
      onViewportChange({
        minLat: bounds.getSouth(),
        maxLat: bounds.getNorth(),
        minLng: bounds.getWest(),
        maxLng: bounds.getEast(),
      });
    },
  });

  useEffect(() => {
    const bounds = map.getBounds();
    onViewportChange({
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
    });
  }, [map, onViewportChange]);

  return null;
}

function subwayStrokeColor(routeShortName: string): string {
  const key = routeShortName.trim().toUpperCase();
  if (!key) return "#fb923c";
  if (/[123]/.test(key[0])) return "#ef4444";
  if (/[456]/.test(key[0])) return "#16a34a";
  if (key[0] === "7") return "#a855f7";

  const byLetter: Record<string, string> = {
    A: "#2563eb",
    C: "#2563eb",
    E: "#2563eb",
    B: "#f97316",
    D: "#f97316",
    F: "#f97316",
    M: "#f97316",
    G: "#84cc16",
    J: "#a16207",
    Z: "#a16207",
    L: "#94a3b8",
    N: "#facc15",
    Q: "#facc15",
    R: "#facc15",
    W: "#facc15",
    S: "#64748b",
  };

  return byLetter[key[0]] ?? "#fb923c";
}

export function ChallengeMap({
  challenge,
  nodes,
  segments,
  selectedMode,
  currentPosition,
  currentNodeId,
  onNodeClick,
  onDestinationClick,
  onViewportChange,
}: Props) {
  const [subwayLines, setSubwayLines] = useState<TransitLinesGeoJSON | null>(null);
  const [busLines, setBusLines] = useState<TransitLinesGeoJSON | null>(null);
  const [cityRings, setCityRings] = useState<[number, number][][]>([]);
  const center: [number, number] = [(challenge.originLat + challenge.destLat) / 2, (challenge.originLng + challenge.destLng) / 2];

  useEffect(() => {
    let cancelled = false;

    fetch("/data/nyc-boundary-simplified.geojson")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setCityRings(extractOuterRings(data as BoundaryFeatureCollection));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedMode !== "SUBWAY") {
      return;
    }
    if (subwayLines) {
      return;
    }

    let cancelled = false;
    fetch("/data/nyc/current/subway_lines.geojson")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setSubwayLines(data as TransitLinesGeoJSON);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [selectedMode, subwayLines]);

  useEffect(() => {
    if (selectedMode !== "BUS") {
      return;
    }
    if (busLines) {
      return;
    }

    let cancelled = false;
    fetch("/data/nyc/current/bus_lines.geojson")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setBusLines(data as TransitLinesGeoJSON);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [busLines, selectedMode]);

  const showSubwayLayer = Boolean(subwayLines) && selectedMode === "SUBWAY";
  const showBusLayer = Boolean(busLines) && selectedMode === "BUS";

  const initialBounds = useMemo<[[number, number], [number, number]]>(() => {
    const minLat = Math.max(Math.min(challenge.originLat, challenge.destLat) - 0.04, NYC_BOUNDS[0][0]);
    const maxLat = Math.min(Math.max(challenge.originLat, challenge.destLat) + 0.04, NYC_BOUNDS[1][0]);
    const minLng = Math.max(Math.min(challenge.originLng, challenge.destLng) - 0.04, NYC_BOUNDS[0][1]);
    const maxLng = Math.min(Math.max(challenge.originLng, challenge.destLng) + 0.04, NYC_BOUNDS[1][1]);
    return [
      [minLat, minLng],
      [maxLat, maxLng],
    ];
  }, [challenge.destLat, challenge.destLng, challenge.originLat, challenge.originLng]);

  const routePath = useMemo<[number, number][]>(() => {
    if (segments.length === 0) {
      return [];
    }

    const points: [number, number][] = [[segments[0].from.lat, segments[0].from.lng]];
    for (const segment of segments) {
      points.push([segment.to.lat, segment.to.lng]);
    }

    return points;
  }, [segments]);

  return (
    <MapContainer center={center} zoom={11} minZoom={10} maxZoom={14} maxBounds={NYC_BOUNDS} maxBoundsViscosity={1} scrollWheelZoom className="challenge-map">
      <FitBounds bounds={initialBounds} />
      <ViewportWatcher onViewportChange={onViewportChange} />

      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url={PRIMARY_TILE_URL}
        bounds={NYC_BOUNDS}
        noWrap
      />

      {cityRings.length > 0 ? (
        <>
          <Polygon
            positions={[WORLD_RING, ...cityRings]}
            pathOptions={{
              stroke: false,
              fillColor: "#020617",
              fillOpacity: 1,
              interactive: false,
            }}
          />
          {cityRings.map((ring, index) => (
            <Polygon
              key={`nyc-ring-${index}`}
              positions={ring}
              pathOptions={{
                color: "#0f172a",
                weight: 2,
                opacity: 0.8,
                fillOpacity: 0,
                interactive: false,
              }}
            />
          ))}
        </>
      ) : null}

      {showBusLayer && busLines ? (
        <>
          <GeoJSON data={busLines} style={{ color: "#22d3ee", weight: 4, opacity: 0.08 }} />
          <GeoJSON data={busLines} style={{ color: "#38bdf8", weight: 1.8, opacity: 0.42, dashArray: "6 6" }} />
        </>
      ) : null}

      {showSubwayLayer && subwayLines ? (
        <>
          <GeoJSON
            data={subwayLines}
            style={(feature) => ({
              color: subwayStrokeColor(String(feature?.properties?.routeShortName ?? "")),
              weight: 6,
              opacity: 0.12,
            })}
          />
          <GeoJSON
            data={subwayLines}
            style={(feature) => ({
              color: subwayStrokeColor(String(feature?.properties?.routeShortName ?? "")),
              weight: 2.6,
              opacity: 0.9,
            })}
          />
        </>
      ) : null}

      <CircleMarker
        center={[challenge.originLat, challenge.originLng]}
        radius={10}
        pathOptions={{ color: "#f59e0b", fillColor: "#fef3c7", fillOpacity: 0.95, weight: 3 }}
      >
        <Tooltip direction="top">A: Origin (start)</Tooltip>
      </CircleMarker>

      {segments.length > 0 ? (
        <CircleMarker
          center={[currentPosition.lat, currentPosition.lng]}
          radius={6}
          pathOptions={{ color: "#0f172a", fillColor: "#f8fafc", fillOpacity: 0.95, weight: 2 }}
        >
          <Tooltip direction="top">Current position</Tooltip>
        </CircleMarker>
      ) : null}

      <CircleMarker
        center={[challenge.destLat, challenge.destLng]}
        radius={9}
        pathOptions={{ color: selectedMode === "WALK" ? "#f59e0b" : "#9ca3af" }}
        eventHandlers={{
          click: () => {
            if (selectedMode === "WALK") {
              onDestinationClick();
            }
          },
        }}
      >
        <Tooltip direction="top">B: Destination (walk only)</Tooltip>
      </CircleMarker>

      {nodes.map((node) => {
        const clickable = isNodeClickable(node, selectedMode, currentNodeId);
        const active = node.id === currentNodeId;

        return (
          <CircleMarker
            key={node.id}
            center={[node.lat, node.lng]}
            radius={active ? 8 : 6}
            pathOptions={{
              color: NODE_COLORS[node.type],
              fillOpacity: clickable ? 0.8 : 0.3,
              opacity: clickable ? 1 : 0.4,
            }}
            eventHandlers={{
              click: () => {
                if (clickable) {
                  onNodeClick(node);
                }
              },
            }}
          >
            <Tooltip direction="top">
              {node.name} ({node.type})
            </Tooltip>
          </CircleMarker>
        );
      })}

      {routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: "#111827", weight: 4, opacity: 0.84 }} /> : null}
    </MapContainer>
  );
}
