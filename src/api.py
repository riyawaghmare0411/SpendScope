from dotenv import load_dotenv
load_dotenv(override=True)  # Load .env file - must be before other imports that use env vars

from fastapi import FastAPI, File, Form, UploadFile, Request, Depends, HTTPException
from fastapi.responses import StreamingResponse
import asyncio
import time as _time
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
from src.ai_coach import generate_plan, generate_plan_stream, categorize_merchants

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

_coach_cache: dict[str, tuple[dict, float]] = {}
COACH_CACHE_TTL = 3600  # 1 hour


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
    for t in data.get("transactions", []):
        from datetime import date as date_type
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
            )
        db.add(txn)

    await db.commit()
    _coach_cache.pop(str(user_id), None)

    return {
        "status": "imported",
        "batch_id": str(batch.id),
        "transaction_count": batch.transaction_count,
        "account": account_name,
    }


@app.patch("/api/transactions/{txn_id}/category")
async def update_transaction_category(txn_id: str, request: Request, current_user=Depends(get_current_user), db=Depends(get_db)):
    data = await request.json()
    user_id = uuid.UUID(current_user["user_id"])
    result = await db.execute(
        select(TxnModel).where(TxnModel.id == uuid.UUID(txn_id), TxnModel.user_id == user_id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        raise HTTPException(404, "Transaction not found")

    txn.category = data.get("category", txn.category)
    txn.category_source = "manual"
    await db.commit()
    return {"status": "updated", "id": txn_id, "category": txn.category}


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


# --- AI Coaching Endpoint ---

@app.post("/api/coaching/plan")
async def get_coaching_plan(request: Request, user=Depends(get_current_user), db=Depends(get_db)):
    """Generate a personalized financial coaching plan from user's transactions."""
    user_id = uuid.UUID(user["user_id"])

    # Fetch user record for currency + name
    user_result = await db.execute(select(User).where(User.id == user_id))
    user_row = user_result.scalar_one_or_none()
    if not user_row:
        raise HTTPException(404, "User not found")

    # Fetch transactions
    txn_result = await db.execute(
        select(TxnModel).where(TxnModel.user_id == user_id).order_by(TxnModel.date.desc())
    )
    txns = txn_result.scalars().all()
    if not txns:
        raise HTTPException(400, "No transactions found. Import a bank statement first.")

    transactions = [{
        "date_iso": t.date.isoformat(),
        "description": t.description,
        "merchant": t.merchant,
        "category": t.category,
        "type": t.type or "",
        "money_in": float(t.amount) if t.direction == "IN" else 0,
        "money_out": float(t.amount) if t.direction == "OUT" else 0,
        "balance": float(t.balance) if t.balance else None,
        "direction": t.direction,
    } for t in txns if not t.is_redacted and not t.encrypted_data]

    if not transactions:
        raise HTTPException(400, "No unencrypted transactions available for coaching.")

    # Optional debt info from request body
    body = {}
    try:
        body = await request.json()
    except Exception:
        pass
    debt_info = body.get("debt_info")

    result = await generate_plan(
        transactions=transactions,
        user_currency=user_row.currency or "$",
        user_name=user_row.name or "",
        debt_info=debt_info,
    )
    return result



@app.get("/api/coaching/plan-cached")
async def get_cached_plan(user=Depends(get_current_user)):
    """Return cached coaching plan if fresh."""
    cache_key = str(uuid.UUID(user["user_id"]))
    if cache_key in _coach_cache:
        plan_data, cached_at = _coach_cache[cache_key]
        if _time.time() - cached_at < COACH_CACHE_TTL:
            return {"cached": True, "cached_at": cached_at, **plan_data}
    raise HTTPException(404, "No cached plan")


@app.post("/api/coaching/plan-stream")
async def stream_coaching_plan(request: Request, user=Depends(get_current_user), db=Depends(get_db)):
    """Stream coaching plan tokens via SSE."""
    user_id = uuid.UUID(user["user_id"])
    user_result = await db.execute(select(User).where(User.id == user_id))
    user_row = user_result.scalar_one_or_none()
    if not user_row:
        raise HTTPException(404, "User not found")
    result = await db.execute(select(TxnModel).where(TxnModel.user_id == user_id))
    txns = result.scalars().all()
    transactions = [{"date_iso": str(t.date), "description": t.description or "", "merchant": t.merchant or "", "category": t.category or "Other", "type": t.type or "", "amount": float(t.amount or 0), "money_in": float(t.amount) if t.direction == "IN" else 0, "money_out": float(t.amount) if t.direction != "IN" else 0, "balance": float(t.balance) if t.balance else None, "direction": t.direction} for t in txns if not t.is_redacted and not t.encrypted_data]

    if not transactions:
        async def empty():
            yield f"data: {json.dumps({'error': 'No transactions'})}\n\n"
        return StreamingResponse(empty(), media_type="text/event-stream")

    body = {}
    try: body = await request.json()
    except: pass

    async def event_stream():
        plan_result = None
        async for chunk in generate_plan_stream(transactions, user_row.currency or "$", user_row.name or "", body.get("debt_info")):
            if "done" in chunk and chunk["done"]:
                plan_result = chunk
                _coach_cache[str(user_id)] = (chunk, _time.time())
            yield f"data: {json.dumps(chunk)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# --- AI Categorization Endpoint ---

@app.post("/api/categorize-ai")
async def categorize_ai(request: Request):
    """Use AI to categorize unknown transactions in bulk.

    Body: {"items": [{"merchant": str, "direction": "IN"|"OUT", "amount": float}, ...]}
    Returns: {"categories": {"<merchant>|<direction>": "Category", ...}}
    """
    body = await request.json()
    items = body.get("items", [])
    if not isinstance(items, list):
        raise HTTPException(400, "items must be a list of objects")
    if len(items) > 50:
        raise HTTPException(400, "Maximum 50 items per request")
    for it in items:
        if not isinstance(it, dict) or "merchant" not in it or "direction" not in it:
            raise HTTPException(400, "each item needs merchant and direction fields")
        if it["direction"] not in ("IN", "OUT"):
            raise HTTPException(400, "direction must be 'IN' or 'OUT'")

    categories = await categorize_merchants(items)
    return {"categories": categories}


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

    Reuses the existing ImportBatch + Transaction insert pattern.
    """
    from datetime import date as date_type

    item = await db.get(PlaidItem, plaid_item_id)
    if item is None:
        raise HTTPException(404, "PlaidItem not found")

    access_token = ps.decrypt_token(item.access_token_encrypted)

    all_added, all_modified, all_removed = [], [], []
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
        cursor = result["next_cursor"]
        if not result["has_more"]:
            break

    # Get-or-create Account row
    account_name = item.institution_name or "Bank Account"
    account_result = await db.execute(
        select(Account).where(Account.user_id == user_id, Account.name == account_name)
    )
    account = account_result.scalar_one_or_none()
    if not account:
        account = Account(user_id=user_id, name=account_name, bank_name=item.institution_name or "")
        db.add(account)
        await db.flush()

    sp_added = [ps.plaid_txn_to_spendscope(t) for t in all_added]

    inserted = 0
    if sp_added:
        batch = ImportBatch(
            user_id=user_id,
            account_id=account.id,
            plaid_item_id=item.id,
            source_filename=f"Plaid: {item.institution_name or 'Bank'}",
            source_type="plaid",
            bank_name=item.institution_name or "",
            transaction_count=len(sp_added),
            status="confirmed",
        )
        db.add(batch)
        await db.flush()

        for t in sp_added:
            try:
                tx_date = date_type.fromisoformat(t["date_iso"])
            except (ValueError, KeyError):
                continue
            txn = TxnModel(
                import_batch_id=batch.id,
                account_id=account.id,
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

    _coach_cache.pop(str(user_id), None)

    return {"added": inserted, "modified": len(all_modified), "removed": len(all_removed)}


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
