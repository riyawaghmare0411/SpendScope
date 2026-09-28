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
from src import plaid_fake
from src.plaid_sync import sync_item as _sync_plaid_item_impl

router = APIRouter()


async def _sync_plaid_item(plaid_item_id: uuid.UUID, user_id: uuid.UUID, db) -> dict:
    """Pull new/modified/removed transactions from Plaid for one Item.

    Thin wrapper delegating to src.plaid_sync.sync_item (Wave 1 BP-SVC lane): looks up
    the PlaidItem row and hands it off, keeping this function's signature and return
    shape ({added, modified, removed, accounts}) unchanged for existing call sites below.
    """
    item = await db.get(PlaidItem, plaid_item_id)
    if item is None:
        raise HTTPException(404, "PlaidItem not found")

    return await _sync_plaid_item_impl(item, user_id, db, client=plaid_fake.get_client())


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
