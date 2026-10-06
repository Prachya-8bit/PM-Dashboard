// app/dashboard/charts.tsx
"use client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from "recharts";
import { PHASES, PHASE_COLOR, type YearBudget, type YearStatus } from "@/lib/dashboard-types";

// Tableau-10 style palette
const INK_2 = "#4a4a4a";
const INK_3 = "#7a7a7a";
const LINE = "#eadfdf";
const ORANGE = "#F28E2B";
const BLUE = "#4E79A7";
const ACCENT = BLUE;    // Commit + Actual
const NEUTRAL = ORANGE; // Budget

const axisTick = {
  fill: INK_3,
  fontSize: 13,
  fontFamily: "var(--font-mono), monospace",
};

const tooltipStyle: React.CSSProperties = {
  background: "#ffffff",
  border: `1px solid ${LINE}`,
  borderRadius: 10,
  boxShadow: "0 8px 24px -12px rgba(28,25,23,0.18)",
  fontSize: 14,
  padding: "8px 12px",
};

const legendStyle: React.CSSProperties = {
  fontSize: 13.5,
  color: INK_2,
  paddingTop: 4,
};

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel">
      <div className="panel__head">
        <div className="eyebrow">{hint}</div>
        <h3 className="panel__title">{title}</h3>
      </div>
      <div style={{ padding: "12px 12px 8px" }}>{children}</div>
    </div>
  );
}

function StatusByYearTable({ byYearStatus }: { byYearStatus: YearStatus[] }) {
  const years = byYearStatus.map((r) => r.year);
  const cell: React.CSSProperties = {
    padding: "6px 8px",
    fontFamily: "var(--font-mono), monospace",
    fontSize: 12.5,
    textAlign: "right",
    color: INK_2,
    borderBottom: `1px solid ${LINE}`,
  };
  const headCell: React.CSSProperties = {
    ...cell,
    color: INK_3,
    fontWeight: 600,
  };
  const labelCell: React.CSSProperties = {
    padding: "6px 8px",
    fontSize: 12.5,
    textAlign: "left",
    color: INK_2,
    borderBottom: `1px solid ${LINE}`,
    whiteSpace: "nowrap",
  };

  return (
    <div style={{ padding: "4px 12px 12px", overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ ...headCell, textAlign: "left" }}>Status</th>
            {years.map((y) => (
              <th key={y} style={headCell}>{y}</th>
            ))}
            <th style={headCell}>Total</th>
          </tr>
        </thead>
        <tbody>
          {[...PHASES].reverse().map((p) => {
            const rowTotal = byYearStatus.reduce((sum, r) => sum + (r[p.key] ?? 0), 0);
            return (
              <tr key={p.key}>
                <td style={labelCell}>
                  <span
                    style={{
                      display: "inline-block",
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: PHASE_COLOR[p.key],
                      marginRight: 7,
                      verticalAlign: "middle",
                    }}
                  />
                  {p.label}
                </td>
                {byYearStatus.map((r) => (
                  <td key={r.year} style={cell}>{r[p.key] ?? 0}</td>
                ))}
                <td style={{ ...cell, fontWeight: 600, color: INK_2 }}>{rowTotal}</td>
              </tr>
            );
          })}
          <tr>
            <td style={{ ...labelCell, fontWeight: 600 }}>Total</td>
            {byYearStatus.map((r) => {
              const colTotal = PHASES.reduce((sum, p) => sum + (r[p.key] ?? 0), 0);
              return (
                <td key={r.year} style={{ ...cell, fontWeight: 600 }}>{colTotal}</td>
              );
            })}
            <td style={{ ...cell, fontWeight: 700 }}>
              {byYearStatus.reduce(
                (sum, r) => sum + PHASES.reduce((s, p) => s + (r[p.key] ?? 0), 0),
                0
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function DashboardCharts({
  byYearBudget,
  byYearStatus,
}: {
  byYearBudget: YearBudget[];
  byYearStatus: YearStatus[];
}) {
  return (
    <section
      style={{
        display: "grid",
        gridTemplateColumns: "1.15fr 0.85fr",
        gap: 20,
      }}
      className="charts-grid"
    >
      <style>{`
        @media (max-width: 900px) {
          .charts-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <Panel hint="Per fiscal year · MB" title="Budget vs Commit + Actual">
        <ResponsiveContainer width="100%" height={468}>
          <BarChart data={byYearBudget} margin={{ top: 12, right: 8, left: -8, bottom: 0 }} barGap={6}>
            <XAxis dataKey="year" tick={axisTick} axisLine={{ stroke: LINE }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(28,25,23,0.03)" }} />
            <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
            <Bar dataKey="budgetMB" name="Budget" fill={NEUTRAL} radius={[4, 4, 0, 0]} maxBarSize={40}>
              <LabelList
                dataKey="budgetMB"
                position="top"
                offset={6}
                fontSize={12}
                fill="#000000"
                formatter={(v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 })}
              />
            </Bar>
            <Bar dataKey="commitActualMB" name="Commit + Actual" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={40}>
              <LabelList
                dataKey="commitActualMB"
                position="top"
                offset={6}
                fontSize={12}
                fill="#000000"
                formatter={(v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 })}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel hint="Per fiscal year · count" title="Status by Year(items)">
        <ResponsiveContainer width="100%" height={288}>
          <BarChart data={byYearStatus} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
            <XAxis dataKey="year" tick={axisTick} axisLine={{ stroke: LINE }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "rgba(28,25,23,0.03)" }}
              itemSorter={(item) => -PHASES.findIndex((p) => p.key === item.dataKey)}
            />
            {PHASES.map((p, i) => (
              <Bar
                key={p.key}
                dataKey={p.key}
                name={p.label}
                stackId="s"
                fill={PHASE_COLOR[p.key]}
                radius={i === PHASES.length - 1 ? [4, 4, 0, 0] : undefined}
                maxBarSize={44}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <StatusByYearTable byYearStatus={byYearStatus} />
      </Panel>
    </section>
  );
}
