"""Plaid sync orchestration (Phase 0 skeleton -- bodies filled in Wave 1 by BP-SVC).

Wave 1 supersedes routes/plaid.py's `_sync_plaid_item` with this module: adds
modified/removed/pending handling via a plaid_transaction_id upsert (the column Phase 0
added to transactions), routes merchant embeddings through embedding_guard.safe_embed
instead of calling categorize_local directly, and accepts an injectable client so it runs
against either the real Plaid API or plaid_fake.FakePlaidClient.
"""

from typing import Optional

from src.plaid_fake import PlaidClientProtocol


async def sync_item(item, user_id, db, client: Optional[PlaidClientProtocol] = None) -> dict:
    """Pull new/modified/removed/pending transactions for one PlaidItem and upsert them.

    Returns the same {"added", "modified", "removed", "accounts"} shape routes/plaid.py's
    current _sync_plaid_item returns, so callers don't need to change on cutover.
    """
    raise NotImplementedError
