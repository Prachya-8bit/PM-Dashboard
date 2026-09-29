# etl/test_integration.py — end-to-end run on the real export CSV.
#
# Runs the engine on data/export_data.csv into a temp DB, then executes the
# same SELECTs the dashboard uses (lib/dashboard-data.ts) and asserts the
# derived KPIs match the aggregator output.
#
# Run:  py -m pytest etl/test_integration.py -q
import sqlite3
from pathlib import Path

import pytest

from import_csv import aggregate, read_projects, run

ROOT = Path(__file__).resolve().parent.parent
EXPORT_CSV = ROOT / "data" / "export_data.csv"

PROGRESSED = ("BUDGET_CLOSED", "INSTALL_COMPLETED", "PO_CREATED")


@pytest.mark.skipif(not EXPORT_CSV.exists(), reason="export_data.csv not present")
def test_end_to_end_matches_dashboard_reads(tmp_path):
    db_path = tmp_path / "dashboard.db"
    summary = run(EXPORT_CSV, db_path)
    assert summary.total_projects > 0

    # Recompute expected KPIs directly from the records.
    records, _ = read_projects(EXPORT_CSV)
    data = aggregate(records)

    con = sqlite3.connect(str(db_path))
    con.row_factory = sqlite3.Row
    try:
        # Mirror readPhaseSummary()
        phase_rows = con.execute(
            "SELECT phase_key, count, budget_mb FROM phase_summary ORDER BY rowid"
        ).fetchall()
        total_projects = sum(r["count"] for r in phase_rows)
        total_budget = round(sum(r["budget_mb"] for r in phase_rows), 2)
        progressed = sum(r["count"] for r in phase_rows if r["phase_key"] in PROGRESSED)
        progress_pct = round(progressed / total_projects * 100, 1) if total_projects else 0.0

        assert total_projects == data.total_projects == summary.total_projects
        assert total_budget == pytest.approx(data.total_budget_mb, abs=0.01)
        assert progress_pct == pytest.approx(data.progress_pct, abs=0.05)

        # yearly_budget and yearly_status cover the same years.
        yb_years = [r["year"] for r in con.execute("SELECT year FROM yearly_budget ORDER BY year")]
        ys_years = [r["year"] for r in con.execute("SELECT year FROM yearly_status ORDER BY year")]
        assert yb_years == ys_years
        assert yb_years == sorted(yb_years)

        # metadata written
        md = dict(con.execute("SELECT key, value FROM metadata").fetchall())
        assert "last_run" in md and "source" in md
    finally:
        con.close()
