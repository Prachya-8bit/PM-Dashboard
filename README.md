# PM Dashboard

A modern Next.js dashboard cloning the "Budget Status Overview" Tableau view. Displays project phases, budget vs actual tracking, status trends, and a filterable project list.

## Features

- **5 Phase Cards**: Budget Closed, Installation Completed, PO Created, PO On Process, PR On Process
- **Budget vs Actual by Year**: Stacked bar charts showing committed and actual spending
- **Project Status by Year**: Trend visualization across all years
- **Project List**: Filterable table of all projects — filter by phase, year, or search by project name / project manager
- **Dark Theme**: Professional, accessible UI with Recharts
- **Decoupled Data Path**: The web app never talks to MS SQL — it reads a local SQLite file kept fresh by a Python ETL job

## Architecture

```
SYS (MS SQL Server, read-only login)
    ↓  etl/etl.py — cron every 10 min, aggregation queries, atomic swap
data/dashboard.db (SQLite)
    ↓  better-sqlite3, read-only (lib/db.ts)
Next.js server components → Recharts + Project List
```

**Why not query MS SQL directly from Next.js?** The dashboard only needs pre-aggregated data. Running aggregation once in the ETL keeps page loads fast, isolates SYS from web traffic, and means the dashboard works even when SYS is unreachable.

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Charting**: Recharts
- **Data Storage**: SQLite (via better-sqlite3, read-only)
- **ETL**: Python 3 (pymssql or pyodbc) pulling from MS SQL Server

## Quick Start

### Prerequisites

- **Node.js 18+** — [install](https://nodejs.org)
- **Python 3.8+** — only needed to run the ETL
- **MS SQL Server** credentials (read-only login recommended) — only needed by the ETL

### Run the dashboard

```bash
npm install

# Development server (http://localhost:3000)
npm run dev

# Production
npm run build
npm start
```

Visit `/dashboard` to view the dashboard. The app reads `data/dashboard.db` directly — no database credentials required.

### Refresh the data (ETL)

```bash
# Install Python dependencies
pip install -r etl/requirements.txt

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your MS SQL Server credentials

# Run once
npm run etl

# Or schedule via cron (every 10 minutes)
*/10 * * * * cd /path/to/project && python etl/etl.py >> /var/log/dash-etl.log 2>&1
```

The ETL writes to SQLite with an atomic swap, so the dashboard never sees a half-written database.

## Configuration

All configuration lives in **`.env.local`** (see `.env.local.example`) and is consumed by the ETL:

| Variable | Purpose |
|---|---|
| `SQL_SERVER`, `SQL_PORT`, `SQL_DATABASE`, `SQL_USER`, `SQL_PASSWORD` | MS SQL connection (ETL only) |
| `SQL_ENCRYPT`, `SQL_TRUST_CERT` | TLS options for the MS SQL connection |
| `SQL_TABLE` | Source table, e.g. `SysPurchaseDB.dbo.CapexProjects` |
| `SQL_COL_STATUS`, `SQL_COL_BUDGET`, `SQL_COL_ACTUAL`, `SQL_COL_COMMITTED`, `SQL_COL_DATE`, `SQL_COL_NAME`, `SQL_COL_PM` | Column names in the source table |
| `SQL_MB_DIVISOR` | `1000000` if amounts are raw Baht, `1` if already in millions |
| `SQLITE_PATH` | SQLite output path (default `./data/dashboard.db`), read by both ETL and dashboard |

**Status mapping**: `STATUS_TO_PHASE` in `etl/etl.py` maps your exact DB status strings to phase keys — adjust it if your statuses differ:

```python
STATUS_TO_PHASE = {
    "Budget Closed":          "BUDGET_CLOSED",
    "Installation Completed": "INSTALL_COMPLETED",
    "PO Created":             "PO_CREATED",
    "PO on Process":          "PO_ON_PROCESS",
    "PR on Process":          "PR_ON_PROCESS",
}
```

## Customization

### Caching

Pages render with fresh SQLite reads by default. For a wall display, add revalidation:

```typescript
// In app/dashboard/page.tsx:
export const revalidate = 300;  // Revalidate every 5 minutes
```

### Colors

Phase colors are defined in both `etl/etl.py` and `lib/dashboard-types.ts` (keep them in sync):

- Budget Closed: `#2D7FF9` (blue)
- Installation Completed: `#1FBF8F` (teal)
- PO Created: `#F5A623` (amber)
- PO On Process: `#FF5A52` (red)
- PR On Process: `#9B6BE0` (purple)

## Security

- MS SQL credentials live only in `.env.local` (gitignored) and are used only by the ETL — the web app never sees them
- The dashboard opens SQLite **read-only**
- Use a SQL login with minimal permissions (SELECT only)
- `SQL_TABLE` and column names are interpolated config — keep them trusted, never user input

## Troubleshooting

### "Cannot find module" errors after cloning
```bash
npm install
```

### Dashboard shows no data
- Check that `data/dashboard.db` exists and is non-empty — run `npm run etl` to (re)build it
- Verify `STATUS_TO_PHASE` in `etl/etl.py` matches your DB status strings exactly

### ETL connection errors
- Verify credentials in `.env.local`
- Check network access to SQL Server (firewall, ports)
- Confirm `SQL_TABLE` and column env vars match your schema
- Install a driver: `pymssql` (default) or `pyodbc` + ODBC Driver 18

## Project Structure

```
.
├── app/
│   └── dashboard/
│       ├── page.tsx            # Main dashboard page (server component)
│       ├── DashboardView.tsx   # Chart components
│       └── project-list.tsx    # Filterable project table (client component)
├── lib/
│   ├── db.ts                   # SQLite connection (read-only singleton)
│   ├── dashboard-data.ts       # Reads pre-aggregated tables from SQLite
│   └── dashboard-types.ts      # Shared types + phase definitions
├── etl/
│   ├── etl.py                  # MS SQL → SQLite pipeline (ADJUST STATUS_TO_PHASE HERE)
│   └── requirements.txt        # Python dependencies
├── data/
│   └── dashboard.db            # Aggregated SQLite (written by ETL)
├── package.json
├── tsconfig.json
├── next.config.ts
└── .env.local.example
```

## License

Proprietary — See your organization's policies
