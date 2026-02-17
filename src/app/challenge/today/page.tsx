"use client";

import { haversineMeters } from "@/lib/game/haversine";
import type { ChallengeDTO, LeaderboardEntry, Mode, NodeDTO, Segment } from "@/types/game";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import styles from "./today.module.css";

const ChallengeMap = dynamic(
  () => import("@/components/map/ChallengeMap").then((mod) => mod.ChallengeMap),
  { ssr: false },
);

const MODES: Mode[] = ["WALK", "BIKE_SHARE", "SUBWAY", "BUS", "FERRY"];
const WALK_NODE_VISIBILITY_RADIUS_METERS = 900;

const MODE_TO_NODE_TYPE: Record<Exclude<Mode, "WALK">, NodeDTO["type"]> = {
  BIKE_SHARE: "BIKE_DOCK",
  SUBWAY: "SUBWAY_STATION",
  BUS: "BUS_STOP",
  FERRY: "FERRY_TERMINAL",
};

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

function modeLabel(mode: Mode): string {
  return mode.replace("_", " ");
}

function compactModeLabel(mode: Mode): string {
  if (mode === "BIKE_SHARE") {
    return "Bike";
  }
  return modeLabel(mode);
}

function formatPosition(currentNode: NodeDTO | null): string {
  if (!currentNode) {
    return "Origin or open point";
  }

  return `${currentNode.name} (${currentNode.type})`;
}

function guidance(activeMode: Mode, modeDisabledReasons: Record<Mode, string | undefined>, canSubmit: boolean): string {
  if (canSubmit) {
    return "Route complete. Submit when ready.";
  }

  if (activeMode === "WALK") {
    return "Select a node or destination B to add a WALK segment.";
  }

  return modeDisabledReasons[activeMode] ?? `Tap a ${MODE_TO_NODE_TYPE[activeMode]} to continue ${modeLabel(activeMode)}.`;
}

export default function TodayChallengePage() {
  const [challenge, setChallenge] = useState<ChallengeDTO | null>(null);
  const [nodes, setNodes] = useState<NodeDTO[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selectedMode, setSelectedMode] = useState<Mode>("WALK");
  const [playerName, setPlayerName] = useState("");
  const [result, setResult] = useState<SubmissionResult | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<PanelTab>("plan");
  const [viewportBounds, setViewportBounds] = useState<ViewportBounds | null>(null);
  const [panelExpanded, setPanelExpanded] = useState(true);
  const [knownNodes, setKnownNodes] = useState<Record<string, NodeDTO>>({});

  useEffect(() => {
    async function loadToday() {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/challenge/today");
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Unable to load today challenge.");
        setLoading(false);
        return;
      }

      setChallenge(data.challenge);
      setNodes([]);
      setKnownNodes({});
      setLoading(false);
    }

    loadToday().catch(() => {
      setError("Unable to load today challenge.");
      setLoading(false);
    });
  }, []);

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

  const modeDisabledReasons = useMemo<Record<Mode, string | undefined>>(() => {
    const reasons: Record<Mode, string | undefined> = {
      WALK: undefined,
      BIKE_SHARE: undefined,
      SUBWAY: undefined,
      BUS: undefined,
      FERRY: undefined,
    };

    if (segments.length === 0) {
      reasons.BIKE_SHARE = "Start at origin with WALK.";
      reasons.FERRY = "Start at origin with WALK.";
      return reasons;
    }

    const modeChecks: Array<Exclude<Mode, "WALK">> = ["BIKE_SHARE", "SUBWAY", "BUS", "FERRY"];
    for (const mode of modeChecks) {
      if (!currentNode) {
        reasons[mode] = `Need ${MODE_TO_NODE_TYPE[mode]} for ${modeLabel(mode)}.`;
        continue;
      }

      if (currentNode.type !== MODE_TO_NODE_TYPE[mode]) {
        reasons[mode] = `${modeLabel(mode)} requires ${MODE_TO_NODE_TYPE[mode]}.`;
      }
    }

    return reasons;
  }, [currentNode, segments.length]);

  const activeMode: Mode = modeDisabledReasons[selectedMode] ? "WALK" : selectedMode;

  const visibleNodes = useMemo(() => {
    if (activeMode !== "WALK" || !currentPosition) {
      return nodes;
    }

    return nodes.filter((node) =>
      haversineMeters(currentPosition.lat, currentPosition.lng, node.lat, node.lng) <= WALK_NODE_VISIBILITY_RADIUS_METERS,
    );
  }, [activeMode, currentPosition, nodes]);

  useEffect(() => {
    if (!challenge || !viewportBounds) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          cityId: challenge.cityId,
          mode: activeMode,
          minLat: String(viewportBounds.minLat),
          maxLat: String(viewportBounds.maxLat),
          minLng: String(viewportBounds.minLng),
          maxLng: String(viewportBounds.maxLng),
        });

        if (currentPosition?.nodeId) {
          params.set("currentNodeId", currentPosition.nodeId);
        }

        const response = await fetch(`/api/challenge/nodes?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as { nodes?: NodeDTO[] };
        const fetchedNodes = data.nodes ?? [];
        setNodes(fetchedNodes);
        setKnownNodes((prev) => {
          const next = { ...prev };
          for (const node of fetchedNodes) {
            next[node.id] = node;
          }
          return next;
        });
      } catch {
      }
    }, 180);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [activeMode, challenge, currentPosition?.nodeId, viewportBounds]);

  function appendSegment(to: { lat: number; lng: number; nodeId?: string }) {
    if (!currentPosition) {
      return;
    }

    setSegments((prev) => [...prev, { mode: activeMode, from: currentPosition, to }]);
  }

  function onNodeClick(node: NodeDTO) {
    if (!currentPosition) {
      return;
    }

    setKnownNodes((prev) => ({ ...prev, [node.id]: node }));

    if (activeMode === "WALK") {
      appendSegment({ lat: node.lat, lng: node.lng, nodeId: node.id });
      return;
    }

    if (!currentNode) {
      return;
    }

    const requiredType = MODE_TO_NODE_TYPE[activeMode];
    if (currentNode.type !== requiredType || node.type !== requiredType || node.id === currentNode.id) {
      return;
    }

    appendSegment({ lat: node.lat, lng: node.lng, nodeId: node.id });
  }

  function onDestinationClick() {
    if (!challenge || activeMode !== "WALK") {
      return;
    }

    appendSegment({ lat: challenge.destLat, lng: challenge.destLng });
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

  const nextHint = guidance(activeMode, modeDisabledReasons, canSubmit);
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
            <span>{compactModeLabel(activeMode)}</span>
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
            nodes={visibleNodes}
            segments={segments}
            selectedMode={activeMode}
            currentPosition={currentPosition}
            currentNodeId={currentNode?.id}
            onNodeClick={onNodeClick}
            onDestinationClick={onDestinationClick}
            onViewportChange={setViewportBounds}
          />
        </div>

        <div className={styles.modeDock}>
          {MODES.map((mode) => {
            const reason = modeDisabledReasons[mode];
            const disabled = Boolean(reason);
            return (
              <button
                key={mode}
                type="button"
                className={mode === activeMode ? styles.modeActive : styles.modeButton}
                disabled={disabled}
                title={reason}
                onClick={() => setSelectedMode(mode)}
              >
                {modeLabel(mode)}
              </button>
            );
          })}
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
                  <span>
                    ({segment.from.lat.toFixed(4)}, {segment.from.lng.toFixed(4)}) to ({segment.to.lat.toFixed(4)}, {segment.to.lng.toFixed(4)})
                  </span>
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
              <li>Start at origin. Only WALK is available first.</li>
              <li>Transit modes require matching node type at current position.</li>
              <li>BIKE_SHARE, SUBWAY, BUS, and FERRY are node-to-node only.</li>
              <li>WALK can move to any node or destination B.</li>
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
