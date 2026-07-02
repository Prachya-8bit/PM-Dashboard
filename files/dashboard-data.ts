// lib/dashboard-data.ts
// Server-side data layer. Reads pre-aggregated SQLite — no SQL aggregation needed.
// Data is populated by etl/etl.py cron job, not by this module.
import "server-only";
import { getDb } from "./db";

/* ------------------------------------------------------------------ *
 * 1. PHASES — display order matches your Tableau (completed first).
 *    Colors are taken from the slide.
 * ------------------------------------------------------------------ */
export const PHASES = [
  { key: "BUDGET_CLOSED",     label: "Budget Closed",          color: "#2D7FF9" },
  { key: "INSTALL_COMPLETED", label: "Installation Completed", color: "#1FBF8F" },
  { key: "PO_CREATED",        label: "PO Created",             color: "#F5A623" },
  { key: "PO_ON_PROCESS",     label: "PO On Process",          color: "#FF5A52" },
  { key: "PR_ON_PROCESS",     label: "PR On Process",          color: "#9B6BE0" },
] as const;

export type PhaseKey = (typeof PHASES)[number]["key"];

/* ------------------------------------------------------------------ *
 * 2. TYPES — same shape, same API for the page
 * ------------------------------------------------------------------ */
export interface PhaseSummary {
  key: PhaseKey;
  label: string;
  color: string;
  count: number;
  budgetMB: number;
  actualMB: number;
}

export interface YearBudget {
  year: number;
  budgetMB: number;
  commitActualMB: number;
}

export interface YearStatus {
  year: number;
  BUDGET_CLOSED: number;
  INSTALL_COMPLETED: number;
  PO_CREATED: number;
  PO_ON_PROCESS: number;
  PR_ON_PROCESS: number;
}

export interface DashboardData {
  totalProjects: number;
  totalBudgetMB: number;
  progressPct: number; // (Closed + Installed + PO Created) / total * 100  -> your 68%
  phases: PhaseSummary[];
  byYearBudget: YearBudget[];
  byYearStatus: YearStatus[];
}

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
    SELECT year, budget_mb, commit_actual_mb
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

/* ------------------------------------------------------------------ *
 * 4. PUBLIC: one call the page uses
 * ------------------------------------------------------------------ */
export async function getDashboardData(): Promise<DashboardData> {
  const phases        = readPhaseSummary();
  const byYearBudget  = readYearlyBudget();
  const byYearStatus  = readYearlyStatus();

  const totalProjects = phases.reduce((s, p) => s + p.count, 0);
  const totalBudgetMB = phases.reduce((s, p) => s + p.budgetMB, 0);
  const progressed =
    (phases.find((p) => p.key === "BUDGET_CLOSED")?.count ?? 0) +
    (phases.find((p) => p.key === "INSTALL_COMPLETED")?.count ?? 0) +
    (phases.find((p) => p.key === "PO_CREATED")?.count ?? 0);
  const progressPct = totalProjects ? (progressed / totalProjects) * 100 : 0;

  return { totalProjects, totalBudgetMB, progressPct, phases, byYearBudget, byYearStatus };
}
