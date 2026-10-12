// app/dashboard/filter-shell.tsx
// Client shell that owns the shared phase filter. The top metric strip and the
// Project List chips both read/write this single piece of state, so clicking a
// metric card filters the list and keeps the chips in sync (and vice versa).
"use client";
import { useState } from "react";
import { PHASE_COLOR, type PhaseKey, type PhaseSummary, type ProjectRow } from "@/lib/dashboard-types";
import { ProjectList } from "./project-list";

const fmtM = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export function DashboardFilterShell({
  phases,
  totalProjects,
  projects,
  assetMatchesUsage,
  children,
}: {
  phases: PhaseSummary[];
  totalProjects: number;
  projects: ProjectRow[];
  assetMatchesUsage: number;
  children?: React.ReactNode;
}) {
  // The one filter shared by the strip (above) and the Project List chips (below).
  const [phase, setPhase] = useState<PhaseKey | "ALL">("ALL");

  // Clicking a metric card toggles its phase: select it, or clear back to ALL
  // if it is already the active filter.
  const toggle = (key: PhaseKey) => setPhase((cur) => (cur === key ? "ALL" : key));

  return (
    <>
      {/* Phase pipeline — now a clickable common filter, synced with the list chips */}
      <section style={{ marginBottom: 28 }}>
        <div className="strip" role="group" aria-label="Filter projects by phase">
          {phases.map((p, i) => {
            const pct = totalProjects ? (p.count / totalProjects) * 100 : 0;
            const active = phase === p.key;
            return (
              <button
                type="button"
                className="metric reveal"
                key={p.key}
                data-active={active}
                aria-pressed={active}
                onClick={() => toggle(p.key)}
                style={{ ["--i" as string]: i }}
              >
                {p.key === "INSTALL_COMPLETED" && assetMatchesUsage > 0 && (
                  <span
                    className="metric__bell"
                    title={`${assetMatchesUsage} project${assetMatchesUsage === 1 ? "" : "s"} where Asset Received = Budget Usage`}
                    aria-label={`${assetMatchesUsage} projects where Asset Received equals Budget Usage`}
                  >
                    <svg
                      width={15}
                      height={15}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                    </svg>
                    <span className="metric__bell-count mono">{assetMatchesUsage}</span>
                  </span>
                )}
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <span className="metric__count mono">{fmtInt(p.count)}</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#000000",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    ({pct.toFixed(1)}%)
                  </span>
                </div>
                <span
                  className="metric__label status-pill"
                  style={{ background: PHASE_COLOR[p.key], alignSelf: "flex-start" }}
                >
                  {p.label}
                </span>
                <span className="metric__sub">
                  <span>Budget</span>
                  <span className="mono" style={{ color: "var(--ink-2)" }}>
                    {fmtM(p.budgetMB)}
                  </span>
                </span>
                {p.key !== "PO_ON_PROCESS" && p.key !== "PR_ON_PROCESS" && (
                  <span className="metric__sub" style={{ marginTop: 2 }}>
                    <span>Actual</span>
                    <span className="mono" style={{ color: "var(--ink-2)" }}>
                      {fmtM(p.actualMB)}
                    </span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Anything rendered between the strip and the list (e.g. charts) */}
      {children}

      {/* Project list reads the same shared phase filter */}
      <ProjectList projects={projects} phase={phase} onPhaseChange={setPhase} />
    </>
  );
}
