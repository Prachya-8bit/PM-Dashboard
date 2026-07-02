// Shared constants and types — no server-only guard, safe to import in client components.

export const PHASES = [
  { key: "BUDGET_CLOSED",     label: "Budget Closed",          color: "#2D7FF9" },
  { key: "INSTALL_COMPLETED", label: "Installation Completed", color: "#1FBF8F" },
  { key: "PO_CREATED",        label: "PO Created",             color: "#F5A623" },
  { key: "PO_ON_PROCESS",     label: "PO On Process",          color: "#FF5A52" },
  { key: "PR_ON_PROCESS",     label: "PR On Process",          color: "#9B6BE0" },
] as const;

export type PhaseKey = (typeof PHASES)[number]["key"];

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
  progressPct: number;
  phases: PhaseSummary[];
  byYearBudget: YearBudget[];
  byYearStatus: YearStatus[];
}
