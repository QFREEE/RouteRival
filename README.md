# RouteRival MVP

Web-based competitive routing game built with Next.js App Router, TypeScript, Prisma, SQLite, and Leaflet.

## Quickstart

```bash
npm install
npx prisma migrate dev
npx prisma generate
npm run db:seed
npm run dev
```

Open `http://localhost:3000` and play at `http://localhost:3000/challenge/today`.

## Core Gameplay

- Given origin A and destination B, players build node-based multimodal routes.
- Allowed modes: `WALK`, `BIKE_SHARE`, `SUBWAY`, `BUS`, `FERRY`.
- During planning, no ETA/time-distance hints are shown.
- After submit, server computes deterministic total time and rank.

## API Endpoints

- `GET /api/challenge/today`
  - Returns today challenge plus city nodes.
- `POST /api/submissions`
  - Validates route, computes score, stores submission, returns `totalTimeMinutes` and `rank`.
- `GET /api/leaderboard/today`
  - Returns ranked submissions for today.
- `POST /api/admin/challenge` (local only)
  - Protected by `x-admin-key` and disabled in production.

## Optional Separate Backend (Different Port)

- Start simple backend service on port `4001`:

```bash
npm run dev:api
```

- In development, frontend `/api/*` requests now default to `http://localhost:4001` unless `BACKEND_ORIGIN` is set.

- Point Next.js frontend `/api/*` calls to that backend:

```bash
BACKEND_ORIGIN=http://localhost:4001 npm run dev
```

- Start backend + frontend together:

```bash
npm run dev:full
```

- Change backend port if needed:

```bash
BACKEND_PORT=4010 npm run dev:api
BACKEND_ORIGIN=http://localhost:4010 npm run dev
```

## Database and Seeding

- Schema: `prisma/schema.prisma`
- Base seed (NYC nodes + today challenge):

```bash
npm run db:seed
```

- Refresh transit snapshots (subway + bus + Citi Bike), build map layers, and seed nodes:

```bash
npm run data:snapshot
```

- Download NYC-only local base map tiles (zooms 10-14):

```bash
npm run tiles:fetch:nyc
```

## Engineering TODO

- Evaluate serving static transit nodes (subway/bus/bike) directly to the frontend at challenge load and filtering in-browser for faster map interaction, while keeping scoring/submissions/leaderboard on backend.
- Track implementation steps in `docs/node-delivery-migration-checklist.md`.

- Rotate/create challenge by CLI:

```bash
npm run seed:challenge -- --city=NYC --dateKey=2026-02-16 --title="Downtown Dash" --originLat=40.7412 --originLng=-73.9896 --destLat=40.7060 --destLng=-74.0087
```

## Optional Local Admin Endpoint

Set `ADMIN_KEY` in `.env`, then call:

```bash
curl -X POST http://localhost:3000/api/admin/challenge \
  -H "Content-Type: application/json" \
  -H "x-admin-key: your-admin-key" \
  -d '{"cityName":"NYC","title":"Downtown Dash","originLat":40.7412,"originLng":-73.9896,"destLat":40.7060,"destLng":-74.0087}'
```

## UI Screenshot Skill

Use Playwright to capture the gameplay page and verify the map is rendering with valid dimensions.

```bash
npx playwright install chromium
npm run dev
npm run ui:screenshot
```

Output file: `artifacts/challenge-today.png`
