"""Account CRUD endpoints. Extracted verbatim from src/api.py (Phase 0 of the
SpendScope + MoneyMap integration) -- route paths and behavior are unchanged.
Wave 1's BP-ACCT lane extends this file with the new Plaid/manual-debt fields."""

from fastapi import APIRouter, Request, Depends, HTTPException
from sqlalchemy import select, func, delete as sa_delete
import uuid
from datetime import date

from src.database import get_db
from src.models import User, Account, ImportBatch, Transaction as TxnModel
from src.auth import get_current_user
from src import plaid_privacy

router = APIRouter()


def _account_to_dict(a: Account, txn_count: int = 0) -> dict:
    return {
        "id": str(a.id),
        "name": a.name,
        "bank_name": a.bank_name,
        "account_type": a.account_type,
        "currency": a.currency,
        "subtype": a.subtype,
        "credit_limit": float(a.credit_limit) if a.credit_limit is not None else None,
        "current_balance": float(a.current_balance) if a.current_balance is not None else None,
        "available_balance": float(a.available_balance) if a.available_balance is not None else None,
        "due_day": a.due_day,
        "last_synced_at": a.last_synced_at.isoformat() if a.last_synced_at else None,
        "kind": a.kind,
        "counts_as_cash": a.counts_as_cash,
        "statement_balance": float(a.statement_balance) if a.statement_balance is not None else None,
        "minimum_payment": float(a.minimum_payment) if a.minimum_payment is not None else None,
        "next_due_date": a.next_due_date.isoformat() if a.next_due_date else None,
        "apr_bps": a.apr_bps,
        "balance_as_of": a.balance_as_of.isoformat() if a.balance_as_of else None,
        "term_months": a.term_months,
        "balance_source": a.balance_source,
        "is_plaid": a.plaid_item_id is not None,
        "plaid_item_id": str(a.plaid_item_id) if a.plaid_item_id else None,
        # Plaid's real account_id never leaves the server. Clients key off "id" (our own
        # UUID); this is a stable one-way handle for display/support only.
        "plaid_account_id": plaid_privacy.opaque_handle(a.plaid_account_id) if a.plaid_account_id else None,
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
    account_type = body.get("account_type") or "checking"

    # counts_as_cash: default the same way the Phase 0 migration did, unless the
    # caller explicitly supplied a value (including explicit false).
    if body.get("counts_as_cash") is not None:
        counts_as_cash = body["counts_as_cash"]
    else:
        counts_as_cash = account_type in ("checking", "savings")

    next_due_date_raw = body.get("next_due_date")
    if next_due_date_raw:
        try:
            next_due_date = date.fromisoformat(next_due_date_raw)
        except ValueError:
            raise HTTPException(400, "next_due_date must be an ISO date (YYYY-MM-DD)")
    else:
        next_due_date = None

    account = Account(
        user_id=user_id,
        name=name,
        bank_name=body.get("bank_name") or "",
        account_type=account_type,
        subtype=body.get("subtype"),
        currency=currency,
        credit_limit=body.get("credit_limit"),
        due_day=body.get("due_day"),
        kind=body.get("kind"),
        counts_as_cash=counts_as_cash,
        statement_balance=body.get("statement_balance"),
        minimum_payment=body.get("minimum_payment"),
        next_due_date=next_due_date,
        apr_bps=body.get("apr_bps"),
        term_months=body.get("term_months"),
        balance_source="manual",
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
    # counts_as_cash editable for any account -- the user decides whether e.g. a joint
    # account counts toward their spendable cash
    if "counts_as_cash" in body:
        account.counts_as_cash = body["counts_as_cash"]
    # debt-simulator fields editable only for non-Plaid accounts (Plaid is source of truth there)
    if not is_plaid:
        if "kind" in body:
            account.kind = body["kind"]
        if "statement_balance" in body:
            account.statement_balance = body["statement_balance"]
        if "minimum_payment" in body:
            account.minimum_payment = body["minimum_payment"]
        if "next_due_date" in body:
            nd = body["next_due_date"]
            if nd:
                try:
                    account.next_due_date = date.fromisoformat(nd)
                except ValueError:
                    raise HTTPException(400, "next_due_date must be an ISO date (YYYY-MM-DD)")
            else:
                account.next_due_date = None
        if "apr_bps" in body:
            account.apr_bps = body["apr_bps"]
        if "term_months" in body:
            account.term_months = body["term_months"]

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
