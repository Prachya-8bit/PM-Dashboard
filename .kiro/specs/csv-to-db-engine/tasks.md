# Implementation Plan

- [ ] 1. Set up module scaffolding, constants, and data models
  - Rewrite `etl/import_csv.py` header/docstring to describe the read → aggregate → write pipeline.
  - Define `PhaseKey` literal type, the canonical `PHASES` list with the authoritative `PHASE_COLOR` palette (BUDGET_CLOSED #2563eb, INSTALL_COMPLETED #0d9488, PO_CREATED #b45309, PO_ON_PROCESS #be123c, PR_ON_PROCESS #6d28d9), and the `STATUS_TO_PHASE` mapping (lowercase, space-normalized keys).
  - Define `MB_DIV = 1_000_000.0`, default paths (`DEFAULT_CSV`, `DB_PATH`), and the frozen dataclasses `ProjectRecord`, `AggregatedData`, and `RunSummary`.
  - _Requirements: 1.3, 2.4, 4.1, 4.5_

- [ ] 2. Implement the money and status helper functions
  - [ ] 2.1 Implement `parse_money(x) -> float`
    - Strip surrounding whitespace and thousands-separator commas; return `0.0` for null/empty/whitespace-only/`-`/unparseable; never raise.
    - _Requirements: 3.1, 3.2, 3.3, 3.4_
  - [ ] 2.2 Implement `phase_of(status) -> PhaseKey | None`
    - Normalize by trimming, collapsing internal whitespace to single spaces, and lowercasing before mapping; return `None` for unmapped statuses.
    - _Requirements: 1.2, 2.1_

- [ ] 3. Implement the Reader (`read_projects`)
  - Open the CSV with `utf-8-sig` and parse with `csv.DictReader`.
  - For each row: map status via `phase_of`; skip and record distinct non-empty unmapped statuses; parse `Budget year` as an integer and skip rows with a missing/invalid year.
  - Parse money cells, convert to MB (raw / MB_DIV rounded 2dp), set `usage_mb` from "Budget Usgae", and compute `committed_mb = max(usage_mb - actual_mb, 0)`.
  - Return `(records, skipped_statuses)` where every record has a valid `PhaseKey` and integer year.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 2.1, 2.2, 2.3, 2.4_

- [ ] 4. Implement the Aggregator (`aggregate`)
  - [ ] 4.1 Build the phase summary
    - Initialize all five phases (canonical order) to zero; sum count/budget_mb/actual_mb per phase; attach the authoritative color; guarantee sum of counts equals record count.
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ] 4.2 Build the yearly budget
    - Per year, sum `budget_mb` and set `commit_actual_mb` to the sum of `usage_mb`; sort ascending by year.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
  - [ ] 4.3 Build the yearly status
    - Per year, count records per phase with all five phase keys present (zeros where none); sort ascending by year; ensure year-set equality with yearly budget and records.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_
  - [ ] 4.4 Build the projects dataset and derived KPIs
    - Emit one row per record (name, project_manager, phase_key, year, budget_mb, actual_mb, committed_mb).
    - Compute `totalProjects`, `totalBudgetMB`, and `progressPct` (progressed phases / total * 100, rounded 1dp, 0 when empty, bounded 0–100).
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

- [ ] 5. Implement the Writer (`write_sqlite`)
  - Ensure the parent directory exists; open with `isolation_level=None` and `timeout=30`.
  - Run a single `BEGIN IMMEDIATE` transaction: DROP + CREATE + INSERT `phase_summary`, `yearly_budget`, `yearly_status`, `projects`, and `metadata` (`last_run` ISO timestamp, `source`); COMMIT; ROLLBACK and re-raise on any error.
  - Write in place (no temp-file rename) so a read-only dashboard handle on Windows is not broken.
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 10.1, 10.2, 10.3, 10.4_

- [ ] 6. Implement the engine orchestration and CLI (`run`, `main`)
  - `run(csv_path, db_path)` orchestrates read → aggregate → write and returns a `RunSummary`.
  - `main(argv)` resolves the CSV path (default `data/export_data.csv` or explicit arg), verifies existence before touching the DB, prints the run summary on success (exit 0), prints guidance and exits 1 for missing CSV or no valid rows (leaving the DB untouched), and reports skipped-status counts/values.
  - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 12.1, 12.2, 12.3, 12.4, 13.1, 13.2, 13.3, 13.4, 14.1, 14.2, 14.3, 14.4_

- [ ] 7. Write unit tests
  - Add `etl/test_import_csv.py` covering `parse_money` (blank, `-`, `"1,234.5"`, quoted, non-numeric, `None`), `phase_of` (exact, mixed-case, extra-spaced, unknown), `read_projects` (unmapped status, missing year, BOM header, comma-grouped money; assert dropped rows and `committed_mb >= 0`), and `write_sqlite` (temp DB read-back of schema, contents, and `metadata`).
  - _Requirements: 1.1, 1.2, 1.6, 1.7, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 9.5, 9.7_

- [ ] 8. Write property-based tests for the correctness properties
  - Add `hypothesis` (and `pytest`) to `etl/requirements.txt` as dev/test dependencies.
  - Generate random `ProjectRecord` lists and assert: count conservation, all-five-phases present, committed non-negativity, year coverage, progress bounds, yearly-budget = Σ usage_mb, and idempotence (modulo `last_run`).
  - _Requirements: 4.3, 4.1, 6.2, 1.4, 7.2, 5.3, 6.3, 6.4, 8.3, 8.4, 8.5, 5.2, 9.6_

- [ ] 9. Write an end-to-end integration test
  - Run `run()` on `data/export_data.csv` into a temp DB, then execute the SELECTs the dashboard uses and assert derived `totalProjects`, `totalBudgetMB`, and `progressPct` match the aggregator output.
  - _Requirements: 9.1, 9.3, 10.2, 11.3_
