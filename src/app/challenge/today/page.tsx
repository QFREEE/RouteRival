"use client";

import { haversineMeters } from "@/lib/game/haversine";
import { useChallengeMetrics } from "@/hooks/useChallengeMetrics";
import type { ChallengeDTO, Coordinate, LeaderboardEntry, Mode, NodeDTO, Segment } from "@/types/game";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./today.module.css";

const ChallengeMap = dynamic(
  () => import("@/components/map/ChallengeMap").then((mod) => mod.ChallengeMap),
  { ssr: false },
);

const WALK_MINUTES = 15;
const BIKE_MINUTES = 30;
const MODE_SPEED_MPH: Record<"WALK" | "BIKE_SHARE", number> = {
  WALK: 3,
  BIKE_SHARE: 10,
};

type ActionContext = "WALK" | "SUBWAY";

type SubmissionResult = {
  totalTimeMinutes: number;
  rank: number;
};

type ViewportBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

type PanelTab = "plan" | "rules" | "results";

const NODE_TYPE_LABELS: Record<NodeDTO["type"], string> = {
  BIKE_DOCK: "Bike",
  SUBWAY_STATION: "Subway",
  BUS_STOP: "Bus",
  FERRY_TERMINAL: "Ferry",
};

function modeLabel(mode: Mode): string {
  return mode.replace("_", " ");
}

function minutesToMeters(speedMph: number, minutes: number): number {
  const miles = (speedMph * minutes) / 60;
  return miles * 1609.34;
}

function formatPosition(currentNode: NodeDTO | null): string {
  if (!currentNode) {
    return "Origin or open point";
  }

  return `${currentNode.name} (${currentNode.type})`;
}

function coordinateLabel(coordinate: Coordinate, challenge: ChallengeDTO, knownNodes: Record<string, NodeDTO>): string {
  if (coordinate.nodeId) {
    const node = knownNodes[coordinate.nodeId];
    if (node) {
      return `${node.name} (${node.type})`;
    }
  }

  const originDistance = haversineMeters(coordinate.lat, coordinate.lng, challenge.originLat, challenge.originLng);
  if (originDistance <= 5) {
    return "Origin A";
  }

  const destinationDistance = haversineMeters(coordinate.lat, coordinate.lng, challenge.destLat, challenge.destLng);
  if (destinationDistance <= 50) {
    return "Destination B";
  }

  return `${coordinate.lat.toFixed(4)}, ${coordinate.lng.toFixed(4)}`;
}

function guidance(contextMode: ActionContext, canSubmit: boolean): string {
  if (canSubmit) {
    return "Route complete. Submit when ready.";
  }

  if (contextMode === "WALK") {
    return `Walk range: ${WALK_MINUTES} min. Snap to a node or destination B.`;
  }

  return "Subway mode: only connected stations are clickable. Use Exit to Walk to leave subway mode.";
}

export default function TodayChallengePage() {
  const metrics = useChallengeMetrics();
  const {
    startChallengeLoad,
    finishChallengeLoad,
    markViewportEvent,
    markFirstBaseTile,
  } = metrics;
  const [challenge, setChallenge] = useState<ChallengeDTO | null>(null);
  const [nodes, setNodes] = useState<NodeDTO[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PanelTab>("plan");
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [knownNodes, setKnownNodes] = useState<Record<string, NodeDTO>>({});
  const [interactionMessage, setInteractionMessage] = useState<string | null>(null);
  const [forcedWalkAtNodeId, setForcedWalkAtNodeId] = useState<string | null>(null);
  const [activeSubwayLine, setActiveSubwayLine] = useState<string | null>(null);
  const [walkNodeFilter, setWalkNodeFilter] = useState<Record<NodeDTO["type"], boolean>>({
    BIKE_DOCK: true,
    SUBWAY_STATION: true,
    BUS_STOP: true,
    FERRY_TERMINAL: true,
  });

  const handleViewportChange = useCallback((bounds: ViewportBounds) => {
    markViewportEvent();
    void bounds;
  }, [markViewportEvent]);

  useEffect(() => {
    async function loadToday() {
      setLoading(true);
      setError(null);
      startChallengeLoad();
      const response = await fetch("/api/challenge/today");
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to load today challenge.");
        setLoading(false);
        return;
      }

      const loadedNodes = (data.nodes ?? []) as NodeDTO[];
      setChallenge(data.challenge);
      setNodes(loadedNodes);
      setKnownNodes(Object.fromEntries(loadedNodes.map((node) => [node.id, node])));
      setForcedWalkAtNodeId(null);
      setActiveSubwayLine(null);
      setLoading(false);
      finishChallengeLoad();
    }

    loadToday().catch(() => {
      setError("Unable to load today challenge.");
      setLoading(false);
    });
  }, [finishChallengeLoad, startChallengeLoad]);

  const currentPosition = useMemo(() => {
    if (!challenge) {
      return null;
    }

    if (segments.length === 0) {
      return {
        lat: challenge.originLat,
        lng: challenge.originLng,
        nodeId: undefined,
      };
    }

    return segments[segments.length - 1].to;
  }, [challenge, segments]);

  const currentNode = useMemo(() => {
    if (!currentPosition?.nodeId) {
      return null;
    }
    return knownNodes[currentPosition.nodeId] ?? nodes.find((node) => node.id === currentPosition.nodeId) ?? null;
  }, [currentPosition, knownNodes, nodes]);

  const mappedNodeSequence = useMemo(() => {
    return segments
      .map((segment) => segment.to.nodeId)
      .filter((nodeId): nodeId is string => Boolean(nodeId))
      .map((nodeId) => knownNodes[nodeId])
      .filter((node): node is NodeDTO => Boolean(node));
  }, [knownNodes, segments]);

  const mapNodes = useMemo(() => {
    const byId: Record<string, NodeDTO> = {};

    for (const node of nodes) {
      byId[node.id] = node;
    }

    for (const node of Object.values(knownNodes)) {
      byId[node.id] = node;
    }

    return Object.values(byId);
  }, [knownNodes, nodes]);

  const walkRadiusMeters = useMemo(() => minutesToMeters(MODE_SPEED_MPH.WALK, WALK_MINUTES), []);
  const bikeRadiusMeters = useMemo(() => minutesToMeters(MODE_SPEED_MPH.BIKE_SHARE, BIKE_MINUTES), []);

  const contextMode: ActionContext = useMemo(() => {
    if (!currentNode || currentNode.type !== "SUBWAY_STATION") {
      return "WALK";
    }

    return forcedWalkAtNodeId === currentNode.id ? "WALK" : "SUBWAY";
  }, [currentNode, forcedWalkAtNodeId]);

  useEffect(() => {
    if (contextMode !== "SUBWAY") {
      setActiveSubwayLine(null);
    }
  }, [contextMode]);

  const destinationDistanceMeters = useMemo(() => {
    if (!challenge || !currentPosition) {
      return Number.POSITIVE_INFINITY;
    }

    return haversineMeters(
      currentPosition.lat,
      currentPosition.lng,
      challenge.destLat,
      challenge.destLng,
    );
  }, [challenge, currentPosition]);

  const initialDistanceMeters = useMemo(() => {
    if (!challenge) {
      return 1;
    }

    return Math.max(haversineMeters(challenge.originLat, challenge.originLng, challenge.destLat, challenge.destLng), 1);
  }, [challenge]);

  const progressPercent = useMemo(() => {
    if (!Number.isFinite(destinationDistanceMeters)) {
      return 0;
    }

    const raw = (1 - destinationDistanceMeters / initialDistanceMeters) * 100;
    return Math.max(0, Math.min(100, raw));
  }, [destinationDistanceMeters, initialDistanceMeters]);

  const canSubmit =
    Boolean(playerName.trim()) && segments.length > 0 && Number.isFinite(destinationDistanceMeters) && destinationDistanceMeters <= 50;

  const walkReachableCounts = useMemo(() => {
    const counts: Record<NodeDTO["type"], number> = {
      BIKE_DOCK: 0,
      SUBWAY_STATION: 0,
      BUS_STOP: 0,
      FERRY_TERMINAL: 0,
    };

    if (!currentPosition) {
      return counts;
    }

    for (const node of mapNodes) {
      const distanceMeters = haversineMeters(currentPosition.lat, currentPosition.lng, node.lat, node.lng);
      if (distanceMeters <= walkRadiusMeters) {
        counts[node.type] += 1;
      }
    }

    return counts;
  }, [currentPosition, mapNodes, walkRadiusMeters]);

  function appendSegment(to: { lat: number; lng: number; nodeId?: string }, mode: Mode) {
    if (!currentPosition) {
      return;
    }

    setSegments((prev) => [...prev, { mode, from: currentPosition, to }]);
    setForcedWalkAtNodeId(null);
    setInteractionMessage(null);
  }

  function onNodeClick(node: NodeDTO, nextSubwayLine?: string) {
    if (!currentPosition) {
      return;
    }

    setKnownNodes((prev) => ({ ...prev, [node.id]: node }));

    if (contextMode === "WALK") {
      const walkDistance = haversineMeters(currentPosition.lat, currentPosition.lng, node.lat, node.lng);
      if (walkDistance > walkRadiusMeters) {
        setInteractionMessage(`Outside ${WALK_MINUTES}-minute walk range.`);
        return;
      }

      appendSegment({ lat: node.lat, lng: node.lng, nodeId: node.id }, "WALK");
      return;
    }

    if (!currentNode || currentNode.type !== "SUBWAY_STATION") {
      setInteractionMessage("Subway mode requires being at a subway station.");
      return;
    }

    if (node.type !== "SUBWAY_STATION") {
      setInteractionMessage("Only connected subway stations are available in subway mode.");
      return;
    }

    if (node.id === currentNode.id) {
      setInteractionMessage("Pick a different station.");
      return;
    }

    appendSegment({ lat: node.lat, lng: node.lng, nodeId: node.id }, "SUBWAY");
    setActiveSubwayLine(nextSubwayLine ?? null);
  }

  function onDestinationClick() {
    if (!challenge || contextMode !== "WALK") {
      return;
    }

    appendSegment({ lat: challenge.destLat, lng: challenge.destLng }, "WALK");
  }

  async function loadLeaderboard() {
    const response = await fetch("/api/leaderboard/today");
    const data = await response.json();
    if (response.ok) {
      setLeaderboard(data.leaderboard ?? []);
    }
  }

  async function onSubmit() {
    if (!challenge || !canSubmit) {
      return;
    }

    setError(null);
    const response = await fetch("/api/submissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: challenge.id,
        playerName,
        segments,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Submission failed.");
      return;
    }

    setResult({ totalTimeMinutes: data.totalTimeMinutes, rank: data.rank });
    setActiveTab("results");
    await loadLeaderboard();
  }

  if (loading) {
    return <main className={styles.state}>Loading today challenge...</main>;
  }

  if (error && !challenge) {
    return <main className={styles.state}>{error}</main>;
  }

  if (!challenge || !currentPosition) {
    return <main className={styles.state}>No challenge available.</main>;
  }

  const nextHint = interactionMessage ?? guidance(contextMode, canSubmit);
  const remainingMeters = Number.isFinite(destinationDistanceMeters) ? Math.max(destinationDistanceMeters, 0) : 0;

  return (
    <main className={styles.page}>
      <section className={styles.mapStage}>
        <div className={styles.topHud}>
          <div>
            <p className={styles.kicker}>RouteRival · NYC</p>
            <h1>{challenge.title}</h1>
          </div>
          <div className={styles.hudStats}>
            <span>{segments.length} steps</span>
            <span>{contextMode === "SUBWAY" ? "Subway" : "Walk"}</span>
            {contextMode === "SUBWAY" && activeSubwayLine ? <span>Line {activeSubwayLine}</span> : null}
            <span className={canSubmit ? styles.statReady : styles.statRemaining}>{canSubmit ? "Route ready" : `${remainingMeters.toFixed(0)}m remaining`}</span>
          </div>
          <div className={styles.progressTrack} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progressPercent)}>
            <div className={styles.progressFill} style={{ width: `${progressPercent.toFixed(1)}%` }} />
          </div>
          <p className={styles.hudHint}>{nextHint}</p>
        </div>

        <div className={styles.mapWrap}>
          <ChallengeMap
            challenge={challenge}
            nodes={mapNodes}
            segments={segments}
            contextMode={contextMode}
            walkNodeFilter={walkNodeFilter}
            activeSubwayLine={activeSubwayLine}
            currentPosition={currentPosition}
            currentNodeId={currentNode?.id}
            onNodeClick={onNodeClick}
            onDestinationClick={onDestinationClick}
            walkRadiusMeters={walkRadiusMeters}
            bikeRadiusMeters={bikeRadiusMeters}
            onInteractionMessage={setInteractionMessage}
            onViewportChange={handleViewportChange}
            onBaseTileReady={markFirstBaseTile}
          />
        </div>

        <div className={styles.modeDock}>
          {contextMode === "SUBWAY" ? (
            <button
              type="button"
              className={styles.modeButton}
              onClick={() => {
                if (currentNode?.id) {
                  setForcedWalkAtNodeId(currentNode.id);
                  setActiveSubwayLine(null);
                  setInteractionMessage("Walk mode restored from current subway station.");
                }
              }}
            >
              Exit to Walk
            </button>
          ) : null}
          <button type="button" className={styles.undoButton} disabled={segments.length === 0} onClick={() => setSegments((prev) => prev.slice(0, -1))}>
            UNDO
          </button>
        </div>
      </section>

      <section className={panelExpanded ? styles.controlPanel : styles.controlPanelCollapsed}>
        <div className={styles.tabs}>
          <button type="button" className={styles.panelToggle} onClick={() => setPanelExpanded((prev) => !prev)}>
            {panelExpanded ? "Hide" : "Show"}
          </button>
          <button type="button" className={activeTab === "plan" ? styles.tabActive : styles.tabButton} onClick={() => setActiveTab("plan")}>
            Plan
          </button>
          <button type="button" className={activeTab === "rules" ? styles.tabActive : styles.tabButton} onClick={() => setActiveTab("rules")}>
            Rules
          </button>
          <button
            type="button"
            className={activeTab === "results" ? styles.tabActive : styles.tabButton}
            onClick={() => setActiveTab("results")}
            disabled={!result}
          >
            Results
          </button>
        </div>

        {panelExpanded && activeTab === "plan" ? (
          <div className={styles.panelBody}>
            <div className={styles.card}>
              <p className={styles.cardLabel}>Current Position</p>
              <p className={styles.cardValue}>{formatPosition(currentNode)}</p>
            </div>

            {contextMode === "WALK" ? (
              <div className={styles.card}>
                <p className={styles.cardLabel}>Range Filters</p>
                <div className={styles.filterRow}>
                  {(Object.keys(walkNodeFilter) as NodeDTO["type"][]).map((type) => (
                    <label key={type} className={styles.filterToggle}>
                      <input
                        type="checkbox"
                        checked={walkNodeFilter[type]}
                        onChange={(event) => {
                          setWalkNodeFilter((prev) => ({
                            ...prev,
                            [type]: event.target.checked,
                          }));
                        }}
                      />
                      <span>{NODE_TYPE_LABELS[type]} ({walkReachableCounts[type]})</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <label className={styles.inputGroup} htmlFor="playerName">
              <span>Player Name</span>
              <input
                id="playerName"
                value={playerName}
                onChange={(event) => setPlayerName(event.target.value)}
                maxLength={30}
                placeholder="Your name"
              />
            </label>

            <button type="button" className={styles.submitButton} disabled={!canSubmit} onClick={onSubmit}>
              Submit Route
            </button>

            <p className={styles.helperText}>
              {canSubmit ? "Route is valid and ready." : "Finish within 50m of destination to submit."}
            </p>

            <ol className={styles.timeline}>
              {segments.length === 0 ? <li className={styles.timelineEmpty}>No steps yet. Start with WALK.</li> : null}
              {segments.map((segment, index) => (
                <li key={`${segment.mode}-${index}`}>
                  <strong>{modeLabel(segment.mode)}</strong>
                  <span>{coordinateLabel(segment.from, challenge, knownNodes)} to {coordinateLabel(segment.to, challenge, knownNodes)}</span>
                </li>
              ))}
            </ol>

            {mappedNodeSequence.length > 0 ? (
              <div className={styles.nodeSequenceWrap}>
                <p className={styles.cardLabel}>Mapped Node Sequence</p>
                <ol className={styles.nodeSequence}>
                  {mappedNodeSequence.map((node, index) => (
                    <li key={`${node.id}-${index}`}>
                      <strong>{index + 1}.</strong> {node.name}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        ) : null}

        {panelExpanded && activeTab === "rules" ? (
          <div className={styles.panelBody}>
            <ul className={styles.ruleList}>
              <li>Start at origin. You can always walk to any node within 15-minute range.</li>
              <li>Walk to any reachable subway station to enter subway action mode.</li>
              <li>In subway mode, only stations on connected lines are shown and clickable.</li>
              <li>Use Exit to Walk to leave subway mode from your current station.</li>
              <li>WALK can move to nodes or destination B inside the 15-minute walk range.</li>
              <li>No time hints during planning. Score appears after submit.</li>
              <li>Finish within 50 meters of destination.</li>
            </ul>
          </div>
        ) : null}

        {panelExpanded && activeTab === "results" ? (
          <div className={styles.panelBody}>
            {result ? (
              <>
                <div className={styles.card}>
                  <p className={styles.cardLabel}>Total Time</p>
                  <p className={styles.cardValue}>{result.totalTimeMinutes.toFixed(2)} min</p>
                  <p className={styles.rank}>Rank #{result.rank}</p>
                </div>
                <ol className={styles.leaderboard}>
                  {leaderboard.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.playerName}</span>
                      <strong>{entry.totalTimeMinutes.toFixed(2)} min</strong>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className={styles.helperText}>Submit a route to reveal your result and leaderboard rank.</p>
            )}
          </div>
        ) : null}

        {error ? <p className={styles.error}>{error}</p> : null}
      </section>
    </main>
  );
}
