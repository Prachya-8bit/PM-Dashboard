# Requirements Document

## Introduction

The CSV-to-DB engine converts the "Budget Status" export at `data/export_data.csv` into the
aggregated SQLite database at `data/dashboard.db` that the Next.js PM budget dashboard reads.
It supersedes the existing `etl/import_csv.py` script by factoring its logic into three
independently testable stages — **read → aggregate → write** — while preserving the
dashboard's SQLite schema (its contract) and the Windows-safe in-place write strategy.

The engine is a batch, offline component. It runs on demand (`py etl/import_csv.py`) or on a
schedule, reads one CSV, and performs a full deterministic rebuild of the database on every
run. There is no incremental update path.

These requirements are derived from the approved design document and resolve two design
decisions as explicit acceptance criteria:
1. `yearly_budget.commit_actual_mb` is standardized on the sum of per-row `usage_mb` (raw
   "Budget Usgae"), not `committed + actual`.
2. The engine writes the `PHASE_COLOR` palette (`#2563eb`, `#0d9488`, `#b45309`, `#be123c`,
   `#6d28d9`) as authoritative for `phase_summary.color`.

## Glossary

- **Engine**: The CSV-to-DB software component comprising the Reader, Aggregator, Writer, and CLI entry point.
- **Reader**: The stage that parses and normalizes CSV rows into validated ProjectRecord values.
- **Aggregator**: The pure stage that computes table datasets and derived KPIs from ProjectRecords.
- **Writer**: The stage that persists aggregated data to SQLite atomically.
- **CLI**: The command-line entry point that orchestrates the Reader, Aggregator, and Writer.
- **ProjectRecord**: An internal validated record for one accepted CSV row (name, pm, phase, year, budget_mb, actual_mb, committed_mb, usage_mb).
- **PhaseKey**: One of the five canonical phase identifiers: BUDGET_CLOSED, INSTALL_COMPLETED, PO_CREATED, PO_ON_PROCESS, PR_ON_PROCESS.
- **Status Mapping**: The case-insensitive, whitespace-normalized mapping from a CSV "Status Budget" string to a PhaseKey.
- **Money Cell**: A raw CSV currency value that may be blank, "-", quoted, or comma-grouped.
- **MB**: Millions of Baht; raw currency divided by 1,000,000 and rounded to two decimal places.
- **usage_mb**: The per-row "Budget Usgae" value in MB, representing actual plus commitment.
- **committed_mb**: The per-row committed value in MB, computed as max(usage_mb - actual_mb, 0).
- **Phase Summary**: The `phase_summary` table dataset — count, budget_mb, actual_mb per phase.
- **Yearly Budget**: The `yearly_budget` table dataset — budget_mb and commit_actual_mb per year.
- **Yearly Status**: The `yearly_status` table dataset — per-phase counts per year.
- **Projects Dataset**: The `projects` table dataset — row-level project detail.
- **KPI**: A derived summary value: totalProjects, totalBudgetMB, or progressPct.
- **Progressed Phases**: The phase set {BUDGET_CLOSED, INSTALL_COMPLETED, PO_CREATED} used to compute progressPct.
- **PHASE_COLOR Palette**: The authoritative phase color set (#2563eb, #0d9488, #b45309, #be123c, #6d28d9).
- **Run Summary**: The counts, totals, and output path reported after a successful run.

## Requirements

### Requirement 1: Read and normalize CSV rows

**User Story:** As a dashboard maintainer, I want the engine to read and normalize the export CSV, so that only valid, clean project rows enter the pipeline.

#### Acceptance Criteria

1. WHEN the Reader opens the CSV file, THE Reader SHALL decode it using the `utf-8-sig` encoding so that a leading byte-order mark is stripped.
2. WHEN the Reader parses a row, THE Reader SHALL normalize the "Status Budget" value by trimming leading and trailing whitespace, collapsing each run of one or more internal whitespace characters to a single space, and lowercasing all characters, before applying the Status Mapping.
3. WHEN a normalized status matches the Status Mapping, THE Reader SHALL assign the corresponding PhaseKey to the ProjectRecord.
4. WHEN the Reader accepts a row, THE Reader SHALL set `usage_mb` from the "Budget Usgae" cell by converting the raw value to megabytes as (raw / 1,000,000) rounded to 2 decimal places, and SHALL compute `committed_mb` as max(usage_mb - actual_mb, 0) using the MB-converted values.
5. WHEN the Reader completes parsing, THE Reader SHALL return the list of accepted ProjectRecords together with the list of distinct unmapped non-empty status strings.
6. IF a row has a non-empty "Status Budget" value that does not match any entry in the Status Mapping, THEN THE Reader SHALL exclude the row from the accepted ProjectRecords and SHALL record the unmapped status string in the list of distinct unmapped non-empty status strings.
7. IF a row has an empty "Status Budget" value or has a required numeric cell that is missing or non-numeric, THEN THE Reader SHALL exclude the row from the accepted ProjectRecords and SHALL continue parsing the remaining rows.

### Requirement 2: Skip invalid rows during reading

**User Story:** As a dashboard maintainer, I want rows with unmapped statuses or invalid years to be skipped, so that a full run still produces a usable database from the valid rows.

#### Acceptance Criteria

1. IF a row's normalized status is not found in the Status Mapping, THEN THE Reader SHALL exclude that row from the ProjectRecord list.
2. IF a row's normalized status is not found in the Status Mapping AND the raw status string contains at least one non-whitespace character, THEN THE Reader SHALL record that raw status string in the skipped-status list, storing at most one entry per distinct raw status string.
3. IF a row's "Budget year" value, after trimming leading and trailing whitespace, is empty or cannot be converted to a base-10 integer, THEN THE Reader SHALL exclude that row from the ProjectRecord list.
4. THE Reader SHALL ensure every returned ProjectRecord has a PhaseKey equal to one of the five canonical values (BUDGET_CLOSED, INSTALL_COMPLETED, PO_CREATED, PO_ON_PROCESS, PR_ON_PROCESS) and a `year` that is a base-10 integer value.

### Requirement 3: Parse money cells

**User Story:** As a dashboard maintainer, I want money cells parsed defensively, so that blank, dashed, quoted, or comma-grouped values never crash the run.

#### Acceptance Criteria

1. WHEN the Reader parses a Money Cell containing a numeric value, THE Reader SHALL remove all thousands-separator commas and surrounding whitespace, and convert the resulting characters to a floating-point value in raw currency units.
2. IF a Money Cell is null, an empty string, a string containing only whitespace, or equal to "-", THEN THE Reader SHALL assign the value `0.0` to that cell and SHALL NOT raise an error.
3. IF a Money Cell contains characters that cannot be converted to a floating-point number after removing thousands-separator commas and surrounding whitespace, THEN THE Reader SHALL assign the value `0.0` to that cell and SHALL NOT raise an error.
4. THE Reader SHALL parse every Money Cell without raising an error, regardless of cell content.
5. WHEN the Reader converts a Money Cell's raw currency value to MB, THE Reader SHALL divide the raw value by 1,000,000 and round the result to exactly two decimal places.

### Requirement 4: Aggregate the phase summary

**User Story:** As a dashboard viewer, I want per-phase counts and totals, so that the dashboard can display the phase breakdown consistently.

#### Acceptance Criteria

1. THE Aggregator SHALL produce a Phase Summary containing exactly five phase entries whose PhaseKeys are BUDGET_CLOSED, INSTALL_COMPLETED, PO_CREATED, PO_ON_PROCESS, and PR_ON_PROCESS, appearing in that canonical order, including any phase whose count is zero.
2. WHEN the Aggregator builds the Phase Summary, THE Aggregator SHALL set each phase's count to the total number of ProjectRecords assigned to that phase, and set that phase's budget_mb and actual_mb each to the arithmetic sum of the corresponding budget_mb and actual_mb values over all ProjectRecords assigned to that phase.
3. IF no ProjectRecords are assigned to a phase, THEN THE Aggregator SHALL set that phase's count, budget_mb, and actual_mb each to zero.
4. THE Aggregator SHALL ensure the sum of the count values across all five phases equals the number of ProjectRecords and equals the number of rows in the Projects Dataset.
5. WHEN the Aggregator writes each phase's `phase_summary.color`, THE Aggregator SHALL assign the value from the authoritative PHASE_COLOR Palette matching that phase's PhaseKey: BUDGET_CLOSED to #2563eb, INSTALL_COMPLETED to #0d9488, PO_CREATED to #b45309, PO_ON_PROCESS to #be123c, and PR_ON_PROCESS to #6d28d9.

### Requirement 5: Aggregate the yearly budget

**User Story:** As a dashboard viewer, I want yearly budget versus usage figures, so that the stacked budget chart reflects the export's authoritative usage semantics.

#### Acceptance Criteria

1. WHEN the Aggregator builds the Yearly Budget, THE Aggregator SHALL set each year's `budget_mb` to the arithmetic sum of `budget_mb` across all ProjectRecords belonging to that year.
2. WHEN the Aggregator builds the Yearly Budget, THE Aggregator SHALL set each year's `commit_actual_mb` to the arithmetic sum of the raw "Budget Usgae" value (`usage_mb`, the authoritative combined actual-plus-commitment figure, not committed plus actual) across all ProjectRecords belonging to that year.
3. IF a ProjectRecord's `usage_mb` is missing, null, or non-numeric, THEN THE Aggregator SHALL treat that record's `usage_mb` contribution to the year's `commit_actual_mb` as 0.
4. WHERE a year contains zero ProjectRecords, THE Aggregator SHALL set that year's `budget_mb` and `commit_actual_mb` to 0.
5. THE Aggregator SHALL sort the Yearly Budget rows ascending by year.

### Requirement 6: Aggregate the yearly status

**User Story:** As a dashboard viewer, I want per-phase counts broken down by year, so that the dashboard can show status trends over time.

#### Acceptance Criteria

1. WHEN the Aggregator builds the Yearly Status, THE Aggregator SHALL set each year's per-phase value to the count of ProjectRecords in that phase for that year, where each count is a non-negative integer.
2. THE Aggregator SHALL include all five canonical PhaseKeys (BUDGET_CLOSED, INSTALL_COMPLETED, PO_CREATED, PO_ON_PROCESS, PR_ON_PROCESS) in each Yearly Status row, using zero for phases with no ProjectRecords in that year.
3. THE Aggregator SHALL sort the Yearly Status rows in ascending order by year, where each year is represented as a 4-digit value.
4. THE Aggregator SHALL ensure the set of years in the Yearly Status equals the set of years in the Yearly Budget and equals the set of `year` values across all ProjectRecords.
5. THE Aggregator SHALL ensure that, for each Yearly Status row, the sum of the five canonical PhaseKey counts equals the total number of ProjectRecords for that year.
6. IF there are no ProjectRecords, THEN THE Aggregator SHALL produce an empty Yearly Status containing zero rows.
7. IF a ProjectRecord has a phase value that is not one of the five canonical PhaseKeys, THEN THE Aggregator SHALL exclude that ProjectRecord from all per-phase counts and SHALL provide an indication identifying the unrecognized phase value.

### Requirement 7: Produce the projects dataset

**User Story:** As a dashboard viewer, I want row-level project detail, so that the dashboard can list individual projects.

#### Acceptance Criteria

1. WHEN the Aggregator builds the Projects Dataset, THE Aggregator SHALL emit exactly one row per accepted ProjectRecord, such that the Projects Dataset row count equals the ProjectRecord count.
2. WHEN the Aggregator emits a Projects Dataset row, THE Aggregator SHALL populate it with the source ProjectRecord's name, project_manager, phase_key, year, budget_mb, actual_mb, and committed_mb values.
3. THE Aggregator SHALL ensure every `committed_mb` value in the Projects Dataset is greater than or equal to zero.
4. WHEN the Aggregator receives zero accepted ProjectRecords, THE Aggregator SHALL produce an empty Projects Dataset containing zero rows.

### Requirement 8: Compute derived KPIs

**User Story:** As a dashboard viewer, I want summary KPIs, so that the dashboard can display totals and progress at a glance.

#### Acceptance Criteria

1. WHEN at least one Phase Summary record exists, THE Aggregator SHALL compute `totalProjects` as the sum of Phase Summary counts.
2. IF no Phase Summary records exist, THEN THE Aggregator SHALL set `totalProjects` to zero.
3. WHEN at least one Phase Summary record exists, THE Aggregator SHALL compute `totalBudgetMB` as the sum of Phase Summary budget_mb values.
4. IF no Phase Summary records exist, THEN THE Aggregator SHALL set `totalBudgetMB` to zero.
5. WHEN `totalProjects` is greater than zero, THE Aggregator SHALL compute `progressPct` as the count of ProjectRecords in the Progressed Phases set {BUDGET_CLOSED, INSTALL_COMPLETED, PO_CREATED} divided by `totalProjects`, multiplied by 100, and rounded to one decimal place using round-half-up.
6. IF `totalProjects` is zero, THEN THE Aggregator SHALL set `progressPct` to zero.
7. THE Aggregator SHALL ensure `progressPct` is within the inclusive range from zero to one hundred.

### Requirement 9: Write the database atomically and in place

**User Story:** As a dashboard operator, I want database writes to be atomic and in-place, so that the dashboard never reads a partially written database and continues working on Windows.

#### Acceptance Criteria

1. WHEN the Writer persists aggregated data, THE Writer SHALL perform all table drops, creations, and inserts within a single `BEGIN IMMEDIATE` transaction.
2. WHEN the Writer persists aggregated data, THE Writer SHALL write to the existing database file in place, without creating a temporary file or performing a file rename operation.
3. IF any table drop, creation, or insert within the transaction fails, THEN THE Writer SHALL roll back the entire transaction, leave the existing database file unchanged, and return an error indicating the write failure.
4. WHEN all table drops, creations, and inserts complete successfully, THE Writer SHALL commit the transaction so that any concurrent reader observes either the complete previous database contents or the complete new database contents, and never a partially written state.
5. WHERE the parent directory of the database path does not exist, THE Writer SHALL create the full parent directory path before opening the database.
6. IF the parent directory cannot be created, THEN THE Writer SHALL abort the write without opening the database and return an error indicating the directory creation failure.
7. WHEN the Writer commits the transaction, THE Writer SHALL populate the `metadata` table with a `last_run` value formatted as an ISO-8601 timestamp and a `source` value identifying the input CSV.
8. WHEN the Writer produces the same aggregated input data on two or more runs, THE Writer SHALL write byte-identical table contents across those runs for every table except that the `metadata.last_run` value MAY differ.

### Requirement 10: Handle a locked or failed write

**User Story:** As a dashboard operator, I want write failures handled safely, so that a failed run never corrupts the existing database.

#### Acceptance Criteria

1. WHEN the Writer opens the database, THE Writer SHALL set a busy timeout of 30 seconds so that transient reader locks are waited out.
2. IF an error occurs during the write transaction, THEN THE Writer SHALL roll back the entire transaction and re-raise the original error, leaving the previous database content byte-for-byte identical to its state before the transaction began.
3. IF the Writer cannot acquire the write lock within the 30-second busy timeout, THEN THE Writer SHALL abort the write transaction and raise an error indicating that the lock could not be acquired, leaving the previous database content byte-for-byte identical to its state before the transaction began.
4. WHEN the write transaction completes without error, THE Writer SHALL commit all writes atomically so that the changes are persisted as a single unit.

### Requirement 11: Provide a command-line interface

**User Story:** As a dashboard maintainer, I want a simple command-line interface, so that I can run the engine on demand or on a schedule.

#### Acceptance Criteria

1. IF no CSV path argument is provided, THEN THE CLI SHALL read the CSV from the default location `data/export_data.csv`.
2. IF a CSV path argument is provided, THEN THE CLI SHALL read the CSV from that path.
3. WHEN a run completes successfully, THE CLI SHALL print a Run Summary containing the parsed project count, the total budget in MB, the per-phase counts for all five canonical PhaseKeys, the covered years, and the output database path.
4. WHEN a run completes successfully, THE CLI SHALL exit with process exit code zero.
5. IF the resolved CSV path (default or provided) does not exist or cannot be read, THEN THE CLI SHALL print an error message identifying the affected path and SHALL exit with a non-zero process exit code.

### Requirement 12: Handle a missing CSV file

**User Story:** As a dashboard maintainer, I want a clear message when the CSV is missing, so that I can correct the path quickly.

#### Acceptance Criteria

1. IF the resolved CSV path does not exist when the engine starts, THEN THE CLI SHALL print a message that includes the expected default CSV file location and indicates that the file was not found.
2. IF the resolved CSV path does not exist when the engine starts, THEN THE CLI SHALL terminate with exit code 1.
3. IF the resolved CSV path does not exist when the engine starts, THEN THE Engine SHALL leave the existing database file byte-for-byte unmodified and SHALL NOT create a new database file.
4. WHEN the engine starts, THE Engine SHALL resolve the CSV path and verify its existence before opening, creating, or writing to the database file.

### Requirement 13: Handle no valid rows

**User Story:** As a dashboard maintainer, I want the engine to refuse to write when nothing valid was parsed, so that a bad export cannot wipe the dashboard's data.

#### Acceptance Criteria

1. IF every data row in the CSV is excluded during reading such that the count of valid records is zero, THEN THE CLI SHALL print a message indicating that no valid rows were found and instructing the user to check the column headers and status values, AND SHALL exit with code one.
2. IF every data row in the CSV is excluded during reading such that the count of valid records is zero, THEN THE Engine SHALL leave the database file unmodified, retaining its byte-for-byte content and last-modified timestamp as they were before the run.
3. IF the CSV contains a header row but zero data rows, THEN THE CLI SHALL treat the valid record count as zero and SHALL apply the same behavior as when all rows are excluded.
4. WHEN at least one valid record is parsed, THE Engine SHALL proceed to write to the database and SHALL exit with code zero.

### Requirement 14: Report partially unmapped statuses

**User Story:** As a dashboard maintainer, I want to see which statuses were skipped, so that I can decide whether to extend the Status Mapping.

#### Acceptance Criteria

1. WHILE processing a CSV input containing one or more rows whose status value is non-empty and not present in the Status Mapping, THE Engine SHALL process every remaining row whose status value is present in the Status Mapping and skip only the rows with unmapped non-empty status values.
2. WHEN processing completes for an input containing one or more rows with non-empty unmapped status values, THE Engine SHALL print the total count of skipped rows as a non-negative integer.
3. WHEN processing completes for an input containing one or more rows with non-empty unmapped status values, THE Engine SHALL print the distinct set of skipped status strings, listing each unmapped status value exactly once with no duplicates.
4. IF every row in the input has a status value present in the Status Mapping, THEN THE Engine SHALL report a skipped row count of 0 and print an empty set of distinct skipped status strings.
