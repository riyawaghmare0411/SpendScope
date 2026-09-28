# SpendScope -- Knowledge Transfer

## What Is SpendScope?
A commercial personal finance dashboard. Users upload bank statements (CSV/PDF from any bank worldwide), transactions are auto-categorized, and spending is visualized with charts, budgets, insights, and anomaly detection. Privacy-first: raw files are never stored, only parsed transaction data after user confirmation.

## Tech Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 19 + Vite 7 + Tailwind CSS 4 | Single-page app |
| Charts | Recharts 3.8 | Pie, bar, area charts |
| CSV Parsing | PapaParse 5.5 (client-side) | Flexible column detection |
| PDF Export | jsPDF 4.2 | Dashboard export to PDF |
| Backend | FastAPI 0.135 + Uvicorn 0.42 | Python ASGI server |
| PDF Parsing | PyMuPDF (fitz) 1.27 | Extract text from bank PDFs |
| Data | pandas 3.0, numpy 2.4 | Data processing in notebooks |
| Notebooks | Jupyter/JupyterLab | Exploratory analysis |
| Database | PostgreSQL 16 + SQLAlchemy 2 (async) | Docker container via docker-compose.yml |
| Auth | JWT (python-jose) + bcrypt (passlib) | Signup/login/profile endpoints, token-based |
| Deployment | Railway (backend) + Vercel (frontend) | Docker-based backend, Vite SPA frontend |

## Architecture
```
frontend/ (React SPA)
  -> Fetches from http://127.0.0.1:8000/api/* (FastAPI backend)
  -> Falls back to /demo_data.json if backend unavailable
  -> All chart rendering, categorization, budgets handled client-side
  -> State persisted in localStorage (username, budgets, accounts, currency, spendscope_learned_rules, spendscope_bulk_rules, spendscope_token, spendscope_user)

src/api.py (FastAPI backend)
  -> Serves transaction data from JSON files
  -> Parses uploaded PDFs (currently Lloyds-only)
  -> CORS enabled for local development

data/
  -> synthetic/ -- demo/test data (committed)
  -> processed/ -- parsed transactions JSON (gitignored)
  -> raw/ -- uploaded bank PDFs (gitignored)
```

## Deployment Architecture
```
Production:
  Backend  -> Railway (auto-detects Dockerfile, PostgreSQL plugin)
  Frontend -> Vercel (VITE_API_URL env var points to Railway backend URL)
  Database -> Railway PostgreSQL plugin

Docker:
  Dockerfile -> python:3.13-slim, non-root user, requirements.prod.txt
  .dockerignore -> excludes frontend/, .env, test data, .claude/
  railway.json -> Railway deployment config (Dockerfile builder, health check on /health -- moved from / in 08362aa/F-1)
  frontend/vercel.json -> Vercel SPA config (vite framework, rewrites to index.html)
```

## Development Setup
```bash
# Database
docker-compose up -d   # starts PostgreSQL

# Backend
source /d/Projects/spendscope_venv/Scripts/activate
cd /d/Projects/SpendScope/.claude/worktrees/focused-knuth
python -m uvicorn src.api:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

## Conventions
- Venv lives at `D:\Projects\spendscope_venv` (sibling, not inside project)
- Python 3.13.12
- No emojis in code or docs
- Privacy first: never store raw bank files, only parsed data
- Every import must be confirmed by user before saving
- Import batches are trackable and deletable
- kt.md and structure.md updated after every change

## Key Design Decisions
1. **Client-side CSV parsing**: PapaParse runs in browser for privacy. Backend only needed for PDF.
2. **Merchant categorization**: Hardcoded keyword map in App.jsx (~88 merchants). Will evolve to user-editable rules.
3. **No database yet**: localStorage + JSON files. PostgreSQL migration planned (Milestone 4).
4. **UK-centric data**: Demo data and merchant mappings are UK-focused. Expanding to global (US, India, Georgia).
5. **Modular frontend**: App.jsx refactored from 1524 to 538 lines (M6). Shared constants in constants.js, reusable UI primitives in components/ui.jsx, 11 page/layout components in components/.
6. **Template-based bank parsing**: 24 bank templates in src/parsers/templates/ covering UK (7), US (8), India (5), Georgia (2), Global (2). Templates define column mappings and header patterns for auto-detection. New banks are added by creating a JSON template file.
7. **One Account per Plaid account_id** (Phase 10): `_sync_plaid_item` creates one Account row per Plaid `account_id` (previously one-per-Item). Each Plaid account in an Item gets its own ImportBatch + Account with mask/subtype/balances/credit_limit refreshed every sync. PlaidItem.accounts back-populates with `ON DELETE CASCADE`.
8. **Idempotent ALTER TABLE migration strategy** (Phase 10): `src/database.py` runs `ADD COLUMN IF NOT EXISTS` block after `metadata.create_all` on every startup (Postgres 9.6+). Avoids Alembic dependency for additive schema changes; safe to re-run.
9. **Manual due_day entry** (Phase 10): Plaid does not surface statement/due dates reliably, so the Account.due_day column is user-entered via the AccountCardsRow edit button. Powers the due-date countdown and "due in <= 7 days" alert.
10. **Single Postgres container for relational + vector data** (Phase 12): switched docker-compose.yml from `postgres:16-alpine` to `pgvector/pgvector:pg16` (same Postgres 16, volume preserved). One DB, one consistency model, simpler backups -- no separate vector store.
11. **KNN learns only from manual edits** (Phase 12): `categorize_by_neighbors` filters to `category_source='manual'` rows so the matcher cannot amplify its own auto-categorizations into mistakes. Every Phase 11 PATCH re-embeds and teaches the matcher.
12. **Direction-aware categorization throughout** (Phase 12): merchant string alone never decides category. Wingstop salary IN vs Wingstop meal OUT must yield different categories, so KNN, starter rules, and PATCH logic all gate on direction.
13. **Starter pack is OUT-only** (Phase 12): `src/starter_rules.py` (~80 UK + US merchant keywords) applies only to OUT direction. IN-direction defaults to Income unless KNN finds a real neighbor -- avoids miscategorizing salary deposits as "Groceries" when payer name happens to match Tesco.
14. **Embedding model: bge-small-en-v1.5 via fastembed** (Phase 12): 384-dim English embeddings, MIT license, ~80MB. Uses fastembed (ONNX runtime) instead of sentence-transformers (PyTorch) -- 4x smaller install, fits Railway image budget. Lazy singleton -- only loads on first `/api/categorize-local` call.
15. **Stats coach replaces LLM coach** (Phase 12): `src/stats_coach.py` is deterministic Python (savings rate, monthly avg, top categories/merchants, projected EOM, daily allowance, week-over-week, encouragement). ~20ms for 10k txns, no API key, no streaming. Path A (local Ollama LLM) deferred -- adds onboarding friction for marginal benefit over hard numbers.
16. **Zero outbound calls to Anthropic** (Phase 12): `src/ai_coach.py` deleted (501 lines), `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` removed from .env + .env.example, `_coach_cache` / `COACH_CACHE_TTL` / `StreamingResponse` import removed from api.py. The httpx package stays only because Plaid uses it (and Plaid is opt-in -- manual CSV/PDF upload remains the privacy-max alternative).

## Phase 13-23 + A-E Summary (appended 2026-09-13, source: `git log --oneline`)

Note: the "API Endpoints" table below (now titled "Historical") and the "9. UK-only merchant mapping" / model counts elsewhere in this file predate everything in this section. **Corrected counts:** `src/api.py` is 903 lines with 26 routes (verified via `grep -c '@app\.' src/api.py`); the other 10 routes (account CRUD + Plaid/webhook) were extracted into `src/routes/accounts.py` and `src/routes/plaid.py` by Phase 0 of the MoneyMap integration (commit `f6386c9` -- see `HANDOFF.md` section 6), so it's 36 routes total across all three files. `src/models.py` has 8 SQLAlchemy models (added `PlaidItem`). Full current route table lives in `HANDOFF.md` section 13 -- treat the table below as historical only.

17. **Phase 13 -- production deploy hardening** (`761c203`, `1cf6d24`, `1665720`): Dockerfile bakes the fastembed model at build and adds `libgomp1`; Railway's Postgres image switched to `pgvector/pgvector:pg16`; startup migration block backfilled with the Phase 7 (`users.encryption_salt`/`recovery_codes_hash`, `transactions.encrypted_data`) + Phase 9 (`import_batches.plaid_item_id`) ALTERs that earlier deploys had missed (verified via `git show 1cf6d24` -- Phase 10/12's own ALTERs were already present from their own commits; nothing to backfill there).

18. **Phase 14A-14E -- production polish** (`0348713`, `4c56617`, `1a90a9d`, `a6c1976`, `548463a`): fixed the `ALL_CATEGORIES` dropdown (derive from `CAT_COLORS` instead of a stale hardcoded list), rewrote Calendar as daily-spend cells with a subscription overlay, moved the cash-flow forecast above the fold, rebuilt Coach as a ranked action tracker, and added Rules-page UX polish that later proved to be the wrong direction (see decision 22).

19. **Phase 16-20 -- multi-file upload + account management** (`9dd36b4`): 401/session-expired handling on Coach and Wipe actions; multi-file upload rewritten around a `pendingImports` array; new `AccountsListPanel.jsx`; fixed same-bank multi-file imports silently merging into one account; fixed a sticky-header overlap caused by a hex-alpha background.

20. **Phase 21+22+23 -- timezone, rule-shape, and refresh bugs** (`0a688bd`): Calendar's forward arrow used a UTC-based date slice and froze in positive-offset timezones (fixed with integer year/month math); a category rule with an empty `match_value` matched every merchant (fixed by treating empty as no-match); the transaction edit modal's save handler never refreshed from the server after a local mutation (fixed by calling `refreshTransactions()`).

21. **Phase A+B -- stop data-loss bugs, add a real test/CI safety net** (`0f0e24a`): a whole-codebase audit (see the plan file) found encryption silently auto-enabling on every signup with no way to disable it, a destructive "Apply Rules to All" button that overwrote every category including manual ones, and expired-session 401s that silently left imports as "Other" instead of failing loudly. Also: the `_test_*.py` scripts were gitignored and never ran in CI; moved into tracked `tests/`, made to `sys.exit(1)` on failure, and wired into a new `.github/workflows/ci.yml`.

22. **Phase C -- authenticate rules/upload endpoints, migrate rules to the DB** (`1da9c02`): category rules had been a single server-wide JSON file with unauthenticated read/write endpoints -- any user could read or corrupt any other user's learned rules. Moved rules into the `category_rules` table scoped by `user_id`, added a `direction` column, and put auth on every rules/upload endpoint and `/api/categorize`.

23. **Phase D -- honest PDF failure modes** (`630141b`): `pdf_parser.py` used to return zero transactions with no explanation for a bank it recognized-but-couldn't-parse, or for a scanned/image PDF -- indistinguishable from "unknown format". Now returns a distinct `reason` (`parsed`/`no_parser`/`scanned`/`unknown_bank`/`open_error`). Still only Lloyds and Bank of America are actually parsed -- CSV (24 templates) remains the universal path. **Correction:** `parsed_empty` (a recognized bank whose parser found zero rows) was NOT part of this commit -- it was added later by the PARSERS lane commit `c6c1c72` (verified via `git log -S"parsed_empty" -- src/parsers/pdf_parser.py`, one hit, `c6c1c72`).

24. **Phase E -- envelope encryption, Option A** (`34131e9` checkpoint, refined by lane commits `185e300`/`f885ff3`/`08362aa` on 2026-09-13): the prior encryption design derived one key directly from the password, so a recovery code (which derives a *different* key) could never open the data -- recovery was broken by construction. Rebuilt as envelope encryption: a random DEK encrypts `merchant` + `description` only, wrapped once under a password-derived key and once per recovery code, so any valid credential unwraps the same DEK. Single source of truth for which fields are encrypted (`ENCRYPTED_FIELDS` in `crypto.js`) plus a version tag on every payload (`PAYLOAD_VERSION`) so the field set can widen later (Option C) without a rewrite -- this was an explicit hard requirement from Riya. Known gaps (no server-side recovery verification, Plaid writes plaintext for encrypted users, legacy salt-only accounts have no migration path) are tracked in `HANDOFF.md` section 10.

25. **Migration ordering + fail-loud startup** (BE lane, `08362aa`, F-2/MISC-1): `src/database.py::init_db` used to run `CREATE EXTENSION IF NOT EXISTS vector` as the last item in the ALTER list, after `metadata.create_all` -- fragile, since `models.py` declares a `Vector(384)` column whose type must exist before `create_all` can create the table (this is exactly what broke CI run `34768509314`: `asyncpg.exceptions.UndefinedObjectError: type "vector" does not exist`). Reordered: the extension is created first in its own transaction, then `create_all`, then every ALTER/CREATE INDEX statement in its own transaction. Each statement that fails now logs `[migration] FAILED: <stmt>` and **re-raises** (was: one shared transaction, print-only, silently continued) -- a broken migration now fails the boot instead of reporting healthy. Same commit replaced `@app.on_event("startup")` with a `lifespan` asynccontextmanager passed to `FastAPI(lifespan=...)` (MISC-1; `init_db()` still runs once at startup), and added `GET /health` (F-1) which runs `SELECT 1` through `get_db`, with `railway.json`'s healthcheck now pointed at `/health` instead of `/`.

## Roadmap (Active Plan)
See `C:\Users\riyaw\.claude\plans\robust-scribbling-bengio.md` for full plan.
- M0: Documentation (this file) -- DONE
- M1: Audit + fix bugs + get app running
- M2: Universal bank parser + import confirmation page
- M3: Editable categories (inline + learned + bulk rules)
- M4: PostgreSQL + auth (email + Google/GitHub OAuth)
- M5: Cloud deployment (Railway + Vercel) -- DONE
- M6: Component refactor + polish -- DONE
- Phase 10: Multi-card unified dashboard + data wipe -- DONE
- Phase 11: Editable Transactions -- DONE
- Phase 12: Local Vector Categorization + Stats Coach (Claude removal) -- DONE

## API Endpoints (Historical -- see HANDOFF.md section 13 for the current table)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/api/transactions` | All transactions from JSON file |
| GET | `/api/summary` | Income/spending totals, category breakdown |
| POST | `/api/upload-csv` | CSV upload with template auto-detection (replaces old /api/upload) |
| POST | `/api/upload-csv-mapped` | Parse CSV with user-provided column mapping |
| POST | `/api/upload-pdf` | Parse bank PDF using template-based parser module |
| GET | `/api/category-rules` | List all category rules |
| POST | `/api/category-rules` | Add a new rule |
| PUT | `/api/category-rules/{id}` | Update a rule |
| DELETE | `/api/category-rules/{id}` | Delete a rule |
| POST | `/api/categorize` | Apply rules to transactions |
| POST | `/api/auth/signup` | Register new user (email, password, country, currency) |
| POST | `/api/auth/login` | Login, returns JWT token |
| GET | `/api/auth/me` | Get current user profile (requires auth) |
| PUT | `/api/auth/me` | Update user profile (requires auth) |
| POST | `/api/transactions/import` | Save confirmed transactions to DB (requires auth) |
| PATCH | `/api/transactions/{id}/category` | Update transaction category in DB (requires auth) |
| GET | `/api/import-batches` | List import batches (requires auth) |
| DELETE | `/api/import-batches/{id}` | Delete import batch + cascaded transactions (requires auth) |

## Frontend Pages
- **Overview**: Stats cards, spending chart, category pie chart
- **Spending**: Detailed spending breakdown by category
- **Transactions**: Filterable transaction list
- **Merchants**: Top merchants by spend
- **Calendar**: Bill calendar with predicted charges
- **Insights**: Anomaly detection, subscriptions, savings tips, peer comparison
- **Upload**: CSV/PDF file upload
- **Rules**: Category rule management (add/edit/delete bulk rules, view learned rules, export/import JSON)

## Known Issues (Pre-Milestone 1)
1. ~~`data/processed/` directory not auto-created -- backend fails on fresh clone~~ **FIXED**
2. CSV upload endpoint is a no-op
3. ~~API URL hardcoded to localhost in App.jsx~~ **FIXED**: now uses VITE_API_URL env var
4. ~~PDF parser only works with Lloyds bank format~~ **PARTIALLY FIXED**: now template-based and extensible (24 bank templates)
5. Categories empty from PDF parse (must be categorized client-side)
6. ~~CORS allows all origins~~ **FIXED**: now parameterized via CORS_ORIGINS env var
7. ~~Pydantic imported but unused~~ **NOT AN ISSUE**: Pydantic is not imported in api.py
8. ~~850-line monolith App.jsx~~ **FIXED**: Split into 13 modules (M6), App.jsx now 538 lines
9. UK-only merchant mapping
10. ~~No authentication or database~~ **FIXED**: PostgreSQL + JWT auth added in Milestone 4

**Note:** `.env` and `.env.example` configuration files were added in Milestone 1.

**Note:** bcrypt 5.0.0 is incompatible with passlib 1.7.4. Pinned to `bcrypt==4.0.1` in both requirements.txt and requirements.prod.txt (discovered during M4 testing).
