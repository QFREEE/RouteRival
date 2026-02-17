"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ModeKey = "WALK" | "BIKE_SHARE" | "SUBWAY" | "BUS" | "FERRY";

type MetricsState = {
  sessionStartedAt: number;
  challengeLoadMs: number | null;
  firstNodeLoadMs: number | null;
  firstBaseTileMs: number | null;
  viewportEvents: number;
  nodeRequests: number;
  nodeRequestTotalMs: number;
  maxNodesReturned: number;
  lastNodesReturned: number;
  nodeRequestsByMode: Record<ModeKey, number>;
};

type WindowWithMetrics = Window & {
  __routeRivalMetrics?: {
    getSnapshot: () => ReturnType<typeof buildSummary>;
    print: () => void;
  };
};

function now() {
  return performance.now();
}

function buildSummary(state: MetricsState) {
  return {
    challengeLoadMs: state.challengeLoadMs,
    firstNodeLoadMs: state.firstNodeLoadMs,
    firstBaseTileMs: state.firstBaseTileMs,
    viewportEvents: state.viewportEvents,
    nodeRequests: state.nodeRequests,
    avgNodeRequestMs: state.nodeRequests === 0 ? 0 : state.nodeRequestTotalMs / state.nodeRequests,
    lastNodesReturned: state.lastNodesReturned,
    maxNodesReturned: state.maxNodesReturned,
    nodeRequestsByMode: state.nodeRequestsByMode,
  };
}

export function useChallengeMetrics() {
  const [state, setState] = useState<MetricsState>({
    sessionStartedAt: now(),
    challengeLoadMs: null,
    firstNodeLoadMs: null,
    firstBaseTileMs: null,
    viewportEvents: 0,
    nodeRequests: 0,
    nodeRequestTotalMs: 0,
    maxNodesReturned: 0,
    lastNodesReturned: 0,
    nodeRequestsByMode: {
      WALK: 0,
      BIKE_SHARE: 0,
      SUBWAY: 0,
      BUS: 0,
      FERRY: 0,
    },
  });

  const challengeReqStartRef = useRef<number | null>(null);
  const nodeReqStartRef = useRef<number | null>(null);

  const startChallengeLoad = useCallback(() => {
    challengeReqStartRef.current = now();
  }, []);

  const finishChallengeLoad = useCallback(() => {
    const start = challengeReqStartRef.current;
    if (start === null) {
      return;
    }

    const elapsed = now() - start;
    challengeReqStartRef.current = null;

    setState((prev) => ({
      ...prev,
      challengeLoadMs: prev.challengeLoadMs ?? elapsed,
    }));
  }, []);

  const startNodeRequest = useCallback(() => {
    nodeReqStartRef.current = now();
  }, []);

  const finishNodeRequest = useCallback((mode: ModeKey, returnedCount: number) => {
    const start = nodeReqStartRef.current;
    if (start === null) {
      return;
    }

    const elapsed = now() - start;
    nodeReqStartRef.current = null;

    setState((prev) => ({
      ...prev,
      firstNodeLoadMs: prev.firstNodeLoadMs ?? elapsed,
      nodeRequests: prev.nodeRequests + 1,
      nodeRequestTotalMs: prev.nodeRequestTotalMs + elapsed,
      lastNodesReturned: returnedCount,
      maxNodesReturned: Math.max(prev.maxNodesReturned, returnedCount),
      nodeRequestsByMode: {
        ...prev.nodeRequestsByMode,
        [mode]: prev.nodeRequestsByMode[mode] + 1,
      },
    }));
  }, []);

  const markViewportEvent = useCallback(() => {
    setState((prev) => ({ ...prev, viewportEvents: prev.viewportEvents + 1 }));
  }, []);

  const markFirstBaseTile = useCallback(() => {
    setState((prev) => {
      if (prev.firstBaseTileMs !== null) {
        return prev;
      }

      return {
        ...prev,
        firstBaseTileMs: now() - prev.sessionStartedAt,
      };
    });
  }, []);

  const summary = useMemo(() => buildSummary(state), [state]);

  useEffect(() => {
    const typedWindow = window as WindowWithMetrics;
    typedWindow.__routeRivalMetrics = {
      getSnapshot: () => buildSummary(state),
      print: () => {
        console.table(buildSummary(state));
      },
    };

    return () => {
      delete typedWindow.__routeRivalMetrics;
    };
  }, [state]);

  return {
    summary,
    startChallengeLoad,
    finishChallengeLoad,
    startNodeRequest,
    finishNodeRequest,
    markViewportEvent,
    markFirstBaseTile,
  };
}
