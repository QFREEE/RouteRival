# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Production build
npm run lint             # ESLint

# Database
npx prisma migrate dev   # Run migrations
npx prisma generate      # Regenerate Prisma client (run after schema changes)
npm run db:seed          # Seed NYC nodes + today's challenge

# Data pipeline (runs fetch → build → seed:nodes in sequence)
npm run data:snapshot    # Refresh transit snapshots (subway, bus, Citi Bike)

# Challenge management
npm run seed:challenge -- --city=NYC --dateKey=2026-02-16 --title="Title" \
  --originLat=40.7412 --originLng=-73.9896 --destLat=40.7060 --destLng=-74.0087

# UI testing
npm run ui:screenshot    # Playwright screenshot → artifacts/challenge-today.png
```

## Architecture

**Stack:** Next.js 16 App Router, TypeScript, Prisma + SQLite (`dev.db`), Leaflet/react-leaflet.

**Database models** (`prisma/schema.prisma`):
- `City` → `Node[]` (transit stops: `BIKE_DOCK`, `SUBWAY_STATION`, `BUS_STOP`, `FERRY_TERMINAL`)
- `City` → `Challenge[]` (unique per `cityId + dateKey`)
- `Challenge` → `Submission[]` (stores `segments` as JSON, `totalTimeMinutes`)

**Core game types** (`src/types/game.ts`):
- `Segment`: `{ mode, from: Coordinate, to: Coordinate }` — the atomic unit of a route
- `Coordinate`: `{ lat, lng, nodeId? }` — `nodeId` present when snapped to a transit node

**Scoring** (`src/lib/game/scoring.ts`): Deterministic server-side calculation. Each segment costs `distance/speed * 60` minutes + per-mode leg penalty + 2-minute mode-switch penalty. Speeds and penalties are hardcoded constants.

**Validation** (`src/lib/game/validation.ts`): Route must start at challenge origin (±5m), each segment must continue from the previous endpoint (±5m), transit modes require matching node types at both ends, and route must finish within 50m of destination.

**API routes** (`src/app/api/`):
- `GET /api/challenge/today` — returns today's challenge (by server date)
- `GET /api/challenge/nodes` — filtered by `cityId`, `mode`, and viewport bounds (debounced on client)
- `POST /api/submissions` — validates + scores + ranks, returns `totalTimeMinutes` and `rank`
- `GET /api/leaderboard/today`
- `POST /api/admin/challenge` — protected by `x-admin-key` header, disabled in production

**Frontend** (`src/app/challenge/today/page.tsx`):
- Single client page orchestrating all game state
- `ChallengeMap` is loaded with `next/dynamic` + `ssr: false` (Leaflet requires browser globals)
- Nodes are fetched lazily with 180ms debounce as the viewport changes; only nodes relevant to the active mode + current viewport are loaded
- `selectedMode` falls back to `WALK` if the mode's `modeDisabledReasons` entry is set

**Map** (`src/components/map/ChallengeMap.tsx`):
- Primary tiles served locally at `/tiles/nyc/{z}/{x}/{y}.png`; falls back to OpenStreetMap on tile error
- Subway and bus GeoJSON overlays loaded lazily from `/data/nyc/current/`
- Map is bounded to `NYC_BOUNDS`, zoom 10–14

**Data pipeline** (`scripts/`): Fetches GTFS/Citi Bike snapshots, builds GeoJSON overlays, then seeds Node rows. Output lives in `public/data/nyc/current/` (GeoJSON) and `public/tiles/nyc/` (map tiles).

**Environment:** Requires `DATABASE_URL` (SQLite path) in `.env`. Optionally set `ADMIN_KEY` for the admin endpoint.
