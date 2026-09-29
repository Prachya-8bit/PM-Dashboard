# etl/import_csv.py — CSV-to-DB engine: data/export_data.csv -> data/dashboard.db
#
# Converts the SAP/Tableau "Budget Status" export into the aggregated SQLite
# tables the Next.js PM dashboard reads. Structured as a testable pipeline:
#
#     read_projects  ->  aggregate  ->  write_sqlite
#     (Reader)           (Aggregator)   (Writer)
#
# The Reader parses/normalizes rows, the Aggregator is a pure function over the
# record list, and the Writer rewrites the DB in one BEGIN IMMEDIATE transaction
# (in place, no temp-file rename — the dashboard holds the file open read-only
# and Windows cannot rename over an open file).
#
# Usage:
#   py etl/import_csv.py                      # reads data/export_data.csv
#   py etl/import_csv.py path/to/export.csv   # or pass an explicit path
#
# CSV columns expected (header row, comma-separated, UTF-8):
#   Project, IO.no., Budget year, Amt Budget, Project Manager, Measure Names,
#   prompt budget closed, Status Budget, Amt Actual, Asset Recieved, Budget Usgae
#
# Money conversion: raw THB -> MB (millions of Baht), divisor 1,000,000.
# Committed = max(Budget Usgae - Amt Actual, 0)  (Budget Usgae = Actual + Commitment).
from __future__ import annotations

import csv
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

# --- Paths and constants ---------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = ROOT / "data" / "export_data.csv"
DB_PATH = ROOT / "data" / "dashboard.db"
MB_DIV = 1_000_000.0

# PhaseKey is one of these five canonical strings.
PhaseKey = str

# Canonical phases, in display order, with the authoritative PHASE_COLOR palette
# (matches PHASE_COLOR in lib/dashboard-types.ts).
PHASES = [
    {"key": "BUDGET_CLOSED",     "label": "Budget Closed",          "color": "#2563eb"},
    {"key": "INSTALL_COMPLETED", "label": "Installation Completed", "color": "#0d9488"},
    {"key": "PO_CREATED",        "label": "PO Created",             "color": "#b45309"},
    {"key": "PO_ON_PROCESS",     "label": "PO On Process",          "color": "#be123c"},
    {"key": "PR_ON_PROCESS",     "label": "PR On Process",          "color": "#6d28d9"},
]

PHASE_KEYS = [p["key"] for p in PHASES]

# Map normalized (lowercase, space-collapsed) "Status Budget" -> phase key.
STATUS_TO_PHASE = {
    "budget closed":          "BUDGET_CLOSED",
    "installation completed": "INSTALL_COMPLETED",
    "po created":             "PO_CREATED",
    "po on process":          "PO_ON_PROCESS",
    "pr on process":          "PR_ON_PROCESS",
}


# --- Data models -----------------------------------------------------
@dataclass(frozen=True)
class ProjectRecord:
    """One accepted CSV row, cleaned and MB-converted."""
    name: str
    io_no: str            # IO.no. — kept as string to preserve leading zeros
    pm: str
    phase: PhaseKey
    year: int
    budget_mb: float      # Amt Budget / 1_000_000, rounded 2dp
    actual_mb: float      # Amt Actual / 1_000_000, rounded 2dp
    committed_mb: float   # max(usage - actual, 0) / 1_000_000, rounded 2dp
    usage_mb: float       # Budget Usgae / 1_000_000, rounded 2dp


@dataclass(frozen=True)
class AggregatedData:
    """The datasets and KPIs the Writer persists / the dashboard reads."""
    phases: list          # phase_summary rows
    yearly_budget: list   # sorted by year
    yearly_status: list   # sorted by year
    projects: list        # row-level
    total_projects: int
    total_budget_mb: float
    progress_pct: float


@dataclass(frozen=True)
class RunSummary:
    """Returned by run() and printed by the CLI."""
    total_projects: int
    total_budget_mb: float
    progress_pct: float
    years: list
    skipped: list
    db_path: Path


# --- Helpers ---------------------------------------------------------
def parse_money(x) -> float:
    """Parse a money cell that may be blank, quoted, comma-grouped, or '-'.

    Never raises: blank / '-' / unparseable all become 0.0.
    """
    if x is None:
        return 0.0
    s = str(x).strip().replace(",", "")
    if s == "" or s == "-":
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def _normalize_status(status) -> str:
    """Trim, collapse internal whitespace runs to a single space, lowercase."""
    return " ".join(str(status).split()).lower()


def phase_of(status) -> Optional[PhaseKey]:
    """Map a raw 'Status Budget' string to a PhaseKey, or None if unmapped."""
    return STATUS_TO_PHASE.get(_normalize_status(status))


def _to_mb(raw: float) -> float:
    return round(raw / MB_DIV, 2)


# --- Reader ----------------------------------------------------------
def read_projects(csv_path: Path):
    """Read and normalize the export CSV.

    Returns (records, skipped_statuses):
      - records: list[ProjectRecord], each with a valid PhaseKey and int year.
      - skipped_statuses: distinct non-empty statuses that did not map to a phase.
    """
    records = []
    skipped_seen = set()
    skipped = []  # preserves first-seen order, deduped

    # utf-8-sig strips a leading BOM if present.
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_status = row.get("Status Budget", "") or ""
            key = phase_of(raw_status)
            if key is None:
                stripped = raw_status.strip()
                if stripped and stripped not in skipped_seen:
                    skipped_seen.add(stripped)
                    skipped.append(stripped)
                continue

            # Year must parse to an int (tolerates "2023" and "2023.0").
            try:
                year = int(float(str(row.get("Budget year", "")).strip()))
            except (ValueError, TypeError):
                continue

            budget = parse_money(row.get("Amt Budget"))
            actual = parse_money(row.get("Amt Actual"))
            usage = parse_money(row.get("Budget Usgae"))  # actual + commitment

            actual_mb = _to_mb(actual)
            usage_mb = _to_mb(usage)
            committed_mb = round(max(usage_mb - actual_mb, 0.0), 2)

            records.append(ProjectRecord(
                name=(row.get("Project") or "").strip(),
                io_no=(row.get("IO.no.") or "").strip(),
                pm=(row.get("Project Manager") or "").strip(),
                phase=key,
                year=year,
                budget_mb=_to_mb(budget),
                actual_mb=actual_mb,
                committed_mb=committed_mb,
                usage_mb=usage_mb,
            ))

    return records, skipped


# --- Aggregator ------------------------------------------------------
def aggregate(records) -> AggregatedData:
    """Pure aggregation from records to all table datasets + derived KPIs."""
    # --- phase_summary: all five phases always present, canonical order ---
    phase_acc = {p["key"]: {"count": 0, "budget": 0.0, "actual": 0.0} for p in PHASES}
    for r in records:
        acc = phase_acc[r.phase]
        acc["count"] += 1
        acc["budget"] += r.budget_mb
        acc["actual"] += r.actual_mb
    phases = [
        {"key": p["key"], "label": p["label"], "color": p["color"],
         "count": phase_acc[p["key"]]["count"],
         "budgetMB": round(phase_acc[p["key"]]["budget"], 2),
         "actualMB": round(phase_acc[p["key"]]["actual"], 2)}
        for p in PHASES
    ]

    # --- yearly_budget: budget vs usage (== commit + actual) ---
    yb = {}
    for r in records:
        v = yb.setdefault(r.year, {"budget": 0.0, "usage": 0.0})
        v["budget"] += r.budget_mb
        v["usage"] += r.usage_mb
    yearly_budget = [
        {"year": y, "budgetMB": round(v["budget"], 2), "commitActualMB": round(v["usage"], 2)}
        for y, v in sorted(yb.items())
    ]

    # --- yearly_status: count per phase per year, all five keys present ---
    ys = {}
    for r in records:
        rowd = ys.setdefault(r.year, {"year": r.year, **{k: 0 for k in PHASE_KEYS}})
        rowd[r.phase] += 1
    yearly_status = sorted(ys.values(), key=lambda rowd: rowd["year"])

    # --- projects: row-level pass-through ---
    projects = [
        {"name": r.name, "ioNo": r.io_no, "pm": r.pm, "phase": r.phase, "year": r.year,
         "budgetMB": r.budget_mb, "actualMB": r.actual_mb, "committedMB": r.committed_mb}
        for r in records
    ]

    # --- derived KPIs ---
    total_projects = sum(p["count"] for p in phases)
    total_budget_mb = round(sum(p["budgetMB"] for p in phases), 2)
    progressed = sum(
        p["count"] for p in phases
        if p["key"] in ("BUDGET_CLOSED", "INSTALL_COMPLETED", "PO_CREATED")
    )
    progress_pct = round(progressed / total_projects * 100, 1) if total_projects else 0.0

    return AggregatedData(
        phases=phases,
        yearly_budget=yearly_budget,
        yearly_status=yearly_status,
        projects=projects,
        total_projects=total_projects,
        total_budget_mb=total_budget_mb,
        progress_pct=progress_pct,
    )


# --- Writer ----------------------------------------------------------
def write_sqlite(db_path: Path, data: AggregatedData, source_name: str) -> None:
    """Rewrite the DB in one BEGIN IMMEDIATE transaction, in place.

    On any error the transaction is rolled back and re-raised, leaving the
    previous DB content intact. The 30s busy timeout waits out reader locks.
    """
    db_path = Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    # isolation_level=None -> autocommit; we control the transaction explicitly.
    db = sqlite3.connect(str(db_path), isolation_level=None, timeout=30)
    try:
        db.execute("BEGIN IMMEDIATE")
        for table in ("phase_summary", "yearly_budget", "yearly_status", "projects", "metadata"):
            db.execute(f"DROP TABLE IF EXISTS {table}")

        db.execute("""
            CREATE TABLE phase_summary (
                phase_key TEXT PRIMARY KEY, label TEXT, color TEXT,
                count INTEGER, budget_mb REAL, actual_mb REAL
            )
        """)
        db.executemany(
            "INSERT INTO phase_summary VALUES (?,?,?,?,?,?)",
            [(p["key"], p["label"], p["color"], p["count"], p["budgetMB"], p["actualMB"])
             for p in data.phases],
        )

        db.execute("""
            CREATE TABLE yearly_budget (
                year INTEGER PRIMARY KEY, budget_mb REAL, commit_actual_mb REAL
            )
        """)
        db.executemany(
            "INSERT INTO yearly_budget VALUES (?,?,?)",
            [(r["year"], r["budgetMB"], r["commitActualMB"]) for r in data.yearly_budget],
        )

        db.execute("""
            CREATE TABLE yearly_status (
                year INTEGER, budget_closed INTEGER, install_completed INTEGER,
                po_created INTEGER, po_on_process INTEGER, pr_on_process INTEGER,
                PRIMARY KEY (year)
            )
        """)
        db.executemany(
            "INSERT INTO yearly_status VALUES (?,?,?,?,?,?)",
            [(r["year"], r["BUDGET_CLOSED"], r["INSTALL_COMPLETED"],
              r["PO_CREATED"], r["PO_ON_PROCESS"], r["PR_ON_PROCESS"]) for r in data.yearly_status],
        )

        db.execute("""
            CREATE TABLE projects (
                name TEXT, io_no TEXT, project_manager TEXT, phase_key TEXT, year INTEGER,
                budget_mb REAL, actual_mb REAL, committed_mb REAL
            )
        """)
        db.executemany(
            "INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)",
            [(p["name"], p["ioNo"], p["pm"], p["phase"], p["year"], p["budgetMB"], p["actualMB"], p["committedMB"])
             for p in data.projects],
        )

        db.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT)")
        db.execute("INSERT INTO metadata VALUES ('last_run', ?)", (datetime.now().isoformat(),))
        db.execute("INSERT INTO metadata VALUES ('source', ?)", (f"import_csv ({source_name})",))

        db.execute("COMMIT")
    except Exception:
        try:
            db.execute("ROLLBACK")
        except sqlite3.Error:
            pass  # e.g. BEGIN itself failed — no transaction to roll back
        raise
    finally:
        db.close()


# --- Engine / CLI ----------------------------------------------------
def run(csv_path: Path, db_path: Path = DB_PATH) -> RunSummary:
    """Orchestrate read -> aggregate -> write. Raises on no valid rows."""
    csv_path = Path(csv_path)
    records, skipped = read_projects(csv_path)
    if not records:
        raise ValueError("no valid rows parsed")

    data = aggregate(records)
    write_sqlite(db_path, data, csv_path.name)

    years = [r["year"] for r in data.yearly_status]
    return RunSummary(
        total_projects=data.total_projects,
        total_budget_mb=data.total_budget_mb,
        progress_pct=data.progress_pct,
        years=years,
        skipped=skipped,
        db_path=Path(db_path),
    )


def main(argv=None) -> int:
    argv = list(sys.argv[1:] if argv is None else argv)
    csv_path = Path(argv[0]).resolve() if argv else DEFAULT_CSV

    if not csv_path.exists():
        print(f"ERROR: CSV not found: {csv_path}")
        print(f"Place your export at {DEFAULT_CSV} or pass a path as an argument.")
        return 1

    print(f"Reading {csv_path} ...")
    records, skipped = read_projects(csv_path)

    if skipped:
        print(f"  ! Skipped {len(skipped)} distinct unmapped status(es): {sorted(skipped)}")

    if not records:
        print("ERROR: no valid rows parsed. Check the column headers / status values.")
        return 1

    data = aggregate(records)

    print(f"  Parsed {data.total_projects} projects, {data.total_budget_mb:,.1f} MB total budget")
    for p in data.phases:
        print(f"    {p['label']:<24} {p['count']:>3}  ({p['budgetMB']:,.1f} MB)")
    print(f"  Progress: {data.progress_pct}%")
    print(f"  Years: {[r['year'] for r in data.yearly_status]}")

    write_sqlite(DB_PATH, data, csv_path.name)
    print(f"  -> Wrote {DB_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
