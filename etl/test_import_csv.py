# etl/test_import_csv.py — tests for the CSV-to-DB engine.
#
# Run:  py -m pytest etl/test_import_csv.py -q
import sqlite3
from pathlib import Path

import pytest

from import_csv import (
    PHASES,
    PHASE_KEYS,
    ProjectRecord,
    aggregate,
    main,
    parse_money,
    phase_of,
    read_projects,
    run,
    write_sqlite,
)

ROOT = Path(__file__).resolve().parent.parent
EXPORT_CSV = ROOT / "data" / "export_data.csv"

PROGRESSED = ("BUDGET_CLOSED", "INSTALL_COMPLETED", "PO_CREATED")


# --- Fixtures / helpers ----------------------------------------------
def rec(phase="PO_CREATED", year=2023, budget=10.0, actual=5.0, usage=6.0,
        name="P", pm="PM", io_no="IO001"):
    """Build a ProjectRecord with committed derived like the Reader does."""
    committed = round(max(usage - actual, 0.0), 2)
    return ProjectRecord(
        name=name, io_no=io_no, pm=pm, phase=phase, year=year,
        budget_mb=budget, actual_mb=actual, committed_mb=committed, usage_mb=usage,
    )


CSV_HEADER = (
    "Project,IO.no.,Budget year,Amt Budget,Project Manager,Measure Names,"
    "prompt budget closed,Status Budget,Amt Actual,Asset Recieved,Budget Usgae\n"
)


def write_csv(path: Path, rows: str, header: str = CSV_HEADER, bom: bool = False):
    encoding = "utf-8-sig" if bom else "utf-8"
    path.write_text(header + rows, encoding=encoding)
    return path


# --- parse_money -----------------------------------------------------
@pytest.mark.parametrize("raw,expected", [
    (None, 0.0),
    ("", 0.0),
    ("   ", 0.0),
    ("-", 0.0),
    ("abc", 0.0),
    ("1234", 1234.0),
    ("1,234.5", 1234.5),
    ("  1,000,000.00  ", 1_000_000.0),
    ("8105406.37", 8105406.37),
])
def test_parse_money(raw, expected):
    assert parse_money(raw) == expected


def test_parse_money_never_raises():
    for junk in [None, "", "-", "n/a", "1.2.3", "$5", "  ", "12,,34"]:
        parse_money(junk)  # must not raise


# --- phase_of --------------------------------------------------------
@pytest.mark.parametrize("raw,key", [
    ("Budget Closed", "BUDGET_CLOSED"),
    ("budget closed", "BUDGET_CLOSED"),
    ("  BUDGET   CLOSED  ", "BUDGET_CLOSED"),
    ("Installation Completed", "INSTALL_COMPLETED"),
    ("PO Created", "PO_CREATED"),
    ("PO on Process", "PO_ON_PROCESS"),
    ("PR on Process", "PR_ON_PROCESS"),
])
def test_phase_of_known(raw, key):
    assert phase_of(raw) == key


@pytest.mark.parametrize("raw", ["", "   ", "Cancelled", "Unknown Status", "closed"])
def test_phase_of_unknown(raw):
    assert phase_of(raw) is None


# --- read_projects ---------------------------------------------------
def test_read_basic(tmp_path):
    csv_path = write_csv(tmp_path / "e.csv",
        "New Sub,049,2022,170000000,Anusorn B.,Budget Status,x,Budget Closed,156869174.58,0,156869174.58\n")
    records, skipped = read_projects(csv_path)
    assert len(records) == 1
    assert skipped == []
    r = records[0]
    assert r.phase == "BUDGET_CLOSED"
    assert r.year == 2022
    assert r.budget_mb == 170.0
    assert r.actual_mb == 156.87
    # usage == actual -> committed 0
    assert r.committed_mb == 0.0


def test_read_committed_from_usage(tmp_path):
    # usage 6, actual 5 -> committed 1
    csv_path = write_csv(tmp_path / "e.csv",
        "P,1,2023,10000000,PM,ms,x,PO Created,5000000,0,6000000\n")
    records, _ = read_projects(csv_path)
    assert records[0].actual_mb == 5.0
    assert records[0].usage_mb == 6.0
    assert records[0].committed_mb == 1.0


def test_read_committed_never_negative(tmp_path):
    # usage 4 < actual 5 -> committed clamped to 0
    csv_path = write_csv(tmp_path / "e.csv",
        "P,1,2023,10000000,PM,ms,x,PO Created,5000000,0,4000000\n")
    records, _ = read_projects(csv_path)
    assert records[0].committed_mb == 0.0
    assert all(r.committed_mb >= 0 for r in records)


def test_read_skips_unmapped_status(tmp_path):
    csv_path = write_csv(tmp_path / "e.csv",
        "A,1,2023,1000000,PM,ms,x,Cancelled,0,0,0\n"
        "B,2,2023,1000000,PM,ms,x,Budget Closed,1000000,0,1000000\n"
        "C,3,2023,1000000,PM,ms,x,Cancelled,0,0,0\n")
    records, skipped = read_projects(csv_path)
    assert len(records) == 1
    assert records[0].name == "B"
    # distinct + deduped
    assert skipped == ["Cancelled"]


def test_read_skips_bad_year(tmp_path):
    csv_path = write_csv(tmp_path / "e.csv",
        "A,1,,1000000,PM,ms,x,Budget Closed,1000000,0,1000000\n"
        "B,2,notayear,1000000,PM,ms,x,Budget Closed,1000000,0,1000000\n"
        "C,3,2024,1000000,PM,ms,x,Budget Closed,1000000,0,1000000\n")
    records, _ = read_projects(csv_path)
    assert [r.year for r in records] == [2024]


def test_read_handles_bom_and_commas(tmp_path):
    csv_path = write_csv(tmp_path / "e.csv",
        'P,1,2023,"10,000,000",PM,ms,x,Budget Closed,"9,000,000",0,"9,000,000"\n',
        bom=True)
    records, _ = read_projects(csv_path)
    assert len(records) == 1
    assert records[0].budget_mb == 10.0
    assert records[0].actual_mb == 9.0


# --- write_sqlite ----------------------------------------------------
def test_write_sqlite_schema_and_contents(tmp_path):
    records = [rec(phase="BUDGET_CLOSED", year=2022, budget=10, actual=8, usage=8),
               rec(phase="PO_CREATED", year=2023, budget=5, actual=2, usage=4)]
    data = aggregate(records)
    db_path = tmp_path / "out.db"
    write_sqlite(db_path, data, "test.csv")

    con = sqlite3.connect(str(db_path))
    try:
        tables = {r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        assert {"phase_summary", "yearly_budget", "yearly_status", "projects", "metadata"} <= tables

        # phase_summary has all 5 phases in canonical order
        ps = con.execute("SELECT phase_key, color FROM phase_summary ORDER BY rowid").fetchall()
        assert [p[0] for p in ps] == PHASE_KEYS
        colors = dict(ps)
        assert colors["BUDGET_CLOSED"] == "#2563eb"
        assert colors["PR_ON_PROCESS"] == "#6d28d9"

        # projects row count matches
        n = con.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        assert n == 2

        # metadata present
        md = dict(con.execute("SELECT key, value FROM metadata").fetchall())
        assert "last_run" in md
        assert "test.csv" in md["source"]
    finally:
        con.close()


def test_write_sqlite_creates_parent_dir(tmp_path):
    data = aggregate([rec()])
    db_path = tmp_path / "nested" / "deep" / "out.db"
    write_sqlite(db_path, data, "x.csv")
    assert db_path.exists()


# --- run / main ------------------------------------------------------
def test_run_end_to_end(tmp_path):
    csv_path = write_csv(tmp_path / "e.csv",
        "A,1,2022,10000000,PM,ms,x,Budget Closed,9000000,0,9000000\n"
        "B,2,2023,5000000,PM,ms,x,PO Created,2000000,0,4000000\n")
    db_path = tmp_path / "out.db"
    summary = run(csv_path, db_path)
    assert summary.total_projects == 2
    assert summary.years == [2022, 2023]
    assert db_path.exists()


def test_run_raises_on_no_valid_rows(tmp_path):
    csv_path = write_csv(tmp_path / "e.csv",
        "A,1,2022,10000000,PM,ms,x,Cancelled,0,0,0\n")
    with pytest.raises(ValueError):
        run(csv_path, tmp_path / "out.db")


def test_main_missing_csv_returns_1(tmp_path):
    assert main([str(tmp_path / "does_not_exist.csv")]) == 1


def test_main_no_valid_rows_returns_1(tmp_path):
    csv_path = write_csv(tmp_path / "e.csv",
        "A,1,2022,10000000,PM,ms,x,Cancelled,0,0,0\n")
    assert main([str(csv_path)]) == 1
