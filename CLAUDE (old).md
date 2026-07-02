# CLAUDE.md — Project Management Dashboard

Context file for the AI coding agent (Factory droid / Claude Code). Read this fully
before generating code. It defines *what* to build, *for whom*, and the *exact design
tokens* to use. Do not invent features outside this scope without flagging it.

> **Note on Factory:** Factory droids primarily read `AGENTS.md`. If this file is not
> being picked up, symlink or copy it: `AGENTS.md -> CLAUDE.md`. (Confidence: Likely —
> confirm against your Factory project settings.)

---

## 1. Purpose & Non-Goals

**Purpose.** A read-mostly dashboard that tracks CAPEX / procurement-driven projects
through a procurement-to-installation lifecycle, plus budget vs. actual cost tracking.
Optimized for *scanning at a glance*, not data entry.

**Non-Goals (do NOT build these in v1):**
- No procurement *transaction* engine (we read PR/PO status, we don't create POs).
- No editable ledger / accounting. Budget figures are imported, displayed, analyzed.
- No mobile-native app. Responsive web only (desktop-first, tablet-supported).
- No real-time websocket layer in v1. Poll on an interval (default 60s) with manual refresh.

---

## 2. OPEN QUESTIONS — resolve before/while building

These are unresolved with the stakeholder. Build to the stated default, leave a `// TODO(decision)`
comment, and surface them in the UI as configurable where cheap.

1. **Phase semantics.** "PO on Process" = PO drafting/approval (pre-issuance) **OR** order
   fulfillment (post-issuance)? **Default assumed: pre-issuance.** Pipeline order below reflects that.
2. **Single vs. role-scoped views.** Default built: **role-scoped views** sharing one component
   library. If a single unified screen is required, collapse the three default layouts into one
   and gate sections by permission instead.
3. **Currency & locale.** Default: THB (฿), Thai locale, but render all dates in both Gregorian
   and Buddhist Era (BE = CE + 543) where space allows. Make currency a config constant.
4. **Source of truth for budget.** Imported snapshot (CSV/API) vs. live ERP query — affects
   staleness indicator. Default: snapshot with a "last synced" timestamp shown.

---

## 3. Target Users & Role-Scoped Defaults

Three roles. Same components, different default landing view and default filters.

| Role | Primary question they open this to answer | Default landing view | Hero metrics |
|---|---|---|---|
| **Production Manager** | "What's blocking my line / output, and what's late?" | Phase Pipeline + at-risk projects | Projects by phase, overdue count, install-completion rate |
| **Maintenance Engineer** | "What equipment work is in procurement and when does it land?" | Phase Pipeline filtered to maintenance category | Items in "PO on Process", expected delivery dates, install backlog |
| **Project Manager** | "Are we on schedule and on budget?" | Budget & Cost + phase overview | Budget vs. committed vs. actual, variance %, burn rate |

Implement a **role switcher** in the top bar (segmented control). Persist selection in
`localStorage` (key: `pmd.role`). Role only changes default view + default filters; all
data remains accessible to all roles in v1 (no hard RBAC yet — leave a `// TODO(rbac)` hook).

---

## 4. Information Architecture

```
┌ Top Bar ───────────────────────────────────────────────┐
│ Logo  ·  Role Segmented Control  ·  Search  ·  Sync ⟳  │  ← glass chrome
├────────────────────────────────────────────────────────┤
│ Section A — PHASE OVERVIEW (status cards by phase)      │
│ Section B — BUDGET & COST MANAGEMENT                    │
│ Section C — PROJECT LIST / TABLE (filterable)          │
└────────────────────────────────────────────────────────┘
```

Single-page dashboard, vertical scroll, sections anchored. No nested routing in v1
beyond an optional project detail drawer (slide-over from the right).

---

## 5. Feature A — Phase Overview Status Cards

A horizontal pipeline of **5 phase cards**. Each card = one stage; shows count of projects
in that stage + total budget in that stage. Clicking a card filters Section C to that phase.

**Phase pipeline (ordered):**

1. `PR_ON_PROCESS` — "PR on Process" — Purchase Requisition raised, in approval.
2. `PO_ON_PROCESS` — "PO on Process" — PO being drafted / approved. *(See Open Q #1.)*
3. `PO_CREATED` — "PO Created" — PO issued to vendor.
4. `INSTALL_COMPLETED` — "Installation Completed" — delivered + installed.
5. `BUDGET_CLOSED` — "Budget Closed" — financially closed out.

**Card contents (each):**
- Phase name (Headline) + status dot in the phase accent color.
- Big number: count of projects in phase (Large Title).
- Sub: total budget value in phase (Subhead, secondary label).
- Tiny: count overdue in phase (red Caption, hidden if zero).
- A 3px progress strip showing this phase's share of the total pipeline.

**Phase accent colors** (use these exact roles — they are NOT decorative, they encode state):
| Phase | Accent token | Hex (dark) |
|---|---|---|
| PR on Process | `--accent-gray` | `#8E8E93` |
| PO on Process | `--accent-orange` | `#FF9F0A` |
| PO Created | `--accent-blue` | `#0A84FF` |
| Installation Completed | `--accent-teal` | `#64D2FF` |
| Budget Closed | `--accent-green` | `#30D158` |

Cards lay out as a responsive row (5-up desktop, 2–3-up tablet, horizontal-scroll snap on
narrow). Connect them visually with a thin chevron/arrow rail to read as a *pipeline*, not a grid.

---

## 6. Feature B — Budget & Cost Management

The Project Manager's core. Four budget states per project — **do not conflate them**:

- **Budget** — approved/planned amount.
- **Committed** — value locked by issued POs (sum of PO_CREATED+ stages).
- **Actual** — invoiced / spent to date.
- **Forecast** — projected final cost (actual + remaining committed + estimate-to-complete).

**Components:**
1. **Summary tiles** (4): Total Budget · Committed · Actual · Forecast Variance (Budget −
   Forecast). Variance tile turns red when negative (over budget), green when ≥0.
2. **Budget-vs-Actual bar set**, grouped by project (or by phase via toggle). Each row:
   a track (budget) with committed + actual overlays. Over-budget portion renders in `--accent-red`.
3. **Burn-down / cumulative spend line** over time vs. planned curve. Mark today.
4. **Variance table** (in Section C or its own): per project — Budget, Committed, Actual,
   Forecast, Variance ฿, Variance %. Sort by worst variance default. Conditional color on Variance %.

Number formatting: thousands separators, `฿` prefix, abbreviate ≥1M as `฿1.2M` in tiles,
full figures in tables. Right-align all numerics. Use tabular/monospaced figures.

**Honesty rule for the agent:** never fabricate budget numbers. If a data source is absent,
render skeleton/empty states and a "No data connected" message — do not seed fake values
except in an explicitly labeled `/mock` fixture used only in dev.

---

## 7. Design System — Apple HIG, Dark Mode

### 7.1 Foundations
- **Grid:** 8pt spacing system. Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- **Corners:** continuous/rounded ("squircle" feel). Cards `--radius-card: 20px`;
  tiles `16px`; controls `12px`; pills `999px`. Prefer large, soft radii.
- **Density:** generous whitespace, minimal. One idea per card. No gridlines on tables —
  separate rows with hairline dividers only.
- **Hairlines:** `0.5px solid rgba(255,255,255,0.08)` for separators and card borders.

### 7.2 Color tokens (CSS custom properties) — iOS dark system palette

```css
:root {
  /* Backgrounds (layered, darkest at base) */
  --bg-base:        #000000;   /* app canvas */
  --bg-secondary:   #1C1C1E;   /* elevated surfaces */
  --bg-tertiary:    #2C2C2E;   /* nested surfaces */
  --bg-grouped:     #1C1C1E;

  /* Labels (text) — opacity-based per HIG */
  --label-primary:    rgba(255,255,255,1.00);
  --label-secondary:  rgba(235,235,245,0.60);
  --label-tertiary:   rgba(235,235,245,0.30);
  --label-quaternary: rgba(235,235,245,0.18);

  /* System accents (dark variants) */
  --accent-blue:   #0A84FF;
  --accent-green:  #30D158;
  --accent-red:    #FF453A;
  --accent-orange: #FF9F0A;
  --accent-yellow: #FFD60A;
  --accent-teal:   #64D2FF;
  --accent-indigo: #5E5CE6;
  --accent-purple: #BF5AF2;
  --accent-gray:   #8E8E93;

  /* Semantic */
  --color-positive: var(--accent-green);
  --color-warning:  var(--accent-orange);
  --color-negative: var(--accent-red);

  /* Radii */
  --radius-card: 20px;
  --radius-tile: 16px;
  --radius-ctl:  12px;

  /* Hairline */
  --hairline: 0.5px solid rgba(255,255,255,0.08);
}
```

### 7.3 Typography — SF Pro scale
Font stack: `-apple-system, "SF Pro Text", "SF Pro Display", system-ui, "Inter", sans-serif`.
Enable tabular figures for all numbers: `font-feature-settings: "tnum" 1;`.

| Role | Size / Line | Weight |
|---|---|---|
| Large Title (hero numbers) | 34 / 41 | 700 |
| Title 2 (section headers) | 22 / 28 | 700 |
| Title 3 | 20 / 25 | 600 |
| Headline (card titles) | 17 / 22 | 600 |
| Body | 17 / 22 | 400 |
| Subhead | 15 / 20 | 400 |
| Footnote | 13 / 18 | 400 |
| Caption | 12 / 16 | 400 |

### 7.4 Glass / Material — constrained on purpose
Apple "materials" via translucency + blur. **Allowed only on:** top bar, slide-over drawer,
modals/overlays, and the role switcher. **Forbidden on:** any card body that carries numbers
or text the user must read precisely (budget tiles, variance table, phase counts). Those use
solid `--bg-secondary`. This protects contrast (HIG explicitly warns vibrancy reduces legibility).

```css
.glass {
  background: rgba(28, 28, 30, 0.55);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: var(--hairline);
  /* top inner highlight for the "edge of glass" sheen */
  box-shadow: inset 0 0.5px 0 rgba(255,255,255,0.12),
              0 8px 32px rgba(0,0,0,0.40);
}
/* Fallback when backdrop-filter unsupported: go solid, not transparent */
@supports not (backdrop-filter: blur(1px)) {
  .glass { background: var(--bg-secondary); }
}

.card { /* data-bearing: solid, NOT glass */
  background: var(--bg-secondary);
  border: var(--hairline);
  border-radius: var(--radius-card);
  box-shadow: 0 4px 24px rgba(0,0,0,0.35);
}
```

### 7.5 Motion
Subtle, HIG-spring-like. Card hover: `transform: translateY(-2px)` + shadow lift, 200ms
`cubic-bezier(0.2, 0.8, 0.2, 1)`. Drawer slide: 320ms same easing. Respect
`prefers-reduced-motion: reduce` → disable transforms, keep opacity fades.

---

## 8. Component Inventory (build these)

- `TopBar` (glass) — logo, `RoleSegmentedControl`, `SearchField`, `SyncButton` w/ last-synced time.
- `PhasePipeline` → `PhaseCard` ×5, connected by `PipelineRail`.
- `BudgetSummary` → `BudgetTile` ×4.
- `BudgetBars` (budget vs committed vs actual, grouped) + `BarGroupToggle` (by project / by phase).
- `BurnChart` (cumulative actual vs planned line).
- `ProjectTable` — sortable, filterable, conditional-color variance cells; row click → `ProjectDrawer`.
- `ProjectDrawer` (glass slide-over) — single project detail, phase timeline, cost breakdown.
- `EmptyState`, `Skeleton`, `StatusDot`, `Money` (formatter), `BEDate` (dual-calendar date).

---

## 9. Data Model (TypeScript)

```ts
type Phase =
  | 'PR_ON_PROCESS'
  | 'PO_ON_PROCESS'
  | 'PO_CREATED'
  | 'INSTALL_COMPLETED'
  | 'BUDGET_CLOSED';

type Category = 'PRODUCTION' | 'MAINTENANCE' | 'CAPEX' | 'OTHER';

interface Project {
  id: string;
  name: string;
  category: Category;          // drives Maintenance Engineer filter
  phase: Phase;
  owner: string;
  vendor?: string;
  prNo?: string;
  poNo?: string;
  budget: number;             // approved
  committed: number;          // issued POs
  actual: number;             // invoiced/spent
  forecast: number;           // projected final
  plannedStart: string;       // ISO
  plannedEnd: string;         // ISO  → overdue if now > plannedEnd && phase < INSTALL_COMPLETED
  expectedDelivery?: string;  // ISO  → key for Maintenance Engineer
  updatedAt: string;          // ISO  → staleness
}

// Derived
const variance       = (p: Project) => p.budget - p.forecast;       // <0 = over budget
const variancePct    = (p: Project) => p.budget ? variance(p) / p.budget : 0;
const isOverdue      = (p: Project) =>
  Date.now() > Date.parse(p.plannedEnd) &&
  p.phase !== 'INSTALL_COMPLETED' && p.phase !== 'BUDGET_CLOSED';
```

---

## 10. Tech Stack & Conventions

- **Framework:** React + Vite + TypeScript. (If the repo already uses Next.js, match it.)
- **Styling:** CSS variables above + plain CSS modules or Tailwind mapped to these tokens.
  If Tailwind: extend theme with the token values; do not hardcode hex in components.
- **Charts:** Recharts or lightweight SVG. Keep chart chrome minimal (no heavy gridlines).
- **State:** local + `localStorage` for role/filters. No global store needed in v1.
- **Data:** `src/data/` with a typed `fetchProjects()`; a `/mock` fixture for dev only,
  clearly labeled. Real source wired via env-configurable endpoint.
- **Formatting:** centralize money + BE-date formatting in utils. Never inline-format.
- **Files:** small, single-responsibility components. Co-locate styles. No dead code.

---

## 11. Accessibility & Quality Bar (do not skip)

- Text on data cards must hit **WCAG AA (4.5:1)**. Solid `--bg-secondary` ensures it; verify
  any glass surface that carries text and fall back to solid if it fails.
- Status is **never color-only** — pair every phase color with its label and/or a status dot
  + text. (Color-blind safety, and factory glare safety.)
- Full keyboard nav: role switcher, cards, table rows, drawer all tabbable; visible focus ring
  (`outline: 2px solid var(--accent-blue)`).
- `prefers-reduced-motion` honored. `prefers-color-scheme` may force-light later — for now lock dark.
- All numbers right-aligned, tabular figures, consistent decimal places.

---

## 12. Definition of Done (v1)

- [ ] Role switcher changes default view + filters, persists across reload.
- [ ] 5 phase cards render real counts + phase budget, filter the table on click.
- [ ] Budget section shows Budget/Committed/Actual/Forecast + variance with correct red/green.
- [ ] Variance table sortable, conditional-colored, opens project drawer.
- [ ] Glass confined to chrome/overlays; data cards solid; AA contrast verified.
- [ ] Empty + skeleton + error states exist; no fabricated numbers in production path.
- [ ] Open Questions #1–#4 either resolved or carrying a visible `// TODO(decision)`.
