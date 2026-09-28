# SpendScope

Privacy-first personal finance dashboard with universal bank statement parsing.

## Features

- **CSV-First Bank Statement Import** -- 24 built-in templates across UK, US, India, Georgia, and global providers, auto-detected from the file's headers, plus a column-mapper UI so **any bank on earth** can be imported via manual mapping
- **PDF Import (Lloyds and Bank of America only, paused)** -- Adding more per-bank PDF parsers is a deliberate non-goal; CSV is the universal path. The backend still classifies why an unsupported PDF didn't import (recognized-but-unparsed, scanned/unreadable, unrecognized bank, or a bad file) and the app shows you that reason instead of a silent zero-transaction result
- **Privacy-First Architecture** -- Raw files are never stored; only parsed transaction data is saved after user confirmation
- **Auto-Categorization** -- 4-tier pipeline: your own category rules, then vector similarity search (pgvector) over your past corrections, then an ~80-merchant starter keyword pack, then a direction-based fallback (Income/Other)
- **Import Batch Tracking** -- View and delete entire imports as a unit
- **Interactive Dashboard** -- Spending trends, category breakdown, merchant analysis, and cash flow forecasting
- **Redacted PDF Detection** -- Identifies and flags redacted bank statements
- **Dark Mode** -- Full dark theme support
- **Date Range Filters** -- Flexible time period selection across all views
- **Multi-Currency Support** -- Works with transactions in different currencies

## Supported Banks

**CSV import** works for every bank below via a built-in template, auto-detected from your file's column headers -- and for any other bank via the manual column-mapper UI.

| Region | Banks (CSV template) |
|--------|-------|
| UK | Lloyds, Barclays, HSBC, Monzo, Revolut, Starling, NatWest |
| US | Chase, Bank of America, Wells Fargo, Citi, Capital One, Amex, Discover, US Generic |
| India | SBI, HDFC, ICICI, Axis, Kotak |
| Georgia | TBC Bank, Bank of Georgia |
| Global | Wise, N26 |

**PDF import** currently only parses **Lloyds** and **Bank of America** statements, and there's no plan to add more bank-specific PDF parsers -- CSV (built-in template or the manual column-mapper) is the universal path. A handful of other UK banks' PDF formats (Barclays, HSBC, NatWest, Santander, Monzo, Starling) are recognized well enough to tell you it can't be read yet and to export CSV instead; a scanned/image-only PDF is flagged as such; anything else gets a clear "could not recognize this format" message. None of these fail silently with zero transactions and no explanation.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 7, Tailwind CSS 4, Recharts |
| Backend | FastAPI, Python 3.13, SQLAlchemy 2.0 (async) |
| Database | PostgreSQL 16 (asyncpg) |
| Auth | JWT (python-jose), bcrypt (passlib) |
| PDF Parsing | PyMuPDF |
| CSV Parsing | Template-based auto-detection (24 bank templates) |

## Quick Start (Local Development)

### Prerequisites

- Node.js 20+
- Python 3.13+
- Docker (for PostgreSQL)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/SpendScope.git
cd SpendScope
```

### 2. Set up the Python environment

```bash
python -m venv ../spendscope_venv
# Linux/macOS
source ../spendscope_venv/bin/activate
# Windows (Git Bash)
source ../spendscope_venv/Scripts/activate

pip install -r requirements.txt
```

### 3. Start PostgreSQL

```bash
docker-compose up -d
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` as needed. The defaults work for local development.

### 5. Start the backend

```bash
uvicorn src.api:app --reload --port 8000
```

### 6. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

### 7. Open the app

Navigate to [http://localhost:5173](http://localhost:5173)

## Cloud Deployment

### Backend -- Railway

1. Connect your GitHub repository to [Railway](https://railway.app)
2. Railway auto-detects the Dockerfile
3. Add a PostgreSQL plugin for the database
4. Set environment variables in the Railway dashboard:
   - `DATABASE_URL` -- provided by the PostgreSQL plugin
   - `JWT_SECRET` -- a strong random string
   - `CORS_ORIGINS` -- your Vercel frontend URL

### Frontend -- Vercel

1. Connect your GitHub repository to [Vercel](https://vercel.com)
2. Set the root directory to `frontend`
3. Set environment variable:
   - `VITE_API_URL` -- your Railway backend URL (e.g. `https://spendscope-production.up.railway.app`)

### Database -- Railway PostgreSQL

Railway provides a managed PostgreSQL instance via its plugin system. The `DATABASE_URL` is automatically available to your backend service.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string (asyncpg) | `postgresql+asyncpg://spendscope:spendscope_dev@localhost:5432/spendscope` |
| `JWT_SECRET` | Secret key for signing JWT tokens | `your-secret-key-change-in-production` |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | Token expiry in minutes | `60` |
| `CORS_ORIGINS` | Comma-separated allowed origins | `http://localhost:5173,http://127.0.0.1:5173` |
| `API_HOST` | Backend host | `127.0.0.1` |
| `API_PORT` | Backend port | `8000` |

## Project Structure

```
SpendScope/
  src/
    api.py              # FastAPI application and route handlers
    auth.py             # JWT authentication and password hashing
    database.py         # Async SQLAlchemy engine and session setup
    models.py           # SQLAlchemy ORM models
    parsers/
      csv_parser.py     # CSV parsing with 24 bank templates
      pdf_parser.py     # PDF statement parsing via PyMuPDF
      redaction_detector.py  # Redacted PDF detection
  frontend/
    src/
      App.jsx           # Main React application
      main.jsx          # Entry point
  docker-compose.yml    # PostgreSQL container
  requirements.txt      # Python dependencies
  Dockerfile            # Production container build
  railway.json          # Railway deployment config (Dockerfile builder, health check on /health)
```

**MoneyMap integration, Phase 0 (committed, `f6386c9`):** account CRUD and Plaid/webhook routes have been extracted out of `src/api.py` into `src/routes/accounts.py` and `src/routes/plaid.py`. New `src/plan_types.py` (pure dataclasses, no SQLAlchemy) and `src/plan_models.py` (SQLAlchemy ORM, 5 new tables) lay the groundwork for a forecast/planning engine, alongside signature-only skeleton modules (`money.py`, `timeutil.py`, `plaid_privacy.py`, `plaid_sync.py`, `plaid_fake.py`) that Wave 1's parallel lanes are now filling in (uncommitted) -- see `HANDOFF.md` section 6 for current status.

## API Endpoints

### Auth
- `POST /api/auth/signup` -- Create a new account
- `POST /api/auth/login` -- Authenticate and receive JWT
- `GET /api/auth/me` -- Get current user profile
- `PUT /api/auth/me` -- Update user profile

### Transactions
- `GET /api/transactions` -- List transactions (with filters)
- `POST /api/transactions/import` -- Import parsed transactions
- `PATCH /api/transactions/{id}/category` -- Update transaction category

### Import Batches
- `GET /api/import-batches` -- List import batches
- `DELETE /api/import-batches/{id}` -- Delete an import batch and its transactions

### Parsing
- `POST /api/upload-csv` -- Parse a CSV bank statement
- `POST /api/upload-csv-mapped` -- Parse CSV with manual column mapping
- `POST /api/upload-pdf` -- Parse a PDF bank statement

### Analytics
- `GET /api/coaching/stats` -- Deterministic financial summary (savings rate, monthly in/out, top categories/merchants, projected end-of-month, ranked action items). No LLM, no outbound calls.

### Category Rules
- `GET /api/category-rules` -- List category rules
- `POST /api/category-rules` -- Create a category rule
- `PATCH /api/category-rules/{id}` -- Update a category rule
- `DELETE /api/category-rules/{id}` -- Delete a category rule
- `POST /api/categorize` -- Apply category rules to transactions

## Bank Sync (Plaid)

Optional, opt-in bank connection via Plaid (sandbox-tested against UK and US institutions). Exchanging a public token for an access token stores that access token Fernet-encrypted at rest; SpendScope then syncs transactions on demand and via a Plaid webhook, creating one Account per Plaid account. Manual CSV/PDF upload is fully independent of Plaid and remains the privacy-max path. Plaid is not yet supported for encrypted accounts -- see Encryption below.

## Vector Search (pgvector)

The second tier of the categorization pipeline uses the `pgvector` Postgres extension's cosine-distance operator (`<=>`) over 384-dimension embeddings of your own previously-corrected transactions (BAAI/bge-small-en-v1.5, run locally via fastembed/ONNX -- no external API calls). It only learns from manually-corrected rows, so it can't reinforce its own mistakes, and it only ever matches against your own transaction history, never another user's.

## Encryption (Option A: envelope encryption)

Optional, opt-in client-side encryption of the two most sensitive fields on each transaction -- merchant and description. Amount, date, direction, category, and balance stay server-readable so charts, budgets, and categorization keep working even for encrypted accounts.
- A random per-account Data Encryption Key (DEK) is generated in the browser and is never sent to the server in plaintext.
- The DEK is wrapped once under a key derived from your password, and once per recovery code -- any one of your password or your 10 recovery codes unwraps the same DEK.
- Recovery codes are shown once, at setup. Losing both the password and every recovery code means the encrypted fields are permanently unreadable -- there is no server-side backdoor.
- This is a checkpoint, not a finished feature. Server-side recovery-code verification, a migration path for pre-encryption accounts, and Plaid support for encrypted accounts are all still open -- see `HANDOFF.md` for current status before relying on it.

---

Built by Riya
