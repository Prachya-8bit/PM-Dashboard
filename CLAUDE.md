# CLAUDE.md

PM Dashboard — a Next.js 15 clone of the SYS "Budget Status Overview" Tableau view.
Light theme: `#F4F6FA` page background, white cards, dark `#1A2233` text.

## Commands

```bash
npm run dev     # dev server on http://localhost:3000 (dashboard lives at /dashboard)
npm run build   # production build
npm start       # serve production build
npm run etl     # python etl/etl.py — refresh data/dashboard.db from MS SQL
```

No test or lint scripts are configured.

## Deployment

**Local-only. This project is NOT linked to Vercel** (no `.vercel/` dir, no Vercel
project exists for it). The Vercel project `gate-pass-system` on this account is a
different repo — do not associate its deployments with this codebase.

## Architecture

```
SYS (MS SQL Server, read-only login)
    ↓  etl/etl.py — cron every 10 min, aggregation queries, atomic swap
data/dashboard.db (SQLite, pre-aggregated)
    ↓  better-sqlite3, read-only singleton (lib/db.ts)
Next.js server components (app/dashboard/page.tsx) → Recharts + project list
```

The web app never talks to MS SQL. All aggregation happens in the ETL; the app runs
plain SELECTs against SQLite. MS SQL credentials live only in `.env.local` (ETL-only).

## Key files

- `etl/etl.py` — MS SQL → SQLite pipeline. `STATUS_TO_PHASE` maps DB status strings
  to phase keys; adjust there if source statuses change.
- `lib/db.ts` — read-only better-sqlite3 lazy singleton. `server-only` guarded.
  No PRAGMAs (they're write ops and fail on a read-only handle).
- `lib/dashboard-data.ts` — server data layer; one public call `getDashboardData()`.
- `lib/dashboard-types.ts` — shared types + `PHASES`. **No** `server-only` guard on
  purpose: client components import it.
- `app/dashboard/page.tsx` — server component page; `charts.tsx` and
  `project-list.tsx` are client components.
- `files/` — frozen snapshot from the initial commit (old dark-theme version).
  Reference only; never edit or import from it.

## Invariants

- Phase keys, labels, and colors are **duplicated** in `etl/etl.py` and
  `lib/dashboard-types.ts` (`PHASES`) — change both together.
- SQLite tables: `phase_summary`, `yearly_budget`, `yearly_status`, `projects`,
  `metadata` (`last_run` timestamp). The ETL rewrites the live DB **in place in
  one IMMEDIATE transaction** — never switch back to temp-file + rename: Windows
  can't rename over the file while the app holds it open, and the app's lazy
  singleton would keep reading the old inode anyway. The app opens the DB
  read-only with `busy_timeout` so it waits out the write lock.
- `SQLITE_PATH` env var is read by both the ETL and `lib/db.ts` — default
  `./data/dashboard.db`.

## Environment quirks

- WSL2; the `sqlite3` CLI is not installed. Inspect the DB via node, e.g.
  `node -e "const db=require('better-sqlite3')('data/dashboard.db',{readonly:true}); ..."`
