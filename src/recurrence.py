"""Pure cadence classifier for recurring transactions (Phase 0 pure-module, MoneyMap
integration). Only stdlib + src.plan_types -- no SQLAlchemy, no FastAPI, no other src module.

This is the ONE recurring/subscription detector in the codebase. src/stats_coach.py's
_detect_recurring_subs is a thin adapter over find_recurring_candidates() below, so there is
never a second, disagreeing detector.

Detection has two independent gates, both required for a group of same-merchant/same-
direction transactions to count as "real" recurring:
  1. Cadence: the gaps between occurrences must be tight (low coefficient of variation),
     not just "seen more than once". A merchant visited at random intervals is repeat
     spend, not a subscription/bill.
  2. Amount: the typical amount must sit below a per-currency, per-direction P90 threshold
     computed from this same user's own transaction history. This is deliberately NOT a
     fixed constant like "avg <= 100" -- that's currency-blind (100 GBP and 100 INR are not
     the same bar) and is the bug MoneyMap's JS and the old stats_coach.py both carried.

next_date is never stored anywhere -- plan_models.RecurringRule.next_date does not exist by
design. compute_next_date() derives it fresh each call from cadence + anchor_day/anchor_weekday
plus a fixed code constant (_PHASE_EPOCH) used only as phase math for the two periodic
cadences (biweekly/four_weekly) that need to know which of several weekday-matching dates is
actually in the cycle; it is not a stored occurrence date.

anchor_day means two different things depending on cadence, both riding the same column:
  - monthly_fixed_day / semimonthly: a day-of-month (1-31), matching finance.py's own usage.
  - biweekly / four_weekly: a small, bounded phase index (0..1 / 0..3) saying which week of
    the 2-or-4-week cycle carries the payment, relative to _PHASE_EPOCH. Like anchor_weekday's
    0..6, this is a fixed-range structural property of the schedule, not a moving occurrence
    pointer, so it doesn't reintroduce "next_date is never stored". finance.py's placeholder
    _occurrences_for_rule does not read anchor_day for these two cadences (see its docstring);
    only this module's compute_next_date does.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from statistics import mean, pstdev
from typing import Optional

from src.plan_types import RecurringRule, TxnLite

# Coefficient-of-variation (stdev/mean) thresholds on the gaps between occurrences.
# <= TIGHT: gaps are essentially fixed-length (weekday-periodic cadences).
# <= LOOSE: gaps vary a bit (calendar-day cadences naturally do -- months differ in length)
#           but still cluster around one typical length.
# above LOOSE: not a real cadence.
_CV_TIGHT = 0.15
_CV_LOOSE = 0.30

# Mean-gap-in-days windows used to name a cadence once its CV has already qualified it.
_WEEKLY_GAP = (5, 9)
_BIWEEKLY_GAP = (12, 16)
_FOUR_WEEKLY_GAP = (24, 32)
_SEMIMONTHLY_GAP = (13, 17)
_MONTHLY_GAP = (26, 34)

# Occurrences-per-year used to normalize any cadence's amount into a monthly-equivalent cost.
_ANNUAL_OCCURRENCES = {
    "weekly": 52,
    "biweekly": 26,
    "four_weekly": 13,
    "semimonthly": 24,
    "monthly_fixed_day": 12,
}

# P90: only the cheapest 90% of a currency+direction's own amount distribution counts as
# "typical" enough to be a subscription/bill rather than a large one-off.
_AMOUNT_PERCENTILE = 0.90

# Minimum occurrences needed before gaps are statistically meaningful (2 gaps minimum).
_MIN_OCCURRENCES = 3

# Fraction of occurrences that must share the same anchor (day-of-month, reduced
# semimonthly day, or weekday -- within _DOMINANCE_TOLERANCE_DAYS) for that anchor to be
# considered the group's real signal rather than coincidence.
_DOMINANCE = 0.6
_DOMINANCE_TOLERANCE_DAYS = 1

# Fixed reference date used only for biweekly/four_weekly phase math -- never a stored
# "last occurrence" column. See module docstring.
_PHASE_EPOCH = date(2020, 1, 1)


@dataclass(frozen=True)
class RecurringCandidate:
    """A newly-detected recurring item -- not yet persisted as a plan_models.RecurringRule."""

    merchant_key: str
    merchant_label: str
    direction: str  # "IN" | "OUT"
    cadence: str
    amount: Decimal  # typical (median) amount per occurrence
    currency: str
    anchor_day: Optional[int]  # day-of-month, OR biweekly/four_weekly phase index -- see module docstring
    anchor_weekday: Optional[int]
    occurrences: int
    months_seen: int
    last_date: date


@dataclass(frozen=True)
class ExistingRule:
    """An already-persisted rule plus its lifecycle status. Kept separate from
    plan_types.RecurringRule because status (suggested/confirmed/dismissed) is a
    plan_service/ORM concern, not a pure forecast-input field."""

    rule: RecurringRule
    status: str  # "suggested" | "confirmed" | "dismissed"


def monthly_equivalent(candidate: RecurringCandidate) -> Decimal:
    """Normalize a candidate's per-occurrence amount into a monthly-equivalent cost,
    regardless of its cadence (a weekly 10 is not the same monthly load as a monthly 10)."""
    occurrences_per_year = _ANNUAL_OCCURRENCES.get(candidate.cadence, 12)
    return candidate.amount * occurrences_per_year / 12


def _merchant_key(txn: TxnLite) -> Optional[str]:
    if not txn.merchant:
        return None
    key = txn.merchant.strip().lower()
    return key or None


def _group_by_merchant(txns: list[TxnLite]) -> dict[tuple[str, str], list[TxnLite]]:
    groups: dict[tuple[str, str], list[TxnLite]] = defaultdict(list)
    for t in txns:
        key = _merchant_key(t)
        if key is None:
            continue
        groups[(key, t.direction)].append(t)
    for group in groups.values():
        group.sort(key=lambda t: t.date)
    return groups


def _gap_mean_cv(dates: list[date]) -> tuple[float, float]:
    """Mean gap in days and its coefficient of variation across consecutive occurrences."""
    gaps = [(b - a).days for a, b in zip(dates, dates[1:])]
    m = mean(gaps)
    if m <= 0:
        return m, float("inf")
    sd = pstdev(gaps) if len(gaps) > 1 else 0.0
    return m, sd / m


def _mode(values: list) -> Optional[object]:
    if not values:
        return None
    return Counter(values).most_common(1)[0][0]


def _dominance(values: list[int], mode: int, tolerance: int) -> float:
    """Fraction of `values` within `tolerance` of `mode` -- how strongly the group actually
    shares that anchor, as opposed to it just being the most common value by coincidence."""
    return sum(1 for v in values if abs(v - mode) <= tolerance) / len(values)


def _phase(dates: list[date], weekday_mode: int, period_days: int) -> int:
    """Week-index phase (0..period_days//7 - 1) of the occurrence cycle. Computed from a
    date that actually falls on weekday_mode -- not just the chronologically-last date --
    so it's always reachable by _next_periodic_on_or_after's weekday-first, O(1) lookup.
    Using an off-weekday reference (e.g. a posting that slipped a day) would store a phase
    no candidate on weekday_mode could ever match, which used to hang that lookup forever."""
    period_weeks = period_days // 7
    on_weekday = [d for d in dates if d.weekday() == weekday_mode]
    ref = (on_weekday or dates)[-1]
    return ((ref - _PHASE_EPOCH).days // 7) % period_weeks


def _semimonthly_anchor(days_of_month: list[int]) -> int:
    """Reduce each occurrence's day-of-month to its position in a 15-day half-month, so
    e.g. {1, 16} and {15, 30} both collapse to a single anchor day."""
    reduced = [d if d <= 15 else d - 15 for d in days_of_month]
    return _mode(reduced)


def _circular_day_distance(a: int, b: int) -> int:
    """Distance between two days-of-month on a ~30-day circular month, so e.g. day 30 and
    day 1 are 1 apart, not 29 -- needed below because a semimonthly pair's second anchor
    (anchor + 15) can land past the end of a real 28-31 day month."""
    diff = abs(a - b) % 30
    return min(diff, 30 - diff)


def _semimonthly_dominance(days_of_month: list[int], anchor: int, tolerance: int) -> float:
    """Fraction of days_of_month within `tolerance` (circular, see _circular_day_distance) of
    EITHER semimonthly anchor -- `anchor` or the one ~15 days from it. A single-anchor check
    misses legitimate pairs like the 1st/15th: 15 sits 14 days from anchor 1 by calendar
    count (and only 16 the other way around a ~30-day month), so neither a linear nor a
    single-anchor circular distance puts it within tolerance -- checking both anchors is what
    actually recognizes the pair as one shared signal."""
    matches = sum(
        1 for d in days_of_month
        if min(_circular_day_distance(d, anchor), _circular_day_distance(d, anchor + 15)) <= tolerance
    )
    return matches / len(days_of_month)


def _classify_cadence(dates: list[date]) -> tuple[str, Optional[int], Optional[int]]:
    """From a sorted list of occurrence dates, return (cadence, anchor_day, anchor_weekday).

    Weekday-periodic cadences (weekly/biweekly/four_weekly) and calendar-day cadences
    (semimonthly/monthly_fixed_day) can land in the same mean-gap window -- a calendar-
    monthly bill's ~30-day gaps also sit inside four_weekly's (24, 32) window, and a
    semimonthly salary's ~15-day gaps sit inside biweekly's (12, 16) window. Mean gap and
    CV alone can't tell them apart, so we compute both families' dominance up front (for the
    same occurrence set) and let day-of-month win whenever it actually dominates
    (_DOMINANCE) -- only falling through to the weekday-based checks when it doesn't --
    rather than testing weekday cadences first and never giving day-of-month a chance to
    preempt them.
    """
    if len(dates) < _MIN_OCCURRENCES:
        return "irregular", None, None

    mean_gap, cv = _gap_mean_cv(dates)
    weekdays = [d.weekday() for d in dates]
    days_of_month = [d.day for d in dates]

    weekday_mode = _mode(weekdays)
    weekday_dominance = _dominance(weekdays, weekday_mode, 0)

    day_mode = _mode(days_of_month)
    day_dominance = _dominance(days_of_month, day_mode, _DOMINANCE_TOLERANCE_DAYS)
    semi_mode = _semimonthly_anchor(days_of_month)
    semi_dominance = _semimonthly_dominance(days_of_month, semi_mode, _DOMINANCE_TOLERANCE_DAYS)

    # semi_dominance's tolerance window (either anchor or anchor+15, see
    # _semimonthly_dominance) can fire "by coincidence" on weekday-periodic data whose gaps
    # merely happen to land near anchor+15 -- so it only gets to preempt the weekday branch
    # below when it's a strictly stronger signal than this same occurrence set's weekday
    # match, not merely >= _DOMINANCE on its own. day_dominance has no such coincidental
    # false-positive mode, so it keeps the unconditional >= _DOMINANCE preference the spec
    # asked for.
    day_ok = day_dominance >= _DOMINANCE
    semi_ok = semi_dominance >= _DOMINANCE and semi_dominance > weekday_dominance

    if (day_ok or semi_ok) and cv <= _CV_LOOSE:
        if _SEMIMONTHLY_GAP[0] <= mean_gap <= _SEMIMONTHLY_GAP[1] and semi_ok:
            return "semimonthly", semi_mode, None
        if _MONTHLY_GAP[0] <= mean_gap <= _MONTHLY_GAP[1] and day_ok:
            return "monthly_fixed_day", day_mode, None
        # neither calendar window matched -- fall through to the weekday-based checks
        # below instead of giving up, since a strong day-of-month/semimonthly dominance
        # with no matching gap window doesn't rule out a genuine weekly/biweekly/
        # four_weekly cadence on the same dates.

    if cv <= _CV_TIGHT and weekday_dominance >= _DOMINANCE:
        if _WEEKLY_GAP[0] <= mean_gap <= _WEEKLY_GAP[1]:
            return "weekly", None, weekday_mode
        if _BIWEEKLY_GAP[0] <= mean_gap <= _BIWEEKLY_GAP[1]:
            return "biweekly", _phase(dates, weekday_mode, 14), weekday_mode
        if _FOUR_WEEKLY_GAP[0] <= mean_gap <= _FOUR_WEEKLY_GAP[1]:
            return "four_weekly", _phase(dates, weekday_mode, 28), weekday_mode

    return "irregular", None, None


def _amount_p90_by_currency(txns: list[TxnLite], direction: str) -> dict[str, Decimal]:
    """Per-currency P90 of this direction's own amount distribution -- the bucketing
    threshold, computed fresh from the user's own history rather than a fixed constant."""
    by_currency: dict[str, list[Decimal]] = defaultdict(list)
    for t in txns:
        if t.direction == direction:
            by_currency[t.currency].append(abs(t.amount))
    thresholds: dict[str, Decimal] = {}
    for currency, amounts in by_currency.items():
        thresholds[currency] = _percentile(sorted(amounts), _AMOUNT_PERCENTILE)
    return thresholds


def _percentile(sorted_amounts: list[Decimal], pct: float) -> Decimal:
    if not sorted_amounts:
        return Decimal("0")
    if len(sorted_amounts) == 1:
        return sorted_amounts[0]
    rank = (len(sorted_amounts) - 1) * pct
    lo = int(rank)
    hi = min(lo + 1, len(sorted_amounts) - 1)
    if lo == hi:
        return sorted_amounts[lo]
    frac = Decimal(str(rank - lo))
    return sorted_amounts[lo] + (sorted_amounts[hi] - sorted_amounts[lo]) * frac


def find_recurring_candidates(txns: list[TxnLite]) -> list[RecurringCandidate]:
    """Group txns by (merchant_key, direction), classify each group's cadence, and keep
    only the groups that are both a real cadence (non-irregular) and within this user's
    own per-currency/per-direction P90 amount bucket."""
    groups = _group_by_merchant(txns)
    p90_by_direction = {
        "OUT": _amount_p90_by_currency(txns, "OUT"),
        "IN": _amount_p90_by_currency(txns, "IN"),
    }

    candidates = []
    for (merchant_key, direction), group in groups.items():
        dates = [t.date for t in group]
        cadence, anchor_day, anchor_weekday = _classify_cadence(dates)
        if cadence == "irregular":
            continue

        amounts = sorted(abs(t.amount) for t in group)
        typical_amount = amounts[len(amounts) // 2]  # median
        currency = group[-1].currency
        p90 = p90_by_direction[direction].get(currency)
        if p90 is not None and typical_amount > p90:
            continue

        candidates.append(RecurringCandidate(
            merchant_key=merchant_key,
            merchant_label=_mode([t.merchant for t in group if t.merchant]) or merchant_key,
            direction=direction,
            cadence=cadence,
            amount=typical_amount,
            currency=currency,
            anchor_day=anchor_day,
            anchor_weekday=anchor_weekday,
            occurrences=len(group),
            months_seen=len({(d.year, d.month) for d in dates}),
            last_date=dates[-1],
        ))
    return candidates


def _label_key(label: str) -> str:
    return label.strip().lower()


def _last_day_of_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - timedelta(days=1)).day


def _add_month(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def _next_weekday_on_or_after(as_of: date, weekday: Optional[int]) -> date:
    if weekday is None:
        return as_of
    delta = (weekday - as_of.weekday()) % 7
    return as_of + timedelta(days=delta)


def _next_periodic_on_or_after(as_of: date, weekday: Optional[int], anchor_day: Optional[int],
                                period_days: int) -> date:
    """O(1): snap to the next occurrence of `weekday` on/after as_of, then shift by whole
    weeks onto the stored phase slot (see _phase / module docstring). Whole-week shifts
    never change the snapped weekday, and the phase comparison is mod period_weeks, so any
    anchor_day -- including None, or a value that disagrees with `weekday` -- resolves in
    one step instead of the unbounded day-by-day search this used to do, which could run
    forever (into OverflowError) whenever the required day-offset could never coincide with
    the fixed weekday."""
    candidate = _next_weekday_on_or_after(as_of, weekday)
    if anchor_day is None:
        return candidate
    period_weeks = period_days // 7
    weeks_since_epoch = (candidate - _PHASE_EPOCH).days // 7
    delta_weeks = (anchor_day - weeks_since_epoch) % period_weeks
    return candidate + timedelta(weeks=delta_weeks)


def _next_monthly_on_or_after(as_of: date, anchor_day: int) -> date:
    year, month = as_of.year, as_of.month
    day = min(anchor_day, _last_day_of_month(year, month))
    candidate = date(year, month, day)
    if candidate >= as_of:
        return candidate
    year, month = _add_month(year, month)
    day = min(anchor_day, _last_day_of_month(year, month))
    return date(year, month, day)


def _next_semimonthly_on_or_after(as_of: date, anchor_day: int) -> date:
    first_day = max(1, min(anchor_day, 15))
    second_day = first_day + 15
    year, month = as_of.year, as_of.month
    for _ in range(2):
        last = _last_day_of_month(year, month)
        for day in (first_day, min(second_day, last)):
            candidate = date(year, month, day)
            if candidate >= as_of:
                return candidate
        year, month = _add_month(year, month)
    raise AssertionError("unreachable: two consecutive months always yield a match")


def compute_next_date(rule: RecurringRule, as_of: date) -> date:
    """Derive the next occurrence purely from cadence + anchor_day/anchor_weekday (plus the
    fixed _PHASE_EPOCH constant for biweekly/four_weekly phase) -- never from a stored column."""
    if rule.cadence == "weekly":
        return _next_weekday_on_or_after(as_of, rule.anchor_weekday)
    if rule.cadence == "biweekly":
        return _next_periodic_on_or_after(as_of, rule.anchor_weekday, rule.anchor_day, 14)
    if rule.cadence == "four_weekly":
        return _next_periodic_on_or_after(as_of, rule.anchor_weekday, rule.anchor_day, 28)
    if rule.cadence == "semimonthly":
        return _next_semimonthly_on_or_after(as_of, rule.anchor_day or 1)
    if rule.cadence == "monthly_fixed_day":
        return _next_monthly_on_or_after(as_of, rule.anchor_day or 1)
    raise ValueError(f"cannot compute next_date for cadence={rule.cadence!r}")


# Renamed-merchant auto-settlement (see find_new_candidates) still requires the amount to
# be close -- same cadence and a nearby date is not enough on its own, or any unrelated new
# merchant that happens to share a payday with a confirmed bill gets silently swallowed by it.
_SETTLEMENT_AMOUNT_TOLERANCE = Decimal("0.15")  # 15% relative tolerance


def _schedule_settled(candidate: RecurringCandidate, rule: RecurringRule,
                       settle_window_days: int) -> bool:
    """True if `rule`'s predicted occurrence around candidate.last_date is within
    `settle_window_days` of it AND the amounts are close -- i.e. this candidate is just the
    normal on-time posting of an existing confirmed bill, not a separate event."""
    if rule.direction != candidate.direction or rule.currency != candidate.currency:
        return False
    if rule.cadence != candidate.cadence:
        return False
    if rule.amount > 0:
        if abs(candidate.amount - rule.amount) / rule.amount > _SETTLEMENT_AMOUNT_TOLERANCE:
            return False
    elif candidate.amount != rule.amount:
        return False
    probe_from = candidate.last_date - timedelta(days=settle_window_days)
    predicted = compute_next_date(rule, probe_from)
    return abs((predicted - candidate.last_date).days) <= settle_window_days


def find_new_candidates(txns: list[TxnLite], existing: list[ExistingRule],
                         settle_window_days: int = 3) -> list[RecurringCandidate]:
    """Classify `txns` and drop any candidate that already matches a confirmed or dismissed
    rule -- by merchant label (renamed merchants still match a confirmed schedule via
    auto-settlement: a candidate whose last occurrence lands within `settle_window_days` of
    a confirmed rule's predicted date, AND whose amount is close to that rule's, is the
    normal on-time posting of that bill, not a new, separate "missed" event, so it's
    suppressed too -- the amount check keeps an unrelated new merchant that merely shares a
    cadence and payday from being swallowed by someone else's confirmed rule)."""
    named_keys = {
        (_label_key(ex.rule.label), ex.rule.direction)
        for ex in existing
        if ex.status in ("confirmed", "dismissed")
    }
    confirmed_rules = [ex.rule for ex in existing if ex.status == "confirmed"]

    new_candidates = []
    for candidate in find_recurring_candidates(txns):
        if (candidate.merchant_key, candidate.direction) in named_keys:
            continue
        if any(_schedule_settled(candidate, rule, settle_window_days) for rule in confirmed_rules):
            continue
        new_candidates.append(candidate)
    return new_candidates
