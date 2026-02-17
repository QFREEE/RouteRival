# NYC Transit Snapshot Sources

RouteRival uses versioned snapshots for deterministic game maps and node placement.

## Source URLs

- MTA subway GTFS static: `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_subway.zip`
- MTA bus GTFS static (all feeds):
  - `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_b.zip`
  - `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_bx.zip`
  - `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_m.zip`
  - `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_q.zip`
  - `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_si.zip`
  - `https://rrgtfsfeeds.s3.amazonaws.com/gtfs_busco.zip`
- Citi Bike station information (GBFS): `https://gbfs.citibikenyc.com/gbfs/en/station_information.json`

## Snapshot Structure

- Raw downloads: `data/snapshots/YYYY-MM-DD/raw`
- Processed outputs: `data/snapshots/YYYY-MM-DD/processed`
- Latest app data (copied set): `data/nyc/current`
- Public map layer copy: `public/data/nyc/current`

## Commands

- Fetch raw sources: `npm run data:fetch`
- Build processed files and refresh current copies: `npm run data:build`
- Seed transit nodes to DB from latest snapshot: `npm run data:seed:nodes`
- Full pipeline: `npm run data:snapshot`

## Cadence

- Default: weekly snapshot refresh
- Optional: daily refresh during rapid iteration

## Scope

Current ingest scope is subway, bus, and Citi Bike nodes. Ferry remains in the domain model but is intentionally out of ingest scope for this MVP.

## TODO: Node Delivery Strategy

- Evaluate moving static node datasets (subway stations, bus stops, bike docks) from backend API queries to frontend-loaded snapshot files.
- Candidate direction: load all station data once at challenge bootstrap, then do mode + viewport filtering client-side (optionally in a Web Worker).
- Keep backend authoritative for challenge selection, scoring, submissions, and leaderboard.
- Migration checklist: `docs/node-delivery-migration-checklist.md`.
