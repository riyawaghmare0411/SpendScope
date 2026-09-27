"""Account CRUD endpoints. Extracted verbatim from src/api.py (Phase 0 of the
SpendScope + MoneyMap integration) -- route paths and behavior are unchanged.
Wave 1's BP-ACCT lane extends this file with the new Plaid/manual-debt fields."""

from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy import select, func, delete as sa_delete
import uuid

from src.database import get_db
from src.models import User, Account, ImportBatch, Transaction as TxnModel
from src.auth import get_current_user

router = APIRouter()


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


@router.get("/api/accounts")
async def list_accounts(current_user=Depends(get_current_user), db=Depends(get_db)):
    user_id = uuid.UUID(current_user["user_id"])
    accounts_r = await db.execute(select(Account).where(Account.user_id == user_id).order_by(Account.created_at))
    accounts = accounts_r.scalars().all()
    counts_r = await db.execute(
        select(TxnModel.account_id, func.count(TxnModel.id)).where(TxnModel.user_id == user_id).group_by(TxnModel.account_id)
    )
    counts = {row[0]: row[1] for row in counts_r}
    return [_account_to_dict(a, counts.get(a.id, 0)) for a in accounts]


@router.post("/api/accounts")
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


@router.patch("/api/accounts/{account_id}")
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


@router.delete("/api/accounts/{account_id}")
async def delete_account(account_id: str, current_user=Depends(get_current_user), db=Depends(get_db)):
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
