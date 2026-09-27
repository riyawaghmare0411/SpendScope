"""Plaid bank-sync endpoints. Extracted verbatim from src/api.py (Phase 0 of the
SpendScope + MoneyMap integration) -- route paths and behavior are unchanged.
Wave 1's BP-ROUTES/BP-SVC lanes extend this file (webhook attention-states, fake
client selection, transaction_id upsert, liabilities, currency)."""

from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy import select, update as sa_update
import uuid
from datetime import datetime as _dt, timezone as _tz, date as date_type

from src.database import get_db
from src.models import User, Account, ImportBatch, Transaction as TxnModel, PlaidItem
from src.auth import get_current_user
from src import plaid_service as ps

router = APIRouter()


async def _sync_plaid_item(plaid_item_id: uuid.UUID, user_id: uuid.UUID, db) -> dict:
    """Pull new/modified/removed transactions from Plaid for one Item.

    Phase 10C: routes transactions to one Account row per Plaid account_id
    (e.g. checking + credit card from same bank get separate Account rows).
    """
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


@router.post("/api/plaid/link-token")
async def plaid_link_token(current_user=Depends(get_current_user)):
    """Create a link_token for the frontend to open Plaid Link."""
    if not ps.is_plaid_configured():
        raise HTTPException(503, "Plaid is not configured on this server")
    try:
        token = ps.create_link_token(current_user["user_id"])
        return {"link_token": token}
    except Exception as e:
        raise HTTPException(500, f"Failed to create link token: {e}")


@router.post("/api/plaid/exchange-token")
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


@router.post("/api/plaid/sync")
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


@router.get("/api/plaid/items")
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


@router.delete("/api/plaid/items/{item_id}")
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


@router.post("/webhooks/plaid")
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
