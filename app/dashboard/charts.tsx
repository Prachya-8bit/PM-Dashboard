// app/dashboard/charts.tsx
"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LabelList,
} from "recharts";
import { PHASES, type YearBudget, type YearStatus } from "@/lib/dashboard-types";

const PANEL: React.CSSProperties = {
  background: "#111B33",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 16,
  padding: "16px 18px 8px",
};
const TITLE: React.CSSProperties = {
  textAlign: "center",
  fontSize: 16,
  fontWeight: 700,
  margin: "0 0 8px",
};
const axis = { stroke: "rgba(235,235,245,0.5)", fontSize: 12 };

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
        gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
        gap: 16,
      }}
    >
      {/* Budget vs Actual by Year */}
      <div style={PANEL}>
        <h3 style={TITLE}>Budget vs Actual by Year (MB)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={byYearBudget} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
            <XAxis dataKey="year" tick={axis} />
            <YAxis tick={axis} />
            <Tooltip contentStyle={{ background: "#0A0E1A", border: "none", borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="budgetMB" name="Budget (MB)" fill="#3E92E6" radius={[3, 3, 0, 0]}>
              <LabelList dataKey="budgetMB" position="top" fill="#fff" fontSize={11}
                formatter={(v: number) => v.toFixed(0)} />
            </Bar>
            <Bar dataKey="commitActualMB" name="Commit+Actual (MB)" fill="#F5A623" radius={[3, 3, 0, 0]}>
              <LabelList dataKey="commitActualMB" position="top" fill="#fff" fontSize={11}
                formatter={(v: number) => v.toFixed(0)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Project Status by Year (stacked) */}
      <div style={PANEL}>
        <h3 style={TITLE}>Project Status by Year (items)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={byYearStatus} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
            <XAxis dataKey="year" tick={axis} />
            <YAxis tick={axis} />
            <Tooltip contentStyle={{ background: "#0A0E1A", border: "none", borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {PHASES.map((p) => (
              <Bar key={p.key} dataKey={p.key} name={p.label} stackId="s" fill={p.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
