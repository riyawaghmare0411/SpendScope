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
  Procfile -> Railway/Heroku process definition
  railway.json -> Railway deployment config (Dockerfile builder, health check on /)
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

## API Endpoints (Current)
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
