# SpendScope

Privacy-first personal finance dashboard with universal bank statement parsing.

## Features

- **Universal Bank Statement Parser** -- CSV and PDF support for 24+ banks across UK, US, India, Georgia, and global providers
- **Privacy-First Architecture** -- Raw files are never stored; only parsed transaction data is saved after user confirmation
- **Auto-Categorization** -- 3-tier category system with inline editing, learned rules, and bulk rules
- **Import Batch Tracking** -- View and delete entire imports as a unit
- **Interactive Dashboard** -- Spending trends, category breakdown, merchant analysis, and cash flow forecasting
- **Column Mapper UI** -- Handles unrecognized CSV formats via manual column mapping
- **Redacted PDF Detection** -- Identifies and flags redacted bank statements
- **Dark Mode** -- Full dark theme support
- **Date Range Filters** -- Flexible time period selection across all views
- **Multi-Currency Support** -- Works with transactions in different currencies

## Supported Banks

| Region | Banks |
|--------|-------|
| UK | Lloyds, Barclays, HSBC, Monzo, Revolut, Starling, NatWest |
| US | Chase, Bank of America, Wells Fargo, Citi, Capital One, Amex, Discover |
| India | SBI, HDFC, ICICI, Axis, Kotak |
| Georgia | TBC Bank, Bank of Georgia |
| Global | Wise, N26 |

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
  Procfile              # Railway process definition
  railway.json          # Railway deployment config
```

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
- `GET /api/summary` -- Spending summary and analytics data

### Category Rules
- `GET /api/category-rules` -- List category rules
- `POST /api/category-rules` -- Create a category rule
- `PUT /api/category-rules/{id}` -- Update a category rule
- `DELETE /api/category-rules/{id}` -- Delete a category rule
- `POST /api/categorize` -- Apply category rules to transactions

---

Built by Riya
