// app/dashboard/page.tsx
// Server Component. Runs the DB queries, renders static markup,
// and hands serializable data to the client charts.
import { getDashboardData } from "@/lib/dashboard-data";
import { DashboardCharts } from "./charts";
import { ProjectList } from "./project-list";
import { PHASE_COLOR } from "@/lib/dashboard-types";

export const dynamic = "force-dynamic"; // always fresh; swap for revalidate if you want caching

const fmtM = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtInt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <main className="shell">
      {/* Header — asymmetric: identity left, hero metric right */}
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto auto",
          alignItems: "end",
          gap: 24,
          paddingBottom: 28,
          borderBottom: "1px solid var(--line)",
          marginBottom: 28,
        }}
        className="reveal"
      >
        <div>
          <div className="eyebrow">CAPEX · Portfolio</div>
          <h1
            style={{
              fontSize: 36,
              fontWeight: 640,
              letterSpacing: "-0.035em",
              margin: "10px 0 0",
              lineHeight: 1.05,
            }}
          >
            Budget Status Overview
          </h1>
          <p style={{ color: "var(--ink-2)", fontSize: 15.5, margin: "10px 0 0" }}>
            <span className="mono" style={{ color: "var(--ink)", fontWeight: 500 }}>
              {fmtInt(data.totalProjects)}
            </span>{" "}
            projects tracked ·{" "}
            <span className="mono" style={{ color: "var(--ink)", fontWeight: 500 }}>
              {fmtInt(data.totalBudgetMB)}
            </span>{" "}
            MB committed budget
          </p>
        </div>

        <div
          style={{
            textAlign: "right",
            borderLeft: "1px solid var(--line)",
            paddingLeft: 24,
          }}
        >
          <div className="eyebrow">Progressed (PO+)</div>
          <div
            className="mono"
            style={{
              fontSize: 52,
              fontWeight: 600,
              letterSpacing: "-0.04em",
              lineHeight: 1,
              color: "var(--accent)",
              marginTop: 8,
            }}
          >
            {data.progressPct.toFixed(1)}%
          </div>
        </div>

        {/* Bot agent — links to the assistant */}
        <a
          href="http://10.0.129.62:8089/"
          target="_blank"
          rel="noopener noreferrer"
          className="bot-agent"
          aria-label="Open bot agent"
          title="Bot agent"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="4" y="8" width="16" height="11" rx="3" />
            <path d="M12 8V4" />
            <circle cx="12" cy="3" r="1.4" fill="currentColor" stroke="none" />
            <path d="M4 12H2.5M20 12h1.5" />
            <circle cx="9" cy="13" r="1.15" fill="currentColor" stroke="none" />
            <circle cx="15" cy="13" r="1.15" fill="currentColor" stroke="none" />
            <path d="M9.5 16h5" />
          </svg>
          <span>Bot agent</span>
        </a>
      </header>

      {/* Phase pipeline — one divided strip, no per-card boxes */}
      <section style={{ marginBottom: 28 }}>
        <div className="strip">
          {data.phases.map((p, i) => {
            const pct = data.totalProjects
              ? (p.count / data.totalProjects) * 100
              : 0;
            return (
            <div
              className="metric reveal"
              key={p.key}
              style={{ ["--i" as string]: i }}
            >
              <span
                className="metric__dot"
                style={{ background: PHASE_COLOR[p.key] }}
              />
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
                    color: PHASE_COLOR[p.key],
                    letterSpacing: "-0.02em",
                  }}
                >
                  ({pct.toFixed(1)}%)
                </span>
              </div>
              <span className="metric__label">{p.label}</span>
              <span className="metric__sub">
                <span>Budget</span>
                <span className="mono" style={{ color: "var(--ink-2)" }}>
                  {fmtM(p.budgetMB)}
                </span>
              </span>
              <span className="metric__sub" style={{ marginTop: 2 }}>
                <span>Actual</span>
                <span className="mono" style={{ color: "var(--ink-2)" }}>
                  {fmtM(p.actualMB)}
                </span>
              </span>
            </div>
            );
          })}
        </div>
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
