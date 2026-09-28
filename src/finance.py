"""Day-by-day cash forecast engine -- MoneyMap's lib/finance.ts, ported to Python.

Pure module (Phase 0 of the MoneyMap integration): imports ONLY src.plan_types plus
stdlib. No SQLAlchemy, no FastAPI -- src/plan_service.py is the sole place ORM rows get
converted into ForecastInput.

src/recurrence.py (the LP-REC lane) hasn't landed yet, so occurrence dates for each
RecurringRule are computed inline here from cadence + anchor_day/anchor_weekday. A later
integration pass should swap _occurrences_for_rule for that shared helper once it exists.
anchor_weekday follows date.weekday() (Monday=0 .. Sunday=6). "biweekly"/"four_weekly"
have no stored reference date to fix their phase, so they're anchored to the first
occurrence of anchor_weekday on/after the forecast's as_of date -- a placeholder until
recurrence.py can track a real phase anchor.
"""

from calendar import monthrange
from datetime import date, timedelta
from decimal import ROUND_DOWN, Decimal

from src.plan_types import ForecastDay, ForecastInput, ForecastSummary, RecurringRule

_CENTS = Decimal("0.01")
_WEEKLY_STEP_DAYS = {"weekly": 7, "biweekly": 14, "four_weekly": 28}


def _floor_money(amount: Decimal) -> Decimal:
    return amount.quantize(_CENTS, rounding=ROUND_DOWN)


def _add_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    return date(d.year + month_index // 12, month_index % 12 + 1, 1)


def _occurrences_for_rule(rule: RecurringRule, start: date, end: date) -> list[date]:
    """Dates `rule` lands on within [start, end], inclusive."""
    if rule.cadence == "monthly_fixed_day":
        if rule.anchor_day is None:
            return []
        occurrences = []
        cursor = date(start.year, start.month, 1)
        while cursor <= end:
            last_day = monthrange(cursor.year, cursor.month)[1]
            day = date(cursor.year, cursor.month, min(rule.anchor_day, last_day))
            if start <= day <= end:
                occurrences.append(day)
            cursor = _add_months(cursor, 1)
        return occurrences

    if rule.cadence == "semimonthly":
        if rule.anchor_day is None:
            return []
        occurrences = []
        cursor = date(start.year, start.month, 1)
        while cursor <= end:
            last_day = monthrange(cursor.year, cursor.month)[1]
            for day_num in sorted({min(rule.anchor_day, last_day), min(rule.anchor_day + 15, last_day)}):
                day = date(cursor.year, cursor.month, day_num)
                if start <= day <= end:
                    occurrences.append(day)
            cursor = _add_months(cursor, 1)
        return occurrences

    step = _WEEKLY_STEP_DAYS.get(rule.cadence)
    if step is not None:
        if rule.anchor_weekday is None:
            return []
        occurrences = []
        day = start + timedelta(days=(rule.anchor_weekday - start.weekday()) % 7)
        while day <= end:
            occurrences.append(day)
            day += timedelta(days=step)
        return occurrences

    # "irregular" (or anything unrecognized) has no computable schedule -- it only
    # shows up in the forecast via an explicit PlanEvent.
    return []


def _bills_due_between(signed: dict[date, list[tuple[str, Decimal]]], after: date, through: date) -> Decimal:
    total = Decimal("0")
    for day, items in signed.items():
        if after < day <= through:
            total += sum((-amount for _, amount in items if amount < 0), Decimal("0"))
    return total


def build_forecast(input: ForecastInput) -> list[ForecastDay]:
    start = input.as_of
    end = start + timedelta(days=input.horizon_days - 1)

    signed: dict[date, list[tuple[str, Decimal]]] = {}
    income_dates: set[date] = set()

    def add(day: date, label: str, amount: Decimal, direction: str) -> None:
        signed.setdefault(day, []).append((label, amount if direction == "IN" else -amount))
        if direction == "IN":
            income_dates.add(day)

    for rule in input.recurring:
        if rule.currency != input.currency:
            continue
        for day in _occurrences_for_rule(rule, start, end):
            add(day, rule.label, rule.amount, rule.direction)

    for event in input.events:
        if event.currency != input.currency or not (start <= event.date <= end):
            continue
        add(event.date, event.label, event.amount, event.direction)

    sorted_income_dates = sorted(income_dates)

    days: list[ForecastDay] = []
    running = input.starting_balance

    for index in range(input.horizon_days):
        today = start + timedelta(days=index)
        today_items = signed.get(today, [])
        after_events = running + sum((amount for _, amount in today_items), Decimal("0"))

        next_income = next((d for d in sorted_income_dates if d > today), None)
        if next_income is not None:
            protected_bills = _bills_due_between(signed, today, next_income)
            available = max(Decimal("0"), after_events - protected_bills - input.reserve_buffer)
            days_until_income = max(1, (next_income - today).days)
            guide = _floor_money(available / days_until_income)
        else:
            remaining_days = max(1, input.horizon_days - index)
            guide = _floor_money(max(Decimal("0"), after_events - input.reserve_buffer) / remaining_days)

        # day_overrides lets the overspend endpoint force an actual spend for a given
        # day (typically day 0) instead of the computed guide, then re-run the walk to
        # see how that ripples through the rest of the horizon.
        spend = input.day_overrides.get(index, guide)
        closing = after_events - spend
        risk = "danger" if closing < 0 else "watch" if closing < input.reserve_buffer else "good"

        days.append(ForecastDay(
            date=today,
            balance=closing,
            spendable=spend,
            risk_level=risk,
            events=[label for label, _ in today_items],
        ))
        running = closing

    return days


def summarize_forecast(days: list[ForecastDay]) -> ForecastSummary:
    if not days:
        return ForecastSummary(
            safe_to_spend_today=Decimal("0"),
            lowest_point=Decimal("0"),
            lowest_point_date=None,
            overall_risk="good",
        )

    lowest = days[0]
    for day in days[1:]:
        if day.balance < lowest.balance:
            lowest = day

    # next_income_date/next_income_amount aren't derivable from a bare list[ForecastDay]:
    # ForecastDay.events only carries labels, not direction/amount, so there's no way to
    # tell an income label from a bill label here. Left None until that's threaded
    # through (e.g. once recurrence.py/plan_service.py can pass richer day data).
    return ForecastSummary(
        safe_to_spend_today=days[0].spendable,
        lowest_point=lowest.balance,
        lowest_point_date=lowest.date,
        overall_risk=lowest.risk_level,
    )


if __name__ == "__main__":
    from src.plan_types import PlanEvent

    sample = ForecastInput(
        as_of=date(2026, 9, 27),
        horizon_days=14,
        currency="USD",
        starting_balance=Decimal("500.00"),
        reserve_buffer=Decimal("100.00"),
        recurring=[
            RecurringRule(
                id="r1", label="Rent", direction="OUT", cadence="monthly_fixed_day",
                amount=Decimal("900.00"), currency="USD", anchor_day=1,
            ),
            RecurringRule(
                id="r2", label="Paycheck", direction="IN", cadence="biweekly",
                amount=Decimal("700.00"), currency="USD", anchor_weekday=4,
            ),
        ],
        events=[PlanEvent(id="e1", date=date(2026, 10, 2), label="Car repair", direction="OUT",
                           amount=Decimal("150.00"), currency="USD")],
    )
    forecast = build_forecast(sample)
    for d in forecast:
        print(d.date, d.balance, d.spendable, d.risk_level, d.events)
    print(summarize_forecast(forecast))
