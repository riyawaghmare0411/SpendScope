# SpendScope -- Session Handoff

This document is for a fresh Claude Code session picking up SpendScope. The previous session ran out of context after Phase 23. Everything you need to continue is below. Read this end-to-end before doing anything else.

---

## 1. Project Overview

**SpendScope** is a commercial-grade personal finance dashboard. The user (Riya) is building it as a portfolio product with eventual SaaS ambitions. Privacy-first by design: raw bank statements are parsed in-browser (CSV) or on-server (PDF) but never persisted; only confirmed transactions land in Postgres. All AI / categorization runs locally on the server (fastembed + pgvector) -- there are zero outbound calls to OpenAI, Anthropic, or any third-party LLM.

**User profile:**
- Name: Riya Waghmare (`happyhogan123@gmail.com` for testing, `happyh221100@gmail.com` is her personal address)
- UK-based, default currency GBP, but app must support USD / EUR / INR / JPY / CNY / AUD / CAD too
- Self-describes as a "noob" -- prefers small, surgical changes with explanation. Hates scope creep. Wants the assistant to ASK before doing.
- Currency symbol auto-detected from the user's `currency` field at signup AND from currency columns in imported CSVs.

**URLs:**

| Surface | URL | State |
|---|---|---|
| Local backend | http://127.0.0.1:8000 | down between sessions, started by `uvicorn` |
| Local frontend (Vite) | http://127.0.0.1:5173 | down between sessions, started by `npm run dev` |
| Local Postgres | localhost:5432 | runs in Docker container `spendscope_db` |
| Production backend | https://web-production-c1480.up.railway.app | likely **asleep** (Railway hobby tier pauses inactive services) |
| Production frontend | https://frontend-neon-seven-62.vercel.app | always up (Vercel static SPA) but points at sleeping backend |
| GitHub | https://github.com/riyawaghmare0411/SpendScope.git | source of truth, auto-deploys both Railway + Vercel |

**Investment context:** none mentioned in current session. The user is exploring whether to keep on Railway ($5/mo) or migrate to a self-hosted Hetzner + Coolify setup. No decision yet.

---

## 2. Tech Stack

### Backend (Python 3.13)
- **FastAPI** 0.135 + Uvicorn 0.42, async throughout
- **SQLAlchemy 2** async + **asyncpg** driver for Postgres
- **Postgres 16** running in Docker via `pgvector/pgvector:pg16` image (Phase 12A switched from `postgres:16-alpine`). Volume named `focused-knuth_pgdata` -- DO NOT delete it, that's Riya's only test data.
- **pgvector** extension for similarity search (KNN categorization)
- **fastembed** 0.7.4 -- BAAI/bge-small-en-v1.5 ONNX model, 384-dim English embeddings, ~80MB. Lazy singleton in `src/categorize_local.py`.
- **PyMuPDF (fitz)** 1.27 -- PDF parsing
- **plaid-python** SDK for bank sync (opt-in, Phase 9)
- **JWT (python-jose) + bcrypt 4.0.1** (pinned -- bcrypt 5 breaks passlib 1.7.4)
- **Fernet** (cryptography lib) for encrypting Plaid access tokens at rest

### Frontend
- **React 19** + **Vite 7**
- **Tailwind CSS 4**
- **Recharts 3.8** for all charts
- **PapaParse 5.5** for client-side CSV parsing
- **jsPDF 4.2** for dashboard PDF export

### Auth
- JWT access token, **60-min expiry** (`JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60` in `.env`)
- HS256 signing, secret in `JWT_SECRET`
- bcrypt password hash
- No third-party identity providers (no Google/GitHub OAuth wired up, even though placeholders exist in `.env.example`)
- Token stored in `localStorage` as `spendscope_token`

### Categorization Pipeline (Phase 12, no LLM)
4-tier walk in `/api/categorize-local`:
1. User's custom JSON rules (`category_rules` table, was previously `data/processed/category_rules.json`)
2. Vector KNN via pgvector `<=>` cosine distance, filtered to `category_source='manual'` only (so it can't amplify its own mistakes)
3. Starter pack in `src/starter_rules.py` (~80 UK + US merchant keywords, OUT-direction only)
4. Fallback: Income for IN-direction, Other for OUT

### Deploy
- **Railway** (backend, Dockerfile builder, Postgres plugin). Auto-deploys from `master` push.
- **Vercel** (frontend SPA). Auto-deploys from `master`. `VITE_API_URL` env var points at Railway URL.
- Container image: `pgvector/pgvector:pg16` for local, Railway uses a managed Postgres with the pgvector extension installed.

---

## 3. Repository Layout

Worktree root: `D:\Projects\SpendScope\.claude\worktrees\focused-knuth\`

```
focused-knuth/
├── HANDOFF.md                              # THIS FILE
├── .github/
│   └── workflows/
│       └── ci.yml                          # CI: postgres service + tests/test_*.py + frontend lint/build
├── Dockerfile                              # python:3.13-slim, non-root, bakes fastembed model at build
├── docker-compose.yml                      # pgvector/pgvector:pg16, port 5432, named volume pgdata
├── railway.json                            # Railway deploy config (Dockerfile builder, health check /)
├── requirements.txt                        # 116 packages (incl. Jupyter for notebooks)
├── requirements.prod.txt                   # slim, includes fastembed + pgvector + plaid-python
├── .env.example                            # template, sanitized
├── .env                                    # local secrets (gitignored)
├── README.md                               # public docs
├── tests/                                  # E2E scripts, tracked in git and run by CI (.github/workflows/ci.yml)
│   ├── test_wipe.py                        # E2E: signup -> wipe-data -> verify
│   ├── test_multi_upload.py                # E2E: multi-file upload (Phase 17)
│   ├── test_same_bank_dedup.py             # E2E: Phase 18 -- 3 Lloyds files -> 3 accounts not 1
│   ├── test_edit_persist.py                # E2E: PATCH category -> survives refresh (Phase 23)
│   └── test_cat_check.py                   # E2E: starter-rule sanity
├── _backend.log / _backend.err.log         # uvicorn stdout/stderr when run in background
├── _frontend.log                           # Vite stdout when run in background
├── setup/
│   ├── kt.md                               # project knowledge transfer (rules + architecture + design decisions 1-16)
│   └── structure.md                        # file reference + changelog (updated phase-by-phase)
├── src/
│   ├── api.py                              # 1225 lines, ~37 endpoints, all FastAPI routes
│   ├── auth.py                             # 100 lines, JWT issue/verify + bcrypt
│   ├── database.py                         # 59 lines, async engine + idempotent ALTER TABLE migration block
│   ├── models.py                           # 186 lines, 9 SQLAlchemy models (User, Account, ImportBatch, Transaction, CategoryRule, Budget, CsvTemplate, PlaidItem)
│   ├── categorize_local.py                 # 124 lines, fastembed singleton + KNN search
│   ├── starter_rules.py                    # 123 lines, ~80 merchant keyword rules
│   ├── stats_coach.py                      # 351 lines, deterministic financial summary + generate_action_plan
│   ├── plaid_service.py                    # 334 lines, Plaid client + Fernet token crypto + transactions/sync cursor
│   └── parsers/
│       ├── csv_parser.py                   # template-based CSV with auto-detection
│       ├── pdf_parser.py                   # template-based PDF (Lloyds works best)
│       ├── redaction_detector.py           # flags incomplete rows
│       └── templates/                      # 24 bank template JSON files
├── frontend/
│   ├── package.json                        # react 19, recharts 3.8, papaparse, jspdf, tailwind 4
│   ├── vite.config.js                      # react + tailwind plugin
│   ├── vercel.json                         # SPA rewrites to index.html
│   └── src/
│       ├── App.jsx                         # 767 lines, main orchestration, useState x20+, routing, all handlers
│       ├── constants.js                    # themes, CAT_COLORS, PEER_BENCHMARKS, MERCHANT_CATEGORIES, fmt helpers
│       ├── main.jsx                        # React entry
│       └── components/
│           ├── ui.jsx                      # primitives: Sphere, Counter, SkeletonBlock, HealthRing, VelocityGauge, Tip, PieTip
│           ├── AuthPages.jsx               # Login + Signup forms
│           ├── Sidebar.jsx                 # nav + account dropdown
│           ├── DashboardPage.jsx           # AlertBanner -> AccountCardsRow -> RemainingMonthWidget -> stats -> Cash Flow -> charts -> Recent
│           ├── SpendingPage.jsx            # category breakdown + budgets
│           ├── MerchantsPage.jsx           # top merchants
│           ├── TransactionsPage.jsx        # 80 lines, clickable rows -> EditTransactionModal
│           ├── EditTransactionModal.jsx    # 184 lines, full-row edit: direction, category, merchant, amount, "apply to all"
│           ├── CalendarPage.jsx            # 199 lines, daily spend cells (green/amber/red) + subscription dots + click-day drill-down
│           ├── InsightsPage.jsx            # anomalies, subscriptions, savings tips, peer comparison
│           ├── CoachPage.jsx               # 277 lines, deterministic action tracker with mark-done (Phase 14D)
│           ├── RulesPage.jsx               # 229 lines, custom + learned rules CRUD (Phase 14E added explainer/examples/preview)
│           ├── UploadPage.jsx              # 297 lines, multi-file upload + per-file review (Phase 17)
│           ├── AccountCardsRow.jsx         # horizontal scrolling tile per account, util bar, due-date countdown
│           ├── AccountsListPanel.jsx       # 202 lines, rename / delete / open account (Phase 17)
│           ├── RemainingMonthWidget.jsx    # X left this month + projected EOM + daily allowance
│           ├── AlertBanner.jsx             # dismissible glass-pill banners
│           ├── PlaidConnect.jsx            # 237 lines, link button + connected items list
│           └── ProfileModal.jsx            # 80 lines, profile edit + Danger Zone "WIPE" two-step
├── data/
│   ├── synthetic/
│   │   ├── demo_transactions.csv           # UK demo, July 2025
│   │   └── Banking_Transactions_USA_2023_2024.csv
│   ├── processed/                          # gitignored, parsed transaction JSON if any
│   └── raw/                                # gitignored, uploaded PDFs
└── notebooks/
    ├── 01_data_exploration.ipynb
    ├── 02_intelligence_layer.ipynb
    └── 03_ai_narrator.ipynb
```

Note: `Procfile` was mentioned in the changelog but **does not exist** in the worktree; `railway.json` uses Dockerfile builder so a Procfile is unnecessary.

---

## 4. Environment Setup

### Paths (verbatim)
- Worktree: `D:\Projects\SpendScope\.claude\worktrees\focused-knuth`
- Branch: `claude/focused-knuth`
- Python venv: `D:\Projects\spendscope_venv\` (sibling, NOT inside project)
- venv python.exe: `D:\Projects\spendscope_venv\Scripts\python.exe`
- venv activate (Git Bash): `source /d/Projects/spendscope_venv/Scripts/activate`
- venv activate (PowerShell): `& D:\Projects\spendscope_venv\Scripts\Activate.ps1`

### Starting each layer (from-cold cookbook)

```bash
# 0. Verify Docker daemon is up
docker ps
# If "failed to connect": launch Docker Desktop
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# wait 30-60s, retry docker ps until it lists something

# 1. Postgres (with pgvector)
cd /d/Projects/SpendScope/.claude/worktrees/focused-knuth
docker compose up -d
# Container name: spendscope_db, port 5432
# Verify: docker exec spendscope_db pg_isready -U spendscope
# Expected: /var/run/postgresql:5432 - accepting connections

# 2. Backend (uvicorn)
/d/Projects/spendscope_venv/Scripts/python.exe -m uvicorn src.api:app --reload --port 8000
# First start with fastembed cold cache: ~30s extra to download the model
# Subsequent starts: ~5s. Watch for "Application startup complete."

# 3. Frontend (Vite)
cd frontend
npm install   # only first time after a fresh clone
npm run dev
# Watch for "Local: http://localhost:5173/"
```

### Health checks

```bash
# Backend health
curl http://127.0.0.1:8000/
# Expected: {"status":"SpendScope API is running"}

# Auth-protected route returns 401 without token (good)
curl -X POST http://127.0.0.1:8000/api/categorize-local
# Expected: {"detail":"Not authenticated"}  HTTP 401

# Route count
curl -s http://127.0.0.1:8000/openapi.json | python -c "import json,sys; print(len(json.load(sys.stdin)['paths']))"
# Expected: ~37 paths

# Postgres pgvector extension live
docker exec spendscope_db psql -U spendscope -d spendscope -c "SELECT * FROM pg_extension WHERE extname='vector';"
# Expected: one row, extname=vector

# Frontend bundle
curl http://127.0.0.1:5173/
# Expected: 200, HTML containing <script type="module" src="/src/main.jsx"
```

### `.env` (local, sanitized)

```
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
API_HOST=127.0.0.1
API_PORT=8000
DATABASE_URL=postgresql+asyncpg://spendscope:spendscope_dev@localhost:5432/spendscope
JWT_SECRET=<random hex string, in .env>
JWT_ALGORITHM=HS256
JWT_ACCESS_TOKEN_EXPIRE_MINUTES=60
PLAID_CLIENT_ID=<sandbox client id, in .env>
PLAID_SECRET=<sandbox secret, in .env>
PLAID_ENV=sandbox
PLAID_WEBHOOK_URL=
PLAID_TOKEN_ENCRYPTION_KEY=<Fernet key in .env -- generated via python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())">
```

Production (Railway env vars):
- `DATABASE_URL` -- managed Postgres URL (set by Railway plugin)
- `JWT_SECRET` -- different from local
- `CORS_ORIGINS=https://frontend-neon-seven-62.vercel.app`
- `PLAID_*` -- same sandbox creds as local for now
- `FASTEMBED_CACHE_DIR=/app/.cache/fastembed` -- model is baked in the Docker image at build, offline mode

Vercel env vars:
- `VITE_API_URL=https://web-production-c1480.up.railway.app`

---

## 5. Full Phase History

All phases are pulled from `C:\Users\riyaw\.claude\plans\robust-scribbling-bengio.md`. Phases 1-6 = milestones M0-M6. Phase 7+ = post-deploy iteration.

### Phase 7 -- Zero-knowledge encryption (opt-in)
- Shipped: yes (commit pre-Phase 8). Adds `encryption_salt`, `recovery_codes_hash` to User; `encrypted_data` JSON blob on Transaction.
- Client-side Web Crypto API derives a key from the user's password + salt. Server stores ciphertext blobs; the plaintext `category` column is also kept for stats. **The decrypt path is in `App.jsx::refreshTransactions` lines 146-163.**
- Most users are NOT in encryption mode (it's opt-in). Riya never set it up on her test account.

### Phase 8.x -- AI Coach + AI Categorization (LATER REMOVED)
- Phase 8.5 / 8.6 / 8.7: Anthropic-powered AI coach (streaming) + AI categorization (Claude). Glassmorphism UI overhaul.
- All this was removed in Phase 12 -- the codebase contains no `src/ai_coach.py` and no `ANTHROPIC_API_KEY` references.

### Phase 9 -- Plaid Bank Sync
- Commits: `05feb45`, `bc6f540` (fix for double script-load)
- `src/plaid_service.py` -- token exchange, `/transactions/sync` cursor pagination, ES256 webhook signature verify
- Fernet encrypts access tokens at rest. Model: `PlaidItem` (one per institution) -> `Account` (one per Plaid `account_id`)
- Sandbox-only. UK + US institutions tested.
- Files: `src/plaid_service.py`, frontend `PlaidConnect.jsx`

### Phase 10 -- Multi-card unified Dashboard + Data Wipe (shipped, `904cb75`, `aa450d2`)
- Multi-card row at top of Dashboard (one tile per Account). AlertBanner. RemainingMonthWidget. ProfileModal Danger Zone with two-step "type WIPE" confirmation.
- `_sync_plaid_item` refactored to create one Account per `plaid_account_id` (was one-per-Item) -- this is design decision #7 in `setup/kt.md`.
- Added 9 columns to `Account` (mask, subtype, balances, due_day, credit_limit, last_synced_at, plaid_account_id, plaid_item_id FK with CASCADE)
- `src/database.py` runs an idempotent `ALTER TABLE ADD COLUMN IF NOT EXISTS` block on every startup -- avoids Alembic for additive schema changes.

### Phase 11 -- Editable Transactions (shipped, `d8f33ea`)
- `EditTransactionModal.jsx` -- click any transaction row to open. Edit direction, category, merchant, amount; checkbox to apply same change to all matching merchants.
- Backend: PATCH `/api/transactions/{id}` accepts subset of {category, direction, amount, merchant, description}. POST `/api/transactions/batch-update` for the apply-all path.
- `_apply_txn_patch()` helper shared between single PATCH and batch endpoints.
- **Bug it fixed:** old inline category dropdown only mutated React state + localStorage and never called the backend.

### Phase 12 -- Full Claude removal + Local KNN categorization (shipped, `d8f33ea`)
- Deleted `src/ai_coach.py` (501 lines). Removed `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `_coach_cache`, `COACH_CACHE_TTL`, `StreamingResponse` from api.py.
- `src/categorize_local.py` -- fastembed singleton (`BAAI/bge-small-en-v1.5`, 384-dim), `categorize_by_neighbors` with cosine via `<=>`. Direction-aware. Learns only from `category_source='manual'` rows (design decision #11).
- `src/starter_rules.py` -- ~80 UK + US merchant keywords. OUT-only (design decision #13).
- `src/stats_coach.py` -- deterministic financial summary, no LLM, ~20ms for 10k txns.
- Docker image swapped to `pgvector/pgvector:pg16`. `embedding vector(384)` column + HNSW index added.
- `/api/categorize-local` -- 4-tier walk (custom rules -> KNN -> starter -> Income/Other fallback).
- `/api/coaching/stats` -- replaces 3 old Claude endpoints.

### Phase 13 -- Production Deploy (shipped, `761c203`, `1cf6d24`, `1665720`)
- Hardened Dockerfile -- model baked into image at build (offline mode), `libgomp1` added for ONNX runtime.
- Railway: switched DB image to pgvector. Backfilled Phase 7+9+10+12 ALTER TABLEs into the startup migration block (Phase 13 follow-up commit `1cf6d24`).
- Vercel: GitHub App linked, root dir set to `frontend`, `VITE_API_URL` configured.
- Tags: `v0.13-deployed` = live anchor, `v0.12-pre-deploy` = rollback anchor.

### Phase 14 -- Production Polish (5 sub-phases, all shipped to master)

**14A (`0348713`) -- ALL_CATEGORIES dropdown fix.** Hardcoded list was missing 9 of 30 categories (no Eating Out, Groceries, Transport, etc.). Fix: derive `ALL_CATEGORIES` from `CAT_COLORS` keys in `App.jsx:202`.

**14B (`4c56617`) -- Calendar rewrite.** Was showing only subscription due-dates with £0/month otherwise. Rewrote as daily-spend cells colored by % of daily allowance (green <80%, amber 80-120%, red >120%, grey for no spend), subscription dots overlaid, click-day drilldown. `CalendarPage.jsx` 199 lines.

**14C (`1a90a9d`) -- Cash flow forecast moved above the fold.** Phase 10 widgets pushed the chart too far down. Reordered Dashboard sections; added empty state for when `monthCount < 2`.

**14D (`a6c1976`) -- Coach = action tracker, not stats dashboard.** Stats were duplicating Insights/Spending/Merchants. New `generate_action_plan()` in `stats_coach.py` returns ranked actions (peer comparison, pace overspend, subs review, anomalies, savings rate). Coach shows 3-5 impact cards with Mark Done (localStorage `spendscope_done_actions_<userid>`).

**14E (`548463a`) -- Rules page UX.** Added inline explainer ("How categorization works"), worked example empty state, match-type help, rule preview (would match N existing), better section labels, confirm dialog on destructive Apply-Rules-To-All. **NOTE: Riya said after shipping that this made the page feel MORE complex, not less. Scaling back is a queued task.**

### Phase 15 -- Reconnect dev + prod after 3-day gap
- Pure ops, no code. Restarted Docker, uvicorn, Vite, redeployed Railway via `railway redeploy --service web`.
- Production Railway service had auto-paused (hobby tier sleeps after inactivity). Same scenario will recur if Riya stops touching it.

### Phase 16 -- Wipe button 401 + Coach 401 handlers (shipped, `4be5f0a` for Coach, in `9dd36b4` for Wipe)
- Same JWT-expired pattern. Token cached in localStorage was past 60-min expiry. Server returned 401 on any authed call.
- Fix: detect `r.status === 401` in click handlers, set "Session expired. Please log in again." message, `setTimeout(() => handleLogout(), 1500)` to force re-login.
- Applied to: CoachPage (commit `4be5f0a`), ProfileModal wipe (Phase 16).

### Phase 17 -- Multi-file upload + AccountsListPanel (committed in `9dd36b4`)
- `pendingImports` array (was single `pendingImport`). Each entry has its own `selectedRows`, `editingCell`, `bankName`, `filename`, `accountName`.
- Per-file review table in `UploadPage.jsx` (~297 lines).
- New `AccountsListPanel.jsx` (202 lines) -- rename, delete, open account from one list.

### Phase 18 -- Two upload bugs (committed in `9dd36b4`)
- **Bug 1**: 3 Lloyds CSVs silently merged into 1 account. Root cause: `acctName = bankName || 'Primary'` collided; backend reused existing account by name match; destructive `setData` filter wiped earlier rows.
  - Fix: default per-file `acctName` to `"${bankName} - ${filename}"` so uniqueness is preserved; tag rows with `_importId` and filter on that instead of `_account` name.
- **Bug 2**: AccountsListPanel "Open" routed to empty Transactions. Root cause: `onOpen` passed UUID; `filteredData` expected NAME (Sidebar contract).
  - Fix: `onOpen(a)` now passes the account object; uses `a.name`.

### Phase 19 -- AccountsListPanel 401 handlers (committed in `9dd36b4`)
- Same Phase 16 pattern applied to AccountsListPanel `onRenameSave` + `onDelete`. `handleLogout` plumbed through UploadPage.

### Phase 20 -- Sticky-header overlap in review modal (committed in `9dd36b4`)
- Root cause: `${t.teal}10` in `UploadPage.jsx:171` was hex-alpha (6.3% opacity) -- header bled through first row.
- Fix: `background: t.bg` (solid theme bg, opaque in both modes).

### Phase 21 -- Calendar forward-arrow timezone bug (UNCOMMITTED, in working tree)
- `CalendarPage.jsx:50-51` `toISOString().slice(0,7)` converted local midnight to UTC. In positive-offset timezones (IST), midnight on the 1st became 18:30 UTC the previous day -- same YYYY-MM, arrow frozen.
- Fix: integer math on year/month via `shiftMonth(delta)` -- timezone-independent.
- See `git diff frontend/src/components/CalendarPage.jsx`.

### Phase 22 -- Everything-shows-Groceries fix (UNCOMMITTED)
- Corrupted `category_rules.json` (or DB rule rows) had no `match_value` field. `_match_rule` defaulted to `contains ""` which matches every merchant. ONE bad rule branded the entire dataset.
- Three-part fix:
  1. **`src/api.py::_match_rule` (line 775-789):** treat empty `match_value` as no-match. Falls back to legacy `merchant` field for back-compat.
  2. **`frontend/src/components/EditTransactionModal.jsx` (~line 75-85):** when writing a new learned rule on Save, send the correct shape `{match_type:'contains', match_value, direction, category, is_learned:true, learned_at}`. Was previously sending `{merchant, direction, category, learned_at}` with no `match_value`.
  3. **`src/starter_rules.py` line 63:** tightened bare `"bp "` (was matching inside "non-GBP") to `"bp petrol"`.
- See `git diff src/api.py src/starter_rules.py frontend/src/components/EditTransactionModal.jsx`.

### Phase 23 -- Edit-transaction Save doesn't stick (UNCOMMITTED)
- After Phase 22 cleared the bad rules, edits via the modal still appeared to revert. Backend was fine (`PATCH /api/transactions/{id}` updates the row correctly).
- Root cause: `TransactionsPage.jsx::onSave` only called `applyChangesLocally` (mutates React `data`), never `refreshTransactions`. Two clobbering paths:
  1. Encrypted-mode users: stale category inside the decrypted blob wins on next refresh (the plaintext `category` column is correct, but the blob isn't).
  2. Non-encrypted users: any concurrent `setData` from another flow (account filter change, page nav, fresh fetch) clobbers the local mutation.
- Fix (2 files, 1 prop + 1 call): pass `refreshTransactions` prop to `TransactionsPage`; call it after `applyChangesLocally` in `onSave`.
- See `git diff frontend/src/App.jsx frontend/src/components/TransactionsPage.jsx`.

---

## 6. Current State Snapshot

### Git
- Branch: `claude/focused-knuth`
- Latest commit on branch: `9dd36b4` -- "Phase 16-20: multi-file upload, AccountsListPanel, session-expired handlers, sticky-header fix"
- Master tip: `962c760` -- "Initial SpendScope app" (master appears stale, did NOT advance during this session -- branch is far ahead of master)
- 6 uncommitted files (Phases 21 + 22 + 23):
  ```
  M frontend/src/App.jsx                              (Phase 23)
  M frontend/src/components/CalendarPage.jsx          (Phase 21)
  M frontend/src/components/EditTransactionModal.jsx  (Phase 22)
  M frontend/src/components/TransactionsPage.jsx      (Phase 23)
  M src/api.py                                        (Phase 22)
  M src/starter_rules.py                              (Phase 22)
  ```
- Diff size: 6 files, +44/-9 lines (very small surgical fixes)

### Services
- Local: assume DOWN. Run the cookbook in section 4.
- Production Railway: probably **asleep** (last touched several days ago; hobby tier auto-pauses).
- Production Vercel: still UP but pointing at the sleeping backend.

### Open todos / queued features (next Claude can pick from)
1. **Commit + push Phases 21/22/23** -- user said they'd say "commit all" when ready. Do NOT commit unprompted.
2. **Scale back Rules page UX** -- Phase 14E made it more complex; user wants it simpler.
3. **Re-categorize stuck "Other" transactions** -- when categorizer was buggy (pre-Phase 22), bad data piled up. Needs a re-run pass.
4. **Production Railway decision** -- stay at $5/mo or migrate to Hetzner + Coolify.
5. **Bulk-select / merchant-grouped categorize tool** -- user requested but not built.
6. **Global 401 interceptor** -- would replace the 3-4 individual session-expired handlers (Coach, Wipe, AccountsListPanel rename, AccountsListPanel delete).
7. **Multi-bank Plaid dashboard polish.**
8. **Encrypted-mode blob staleness** (Phase 23 deferred -- only matters when user opts into encryption).
9. **Other "mutate locally, never refresh" bugs flagged in Phase 23 plan**: EditTransactionModal applyAll siblings; RulesPage apply-rules-to-all; account rename; transaction delete. Same shape as Phase 23 -- await user trigger.

---

## 7. Privacy + Architecture Principles

These are load-bearing -- do NOT regress.

- **No Anthropic / OpenAI / any LLM API calls.** Phase 12 ripped this out entirely. `httpx` package remains only because plaid-python needs it.
- **Local-only ML.** fastembed (ONNX runtime, ~80MB) + pgvector cosine KNN runs on-server. Model is BAAI/bge-small-en-v1.5, MIT-licensed, baked into the Docker image at build time (offline mode in prod).
- **Plaid is opt-in.** Manual CSV/PDF upload is the privacy-max path and must keep working. Plaid access tokens are Fernet-encrypted at rest using `PLAID_TOKEN_ENCRYPTION_KEY`.
- **Zero-knowledge encryption is opt-in (Phase 7).** Server only sees ciphertext blobs + plaintext `category` column. Web Crypto API on the client derives keys from password + salt; recovery codes are shown ONCE at signup.
- **JWT only.** No Google/GitHub OAuth -- those env vars are placeholders.
- **No raw bank files persisted.** PDF parser writes nothing to disk after parse. CSV is parsed in-browser by PapaParse and never sent unparsed.
- **Single Postgres for relational + vector.** Design decision #10. Simpler backups, one consistency model.

---

## 8. Important Conventions

From `C:\Users\riyaw\.claude\CLAUDE.md` + observed in commits:

- **No emojis.** Not in code, commits, comments, or docs.
- **No `Co-Authored-By` lines or Claude attribution in commits.** Commit messages are plain prose.
- **Fix ONLY what was asked.** Do not refactor, rename, clean up, or touch surrounding code. Phase plans are tight on purpose.
- **ASK when uncertain.** Do not assume intent, scope, or approach.
- **Read before editing.** Always read the file fully first and search callers/usages.
- **Plans live at `C:\Users\riyaw\.claude\plans\robust-scribbling-bengio.md`.** Read the top section after compaction.
- **After compaction:** re-read CLAUDE.md, re-read the plan file, run `git status`.
- **Use sub-agents** for exploration / multi-file reads / doc updates to keep main context lean.
- **Throwaway scripts use `_*.py` prefix** -- they are gitignored. Don't commit them, don't delete them either (they're documentation of what works).
- **Venvs live OUTSIDE project folders** as siblings. `D:\Projects\spendscope_venv\` is correct.
- **Multi-line commit messages**: use HEREDOC (Bash) or `-F file` (any shell) to avoid PowerShell escaping pain.
- **After completing any task: if `setup/kt.md` + `setup/structure.md` exist, update them** -- read first, append only what's new, no restructuring. Sub-agent should do this to keep main context lean.
- **Plans:** do NOT auto-delete plan files when complete. Only delete on explicit user instruction.

---

## 9. Common Recipes

### Add a new starter rule
1. Edit `src/starter_rules.py`. The list is `STARTER_RULES`. Each entry is `{"merchant": "lowercase keyword", "category": "Category Name"}`. Direction is implicitly OUT.
2. Keep keywords **specific** -- bare `"bp "` matched inside "non-GBP" (Phase 22). Prefer `"bp petrol"`, `"bp uk fuel"`, etc.
3. No backend restart needed for fastembed -- the singleton survives. But uvicorn `--reload` will pick up the file change.
4. Verify: `tests/test_cat_check.py` or trigger `/api/categorize-local` with a transaction matching the new keyword.

### Debug "category not sticking" (Phase 22/23 pattern)
1. Backend PATCH first. `curl -X PATCH http://127.0.0.1:8000/api/transactions/<id> -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"category":"Transport"}'` -- expect 200.
2. Then `curl -X GET http://127.0.0.1:8000/api/transactions -H "Authorization: Bearer <token>"` -- confirm the row's category column shows the new value. If yes, backend is fine.
3. If frontend shows stale value: the React state mutated locally but didn't refresh from server. Look for `applyChangesLocally` or `setData(prev => ...)` calls that aren't followed by a `refreshTransactions()`.
4. Check `_match_rule` (`src/api.py:775`) -- ensure no rule with empty `match_value` exists. Query: `docker exec spendscope_db psql -U spendscope -d spendscope -c "SELECT id, match_type, match_value, category FROM category_rules WHERE COALESCE(match_value,'')='';"` -- should return 0 rows.

### Debug 401-handler bugs (Phase 16 / 19 pattern)
1. Symptom: user clicks an action button, gets a dead-end "HTTP 401" error or silent failure. They were logged in for >60 min so the JWT expired.
2. Check the click handler. Look for `if (!r.ok)`. Add an explicit `if (r.status === 401) { /* show "Session expired", setTimeout 1500ms, handleLogout() */ }` branch BEFORE the generic !r.ok.
3. Ensure `handleLogout` is passed as a prop down to the component (already wired through `App.jsx -> UploadPage -> AccountsListPanel` chain etc.).

### Bring services back up after a gap (Phase 15 cookbook)
```bash
taskkill //F //IM python.exe   # kill stray uvicorn workers
start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
# wait for docker ps to respond
docker compose up -d
/d/Projects/spendscope_venv/Scripts/python.exe -m uvicorn src.api:app --reload --port 8000
# in a second terminal:
cd frontend && npm run dev
# verify with curls in section 4
# For prod: railway redeploy --service web --yes
```

### Run E2E tests
```bash
# These live in tests/, tracked in git and run by CI (.github/workflows/ci.yml). They assume the local backend is running.
/d/Projects/spendscope_venv/Scripts/python.exe tests/test_wipe.py
/d/Projects/spendscope_venv/Scripts/python.exe tests/test_multi_upload.py
/d/Projects/spendscope_venv/Scripts/python.exe tests/test_same_bank_dedup.py
/d/Projects/spendscope_venv/Scripts/python.exe tests/test_edit_persist.py
/d/Projects/spendscope_venv/Scripts/python.exe tests/test_cat_check.py
```
Each script signs up a fresh user (so the token is always fresh -- avoid the Phase 16 expired-JWT trap).

### Commit + push (multi-line message)
```bash
# Bash: HEREDOC
git add <specific files, do NOT use -A>
git commit -m "$(cat <<'EOF'
Phase 21 + 22 + 23: timezone fix, rule shape fix, edit-modal refresh

Phase 21: Calendar forward arrow used UTC slice -- froze in IST.
Phase 22: _match_rule treated empty match_value as contains "" (matched all).
Phase 23: TransactionsPage onSave never refreshed from server -- local mutation
clobbered by encrypted blob decrypt or concurrent setData.
EOF
)"
git push origin claude/focused-knuth
```
Do NOT add `Co-Authored-By` lines. Do NOT include emojis.

---

## 10. Known Pending Bugs / Features

| # | Item | Type | Priority | Notes |
|---|---|---|---|---|
| 1 | Phases 21+22+23 uncommitted | commit | high | User will say "commit all" when ready. Don't proactively commit. |
| 2 | Rules page feels too complex (Phase 14E backfired) | UX | medium | User said this directly. Scale back the explainer + preview density. |
| 3 | "Everything stuck as Other" backfill | data | medium | Bad data accumulated when categorizer was buggy pre-Phase 22. Need a one-time recategorize pass over existing transactions. Currently `/api/categorize-local` only fires on NEW imports. |
| 4 | Global 401 interceptor | architecture | low | Would replace Phase 16/19's individual handlers. Bigger change touching every fetch. Not now. |
| 5 | Plaid multi-bank dashboard polish | feature | low | Works but UI is rough when multiple institutions are connected. |
| 6 | Railway $5/mo vs Hetzner+Coolify | ops decision | medium | User is weighing this. Railway hobby tier sleep is annoying. |
| 7 | Bulk-select / merchant-grouped categorize tool | feature | medium | User explicitly requested. "Show me all 'TFL' rows, let me set them to Transport in one click." |
| 8 | Encrypted-mode blob staleness | bug | low | Phase 23 dodged this. Server's plaintext `category` column is authoritative; the encrypted blob's category drifts. Two fixes possible: re-encrypt blob on every PATCH (heavy) OR have `refreshTransactions` prefer plaintext column (cheap). Only matters once user opts into encryption. |
| 9 | "Mutate locally, never refresh" siblings | bug | low | Same Phase 23 shape in EditTransactionModal applyAll, RulesPage apply-rules-to-all, account rename, transaction delete. Punt until user hits them. |
| 10 | Recurring Railway auto-sleep | ops | low | Hobby tier pauses. Either upgrade tier OR add a cheap external ping (uptimerobot etc.). User aware. |
| 11 | Onboarding tour / welcome flow | feature | medium | Never built; new users land on an empty dashboard with no guidance. Deferred from Phase 14. Would help retention. |
| 12 | Mobile responsive Calendar | UX | medium | `CalendarPage.jsx` is desktop-first; grid breaks on narrow viewports. Deferred from Phase 14B. |
| 13 | Wider backend account uniqueness key | architecture | low | `src/api.py` `/api/transactions/import` looks up accounts by `(user_id, name)`. Phase 18 took the frontend-only fix (unique default names like "Lloyds - jan"). Long-term, a `(user_id, name, source_filename)` composite would let two files with the same intentional account name coexist when meaningful. |
| 14 | Phase 7 encryption end-to-end testing | bug | medium | Zero-knowledge encryption code exists (`frontend/src/lib/crypto.js`, `keyManager.js`; backend `/api/auth/encryption-setup`, `/api/auth/verify-recovery`) but Riya never set it up on her own account. The recovery codes flow, the new-tab decrypt flow, and the encrypted-mode blob-staleness bug flagged in Phase 23 are all untested in real use. Audit + smoke-test as a single project before encouraging anyone to opt in. |
| 15 | `category_rules.json` storage location | architecture | medium | Currently stored as a flat JSON file at `data/processed/category_rules.json` shared across the entire server, not user-scoped, and the POST endpoint has no auth dependency. The `CategoryRule` SQLAlchemy model exists (`src/models.py:119`) but no code path inserts into it. Migration: move all rule reads/writes to the DB table, key them on `user_id`, add auth. Bundle with the Rules-page simplification work. |
| 16 | Starter rule coverage gaps | data | low | `src/starter_rules.py` has ~80 UK+US merchants; misses lots of common ones (Chopstix, Wagamama overlap, Greggs, Itsu, Pret variants, EE/O2/Three already added but no `british gas` variants, no `npower`/`scottish power`, no `boots`/`superdrug` for Healthcare, no `john lewis`/`debenhams`/`primark`). The longer-term answer is the vector KNN learns from edits -- but pre-deploy a wider starter pack would reduce the cold-start "everything is Other" experience for new users. |

---

## 11. Verification Checklist for the Next Claude

Run these in order. If any check fails, STOP and investigate before doing anything else.

### Git state
```bash
cd /d/Projects/SpendScope/.claude/worktrees/focused-knuth
git status --short
# Expected:
#  M frontend/src/App.jsx
#  M frontend/src/components/CalendarPage.jsx
#  M frontend/src/components/EditTransactionModal.jsx
#  M frontend/src/components/TransactionsPage.jsx
#  M src/api.py
#  M src/starter_rules.py

git rev-parse HEAD
# Expected: 9dd36b4...

git rev-parse --abbrev-ref HEAD
# Expected: claude/focused-knuth
```

### Phase 21 fix in working tree
```bash
grep -n "Phase 21" frontend/src/components/CalendarPage.jsx
# Expected: ~line 50 -- comment "// Phase 21: previously used `new Date(...).toISOString().slice(0,7)`..."
```

### Phase 22 fix in working tree
```bash
grep -n "Phase 22" src/api.py
# Expected: ~line 776 -- "Phase 22: A rule with no `match_value`..."

grep -n "Phase 22" frontend/src/components/EditTransactionModal.jsx
# Expected: ~line 70 -- "Phase 22: must write the rule in the shape the backend matcher expects"

grep -n "bp petrol" src/starter_rules.py
# Expected: one hit on line 63
```

### Phase 23 fix in working tree
```bash
grep -n "Phase 23" frontend/src/components/TransactionsPage.jsx
# Expected: ~line 73 -- "Phase 23: refresh from server so the authoritative category sticks."

grep -n "refreshTransactions={refreshTransactions}" frontend/src/App.jsx
# Expected: ~line 739 (one hit on the TransactionsPage render line)
```

### Docker + Postgres
```bash
docker ps --filter "name=spendscope_db" --format "{{.Names}} {{.Status}}"
# Expected: spendscope_db Up X minutes (healthy)

docker exec spendscope_db psql -U spendscope -d spendscope -c "SELECT extname,extversion FROM pg_extension WHERE extname='vector';"
# Expected: vector | 0.x.x (one row)

docker exec spendscope_db psql -U spendscope -d spendscope -c "SELECT count(*) FROM transactions;"
# Expected: some integer (Riya's test data). Definitely > 0 if she's been testing recently.
```

### Backend up
```bash
curl -s http://127.0.0.1:8000/
# Expected: {"status":"SpendScope API is running"}

curl -s http://127.0.0.1:8000/openapi.json | python -c "import json,sys; print(len(json.load(sys.stdin)['paths']))"
# Expected: 37

curl -s -X POST http://127.0.0.1:8000/api/categorize-local -o /dev/null -w "%{http_code}\n"
# Expected: 401
```

### Frontend up
```bash
curl -s http://127.0.0.1:5173/ | grep -o "main.jsx"
# Expected: main.jsx (means Vite is serving the React entry)
```

### Plaid creds loaded (Phase 9)
```bash
docker exec spendscope_db psql -U spendscope -d spendscope -c "\dt" | grep plaid
# Expected: public | plaid_items | table | spendscope

# Verify backend has the encryption key (don't echo the key itself)
/d/Projects/spendscope_venv/Scripts/python.exe -c "from src.plaid_service import _cipher; print('cipher OK' if _cipher() else 'cipher MISSING')"
# Expected: cipher OK
```

### fastembed model present
```bash
/d/Projects/spendscope_venv/Scripts/python.exe -c "from src.categorize_local import _get_model; m=_get_model(); print('model OK', m is not None)"
# First call downloads model (~80MB) into the cache -- ~30s. Subsequent calls instant.
# Expected: model OK True
```

### Route table (sanity)
```bash
grep -n "^@app\." src/api.py | wc -l
# Expected: 37 (or thereabouts)
```

### Old Claude endpoints are gone
```bash
grep -nE "coaching/plan|plan-stream|plan-cached|ANTHROPIC|ai_coach" src/api.py
# Expected: no output (Phase 12 removed all of these)
```

### E2E tests present (tracked in git, run by CI)
```bash
ls tests/test_*.py
# Expected: tests/test_cat_check.py tests/test_edit_persist.py tests/test_multi_upload.py tests/test_same_bank_dedup.py tests/test_wipe.py

# Run one as a smoke check (requires backend up):
/d/Projects/spendscope_venv/Scripts/python.exe tests/test_cat_check.py
# Expected: success / no exceptions
```

### Production state (optional, slow)
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://web-production-c1480.up.railway.app/
# Expected: 200 if awake, 404 if Railway has paused the container.
# If 404, you can wake it via: railway redeploy --service web --yes

curl -s -o /dev/null -w "%{http_code}\n" https://frontend-neon-seven-62.vercel.app/
# Expected: 200 (Vercel is always up)
```

### No accidental kt.md / structure.md drift
```bash
ls setup/
# Expected: kt.md structure.md
```

---

## 12. Sub-Agent Caveat

There's been a recurring snag in this session: when the main Claude spawns a sub-agent via the Task tool, the sub-agent sometimes inherits a stale "plan mode is active" system reminder even though the main session is NOT in plan mode.

Symptoms:
- Sub-agent refuses to use Write/Edit and says "I can only do read-only research in plan mode."
- Or sub-agent produces a plan document instead of doing the work.

Workarounds when you see this:
1. **Do the work inline** instead of delegating. Most things in this codebase are small enough.
2. **If you must use a sub-agent**, include a very explicit line at the top of the prompt: `"You are NOT in plan mode. The user has approved this work. Proceed with reads, edits, and writes as needed."` Repeat near the end.
3. **Verify the agent's first action.** If it says "I'll start by reading..." and then writes a plan instead of editing, kill the agent and do it inline.

This caveat is specific to this Claude Code build/version. May be fixed in future versions.

---

## 13. Where to Look for Specifics

### Backend routes (`src/api.py`, 1225 lines)
| Line | Method | Path |
|---|---|---|
| 41 | GET | `/` (health) |
| 48 | POST | `/api/auth/signup` |
| 82 | POST | `/api/auth/login` |
| 103 | GET | `/api/auth/me` |
| 119 | PUT | `/api/auth/me` |
| 142 | POST | `/api/auth/encryption-setup` |
| 164 | POST | `/api/auth/verify-recovery` |
| 187 | GET | `/api/transactions` |
| 222 | POST | `/api/transactions/import` |
| 313 | helper | `_apply_txn_patch` (shared by single PATCH + batch-update) |
| 351 | PATCH | `/api/transactions/{txn_id}` |
| 369 | PATCH | `/api/transactions/{txn_id}/category` (legacy alias) |
| 375 | POST | `/api/transactions/batch-update` |
| 404 | GET | `/api/import-batches` |
| 422 | DELETE | `/api/import-batches/{batch_id}` |
| 438 | POST | `/api/account/wipe-data` |
| 486 | GET | `/api/accounts` |
| 499 | POST | `/api/accounts` |
| 523 | PATCH | `/api/accounts/{account_id}` |
| 556 | DELETE | `/api/accounts/{account_id}` |
| 580 | GET | `/api/summary` |
| 608 | POST | `/api/upload-csv` |
| 648 | GET | `/api/coaching/stats` |
| 672 | POST | `/api/categorize-local` |
| 737 | GET | `/api/category-rules` |
| 742 | POST | `/api/category-rules` |
| 752 | PUT | `/api/category-rules/{rule_id}` |
| 765 | DELETE | `/api/category-rules/{rule_id}` |
| 775 | helper | `_match_rule` (Phase 22 fix lives here) |
| 807 | POST | `/api/categorize` (legacy bulk apply) |
| 827 | POST | `/api/upload-csv-mapped` |
| 853 | POST | `/api/upload-pdf` |
| 1038 | POST | `/api/plaid/link-token` |
| 1050 | POST | `/api/plaid/exchange-token` |
| 1107 | POST | `/api/plaid/sync` |
| 1147 | GET | `/api/plaid/items` |
| 1167 | DELETE | `/api/plaid/items/{item_id}` |
| 1198 | POST | `/webhooks/plaid` |

### Frontend state (`App.jsx`)
- Main state hooks: lines 23-67 (20+ `useState` calls)
- Auth: `handleLogin` line 72, `handleSignup` line 95, `handleLogout` line 124
- Data refresh: `refreshTransactions` line 146, `refreshAccounts` line 166
- Wipe: `handleWipeData` line 136 (clears local state after server wipe)
- Currency auto-detect: useEffect at line 180
- `ALL_CATEGORIES`: line 202 (Phase 14A -- derived from `CAT_COLORS`)
- `localCategorize` (Phase 12 categorizer entry): line 207
- `localCategorizeAndImport` (the full import pipeline): see `App.jsx` ~line 184 onward

### Categorization
- Frontend entry: `App.jsx::localCategorizeAndImport` -- called from CSV import, PDF import, column mapper, fallback paths
- Backend entry: `POST /api/categorize-local` (`src/api.py:672`)
- Model: `src/categorize_local.py::_get_model` (lazy fastembed singleton)
- KNN: `src/categorize_local.py::categorize_by_neighbors` -- cosine via `<=>`, filtered to `category_source='manual'`
- Starter pack: `src/starter_rules.py::STARTER_RULES` (OUT-only)
- Rule matcher: `src/api.py::_match_rule` (Phase 22 fix at line 775-789)

### Where to extend
- **Add a backend endpoint:** append in `src/api.py`, mirror an existing auth-protected route (use `Depends(get_current_user)` pattern).
- **Add a frontend page:** create new component in `frontend/src/components/`, add nav item in `Sidebar.jsx`, render branch in `App.jsx` routing block (lines ~720+).
- **Add a category:** edit `CAT_COLORS` in `frontend/src/constants.js` -- it's the single source of truth (Phase 14A). `ALL_CATEGORIES` is derived from it.
- **Add a bank parser template:** drop a JSON file in `src/parsers/templates/`. Auto-detection matches CSV headers against template patterns.
- **Add a starter rule:** append to `STARTER_RULES` list in `src/starter_rules.py`.
- **Add a peer benchmark:** edit `PEER_BENCHMARKS` in `frontend/src/constants.js`.

### Where state lives
- localStorage keys actively used:
  - `spendscope_token` -- JWT
  - `spendscope_user` -- user object {id, email, name, currency, country, encryption_salt?}
  - `spendscope_name` -- display name
  - `spendscope_budgets` -- per-category budget overrides
  - `spendscope_accounts` -- legacy fallback (server is now authoritative, but still written for back-compat)
  - `spendscope_learned_rules` -- legacy, mostly superseded by server-side rules
  - `spendscope_bulk_rules` -- legacy
  - `spendscope_dismissed_alerts` -- per-day banner dismissal
  - `spendscope_done_actions_<userid>` -- Coach Mark-Done state (Phase 14D)

### Setup docs (project-specific conventions, design decisions 1-16)
- `setup/kt.md` -- read for design decisions 7-16 in particular (one-account-per-plaid-account, idempotent ALTER strategy, KNN learns only from manual, direction-aware throughout, starter pack OUT-only, embedding model rationale, stats coach replaces LLM coach, zero outbound calls).
- `setup/structure.md` -- file reference + chronological changelog. Update this and `kt.md` after every shipped phase.

---

## End of handoff

If anything is unclear, the running plan file at `C:\Users\riyaw\.claude\plans\robust-scribbling-bengio.md` has the full prose for every phase including root-cause analysis and out-of-scope notes. Don't be afraid to re-read it.
