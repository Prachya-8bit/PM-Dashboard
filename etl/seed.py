# etl/seed.py — Generate a sample data/dashboard.db WITHOUT MS SQL Server.
#
# Use this to run the dashboard locally / in Docker when you don't have
# (or don't want to connect to) the real SYS MS SQL Server.
#
# It writes the exact same SQLite schema that etl/etl.py produces, so the
# Next.js app reads it with no changes.
#
# Usage:  python etl/seed.py
import sqlite3
import random
from datetime import datetime
from pathlib import Path

DB_PATH = str(Path(__file__).resolve().parent.parent / "data" / "dashboard.db")

PHASES = [
    {"key": "BUDGET_CLOSED",     "label": "Budget Closed",          "color": "#2D7FF9"},
    {"key": "INSTALL_COMPLETED", "label": "Installation Completed", "color": "#1FBF8F"},
    {"key": "PO_CREATED",        "label": "PO Created",             "color": "#F5A623"},
    {"key": "PO_ON_PROCESS",     "label": "PO On Process",          "color": "#FF5A52"},
    {"key": "PR_ON_PROCESS",     "label": "PR On Process",          "color": "#9B6BE0"},
]

PHASE_KEYS = [p["key"] for p in PHASES]
YEARS = [2022, 2023, 2024, 2025]

PM_NAMES = [
    "Somchai Prasert", "Nattaya Wong", "Kittipong Sri", "Areeya Chan",
    "Thanawat Boon", "Pimchanok Lert", "Anucha Meesuk", "Suda Rattana",
]

PROJECT_PREFIXES = [
    "Warehouse Automation", "Network Upgrade", "Solar Rooftop", "CCTV Expansion",
    "HVAC Retrofit", "Data Center Cooling", "Fire Suppression", "Access Control",
    "Fiber Backbone", "UPS Replacement", "Production Line", "Water Treatment",
    "Lighting Retrofit", "Server Consolidation", "Backup Power", "Loading Dock",
]


def make_projects(rng: random.Random, n: int = 60) -> list[dict]:
    projects = []
    for i in range(n):
        phase = rng.choice(PHASE_KEYS)
        year = rng.choice(YEARS)
        budget = round(rng.uniform(2.0, 45.0), 2)

        # Spend depends on how far along the phase is.
        if phase == "BUDGET_CLOSED":
            actual_ratio, committed_ratio = rng.uniform(0.85, 1.0), 0.0
        elif phase == "INSTALL_COMPLETED":
            actual_ratio, committed_ratio = rng.uniform(0.7, 0.95), rng.uniform(0.0, 0.05)
        elif phase == "PO_CREATED":
            actual_ratio, committed_ratio = rng.uniform(0.3, 0.6), rng.uniform(0.2, 0.4)
        elif phase == "PO_ON_PROCESS":
            actual_ratio, committed_ratio = rng.uniform(0.1, 0.3), rng.uniform(0.3, 0.5)
        else:  # PR_ON_PROCESS
            actual_ratio, committed_ratio = rng.uniform(0.0, 0.1), rng.uniform(0.1, 0.3)

        actual = round(budget * actual_ratio, 2)
        committed = round(budget * committed_ratio, 2)

        projects.append({
            "name": f"{rng.choice(PROJECT_PREFIXES)} #{i + 1:03d}",
            "ioNo": f"0490020{rng.randint(0, 99999):05d}",
            "pm": rng.choice(PM_NAMES),
            "phase": phase,
            "year": year,
            "budgetMB": budget,
            "actualMB": actual,
            "committedMB": committed,
        })
    return projects


def aggregate(projects: list[dict]):
    # phase_summary
    phase_acc = {p["key"]: {"count": 0, "budget": 0.0, "actual": 0.0} for p in PHASES}
    for p in projects:
        acc = phase_acc[p["phase"]]
        acc["count"] += 1
        acc["budget"] += p["budgetMB"]
        acc["actual"] += p["actualMB"]
    phases = [
        {**p, "count": phase_acc[p["key"]]["count"],
         "budgetMB": round(phase_acc[p["key"]]["budget"], 2),
         "actualMB": round(phase_acc[p["key"]]["actual"], 2)}
        for p in PHASES
    ]

    # yearly_budget
    yb = {}
    for p in projects:
        acc = yb.setdefault(p["year"], {"budget": 0.0, "commit_actual": 0.0})
        acc["budget"] += p["budgetMB"]
        acc["commit_actual"] += p["committedMB"] + p["actualMB"]
    yearly_budget = [
        {"year": yr, "budgetMB": round(v["budget"], 2), "commitActualMB": round(v["commit_actual"], 2)}
        for yr, v in sorted(yb.items())
    ]

    # yearly_status
    ys = {}
    for p in projects:
        row = ys.setdefault(p["year"], {"year": p["year"], "BUDGET_CLOSED": 0, "INSTALL_COMPLETED": 0,
                                        "PO_CREATED": 0, "PO_ON_PROCESS": 0, "PR_ON_PROCESS": 0})
        row[p["phase"]] += 1
    yearly_status = sorted(ys.values(), key=lambda r: r["year"])

    return phases, yearly_budget, yearly_status


def write_sqlite(phases, yearly_budget, yearly_status, projects):
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
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
                name TEXT, io_no TEXT, project_manager TEXT, phase_key TEXT, year INTEGER,
                budget_mb REAL, actual_mb REAL, committed_mb REAL
            )
        """)
        db.executemany(
            "INSERT INTO projects VALUES (?,?,?,?,?,?,?,?)",
            [(p["name"], p["ioNo"], p["pm"], p["phase"], p["year"], p["budgetMB"], p["actualMB"], p["committedMB"])
             for p in projects],
        )

        db.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT)")
        db.execute("INSERT INTO metadata VALUES ('last_run', ?)", (datetime.now().isoformat(),))
        db.execute("INSERT INTO metadata VALUES ('source', 'seed.py (sample data)')")

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
    rng = random.Random(42)  # deterministic sample data
    projects = make_projects(rng, n=60)
    phases, yearly_budget, yearly_status = aggregate(projects)
    write_sqlite(phases, yearly_budget, yearly_status, projects)
    print(f"Seeded {len(projects)} sample projects -> {DB_PATH}")


if __name__ == "__main__":
    main()
