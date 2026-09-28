"""Debt payoff / lump-sum / friend-loan simulator (Phase 0 pure module).

Ported from MoneyMap's lib/simulator.ts (allocation-ordering rules: avalanche = highest
APR first, snowball = smallest balance first, custom = the order ScenarioInput.debts is
given in), but NOT a faithful port -- four real bugs found in simulator.ts are fixed here
rather than carried over:

1. simulator.ts only skipped a debt from extra-payment allocation when payment was exactly
   0 (`if (!payment) continue`), so a negative/credit balance kept "remaining" from being
   consumed instead of being excluded. _allocate() below guards on balance/payment <= 0.
2. simulator.ts's "room" (money left over for extra payment) only ever excluded rent as a
   protected bill -- the only one its demo data had. _protected_monthly_total() below sums
   every confirmed ScenarioInput.protected_bills entry, not just one hardcoded bill.
3. simulator.ts's overdue handling only applied to already-stored past events, never to an
   overdue PROJECTED recurring bill. _bill_monthly_amount_and_notice() below flags a
   projected occurrence overdue by more than its cadence's grace window (7 days for
   monthly-or-longer cadences; weekly/biweekly/four_weekly use a grace derived from that
   cadence's own period instead -- a grace equal to or longer than the period itself can
   never be exceeded, since the most recent occurrence is always less than one period in
   the past) and drops only that ONE overdue occurrence's amount out of protected_total for
   the current month, with an explicit notice string -- every later occurrence of the same
   bill is unaffected and still counts normally.
4. JS's Math.round rounds negatives toward +infinity, which Python's round()/Decimal
   quantization does not replicate. Nothing here needs bit-for-bit parity with a
   MoneyMap-displayed number, so plain Decimal quantization (ROUND_HALF_UP) is used
   consistently instead of chasing that quirk.

Imports ONLY src.plan_types + stdlib, per the pure-module contract in plan_types.py.
"""

import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from src.plan_types import (
    DebtAccount,
    RecurringRule,
    ScenarioBaseline,
    ScenarioInput,
    ScenarioResult,
)

MAX_MONTHS = 1200  # 100-year safety cap so a scenario that never pays off still terminates
GRACE_DAYS = 7  # BUGFIX 3: default grace window (monthly-or-longer cadences) before an
# overdue projected bill triggers a notice; weekly/biweekly/four_weekly use a grace derived
# from their own period instead (see _CADENCE_GRACE_DAYS).

# Mirrors recurrence.py's _PHASE_EPOCH -- anchor_day for biweekly/four_weekly is a phase
# index (0..period_weeks-1) relative to this same reference date (see recurrence.py's module
# docstring). Duplicated as a literal rather than imported, per this module's pure-module
# import contract (imports ONLY src.plan_types + stdlib -- see module docstring above).
_PHASE_EPOCH = date(2020, 1, 1)

_CADENCE_MULTIPLIER: dict[str, Decimal] = {
    "monthly_fixed_day": Decimal(1),
    "weekly": Decimal(52) / Decimal(12),
    "biweekly": Decimal(26) / Decimal(12),
    "four_weekly": Decimal(13) / Decimal(12),
    "semimonthly": Decimal(2),
    # "irregular" has no fixed schedule -- its amount is used as-is (see caller).
}

_CADENCE_PERIOD_DAYS: dict[str, int] = {
    "weekly": 7,
    "biweekly": 14,
    "four_weekly": 28,
}

# BUGFIX (LP-SIM round 2): a grace window equal to (or longer than) a cadence's own period
# can never be exceeded -- the most recent occurrence of a weekly/biweekly/four_weekly bill
# is always at most period_days - 1 days in the past, so "days_overdue > period_days" is
# mathematically unreachable. Using a quarter of the period instead -- the same ratio
# GRACE_DAYS=7 is to a ~30-day monthly cadence -- keeps a comparable "overdue for roughly the
# back three-quarters of the cycle" behavior across every cadence while staying reachable.
_CADENCE_GRACE_DAYS: dict[str, int] = {
    cadence: period_days // 4 for cadence, period_days in _CADENCE_PERIOD_DAYS.items()
    # monthly_fixed_day, semimonthly, irregular (and anything else) fall back to GRACE_DAYS.
}


@dataclass(frozen=True)
class _RunResult:
    months_to_payoff: Optional[int]
    total_interest: Decimal
    payoff_date: Optional[date]
    per_debt_schedule: list[dict] = field(default_factory=list)
    protected_bills_total: Decimal = Decimal("0")
    notices: list[str] = field(default_factory=list)


def _quantize(amount: Decimal) -> Decimal:
    """Round to cents with plain HALF_UP (BUGFIX 4 -- see module docstring)."""
    return amount.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _monthly_rate(apr_bps: Optional[int]) -> Decimal:
    if not apr_bps:
        return Decimal("0")
    return Decimal(apr_bps) / Decimal(120000)  # bps -> pct (/10000), pct -> monthly (/12)


def _days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, min(d.day, _days_in_month(year, month)))


def _order_debts(debts: list[DebtAccount], strategy: str) -> list[DebtAccount]:
    if strategy == "snowball":
        return sorted(debts, key=lambda d: d.balance)
    if strategy == "custom":
        return list(debts)
    # avalanche (default): highest APR first, ties broken by larger balance first
    return sorted(debts, key=lambda d: (-(d.apr_bps or 0), -d.balance))


def _allocate(amount: Decimal, order: list[DebtAccount], balances: dict[str, Decimal]) -> None:
    remaining = amount
    for debt in order:
        if remaining <= 0:
            break
        balance = balances[debt.account_id]
        if balance <= 0:  # BUGFIX 1: exclude credit/negative balances, not just `not payment`
            continue
        payment = min(balance, remaining)
        balances[debt.account_id] = balance - payment
        remaining -= payment


def _most_recent_periodic_due_date(
    today: date, anchor_weekday: int, anchor_day: Optional[int], period_days: int
) -> date:
    """Most recent occurrence of a weekly/biweekly/four_weekly-anchored bill on or before
    `today`. Mirrors recurrence.py's _next_periodic_on_or_after -- same phase convention,
    just walking backward instead of forward: snap to the most recent `anchor_weekday`
    on/before today, then shift back onto the stored phase slot, so a biweekly/four_weekly
    bill's "most recent occurrence" actually respects its 2-or-4-week cycle instead of
    matching any past occurrence of the plain weekday. A missing anchor_day defaults to
    phase 0 (rather than skipping the phase shift) so the grace check below stays reachable
    even for a bill whose phase hasn't been populated, instead of silently degrading it to a
    same-week (7-day-period) cadence."""
    delta = (today.weekday() - anchor_weekday) % 7
    candidate = today - timedelta(days=delta)
    if period_days == 7:
        return candidate
    period_weeks = period_days // 7
    phase = anchor_day if anchor_day is not None else 0
    weeks_since_epoch = (candidate - _PHASE_EPOCH).days // 7
    delta_weeks = (weeks_since_epoch - phase) % period_weeks
    return candidate - timedelta(weeks=delta_weeks)


def _most_recent_due_date(rule: RecurringRule, today: date) -> Optional[date]:
    """The latest scheduled occurrence of `rule` on or before `today`, or None when the
    cadence has no fixed anchor to check (irregular, or missing anchor fields)."""
    if rule.cadence == "monthly_fixed_day":
        day = min(rule.anchor_day or 1, _days_in_month(today.year, today.month))
        candidate = date(today.year, today.month, day)
        if candidate > today:
            candidate = _add_months(candidate, -1)
        return candidate
    if rule.cadence == "semimonthly":
        # Mirrors recurrence.py's _next_semimonthly_on_or_after's day-pair derivation --
        # anchor_day picks the first occurrence day (1-15), the second is +15 days later
        # (clamped to month length), never a hardcoded 1st/15th pair.
        anchor = rule.anchor_day or 1
        first_day = max(1, min(anchor, 15))
        second_day = first_day + 15
        last_this_month = _days_in_month(today.year, today.month)
        first = date(today.year, today.month, first_day)
        second = date(today.year, today.month, min(second_day, last_this_month))
        past = [d for d in (first, second) if d <= today]
        if past:
            return max(past)
        prev_month_first = _add_months(date(today.year, today.month, 1), -1)
        last_prev_month = _days_in_month(prev_month_first.year, prev_month_first.month)
        return date(prev_month_first.year, prev_month_first.month, min(second_day, last_prev_month))
    if rule.cadence in ("weekly", "biweekly", "four_weekly") and rule.anchor_weekday is not None:
        period_days = _CADENCE_PERIOD_DAYS[rule.cadence]
        return _most_recent_periodic_due_date(today, rule.anchor_weekday, rule.anchor_day, period_days)
    return None


def _bill_monthly_amount_and_notice(rule: RecurringRule, today: date) -> tuple[Decimal, Optional[str]]:
    # BUGFIX 3: flag an overdue projected occurrence explicitly, with a notice, and drop
    # only that ONE overdue occurrence's amount out of the cadence-adjusted monthly total --
    # every later occurrence of the same bill is unaffected and still counts normally.
    multiplier = _CADENCE_MULTIPLIER.get(rule.cadence, Decimal(1))
    single = _quantize(rule.amount)
    amount = _quantize(rule.amount * multiplier)
    notice = None
    due = _most_recent_due_date(rule, today)
    if due is not None and due < today:
        days_overdue = (today - due).days
        grace = _CADENCE_GRACE_DAYS.get(rule.cadence, GRACE_DAYS)
        if days_overdue > grace:
            amount -= single
            notice = (
                f"{rule.label} was due {days_overdue} days ago, past the {grace}-day "
                f"grace window -- that occurrence has been dropped from this month's "
                f"protected total; confirm it has been paid or update the schedule."
            )
    return amount, notice


def _protected_monthly_total(protected_bills: list[RecurringRule], today: date) -> tuple[Decimal, list[str]]:
    """BUGFIX 2: sum every confirmed protected bill, not just rent."""
    total = Decimal("0")
    notices: list[str] = []
    for bill in protected_bills:
        if bill.direction != "OUT":
            continue
        amount, notice = _bill_monthly_amount_and_notice(bill, today)
        total += amount
        if notice:
            notices.append(notice)
    return total, notices


def _run(
    debts: list[DebtAccount],
    protected_bills: list[RecurringRule],
    extra_payment: Decimal,
    strategy: str,
    lump_sum: Optional[Decimal],
    lump_sum_target_account_id: Optional[str],
    today: date,
) -> _RunResult:
    balances = {d.account_id: d.balance for d in debts}
    ordered = _order_debts(debts, strategy)
    protected_total, notices = _protected_monthly_total(protected_bills, today)

    if lump_sum and lump_sum > 0:
        target = [d for d in ordered if d.account_id == lump_sum_target_account_id]
        rest = [d for d in ordered if d.account_id != lump_sum_target_account_id]
        _allocate(lump_sum, target + rest, balances)

    def all_paid() -> bool:
        return all(balances[d.account_id] <= 0 for d in debts)

    months_by_account: dict[str, Optional[int]] = {
        d.account_id: (0 if balances[d.account_id] <= 0 else None) for d in debts
    }
    interest_by_account: dict[str, Decimal] = {d.account_id: Decimal("0") for d in debts}
    total_interest = Decimal("0")
    months_to_payoff: Optional[int] = 0 if all_paid() else None

    month = 0
    while months_to_payoff is None and month < MAX_MONTHS:
        month += 1
        for debt in debts:
            balance = balances[debt.account_id]
            if balance > 0:
                interest = _quantize(balance * _monthly_rate(debt.apr_bps))
                balances[debt.account_id] = balance + interest
                total_interest += interest
                interest_by_account[debt.account_id] += interest
        for debt in debts:
            balance = balances[debt.account_id]
            if balance <= 0:
                continue
            minimum = debt.minimum_payment if debt.minimum_payment is not None else Decimal("0")
            balances[debt.account_id] = balance - min(balance, minimum)
        if extra_payment > 0:
            _allocate(extra_payment, ordered, balances)
        for debt in debts:
            if months_by_account[debt.account_id] is None and balances[debt.account_id] <= 0:
                months_by_account[debt.account_id] = month
        if all_paid():
            months_to_payoff = month

    payoff_date = _add_months(today, months_to_payoff) if months_to_payoff is not None else None
    per_debt_schedule = [
        {
            "account_id": debt.account_id,
            "name": debt.name,
            "starting_balance": debt.balance,
            "months_to_payoff": months_by_account[debt.account_id],
            "total_interest": interest_by_account[debt.account_id],
        }
        for debt in debts
    ]

    return _RunResult(
        months_to_payoff,
        total_interest,
        payoff_date,
        per_debt_schedule,
        protected_bills_total=protected_total,
        notices=notices,
    )


def simulate(input: ScenarioInput) -> ScenarioResult:
    today = date.today()

    baseline_run = _run(
        debts=input.debts,
        protected_bills=input.protected_bills,
        extra_payment=Decimal("0"),
        strategy=input.strategy,
        lump_sum=None,
        lump_sum_target_account_id=None,
        today=today,
    )
    baseline = ScenarioBaseline(
        months_to_payoff=baseline_run.months_to_payoff,
        total_interest=baseline_run.total_interest,
        payoff_date=baseline_run.payoff_date,
    )

    scenario_run = _run(
        debts=input.debts,
        protected_bills=input.protected_bills,
        extra_payment=input.extra_payment,
        strategy=input.strategy,
        lump_sum=input.lump_sum,
        lump_sum_target_account_id=input.lump_sum_target_account_id,
        today=today,
    )

    months_saved = (
        baseline.months_to_payoff - scenario_run.months_to_payoff
        if baseline.months_to_payoff is not None and scenario_run.months_to_payoff is not None
        else None
    )

    return ScenarioResult(
        baseline=baseline,
        months_to_payoff=scenario_run.months_to_payoff,
        total_interest=scenario_run.total_interest,
        payoff_date=scenario_run.payoff_date,
        interest_saved=baseline.total_interest - scenario_run.total_interest,
        months_saved=months_saved,
        per_debt_schedule=scenario_run.per_debt_schedule,
        protected_bills_total=scenario_run.protected_bills_total,
        notices=scenario_run.notices,
    )
