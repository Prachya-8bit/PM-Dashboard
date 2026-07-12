// app/dashboard/page.tsx
// Server Component. Runs the DB queries, renders static markup,
// and hands serializable data to the client charts.
import { getDashboardData } from "@/lib/dashboard-data";
import { DashboardCharts } from "./charts";
import { ProjectList } from "./project-list";

export const dynamic = "force-dynamic"; // always fresh; swap for revalidate if you want caching

const fmtM = (n: number) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}M`;
const fmtInt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0A0E1A",
        color: "#fff",
        fontFamily:
          '-apple-system, "SF Pro Text", system-ui, "Inter", sans-serif',
        padding: "28px 32px",
      }}
    >
      {/* Header */}
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
          Budget Status Overview
        </h1>
        <p style={{ color: "rgba(235,235,245,0.6)", fontSize: 14, marginTop: 6 }}>
          Total Project: <strong style={{ color: "#fff" }}>{fmtInt(data.totalProjects)}</strong>
          {"   |   "}
          Total Budget: <strong style={{ color: "#fff" }}>{fmtInt(data.totalBudgetMB)} MB</strong>
          {"   |   "}
          Progressed (PO Created+):{" "}
          <strong style={{ color: "#1FBF8F" }}>{data.progressPct.toFixed(0)}%</strong>
        </p>
      </header>

      {/* Phase cards */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 24,
        }}
      >
        {data.phases.map((p) => (
          <div
            key={p.key}
            style={{
              background: "#141E36",
              border: `2px solid ${p.color}`,
              borderRadius: 14,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontSize: 34, fontWeight: 800, color: p.color, lineHeight: 1 }}>
              {p.count}
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>{p.label}</div>
            <div style={{ fontSize: 12.5, color: "rgba(235,235,245,0.7)", marginTop: 12 }}>
              Budget: {fmtM(p.budgetMB)}
            </div>
            <div style={{ fontSize: 12.5, color: "rgba(235,235,245,0.7)" }}>
              Actual: {fmtM(p.actualMB)}
            </div>
          </div>
        ))}
      </section>

      {/* Charts (client) */}
      <DashboardCharts
        byYearBudget={data.byYearBudget}
        byYearStatus={data.byYearStatus}
      />

      {/* Filterable project list (client) */}
      <ProjectList projects={data.projects} />
    </main>
  );
}
