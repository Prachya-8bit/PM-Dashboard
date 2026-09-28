# etl/import_csv.py — Load a real export CSV into data/dashboard.db
#
# Reads the SAP/Tableau "Budget Status" export and writes the aggregated
# SQLite tables the dashboard reads (same schema as etl/etl.py / seed.py).
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
# Committed = Budget Usgae - Amt Actual  (Budget Usgae = Actual + Commitment).
import csv
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CSV = ROOT / "data" / "export_data.csv"
DB_PATH = ROOT / "data" / "dashboard.db"
MB_DIV = 1_000_000.0

PHASES = [
    {"key": "BUDGET_CLOSED",     "label": "Budget Closed",          "color": "#2563eb"},
    {"key": "INSTALL_COMPLETED", "label": "Installation Completed", "color": "#0d9488"},
    {"key": "PO_CREATED",        "label": "PO Created",             "color": "#b45309"},
    {"key": "PO_ON_PROCESS",     "label": "PO On Process",          "color": "#be123c"},
    {"key": "PR_ON_PROCESS",     "label": "PR On Process",          "color": "#6d28d9"},
]

# Map exact "Status Budget" strings -> phase key. Case-insensitive, space-normalized.
STATUS_TO_PHASE = {
    "budget closed":          "BUDGET_CLOSED",
    "installation completed": "INSTALL_COMPLETED",
    "po created":             "PO_CREATED",
    "po on process":          "PO_ON_PROCESS",
    "pr on process":          "PR_ON_PROCESS",
}


def num(x: str) -> float:
    """Parse a money/number cell that may be blank, quoted, or comma-grouped."""
    if x is None:
        return 0.0
    s = str(x).strip().replace(",", "")
    if s == "" or s == "-":
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def phase_of(status: str) -> str | None:
    key = STATUS_TO_PHASE.get(" ".join(str(status).split()).lower())
    return key


def read_projects(csv_path: Path) -> list[dict]:
    projects: list[dict] = []
    skipped: list[str] = []
    # utf-8-sig strips a leading BOM if present.
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            status = row.get("Status Budget", "")
            key = phase_of(status)
            if not key:
                if status.strip():
                    skipped.append(status.strip())
                continue

            try:
                year = int(float(str(row.get("Budget year", "")).strip()))
            except (ValueError, TypeError):
                continue

            budget = num(row.get("Amt Budget"))
            actual = num(row.get("Amt Actual"))
            usage = num(row.get("Budget Usgae"))  # actual + commitment
            committed = max(usage - actual, 0.0)

            projects.append({
                "name": (row.get("Project") or "").strip(),
                "pm": (row.get("Project Manager") or "").strip(),
                "phase": key,
                "year": year,
                "budgetMB": round(budget / MB_DIV, 2),
                "actualMB": round(actual / MB_DIV, 2),
                "committedMB": round(committed / MB_DIV, 2),
                "usageMB": round(usage / MB_DIV, 2),
            })

    if skipped:
        uniq = sorted(set(skipped))
        print(f"  ! Skipped {len(skipped)} rows with unmapped status: {uniq}")
    return projects


def aggregate(projects: list[dict]):
    # phase_summary
    acc = {p["key"]: {"count": 0, "budget": 0.0, "actual": 0.0} for p in PHASES}
    for p in projects:
        a = acc[p["phase"]]
        a["count"] += 1
        a["budget"] += p["budgetMB"]
        a["actual"] += p["actualMB"]
    phases = [
        {**p, "count": acc[p["key"]]["count"],
         "budgetMB": round(acc[p["key"]]["budget"], 2),
         "actualMB": round(acc[p["key"]]["actual"], 2)}
        for p in PHASES
    ]

    # yearly_budget: budget vs (commit + actual) == usage
    yb: dict[int, dict] = {}
    for p in projects:
        v = yb.setdefault(p["year"], {"budget": 0.0, "usage": 0.0})
        v["budget"] += p["budgetMB"]
        v["usage"] += p["usageMB"]
    yearly_budget = [
        {"year": y, "budgetMB": round(v["budget"], 2), "commitActualMB": round(v["usage"], 2)}
        for y, v in sorted(yb.items())
    ]

    # yearly_status: count per phase per year
    ys: dict[int, dict] = {}
    for p in projects:
        r = ys.setdefault(p["year"], {"year": p["year"], "BUDGET_CLOSED": 0, "INSTALL_COMPLETED": 0,
                                      "PO_CREATED": 0, "PO_ON_PROCESS": 0, "PR_ON_PROCESS": 0})
        r[p["phase"]] += 1
    yearly_status = sorted(ys.values(), key=lambda r: r["year"])

    return phases, yearly_budget, yearly_status


def write_sqlite(phases, yearly_budget, yearly_status, projects, source_name):
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, isolation_level=None, timeout=30)
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
            [(p["key"], p["label"], p["color"], p["count"], p["budgetMB"], p["actualMB"]) for p in phases],
        )

        db.execute("""
            CREATE TABLE yearly_budget (
                year INTEGER PRIMARY KEY, budget_mb REAL, commit_actual_mb REAL
            )
        """)
        db.executemany(
            "INSERT INTO yearly_budget VALUES (?,?,?)",
            [(r["year"], r["budgetMB"], r["commitActualMB"]) for r in yearly_budget],
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
              r["PO_CREATED"], r["PO_ON_PROCESS"], r["PR_ON_PROCESS"]) for r in yearly_status],
        )

        db.execute("""
            CREATE TABLE projects (
                name TEXT, project_manager TEXT, phase_key TEXT, year INTEGER,
                budget_mb REAL, actual_mb REAL, committed_mb REAL
            )
        """)
        db.executemany(
            "INSERT INTO projects VALUES (?,?,?,?,?,?,?)",
            [(p["name"], p["pm"], p["phase"], p["year"], p["budgetMB"], p["actualMB"], p["committedMB"])
             for p in projects],
        )

        db.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT)")
        db.execute("INSERT INTO metadata VALUES ('last_run', ?)", (datetime.now().isoformat(),))
        db.execute("INSERT INTO metadata VALUES ('source', ?)", (f"import_csv.py ({source_name})",))

        db.execute("COMMIT")
    except Exception:
        try:
            db.execute("ROLLBACK")
        except sqlite3.Error:
            pass
        raise
    finally:
        db.close()


def main():
    csv_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_CSV
    if not csv_path.exists():
        print(f"ERROR: CSV not found: {csv_path}")
        print(f"Place your export at {DEFAULT_CSV} or pass a path as an argument.")
        sys.exit(1)

    print(f"Reading {csv_path} ...")
    projects = read_projects(csv_path)
    if not projects:
        print("ERROR: no valid rows parsed. Check the column headers / status values.")
        sys.exit(1)

    phases, yearly_budget, yearly_status = aggregate(projects)

    total = len(projects)
    total_budget = sum(p["budgetMB"] for p in projects)
    print(f"  Parsed {total} projects, {total_budget:,.1f} MB total budget")
    for p in phases:
        print(f"    {p['label']:<24} {p['count']:>3}  ({p['budgetMB']:,.1f} MB)")
    print(f"  Years: {[r['year'] for r in yearly_status]}")

    write_sqlite(phases, yearly_budget, yearly_status, projects, csv_path.name)
    print(f"  -> Wrote {DB_PATH}")


if __name__ == "__main__":
    main()
