// app/dashboard/project-list.tsx
"use client";
import { useMemo, useState } from "react";
import { PHASES, type PhaseKey, type ProjectRow } from "@/lib/dashboard-types";

const chip: React.CSSProperties = {
  background: "transparent",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.2)",
  borderRadius: 8,
  padding: "6px 12px",
  fontSize: 12.5,
  cursor: "pointer",
};
const cell: React.CSSProperties = { padding: "8px 10px" };

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
            p.pm.toLowerCase().includes(search.toLowerCase()))
      ),
    [projects, phase, year, search]
  );

  const phaseOf = (key: PhaseKey) => PHASES.find((p) => p.key === key)!;

  return (
    <section
      style={{
        background: "#111B33",
        border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16,
        padding: "16px 18px",
        marginTop: 16,
      }}
    >
      <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>
        Project List ({filtered.length})
      </h3>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={() => setPhase("ALL")}
          style={{
            ...chip,
            borderColor: phase === "ALL" ? "#fff" : "rgba(255,255,255,0.2)",
            fontWeight: phase === "ALL" ? 700 : 400,
          }}
        >
          All
        </button>
        {PHASES.map((p) => (
          <button
            key={p.key}
            onClick={() => setPhase(p.key)}
            style={{
              ...chip,
              color: p.color,
              borderColor: phase === p.key ? p.color : "rgba(255,255,255,0.2)",
              fontWeight: phase === p.key ? 700 : 400,
            }}
          >
            {p.label}
          </button>
        ))}
        <select
          value={year}
          onChange={(e) => setYear(e.target.value === "ALL" ? "ALL" : +e.target.value)}
          style={{ ...chip, background: "#0A0E1A" }}
        >
          <option value="ALL">All Years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <input
          placeholder="Search project / PM…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...chip, background: "#0A0E1A", minWidth: 180, cursor: "text" }}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "rgba(235,235,245,0.6)", textAlign: "left" }}>
              <th style={cell}>Project</th>
              <th style={cell}>Project Manager</th>
              <th style={cell}>Status</th>
              <th style={cell}>Year</th>
              <th style={{ ...cell, textAlign: "right" }}>Budget (MB)</th>
              <th style={{ ...cell, textAlign: "right" }}>Actual (MB)</th>
              <th style={{ ...cell, textAlign: "right" }}>Committed (MB)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <td style={cell}>{p.name}</td>
                <td style={cell}>{p.pm}</td>
                <td style={{ ...cell, color: phaseOf(p.phase).color }}>
                  {phaseOf(p.phase).label}
                </td>
                <td style={cell}>{p.year}</td>
                <td style={{ ...cell, textAlign: "right" }}>{p.budgetMB.toFixed(2)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{p.actualMB.toFixed(2)}</td>
                <td style={{ ...cell, textAlign: "right" }}>{p.committedMB.toFixed(2)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...cell, color: "rgba(235,235,245,0.5)" }}>
                  No projects match the current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
