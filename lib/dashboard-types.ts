// Shared constants and types — no server-only guard, safe to import in client components.

// Palette (Tableau-10 style):
// Blue #4E79A7 · Orange #F28E2B · Red #E15759 · Teal #76B7B2 · Green #59A14F
// Yellow #EDC948 · Purple #B07AA1 · Pink #FF9DA7 · Brown #9C755F · Black #000000
export const PHASES = [
  { key: "BUDGET_CLOSED",     label: "Budget Closed",          color: "#4E79A7" },
  { key: "INSTALL_COMPLETED", label: "Installation Completed", color: "#76B7B2" },
  { key: "PO_CREATED",        label: "PO Created",             color: "#B07AA1" },
  { key: "PO_ON_PROCESS",     label: "PO On Process",          color: "#E15759" },
  { key: "PR_ON_PROCESS",     label: "PR On Process",          color: "#F28E2B" },
] as const;

export type PhaseKey = (typeof PHASES)[number]["key"];

// Single source of truth for phase indicator colors (dots / thin bars only).
export const PHASE_COLOR: Record<PhaseKey, string> = {
  BUDGET_CLOSED:     "#4E79A7", // Blue
  INSTALL_COMPLETED: "#76B7B2", // Teal
  PO_CREATED:        "#B07AA1", // Purple
  PO_ON_PROCESS:     "#E15759", // Red
  PR_ON_PROCESS:     "#F28E2B", // Orange
};

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

export interface ProjectRow {
  name: string;
  ioNo: string;
  pm: string;
  phase: PhaseKey;
  year: number;
  budgetMB: number;
  actualMB: number;
  committedMB: number;
  assetReceivedMB: number;
}

export interface DashboardData {
  totalProjects: number;
  totalBudgetMB: number;
  progressPct: number;
  phases: PhaseSummary[];
  byYearBudget: YearBudget[];
  byYearStatus: YearStatus[];
  projects: ProjectRow[];
}
