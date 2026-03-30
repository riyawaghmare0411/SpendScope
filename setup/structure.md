# SpendScope -- File Structure Reference

## Project Root
```
SpendScope/
├── setup/
│   ├── kt.md                          # Knowledge transfer doc (this project's rules + architecture)
│   └── structure.md                    # This file (file reference + changelog)
├── docker-compose.yml                    # PostgreSQL 16-alpine container config
├── src/
│   ├── __init__.py                       # Package init
│   ├── api.py                          # FastAPI backend (193 lines) -- endpoints, PDF parser, CORS
│   ├── database.py                     # Async SQLAlchemy engine, sessions, Base
│   ├── models.py                       # 7 models: User, Account, ImportBatch, Transaction, CategoryRule, Budget, CsvTemplate
│   ├── auth.py                         # JWT + bcrypt auth, FastAPI dependencies, Pydantic schemas
│   └── parsers/
│       ├── __init__.py                 # Parser module init
│       ├── csv_parser.py               # Template-based CSV parser with auto-detection
│       ├── pdf_parser.py               # Template-based PDF parser (Lloyds support)
│       ├── redaction_detector.py        # Detects redacted content in bank statements
│       └── templates/                  # 24 bank template JSON files
├── frontend/
│   ├── src/
│   │   ├── App.jsx                     # Main React component (538 lines) -- state, handlers, data pipeline, routing
│   │   ├── constants.js                # Shared constants, themes, helpers, formatters (165 lines)
│   │   ├── components/
│   │   │   ├── ui.jsx                  # Reusable UI primitives: Sphere, Counter, SkeletonBlock, HealthRing, VelocityGauge, Tip, PieTip (98 lines)
│   │   │   ├── AuthPages.jsx           # Login + Signup forms (79 lines)
│   │   │   ├── DashboardPage.jsx       # Overview with stats, charts, activity (87 lines)
│   │   │   ├── SpendingPage.jsx        # Spending analysis (46 lines)
│   │   │   ├── MerchantsPage.jsx       # Merchant breakdown (33 lines)
│   │   │   ├── TransactionsPage.jsx    # Transaction list with inline editing (53 lines)
│   │   │   ├── CalendarPage.jsx        # Calendar heatmap (20 lines)
│   │   │   ├── InsightsPage.jsx        # Insights and subscriptions (51 lines)
│   │   │   ├── RulesPage.jsx           # Category rules CRUD (141 lines)
│   │   │   ├── UploadPage.jsx          # Upload, import confirmation, column mapper (210 lines)
│   │   │   ├── Sidebar.jsx             # Navigation sidebar (53 lines)
│   │   │   └── ProfileModal.jsx        # Profile editing modal (18 lines)
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
├── Procfile                            # Railway/Heroku process definition
├── railway.json                        # Railway deployment config (Dockerfile builder, health check on /)
├── README.md                           # Full project documentation (setup, deployment, API reference)
├── requirements.txt                    # 116 Python packages (FastAPI, PyMuPDF, pandas, jupyter, etc.)
├── requirements.prod.txt               # Slim production dependencies (no Jupyter/Windows packages)
└── .claude/
    └── settings.local.json             # Claude Code permission settings
```

## Key Files Detail

### src/api.py
- FastAPI app with CORS middleware
- 5 endpoints: health, transactions, summary, upload CSV, upload PDF
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
- 116 total packages (many are transitive jupyter deps)

## External Dependencies
- **Venv**: `D:\Projects\spendscope_venv` (Python 3.13.12, sibling directory)
- **Git remote**: https://github.com/riyawaghmare0411/SpendScope.git
- **node_modules**: Not committed, needs `npm install` in frontend/

---

## Changelog

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
- Procfile: Railway/Heroku process definition for backend
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
