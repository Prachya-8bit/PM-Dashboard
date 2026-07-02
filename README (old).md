# PM Dashboard — Tableau → Next.js clone

A direct clone of the SYS "Budget Status Overview" Tableau view: five phase cards +
"Budget vs Actual by Year" + "Project Status by Year", dark theme, reading live from
MS SQL Server.

## Architecture — read this first

```
Next.js (server component / API route)  ──direct──►  MS SQL Server (read-only login)
        │
        └─ DOES NOT go through Open WebUI / the LLM / MCP.
```

Open WebUI reaches your DB through a natural-language → SQL (LLM) layer. **Do not reuse
that path for the dashboard.** Charts need deterministic, fast, cacheable SQL — not model-
generated queries. This app opens its own pooled connection to the same instance.

The DB connection lives **only** in `lib/db.ts` (server side). Nothing here ships SQL
credentials to the browser.

## Setup

```bash
# in an existing Next.js 14+ App-Router project, or `npx create-next-app@latest`
npm i mssql recharts
npm i server-only            # optional, enforces server-only imports

cp .env.local.example .env.local   # then fill in real values
```

Copy `lib/`, `app/dashboard/` into your project. Visit `/dashboard`.

> `@/lib/...` imports assume the default `"@/*": ["./*"]` path alias in `tsconfig.json`.
> Adjust if yours differs.

## The ONLY edits you must make

All in **`lib/dashboard-data.ts`**, marked `// ADJUST`:

1. **`STATUS_TO_PHASE`** — the keys must match the *exact* status strings stored in your DB
   (e.g. is it `"PO on Process"` or `"PO_ON_PROCESS"` or a numeric code?). Map each to a PhaseKey.
2. **`TABLE`** — your real table, ideally 3-part: `Database.schema.Table`
   (e.g. `SysPurchaseDB.dbo.CapexProjects`).
3. **`COL`** — column names for status, budget, actual, committed, and the date used for
   `YEAR()` grouping.
4. **`SQL_MB_DIVISOR`** (env) — `1000000` if amounts are raw Baht, `1` if already in millions.

That's it. The aggregation logic, totals, the 68% progress metric, and both charts derive
automatically.

## How the numbers map to your slide

| Slide element | Source |
|---|---|
| Card count / Budget / Actual | `queryPhaseSummary()` grouped by status |
| Total Project / Total Budget | summed across phases |
| 68% | (Budget Closed + Installation Completed + PO Created) / total |
| Budget vs Actual by Year | `queryByYearBudget()` — `SUM(committed+actual)` = "Commit+Actual" |
| Project Status by Year | `queryByYearStatus()` — counts per status per year, stacked |

## Notes & gaps

- **Period filter.** Your cards say "Jan–Apr'26" while the charts span 2022–2026. Right now
  every query is all-time. To scope the cards to a period, add a `WHERE [date] BETWEEN @from
  AND @to` (parameterized) to `queryPhaseSummary` only. Stubbed comment left in place.
- **Caching.** `export const dynamic = "force-dynamic"` makes it always-fresh. For a wall
  display, switch to `export const revalidate = 300` (5 min) to cut DB load.
- **Security.** Use a SQL login with `SELECT`-only on the relevant tables. Identifiers in
  `TABLE`/`COL` are interpolated (can't be parameterized) — keep them as trusted config,
  never user input. All *values* are parameterized.
- **Colors** are lifted from your Tableau: Budget Closed blue, Installation Completed teal,
  PO Created amber, PO On Process red, PR On Process purple.
