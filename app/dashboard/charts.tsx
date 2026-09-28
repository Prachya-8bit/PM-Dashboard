// app/dashboard/charts.tsx
"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { PHASES, PHASE_COLOR, type YearBudget, type YearStatus } from "@/lib/dashboard-types";

const INK_2 = "#6F4E37"; // coffee
const INK_3 = "#6F4E37"; // coffee
const LINE = "#e7e5e4";
const ACCENT = "#0f766e";
const NEUTRAL = "#6F4E37"; // coffee

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
        <ResponsiveContainer width="100%" height={288}>
          <BarChart data={byYearBudget} margin={{ top: 12, right: 8, left: -8, bottom: 0 }} barGap={6}>
            <CartesianGrid vertical={false} stroke={LINE} />
            <XAxis dataKey="year" tick={axisTick} axisLine={{ stroke: LINE }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(28,25,23,0.03)" }} />
            <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
            <Bar dataKey="budgetMB" name="Budget" fill={NEUTRAL} radius={[4, 4, 0, 0]} maxBarSize={40} />
            <Bar dataKey="commitActualMB" name="Commit + Actual" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      <Panel hint="Per fiscal year · count" title="Status Distribution">
        <ResponsiveContainer width="100%" height={288}>
          <BarChart data={byYearStatus} margin={{ top: 12, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={LINE} />
            <XAxis dataKey="year" tick={axisTick} axisLine={{ stroke: LINE }} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "rgba(28,25,23,0.03)" }} />
            <Legend wrapperStyle={legendStyle} iconType="circle" iconSize={8} />
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
      </Panel>
    </section>
  );
}
