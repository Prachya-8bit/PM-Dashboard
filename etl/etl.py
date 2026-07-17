# etl/etl.py — ETL: SYS (MS SQL) → SQLite (aggregated)
#
# Runs via cron every 10 minutes.
# 1. Connects to SYS MS SQL Server (read-only)
# 2. Runs aggregation queries
# 3. Writes result to SQLite with atomic swap
#
# Usage:  python etl/etl.py
# Cron:   */10 * * * * cd /path/to/project && python etl/etl.py >> /var/log/dash-etl.log 2>&1
import os, sys, sqlite3, json
from datetime import datetime
from pathlib import Path

# --- Config from env -------------------------------------------------
SQL_SERVER   = os.environ["SQL_SERVER"]
SQL_PORT     = int(os.environ.get("SQL_PORT", 1433))
SQL_DATABASE = os.environ["SQL_DATABASE"]
SQL_USER     = os.environ["SQL_USER"]
SQL_PASSWORD = os.environ["SQL_PASSWORD"]
SQL_ENCRYPT  = os.environ.get("SQL_ENCRYPT", "false").lower() == "true"
SQL_TRUST    = os.environ.get("SQL_TRUST_CERT", "false").lower() == "true"

TABLE = os.environ.get("SQL_TABLE", "SysPurchaseDB.dbo.CapexProjects")
MB_DIV = float(os.environ.get("SQL_MB_DIVISOR", "1_000_000"))

# Column names in SYS table
COL_STATUS    = os.environ.get("SQL_COL_STATUS", "status")
COL_BUDGET    = os.environ.get("SQL_COL_BUDGET", "budget_amount")
COL_ACTUAL    = os.environ.get("SQL_COL_ACTUAL", "actual_amount")
COL_COMMITTED = os.environ.get("SQL_COL_COMMITTED", "committed_amount")
COL_DATE      = os.environ.get("SQL_COL_DATE", "project_date")
COL_NAME      = os.environ.get("SQL_COL_NAME", "project_name")
COL_PM        = os.environ.get("SQL_COL_PM", "project_manager")

# Status → PhaseKey mapping
STATUS_TO_PHASE = {
    # ADJUST: keys must match exact status strings in your DB
    "Budget Closed":          "BUDGET_CLOSED",
    "Installation Completed": "INSTALL_COMPLETED",
    "PO Created":             "PO_CREATED",
    "PO on Process":          "PO_ON_PROCESS",
    "PR on Process":          "PR_ON_PROCESS",
}

PHASES = [
    {"key": "BUDGET_CLOSED",     "label": "Budget Closed",          "color": "#2D7FF9"},
    {"key": "INSTALL_COMPLETED", "label": "Installation Completed", "color": "#1FBF8F"},
    {"key": "PO_CREATED",        "label": "PO Created",             "color": "#F5A623"},
    {"key": "PO_ON_PROCESS",     "label": "PO On Process",          "color": "#FF5A52"},
    {"key": "PR_ON_PROCESS",     "label": "PR On Process",          "color": "#9B6BE0"},
]

DB_PATH   = os.environ.get("SQLITE_PATH", str(Path(__file__).resolve().parent.parent / "data" / "dashboard.db"))


def get_mssql_connection():
    """Connect to MS SQL Server. Tries pymssql first, then pyodbc."""
    try:
        import pymssql
        return pymssql.connect(
            server=SQL_SERVER, port=SQL_PORT, database=SQL_DATABASE,
            user=SQL_USER, password=SQL_PASSWORD,
            tds_version="7.4" if SQL_ENCRYPT else None,
        )
    except ImportError:
        pass

    try:
        import pyodbc
        conn_str = (
            f"DRIVER={{ODBC Driver 18 for SQL Server}};"
            f"SERVER={SQL_SERVER},{SQL_PORT};"
            f"DATABASE={SQL_DATABASE};"
            f"UID={SQL_USER};PWD={SQL_PASSWORD};"
            f"Encrypt={'yes' if SQL_ENCRYPT else 'no'};"
            f"TrustServerCertificate={'yes' if SQL_TRUST else 'no'};"
        )
        return pyodbc.connect(conn_str)
    except ImportError:
        pass

    raise RuntimeError("Need pymssql or pyodbc. Install: pip install pymssql  or  pip install pyodbc")


def fetch_phase_summary(cursor) -> list[dict]:
    """Phase-level: count, budget, actual per status."""
    query = f"""
        SELECT {COL_STATUS} AS status,
               COUNT(*)            AS cnt,
               SUM({COL_BUDGET})   AS budget,
               SUM({COL_ACTUAL})   AS actual
        FROM {TABLE}
        GROUP BY {COL_STATUS}
    """
    cursor.execute(query)
    rows = cursor.fetchall()

    by_key = {}
    for status, cnt, budget, actual in rows:
        key = STATUS_TO_PHASE.get(status)
        if not key:
            continue
        acc = by_key.setdefault(key, {"count": 0, "budget": 0.0, "actual": 0.0})
        acc["count"]  += cnt
        acc["budget"] += (budget or 0)
        acc["actual"] += (actual or 0)

    return [
        {**p, **by_key.get(p["key"], {"count": 0, "budget": 0.0, "actual": 0.0}),
         "budgetMB": round((by_key.get(p["key"], {}).get("budget", 0)) / MB_DIV, 2),
         "actualMB": round((by_key.get(p["key"], {}).get("actual", 0)) / MB_DIV, 2)}
        for p in PHASES
    ]


def fetch_yearly_budget(cursor) -> list[dict]:
    """Year-level: budget vs commit+actual."""
    query = f"""
        SELECT YEAR({COL_DATE})                       AS yr,
               SUM({COL_BUDGET})                      AS budget,
               SUM({COL_COMMITTED} + {COL_ACTUAL})    AS commit_actual
        FROM {TABLE}
        GROUP BY YEAR({COL_DATE})
        ORDER BY yr
    """
    cursor.execute(query)
    return [
        {"year": yr, "budgetMB": round((budget or 0) / MB_DIV, 2),
         "commitActualMB": round((commit_actual or 0) / MB_DIV, 2)}
        for yr, budget, commit_actual in cursor.fetchall()
    ]


def fetch_yearly_status(cursor) -> list[dict]:
    """Year-level: count per status, stacked."""
    query = f"""
        SELECT YEAR({COL_DATE}) AS yr, {COL_STATUS} AS status, COUNT(*) AS cnt
        FROM {TABLE}
        GROUP BY YEAR({COL_DATE}), {COL_STATUS}
        ORDER BY yr
    """
    cursor.execute(query)

    by_year = {}
    for yr, status, cnt in cursor.fetchall():
        key = STATUS_TO_PHASE.get(status)
        if not key:
            continue
        row = by_year.setdefault(yr, {"year": yr, "BUDGET_CLOSED": 0, "INSTALL_COMPLETED": 0,
                                       "PO_CREATED": 0, "PO_ON_PROCESS": 0, "PR_ON_PROCESS": 0})
        row[key] += cnt

    return sorted(by_year.values(), key=lambda r: r["year"])


def fetch_projects(cursor) -> list[dict]:
    """Row-level: every project with its phase, year, budget, actual."""
    query = f"""
        SELECT {COL_NAME}, {COL_PM}, {COL_STATUS}, YEAR({COL_DATE}),
               {COL_BUDGET}, {COL_ACTUAL}, {COL_COMMITTED}
        FROM {TABLE}
    """
    cursor.execute(query)
    out = []
    for name, pm, status, yr, budget, actual, committed in cursor.fetchall():
        key = STATUS_TO_PHASE.get(status)
        if not key:
            continue
        out.append({
            "name": name, "pm": pm or "", "phase": key, "year": yr,
            "budgetMB": round((budget or 0) / MB_DIV, 2),
            "actualMB": round((actual or 0) / MB_DIV, 2),
            "committedMB": round((committed or 0) / MB_DIV, 2),
        })
    return out


def write_sqlite(phases, yearly_budget, yearly_status, projects):
    """Write aggregated data to SQLite atomically (write to temp, then rename)."""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    tmp_path = DB_PATH + ".tmp"

    with sqlite3.connect(tmp_path) as db:
        # --- phase_summary ---
        db.execute("""
            CREATE TABLE phase_summary (
                phase_key TEXT PRIMARY KEY,
                label     TEXT,
                color     TEXT,
                count     INTEGER,
                budget_mb REAL,
                actual_mb REAL
            )
        """)
        db.executemany(
            "INSERT INTO phase_summary VALUES (?,?,?,?,?,?)",
            [(p["key"], p["label"], p["color"], p["count"], p["budgetMB"], p["actualMB"]) for p in phases],
        )

        # --- yearly_budget ---
        db.execute("""
            CREATE TABLE yearly_budget (
                year            INTEGER PRIMARY KEY,
                budget_mb       REAL,
                commit_actual_mb REAL
            )
        """)
        db.executemany(
            "INSERT INTO yearly_budget VALUES (?,?,?)",
            [(r["year"], r["budgetMB"], r["commitActualMB"]) for r in yearly_budget],
        )

        # --- yearly_status ---
        db.execute("""
            CREATE TABLE yearly_status (
                year             INTEGER,
                budget_closed    INTEGER,
                install_completed INTEGER,
                po_created       INTEGER,
                po_on_process    INTEGER,
                pr_on_process    INTEGER,
                PRIMARY KEY (year)
            )
        """)
        db.executemany(
            """INSERT INTO yearly_status VALUES (?,?,?,?,?,?)""",
            [(r["year"], r["BUDGET_CLOSED"], r["INSTALL_COMPLETED"],
              r["PO_CREATED"], r["PO_ON_PROCESS"], r["PR_ON_PROCESS"]) for r in yearly_status],
        )

        # --- projects (row-level, for filterable project list) ---
        db.execute("""
            CREATE TABLE projects (
                name            TEXT,
                project_manager TEXT,
                phase_key       TEXT,
                year            INTEGER,
                budget_mb       REAL,
                actual_mb       REAL,
                committed_mb    REAL
            )
        """)
        db.executemany(
            "INSERT INTO projects VALUES (?,?,?,?,?,?,?)",
            [(p["name"], p["pm"], p["phase"], p["year"], p["budgetMB"], p["actualMB"], p["committedMB"])
             for p in projects],
        )

        # --- metadata (last_run timestamp) ---
        db.execute("CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT)")
        db.execute("INSERT INTO metadata VALUES ('last_run', ?)", (datetime.now().isoformat(),))

    # Atomic swap
    os.replace(tmp_path, DB_PATH)


def main():
    print(f"[{datetime.now().isoformat()}] ETL starting...")

    sys_conn = get_mssql_connection()
    cursor = sys_conn.cursor()

    phases        = fetch_phase_summary(cursor)
    yearly_budget = fetch_yearly_budget(cursor)
    yearly_status = fetch_yearly_status(cursor)
    projects      = fetch_projects(cursor)

    sys_conn.close()

    total_projects = sum(p["count"] for p in phases)
    total_budget   = sum(p["budgetMB"] for p in phases)
    progressed     = sum(p["count"] for p in phases if p["key"] in ("BUDGET_CLOSED", "INSTALL_COMPLETED", "PO_CREATED"))
    progress_pct   = round((progressed / total_projects * 100), 1) if total_projects else 0

    print(f"  Phases: {total_projects} projects, {total_budget:.1f} MB total")
    print(f"  Progress: {progress_pct}%")
    print(f"  Years budget: {len(yearly_budget)} rows")
    print(f"  Years status: {len(yearly_status)} rows")
    print(f"  Projects: {len(projects)} rows")

    write_sqlite(phases, yearly_budget, yearly_status, projects)
    print(f"  → SQLite written to {DB_PATH}")
    print(f"[{datetime.now().isoformat()}] ETL done.")


if __name__ == "__main__":
    main()
