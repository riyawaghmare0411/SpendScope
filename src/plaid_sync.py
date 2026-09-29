"""Plaid sync orchestration (Phase 0 skeleton -- bodies filled in Wave 1 by BP-SVC).

Wave 1 supersedes routes/plaid.py's `_sync_plaid_item` with this module: adds
modified/removed/pending handling via a plaid_transaction_id upsert (the column Phase 0
added to transactions), routes merchant embeddings through embedding_guard.safe_embed
instead of calling categorize_local directly, and accepts an injectable client so it runs
against either the real Plaid API or plaid_fake.FakePlaidClient.
"""

import json
import uuid
from datetime import datetime as _dt, timezone as _tz, date as date_type
from typing import Optional

from sqlalchemy import select

from src.plaid_fake import PlaidClientProtocol, get_client
from src.models import User, Account, ImportBatch, Transaction
from src import plaid_service as ps
from src import plaid_privacy
from src.embedding_guard import safe_embed


def _error_code_from_exception(e: Exception) -> Optional[str]:
    """Best-effort extraction of a Plaid error_code from whatever the client raised (the
    real Plaid SDK's ApiException carries it as a JSON string on `.body`)."""
    body = getattr(e, "body", None)
    if body:
        try:
            parsed = json.loads(body) if isinstance(body, (str, bytes)) else body
            if isinstance(parsed, dict) and parsed.get("error_code"):
                return parsed["error_code"]
        except Exception:
            pass
    return getattr(e, "error_code", None) or getattr(e, "code", None)


async def sync_item(item, user_id, db, client: Optional[PlaidClientProtocol] = None) -> dict:
    """Pull new/modified/removed/pending transactions for one PlaidItem and upsert them.

    Returns the same {"added", "modified", "removed", "accounts"} shape routes/plaid.py's
    current _sync_plaid_item returns, so callers don't need to change on cutover -- except
    "modified"/"removed" now count actual DB upserts/deletes rather than raw Plaid counts.
    """
    if client is None:
        client = get_client()

    access_token = ps.decrypt_token(item.access_token_encrypted)

    all_added, all_modified, all_removed = [], [], []
    plaid_accounts_latest: dict[str, dict] = {}  # plaid_account_id -> account dict (last seen wins)
    cursor = item.sync_cursor
    iterations = 0
    try:
        while True:
            iterations += 1
            if iterations > 20:
                break  # safety cap
            result = client.sync_transactions(access_token, cursor=cursor)
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
    except Exception as e:
        item.sync_status = "error"
        raise RuntimeError(plaid_privacy.error_copy_for(_error_code_from_exception(e))) from e

    # Look up user currency once -- single currency per user (Phase 10 rule)
    user = await db.get(User, user_id)
    user_currency = (user.currency if user else None) or "USD"

    # Get-or-create one Account per Plaid account_id
    account_id_map: dict[str, uuid.UUID] = {}  # plaid_account_id -> Account.id
    for plaid_acc_id, acc in plaid_accounts_latest.items():
        balances = acc.get("balances") or {}
        r = await db.execute(select(Account).where(Account.user_id == user_id, Account.plaid_account_id == plaid_acc_id))
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
                # mask deliberately not stored -- Plaid's last-4 never leaves Plaid. The
                # column still exists but is never populated or returned (Phase 0, BP-ACCT).
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
            account.mask = None  # never persist Plaid's last-4; see the create path above
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

    removed_count = 0
    for r in all_removed:
        plaid_txn_id = r.get("transaction_id")
        if not plaid_txn_id:
            continue
        res = await db.execute(
            select(Transaction).where(Transaction.user_id == user_id, Transaction.plaid_transaction_id == plaid_txn_id)
        )
        existing = res.scalar_one_or_none()
        if existing is not None:
            await db.delete(existing)
            removed_count += 1

    # added + modified share one upsert path, keyed by (user_id, plaid_transaction_id)
    by_account_new: dict[uuid.UUID, list[dict]] = {}
    updated_count = 0
    for raw in [*all_added, *all_modified]:
        sp = ps.plaid_txn_to_spendscope(raw)
        try:
            tx_date = date_type.fromisoformat(sp["date_iso"])
        except (ValueError, KeyError):
            continue

        plaid_txn_id = raw.get("transaction_id")
        target_account_id = account_id_map.get(sp.get("_plaid_account_id"), fallback_account_id)
        description = plaid_privacy.redact_digits(sp.get("description") or "")
        merchant = plaid_privacy.redact_digits(sp.get("merchant") or "")
        pending = bool(raw.get("pending", False))
        currency = raw.get("iso_currency_code") or raw.get("unofficial_currency_code")
        amount = round(float(sp.get("amount", 0)), 2)
        category = sp.get("category", "Other")
        txn_type = sp.get("type", "")
        direction = sp.get("direction", "OUT")
        embedding = safe_embed(merchant) if merchant else None

        existing = None
        if plaid_txn_id:
            res = await db.execute(
                select(Transaction).where(Transaction.user_id == user_id, Transaction.plaid_transaction_id == plaid_txn_id)
            )
            existing = res.scalar_one_or_none()

        if existing is not None:
            existing.account_id = target_account_id
            existing.date = tx_date
            existing.description = description
            existing.merchant = merchant
            existing.category = category
            existing.type = txn_type
            existing.amount = amount
            existing.direction = direction
            existing.pending = pending
            existing.currency = currency
            if embedding is not None:
                existing.embedding = embedding
            updated_count += 1
        else:
            by_account_new.setdefault(target_account_id, []).append({
                "date": tx_date,
                "description": description,
                "merchant": merchant,
                "category": category,
                "type": txn_type,
                "amount": amount,
                "direction": direction,
                "pending": pending,
                "currency": currency,
                "plaid_transaction_id": plaid_txn_id,
                "embedding": embedding,
            })

    inserted = 0
    for acct_id, txns in by_account_new.items():
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
            txn = Transaction(
                import_batch_id=batch.id,
                account_id=acct_id,
                user_id=user_id,
                date=t["date"],
                description=t["description"],
                merchant=t["merchant"],
                category=t["category"],
                type=t["type"],
                amount=t["amount"],
                balance=None,
                direction=t["direction"],
                is_redacted=False,
                category_source="plaid",
                plaid_transaction_id=t["plaid_transaction_id"],
                pending=t["pending"],
                currency=t["currency"],
                embedding=t["embedding"],
            )
            db.add(txn)
            inserted += 1

    item.sync_cursor = cursor
    item.last_synced_at = _dt.now(_tz.utc)
    item.sync_status = "active"
    await db.commit()

    return {"added": inserted, "modified": updated_count, "removed": removed_count, "accounts": len(account_id_map)}
