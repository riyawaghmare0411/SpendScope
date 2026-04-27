"""Phase 12E: Deterministic financial stats. Replaces the streaming Claude coach.

Pure-Python math over the user's transactions. Zero outbound calls. ~20ms for 10k txns.
"""

from __future__ import annotations
from datetime import date, timedelta
from collections import Counter


def _last_day_of_month(year: int, month: int) -> int:
    """Return the last day-of-month integer for the given year/month."""
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - timedelta(days=1)).day


def _encouragement(savings_rate_pct: float, projected_eom: float) -> str:
    """Deterministic encouragement message -- no LLM."""
    if savings_rate_pct >= 30 and projected_eom > 0:
        return "Strong month -- you're building real cushion."
    if savings_rate_pct >= 15 and projected_eom > 0:
        return "Solid pace. Keep going."
    if savings_rate_pct >= 0 and projected_eom >= 0:
        return "On track. One small cut could double the cushion."
    if projected_eom < 0 and savings_rate_pct < 0:
        return "Tighten up -- you're on pace to overspend."
    return "Mid-month check -- stay on it."


def compute_stats(transactions: list[dict], user_currency: str = "$") -> dict:
    """Build the coach stats payload.

    Args:
        transactions: list of dicts with keys date_iso, direction, money_in, money_out, category
        user_currency: '$' / '\u00A3' / '\u20AC' etc.

    Returns:
        Dict consumed by frontend CoachPage. Always JSON-serializable.
    """
    if not transactions:
        return {"empty": True, "currency": user_currency}

    out_txns = [t for t in transactions if t.get("direction") == "OUT"]
    in_txns = [t for t in transactions if t.get("direction") == "IN"]

    months_seen = sorted({(t.get("date_iso") or "")[:7] for t in transactions if t.get("date_iso")})
    n_months = max(1, len(months_seen))

    total_in = sum(float(t.get("money_in") or 0) for t in in_txns)
    total_out = sum(float(t.get("money_out") or 0) for t in out_txns)
    monthly_in = total_in / n_months
    monthly_out = total_out / n_months
    savings_rate = ((monthly_in - monthly_out) / monthly_in * 100) if monthly_in > 0 else 0

    # Top spending categories overall
    cat_totals: Counter = Counter()
    for t in out_txns:
        cat = t.get("category") or "Other"
        cat_totals[cat] += float(t.get("money_out") or 0)
    top_cats = cat_totals.most_common(5)

    # This month
    today = date.today()
    ymp = today.strftime("%Y-%m")
    days_in_month = _last_day_of_month(today.year, today.month)
    this_in = sum(float(t.get("money_in") or 0) for t in in_txns if (t.get("date_iso") or "").startswith(ymp))
    this_out = sum(float(t.get("money_out") or 0) for t in out_txns if (t.get("date_iso") or "").startswith(ymp))
    days_so_far = max(1, today.day)
    days_left = max(0, days_in_month - today.day)
    pace = this_out / days_so_far
    projected_spend = this_out + (pace * days_left)
    projected_eom = this_in - projected_spend
    daily_allowance = max(0.0, (this_in - this_out) / max(1, days_left)) if days_left > 0 else 0.0

    # Top merchants this month (so user sees where money's actually going right now)
    merchant_totals: Counter = Counter()
    for t in out_txns:
        if (t.get("date_iso") or "").startswith(ymp):
            m = t.get("merchant") or t.get("description") or "Unknown"
            merchant_totals[m] += float(t.get("money_out") or 0)
    top_merchants = merchant_totals.most_common(5)

    # Week-over-week change (last 7 days vs prior 7 days)
    week_cutoff = today - timedelta(days=7)
    prev_week_cutoff = today - timedelta(days=14)
    last_week = sum(float(t.get("money_out") or 0) for t in out_txns
                    if t.get("date_iso") and date.fromisoformat(t["date_iso"]) >= week_cutoff)
    prev_week = sum(float(t.get("money_out") or 0) for t in out_txns
                    if t.get("date_iso")
                    and prev_week_cutoff <= date.fromisoformat(t["date_iso"]) < week_cutoff)
    week_change_pct = ((last_week - prev_week) / prev_week * 100) if prev_week > 0 else 0

    return {
        "empty": False,
        "currency": user_currency,
        "n_months_data": n_months,
        "monthly_avg_in": round(monthly_in, 2),
        "monthly_avg_out": round(monthly_out, 2),
        "savings_rate_pct": round(savings_rate, 1),
        "top_categories": [{"name": c, "total": round(v, 2)} for c, v in top_cats],
        "top_merchants": [{"name": m, "total": round(v, 2)} for m, v in top_merchants],
        "this_month": {
            "in": round(this_in, 2),
            "out": round(this_out, 2),
            "projected_eom": round(projected_eom, 2),
            "daily_allowance": round(daily_allowance, 2),
            "days_remaining": days_left,
            "days_in_month": days_in_month,
        },
        "week_change_pct": round(week_change_pct, 1),
        "encouragement": _encouragement(savings_rate, projected_eom),
    }
