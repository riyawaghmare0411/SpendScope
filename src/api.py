from dotenv import load_dotenv
load_dotenv(override=True)  # Load .env file - must be before other imports that use env vars

from fastapi import FastAPI, File, Form, UploadFile, Request, Depends, HTTPException
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
import json, os, re, uuid
from pathlib import Path
from src.database import get_db, init_db, async_session
from src.models import User, Account, ImportBatch, Transaction as TxnModel, CategoryRule, Budget, PlaidItem
from src.auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, get_optional_user,
    SignupRequest, LoginRequest, TokenResponse
)
# Phase 12: local-only categorization + stats coach. Zero Anthropic / Claude usage.
from src.categorize_local import embed_text, embed_many, categorize_by_neighbors
from src.starter_rules import match_starter_rule

app = FastAPI(title="SpendScope API")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent.parent / "data" / "processed"
DATA_DIR.mkdir(parents=True, exist_ok=True)


@app.on_event("startup")
async def startup():
    await init_db()


@app.get("/")
def root():
    return {"status": "SpendScope API is running"}


# --- Auth Endpoints ---

@app.post("/api/auth/signup")
async def signup(req: SignupRequest, db=Depends(get_db)):
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == req.email.lower()))
    if result.scalar_one_or_none():
        raise HTTPException(400, "Email already registered")

    user = User(
        email=req.email.lower(),
        password_hash=hash_password(req.password),
        name=req.name,
        country=req.country,
        currency=req.currency,
        encryption_salt=req.encryption_salt,
        recovery_codes_hash=req.recovery_codes_hash,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token({"sub": str(user.id), "email": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "country": user.country,
            "currency": user.currency,
        }
    }


@app.post("/api/auth/login")
async def login(req: LoginRequest, db=Depends(get_db)):
    result = await db.execute(select(User).where(User.email == req.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(req.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")

    token = create_access_token({"sub": str(user.id), "email": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "country": user.country,
            "currency": user.currency,
        }
    }


@app.get("/api/auth/me")
async def get_me(current_user=Depends(get_current_user), db=Depends(get_db)):
    result = await db.execute(select(User).where(User.id == uuid.UUID(current_user["user_id"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "country": user.country,
        "currency": user.currency,
        "encryption_salt": user.encryption_salt,
    }


@app.put("/api/auth/me")
async def update_me(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    data = await request.json()
    result = await db.execute(select(User).where(User.id == uuid.UUID(current_user["user_id"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    for field in ["name", "country", "currency"]:
        if field in data:
            setattr(user, field, data[field])

    await db.commit()
    await db.refresh(user)
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "country": user.country,
        "currency": user.currency,
    }


@app.post("/api/auth/encryption-setup")
async def encryption_setup(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Set up encryption for an existing user (migration path)."""
    data = await request.json()
    encryption_salt = data.get("encryption_salt")
    recovery_codes_hash = data.get("recovery_codes_hash")
    if not encryption_salt:
        raise HTTPException(400, "encryption_salt is required")

    result = await db.execute(select(User).where(User.id == uuid.UUID(current_user["user_id"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if user.encryption_salt:
        raise HTTPException(409, "Encryption already configured for this user")

    user.encryption_salt = encryption_salt
    user.recovery_codes_hash = recovery_codes_hash
    await db.commit()
    return {"status": "encryption_configured"}


@app.post("/api/auth/verify-recovery")
async def verify_recovery(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Verify a recovery code against stored hashes."""
    data = await request.json()
    code_hash = data.get("recovery_code_hash")
    if not code_hash:
        raise HTTPException(400, "recovery_code_hash is required")

    result = await db.execute(select(User).where(User.id == uuid.UUID(current_user["user_id"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if not user.recovery_codes_hash:
        raise HTTPException(404, "No recovery codes configured")

    stored_hashes = json.loads(user.recovery_codes_hash)
    if code_hash in stored_hashes:
        return {"valid": True}
    return {"valid": False}


# --- Transaction Endpoints ---

@app.get("/api/transactions")
async def get_transactions(user=Depends(get_optional_user), db=Depends(get_db)):
    if user:
        user_id = uuid.UUID(user["user_id"])
        result = await db.execute(
            select(TxnModel).where(TxnModel.user_id == user_id).order_by(TxnModel.date.desc())
        )
        txns = result.scalars().all()
        return [{
            "date_iso": t.date.isoformat(),
            "description": t.description,
            "merchant": t.merchant,
            "category": t.category,
            "type": t.type or "",
            "amount": float(t.amount),
            "money_in": float(t.amount) if t.direction == "IN" else 0,
            "money_out": float(t.amount) if t.direction == "OUT" else 0,
            "balance": float(t.balance) if t.balance else None,
            "direction": t.direction,
            "is_redacted": t.is_redacted,
            "encrypted_data": t.encrypted_data,
            "category_source": t.category_source,
            "id": str(t.id),
            "import_batch_id": str(t.import_batch_id) if t.import_batch_id else None,
            "account_id": str(t.account_id) if t.account_id else None,
        } for t in txns]

    # Fallback: read from JSON file (backward compat)
    json_path = DATA_DIR / "transactions_frontend.json"
    if json_path.exists():
        with open(json_path, 'r') as f:
            return json.load(f)
    return {"error": "No data found. Please upload a bank statement."}


@app.post("/api/transactions/import")
async def import_transactions(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    data = await request.json()
    user_id = uuid.UUID(current_user["user_id"])

    # Create or get account
    account_name = data.get("account_name", "Primary")
    result = await db.execute(
        select(Account).where(Account.user_id == user_id, Account.name == account_name)
    )
    account = result.scalar_one_or_none()
    if not account:
        account = Account(user_id=user_id, name=account_name, bank_name=data.get("bank_name", ""))
        db.add(account)
        await db.flush()

    # Create import batch
    batch = ImportBatch(
        user_id=user_id,
        account_id=account.id,
        source_filename=data.get("filename", ""),
        source_type=data.get("source_type", "csv"),
        bank_name=data.get("bank_name", ""),
        transaction_count=len(data.get("transactions", [])),
    )
    db.add(batch)
    await db.flush()

    # Insert transactions
    encrypted = data.get("encrypted", False)
    incoming = data.get("transactions", [])

    # Phase 12D: batch-embed merchant strings up front for speed (single ONNX inference).
    # Encrypted-mode transactions skip embedding (no plaintext merchant).
    if not encrypted and incoming:
        merchants_to_embed = [t.get("merchant") or t.get("description") or "" for t in incoming]
        embeddings = embed_many(merchants_to_embed)
    else:
        embeddings = [None] * len(incoming)

    from datetime import date as date_type
    for idx, t in enumerate(incoming):
        try:
            tx_date = date_type.fromisoformat(t["date_iso"])
        except (ValueError, KeyError):
            continue

        if encrypted:
            # Encrypted mode: store only date + encrypted blob
            enc_blob = t.get("encrypted_data")
            if not enc_blob:
                continue
            txn = TxnModel(
                import_batch_id=batch.id,
                account_id=account.id,
                user_id=user_id,
                date=tx_date,
                description="[encrypted]",
                amount=0,
                direction="OUT",
                encrypted_data=json.dumps(enc_blob) if isinstance(enc_blob, dict) else enc_blob,
            )
        else:
            amount = float(t.get("amount", 0) or t.get("money_out", 0) or t.get("money_in", 0))
            txn = TxnModel(
                import_batch_id=batch.id,
                account_id=account.id,
                user_id=user_id,
                date=tx_date,
                description=t.get("description", ""),
                merchant=t.get("merchant", ""),
                category=t.get("category", ""),
                type=t.get("type", ""),
                amount=round(amount, 2),
                balance=round(float(t.get("balance", 0) or 0), 2) if t.get("balance") else None,
                direction=t.get("direction", "OUT"),
                is_redacted=t.get("is_redacted", False),
                category_source=t.get("category_source", "auto"),
                embedding=embeddings[idx] if idx < len(embeddings) else None,
            )
        db.add(txn)

    await db.commit()
    return {
        "status": "imported",
        "batch_id": str(batch.id),
        "transaction_count": batch.transaction_count,
        "account": account_name,
    }


async def _apply_txn_patch(txn: TxnModel, data: dict) -> dict:
    """Apply a partial-update dict to a Transaction. Returns the changes applied."""
    changes = {}
    if "category" in data and data["category"] is not None:
        txn.category = str(data["category"])
        txn.category_source = "manual"
        changes["category"] = txn.category
    if "direction" in data and data["direction"] is not None:
        d = str(data["direction"]).upper()
        if d not in ("IN", "OUT"):
            raise HTTPException(400, "direction must be 'IN' or 'OUT'")
        txn.direction = d
        changes["direction"] = d
    if "amount" in data and data["amount"] is not None:
        try:
            amt = round(float(data["amount"]), 2)
        except (TypeError, ValueError):
            raise HTTPException(400, "amount must be a number")
        if amt <= 0:
            raise HTTPException(400, "amount must be > 0")
        txn.amount = amt
        changes["amount"] = amt
    if "merchant" in data and data["merchant"] is not None:
        m = str(data["merchant"]).strip()
        if m:
            txn.merchant = m[:255]
            changes["merchant"] = txn.merchant
            # Phase 12D: re-embed when merchant changes so KNN learns the corrected name.
            try:
                txn.embedding = embed_text(txn.merchant)
            except Exception:
                pass  # never block a category fix on embedding failure
    if "description" in data and data["description"] is not None:
        txn.description = str(data["description"])
        changes["description"] = txn.description
    return changes


@app.patch("/api/transactions/{txn_id}")
async def update_transaction(txn_id: str, request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Partial-update a transaction. Accepts any subset of:
       category, direction (IN|OUT), amount, merchant, description.
       Phase 11A: replaces the older /category-only PATCH."""
    data = await request.json()
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(TxnModel).where(TxnModel.id == uuid.UUID(txn_id), TxnModel.user_id == user_id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(404, "Transaction not found")
    changes = await _apply_txn_patch(txn, data)
    await db.commit()
    return {"status": "updated", "id": txn_id, "changes": changes}


@app.patch("/api/transactions/{txn_id}/category")
async def update_transaction_category(txn_id: str, request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Legacy alias kept for backward compatibility with older clients."""
    return await update_transaction(txn_id, request, current_user, db)


@app.post("/api/transactions/batch-update")
async def batch_update_transactions(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Phase 11C: apply the same patch to many transactions at once.
    Body: {ids: [str], changes: {category?, direction?, amount?, merchant?, description?}}
    """
    data = await request.json()
    ids = data.get("ids") or []
    changes = data.get("changes") or {}
    if not ids or not changes:
        raise HTTPException(400, "ids and changes are required")
    user_id = uuid.UUID(current_user["user_id"])
    try:
        uuid_ids = [uuid.UUID(i) for i in ids]
    except ValueError:
        raise HTTPException(400, "Invalid id in ids list")
    result = await db.execute(
        select(TxnModel).where(TxnModel.id.in_(uuid_ids), TxnModel.user_id == user_id)
    )
    txns = result.scalars().all()
    updated = 0
    for t in txns:
        await _apply_txn_patch(t, changes)
        updated += 1
    await db.commit()
    return {"status": "updated", "count": updated}


# --- Import Batch Endpoints ---

@app.get("/api/import-batches")
async def get_import_batches(current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(ImportBatch).where(ImportBatch.user_id == user_id).order_by(ImportBatch.imported_at.desc())
    )
    batches = result.scalars().all()
    return [{
        "id": str(b.id),
        "source_filename": b.source_filename,
        "source_type": b.source_type,
        "bank_name": b.bank_name,
        "transaction_count": b.transaction_count,
        "imported_at": b.imported_at.isoformat() if b.imported_at else None,
        "status": b.status,
    } for b in batches]


@app.delete("/api/import-batches/{batch_id}")
async def delete_import_batch(batch_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(ImportBatch).where(ImportBatch.id == uuid.UUID(batch_id), ImportBatch.user_id == user_id)
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(404, "Import batch not found")

    # Delete all transactions in this batch (CASCADE should handle this, but explicit is safer)
    await db.delete(batch)
    await db.commit()
    return {"status": "deleted", "batch_id": batch_id}


@app.post("/api/account/wipe-data")
async def wipe_user_data(current_user=Depends(get_current_user), db=Depends(get_db)):
    """Hard-delete every transaction, batch, account, plaid item, rule, budget for the
    current user. The User row + auth stay intact. Irreversible. (Phase 10A)"""
    from sqlalchemy import delete as sa_delete
    user_id = uuid.UUID(current_user["user_id"])

    # FK-safe order: rows that reference others first.
    counts = {}
    for model, key in [
        (TxnModel, "transactions"),
        (CategoryRule, "rules"),
        (Budget, "budgets"),
        (ImportBatch, "batches"),
        (Account, "accounts"),
        (PlaidItem, "plaid_items"),
    ]:
        r = await db.execute(sa_delete(model).where(model.user_id == user_id))
        counts[key] = r.rowcount or 0
    await db.commit()

    # Clear coach cache for this user (it's keyed by user_id string)
    return {"status": "wiped", "deleted": counts}


# --- Phase 10D: Account CRUD ---

def _account_to_dict(a: Account, txn_count: int = 0) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "bank_name": a.bank_name,
        "account_type": a.account_type,
        "currency": a.currency,
        "mask": a.mask,
        "subtype": a.subtype,
        "credit_limit": float(a.credit_limit) if a.credit_limit is not None else None,
        "current_balance": float(a.current_balance) if a.current_balance is not None else None,
        "available_balance": float(a.available_balance) if a.available_balance is not None else None,
        "due_day": a.due_day,
        "last_synced_at": a.last_synced_at.isoformat() if a.last_synced_at else None,
        "is_plaid": a.plaid_item_id is not None,
        "plaid_item_id": str(a.plaid_item_id) if a.plaid_item_id else None,
        "plaid_account_id": a.plaid_account_id,
        "transaction_count": txn_count,
    }


@app.get("/api/accounts")
async def list_accounts(current_user=Depends(get_current_user), db=Depends(get_db)):
    from sqlalchemy import func
    user_id = uuid.UUID(current_user["user_id"])
    accounts_r = await db.execute(select(Account).where(Account.user_id == user_id).order_by(Account.created_at))
    accounts = accounts_r.scalars().all()
    counts_r = await db.execute(
        select(TxnModel.account_id, func.count(TxnModel.id)).where(TxnModel.user_id == user_id).group_by(TxnModel.account_id)
    )
    counts = {row[0]: row[1] for row in counts_r}
    return [_account_to_dict(a, counts.get(a.id, 0)) for a in accounts]


@app.post("/api/accounts")
async def create_account(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    body = await request.json()
    name = (body.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "Account name is required")
    user_id = uuid.UUID(current_user["user_id"])
    user = await db.get(User, user_id)
    currency = body.get("currency") or (user.currency if user else "USD")
    account = Account(
        user_id=user_id,
        name=name,
        bank_name=body.get("bank_name") or "",
        account_type=body.get("account_type") or "checking",
        subtype=body.get("subtype"),
        currency=currency,
        credit_limit=body.get("credit_limit"),
        due_day=body.get("due_day"),
    )
    db.add(account)
    await db.commit()
    return _account_to_dict(account, 0)


@app.patch("/api/accounts/{account_id}")
async def update_account(account_id: str, request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    try:
        aid = uuid.UUID(account_id)
    except ValueError:
        raise HTTPException(400, "Invalid account_id")
    account = await db.get(Account, aid)
    if not account or account.user_id != user_id:
        raise HTTPException(404, "Account not found")

    body = await request.json()
    is_plaid = account.plaid_item_id is not None

    # due_day is always editable (Plaid doesn't reliably return statement due dates)
    if "due_day" in body:
        d = body["due_day"]
        if d is not None and not (1 <= int(d) <= 31):
            raise HTTPException(400, "due_day must be between 1 and 31")
        account.due_day = int(d) if d is not None else None
    # name editable for any account
    if "name" in body:
        new_name = (body["name"] or "").strip()
        if new_name:
            account.name = new_name
    # credit_limit editable only for non-Plaid accounts (Plaid is source of truth there)
    if "credit_limit" in body and not is_plaid:
        account.credit_limit = body["credit_limit"]

    await db.commit()
    return _account_to_dict(account, 0)


@app.delete("/api/accounts/{account_id}")
async def delete_account(account_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    from sqlalchemy import func, delete as sa_delete
    user_id = uuid.UUID(current_user["user_id"])
    try:
        aid = uuid.UUID(account_id)
    except ValueError:
        raise HTTPException(400, "Invalid account_id")
    account = await db.get(Account, aid)
    if not account or account.user_id != user_id:
        raise HTTPException(404, "Account not found")
    if account.plaid_item_id is not None:
        raise HTTPException(409, "This account is linked to a Plaid bank. Use Plaid Disconnect to remove it.")

    # Cascade-delete transactions and import batches for this account
    txn_count_r = await db.execute(select(func.count(TxnModel.id)).where(TxnModel.account_id == aid))
    txn_count = txn_count_r.scalar_one()
    await db.execute(sa_delete(TxnModel).where(TxnModel.account_id == aid))
    await db.execute(sa_delete(ImportBatch).where(ImportBatch.account_id == aid))
    await db.delete(account)
    await db.commit()
    return {"status": "deleted", "transactions_removed": txn_count}


@app.get("/api/summary")
def get_summary():
    json_path = DATA_DIR / "transactions_frontend.json"
    if not json_path.exists():
        return {"error": "No data found"}

    with open(json_path, 'r') as f:
        data = json.load(f)

    total_in = sum(t['money_in'] for t in data if t['direction'] == 'IN')
    total_out = sum(t['money_out'] for t in data if t['direction'] == 'OUT')

    categories = {}
    for t in data:
        if t['direction'] == 'OUT':
            categories[t['category']] = categories.get(t['category'], 0) + t['money_out']

    top_category = max(categories, key=categories.get) if categories else 'None'

    return {
        "total_income": round(total_in, 2),
        "total_spending": round(total_out, 2),
        "net": round(total_in - total_out, 2),
        "transactions": len(data),
        "top_category": top_category,
        "categories": {k: round(v, 2) for k, v in sorted(categories.items(), key=lambda x: -x[1])},
    }

@app.post("/api/upload-csv")
async def upload_csv(file: UploadFile = File(...)):
    """Parse a CSV bank statement and return transactions for user review."""
    from src.parsers.csv_parser import parse_csv
    from src.parsers.redaction_detector import detect_csv_redactions, flag_redacted_transactions

    content = await file.read()
    text = content.decode('utf-8-sig')  # handle BOM

    result = parse_csv(text)

    if result["unmapped"]:
        # Return headers and preview for column mapper UI
        return {
            "status": "needs_mapping",
            "headers": result["headers"],
            "preview_rows": result["preview_rows"],
            "filename": file.filename,
        }

    # Check for redactions
    redacted = detect_csv_redactions(result["transactions"])
    if redacted:
        result["transactions"] = flag_redacted_transactions(result["transactions"], redacted)

    return {
        "status": "parsed",
        "bank_name": result["bank_name"],
        "transactions": result["transactions"],
        "transaction_count": len(result["transactions"]),
        "has_redactions": len(redacted) > 0 if redacted else False,
        "filename": file.filename,
    }


# --- Phase 12E: Local Stats Coach (replaces 3 Claude coaching endpoints) ---

from src.stats_coach import compute_stats


@app.get("/api/coaching/stats")
async def get_coaching_stats(user=Depends(get_current_user), db=Depends(get_db)):
    """Deterministic financial stats. No LLM, no outbound calls. Replaces /coaching/plan*."""
    user_id = uuid.UUID(user["user_id"])
    user_row = await db.get(User, user_id)
    if not user_row:
        raise HTTPException(404, "User not found")
    txn_rows = await db.execute(
        select(TxnModel).where(TxnModel.user_id == user_id).order_by(TxnModel.date.desc())
    )
    transactions = [{
        "date_iso": t.date.isoformat(),
        "merchant": t.merchant,
        "description": t.description,
        "category": t.category,
        "money_in": float(t.amount) if t.direction == "IN" else 0,
        "money_out": float(t.amount) if t.direction == "OUT" else 0,
        "direction": t.direction,
    } for t in txn_rows.scalars().all() if not t.is_redacted and not t.encrypted_data]
    return compute_stats(transactions, user_row.currency or "$")


# --- Local Categorization Endpoint ---

@app.post("/api/categorize-local")
async def categorize_local(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Phase 12D: local merchant categorization. ZERO outbound network calls.

    Tier walk per item:
      1. User's own JSON rules (existing _match_rule)
      2. Vector KNN over the user's manually-categorized history (categorize_local.py)
      3. Starter pack of common UK + US merchants (starter_rules.py)
      4. 'Income' if direction == IN, else 'Other'

    Body: {"items": [{"merchant": str, "direction": "IN"|"OUT", "amount": float}, ...]}
    Returns: {"categories": {"<merchant>|<direction>": "Category", ...}}
    """
    body = await request.json()
    items = body.get("items", [])
    if not isinstance(items, list):
        raise HTTPException(400, "items must be a list of objects")
    if len(items) > 200:
        raise HTTPException(400, "Maximum 200 items per request")
    for it in items:
        if not isinstance(it, dict) or "merchant" not in it or "direction" not in it:
            raise HTTPException(400, "each item needs merchant and direction fields")
        if it["direction"] not in ("IN", "OUT"):
            raise HTTPException(400, "direction must be 'IN' or 'OUT'")

    user_id = uuid.UUID(current_user["user_id"])
    user_rules = _load_rules()
    out: dict[str, str] = {}
    for it in items:
        merchant = (it.get("merchant") or "").strip()
        direction = it["direction"]
        key = f"{merchant}|{direction}"
        # Tier 1: user-defined JSON rules
        cat = next((r.get("category") for r in user_rules if _match_rule(r, merchant)), None)
        # Tier 2: vector KNN over user's manually-categorized history
        if not cat:
            cat = await categorize_by_neighbors(user_id, merchant, direction, db)
        # Tier 3: starter pack -- OUT-direction only. Starter merchants are all
        # spend-side (Tesco, Wingstop, Spotify); applying to IN would mis-categorize salary.
        if not cat and direction == "OUT":
            cat = match_starter_rule(merchant)
        # Tier 4: direction-aware fallback
        if not cat:
            cat = "Income" if direction == "IN" else "Other"
        out[key] = cat
    return {"categories": out}


# --- Category Rules Endpoints ---

RULES_PATH = DATA_DIR / "category_rules.json"


def _load_rules() -> list:
    if RULES_PATH.exists():
        with open(RULES_PATH, "r") as f:
            return json.load(f)
    return []


def _save_rules(rules: list):
    with open(RULES_PATH, "w") as f:
        json.dump(rules, f, indent=2)


@app.get("/api/category-rules")
def get_category_rules():
    return _load_rules()


@app.post("/api/category-rules")
async def add_category_rule(request: Request):
    rule = await request.json()
    rules = _load_rules()
    rule["id"] = str(len(rules) + 1)
    rules.append(rule)
    _save_rules(rules)
    return rule


@app.put("/api/category-rules/{rule_id}")
async def update_category_rule(rule_id: str, request: Request):
    updates = await request.json()
    rules = _load_rules()
    for r in rules:
        if r["id"] == rule_id:
            r.update(updates)
            r["id"] = rule_id  # prevent ID overwrite
            _save_rules(rules)
            return r
    return {"error": "Rule not found"}, 404


@app.delete("/api/category-rules/{rule_id}")
def delete_category_rule(rule_id: str):
    rules = _load_rules()
    filtered = [r for r in rules if r["id"] != rule_id]
    if len(filtered) == len(rules):
        return {"error": "Rule not found"}
    _save_rules(filtered)
    return {"status": "deleted", "id": rule_id}


def _match_rule(rule: dict, text: str) -> bool:
    """Check if a rule matches the given text (case-insensitive)."""
    value = rule.get("match_value", "")
    match_type = rule.get("match_type", "contains")
    text_lower = text.lower()
    value_lower = value.lower()
    if match_type == "exact":
        return text_lower == value_lower
    elif match_type == "starts_with":
        return text_lower.startswith(value_lower)
    elif match_type == "contains":
        return value_lower in text_lower
    elif match_type == "regex":
        try:
            return bool(re.search(value, text, re.IGNORECASE))
        except re.error:
            return False
    return False


@app.post("/api/categorize")
async def categorize_transactions(request: Request):
    body = await request.json()
    transactions = body.get("transactions", [])
    rules = _load_rules()

    # Sort: highest priority first, then learned before manual
    rules.sort(key=lambda r: (-r.get("priority", 0), not r.get("is_learned", False)))

    for txn in transactions:
        merchant = txn.get("merchant", "") or txn.get("description", "") or ""
        for rule in rules:
            if _match_rule(rule, merchant):
                txn["category"] = rule["category"]
                txn["category_source"] = "learned" if rule.get("is_learned") else "rule"
                break

    return transactions


@app.post("/api/upload-csv-mapped")
async def upload_csv_mapped(file: UploadFile = File(...), mapping: str = Form(...)):
    """Parse CSV using user-provided column mapping."""
    import json as json_module
    from src.parsers.csv_parser import parse_with_mapping
    from src.parsers.redaction_detector import detect_csv_redactions, flag_redacted_transactions

    content = await file.read()
    text = content.decode('utf-8-sig')
    mapping_dict = json_module.loads(mapping)

    result = parse_with_mapping(text, mapping_dict)

    redacted = detect_csv_redactions(result["transactions"])
    if redacted:
        result["transactions"] = flag_redacted_transactions(result["transactions"], redacted)

    return {
        "status": "parsed",
        "bank_name": result.get("bank_name", "Custom"),
        "transactions": result["transactions"],
        "transaction_count": len(result["transactions"]),
        "has_redactions": len(redacted) > 0 if redacted else False,
    }


@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...)):
    """Parse a bank statement PDF and return transactions for user review."""
    from src.parsers.pdf_parser import parse_pdf
    from src.parsers.redaction_detector import detect_csv_redactions, flag_redacted_transactions

    content = await file.read()
    result = parse_pdf(content)

    if not result["recognized"]:
        return {
            "status": "unrecognized",
            "raw_text": result["raw_text"][:5000],  # first 5000 chars for review
            "message": "Could not recognize bank format. Raw text provided for review.",
            "filename": file.filename,
        }

    # Check for redactions
    redacted = detect_csv_redactions(result["transactions"])
    if redacted:
        result["transactions"] = flag_redacted_transactions(result["transactions"], redacted)

    return {
        "status": "parsed",
        "bank_name": result["bank_name"],
        "transactions": result["transactions"],
        "transaction_count": len(result["transactions"]),
        "has_redactions": len(redacted) > 0 if redacted else False,
        "filename": file.filename,
    }


# --- Phase 9: Plaid Bank Sync Endpoints ---

from src import plaid_service as ps
from sqlalchemy import update as sa_update
from datetime import datetime as _dt, timezone as _tz


async def _sync_plaid_item(plaid_item_id: uuid.UUID, user_id: uuid.UUID, db) -> dict:
    """Pull new/modified/removed transactions from Plaid for one Item.

    Phase 10C: routes transactions to one Account row per Plaid account_id
    (e.g. checking + credit card from same bank get separate Account rows).
    """
    from datetime import date as date_type

    item = await db.get(PlaidItem, plaid_item_id)
    if item is None:
        raise HTTPException(404, "PlaidItem not found")

    access_token = ps.decrypt_token(item.access_token_encrypted)

    all_added, all_modified, all_removed = [], [], []
    plaid_accounts_latest: dict[str, dict] = {}  # plaid_account_id -> account dict (last seen wins)
    cursor = item.sync_cursor
    iterations = 0
    while True:
        iterations += 1
        if iterations > 20:
            break  # safety cap
        result = ps.sync_transactions(access_token, cursor=cursor)
        all_added.extend(result["added"])
        all_modified.extend(result["modified"])
        all_removed.extend(result["removed"])
        for a in result.get("accounts", []) or []:
            aid = a.get("account_id")
            if aid:
                plaid_accounts_latest[aid] = a
        cursor = result["next_cursor"]
        if not result["has_more"]:
            break

    # Look up user currency once -- single currency per user (Phase 10 rule)
    user = await db.get(User, user_id)
    user_currency = (user.currency if user else None) or "USD"

    # Get-or-create one Account per Plaid account_id
    account_id_map: dict[str, uuid.UUID] = {}  # plaid_account_id -> Account.id
    for plaid_acc_id, acc in plaid_accounts_latest.items():
        balances = acc.get("balances") or {}
        # Try existing per-account row first
        r = await db.execute(select(Account).where(Account.plaid_account_id == plaid_acc_id))
        account = r.scalar_one_or_none()
        if account is None:
            display_name = acc.get("name") or acc.get("official_name") or item.institution_name or "Bank Account"
            account = Account(
                user_id=user_id,
                name=display_name,
                bank_name=item.institution_name or "",
                account_type=acc.get("type") or "depository",
                currency=user_currency,
                plaid_account_id=plaid_acc_id,
                plaid_item_id=item.id,
                mask=acc.get("mask"),
                subtype=acc.get("subtype"),
                credit_limit=balances.get("limit"),
                current_balance=balances.get("current"),
                available_balance=balances.get("available"),
                last_synced_at=_dt.now(_tz.utc),
            )
            db.add(account)
            await db.flush()
        else:
            # Refresh Plaid-sourced fields. Leave user-editable fields (due_day, name) alone.
            account.mask = acc.get("mask") or account.mask
            account.subtype = acc.get("subtype") or account.subtype
            account.credit_limit = balances.get("limit") if balances.get("limit") is not None else account.credit_limit
            account.current_balance = balances.get("current") if balances.get("current") is not None else account.current_balance
            account.available_balance = balances.get("available") if balances.get("available") is not None else account.available_balance
            account.plaid_item_id = item.id
            account.last_synced_at = _dt.now(_tz.utc)
        account_id_map[plaid_acc_id] = account.id

    # Fallback Account if a transaction has no matching plaid_account_id (rare)
    fallback_account_id = next(iter(account_id_map.values()), None)
    if fallback_account_id is None:
        # No accounts returned by sync (very first run with no transactions yet) -- create a stub
        stub = Account(
            user_id=user_id,
            name=item.institution_name or "Bank Account",
            bank_name=item.institution_name or "",
            currency=user_currency,
            plaid_item_id=item.id,
        )
        db.add(stub)
        await db.flush()
        fallback_account_id = stub.id

    sp_added = [ps.plaid_txn_to_spendscope(t) for t in all_added]

    # Group transactions by target Account so each gets its own ImportBatch
    by_account: dict[uuid.UUID, list[dict]] = {}
    for t in sp_added:
        target_id = account_id_map.get(t.get("_plaid_account_id"), fallback_account_id)
        by_account.setdefault(target_id, []).append(t)

    inserted = 0
    for acct_id, txns in by_account.items():
        if not txns:
            continue
        batch = ImportBatch(
            user_id=user_id,
            account_id=acct_id,
            plaid_item_id=item.id,
            source_filename=f"Plaid: {item.institution_name or 'Bank'}",
            source_type="plaid",
            bank_name=item.institution_name or "",
            transaction_count=len(txns),
            status="confirmed",
        )
        db.add(batch)
        await db.flush()
        for t in txns:
            try:
                tx_date = date_type.fromisoformat(t["date_iso"])
            except (ValueError, KeyError):
                continue
            txn = TxnModel(
                import_batch_id=batch.id,
                account_id=acct_id,
                user_id=user_id,
                date=tx_date,
                description=t.get("description", ""),
                merchant=t.get("merchant", ""),
                category=t.get("category", "Other"),
                type=t.get("type", ""),
                amount=round(float(t.get("amount", 0)), 2),
                balance=None,
                direction=t.get("direction", "OUT"),
                is_redacted=False,
                category_source="plaid",
            )
            db.add(txn)
            inserted += 1

    # modified/removed: defer to v2 (need plaid_transaction_id stored on Transaction first)

    item.sync_cursor = cursor
    item.last_synced_at = _dt.now(_tz.utc)
    await db.commit()

    return {"added": inserted, "modified": len(all_modified), "removed": len(all_removed), "accounts": len(account_id_map)}


@app.post("/api/plaid/link-token")
async def plaid_link_token(current_user=Depends(get_current_user)):
    """Create a link_token for the frontend to open Plaid Link."""
    if not ps.is_plaid_configured():
        raise HTTPException(503, "Plaid is not configured on this server")
    try:
        token = ps.create_link_token(current_user["user_id"])
        return {"link_token": token}
    except Exception as e:
        raise HTTPException(500, f"Failed to create link token: {e}")


@app.post("/api/plaid/exchange-token")
async def plaid_exchange_token(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Exchange public_token for permanent access_token, store encrypted, kick off initial sync."""
    if not ps.is_plaid_configured():
        raise HTTPException(503, "Plaid is not configured on this server")

    body = await request.json()
    public_token = body.get("public_token")
    if not public_token:
        raise HTTPException(400, "public_token is required")

    institution = body.get("institution") or {}
    institution_id = institution.get("institution_id") if isinstance(institution, dict) else None
    institution_name = institution.get("name") if isinstance(institution, dict) else None

    user_id = uuid.UUID(current_user["user_id"])

    try:
        result = ps.exchange_public_token(public_token)
    except Exception as e:
        raise HTTPException(500, f"Token exchange failed: {e}")

    encrypted = ps.encrypt_token(result["access_token"])
    plaid_item_id = result["item_id"]

    existing = await db.execute(select(PlaidItem).where(PlaidItem.item_id == plaid_item_id))
    existing_row = existing.scalar_one_or_none()
    if existing_row:
        existing_row.access_token_encrypted = encrypted
        existing_row.sync_status = "active"
        if institution_name:
            existing_row.institution_name = institution_name
        if institution_id:
            existing_row.institution_id = institution_id
        item_id_db = existing_row.id
    else:
        item = PlaidItem(
            user_id=user_id,
            item_id=plaid_item_id,
            access_token_encrypted=encrypted,
            institution_id=institution_id,
            institution_name=institution_name,
        )
        db.add(item)
        await db.flush()
        item_id_db = item.id

    await db.commit()

    try:
        sync_result = await _sync_plaid_item(item_id_db, user_id, db)
    except Exception as e:
        return {"item_id": str(item_id_db), "synced": False, "error": str(e)}

    return {"item_id": str(item_id_db), "synced": True, **sync_result}


@app.post("/api/plaid/sync")
async def plaid_sync(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Manually trigger a sync for one Item or all of the user's Items."""
    if not ps.is_plaid_configured():
        raise HTTPException(503, "Plaid is not configured on this server")

    user_id = uuid.UUID(current_user["user_id"])
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass

    target_id = body.get("item_id")
    if target_id:
        try:
            uid = uuid.UUID(target_id)
        except ValueError:
            raise HTTPException(400, "Invalid item_id")
        item_result = await db.execute(select(PlaidItem).where(PlaidItem.id == uid, PlaidItem.user_id == user_id))
        item = item_result.scalar_one_or_none()
        if not item:
            raise HTTPException(404, "PlaidItem not found")
        return await _sync_plaid_item(item.id, user_id, db)

    items_result = await db.execute(select(PlaidItem).where(PlaidItem.user_id == user_id, PlaidItem.sync_status == "active"))
    items = items_result.scalars().all()
    totals = {"added": 0, "modified": 0, "removed": 0, "items_synced": 0, "errors": []}
    for item in items:
        try:
            r = await _sync_plaid_item(item.id, user_id, db)
            totals["added"] += r["added"]
            totals["modified"] += r["modified"]
            totals["removed"] += r["removed"]
            totals["items_synced"] += 1
        except Exception as e:
            totals["errors"].append({"item_id": str(item.id), "error": str(e)})
    return totals


@app.get("/api/plaid/items")
async def plaid_list_items(current_user=Depends(get_current_user), db=Depends(get_db)):
    """List the user's connected Plaid Items (banks)."""
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(select(PlaidItem).where(PlaidItem.user_id == user_id).order_by(PlaidItem.created_at.desc()))
    items = result.scalars().all()
    return [
        {
            "id": str(item.id),
            "item_id": item.item_id,
            "institution_id": item.institution_id,
            "institution_name": item.institution_name,
            "sync_status": item.sync_status,
            "last_synced_at": item.last_synced_at.isoformat() if item.last_synced_at else None,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in items
    ]


@app.delete("/api/plaid/items/{item_id}")
async def plaid_delete_item(item_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Disconnect a Plaid Item. Transactions stay; only the live sync stops."""
    if not ps.is_plaid_configured():
        raise HTTPException(503, "Plaid is not configured on this server")

    user_id = uuid.UUID(current_user["user_id"])
    try:
        uid = uuid.UUID(item_id)
    except ValueError:
        raise HTTPException(400, "Invalid item_id")

    result = await db.execute(select(PlaidItem).where(PlaidItem.id == uid, PlaidItem.user_id == user_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(404, "PlaidItem not found")

    try:
        access_token = ps.decrypt_token(item.access_token_encrypted)
        ps.remove_item(access_token)
    except Exception:
        pass

    await db.execute(
        sa_update(ImportBatch).where(ImportBatch.plaid_item_id == item.id).values(plaid_item_id=None)
    )
    await db.delete(item)
    await db.commit()
    return {"status": "disconnected"}


@app.post("/webhooks/plaid")
async def plaid_webhook(request: Request, db=Depends(get_db)):
    """Plaid webhook receiver. Verifies signature and triggers sync on SYNC_UPDATES_AVAILABLE."""
    if not ps.is_plaid_configured():
        return {"status": "plaid_not_configured"}

    jwt_header = request.headers.get("Plaid-Verification", "")
    body_bytes = await request.body()

    try:
        payload = ps.verify_webhook(jwt_header, body_bytes)
    except ValueError as e:
        raise HTTPException(401, f"Webhook verification failed: {e}")

    webhook_type = payload.get("webhook_type")
    webhook_code = payload.get("webhook_code")
    item_id = payload.get("item_id")

    if webhook_type == "TRANSACTIONS" and webhook_code == "SYNC_UPDATES_AVAILABLE" and item_id:
        result = await db.execute(select(PlaidItem).where(PlaidItem.item_id == item_id))
        item = result.scalar_one_or_none()
        if item:
            try:
                await _sync_plaid_item(item.id, item.user_id, db)
            except Exception:
                pass

    return {"status": "ok", "webhook_code": webhook_code}
