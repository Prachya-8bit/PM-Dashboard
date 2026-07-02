# PM Dashboard

A modern Next.js dashboard cloning the "Budget Status Overview" Tableau view. Displays project phases, budget vs actual tracking, and project status trends with live data from MS SQL Server.

## Features

- **5 Phase Cards**: Budget Closed, Installation Completed, PO Created, PO On Process, PR On Process
- **Budget vs Actual by Year**: Stacked bar charts showing committed and actual spending
- **Project Status by Year**: Trend visualization across all years
- **Dark Theme**: Professional, accessible UI with Recharts
- **Server-Side Database Connection**: Direct MS SQL Server connection via Next.js API routes (no credentials in browser)

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Charting**: Recharts
- **Database**: MS SQL Server (read-only connection)
- **ETL**: Python (optional data pipeline)
- **Data Storage**: SQLite (local fallback)

## Quick Start

### Prerequisites

- **Node.js 18+** — [install](https://nodejs.org)
- **Python 3.8+** — for ETL (optional)
- **MS SQL Server** credentials (read-only login recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/Prachya-8bit/PM-Dashboard.git
cd PM-Dashboard

# Install Node dependencies
npm install

# Set up environment
cp .env.local.example .env.local
# Edit .env.local with your MS SQL Server credentials
```

### Configuration

All configuration is in **`lib/dashboard-data.ts`** (marked `// ADJUST`):

1. **`STATUS_TO_PHASE`** — Map your exact DB status strings to phase keys
   ```typescript
   "PO on Process": "po_on_process",
   "Budget Closed": "budget_closed",
   // ... etc
   ```

2. **`TABLE`** — Your SQL table (e.g., `Database.schema.Table`)
   ```typescript
   const TABLE = "SysPurchaseDB.dbo.CapexProjects";
   ```

3. **`COL`** — Column names in your table
   ```typescript
   const COL = {
     status: "Status",
     budget: "Budget",
     actual: "Actual",
     committed: "Committed",
     dateColumn: "CreatedDate"
   };
   ```

4. **`.env.local`**
   ```
   MSSQL_USER=your_username
   MSSQL_PASSWORD=your_password
   MSSQL_SERVER=your_server
   MSSQL_DATABASE=your_database
   SQL_MB_DIVISOR=1000000  # or 1 if amounts already in millions
   ```

### Running

```bash
# Development server (http://localhost:3000)
npm run dev

# Production build
npm run build
npm start

# ETL pipeline (optional)
npm run etl
```

Visit `/dashboard` to view the dashboard.

## Architecture

```
Next.js (server components)
    ↓
Direct pooled connection to MS SQL Server
    (read-only, no Open WebUI/LLM layer)
    ↓
Recharts visualization
```

**Why direct DB connection?** Charts need deterministic, cacheable queries — not LLM-generated SQL. Open WebUI's natural-language layer is great for exploration, but unsuitable for dashboards.

## Database Requirements

- Table with columns for: project status, budget, actual, committed, and date
- Suggest using a **read-only SQL login** (security best practice)
- Identifiers (`TABLE`, `COL`) are interpolated config — keep them trusted, never user input
- All query *values* are parameterized

## Optional: ETL Pipeline

The `etl/` directory includes a Python pipeline for data loading:

```bash
# Install Python dependencies
pip install -r etl/requirements.txt

# Run ETL
npm run etl
```

**Python requirements:**
- `pymssql>=2.3` — MS SQL driver (or `pyodbc>=5.2` for ODBC)
- `schedule>=1.2` — job scheduling (optional, use cron otherwise)

## Customization

### Period Filter (Cards only)

Currently all queries span all-time. To scope the 5 phase cards to a date range (e.g., "Jan–Apr'26"):

```typescript
// In queryPhaseSummary(), add WHERE clause:
WHERE [${COL.dateColumn}] BETWEEN @from AND @to
```

### Caching

Default: `export const dynamic = "force-dynamic"` (always fresh). For a wall display or to reduce DB load:

```typescript
// In app/dashboard/page.tsx:
export const revalidate = 300;  // Revalidate every 5 minutes
```

### Colors

Colors are in `app/dashboard/DashboardView.tsx` — pulled from the original Tableau palette:

- Budget Closed: `#1f77b4` (blue)
- Installation Completed: `#2ca02c` (teal)
- PO Created: `#ff7f0e` (amber)
- PO On Process: `#d62728` (red)
- PR On Process: `#9467bd` (purple)

## Security

✅ **Safe practices:**
- Database credentials stored only in `.env.local` (server-side)
- SQL identifiers treated as trusted config
- All query values are parameterized
- No credentials shipped to browser

⚠️ **Keep in mind:**
- `.env.local` is in `.gitignore` — never commit it
- Table/column names cannot be parameterized (SQL Server limitation) — must be trusted config
- Use a SQL login with minimal permissions (SELECT only)

## Troubleshooting

### "Cannot find module" errors after cloning
```bash
npm install
```

### Connection errors to MS SQL
- Verify credentials in `.env.local`
- Check network access to SQL Server (firewall, ports)
- Confirm table name and column names match exactly

### Charts showing no data
- Check `STATUS_TO_PHASE` mapping — statuses must match your DB exactly
- Verify `TABLE` and `COL` references
- Run a manual query against your DB to confirm data exists

## Project Structure

```
.
├── app/
│   └── dashboard/
│       ├── page.tsx          # Main dashboard page
│       └── DashboardView.tsx  # Chart components
├── lib/
│   ├── db.ts                 # MS SQL connection pool
│   └── dashboard-data.ts     # SQL queries & config (ADJUST HERE)
├── etl/
│   ├── etl.py               # Python data pipeline
│   └── requirements.txt      # Python dependencies
├── package.json
├── tsconfig.json
├── next.config.ts
└── .env.local.example
```

## License

Proprietary — See your organization's policies

## Support

For questions or issues:
1. Check `.env.local` and `lib/dashboard-data.ts` configuration
2. Verify MS SQL Server connectivity
3. Review error logs in browser console and server output
