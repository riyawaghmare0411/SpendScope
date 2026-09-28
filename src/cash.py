"""Spendable-cash aggregation, ported from MoneyMap's lib/cash.ts (recomputeBankCash /
countsAsCash). Pure module: imports only src.plan_types + stdlib -- no SQLAlchemy, no
networking. src/plan_service.py is the place SQLAlchemy rows become CashAccount and back.

Fix carried from the MoneyMap audit: cash.ts defaults a missing balance_as_of to 0
("balance_as_of ?? 0"), silently trusting an unknown-as-of balance as though its freshness
were known. Here a missing balance_as_of is left as None and the account id is reported in
BankCash.missing_as_of instead, so callers can surface "this balance might be stale."
"""

from decimal import Decimal

from src.plan_types import BankCash, CashAccount


def _newest(a: CashAccount, b: CashAccount) -> CashAccount:
    """newest-reading-wins: the reading with the later balance_as_of wins; a known
    timestamp always beats a missing one, since it is the more informative reading."""
    if a.balance_as_of is None:
        return b if b.balance_as_of is not None else a
    if b.balance_as_of is None:
        return a
    return a if a.balance_as_of >= b.balance_as_of else b


def aggregate_cash(accounts: list[CashAccount]) -> dict[str, BankCash]:
    """Spendable cash per currency from every counted account (counts_as_cash) -- never
    summed across currencies. Duplicate/overlapping readings for the same account_id are
    merged with newest-reading-wins (see _newest)."""
    latest: dict[str, CashAccount] = {}
    for account in accounts:
        existing = latest.get(account.account_id)
        latest[account.account_id] = account if existing is None else _newest(existing, account)

    totals: dict[str, Decimal] = {}
    grouped: dict[str, list[CashAccount]] = {}
    missing: dict[str, list[str]] = {}
    for account in latest.values():
        if not account.counts_as_cash:
            continue
        totals[account.currency] = totals.get(account.currency, Decimal("0")) + account.balance
        grouped.setdefault(account.currency, []).append(account)
        if account.balance_as_of is None:
            missing.setdefault(account.currency, []).append(account.account_id)

    return {
        currency: BankCash(
            currency=currency,
            total=totals[currency],
            accounts=grouped[currency],
            missing_as_of=missing.get(currency, []),
        )
        for currency in grouped
    }
