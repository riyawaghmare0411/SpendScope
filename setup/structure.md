# SpendScope -- File Structure Reference

## Project Root
```
SpendScope/
├── setup/
│   ├── kt.md                          # Knowledge transfer doc (this project's rules + architecture)
│   └── structure.md                    # This file (file reference + changelog)
├── docker-compose.yml                    # pgvector/pgvector:pg16 container config (switched from postgres:16-alpine in Phase 12A -- same Postgres 16 internals, volume reused)
├── src/
│   ├── __init__.py                       # Package init
│   ├── api.py                          # FastAPI backend (914 lines, 26 routes -- verified via `grep -c '^@app\.' src/api.py`; 26 more now live in src/routes/, 52 total) -- auth, transactions, category rules, CSV/PDF upload, coaching stats
│   ├── database.py                     # Async SQLAlchemy engine, sessions, Base
│   ├── models.py                       # 8 models: User, Account, ImportBatch, Transaction, CategoryRule, Budget, CsvTemplate, PlaidItem
│   ├── auth.py                         # JWT + bcrypt auth, FastAPI dependencies, Pydantic schemas
│   ├── routes/                         # Phase 0 (f6386c9): account CRUD + Plaid/webhook routes extracted out of api.py; Wave 2 (a99b4fa) added plan.py
│   │   ├── accounts.py                 # 4 routes -- account CRUD
│   │   ├── plaid.py                    # 6 routes -- link-token, exchange-token, sync, items, webhook
│   │   └── plan.py                     # 374 lines, 16 routes (Wave 2, LP-SVC, a99b4fa) -- /api/plan/* + /api/budgets; full table in HANDOFF.md section 13
│   ├── plan_types.py                   # 174 lines, pure dataclasses, no SQLAlchemy (Phase 0) -- frozen contract for the plan/forecast engine
│   ├── plan_models.py                  # 113 lines, SQLAlchemy ORM (Phase 0) -- 5 new tables: plan_settings, plan_balances, recurring_rules, balance_updates, plan_events
│   ├── plan_service.py                 # 558 lines (Wave 2, LP-SVC, a99b4fa) -- sole ORM <-> plan_types bridge; money-safe JSON conversion via money.py
│   ├── finance.py                      # 201 lines (Wave 1, LP-FIN, 87e8004) -- day-by-day cash forecast engine, pure module
│   ├── cash.py                         # 54 lines (Wave 1, LP-CASH, e2992af) -- multi-currency spendable-cash aggregation, never summed across currencies
│   ├── simulator.py                    # 345 lines (Wave 1, LP-SIM, f6be171) -- debt payoff/lump-sum simulator, fixes 4 real bugs from MoneyMap's own simulator.ts
│   ├── recurrence.py                   # 457 lines (Wave 1, LP-REC, 0738133) -- the one recurring bill/income cadence classifier in the codebase
│   ├── refresh.py                      # 40 lines (Wave 1, LP-CASH, e2992af) -- pure refresh-cooldown/give-up/cached-sync timing
│   ├── embedding_guard.py              # 18 lines, fully implemented (Phase 0) -- guards categorize_local.embed_text against the broken-locally onnxruntime dependency
│   ├── money.py                        # 74 lines (Wave 1, BP-A, 4c5cbb5) -- Decimal money parsing/quantizing/JSON conversion for the plan engine
│   ├── timeutil.py                     # 41 lines (Wave 1, BP-A, 4c5cbb5) -- per-user timezone resolution
│   ├── plaid_privacy.py                # 51 lines (Wave 1, BP-A, 4c5cbb5) -- digit redaction, opaque handles, fixed error copy, server-generated display labels; see HANDOFF.md section 14.1
│   ├── plaid_sync.py                   # 243 lines (Wave 1, BP-SVC, 68863a2) -- Plaid sync orchestration, delegated to by routes/plaid.py
│   ├── plaid_fake.py                   # 108 lines (Wave 1, BP-SVC, 68863a2) -- fixture-driven fake Plaid client for PLAID_ENV=fake testing
│   └── parsers/
│       ├── __init__.py                 # Parser module init
│       ├── csv_parser.py               # Template-based CSV parser with auto-detection
│       ├── pdf_parser.py               # Template-based PDF parser (Lloyds support)
│       ├── redaction_detector.py        # Detects redacted content in bank statements
│       └── templates/                  # 24 bank template JSON files
├── frontend/
│   ├── src/
│   │   ├── App.jsx                     # Main React component (954 lines) -- state, handlers, data pipeline, routing. Wave 3 (uncommitted) wires the 5 plan-engine pages in.
│   │   ├── constants.js                # Shared constants, themes, helpers, formatters, NAV (13 items as of Wave 3 -- see HANDOFF.md section 14.4)
│   │   ├── lib/
│   │   │   ├── crypto.js               # Envelope-encryption client (Phase E)
│   │   │   ├── keyManager.js           # DEK unlock/storage (Phase E)
│   │   │   └── planApi.js              # 62 lines (Wave 1, FE-CORE, c0a1f7f) -- FROZEN JSON CONTRACT client for /api/plan/*, /api/budgets, /api/plaid/sync
│   │   ├── hooks/
│   │   │   └── useAlerts.js            # Derives alert-banner items from accounts + filteredData (Phase 10)
│   │   ├── components/
│   │   │   ├── ui.jsx                  # Reusable UI primitives: Sphere, Counter, SkeletonBlock, HealthRing, VelocityGauge, Tip, PieTip (101 lines)
│   │   │   ├── AuthPages.jsx           # Login + Signup forms (79 lines)
│   │   │   ├── DashboardPage.jsx       # Overview with stats, charts, activity (108 lines)
│   │   │   ├── SpendingPage.jsx        # Spending analysis (46 lines); "Manage budgets" button that routes to BudgetsPage lives in App.jsx ~line 907, not in this file
│   │   │   ├── MerchantsPage.jsx       # Merchant breakdown (33 lines)
│   │   │   ├── TransactionsPage.jsx    # Transaction list with inline editing (80 lines)
│   │   │   ├── CalendarPage.jsx        # Calendar heatmap (199 lines)
│   │   │   ├── InsightsPage.jsx        # Insights and subscriptions (51 lines)
│   │   │   ├── RulesPage.jsx           # Category rules CRUD (197 lines)
│   │   │   ├── UploadPage.jsx          # Upload, import confirmation, column mapper (317 lines)
│   │   │   ├── Sidebar.jsx             # Navigation sidebar (53 lines)
│   │   │   ├── ProfileModal.jsx        # Profile editing modal (80 lines)
│   │   │   ├── TodayPage.jsx           # 98 lines (Wave 1, FE-TODAY, 25798bc) -- safe-to-spend today, risk, recurring confirm/dismiss
│   │   │   ├── FuturePage.jsx          # 175 lines (Wave 1, FE-FUTURE, f6b40c1) -- day-by-day forecast + overspend what-if
│   │   │   ├── SimulatePage.jsx        # 169 lines (Wave 1, FE-SIMULATE, b22977d) -- debt payoff scenario
│   │   │   ├── AccountsPage.jsx        # 276 lines (Wave 1, FE-ACCOUNTS, 2a33d0a) -- every account, grouped/totaled per currency
│   │   │   ├── BudgetsPage.jsx         # 104 lines (Wave 1, FE-BUDGETS, e7a3b66) -- server-hydrated budgets via /api/budgets
│   │   │   ├── DataVisibilityNote.jsx  # 20 lines (Wave 1) -- Plaid-redacted-but-readable vs. upload-encrypted disclosure copy
│   │   │   └── plan/
│   │   │       └── primitives.jsx      # 73 lines (Wave 1) -- shared UI primitives for the 5 plan-engine pages
│   │   ├── App.css                     # Legacy styles (card padding, animations)
│   │   ├── index.css                   # Tailwind CSS import
│   │   └── main.jsx                    # React entry point
│   ├── public/
│   │   ├── demo_data.json              # Fallback demo transactions (used when backend unavailable)
│   │   └── vite.svg                    # Vite logo
│   ├── package.json                    # Dependencies: react, recharts, papaparse, jspdf, tailwindcss
│   ├── vite.config.js                  # Vite config with React + Tailwind plugins
│   ├── eslint.config.js                # ESLint flat config for React
│   ├── index.html                      # HTML entry point
│   ├── vercel.json                     # Vercel SPA config (vite framework, rewrites to index.html)
│   └── README.md                       # Vite template readme
├── notebooks/
│   ├── 01_data_exploration.ipynb       # Initial data analysis
│   ├── 02_intelligence_layer.ipynb     # Analytics and insights generation
│   └── 03_ai_narrator.ipynb            # AI narrative generation
├── data/
│   ├── synthetic/
│   │   ├── demo_transactions.csv       # UK demo data (50+ rows, July 2025)
│   │   └── Banking_Transactions_USA_2023_2024.csv  # US synthetic dataset
│   ├── processed/                      # (gitignored) Parsed transaction JSON
│   └── raw/                            # (gitignored) Uploaded bank PDFs
├── .env                                # Local environment config (gitignored): CORS_ORIGINS, etc.
├── .env.example                        # Template for .env with default values
├── .gitignore                          # Ignores: node_modules, venv, .env, data/raw, data/processed, .claude
├── .dockerignore                       # Excludes frontend, env files, test data, Claude files from Docker build
├── Dockerfile                          # Production Docker image (python:3.13-slim, non-root user, requirements.prod.txt)
├── railway.json                        # Railway deployment config (Dockerfile builder, health check on /health -- moved from / in 08362aa/F-1)
├── README.md                           # Full project documentation (setup, deployment, API reference)
├── requirements.txt                    # 132 Python packages (FastAPI, PyMuPDF, pandas, jupyter, etc.)
├── requirements.prod.txt               # Slim production dependencies (no Jupyter/Windows packages)
└── .claude/
    └── settings.local.json             # Claude Code permission settings
```

## Key Files Detail

### src/api.py
- FastAPI app with CORS middleware
- **Corrected 2026-09-28 (this docs pass):** 914 lines, 26 routes (verified via `grep -c '^@app\.' src/api.py`) -- auth, transactions, import batches, account wipe, CSV/PDF upload (all now auth-required), coaching stats, categorize-local, category rules (auth-required), legacy bulk categorize. Account CRUD (4 routes, Phase 0) and Plaid link/exchange/sync/items + webhook (6 routes, Phase 0) were extracted into `src/routes/accounts.py` and `src/routes/plaid.py`; Wave 2 (`a99b4fa`) added `src/routes/plan.py` (16 routes, `/api/plan/*` + `/api/budgets`) -- **52 routes total across four files**. Full line-by-line table in `HANDOFF.md` section 13.
- PDF parser: state machine for Lloyds bank format (date/description/type/money_in/money_out/balance)
- Reads from `data/processed/transactions_frontend.json`
- Dependencies: fastapi, fitz (PyMuPDF), uvicorn

### frontend/src/App.jsx (post-M6 refactor)
- Core app shell (538 lines) -- state management, handlers, data pipeline, routing
- 20+ useState hooks for state management
- Pages delegated to 11 components in components/
- Features: dark/light mode, CSV upload (PapaParse), PDF upload (via backend), budget tracking, subscription detection, anomaly detection, peer benchmarks, savings tips
- Constants extracted to constants.js (MERCHANT_CATEGORIES, PEER_BENCHMARKS, CAT_COLORS, SAVINGS_TIPS, etc.)
- localStorage persistence: username, budgets, accounts, currency
- API: fetches from http://127.0.0.1:8000, falls back to demo_data.json

### data/synthetic/demo_transactions.csv
- Columns: date, date_iso, description, merchant, type, money_in, money_out, balance, direction, category
- UK merchants: Tesco, TfL, Netflix, Uber, Deliveroo, etc.

### requirements.txt
- Core: fastapi, uvicorn, PyMuPDF, pydantic, python-multipart
- Data: pandas, numpy, openpyxl
- Notebooks: jupyter, jupyterlab, ipython
- 132 total packages (many are transitive jupyter deps)

## External Dependencies
- **Venv**: `D:\Projects\spendscope_venv` (Python 3.13.12, sibling directory)
- **Git remote**: https://github.com/riyawaghmare0411/SpendScope.git
- **node_modules**: Not committed, needs `npm install` in frontend/

---

## Changelog

### 2026-09-28 -- MoneyMap integration Wave 1 + Wave 2 committed, Wave 3 in progress: plan/forecast engine, Plaid privacy engine, 5 new pages, docs pass (commits 4c5cbb5..a99b4fa)
Wave 1 (8 lane commits: BP-A `4c5cbb5`, BP-SVC `68863a2`, BP-ROUTES `3369109`, BP-ACCT `b8414d2`, LP-FIN `87e8004`, LP-REC `0738133`, LP-SIM `f6be171`, LP-CASH `e2992af`, plus frontend lanes FE-CORE `c0a1f7f`, FE-TODAY `25798bc`, FE-FUTURE `f6b40c1`, FE-SIMULATE `b22977d`, FE-ACCOUNTS `2a33d0a`, FE-BUDGETS `e7a3b66`) filled in every Phase-0 skeleton and built new pure modules: `src/finance.py` (day-by-day cash forecast, ported from MoneyMap's `lib/finance.ts`), `src/cash.py` (multi-currency spendable-cash aggregation, never summed across currencies, fixes a MoneyMap bug where a missing `balance_as_of` silently defaulted to 0), `src/simulator.py` (debt payoff/lump-sum simulator, avalanche/snowball/custom, fixes 4 real bugs found in MoneyMap's own `simulator.ts` -- see its module docstring), `src/recurrence.py` (the one recurring bill/income cadence classifier in the codebase; `stats_coach.py`'s detector is now a thin adapter over it), and `src/refresh.py` (pure sync-timing logic). Also built the Plaid privacy engine `src/plaid_privacy.py` (digit redaction, opaque id hashing, fixed error copy, server-generated display labels) implementing Riya's 2026-09-26 decision that Plaid-synced merchant/description text is readable-but-redacted server-side, not end-to-end encrypted like an uploaded row; `src/money.py` (Decimal money parsing/quantizing) and `src/timeutil.py` (per-user timezone resolution); and `src/plaid_fake.py` (fixture-driven fake Plaid client behind `PLAID_ENV=fake`, added because Riya's real Plaid access tier was undecided). Built 5 new frontend pages against a frozen JSON contract before the backend routes existed: `TodayPage.jsx`, `FuturePage.jsx`, `SimulatePage.jsx`, `AccountsPage.jsx`, `BudgetsPage.jsx`, plus shared primitives in `components/plan/primitives.jsx`, a disclosure component `DataVisibilityNote.jsx`, and the `frontend/src/lib/planApi.js` client. Wave 2 (LP-SVC, `a99b4fa`) then built the real backend: `src/routes/plan.py` (374 lines, 16 routes: `/api/plan/today`, `/api/plan/forecast`, `/api/plan/simulate`, `/api/plan/overspend`, `/api/plan/settings` GET+PUT, `/api/plan/recurring` GET+POST and `/api/plan/recurring/{id}` PATCH+DELETE, `/api/plan/events` GET+POST and `/api/plan/events/{id}` PATCH+DELETE, `/api/budgets` GET+PUT) and `src/plan_service.py` (558 lines, the sole ORM-row-to-plan_types bridge). Backend total is now 52 routes across four files (`api.py` 26, `routes/accounts.py` 4, `routes/plaid.py` 6, `routes/plan.py` 16). Wave 3 (uncommitted as of this entry) is wiring the 5 pages into `frontend/src/App.jsx`'s render switch and `constants.js`'s `NAV` array -- `today`/`future`/`simulate`/`accounts` are in the sidebar NAV (13 items total), but `budgets` is not; `BudgetsPage` is reachable only via the "Manage budgets" button on the Spending page. This same commit also updated `HANDOFF.md`, `README.md`, `setup/kt.md` and this file to describe the integration as it actually exists, replacing the Phase-0-only description a previous docs pass (`6c8d738`, DOCS-PASS-1) had left in place. **Nothing in this integration has been tested against a real bank** -- only against `PLAID_ENV=fake` fixtures; the onnxruntime/VC++ blocker on this machine, Riya's real Plaid access tier, and the real-bank PC test are all still outstanding (Riya's own action items). Full detail: `HANDOFF.md` section 14.

### 2026-09-27 -- Phase 0 of the MoneyMap integration: router extraction, plan-engine schema, pure-module skeletons (commit f6386c9)
Foundational, serial step before Wave 1's parallel lanes. Extracted the account CRUD and Plaid/webhook routes out of `src/api.py` into new `src/routes/accounts.py` and `src/routes/plaid.py` (byte-identical bodies, same 36 routes/paths/methods -- verified via before/after route-count grep). Fixed a real bug found during reconciliation: `Account.plaid_account_id` had a stale non-unique index colliding by name with the intended unique index, so there was no real uniqueness enforcement on Plaid account ids -- replaced with a correctly-scoped partial unique index on `(user_id, plaid_account_id)`; also changed `accounts.plaid_item_id`'s FK from `CASCADE` to `SET NULL` so disconnecting a Plaid item keeps the account and its transactions, matching existing UI copy. Added schema for the plan/forecast engine: `users.timezone`; 9 new `Account` columns (`kind`, `counts_as_cash`, `statement_balance`, `minimum_payment`, `next_due_date`, `apr_bps`, `balance_as_of`, `term_months`, `balance_source`); 3 new `Transaction` columns (`plaid_transaction_id` unique-per-user, `pending`, `currency`); `Budget.currency` (budgets had zero server routes and were 100% localStorage-driven -- gap found during reconciliation). New `src/plan_models.py` (5 new tables: `plan_settings`, `plan_balances`, `recurring_rules`, `balance_updates`, `plan_events`) and `src/plan_types.py` (pure dataclasses, no SQLAlchemy) as the frozen contract every pure logic module imports against. New signature-only skeletons for Wave 1 to fill in: `money.py`, `timeutil.py`, `plaid_privacy.py`, `plaid_sync.py`, `plaid_fake.py`. New `src/embedding_guard.py`, fully implemented, wraps `categorize_local.embed_text` so a Plaid sync never 500s just because the local ONNX embedder is unavailable. Wave 1's parallel lanes are in progress in this worktree as of this entry (uncommitted) -- see `HANDOFF.md` section 6 for how to check current state.

### 2026-09-13 -- Lane fixes: FE-CORE, ENC-UI, BE, TESTS-CI, PARSERS (commits 185e300, f885ff3, 08362aa, 1189e60, c6c1c72)
Five parallel-lane commits closing out remaining items from the Phase A-E audit. FE-CORE (`App.jsx`, `UploadPage.jsx`) fixed A-1 (the silent-import error banner was gated behind `!pendingImport` and never rendered during multi-file review) plus E-9/E-10/E-15. ENC-UI (`EncryptionSettings.jsx`, `EditTransactionModal.jsx`, `PlaidConnect.jsx`) fixed E-11/E-3-lite/E-8/A-3/C-1. BE (`api.py`, `auth.py`, `database.py`, `railway.json`) fixed E-7/E-12/F-1/F-2/MISC-1/D-2/CONTRACT-3/RULES-DIRECTION/SIGNUP/DEAD -- F-2 reordered `init_db()` to create the `vector` extension before `metadata.create_all` (previously last, after create_all, in one shared migration list -- this exact ordering bug is what failed CI run `34768509314` at boot with `type "vector" does not exist`) and split every ALTER/CREATE INDEX into its own transaction that logs `[migration] FAILED: <stmt>` and re-raises instead of printing and continuing silently; MISC-1 replaced `@app.on_event("startup")` with a `lifespan` asynccontextmanager; F-1 added `GET /health` (pings the DB via `SELECT 1`) with `railway.json`'s healthcheck now pointed at it instead of `/`. TESTS-CI (`.github/workflows/ci.yml`, `requirements.txt`, `tests/*`) fixed E-14/B-3/ENV-5 and added `tests/test_rules_isolation.py` plus its CI step. PARSERS (`pdf_parser.py`, `redaction_detector.py`) fixed D-5 (deleted the dead, 0-caller `detect_pdf_redactions()`) and D-7 (Lloyds/BofA parsers now return dropped-row counts + warnings instead of silently coercing bad dates/amounts to 0; a recognized bank whose parser finds zero rows now reports `reason: "parsed_empty"` instead of `"parsed"` -- this is where `parsed_empty` was actually introduced, not Phase D's `630141b`, verified via `git log -S"parsed_empty" -- src/parsers/pdf_parser.py`).

### 2026-09-13 -- Phase E: envelope encryption, Option A (commit 34131e9, checkpoint with known gaps)
Rebuilt encryption as envelope encryption: a random per-user DEK encrypts `merchant` + `description` only (Option A); the DEK is wrapped once under a password-derived KEK and once per recovery code, so any valid password or recovery code unwraps the same DEK (`frontend/src/lib/crypto.js`, `keyManager.js`). Added `User.wrapped_dek` (versioned JSON payloads via `PAYLOAD_VERSION`/`ENCRYPTED_FIELDS`); `recovery_codes_hash` is deprecated in place, not dropped. Known gaps tracked in `HANDOFF.md` section 10 and the plan file's Phase E section (no server-side recovery verification yet, Plaid writes plaintext for encrypted users, legacy salt-only accounts have no migration path).

### 2026-07-23 -- Phase D (parsers): honest PDF failure modes (commit 630141b)
`src/parsers/pdf_parser.py` now returns a distinct `reason` (`parsed`, `no_parser`, `scanned`, `unknown_bank`, `open_error`) instead of silently returning zero transactions for a recognized-but-unsupported bank or a scanned/image-only PDF. `parser_map` still only implements Lloyds and Bank of America -- CSV (24 templates) remains the universal path; PDF is a convenience for those two banks only. (`parsed_empty` was added later, by the PARSERS lane commit `c6c1c72` -- see the 2026-09-13 entry below.)

### 2026-07-23 -- Phase C: authenticate endpoints + rules migration (commit 1da9c02)
Added auth (`Depends(get_current_user)`) to the category-rules CRUD endpoints, the three upload endpoints, and `/api/categorize`. Migrated category rules from a shared `data/processed/category_rules.json` file to the `category_rules` DB table, scoped by `user_id`, and added a `direction` column. Rules page rebuilt as a user-scoped list/edit/delete view backed by the new endpoints.

### 2026-07-22 -- Phase A+B: stop data-loss bugs, add test + CI safety net (commit 0f0e24a)
Removed the unconditional encryption auto-enable on signup, removed the `categorizeWithRules` "Apply Rules to All Transactions" destructive button (kept the underlying stub -- 6 other call sites depend on it), and added `r.ok`/401 handling so an expired session fails loudly instead of silently leaving an import as "Other". Moved the throwaway `_test_*.py` scripts into tracked `tests/`, made them `sys.exit(1)` on failure, and added `.github/workflows/ci.yml`.

### 2026-07-15 -- Phase 21 + 22 + 23: calendar timezone, rule shape, edit-save refresh (commit 0a688bd)
Phase 21: `CalendarPage.jsx`'s forward-arrow used `toISOString().slice(0,7)`, which crossed a UTC day boundary in positive-offset timezones and froze the arrow; fixed with integer year/month math. Phase 22: a category rule with an empty `match_value` matched every merchant (`_match_rule` defaulted to `contains ""`), so one corrupted rule branded an entire dataset; fixed by treating empty `match_value` as no-match. Phase 23: `TransactionsPage`'s save handler mutated local state but never refreshed from the server, so edits appeared to revert; it now calls `refreshTransactions()` after saving.

### 2026-05-18 -- Phase 16-20: multi-file upload, AccountsListPanel, session-expired handlers, sticky-header fix (commit 9dd36b4)
Phase 16: 401-on-expired-JWT handling added to Coach and Wipe actions. Phase 17: multi-file upload rewritten around a `pendingImports` array (was single `pendingImport`), with a new `AccountsListPanel.jsx` (202 lines) for rename/delete/open. Phase 18: fixed same-bank multi-file imports silently merging into one account, and AccountsListPanel "Open" routing to an empty Transactions view. Phase 19: same 401-handling pattern applied to AccountsListPanel actions. Phase 20: fixed a sticky-header/first-row overlap in the review modal caused by a hex-alpha background.

### 2026-04-28 -- Phase 14A-14E: production polish (commits 0348713, 4c56617, 1a90a9d, a6c1976, 548463a)
14A: fixed `ALL_CATEGORIES` dropdown (was hardcoded and missing 9 of 30 categories; now derived from `CAT_COLORS`). 14B: rewrote Calendar as daily-spend cells colored by percent of daily allowance, with subscription-due dots overlaid. 14C: moved the cash-flow forecast chart above the fold. 14D: rebuilt Coach as a ranked action tracker instead of a stats dashboard. 14E: added Rules-page UX (explainer, worked example, rule preview) -- Riya later said this made the page feel more complex, and it was effectively superseded by Phase C's simpler rebuild.

### 2026-04-27 -- Phase 13: production deploy hardening (commits 761c203, 1cf6d24, 1665720)
Hardened the Dockerfile for production (model baked in at build, `libgomp1` for ONNX runtime), switched the Railway Postgres image to `pgvector/pgvector:pg16`, and backfilled the Phase 7 (`users.encryption_salt`/`recovery_codes_hash`, `transactions.encrypted_data`) + Phase 9 (`import_batches.plaid_item_id`) `ALTER TABLE` statements into the startup migration block that earlier deploys had missed (verified via `git show 1cf6d24` -- Phase 10/12's own ALTERs were already present from their own commits).

### 2026-04-27 -- Phase 11 + Phase 12: Editable Transactions + Local Vector Categorization + Stats Coach (commit d8f33ea)
- **Phase 11 -- Editable Transactions**
- Backend (src/api.py): PATCH /api/transactions/{id} now accepts any subset of {category, direction, amount, merchant, description} (was /category only). New POST /api/transactions/batch-update for "apply to all matching merchants". New helper `_apply_txn_patch()` shared between single PATCH and batch-update
- Frontend NEW: frontend/src/components/EditTransactionModal.jsx (direction toggle IN/OUT, category dropdown, merchant rename, amount edit, "apply to all matching merchants" checkbox)
- Frontend MODIFIED: TransactionsPage.jsx -- click any row opens EditTransactionModal (was inline-only category dropdown)
- Bug fix: previous inline category edit only updated React state + localStorage, never called the backend. Now persists via PATCH
- **Phase 12 -- Privacy: Local Vector Categorization + Stats Coach (replaces Claude)**
- Database: docker-compose.yml switched from `postgres:16-alpine` to `pgvector/pgvector:pg16` (same Postgres 16, volume preserved). Added `embedding vector(384)` column on transactions + HNSW index. Idempotent ALTER TABLE block in src/database.py runs on startup
- Backend NEW: src/categorize_local.py (lazy fastembed singleton with `BAAI/bge-small-en-v1.5`, 384-dim ONNX, ~80MB; embed_text, embed_many, categorize_by_neighbors using cosine distance via pgvector `<=>`. Direction-aware. Only learns from `category_source='manual'` rows)
- Backend NEW: src/starter_rules.py (~80 UK + US merchant keyword rules: Tesco, Wingstop, Spotify, Walmart, Starbucks, etc. OUT-direction only -- IN merchants default to Income)
- Backend NEW endpoint: POST /api/categorize-local (4-tier walk: user JSON rules -> vector KNN -> starter pack OUT-only -> Income/Other fallback)
- Backend MODIFIED: /api/transactions/import batch-embeds merchant strings before insert; `_apply_txn_patch` re-embeds when merchant changes (every Phase 11 manual edit teaches the matcher)
- Backend NEW: src/stats_coach.py (deterministic financial summary: savings rate, monthly avg in/out, top categories, top merchants this month, projected EOM, daily allowance, week-over-week change, encouragement message. Pure Python, no LLM. ~20ms for 10k txns)
- Backend NEW endpoint: GET /api/coaching/stats (replaces 3 Claude endpoints: /coaching/plan, /plan-stream, /plan-cached)
- Frontend MODIFIED: CoachPage.jsx rewritten as glassmorphism stats display (hero card with savings rate %, 3 stat cards in/out/projected EOM, this-month detail with weekly change pill, Recharts horizontal BarChart of top categories, top merchants list. No streaming, no orb, no LLM)
- Frontend MODIFIED: `aiCategorizeAndImport` -> `localCategorizeAndImport` (hits /api/categorize-local with auth headers; was unauthenticated /api/categorize-ai)
- DELETED: src/ai_coach.py (501 lines). Removed `ANTHROPIC_API_KEY`/`ANTHROPIC_MODEL` from .env + .env.example. Removed `_coach_cache`, `COACH_CACHE_TTL`, `StreamingResponse` import, `_time` import from api.py
- Dependencies: added `fastembed==0.7.4` and `pgvector==0.4.1` to requirements.prod.txt. httpx package stays for Plaid only

### 2026-04-27 -- Phase 10: Multi-Card Unified Dashboard + Data Wipe (commit 904cb75)
- Backend (src/api.py): new endpoints POST /api/account/wipe-data (hard-deletes transactions/batches/accounts/rules/budgets/plaid_items for current user; user row + auth preserved), GET /api/accounts (list with balance/utilization/due_day/tx count), POST /api/accounts (manual non-Plaid create), PATCH /api/accounts/{id} (update name/due_day/credit_limit; Plaid fields locked when Plaid-linked), DELETE /api/accounts/{id} (non-Plaid only; Plaid-linked must use Disconnect)
- Backend (src/api.py): `_sync_plaid_item` refactored to create one Account row per Plaid account_id (was one-per-Item). Each Plaid account gets its own ImportBatch + Account with mask/subtype/balances/credit_limit refreshed each sync. GET /api/transactions response now includes account_id
- Backend models (src/models.py): added 9 columns to Account (plaid_account_id, plaid_item_id FK to plaid_items ON DELETE CASCADE, mask, subtype, credit_limit, current_balance, available_balance, due_day, last_synced_at). PlaidItem.accounts back-populates
- Backend DB migration (src/database.py): idempotent ALTER TABLE block runs after metadata.create_all on every startup (ADD COLUMN IF NOT EXISTS, Postgres 9.6+)
- Frontend NEW: frontend/src/components/AccountCardsRow.jsx (horizontal scrolling glass tile per Account: mask, balance, credit utilization bar with green/amber/red thresholds at 50%/80%, due-date countdown, click-to-filter, "+ Add Card" tile, edit-due-day button)
- Frontend NEW: frontend/src/components/RemainingMonthWidget.jsx ("X left this month", projected EOM, daily allowance, spend bar; reads filteredData)
- Frontend NEW: frontend/src/components/AlertBanner.jsx (dismissible glass-pill banners; per-day dismissal via localStorage key spendscope_dismissed_alerts)
- Frontend NEW: frontend/src/hooks/useAlerts.js (derives alerts from accounts + filteredData; three sources: credit utilization >= 80%, due in <= 7 days, on-pace overspend)
- Frontend MODIFIED: App.jsx (new refreshAccounts() hydrates from /api/accounts on auth + after import + after Plaid sync; replaces localStorage as source of truth, still writes localStorage for legacy; new handleWipeData callback; filteredData now matches by account_id OR _account name)
- Frontend MODIFIED: DashboardPage.jsx (AlertBanner + AccountCardsRow + RemainingMonthWidget at top), ProfileModal.jsx (Danger Zone with two-step "type WIPE" confirmation), UploadPage.jsx (onPlaidSync calls both refreshTransactions + refreshAccounts)

### 2026-03-30 -- Milestone 6: Component Refactor
- Split App.jsx from 1524 lines to 538 lines (65% reduction), zero functionality changes
- Created constants.js (165 lines): all shared constants, themes, helpers, formatters extracted from App.jsx
- Created components/ui.jsx (98 lines): reusable UI primitives (Sphere, Counter, SkeletonBlock, HealthRing, VelocityGauge, Tip, PieTip)
- Created 11 page/layout components in components/: AuthPages, DashboardPage, SpendingPage, MerchantsPage, TransactionsPage, CalendarPage, InsightsPage, RulesPage, UploadPage, Sidebar, ProfileModal
- App.jsx now contains only: state management, handlers, data pipeline, routing
- vite build passes cleanly, identical behavior confirmed

### 2026-03-29 -- Milestone 5: Cloud Deployment
- Dockerfile: production image using python:3.13-slim, non-root user, installs from requirements.prod.txt
- requirements.prod.txt: slim production dependencies (excludes Jupyter, Windows-only packages)
- .dockerignore: excludes frontend/, .env, test data, .claude/ from Docker build context
- railway.json: Railway deployment config (Dockerfile builder, health check on /)
- frontend/vercel.json: Vercel SPA config (vite framework, rewrites all routes to index.html)
- README.md: full project documentation with local setup, Docker usage, deployment instructions, API reference
- Deployment architecture: Backend on Railway (auto-detects Dockerfile, PostgreSQL plugin), Frontend on Vercel (VITE_API_URL env var points to Railway backend)
- Docker image tested and verified: builds, runs, signup/login works through container
- Bug fix (M4 testing): pinned bcrypt==4.0.1 in both requirements files (bcrypt 5.0.0 incompatible with passlib 1.7.4)

### 2026-03-29 -- Milestone 4: PostgreSQL + User Authentication
- Docker: PostgreSQL 16-alpine via docker-compose.yml
- Database: 7 SQLAlchemy models (users, accounts, import_batches, transactions, category_rules, budgets, csv_templates)
- Auth: JWT tokens + bcrypt password hashing, signup/login/profile endpoints
- Auth gate: frontend shows Login/Signup page when not authenticated
- Import to DB: confirmed transactions saved to PostgreSQL with import batch tracking
- Import batches: view history, delete batches (cascades to transactions)
- Inline category edit: PATCH endpoint saves to DB when authenticated
- Backward compatible: unauthenticated mode still works with JSON files
- Frontend: Login form, Signup form (with country/currency), Profile update, Logout button
- New API endpoints: /api/auth/signup, /api/auth/login, GET/PUT /api/auth/me, POST /api/transactions/import, PATCH /api/transactions/{id}/category, GET/DELETE /api/import-batches

### 2026-03-29 -- Milestone 3: Editable Transaction Categories
- Inline category editing: click any category badge on Transactions page to change it via dropdown
- Learned rules: corrections auto-saved to localStorage, applied to future imports
- categorizeWithRules() replaces categorizeByMerchant() -- checks learned rules, then bulk rules, then defaults
- New Rules page (nav item): Add/edit/delete bulk rules (contains/starts_with/exact/regex), view learned rules
- Actions: Apply Rules to All Transactions, Export/Import rules as JSON
- Backend: 5 new API endpoints (GET/POST/PUT/DELETE /api/category-rules, POST /api/categorize)
- Category rules stored in data/processed/category_rules.json (pre-database)
- localStorage keys: spendscope_learned_rules, spendscope_bulk_rules

### 2026-03-29 -- Milestone 2: Universal Bank Statement Parser
- Created src/parsers/ module with template-based CSV and PDF parsing
- 24 bank templates: UK (Lloyds, Barclays, HSBC, Monzo, Revolut, Starling, NatWest), US (Chase, BofA, Wells Fargo, Citi, Capital One, Amex, Discover, US Generic), India (SBI, HDFC, ICICI, Axis, Kotak), Georgia (TBC Bank, Bank of Georgia), Global (Wise, N26)
- Auto-detection: matches CSV headers against template patterns
- Column Mapper UI: for unrecognized CSVs, user maps columns manually
- Import Confirmation page: editable table for reviewing/correcting transactions before import
- Redaction detector: flags incomplete/redacted transactions
- Updated API: POST /api/upload-csv (replaces /api/upload), POST /api/upload-csv-mapped, updated POST /api/upload-pdf
- Frontend handleFileUpload updated to use new API flow

### 2026-03-29 -- Milestone 1: Audit and Bug Fixes
- Fixed: data/processed/ auto-created on backend startup (api.py)
- Fixed: Hardcoded API URL in App.jsx -> configurable via VITE_API_URL env var
- Fixed: Frontend checks Array.isArray() before setting transaction data (prevents error object being treated as data)
- Fixed: CORS origins parameterized via CORS_ORIGINS env var
- Added: .env and .env.example configuration files
- Added: API_BASE constant in App.jsx using import.meta.env.VITE_API_URL
- Verified: All 7 frontend pages render correctly with demo data, no console errors

### 2026-03-29 -- Milestone 0: Documentation
- Created `setup/kt.md` -- project knowledge transfer document
- Created `setup/structure.md` -- this file reference
