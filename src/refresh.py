"""Refresh-cooldown/give-up/cached-sync timing, ported from MoneyMap's lib/refresh.ts.
Pure timing logic only: plain functions over datetimes/seconds, no SQLAlchemy, no
networking. The actual Plaid HTTP calls (and any Plaid response parsing) live in
src/plaid_sync.py (a sibling lane).
"""

from datetime import datetime
from typing import Optional

REFRESH_COOLDOWN_SECONDS = 2 * 60
REFRESH_GIVE_UP_SECONDS = 10 * 60
CACHED_SYNC_AFTER_SECONDS = 60 * 60


def refresh_finished(requested_at: Optional[datetime], last_update: Optional[datetime], now: datetime) -> bool:
    """New data is ready once Plaid reports a successful pull that finished after the
    refresh request; a request that never completes stops blocking after the give-up
    timeout."""
    if requested_at is None:
        return True
    if last_update is not None and last_update > requested_at:
        return True
    return (now - requested_at).total_seconds() > REFRESH_GIVE_UP_SECONDS


def can_request_refresh(last_requested_at: Optional[datetime], now: datetime) -> bool:
    """Plaid allows few live refreshes per bank; asking again inside the cooldown only
    burns the limit."""
    if last_requested_at is None:
        return True
    return (now - last_requested_at).total_seconds() >= REFRESH_COOLDOWN_SECONDS


def needs_cached_sync(
    last_synced_at: Optional[datetime], now: datetime, max_age_seconds: int = CACHED_SYNC_AFTER_SECONDS
) -> bool:
    """Cached reads are free, so the app picks up Plaid's own periodic updates on open."""
    if last_synced_at is None:
        return True
    return (now - last_synced_at).total_seconds() >= max_age_seconds
