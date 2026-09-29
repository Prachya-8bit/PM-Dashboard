# etl/test_properties.py — property-based tests for the 8 correctness properties.
#
# Run:  py -m pytest etl/test_properties.py -q
import sqlite3
from pathlib import Path

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from import_csv import (
    PHASE_KEYS,
    ProjectRecord,
    aggregate,
    write_sqlite,
)

PROGRESSED = ("BUDGET_CLOSED", "INSTALL_COMPLETED", "PO_CREATED")

money = st.floats(min_value=0, max_value=500, allow_nan=False, allow_infinity=False)


@st.composite
def project_records(draw):
    phase = draw(st.sampled_from(PHASE_KEYS))
    year = draw(st.integers(min_value=2000, max_value=2035))
    budget = round(draw(money), 2)
    actual = round(draw(money), 2)
    usage = round(draw(money), 2)
    committed = round(max(usage - actual, 0.0), 2)
    return ProjectRecord(
        name=draw(st.text(max_size=8)), io_no=draw(st.text(max_size=12)),
        pm=draw(st.text(max_size=8)),
        phase=phase, year=year,
        budget_mb=budget, actual_mb=actual, committed_mb=committed, usage_mb=usage,
    )


record_lists = st.lists(project_records(), max_size=40)

# The first input draw can be slow on a cold interpreter; relax timing checks.
settings.register_profile(
    "engine",
    suppress_health_check=[HealthCheck.too_slow],
    deadline=None,
)
settings.load_profile("engine")


# Property 1: Count conservation
@given(record_lists)
def test_count_conservation(records):
    data = aggregate(records)
    assert sum(p["count"] for p in data.phases) == len(records)
    assert len(data.projects) == len(records)


# Property 2: All five phases present, canonical order
@given(record_lists)
def test_all_phases_present(records):
    data = aggregate(records)
    assert [p["key"] for p in data.phases] == PHASE_KEYS


# Property 3: Committed non-negativity
@given(record_lists)
def test_committed_non_negative(records):
    data = aggregate(records)
    assert all(p["committedMB"] >= 0 for p in data.projects)


# Property 4: Year coverage (same year set across datasets, sorted asc)
@given(record_lists)
def test_year_coverage(records):
    data = aggregate(records)
    yb_years = [r["year"] for r in data.yearly_budget]
    ys_years = [r["year"] for r in data.yearly_status]
    rec_years = {r.year for r in records}
    assert set(yb_years) == rec_years
    assert set(ys_years) == rec_years
    assert yb_years == sorted(yb_years)
    assert ys_years == sorted(ys_years)


# Property 5: Progress bounds
@given(record_lists)
def test_progress_bounds(records):
    data = aggregate(records)
    assert 0 <= data.progress_pct <= 100
    if not records:
        assert data.progress_pct == 0


# Property 6: Yearly budget commit_actual_mb == Σ usage_mb per year
@given(record_lists)
def test_yearly_budget_usage(records):
    data = aggregate(records)
    expected = {}
    for r in records:
        expected[r.year] = expected.get(r.year, 0.0) + r.usage_mb
    for row in data.yearly_budget:
        assert row["commitActualMB"] == round(expected[row["year"]], 2)


# Property 7 + 8: Atomicity is exercised via write; Idempotence on repeated runs
@settings(max_examples=25)
@given(record_lists)
def test_idempotent_write(records):
    import tempfile

    tmp = Path(tempfile.mkdtemp(prefix="idem_"))
    db_path = tmp / "out.db"
    data = aggregate(records)

    def snapshot():
        write_sqlite(db_path, data, "x.csv")
        con = sqlite3.connect(str(db_path))
        try:
            tables = ("phase_summary", "yearly_budget", "yearly_status", "projects")
            return {t: con.execute(f"SELECT * FROM {t} ORDER BY rowid").fetchall() for t in tables}
        finally:
            con.close()

    first = snapshot()
    second = snapshot()
    # Identical apart from metadata.last_run (excluded above).
    assert first == second


# Also assert the stacked yearly_status counts sum to that year's record count.
@given(record_lists)
def test_yearly_status_counts_sum(records):
    data = aggregate(records)
    per_year = {}
    for r in records:
        per_year[r.year] = per_year.get(r.year, 0) + 1
    for row in data.yearly_status:
        assert sum(row[k] for k in PHASE_KEYS) == per_year[row["year"]]
