from dotenv import load_dotenv
load_dotenv(override=True)  # Load .env file - must be before other imports that use env vars

from fastapi import FastAPI, File, Form, UploadFile, Request, Depends, HTTPException
import asyncio
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
import json, os, re, uuid, hashlib
from contextlib import asynccontextmanager
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="SpendScope API", lifespan=lifespan)

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

from src.routes.accounts import router as accounts_router
from src.routes.plaid import router as plaid_router
from src.routes.plan import router as plan_router
app.include_router(accounts_router)
app.include_router(plaid_router)
app.include_router(plan_router)

DATA_DIR = Path(__file__).parent.parent / "data" / "processed"
DATA_DIR.mkdir(parents=True, exist_ok=True)

# CONTRACT-3: the only transaction fields that ever move into encrypted_data for an
# encrypted row. Identical list lives in frontend/src/lib/crypto.js.
ENCRYPTED_FIELDS = ("merchant", "description")


@app.get("/")
def root():
    return {"status": "SpendScope API is running"}


@app.get("/health")
async def health(db=Depends(get_db)):
    try:
        await db.execute(text("SELECT 1"))
        return {"status": "ok", "db": "ok"}
    except Exception:
        return JSONResponse(status_code=503, content={"status": "degraded", "db": "unreachable"})


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
            "encryption_salt": user.encryption_salt,
            "wrapped_dek": user.wrapped_dek,
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
            "encryption_salt": user.encryption_salt,
            "wrapped_dek": user.wrapped_dek,
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
        "wrapped_dek": user.wrapped_dek,
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
    """Set up envelope encryption for a user. Client sends only the salt and the
    DEK already wrapped under the password/recovery-code KEKs -- the server never
    sees a plaintext recovery code or a derivable key."""
    data = await request.json()
    if data.get("recovery_codes") or data.get("recovery_codes_hash"):
        raise HTTPException(400, "recovery codes must not be sent to the server; they are used client-side only")

    encryption_salt = data.get("encryption_salt")
    wrapped_dek = data.get("wrapped_dek")
    if not encryption_salt or not wrapped_dek:
        raise HTTPException(400, "encryption_salt and wrapped_dek are required")

    result = await db.execute(select(User).where(User.id == uuid.UUID(current_user["user_id"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if user.encryption_salt or user.wrapped_dek:
        raise HTTPException(409, "Encryption already configured for this user")

    user.encryption_salt = encryption_salt
    user.wrapped_dek = wrapped_dek if isinstance(wrapped_dek, str) else json.dumps(wrapped_dek)
    await db.commit()
    return {"status": "encryption_configured"}


@app.post("/api/auth/change-password")
async def change_password(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Change the account login password. If encryption is configured for this user,
    the SAME request must include a wrapped_dek re-wrapped under the new password --
    changing the password alone would leave the stored envelope permanently unopenable
    (it's still wrapped under the old password's KEK), orphaning the DEK forever."""
    data = await request.json()
    current_password = data.get("current_password")
    new_password = data.get("new_password")
    if not current_password:
        raise HTTPException(400, "current_password is required")
    if not new_password or len(new_password) < 8:
        raise HTTPException(400, "new_password must be at least 8 characters")

    result = await db.execute(select(User).where(User.id == uuid.UUID(current_user["user_id"])))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(401, "Current password is incorrect")

    wrapped_dek = data.get("wrapped_dek")
    if user.encryption_salt:
        if not isinstance(wrapped_dek, dict) or not all(k in wrapped_dek for k in ("v", "password", "recovery")):
            raise HTTPException(400, "wrapped_dek must be a full envelope with v, password, and recovery")
    elif "wrapped_dek" in data:
        raise HTTPException(400, "wrapped_dek must not be sent; encryption is not configured for this account")

    user.password_hash = hash_password(new_password)
    if wrapped_dek is not None:
        user.wrapped_dek = json.dumps(wrapped_dek)
    await db.commit()
    return {"status": "password_changed"}


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

    user_row = await db.get(User, user_id)
    if encrypted:
        if not user_row or not user_row.wrapped_dek:
            raise HTTPException(400, "Encryption is not configured for this user; cannot import encrypted transactions")
    elif user_row and user_row.wrapped_dek:
        raise HTTPException(400, "This account has encryption enabled; plaintext imports are rejected. Log in again to unlock encryption.")

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
            # Option A: only merchant + description are encrypted. Real amount, date,
            # direction, category, type and balance stay plaintext so Coach/charts/
            # insights keep working. merchant stays NULL server-side (no plaintext).
            enc_blob = t.get("encrypted_data")
            if not enc_blob:
                continue
            amount = float(t.get("amount", 0) or t.get("money_out", 0) or t.get("money_in", 0))
            txn = TxnModel(
                import_batch_id=batch.id,
                account_id=account.id,
                user_id=user_id,
                date=tx_date,
                # CONTRACT-3: encrypted fields never get plaintext values -- description is
                # NOT NULL so it gets "", the nullable merchant column gets None.
                **{f: ("" if f == "description" else None) for f in ENCRYPTED_FIELDS},
                category=t.get("category", ""),
                type=t.get("type", ""),
                amount=round(amount, 2),
                balance=round(float(t.get("balance", 0) or 0), 2) if t.get("balance") else None,
                direction=t.get("direction", "OUT"),
                is_redacted=t.get("is_redacted", False),
                category_source=t.get("category_source", "auto"),
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
    if txn.encrypted_data:
        # Encrypted row (Option A): merchant/description live only inside encrypted_data.
        # Never write plaintext into those columns -- an updated encrypted_data blob from
        # the client is the only way to change them. No re-embedding either (no plaintext merchant).
        has_new_blob = "encrypted_data" in data and data["encrypted_data"] is not None
        wants_merchant_or_desc = any(data.get(f) is not None for f in ENCRYPTED_FIELDS)
        if wants_merchant_or_desc and not has_new_blob:
            raise HTTPException(
                400,
                "This transaction's merchant/description are encrypted. Submit a "
                "re-encrypted encrypted_data blob to change them -- plaintext merchant/"
                "description cannot be applied to an encrypted row.",
            )
        if has_new_blob:
            blob = data["encrypted_data"]
            txn.encrypted_data = json.dumps(blob) if isinstance(blob, dict) else blob
            changes["encrypted_data"] = True
    else:
        # Plaintext row. A client may supply encrypted_data here to convert this row to
        # encrypted. Never silently ignore that blob (doing so would write plaintext while
        # reporting success -- the mirror of the encrypted-row bug above).
        new_blob = data.get("encrypted_data")
        wants_plaintext = any(data.get(f) is not None for f in ENCRYPTED_FIELDS)
        if new_blob is not None:
            if wants_plaintext:
                raise HTTPException(
                    400,
                    "Ambiguous update: supply either plaintext merchant/description OR an "
                    "encrypted_data blob, not both.",
                )
            txn.encrypted_data = json.dumps(new_blob) if isinstance(new_blob, dict) else new_blob
            # merchant/description now live inside the blob; clear the plaintext columns
            # and the embedding derived from the old plaintext merchant.
            txn.merchant = None
            txn.description = ""
            txn.embedding = None
            changes["encrypted_data"] = True
        else:
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
    from src import plan_models
    user_id = uuid.UUID(current_user["user_id"])

    # FK-safe order: rows that reference others first. Phase 0 (MoneyMap integration) adds
    # the plan-engine tables: PlanEvent/BalanceUpdate/RecurringRule reference accounts (SET
    # NULL/CASCADE) so they go first; PlanBalance/PlanSettings reference only the user row
    # so they can go last, alongside the rest of the user-only tables.
    counts = {}
    for model, key in [
        (plan_models.PlanEvent, "plan_events"),
        (plan_models.BalanceUpdate, "balance_updates"),
        (plan_models.RecurringRule, "recurring_rules"),
        (TxnModel, "transactions"),
        (CategoryRule, "rules"),
        (Budget, "budgets"),
        (ImportBatch, "batches"),
        (Account, "accounts"),
        (PlaidItem, "plaid_items"),
        (plan_models.PlanBalance, "plan_balances"),
        (plan_models.PlanSettings, "plan_settings"),
    ]:
        r = await db.execute(sa_delete(model).where(model.user_id == user_id))
        counts[key] = r.rowcount or 0
    await db.commit()

    # Clear coach cache for this user (it's keyed by user_id string)
    return {"status": "wiped", "deleted": counts}


@app.post("/api/upload-csv")
async def upload_csv(file: UploadFile = File(...), current_user=Depends(get_current_user)):
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
    } for t in txn_rows.scalars().all() if not t.is_redacted]
    return compute_stats(transactions, user_row.currency or "$")


# --- Local Categorization Endpoint ---

@app.post("/api/categorize-local")
async def categorize_local(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    """Phase 12D: local merchant categorization. ZERO outbound network calls.

    Tier walk per item:
      1. User's own DB-backed CategoryRule rows (existing _match_rule)
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
    rules_r = await db.execute(select(CategoryRule).where(CategoryRule.user_id == user_id))
    user_rules = [{"match_type": r.match_type, "match_value": r.match_value, "category": r.category, "direction": r.direction}
                  for r in rules_r.scalars().all()]
    out: dict[str, str] = {}
    for it in items:
        merchant = (it.get("merchant") or "").strip()
        direction = it["direction"]
        key = f"{merchant}|{direction}"
        # Tier 1: user-scoped DB rules. A rule with a set direction only applies to
        # items of that same direction (an OUT-only rule must not match IN transactions).
        cat = next((r.get("category") for r in user_rules
                    if (not r.get("direction") or r.get("direction") == direction) and _match_rule(r, merchant)), None)
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
# Phase C: migrated from the global data/processed/category_rules.json file to the
# user-scoped CategoryRule DB table. The old JSON file is abandoned -- left on disk,
# no longer read or written. Its orphan rules have no owning user and are not migrated.


def _rule_to_dict(r: CategoryRule) -> dict:
    return {
        "id": str(r.id),
        "match_type": r.match_type,
        "match_value": r.match_value,
        "direction": r.direction,
        "category": r.category,
        "is_learned": r.is_learned,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@app.get("/api/category-rules")
async def get_category_rules(current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(CategoryRule).where(CategoryRule.user_id == user_id).order_by(CategoryRule.created_at)
    )
    return [_rule_to_dict(r) for r in result.scalars().all()]


@app.post("/api/category-rules")
async def add_category_rule(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    body = await request.json()
    match_value = (body.get("match_value") or "").strip()
    if not match_value:
        raise HTTPException(400, "match_value is required")
    user_id = uuid.UUID(current_user["user_id"])
    rule = CategoryRule(
        user_id=user_id,
        match_type=body.get("match_type", "contains"),
        match_value=match_value,
        direction=body.get("direction"),
        category=body.get("category", ""),
        is_learned=bool(body.get("is_learned", False)),
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return _rule_to_dict(rule)


@app.patch("/api/category-rules/{rule_id}")
async def update_category_rule(rule_id: str, request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    try:
        rid = uuid.UUID(rule_id)
    except ValueError:
        raise HTTPException(400, "Invalid rule_id")
    rule = await db.get(CategoryRule, rid)
    if not rule or rule.user_id != user_id:
        raise HTTPException(404, "Rule not found")

    body = await request.json()
    if "match_value" in body:
        mv = (body["match_value"] or "").strip()
        if not mv:
            raise HTTPException(400, "match_value cannot be empty")
        rule.match_value = mv
    if "category" in body and body["category"] is not None:
        rule.category = body["category"]

    await db.commit()
    await db.refresh(rule)
    return _rule_to_dict(rule)


@app.delete("/api/category-rules/{rule_id}")
async def delete_category_rule(rule_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    try:
        rid = uuid.UUID(rule_id)
    except ValueError:
        raise HTTPException(400, "Invalid rule_id")
    rule = await db.get(CategoryRule, rid)
    if not rule or rule.user_id != user_id:
        raise HTTPException(404, "Rule not found")

    await db.delete(rule)
    await db.commit()
    return {"status": "deleted", "id": rule_id}


def _match_rule(rule: dict, text: str) -> bool:
    """Check if a rule matches the given text (case-insensitive).

    Phase 22: A rule with no `match_value` (or an empty one) was previously
    treated as `contains ""` which matches EVERY merchant -- so a single bad
    rule could brand the entire dataset with one category. Now we explicitly
    treat empty-value rules as no-match. Same idea: an empty regex is a no-match.
    Fall back to `merchant` field if `match_value` is absent (legacy shape from
    a since-fixed frontend bug).
    """
    value = rule.get("match_value")
    if not value:
        value = rule.get("merchant", "")  # legacy shape compatibility
    if not value:
        return False
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
async def categorize_transactions(request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    body = await request.json()
    transactions = body.get("transactions", [])
    user_id = uuid.UUID(current_user["user_id"])
    rules_r = await db.execute(select(CategoryRule).where(CategoryRule.user_id == user_id))
    rules = [{"match_type": r.match_type, "match_value": r.match_value, "category": r.category,
              "priority": r.priority, "is_learned": r.is_learned} for r in rules_r.scalars().all()]

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
async def upload_csv_mapped(file: UploadFile = File(...), mapping: str = Form(...), current_user=Depends(get_current_user)):
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
async def upload_pdf(file: UploadFile = File(...), current_user=Depends(get_current_user)):
    """Parse a bank statement PDF and return transactions for user review."""
    from src.parsers.pdf_parser import parse_pdf
    from src.parsers.redaction_detector import detect_csv_redactions, flag_redacted_transactions

    content = await file.read()
    result = parse_pdf(content)
    reason = result.get("reason")
    detected_bank = result.get("detected_bank")

    page_count = None
    try:
        import fitz
        _doc = fitz.open(stream=content, filetype="pdf")
        page_count = _doc.page_count
        _doc.close()
    except Exception:
        pass
    print(f"[upload-pdf] filename={file.filename} size_bytes={len(content)} page_count={page_count} "
          f"extracted_chars={len(result.get('raw_text', ''))} detected_bank={detected_bank} "
          f"reason={reason} sha256={hashlib.sha256(content).hexdigest()}")

    if not result["recognized"]:
        if reason == "no_parser":
            message = (f"We recognized your {detected_bank} statement but can't read "
                       f"{detected_bank} PDFs yet -- please export CSV instead")
        elif reason == "scanned":
            message = "This looks like a scanned image; text could not be extracted -- please export CSV instead"
        elif reason == "open_error":
            message = result.get("error", "Could not open PDF")
        else:
            message = "Could not recognize bank format. Raw text provided for review."
        return {
            "status": "unrecognized",
            "raw_text": result["raw_text"][:5000],  # first 5000 chars for review
            "message": message,
            "filename": file.filename,
            "reason": reason,
            "detected_bank": detected_bank,
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

