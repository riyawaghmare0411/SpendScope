"""Pure data contracts for the plan/forecast engine (Phase 0 of the MoneyMap integration).

Every pure module (finance.py, cash.py, refresh.py, simulator.py, recurrence.py) imports
ONLY this file plus stdlib -- no SQLAlchemy, no FastAPI. src/plan_service.py is the sole
place SQLAlchemy rows get converted into these dataclasses and back.

Money is always Decimal here; JSON boundary conversion (str/float <-> Decimal) is money.py's
job, not this file's.
"""

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class TxnLite:
    account_id: str
    date: date
    amount: Decimal
    direction: str  # "IN" | "OUT"
    currency: str
    category: Optional[str] = None
    merchant: Optional[str] = None


@dataclass(frozen=True)
class CashAccount:
    account_id: str
    name: str
    currency: str
    balance: Decimal
    counts_as_cash: bool
    balance_as_of: Optional[datetime] = None


@dataclass(frozen=True)
class BankCash:
    """Aggregated spendable-cash position for ONE currency. Never summed across currencies."""
    currency: str
    total: Decimal
    accounts: list[CashAccount] = field(default_factory=list)
    # account_ids with no known balance_as_of -- reported rather than silently treated as 0
    # (MoneyMap's cash.ts bug: `balance_as_of ?? 0` turned a missing timestamp into epoch-0).
    missing_as_of: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class BalanceState:
    """The day-0 starting cash position fed into build_forecast, one per currency."""
    currency: str
    cash: Decimal
    as_of: Optional[datetime] = None


@dataclass(frozen=True)
class DebtAccount:
    account_id: str
    name: str
    currency: str
    kind: str  # "credit_card" | "loan" | "bnpl" | "friend_loan"
    balance: Decimal  # positive = amount owed
    apr_bps: Optional[int] = None
    minimum_payment: Optional[Decimal] = None
    statement_balance: Optional[Decimal] = None
    next_due_date: Optional[date] = None
    term_months: Optional[int] = None


@dataclass(frozen=True)
class RecurringRule:
    """Pure mirror of a confirmed src.plan_models.RecurringRule row. next_date is computed
    by recurrence.py from cadence + anchor_day/anchor_weekday, never stored."""
    id: str
    label: str
    direction: str  # "IN" | "OUT"
    cadence: str  # "monthly_fixed_day" | "biweekly" | "weekly" | "semimonthly" | "four_weekly" | "irregular"
    amount: Decimal
    currency: str
    anchor_day: Optional[int] = None
    anchor_weekday: Optional[int] = None
    account_id: Optional[str] = None


@dataclass(frozen=True)
class PlanEvent:
    """Pure mirror of a src.plan_models.PlanEvent row -- a one-off scheduled expense/income."""
    id: str
    date: date
    label: str
    direction: str  # "IN" | "OUT"
    amount: Decimal
    currency: str
    account_id: Optional[str] = None


@dataclass(frozen=True)
class ForecastDay:
    date: date
    balance: Decimal
    spendable: Decimal  # safe-to-spend guide for this specific day
    risk_level: str  # "good" | "watch" | "danger"
    events: list[str] = field(default_factory=list)  # labels of bills/income landing this day


@dataclass(frozen=True)
class ForecastInput:
    as_of: date
    horizon_days: int
    currency: str
    starting_balance: Decimal
    reserve_buffer: Decimal = Decimal("0")
    recurring: list[RecurringRule] = field(default_factory=list)
    events: list[PlanEvent] = field(default_factory=list)
    # day -> forced override amount (used by the overspend endpoint's day-0 override run)
    day_overrides: dict[int, Decimal] = field(default_factory=dict)


@dataclass(frozen=True)
class ForecastSummary:
    safe_to_spend_today: Decimal
    lowest_point: Decimal
    lowest_point_date: Optional[date]
    overall_risk: str  # "good" | "watch" | "danger"
    next_income_date: Optional[date] = None
    next_income_amount: Optional[Decimal] = None


@dataclass(frozen=True)
class ScenarioInput:
    debts: list[DebtAccount]
    protected_bills: list[RecurringRule] = field(default_factory=list)
    extra_payment: Decimal = Decimal("0")
    strategy: str = "avalanche"  # "avalanche" | "snowball" | "custom"
    lump_sum: Optional[Decimal] = None
    lump_sum_target_account_id: Optional[str] = None


@dataclass(frozen=True)
class ScenarioBaseline:
    """The no-extra-payment comparison point every simulated scenario is measured against."""
    months_to_payoff: Optional[int]
    total_interest: Decimal
    payoff_date: Optional[date]


@dataclass(frozen=True)
class ScenarioResult:
    baseline: ScenarioBaseline
    months_to_payoff: Optional[int]
    total_interest: Decimal
    payoff_date: Optional[date]
    interest_saved: Decimal
    months_saved: Optional[int]
    per_debt_schedule: list[dict] = field(default_factory=list)
    # Informational only -- never subtracted from extra_payment (extra_payment is already
    # what the user has left over after protected bills; the simulator's job is to allocate
    # it across debts, not to re-derive it). Surfaced so the UI can warn "your protected
    # bills this month total X" alongside the result.
    protected_bills_total: Decimal = Decimal("0")
    notices: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class OverspendResult:
    """Real forecast run twice (baseline vs. a day-0 override) -- redistributed-guide math,
    not an approximation."""
    overspend_amount: Decimal
    currency: str
    baseline_lowest: Decimal
    adjusted_lowest: Decimal
    new_risk_level: str
    days_reduced: list[date] = field(default_factory=list)
