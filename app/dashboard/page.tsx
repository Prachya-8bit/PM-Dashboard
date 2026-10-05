// app/dashboard/page.tsx
// Server Component. Runs the DB queries, renders static markup,
// and hands serializable data to the client charts.
import { getDashboardData } from "@/lib/dashboard-data";
import { DashboardCharts } from "./charts";
import { ProjectList } from "./project-list";
import { AssetReceivedStatus } from "./asset-received";
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
          <p
            style={{
              color: "#000000",
              fontSize: 36,
              fontWeight: 640,
              letterSpacing: "-0.035em",
              lineHeight: 1.05,
              margin: "10px 0 0",
            }}
          >
            <span className="mono" style={{ fontWeight: 500 }}>
              {fmtInt(data.totalProjects)}
            </span>{" "}
            projects ·{" "}
            <span className="mono" style={{ fontWeight: 500 }}>
              {fmtInt(data.totalBudgetMB)}
            </span>{" "}
            MB total budget
          </p>
        </div>

        <div
          style={{
            textAlign: "right",
            borderLeft: "1px solid var(--line)",
            paddingLeft: 24,
          }}
        >
          <div className="eyebrow">Progress (Completed+PO)</div>
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

        {/* Chat with agent — links to the assistant */}
        <a
          href="http://10.0.129.62:8089/"
          target="_blank"
          rel="noopener noreferrer"
          className="bot-agent"
          aria-label="Open bot agent"
          title="Bot agent"
        >
          <img
            src="/APK-rockman.png"
            alt=""
            width={96}
            height={96}
            aria-hidden="true"
            style={{ display: "block", objectFit: "contain" }}
          />
          <span>Chat with agent</span>
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

      {/* Asset received status — projects over 80% budget usage (client) */}
      <AssetReceivedStatus projects={data.projects} />
    </main>
  );
}
