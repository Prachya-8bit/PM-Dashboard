// app/dashboard/project-list.tsx
"use client";
import { useMemo, useState } from "react";
import { PHASES, PHASE_COLOR, type PhaseKey, type ProjectRow } from "@/lib/dashboard-types";

export function ProjectList({ projects }: { projects: ProjectRow[] }) {
  const [phase, setPhase] = useState<PhaseKey | "ALL">("ALL");
  const [year, setYear] = useState<number | "ALL">("ALL");
  const [search, setSearch] = useState("");

  const years = useMemo(
    () => [...new Set(projects.map((p) => p.year))].sort((a, b) => b - a),
    [projects]
  );

  const filtered = useMemo(
    () =>
      projects.filter(
        (p) =>
          (phase === "ALL" || p.phase === phase) &&
          (year === "ALL" || p.year === year) &&
          (p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.pm.toLowerCase().includes(search.toLowerCase()) ||
            p.ioNo.toLowerCase().includes(search.toLowerCase()))
      ),
    [projects, phase, year, search]
  );

  const labelOf = (key: PhaseKey) => PHASES.find((p) => p.key === key)!.label;

  return (
    <section className="panel" style={{ marginTop: 20, overflow: "hidden" }}>
      <div
        className="panel__head"
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          paddingBottom: 16,
        }}
      >
        <div>
          <div className="eyebrow">Detail</div>
          <h3 className="panel__title">Project List</h3>
        </div>
        <span className="mono" style={{ fontSize: 14.5, color: "var(--ink-3)" }}>
          {filtered.length} / {projects.length}
        </span>
      </div>

      {/* Filter bar */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          padding: "0 22px 16px",
        }}
      >
        <button
          className="chip"
          data-active={phase === "ALL"}
          onClick={() => setPhase("ALL")}
        >
          All
        </button>
        {PHASES.map((p) => (
          <button
            key={p.key}
            className="chip"
            data-active={phase === p.key}
            onClick={() => setPhase(p.key)}
          >
            <span className="status-pill" style={{ background: PHASE_COLOR[p.key] }}>
              {p.label}
            </span>
          </button>
        ))}

        <div style={{ flex: 1, minWidth: 8 }} />

        <select
          className="field"
          value={year}
          onChange={(e) => setYear(e.target.value === "ALL" ? "ALL" : +e.target.value)}
          style={{ cursor: "pointer" }}
        >
          <option value="ALL">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <input
          className="field"
          placeholder="Search project or manager"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ minWidth: 200 }}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Project</th>
              <th>IO.no.</th>
              <th>Manager</th>
              <th>Status</th>
              <th>Year</th>
              <th className="num">Budget</th>
              <th className="num">Actual</th>
              <th className="num">Committed</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={`${p.name}-${i}`}>
                <td style={{ fontWeight: 500 }}>{p.name}</td>
                <td className="mono" style={{ color: "var(--ink-2)" }}>{p.ioNo}</td>
                <td style={{ color: "var(--ink-2)" }}>{p.pm}</td>
                <td>
                  <span
                    className="status-pill"
                    style={{ background: PHASE_COLOR[p.phase] }}
                  >
                    {labelOf(p.phase)}
                  </span>
                </td>
                <td className="mono" style={{ color: "var(--ink-2)" }}>{p.year}</td>
                <td className="num mono">{p.budgetMB.toFixed(2)}</td>
                <td className="num mono">{p.actualMB.toFixed(2)}</td>
                <td className="num mono">{p.committedMB.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="empty">
            <span className="empty__ring" />
            <div style={{ fontWeight: 500, color: "var(--ink-2)" }}>
              No matching projects
            </div>
            <div style={{ fontSize: 14.5, maxWidth: 280 }}>
              Adjust the phase, year, or search filters to widen the results.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
