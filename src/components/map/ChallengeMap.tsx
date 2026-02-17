"use client";

import type { ChallengeDTO, Coordinate, NodeDTO, Segment } from "@/types/game";
import { haversineMeters } from "@/lib/game/haversine";
import "leaflet/dist/leaflet.css";
import { Circle, CircleMarker, GeoJSON, MapContainer, Polygon, Polyline, Popup, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./ChallengeMap.module.css";

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
  contextMode: "WALK" | "SUBWAY";
  walkNodeFilter: Record<NodeDTO["type"], boolean>;
  activeSubwayLine?: string | null;
  currentPosition: Coordinate;
  currentNodeId?: string;
  onNodeClick: (node: NodeDTO, nextSubwayLine?: string) => void;
  onDestinationClick: () => void;
  walkRadiusMeters: number;
  bikeRadiusMeters: number;
  onInteractionMessage?: (message: string | null) => void;
  onViewportChange: (bounds: BoundsDTO) => void;
  onBaseTileReady?: () => void;
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

type SubwayRouteFeature = TransitLinesGeoJSON["features"][number] & {
  properties?: {
    routeShortName?: string;
  };
};

type NodeAction = {
  selectable: boolean;
  reason?: string;
};

type ChooserState = {
  lat: number;
  lng: number;
  options: Array<{ node: NodeDTO; action: NodeAction }>;
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

function lineCoordinateDistanceMeters(node: NodeDTO, coordinates: number[][]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const point of coordinates) {
    if (point.length < 2) {
      continue;
    }

    const [lng, lat] = point;
    const distance = haversineMeters(node.lat, node.lng, lat, lng);
    if (distance < best) {
      best = distance;
    }
  }

  return best;
}

export function ChallengeMap({
  challenge,
  nodes,
  segments,
  contextMode,
  walkNodeFilter,
  activeSubwayLine,
  currentPosition,
  currentNodeId,
  onNodeClick,
  onDestinationClick,
  walkRadiusMeters,
  bikeRadiusMeters,
  onInteractionMessage,
  onViewportChange,
  onBaseTileReady,
}: Props) {
  const [subwayLines, setSubwayLines] = useState<TransitLinesGeoJSON | null>(null);
  const [cityRings, setCityRings] = useState<[number, number][][]>([]);
  const [chooser, setChooser] = useState<ChooserState | null>(null);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const baseTileReadyRef = useRef(false);
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

  const previewNode = useMemo(() => nodes.find((node) => node.id === previewNodeId) ?? null, [nodes, previewNodeId]);
  const previewSubwayNodeId = contextMode === "WALK" && previewNode?.type === "SUBWAY_STATION" ? previewNode.id : null;

  useEffect(() => {
    const needsSubwayLines = contextMode === "SUBWAY" || Boolean(previewSubwayNodeId);
    if (!needsSubwayLines || subwayLines) {
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
  }, [contextMode, previewSubwayNodeId, subwayLines]);

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

  const subwayRoutesByStationId = useMemo(() => {
    const byStation = new Map<string, Set<string>>();
    if (!subwayLines) {
      return byStation;
    }

    const stations = nodes.filter((node) => node.type === "SUBWAY_STATION");
    const features = subwayLines.features as SubwayRouteFeature[];

    for (const station of stations) {
      const routeSet = new Set<string>();
      for (const feature of features) {
        const routeShortName = String(feature.properties?.routeShortName ?? "").trim().toUpperCase();
        if (!routeShortName || feature.geometry.type !== "LineString") {
          continue;
        }

        const distanceMeters = lineCoordinateDistanceMeters(station, feature.geometry.coordinates);
        if (distanceMeters <= 220) {
          routeSet.add(routeShortName);
        }
      }

      byStation.set(station.id, routeSet);
    }

    return byStation;
  }, [nodes, subwayLines]);

  const focusedSubwayNodeId = contextMode === "SUBWAY" ? (currentNodeId ?? null) : previewSubwayNodeId;

  const focusedSubwayRoutes = useMemo(() => {
    if (contextMode === "SUBWAY" && activeSubwayLine) {
      return new Set<string>([activeSubwayLine]);
    }

    if (!focusedSubwayNodeId) {
      return new Set<string>();
    }

    return subwayRoutesByStationId.get(focusedSubwayNodeId) ?? new Set<string>();
  }, [activeSubwayLine, contextMode, focusedSubwayNodeId, subwayRoutesByStationId]);

  const reachableSubwayStationIds = useMemo(() => {
    if (!focusedSubwayNodeId || focusedSubwayRoutes.size === 0) {
      return new Set<string>();
    }

    const reachable = new Set<string>();
    for (const [stationId, routes] of subwayRoutesByStationId.entries()) {
      if (stationId === focusedSubwayNodeId) {
        continue;
      }

      for (const route of routes) {
        if (focusedSubwayRoutes.has(route)) {
          reachable.add(stationId);
          break;
        }
      }
    }

    return reachable;
  }, [focusedSubwayNodeId, focusedSubwayRoutes, subwayRoutesByStationId]);

  const walkVisibleNodes = useMemo(
    () =>
      nodes.filter((node) => {
        if (!walkNodeFilter[node.type]) {
          return false;
        }
        const distanceMeters = haversineMeters(currentPosition.lat, currentPosition.lng, node.lat, node.lng);
        return distanceMeters <= walkRadiusMeters;
      }),
    [currentPosition.lat, currentPosition.lng, nodes, walkNodeFilter, walkRadiusMeters],
  );

  const subwayVisibleNodes = useMemo(() => {
    if (!currentNodeId) {
      return [] as NodeDTO[];
    }

    return nodes.filter(
      (node) => node.type === "SUBWAY_STATION" && (node.id === currentNodeId || reachableSubwayStationIds.has(node.id)),
    );
  }, [currentNodeId, nodes, reachableSubwayStationIds]);

  const visibleNodes = contextMode === "SUBWAY" ? subwayVisibleNodes : walkVisibleNodes;

  const previewConnectedStations = useMemo(() => {
    if (contextMode !== "WALK" || !previewSubwayNodeId) {
      return [] as NodeDTO[];
    }

    return nodes.filter(
      (node) => node.type === "SUBWAY_STATION" && (node.id === previewSubwayNodeId || reachableSubwayStationIds.has(node.id)),
    );
  }, [contextMode, nodes, previewSubwayNodeId, reachableSubwayStationIds]);

  const showSubwayLayer = Boolean(subwayLines) && focusedSubwayRoutes.size > 0;

  const focusedSubwayLines = useMemo<TransitLinesGeoJSON | null>(() => {
    if (!subwayLines || focusedSubwayRoutes.size === 0) {
      return null;
    }

    return {
      ...subwayLines,
      features: subwayLines.features.filter((feature) => {
        const routeShortName = String(feature.properties?.routeShortName ?? "").trim().toUpperCase();
        return focusedSubwayRoutes.has(routeShortName);
      }),
    };
  }, [focusedSubwayRoutes, subwayLines]);

  function nodeAction(node: NodeDTO): NodeAction {
    const walkDistanceMeters = haversineMeters(currentPosition.lat, currentPosition.lng, node.lat, node.lng);
    const canWalkToNode = walkDistanceMeters <= walkRadiusMeters;

    if (contextMode === "WALK") {
      if (!canWalkToNode) {
        return { selectable: false, reason: "Outside 15-minute walk range." };
      }
      return { selectable: true };
    }

    if (node.type !== "SUBWAY_STATION") {
      return { selectable: false, reason: "Subway mode only allows connected subway stations." };
    }

    if (!currentNodeId) {
      return { selectable: false, reason: "Current position is not a subway station." };
    }

    if (node.id === currentNodeId) {
      return { selectable: false, reason: "Pick a different station." };
    }

    if (!reachableSubwayStationIds.has(node.id)) {
      return { selectable: false, reason: "Not connected to current subway lines." };
    }

    return { selectable: true };
  }

  function handleNodeTap(node: NodeDTO) {
    const overlapCandidates = visibleNodes.filter(
      (candidate) => haversineMeters(node.lat, node.lng, candidate.lat, candidate.lng) <= 45,
    );

    const sorted = overlapCandidates
      .map((candidate) => ({
        node: candidate,
        action: nodeAction(candidate),
      }))
      .sort((a, b) => {
        const aDistance = haversineMeters(node.lat, node.lng, a.node.lat, a.node.lng);
        const bDistance = haversineMeters(node.lat, node.lng, b.node.lat, b.node.lng);
        if (aDistance !== bDistance) {
          return aDistance - bDistance;
        }

        return a.node.name.localeCompare(b.node.name);
      });

    if (sorted.length > 1) {
      setChooser({ lat: node.lat, lng: node.lng, options: sorted });
      return;
    }

    const action = sorted[0]?.action ?? nodeAction(node);
    if (!action.selectable) {
      onInteractionMessage?.(action.reason ?? "This node is not selectable right now.");
      return;
    }

    let nextSubwayLine: string | undefined;
    if (contextMode === "SUBWAY" && currentNodeId && node.type === "SUBWAY_STATION") {
      const fromRoutes = subwayRoutesByStationId.get(currentNodeId) ?? new Set<string>();
      const toRoutes = subwayRoutesByStationId.get(node.id) ?? new Set<string>();
      const sharedRoutes = [...fromRoutes].filter((route) => toRoutes.has(route)).sort();
      if (sharedRoutes.length > 0) {
        const preferred = activeSubwayLine && sharedRoutes.includes(activeSubwayLine) ? activeSubwayLine : sharedRoutes[0];
        nextSubwayLine = preferred;
      }
    }

    onInteractionMessage?.(null);
    onNodeClick(node, nextSubwayLine);
    setPreviewNodeId(null);
  }

  return (
    <MapContainer center={center} zoom={11} minZoom={10} maxZoom={14} maxBounds={NYC_BOUNDS} maxBoundsViscosity={1} scrollWheelZoom className="challenge-map">
      <FitBounds bounds={initialBounds} />
      <ViewportWatcher onViewportChange={onViewportChange} />

      <TileLayer
        attribution="&copy; OpenStreetMap contributors &copy; CARTO"
        url={PRIMARY_TILE_URL}
        bounds={NYC_BOUNDS}
        noWrap
        eventHandlers={{
          tileload: () => {
            if (!baseTileReadyRef.current) {
              baseTileReadyRef.current = true;
              onBaseTileReady?.();
            }
          },
        }}
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

      {showSubwayLayer && focusedSubwayLines ? (
        <>
          <GeoJSON
            data={focusedSubwayLines}
            style={(feature) => ({
              color: subwayStrokeColor(String(feature?.properties?.routeShortName ?? "")),
              weight: 4,
              opacity: 0.92,
            })}
          />
        </>
      ) : null}

      {contextMode === "WALK" ? (
        <Circle
          center={[currentPosition.lat, currentPosition.lng]}
          radius={walkRadiusMeters}
          pathOptions={{ color: "#f59e0b", fillColor: "#f59e0b", fillOpacity: 0.1, weight: 2, dashArray: "8 8" }}
          interactive={false}
        />
      ) : null}

      {contextMode === "WALK" && previewNode?.type === "BIKE_DOCK" ? (
        <Circle
          center={[previewNode.lat, previewNode.lng]}
          radius={bikeRadiusMeters}
          pathOptions={{ color: "#22d3ee", fillColor: "#22d3ee", fillOpacity: 0.1, weight: 2, dashArray: "8 8" }}
          interactive={false}
        />
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
        pathOptions={{ color: contextMode === "WALK" ? "#f59e0b" : "#9ca3af" }}
        eventHandlers={{
          click: () => {
            if (contextMode === "WALK") {
              onInteractionMessage?.(null);
              onDestinationClick();
            } else {
              onInteractionMessage?.("Destination can only be selected while in WALK mode.");
            }
          },
        }}
      >
        <Tooltip direction="top">B: Destination (walk only)</Tooltip>
      </CircleMarker>

      {contextMode === "WALK" && previewConnectedStations.map((node) => {
        const isFocused = node.id === previewSubwayNodeId;

        return (
          <CircleMarker
            key={`preview-${node.id}`}
            center={[node.lat, node.lng]}
            radius={isFocused ? 6.5 : 5.5}
            pathOptions={{
              color: "#fb923c",
              fillOpacity: 0.22,
              opacity: 0.5,
              weight: isFocused ? 2 : 1,
            }}
            interactive={false}
          />
        );
      })}

      {visibleNodes.map((node) => {
        const action = nodeAction(node);
        const clickable = action.selectable;
        const active = node.id === currentNodeId;
        const subwayReachable = reachableSubwayStationIds.has(node.id);

        return (
          <CircleMarker
            key={node.id}
            center={[node.lat, node.lng]}
            radius={active ? 8 : subwayReachable ? 7 : 6}
            pathOptions={{
              color: NODE_COLORS[node.type],
              fillOpacity: clickable ? 0.85 : 0.3,
              opacity: clickable ? 1 : 0.42,
              weight: subwayReachable ? 2.2 : 1.5,
            }}
            eventHandlers={{
              mouseover: () => {
                if (contextMode === "WALK") {
                  setPreviewNodeId(node.id);
                }
              },
              mouseout: () => {
                if (contextMode === "WALK") {
                  setPreviewNodeId((prev) => (prev === node.id ? null : prev));
                }
              },
              click: () => {
                if (clickable || chooser) {
                  if (contextMode === "WALK") {
                    setPreviewNodeId(node.id);
                  }
                  handleNodeTap(node);
                  return;
                }
                onInteractionMessage?.(action.reason ?? "This node is not selectable right now.");
              },
            }}
          >
            <Tooltip direction="top">
              {node.name} ({node.type})
            </Tooltip>
          </CircleMarker>
        );
      })}

      {chooser ? (
        <Popup
          position={[chooser.lat, chooser.lng]}
          closeButton={false}
          autoClose
          closeOnEscapeKey
          closeOnClick
          eventHandlers={{
            remove: () => setChooser(null),
          }}
        >
          <div className={styles.chooser}>
            <strong className={styles.chooserTitle}>Choose node</strong>
            <div className={styles.chooserList}>
              {chooser.options.map((option) => (
                <button
                  key={option.node.id}
                  type="button"
                  disabled={!option.action.selectable}
                  className={option.action.selectable ? styles.chooserOption : `${styles.chooserOption} ${styles.chooserOptionDisabled}`}
                  onClick={() => {
                    if (!option.action.selectable) {
                      onInteractionMessage?.(option.action.reason ?? "This node is not selectable right now.");
                      return;
                    }

                    onInteractionMessage?.(null);
                    onNodeClick(option.node);
                    setChooser(null);
                  }}
                >
                  <div className={styles.chooserName}>{option.node.name}</div>
                  <div className={styles.chooserType}>{option.node.type}</div>
                  {!option.action.selectable && option.action.reason ? <div className={styles.chooserReason}>{option.action.reason}</div> : null}
                </button>
              ))}
            </div>
          </div>
        </Popup>
      ) : null}

      {routePath.length > 1 ? <Polyline positions={routePath} pathOptions={{ color: "#111827", weight: 4, opacity: 0.84 }} /> : null}
    </MapContainer>
  );
}
