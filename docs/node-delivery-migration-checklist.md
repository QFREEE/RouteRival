# Node Delivery Migration Checklist

Goal: move static transit nodes (subway/bus/bike) from backend API queries to frontend-loaded snapshot data, while keeping challenge/scoring/submission logic on the backend.

## Phase 0: Baseline and Guardrails

- [ ] Capture current baseline metrics on `/challenge/today` (initial load time, node API response size, FPS while panning).
- [ ] Define success thresholds (for example: reduce initial map payload by 50%+, no visible pan stutter at normal zoom).
- [ ] Keep existing `/api/challenge/nodes` path as fallback during migration.

## Phase 1: Static Node Packaging

- [ ] Add processed frontend node bundles to snapshot build output (by mode and/or spatial chunks).
- [ ] Produce files in `public/data/nyc/current/` for direct client fetch.
- [ ] Include metadata/version/hash for cache-busting and consistency checks.
- [ ] Document file schema (required fields and coordinate precision).

## Phase 2: Frontend Loader

- [ ] Create client node loader that fetches static bundles on challenge start.
- [ ] Implement mode + viewport filtering in the frontend.
- [ ] Add debounce for map move/zoom updates.
- [ ] Add `AbortController` handling for rapid mode changes.
- [ ] Keep memory bounded (do not hold unused large objects after indexing).

## Phase 3: Performance Hardening

- [ ] Optionally move filtering/indexing to a Web Worker.
- [ ] Add simple spatial index (grid buckets or R-tree) for fast viewport queries.
- [ ] Verify interaction remains smooth at dense zoom levels.
- [ ] Validate mobile performance separately.

## Phase 4: Functional Parity Checks

- [ ] Ensure mode gating behavior remains identical.
- [ ] Ensure current-node continuity works when switching modes.
- [ ] Ensure destination/segment interactions are unchanged.
- [ ] Compare node counts returned by old API vs new frontend filtering for representative viewports.

## Phase 5: Rollout

- [ ] Add feature flag: `useStaticNodeLoading`.
- [ ] Ship with fallback to `/api/challenge/nodes` enabled.
- [ ] Run A/B or staged rollout in dev/staging.
- [ ] Remove backend node-fetch dependency from challenge page once stable.
- [ ] Keep backend endpoint for emergency fallback until confidence is high.

## Phase 6: Cleanup

- [ ] Update docs and architecture notes.
- [ ] Remove dead code paths and old client fetch logic.
- [ ] Re-run lint/build/screenshot checks.
- [ ] Record final before/after metrics in this file.

## Non-Goals

- Do not move scoring, submission validation, or leaderboard ranking to frontend.
- Do not change challenge-of-day authority away from backend.
