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
- **Railway** (backend, Dockerfile builder, Postgres plugin). Auto-deploys from a push to its connected branch -- there is no `master` branch in this repo (`git branch -r` shows only `origin/main`, `origin/phase-a-b-fixes`, `origin/prod`); which one Railway actually watches has not been verified from this worktree.
- **Vercel** (frontend SPA). Auto-deploys from a push to its connected branch (same caveat as above). `VITE_API_URL` env var points at Railway URL.
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
├── railway.json                            # Railway deploy config (Dockerfile builder, health check /health)
├── requirements.txt                        # 132 packages (incl. Jupyter for notebooks)
├── requirements.prod.txt                   # slim, includes fastembed + pgvector + plaid-python
├── .env.example                            # template, sanitized
├── .env                                    # local secrets (gitignored)
├── README.md                               # public docs
├── tests/                                  # E2E scripts, tracked in git and run by CI (.github/workflows/ci.yml)
│   ├── cleanup.py                          # shared helper (not a test): deletes a test user's rows in FK-safe order
│   ├── test_wipe.py                        # E2E: signup -> wipe-data -> verify
│   ├── test_multi_upload.py                # E2E: multi-file upload (Phase 17)
│   ├── test_same_bank_dedup.py             # E2E: Phase 18 -- 3 Lloyds files -> 3 accounts not 1
│   ├── test_edit_persist.py                # E2E: PATCH category -> survives refresh (Phase 23)
│   ├── test_cat_check.py                   # E2E: starter-rule sanity
│   ├── test_rules_isolation.py             # E2E: Phase C category-rules user isolation (TESTS-CI lane)
│   └── test_encryption.py                  # E2E: Phase E envelope encryption, drives real frontend crypto.js/keyManager.js via a Node harness
├── _backend.log / _backend.err.log         # uvicorn stdout/stderr when run in background
├── _frontend.log                           # Vite stdout when run in background
├── setup/
│   ├── kt.md                               # project knowledge transfer (rules + architecture + design decisions 1-16)
│   └── structure.md                        # file reference + changelog (updated phase-by-phase)
├── src/
│   ├── api.py                              # 903 lines, 26 routes (verified via `grep -c '@app\.' src/api.py`; 10 more were extracted into src/routes/ by Phase 0 -- 36 total across api.py + routes/accounts.py (4) + routes/plaid.py (6); see section 13 for the full table)
│   ├── auth.py                             # 100 lines, JWT issue/verify + bcrypt
│   ├── database.py                         # async engine + migration block (extension created before create_all, then per-statement transactions that raise on failure -- 08362aa/F-2)
│   ├── models.py                           # 8 SQLAlchemy models (User, Account, ImportBatch, Transaction, CategoryRule, Budget, CsvTemplate, PlaidItem)
│   ├── categorize_local.py                 # 124 lines, fastembed singleton + KNN search
│   ├── starter_rules.py                    # 123 lines, ~80 merchant keyword rules
│   ├── stats_coach.py                      # 351 lines, deterministic financial summary + generate_action_plan
│   ├── plaid_service.py                    # 334 lines, Plaid client + Fernet token crypto + transactions/sync cursor
│   ├── routes/                             # Phase 0 (f6386c9): account CRUD + Plaid/webhook routes extracted verbatim out of api.py
│   │   ├── accounts.py                     # 4 routes -- GET/POST /api/accounts, PATCH/DELETE /api/accounts/{id} (line count omitted -- Wave 1 is actively modifying this file, see section 6)
│   │   └── plaid.py                        # 6 routes -- link-token, exchange-token, sync, items, item delete, /webhooks/plaid (line count omitted -- Wave 1 is actively modifying this file, see section 6)
│   ├── plan_types.py                       # 168 lines, pure dataclasses, no SQLAlchemy (Phase 0) -- frozen contract for the plan/forecast engine
│   ├── plan_models.py                      # 113 lines, SQLAlchemy ORM (Phase 0) -- 5 new tables: plan_settings, plan_balances, recurring_rules, balance_updates, plan_events
│   ├── embedding_guard.py                  # 18 lines, fully implemented (Phase 0) -- wraps categorize_local.embed_text so a Plaid sync never 500s if the local ONNX embedder is unavailable
│   ├── money.py                            # Phase 0 skeleton; Wave 1 is filling it in now (uncommitted) -- decimal money handling for the plan engine
│   ├── timeutil.py                         # Phase 0 skeleton; Wave 1 is filling it in now (uncommitted)
│   ├── plaid_privacy.py                    # Phase 0 skeleton; Wave 1 is filling it in now (uncommitted)
│   ├── plaid_sync.py                       # Phase 0 skeleton; Wave 1 is filling it in now (uncommitted)
│   ├── plaid_fake.py                       # Phase 0 skeleton; Wave 1 is filling it in now (uncommitted)
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

---

## 4. Environment Setup

### Paths (verbatim)
- Worktree: `D:\Projects\SpendScope\.claude\worktrees\focused-knuth`
- Branch: `phase-a-b-fixes`
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
# Backend health (this is what railway.json's healthcheckPath actually targets, not "/")
curl http://127.0.0.1:8000/health
# Expected: {"status":"ok","db":"ok"}

# Root endpoint (static string, no DB check -- exists but is not the healthcheck path)
curl http://127.0.0.1:8000/
# Expected: {"status":"SpendScope API is running"}

# Auth-protected route returns 401 without token (good)
curl -X POST http://127.0.0.1:8000/api/categorize-local
# Expected: {"detail":"Not authenticated"}  HTTP 401

# Route count
curl -s http://127.0.0.1:8000/openapi.json | python -c "import json,sys; print(len(json.load(sys.stdin)['paths']))"
# Expected: 31 paths (36 routes across api.py + routes/accounts.py + routes/plaid.py, but 5 paths
# carry two methods each -- e.g. GET+PUT /api/auth/me -- so len(paths) undercounts routes)

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
- Railway: switched DB image to pgvector. Backfilled Phase 7 (`users.encryption_salt`/`recovery_codes_hash`, `transactions.encrypted_data`) + Phase 9 (`import_batches.plaid_item_id`) ALTERs into the startup migration block -- these had been applied to prod by hand and were missing from the tracked migration list (Phase 13 follow-up commit `1cf6d24`; verified via `git show 1cf6d24` -- the commit message says "Phase 7 + 9" explicitly, and Phase 10/12's own ALTERs were already present from their own commits, nothing to backfill there).
- Vercel: GitHub App linked, root dir set to `frontend`, `VITE_API_URL` configured.
- Tags: `v0.13-deployed` = live anchor, `v0.12-pre-deploy` = rollback anchor.

### Phase 14 -- Production Polish (5 sub-phases, all shipped to main -- commits `0348713`..`548463a`)

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

### Phase 21 -- Calendar forward-arrow timezone bug (shipped, `0a688bd`)
- `CalendarPage.jsx:50-51` `toISOString().slice(0,7)` converted local midnight to UTC. In positive-offset timezones (IST), midnight on the 1st became 18:30 UTC the previous day -- same YYYY-MM, arrow frozen.
- Fix: integer math on year/month via `shiftMonth(delta)` -- timezone-independent.
- See commit `0a688bd` (`git show 0a688bd -- frontend/src/components/CalendarPage.jsx`).

### Phase 22 -- Everything-shows-Groceries fix (shipped, `0a688bd`)
- Corrupted `category_rules.json` (or DB rule rows) had no `match_value` field. `_match_rule` defaulted to `contains ""` which matches every merchant. ONE bad rule branded the entire dataset.
- Three-part fix:
  1. **`src/api.py::_match_rule` (line 775-789):** treat empty `match_value` as no-match. Falls back to legacy `merchant` field for back-compat.
  2. **`frontend/src/components/EditTransactionModal.jsx` (~line 75-85):** when writing a new learned rule on Save, send the correct shape `{match_type:'contains', match_value, direction, category, is_learned:true, learned_at}`. Was previously sending `{merchant, direction, category, learned_at}` with no `match_value`.
  3. **`src/starter_rules.py` line 63:** tightened bare `"bp "` (was matching inside "non-GBP") to `"bp petrol"`.
- See commit `0a688bd` (`git show 0a688bd -- src/api.py src/starter_rules.py frontend/src/components/EditTransactionModal.jsx`).

### Phase 23 -- Edit-transaction Save doesn't stick (shipped, `0a688bd`)
- After Phase 22 cleared the bad rules, edits via the modal still appeared to revert. Backend was fine (`PATCH /api/transactions/{id}` updates the row correctly).
- Root cause: `TransactionsPage.jsx::onSave` only called `applyChangesLocally` (mutates React `data`), never `refreshTransactions`. Two clobbering paths:
  1. Encrypted-mode users: stale category inside the decrypted blob wins on next refresh (the plaintext `category` column is correct, but the blob isn't).
  2. Non-encrypted users: any concurrent `setData` from another flow (account filter change, page nav, fresh fetch) clobbers the local mutation.
- Fix (2 files, 1 prop + 1 call): pass `refreshTransactions` prop to `TransactionsPage`; call it after `applyChangesLocally` in `onSave`.
- See commit `0a688bd` (`git show 0a688bd -- frontend/src/App.jsx frontend/src/components/TransactionsPage.jsx`).

---

## 6. Current State Snapshot

**NOTE (2026-09-13): this section was previously stale by several months** -- it still described `claude/focused-knuth` at `9dd36b4` with Phases 21-23 uncommitted. All of that has since landed. Rewritten below from `git log --oneline -12` + `git status --short`, both run fresh.

### Git
- Branch: `phase-a-b-fixes` (pushed to `origin/phase-a-b-fixes` on GitHub; CI runs on it)
- Latest commit on branch: `f6386c9` -- "Phase 0: extract Plaid/account routers, merge plan-engine schema, add pure-module skeletons"
- Working tree: **NOT clean** -- Wave 1 (MoneyMap integration) lane work is in progress on top of `f6386c9` in this worktree (uncommitted edits to `money.py`, `timeutil.py`, `plaid_privacy.py`, `plaid_sync.py`, `plaid_fake.py`, `stats_coach.py`, `src/routes/accounts.py`, `src/routes/plaid.py`, plus new untracked pure-modules and frontend pages under `frontend/src/components/`). This is a live in-progress snapshot -- run `git status --short` for the current list before assuming any of it is finished.
- Commit history on this branch (oldest to newest of the current run):
  ```
  0a688bd Phase 21 + 22 + 23: calendar timezone, rule shape, edit-save refresh
  845c1ff Add HANDOFF.md: project state, phase history, pending work, verification checklist
  0f0e24a Phase A+B: stop data-loss bugs, add test + CI safety net
  1da9c02 Phase C: authenticate endpoints, migrate category rules to user-scoped DB
  630141b Phase D (parsers): distinguish PDF failure modes instead of failing silently
  34131e9 Phase E: envelope encryption (Option A) -- checkpoint with known gaps
  185e300 FE-CORE: fix A-1, E-9, E-10, E-15 in App.jsx and UploadPage.jsx
  f885ff3 ENC-UI: fix E-11, E-3-lite, E-8, A-3, C-1 in EncryptionSettings, EditTransactionModal, PlaidConnect
  08362aa BE: fix E-7, E-12, F-1, F-2, MISC-1, D-2, CONTRACT-3, RULES-DIRECTION, SIGNUP, DEAD in api.py, auth.py, database.py, railway.json
  1189e60 TESTS-CI: fix E-14, B-3, ENV-5, add test_rules_isolation and its CI step
  c6c1c72 PARSERS: fix D-5, D-7 in pdf_parser.py and redaction_detector.py
  a031f22 FE follow-ups: ProfileModal crash, PDF reason messages, unlock-error reset, failed-import visibility
  f6386c9 Phase 0: extract Plaid/account routers, merge plan-engine schema, add pure-module skeletons
  ```
- The five lane commits (`185e300`, `f885ff3`, `08362aa`, `1189e60`, `c6c1c72`) landed 2026-09-13; none are still open.
- **Phase 0 of the MoneyMap integration** (commit `f6386c9`, 2026-09-27) is the foundational, serial step before Wave 1's parallel lanes: extracted the account CRUD and Plaid/webhook routes out of `api.py` into `src/routes/accounts.py` and `src/routes/plaid.py` (same 36 routes, same paths/methods -- verified via before/after route-count grep); fixed a real bug where `Account.plaid_account_id` had a stale non-unique index that silently collided by name with the intended unique index, replaced with a correctly-scoped partial unique index on `(user_id, plaid_account_id)`; changed `accounts.plaid_item_id`'s FK from `CASCADE` to `SET NULL` so disconnecting a Plaid item keeps the account and its transactions; added the plan/forecast engine schema (`users.timezone`; 9 new `Account` columns; 3 new `Transaction` columns incl. a per-user-unique `plaid_transaction_id`; `Budget.currency`) plus 5 new tables in new `src/plan_models.py` (`plan_settings`, `plan_balances`, `recurring_rules`, `balance_updates`, `plan_events`) and pure dataclass contracts in new `src/plan_types.py`; added signature-only skeletons for Wave 1 to fill in (`money.py`, `timeutil.py`, `plaid_privacy.py`, `plaid_sync.py`, `plaid_fake.py`) plus a fully-implemented `src/embedding_guard.py`. Wave 1's parallel lanes are running now (see "Working tree" above) -- their scope isn't finalized/merged yet, so it isn't described here.
- **Latest CI run:** `36344348862` on tip `f6386c9` = **SUCCESS** (verified via `gh run list --branch phase-a-b-fixes`).
- **CI (history):** pushed to `origin/phase-a-b-fixes` (`git push` confirmed). CI run `34772218177` on then-tip `c6c1c72` = **SUCCESS** -- both the `frontend` job and the `test` job passed, all 7 backend tests green on Linux including the new `tests/test_rules_isolation.py`; this is the first fully green run on this branch (verified via `gh run view 34772218177`). An earlier run, `34768509314` on `34131e9`, **FAILED** at app boot: `asyncpg.exceptions.UndefinedObjectError: type "vector" does not exist` (verified via `gh run view 34768509314 --log-failed`) -- `init_db()` ran `Base.metadata.create_all` before `CREATE EXTENSION vector`, so the `Vector(384)` embedding column's type didn't exist yet when the table was created. Fixed in `08362aa` (F-2): the extension is now created first, in its own transaction, before `create_all` runs.
- **Correction to the record:** an earlier session claimed the silent-import banner bug (A-1) was fixed and hand-verified. That was wrong -- `UploadPage.jsx` gated the error banner behind `!pendingImport`, so it never rendered once the multi-file import review view was open. Verified fixed in the FE-CORE lane commit (`185e300`): the review view (`pendingImports.length > 0`) now renders its own `uploadStatus.type === 'error'` banner directly (`UploadPage.jsx` ~lines 109-117, comment marked `A-1:`).

### Services
- Local: Docker + Postgres are up (`localhost:5432`, db `spendscope`, user `spendscope`/`spendscope_dev`). Backend/frontend dev servers still need to be started per-session -- see the cookbook in section 4.
- **onnxruntime is broken on this machine, by Riya's own choice, and is deliberately NOT being fixed.** Any local code path that embeds a plaintext merchant string -- plaintext transaction import, `POST /api/categorize-local` -- returns HTTP 500 locally. Encrypted imports and every other path work fine locally.
- Plaintext-import / categorize tests therefore only run green in GitHub Actions CI (Linux), not on this machine.
- Production Railway / Vercel state: not re-verified this session -- see section 1 for last-known URLs, and re-check before assuming either is up.

### Open todos / queued features (next Claude can pick from)
The full, current deferred list lives in section 10 -- it replaces every item that used to be listed here (Phases 21-23 commit, Rules-page UX, 401 interceptor, etc. are all done or superseded). Read section 10 before picking up new work.

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
/d/Projects/spendscope_venv/Scripts/python.exe tests/test_rules_isolation.py
/d/Projects/spendscope_venv/Scripts/python.exe tests/test_encryption.py
```
Each script signs up a fresh user (so the token is always fresh -- avoid the Phase 16 expired-JWT trap). `test_encryption.py` additionally shells out to Node (`tests/js_harness.mjs`) to drive the real frontend `crypto.js`/`keyManager.js` -- needs Node on PATH.

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
git push origin phase-a-b-fixes
```
Do NOT add `Co-Authored-By` lines. Do NOT include emojis.

---

## 10. Known Pending Bugs / Features

**Rewritten 2026-09-13.** Every item below is what remains open after Phases A-E (and the FE-CORE/ENC-UI/BE/TESTS-CI/PARSERS lane commits) landed. The previous version of this table (Phases 21-23 uncommitted, Rules-page UX, global 401 interceptor, etc.) is entirely resolved or superseded -- see section 5 and the plan file for that history.

| # | Item | Type | Priority | Notes |
|---|---|---|---|---|
| 1 | Unauthenticated forgot-password recovery | security/feature | high | Needs hashed recovery codes for server-side auth verification. The client-side envelope scheme (`frontend/src/lib/crypto.js`, `keyManager.js`) wraps the DEK under each recovery code, but there is no server-side verify-recovery endpoint or flow that lets a locked-out user actually regain account access without the password. |
| 2 | Learned-rules plaintext merchant leak for encrypted users | privacy | high | Server-side rule matching and KNN categorization (`src/categorize_local.py`) still need a plaintext merchant string to match/embed against. An encrypted user's merchant is only ever plaintext transiently at import time -- rules learned afterward can't be matched against the encrypted blob. |
| 3 | Legacy salt-only accounts | migration | medium | Accounts created before the Phase E envelope redesign have `User.encryption_salt` set but no `User.wrapped_dek`. No migration path from the old direct-PBKDF2 scheme to the new envelope scheme is defined yet. |
| 4 | Plaid strategy for encrypted users | architecture | medium | Server-side Plaid sync (`src/plaid_service.py`) has no access to the user's DEK and writes plaintext merchant/description. An encrypted user who connects a bank via Plaid gets mixed-mode rows (some encrypted, some plaintext) with no reconciliation logic. Excluded from Phase E scope by design (Riya's call); must be resolved before Plaid ships to encrypted users. |
| 5 | Phase F hosting migration | ops | medium | Neon (Postgres) + Cloud Run + Cloudflare R2, per the plan file's Phase F section. Needs Riya's own accounts (billing/signup); nothing has been provisioned yet. |
| 6 | Real PDF bank-statement fixtures | test coverage | medium | `data/raw/fixtures/` (gitignored) has never held a real statement. The Lloyds and Bank of America PDF parsers have no regression net against real-world formatting variance. |
| 7 | Manual end-to-end encryption test | verification | high | Sign up -> enable encryption -> import -> close the tab -> log back in -> data still readable. Then: forget the password -> recover with a code -> data still readable. This is the test the whole Phase E redesign exists to pass, and it has still never been run by a human. |
| 8 | Deliberate break-CI test | verification | low | Push a known-bad change and confirm `.github/workflows/ci.yml` actually goes red. Never run -- CI going green has only ever been observed on passing code. |
| 9 | MoneyMap integration | integration | high | Merging Riya's friend's MoneyMap (cash-flow/debt planner) into SpendScope as one app. Phase 0 (foundational schema + router extraction, commit `f6386c9`) is committed -- see section 6. Wave 1's parallel lanes (filling in the `money.py`/`timeutil.py`/`plaid_privacy.py`/`plaid_sync.py`/`plaid_fake.py` skeletons and new frontend pages) are running now, uncommitted, in this worktree; scope not final -- run `git status --short` for the current state before assuming anything below Phase 0 is finished. |
| 10 | onnxruntime broken locally (VC++ redistributable) | environment | low | Local `onnxruntime` import fails because of a broken/missing Visual C++ redistributable on this machine -- this is what makes any local code path that embeds a plaintext merchant string (plaintext import, `POST /api/categorize-local`) return HTTP 500 locally (see section 6, Services). By Riya's own choice, this is deliberately NOT being fixed on this machine; CI (Linux) is unaffected and is the only place plaintext-import/categorize tests currently run green. |

---

## 11. Verification Checklist for the Next Claude

Run these in order. If any check fails, STOP and investigate before doing anything else.

### Git state
```bash
cd /d/Projects/SpendScope/.claude/worktrees/focused-knuth
git rev-parse HEAD
# Expected: f6386c9...

git rev-parse --abbrev-ref HEAD
# Expected: phase-a-b-fixes

git status --short
# NOT expected to be clean or to match any fixed list -- Wave 1 (MoneyMap integration) lanes
# run concurrently in this worktree, and this docs pass itself touches HANDOFF.md/README.md/
# setup/kt.md/setup/structure.md. Read the output, don't diff it against a hardcoded list;
# see section 6 for what's in flight as of this writing.
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
# Expected: 31

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
# Expected: 26 -- Phase 0 (f6386c9) extracted the other 10 into src/routes/accounts.py (4) and
# src/routes/plaid.py (6); grep those too if you want the full 36.
```

### Old Claude endpoints are gone
```bash
grep -nE "coaching/plan|plan-stream|plan-cached|ANTHROPIC|ai_coach" src/api.py
# Expected: no output (Phase 12 removed all of these)
```

### E2E tests present (tracked in git, run by CI)
```bash
ls tests/test_*.py
# Expected (7 files): tests/test_cat_check.py tests/test_edit_persist.py tests/test_encryption.py
# tests/test_multi_upload.py tests/test_rules_isolation.py tests/test_same_bank_dedup.py tests/test_wipe.py
# (tests/cleanup.py is an 8th file in tests/ -- a shared helper, not a test; see section 3)

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

**Backend routes table rewritten 2026-09-28** from `grep -n '^@app\.' src/api.py` + `grep -n '^@router\.' src/routes/accounts.py src/routes/plaid.py`, after Phase 0 (`f6386c9`) extracted the account CRUD and Plaid/webhook routes out of `api.py` into `src/routes/`. Same 36 routes/paths/methods as before Phase 0 -- just split across three files now. Re-run the greps before trusting this table too, and see the note in section 3 (`src/routes/` etc. added there).

*(36 routes across three files, but the live OpenAPI schema only reports 31 unique paths -- 5 paths carry two methods each: `GET`+`PUT /api/auth/me`, `GET`+`POST /api/category-rules`, `PATCH`+`DELETE /api/category-rules/{rule_id}`, `GET`+`POST /api/accounts`, `PATCH`+`DELETE /api/accounts/{account_id}`. Verified via `app.openapi()['paths']` in a Python shell, no DB needed.)*

### Backend routes (`src/api.py`, 903 lines, 26 routes)
| Line | Method | Path |
|---|---|---|
| 54 | GET | `/` (static string, no DB check) |
| 59 | GET | `/health` (pings the DB with `SELECT 1`; this is what `railway.json`'s healthcheck targets) |
| 70 | POST | `/api/auth/signup` |
| 104 | POST | `/api/auth/login` |
| 127 | GET | `/api/auth/me` |
| 144 | PUT | `/api/auth/me` |
| 167 | POST | `/api/auth/encryption-setup` |
| 194 | POST | `/api/auth/change-password` |
| 231 | GET | `/api/transactions` (optional auth) |
| 266 | POST | `/api/transactions/import` |
| 374 | helper | `_apply_txn_patch` (shared by single PATCH + batch-update) |
| 450 | PATCH | `/api/transactions/{txn_id}` |
| 468 | PATCH | `/api/transactions/{txn_id}/category` (legacy alias) |
| 474 | POST | `/api/transactions/batch-update` |
| 503 | GET | `/api/import-batches` |
| 521 | DELETE | `/api/import-batches/{batch_id}` |
| 537 | POST | `/api/account/wipe-data` |
| 562 | POST | `/api/upload-csv` (requires auth -- Phase C closed finding 2.3) |
| 602 | GET | `/api/coaching/stats` |
| 626 | POST | `/api/categorize-local` |
| 696 | GET | `/api/category-rules` (requires auth) |
| 705 | POST | `/api/category-rules` (requires auth) |
| 726 | PATCH | `/api/category-rules/{rule_id}` (was PUT; requires auth) |
| 751 | DELETE | `/api/category-rules/{rule_id}` (requires auth) |
| 767 | helper | `_match_rule` |
| 799 | POST | `/api/categorize` (legacy bulk apply; requires auth) |
| 822 | POST | `/api/upload-csv-mapped` (requires auth) |
| 848 | POST | `/api/upload-pdf` (requires auth) |

### Backend routes (`src/routes/accounts.py`, 4 routes -- extracted from `api.py` in Phase 0)
Line count and per-route line numbers omitted -- Wave 1 is actively modifying this file (see section 6); run `grep -n "^@router\." src/routes/accounts.py` for current line numbers.
| Method | Path |
|---|---|
| GET | `/api/accounts` |
| POST | `/api/accounts` |
| PATCH | `/api/accounts/{account_id}` |
| DELETE | `/api/accounts/{account_id}` |

### Backend routes (`src/routes/plaid.py`, 6 routes -- extracted from `api.py` in Phase 0)
Line count and per-route line numbers omitted -- Wave 1 is actively modifying this file (see section 6); run `grep -n "^@router\." src/routes/plaid.py` for current line numbers.
| Method | Path |
|---|---|
| POST | `/api/plaid/link-token` |
| POST | `/api/plaid/exchange-token` |
| POST | `/api/plaid/sync` |
| GET | `/api/plaid/items` |
| DELETE | `/api/plaid/items/{item_id}` |
| POST | `/webhooks/plaid` |

**Still gone:** `GET /api/summary` and `POST /api/auth/verify-recovery` don't exist anywhere in `src/api.py` or `src/routes/` -- neither appears in any of the greps above. If something in this doc still references either, treat that reference as stale.

**NOT re-verified this session:** the "Frontend state", "Categorization" (frontend half), and "Where state lives" subsections below carry `App.jsx` line numbers from before the FE-CORE (`185e300`) and ENC-UI (`f885ff3`) lane commits touched `App.jsx` and the encryption UI. Re-grep `App.jsx` before trusting a specific line number there. The two backend line references inside "Categorization" below have been corrected.

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
- Backend entry: `POST /api/categorize-local` (`src/api.py:626`)
- Model: `src/categorize_local.py::_get_model` (lazy fastembed singleton)
- KNN: `src/categorize_local.py::categorize_by_neighbors` -- cosine via `<=>`, filtered to `category_source='manual'`
- Starter pack: `src/starter_rules.py::STARTER_RULES` (OUT-only)
- Rule matcher: `src/api.py::_match_rule` (`src/api.py:767`)

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
