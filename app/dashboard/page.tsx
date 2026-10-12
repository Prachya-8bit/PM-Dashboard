// app/dashboard/page.tsx
// Server Component. Runs the DB queries, renders static markup,
// and hands serializable data to the client charts.
import { getDashboardData } from "@/lib/dashboard-data";
import { DashboardCharts } from "./charts";
import { AssetReceivedStatus } from "./asset-received";
import { DashboardFilterShell } from "./filter-shell";

export const dynamic = "force-dynamic"; // always fresh; swap for revalidate if you want caching

const fmtInt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

export default async function DashboardPage() {
  const data = await getDashboardData();

  // Count of Installation Completed projects whose Asset Received equals Budget
  // Usage (actual spend). Uses a tiny tolerance to avoid float rounding misses.
  const assetMatchesUsage = data.projects.filter(
    (p) =>
      p.phase === "INSTALL_COMPLETED" &&
      Math.abs(p.assetReceivedMB - p.actualMB) < 0.005
  ).length;

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

      {/* Phase pipeline strip + filterable project list share one phase filter (client).
          Charts render in between (as children) to preserve the original page order. */}
      <DashboardFilterShell
        phases={data.phases}
        totalProjects={data.totalProjects}
        projects={data.projects}
        assetMatchesUsage={assetMatchesUsage}
      >
        {/* Charts (client) */}
        <DashboardCharts
          byYearBudget={data.byYearBudget}
          byYearStatus={data.byYearStatus}
        />
      </DashboardFilterShell>

      {/* Asset received status — projects over 80% budget usage (client) */}
      <AssetReceivedStatus projects={data.projects} />
    </main>
  );
}
