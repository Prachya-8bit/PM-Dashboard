// lib/dashboard-data.ts
// Server-side data layer. Reads pre-aggregated SQLite — no SQL aggregation needed.
// Data is populated by etl/etl.py cron job, not by this module.
import "server-only";
import { getDb } from "./db";
import {
  PHASES,
  type PhaseKey,
  type PhaseSummary,
  type YearBudget,
  type YearStatus,
  type ProjectRow,
  type DashboardData,
} from "./dashboard-types";

export { PHASES, type PhaseKey, type PhaseSummary, type YearBudget, type YearStatus, type ProjectRow, type DashboardData };

/* ------------------------------------------------------------------ *
 * 3. READS from SQLite (simple SELECTs — all data is pre-computed)
 * ------------------------------------------------------------------ */

function readPhaseSummary(): PhaseSummary[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT phase_key, label, color, count, budget_mb, actual_mb
    FROM phase_summary
    ORDER BY rowid
  `).all() as any[];

  // Ensure all PHASES are present (ETL may not have rows for empty phases)
  const byKey = new Map(rows.map((r) => [r.phase_key, r]));
  return PHASES.map((p) => {
    const r = byKey.get(p.key);
    return r
      ? { key: p.key, label: p.label, color: p.color, count: r.count, budgetMB: r.budget_mb, actualMB: r.actual_mb }
      : { key: p.key, label: p.label, color: p.color, count: 0, budgetMB: 0, actualMB: 0 };
  });
}

function readYearlyBudget(): YearBudget[] {
  const db = getDb();
  return db.prepare(`
    SELECT year,
           budget_mb        AS budgetMB,
           commit_actual_mb AS commitActualMB
    FROM yearly_budget
    ORDER BY year
  `).all() as YearBudget[];
}

function readYearlyStatus(): YearStatus[] {
  const db = getDb();
  return db.prepare(`
    SELECT year,
           budget_closed    AS BUDGET_CLOSED,
           install_completed AS INSTALL_COMPLETED,
           po_created       AS PO_CREATED,
           po_on_process    AS PO_ON_PROCESS,
           pr_on_process    AS PR_ON_PROCESS
    FROM yearly_status
    ORDER BY year
  `).all() as YearStatus[];
}

function readProjects(): ProjectRow[] {
  const db = getDb();
  return db.prepare(`
    SELECT name,
           project_manager AS pm,
           phase_key    AS phase,
           year,
           budget_mb    AS budgetMB,
           actual_mb    AS actualMB,
           committed_mb AS committedMB
    FROM projects
    ORDER BY year DESC, name
  `).all() as ProjectRow[];
}

/* ------------------------------------------------------------------ *
 * 4. PUBLIC: one call the page uses
 * ------------------------------------------------------------------ */
export async function getDashboardData(): Promise<DashboardData> {
  const phases        = readPhaseSummary();
  const byYearBudget  = readYearlyBudget();
  const byYearStatus  = readYearlyStatus();
  const projects      = readProjects();

  const totalProjects = phases.reduce((s, p) => s + p.count, 0);
  const totalBudgetMB = phases.reduce((s, p) => s + p.budgetMB, 0);
  const progressed =
    (phases.find((p) => p.key === "BUDGET_CLOSED")?.count ?? 0) +
    (phases.find((p) => p.key === "INSTALL_COMPLETED")?.count ?? 0) +
    (phases.find((p) => p.key === "PO_CREATED")?.count ?? 0);
  const progressPct = totalProjects ? (progressed / totalProjects) * 100 : 0;

  return { totalProjects, totalBudgetMB, progressPct, phases, byYearBudget, byYearStatus, projects };
}
