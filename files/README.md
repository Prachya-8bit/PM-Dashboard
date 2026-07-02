# PM Dashboard — Tableau → Next.js clone

A direct clone of the SYS "Budget Status Overview" Tableau view: five phase cards +
"Budget vs Actual by Year" + "Project Status by Year", dark theme.

## Architecture

```
┌──────────────────┐                    ┌─────────────────────────────────┐
│  SYS Server       │                    │  Web Server (this app)          │
│  ┌──────────────┐ │  cron ทุก 10 นาที  │                                 │
│  │ MS SQL Server │─┼─── ETL (Python) ──►  ┌──────────┐  ┌────────────┐  │
│  │ (Production)  │ │   SELECT ปุ๊บจบ     │  │ SQLite   │◄─│ Next.js    │  │
│  └──────────────┘ │                    │  │ dashboard│  │ Dashboard  │  │
└──────────────────┘                    │  │ .db      │  │ /dashboard │  │
                                        │  └──────────┘  └────────────┘  │
                                        └─────────────────────────────────┘
```

- **ETL** (`etl/etl.py`) connects to SYS MS SQL once every 10 minutes, runs aggregation
  queries, and writes the result to a local SQLite file using an atomic swap.
- **Next.js** reads the SQLite file directly via `better-sqlite3` — **no connection
  to SYS from the web layer**. Zero load on production.

## Setup

```bash
# 1. Install Node deps
npm i better-sqlite3 recharts server-only

# 2. Install Python ETL deps
pip install pymssql

# 3. Configure
cp .env.local.example .env.local   # fill in SYS credentials

# 4. First ETL run (creates SQLite)
python etl/etl.py

# 5. Start dashboard
npm run dev
# → http://localhost:3000/dashboard
```

## Cron

```bash
# Run ETL every 10 minutes on the web server:
*/10 * * * * cd /path/to/dash && python etl/etl.py >> /var/log/dash-etl.log 2>&1
```

## The ONLY edits you must make

All in **`etl/etl.py`**, marked `# ADJUST`:

1. **`STATUS_TO_PHASE`** — the keys must match the *exact* status strings stored in your DB
   (e.g. is it `"PO on Process"` or `"PO_ON_PROCESS"` or a numeric code?). Map each to a PhaseKey.
2. **`.env.local`** → `SQL_TABLE`, `SQL_COL_*` — your real table and column names.
3. **`SQL_MB_DIVISOR`** (env) — `1000000` if amounts are raw Baht, `1` if already in millions.

That's it. The aggregation logic, totals, the 68% progress metric, and both charts derive
automatically from the ETL output.

## How the numbers map to your slide

| Slide element | Source |
|---|---|
| Card count / Budget / Actual | `phase_summary` table in SQLite |
| Total Project / Total Budget | summed across phases |
| 68% | (Budget Closed + Installation Completed + PO Created) / total |
| Budget vs Actual by Year | `yearly_budget` table |
| Project Status by Year | `yearly_status` table (stacked counts) |

## Notes & gaps

- **Atomic swap.** ETL writes to `dashboard.db.tmp` then `os.replace()` — the dashboard
  never reads a half-written file.
- **Caching.** `export const dynamic = "force-dynamic"` makes it always-fresh (but data
  only changes every 10 min anyway). For a wall display, switch to
  `export const revalidate = 600` to cut unnecessary re-renders.
- **Security.** ETL needs `SELECT`-only permissions on SYS. Dashboard needs no DB
  credentials at all beyond the local SQLite path. Column names in queries are
  interpolated in the ETL script — keep them as trusted config, never user input.
  All *values* are parameterized.
- **Colors** are lifted from your Tableau: Budget Closed blue, Installation Completed teal,
  PO Created amber, PO On Process red, PR On Process purple.
