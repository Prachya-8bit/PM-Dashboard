// app/dashboard/asset-received.tsx
"use client";
import { useMemo, useState } from "react";
import { PHASES, PHASE_COLOR, type PhaseKey, type ProjectRow } from "@/lib/dashboard-types";

// Projects qualify when actual spend (Budget Usage) has passed 80% of budget.
const USAGE_THRESHOLD = 0.8;

export function AssetReceivedStatus({ projects }: { projects: ProjectRow[] }) {
  const [year, setYear] = useState<number | "ALL">("ALL");
  const [search, setSearch] = useState("");

  // Only projects whose actual value is greater than 80% of the budget value,
  // excluding projects already in the "Budget Closed" phase.
  const qualified = useMemo(
    () =>
      projects.filter(
        (p) =>
          p.phase !== "BUDGET_CLOSED" &&
          p.budgetMB > 0 &&
          p.actualMB > USAGE_THRESHOLD * p.budgetMB
      ),
    [projects]
  );

  const years = useMemo(
    () => [...new Set(qualified.map((p) => p.year))].sort((a, b) => b - a),
    [qualified]
  );

  const filtered = useMemo(
    () =>
      qualified.filter(
        (p) =>
          (year === "ALL" || p.year === year) &&
          (p.name.toLowerCase().includes(search.toLowerCase()) ||
            p.pm.toLowerCase().includes(search.toLowerCase()) ||
            p.ioNo.toLowerCase().includes(search.toLowerCase()))
      ),
    [qualified, year, search]
  );

  const labelOf = (key: PhaseKey) => PHASES.find((p) => p.key === key)!.label;
  const fmt = (n: number) => n.toFixed(2);

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
          <div className="eyebrow">Detail · Budget usage &gt; 80%</div>
          <h3 className="panel__title">Asset Received Status</h3>
        </div>
        <span className="mono" style={{ fontSize: 14.5, color: "var(--ink-3)" }}>
          {filtered.length} / {qualified.length}
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
              <th className="num">Budget Usage</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => {
              // Non-asset-received = usage spent but not yet received as asset.
              const nonAsset = Math.max(p.actualMB - p.assetReceivedMB, 0);
              return (
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
                  <td className="num mono">{fmt(p.budgetMB)}</td>
                  <td className="num mono">{fmt(p.actualMB)}</td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <span className="tag">
                        Asset Received <b className="mono">{fmt(p.assetReceivedMB)}</b>
                      </span>
                      <span className="tag tag--nonasset">
                        Non-Received <b className="mono">{fmt(nonAsset)}</b>
                      </span>
                      {p.committedMB > 0 && (
                        <span className="tag tag--commit">
                          Commit <b className="mono">{fmt(p.committedMB)}</b>
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="empty">
            <span className="empty__ring" />
            <div style={{ fontWeight: 500, color: "var(--ink-2)" }}>
              No projects over 80% budget usage
            </div>
            <div style={{ fontSize: 14.5, maxWidth: 280 }}>
              Adjust the year or search filters, or wait until spend crosses the
              80% threshold.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
