"""SQLAlchemy <-> plan-engine bridge (Wave 2 of the MoneyMap integration).

The ONLY place SQLAlchemy rows get converted into src.plan_types dataclasses (and back)
and handed to the pure modules (finance.py, cash.py, simulator.py, recurrence.py). Every
money value crossing the JSON boundary goes through src.money (parse_amount on the way in,
quantize + to_json_number on the way out) -- never a bare float()/str(Decimal).

src.routes.plan does simple CRUD (create/update/delete a row) directly via SQLAlchemy,
mirroring routes/accounts.py's style; it calls into this module only for anything that
needs a pure module (forecast/simulate/overspend, next_date, recurring-suggestion refresh)
or a money-safe JSON conversion.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Optional

from sqlalchemy import select

from src import cash, finance, money, recurrence, simulator, timeutil
from src import plan_models
from src.models import Account, Transaction, User
from src.plan_types import (
    CashAccount,
    DebtAccount,
    ForecastInput,
    PlanEvent,
    RecurringRule,
    ScenarioInput,
)

# Horizon used by /api/plan/today and /api/plan/overspend, which don't take their own
# `days` param (unlike GET /api/plan/forecast, which does). Long enough to surface a
# meaningful lowest-point/risk read without the cost of a much longer walk.
DEFAULT_HORIZON_DAYS = 30

# How far back to look for recurring-candidate detection. "Last ~180 days is plenty" (spec).
RECURRING_LOOKBACK_DAYS = 180


# ---------- money JSON helpers ----------

def money_json(amount: Decimal, currency: str) -> float:
    return money.to_json_number(money.quantize(amount, currency))


def money_json_opt(amount: Optional[Decimal], currency: str) -> Optional[float]:
    return None if amount is None else money_json(amount, currency)


def _dec(value) -> Optional[Decimal]:
    return None if value is None else Decimal(str(value))


# ---------- user / plan-currency resolution ----------

async def resolve_context(db, user_id: uuid.UUID) -> tuple[User, Optional["plan_models.PlanSettings"], str]:
    """(user, plan_settings_row_or_None, plan_currency). Every /api/plan/* endpoint that
    forecasts/simulates operates on this one currency (PlanSettings.base_currency if set,
    else User.currency -- the same single-currency-per-user rule plaid_sync.py already uses)."""
    user = await db.get(User, user_id)
    settings = await db.get(plan_models.PlanSettings, user_id)
    currency = (settings.base_currency if settings and settings.base_currency else None) or (
        (user.currency if user else None) or "USD"
    )
    return user, settings, currency


def today_for_user(user: User) -> date:
    tz = timeutil.resolve_timezone(user.timezone if user else None, user.country if user else None)
    return timeutil.today_for(tz)


# ---------- ORM row -> pure dataclass conversion ----------

def _counts_as_cash(a: Account) -> bool:
    """Phase 0 migration's default: an explicit value always wins; an unset (None) value
    -- true for every Plaid-synced account, since plaid_sync.py never sets it -- defaults to
    True for checking/savings, False otherwise, rather than being treated as excluded.
    Plaid-synced accounts store Plaid's own `type` ("depository") in account_type and
    "checking"/"savings" in subtype (plaid_sync.py), so that case is checked via subtype too --
    otherwise every Plaid checking/savings account would default to excluded, which is exactly
    what this default is meant to avoid."""
    if a.counts_as_cash is not None:
        return a.counts_as_cash
    if a.account_type in ("checking", "savings"):
        return True
    return a.account_type == "depository" and a.subtype in ("checking", "savings")


def to_cash_account(a: Account) -> CashAccount:
    balance = a.current_balance if a.current_balance is not None else a.available_balance
    as_of = a.balance_as_of or a.last_synced_at  # plaid_sync.py never sets balance_as_of
    return CashAccount(
        account_id=str(a.id),
        name=a.name,
        currency=a.currency,
        balance=_dec(balance) or Decimal("0"),
        counts_as_cash=_counts_as_cash(a),
        balance_as_of=as_of,
    )


def to_debt_account(a: Account) -> DebtAccount:
    balance = a.current_balance if a.current_balance is not None else (a.statement_balance or 0)
    return DebtAccount(
        account_id=str(a.id),
        name=a.name,
        currency=a.currency,
        kind=a.kind,
        balance=_dec(balance) or Decimal("0"),
        apr_bps=a.apr_bps,
        minimum_payment=_dec(a.minimum_payment),
        statement_balance=_dec(a.statement_balance),
        next_due_date=a.next_due_date,
        term_months=a.term_months,
    )


def to_pure_recurring_rule(r: "plan_models.RecurringRule") -> RecurringRule:
    return RecurringRule(
        id=str(r.id),
        label=r.label,
        direction=r.direction,
        cadence=r.cadence,
        amount=_dec(r.amount),
        currency=r.currency,
        anchor_day=r.anchor_day,
        anchor_weekday=r.anchor_weekday,
        account_id=str(r.account_id) if r.account_id else None,
    )


def to_pure_plan_event(e: "plan_models.PlanEvent") -> PlanEvent:
    return PlanEvent(
        id=str(e.id),
        date=e.date,
        label=e.label,
        direction=e.direction,
        amount=_dec(e.amount),
        currency=e.currency,
        account_id=str(e.account_id) if e.account_id else None,
    )


def next_date_or_none(rule: RecurringRule, as_of: date) -> Optional[date]:
    try:
        return recurrence.compute_next_date(rule, as_of)
    except ValueError:
        return None  # "irregular" (or any other non-computable cadence)


# ---------- DB fetch helpers ----------

async def fetch_accounts(db, user_id: uuid.UUID) -> list[Account]:
    result = await db.execute(select(Account).where(Account.user_id == user_id))
    return list(result.scalars().all())


async def fetch_confirmed_recurring(db, user_id: uuid.UUID, currency: str) -> list["plan_models.RecurringRule"]:
    result = await db.execute(
        select(plan_models.RecurringRule).where(
            plan_models.RecurringRule.user_id == user_id,
            plan_models.RecurringRule.status == "confirmed",
            plan_models.RecurringRule.currency == currency,
        )
    )
    return list(result.scalars().all())


async def fetch_all_recurring(db, user_id: uuid.UUID) -> list["plan_models.RecurringRule"]:
    result = await db.execute(
        select(plan_models.RecurringRule).where(plan_models.RecurringRule.user_id == user_id)
    )
    return list(result.scalars().all())


async def fetch_events_in_window(db, user_id: uuid.UUID, currency: str, start: date, end: date) -> list["plan_models.PlanEvent"]:
    result = await db.execute(
        select(plan_models.PlanEvent).where(
            plan_models.PlanEvent.user_id == user_id,
            plan_models.PlanEvent.currency == currency,
            plan_models.PlanEvent.date >= start,
            plan_models.PlanEvent.date <= end,
        )
    )
    return list(result.scalars().all())


# ---------- recurring-suggestion refresh (shared by GET /api/plan/today and /recurring) ----------

async def refresh_recurring_suggestions(db, user_id: uuid.UUID, as_of: date) -> None:
    """Detect new recurring candidates from recent transactions and insert them as
    status="suggested" rows, skipping anything find_new_candidates already excludes
    (named-matched confirmed/dismissed rules, or auto-settled onto a confirmed schedule)
    and anything already suggested/confirmed/dismissed with the same merchant_key."""
    cutoff = as_of - timedelta(days=RECURRING_LOOKBACK_DAYS)

    txn_rows = await db.execute(
        select(Transaction, Account.currency)
        .join(Account, Transaction.account_id == Account.id)
        .where(Transaction.user_id == user_id, Transaction.date >= cutoff)
    )
    from src.plan_types import TxnLite  # local import: keeps this pure-type dependency obvious at use site

    txns = [
        TxnLite(
            account_id=str(t.account_id),
            date=t.date,
            amount=_dec(t.amount),
            direction=t.direction,
            currency=t.currency or acct_currency or "USD",
            category=t.category,
            merchant=t.merchant,
        )
        for t, acct_currency in txn_rows.all()
    ]

    existing_rows = await fetch_all_recurring(db, user_id)
    existing = [
        recurrence.ExistingRule(rule=to_pure_recurring_rule(r), status=r.status) for r in existing_rows
    ]
    existing_merchant_keys = {r.merchant_key for r in existing_rows if r.merchant_key}

    candidates = recurrence.find_new_candidates(txns, existing, settle_window_days=3)

    for candidate in candidates:
        if candidate.merchant_key in existing_merchant_keys:
            continue
        # recurrence.RecurringCandidate carries no confidence field -- derive a simple,
        # bounded heuristic from how many occurrences backed the detection rather than
        # leaving every suggestion looking equally certain.
        confidence = min(1.0, round(candidate.occurrences / 6, 2))
        db.add(plan_models.RecurringRule(
            user_id=user_id,
            account_id=None,
            label=candidate.merchant_label,
            direction=candidate.direction,
            cadence=candidate.cadence,
            anchor_day=candidate.anchor_day,
            anchor_weekday=candidate.anchor_weekday,
            amount=candidate.amount,
            currency=candidate.currency,
            merchant_key=candidate.merchant_key,
            status="suggested",
            source="detected",
            confidence=confidence,
        ))
        existing_merchant_keys.add(candidate.merchant_key)  # guard duplicate candidates this same pass

    await db.commit()


def compute_next_income(confirmed_rules: list[RecurringRule], as_of: date) -> Optional[dict]:
    best: Optional[tuple[date, RecurringRule]] = None
    for rule in confirmed_rules:
        if rule.direction != "IN":
            continue
        next_date = next_date_or_none(rule, as_of)
        if next_date is None:
            continue
        if best is None or next_date < best[0]:
            best = (next_date, rule)
    if best is None:
        return None
    next_date, rule = best
    return {"label": rule.label, "amount": rule.amount, "date": next_date}


# ---------- /api/plan/today ----------

async def build_today(db, user_id: uuid.UUID) -> dict:
    user, settings, currency = await resolve_context(db, user_id)
    as_of = today_for_user(user)

    await refresh_recurring_suggestions(db, user_id, as_of)

    accounts = await fetch_accounts(db, user_id)
    bank_cash = cash.aggregate_cash([to_cash_account(a) for a in accounts]).get(currency)
    starting_balance = bank_cash.total if bank_cash else Decimal("0")

    confirmed_rows = await fetch_confirmed_recurring(db, user_id, currency)
    confirmed_rules = [to_pure_recurring_rule(r) for r in confirmed_rows]
    end = as_of + timedelta(days=DEFAULT_HORIZON_DAYS - 1)
    event_rows = await fetch_events_in_window(db, user_id, currency, as_of, end)
    events = [to_pure_plan_event(e) for e in event_rows]

    reserve_buffer = _dec(settings.reserve_buffer) if settings else None

    forecast_input = ForecastInput(
        as_of=as_of,
        horizon_days=DEFAULT_HORIZON_DAYS,
        currency=currency,
        starting_balance=starting_balance,
        reserve_buffer=reserve_buffer or Decimal("0"),
        recurring=confirmed_rules,
        events=events,
    )
    days = finance.build_forecast(forecast_input)
    summary = finance.summarize_forecast(days)

    next_income = compute_next_income(confirmed_rules, as_of)

    suggested_result = await db.execute(
        select(plan_models.RecurringRule).where(
            plan_models.RecurringRule.user_id == user_id,
            plan_models.RecurringRule.status == "suggested",
        )
    )
    pending = [recurring_row_to_dict(r, as_of) for r in suggested_result.scalars().all()]

    return {
        "currency": currency,
        "safe_to_spend_today": money_json(summary.safe_to_spend_today, currency),
        "balance_today": money_json(starting_balance, currency),
        "lowest_point": (
            {"amount": money_json(summary.lowest_point, currency), "date": summary.lowest_point_date.isoformat()}
            if summary.lowest_point_date is not None else None
        ),
        "overall_risk": summary.overall_risk,
        "next_income": (
            {"label": next_income["label"], "amount": money_json(next_income["amount"], currency),
             "date": next_income["date"].isoformat()}
            if next_income is not None else None
        ),
        "recurring_pending_review": pending,
        "as_of": as_of.isoformat(),
    }


# ---------- /api/plan/forecast ----------

async def build_forecast_response(db, user_id: uuid.UUID, horizon_days: int) -> dict:
    user, settings, currency = await resolve_context(db, user_id)
    as_of = today_for_user(user)

    accounts = await fetch_accounts(db, user_id)
    bank_cash = cash.aggregate_cash([to_cash_account(a) for a in accounts]).get(currency)
    starting_balance = bank_cash.total if bank_cash else Decimal("0")

    confirmed_rows = await fetch_confirmed_recurring(db, user_id, currency)
    confirmed_rules = [to_pure_recurring_rule(r) for r in confirmed_rows]
    end = as_of + timedelta(days=horizon_days - 1)
    event_rows = await fetch_events_in_window(db, user_id, currency, as_of, end)
    events = [to_pure_plan_event(e) for e in event_rows]

    reserve_buffer = _dec(settings.reserve_buffer) if settings else None

    days = finance.build_forecast(ForecastInput(
        as_of=as_of,
        horizon_days=horizon_days,
        currency=currency,
        starting_balance=starting_balance,
        reserve_buffer=reserve_buffer or Decimal("0"),
        recurring=confirmed_rules,
        events=events,
    ))

    return {
        "currency": currency,
        "days": [
            {
                "date": d.date.isoformat(),
                "balance": money_json(d.balance, currency),
                "spendable": money_json(d.spendable, currency),
                "risk_level": d.risk_level,
                "events": list(d.events),
            }
            for d in days
        ],
    }


# ---------- /api/plan/simulate ----------

async def run_simulation(db, user_id: uuid.UUID, body: dict) -> dict:
    _, _, currency = await resolve_context(db, user_id)

    extra_payment = money.parse_amount(body.get("extra_payment") if body.get("extra_payment") is not None else 0, currency)
    lump_sum_raw = body.get("lump_sum")
    lump_sum = money.parse_amount(lump_sum_raw, currency) if lump_sum_raw is not None else None
    strategy = body.get("strategy") or "avalanche"
    lump_sum_target_account_id = body.get("lump_sum_target_account_id")

    accounts = await fetch_accounts(db, user_id)
    debts = [to_debt_account(a) for a in accounts if a.kind is not None and a.currency == currency]

    protected_rows = await fetch_confirmed_recurring(db, user_id, currency)
    protected_bills = [to_pure_recurring_rule(r) for r in protected_rows]

    result = simulator.simulate(ScenarioInput(
        debts=debts,
        protected_bills=protected_bills,
        extra_payment=extra_payment,
        strategy=strategy,
        lump_sum=lump_sum,
        lump_sum_target_account_id=lump_sum_target_account_id,
    ))

    def _baseline_dict(b) -> dict:
        return {
            "months_to_payoff": b.months_to_payoff,
            "total_interest": money_json(b.total_interest, currency),
            "payoff_date": b.payoff_date.isoformat() if b.payoff_date else None,
        }

    return {
        "baseline": _baseline_dict(result.baseline),
        "result": {
            "months_to_payoff": result.months_to_payoff,
            "total_interest": money_json(result.total_interest, currency),
            "payoff_date": result.payoff_date.isoformat() if result.payoff_date else None,
            "interest_saved": money_json(result.interest_saved, currency),
            "months_saved": result.months_saved,
            "per_debt_schedule": [
                {
                    "account_id": d["account_id"],
                    "name": d["name"],
                    "months_to_payoff": d["months_to_payoff"],
                    "total_interest": money_json(d["total_interest"], currency),
                }
                for d in result.per_debt_schedule
            ],
            "protected_bills_total": money_json(result.protected_bills_total, currency),
            "notices": list(result.notices),
        },
    }


# ---------- /api/plan/overspend ----------

async def run_overspend(db, user_id: uuid.UUID, body: dict) -> dict:
    user, settings, _plan_currency = await resolve_context(db, user_id)
    currency = body.get("currency")
    if not currency:
        raise money.MoneyValidationError("currency is required")
    amount = money.parse_amount(body.get("amount"), currency)
    as_of = today_for_user(user)

    accounts = await fetch_accounts(db, user_id)
    bank_cash = cash.aggregate_cash([to_cash_account(a) for a in accounts]).get(currency)
    starting_balance = bank_cash.total if bank_cash else Decimal("0")

    confirmed_rows = await fetch_confirmed_recurring(db, user_id, currency)
    confirmed_rules = [to_pure_recurring_rule(r) for r in confirmed_rows]
    end = as_of + timedelta(days=DEFAULT_HORIZON_DAYS - 1)
    event_rows = await fetch_events_in_window(db, user_id, currency, as_of, end)
    events = [to_pure_plan_event(e) for e in event_rows]

    reserve_buffer = _dec(settings.reserve_buffer) if settings else Decimal("0")

    base_input = ForecastInput(
        as_of=as_of, horizon_days=DEFAULT_HORIZON_DAYS, currency=currency,
        starting_balance=starting_balance, reserve_buffer=reserve_buffer or Decimal("0"),
        recurring=confirmed_rules, events=events,
    )
    baseline_days = finance.build_forecast(base_input)
    adjusted_days = finance.build_forecast(ForecastInput(
        as_of=base_input.as_of, horizon_days=base_input.horizon_days, currency=base_input.currency,
        starting_balance=base_input.starting_balance, reserve_buffer=base_input.reserve_buffer,
        recurring=base_input.recurring, events=base_input.events,
        day_overrides={0: amount},
    ))

    baseline_summary = finance.summarize_forecast(baseline_days)
    adjusted_summary = finance.summarize_forecast(adjusted_days)

    days_reduced = [
        b.date for b, a in zip(baseline_days, adjusted_days) if a.spendable < b.spendable
    ]

    return {
        "overspend_amount": money_json(amount, currency),
        "currency": currency,
        "baseline_lowest": money_json(baseline_summary.lowest_point, currency),
        "adjusted_lowest": money_json(adjusted_summary.lowest_point, currency),
        "new_risk_level": adjusted_summary.overall_risk,
        "days_reduced": [d.isoformat() for d in days_reduced],
    }


# ---------- /api/plan/settings ----------

def settings_to_dict(user: User, settings: Optional["plan_models.PlanSettings"]) -> dict:
    currency = (settings.base_currency if settings and settings.base_currency else None) or user.currency or "USD"
    return {
        "daily_limit": money_json_opt(_dec(settings.daily_limit) if settings else None, currency),
        "base_currency": settings.base_currency if settings else None,
        "reserve_buffer": money_json_opt(_dec(settings.reserve_buffer) if settings else None, currency),
    }


async def update_settings(db, user_id: uuid.UUID, body: dict) -> dict:
    user = await db.get(User, user_id)
    settings = await db.get(plan_models.PlanSettings, user_id)
    if settings is None:
        settings = plan_models.PlanSettings(user_id=user_id)
        db.add(settings)

    effective_currency = body.get("base_currency") or settings.base_currency or (user.currency if user else "USD")

    if "base_currency" in body:
        settings.base_currency = body["base_currency"]
    if "daily_limit" in body:
        settings.daily_limit = float(money.quantize(money.parse_amount(body["daily_limit"], effective_currency), effective_currency)) if body["daily_limit"] is not None else None
    if "reserve_buffer" in body:
        settings.reserve_buffer = float(money.quantize(money.parse_amount(body["reserve_buffer"], effective_currency), effective_currency)) if body["reserve_buffer"] is not None else None

    await db.commit()
    await db.refresh(settings)
    return settings_to_dict(user, settings)


# ---------- recurring / event / budget row -> JSON ----------

def recurring_row_to_dict(row: "plan_models.RecurringRule", as_of: date) -> dict:
    pure = to_pure_recurring_rule(row)
    next_date = next_date_or_none(pure, as_of)
    return {
        "id": str(row.id),
        "label": row.label,
        "direction": row.direction,
        "cadence": row.cadence,
        "anchor_day": row.anchor_day,
        "anchor_weekday": row.anchor_weekday,
        "amount": money_json(pure.amount, row.currency),
        "currency": row.currency,
        "account_id": str(row.account_id) if row.account_id else None,
        "status": row.status,
        "source": row.source,
        "confidence": row.confidence,
        "next_date": next_date.isoformat() if next_date else None,
    }


def plan_event_row_to_dict(row: "plan_models.PlanEvent") -> dict:
    return {
        "id": str(row.id),
        "date": row.date.isoformat(),
        "label": row.label,
        "direction": row.direction,
        "amount": money_json(_dec(row.amount), row.currency),
        "currency": row.currency,
        "account_id": str(row.account_id) if row.account_id else None,
        "note": row.note,
    }


def budget_row_to_dict(row) -> dict:
    currency = row.currency or "USD"
    return {
        "id": str(row.id),
        "category": row.category,
        "amount": money_json(_dec(row.amount), currency),
        "period": row.period,
        "currency": currency,
    }
