"""Phase 12E: Deterministic financial stats. Replaces the streaming Claude coach.

Pure-Python math over the user's transactions. Zero outbound calls. ~20ms for 10k txns.

Phase 14D adds generate_action_plan() -- ranked, actionable, deterministic advice
to drive the redesigned Coach page (no more stat duplication with Insights/Dashboard).
"""

from __future__ import annotations
from datetime import date, timedelta
from collections import Counter, defaultdict


# Mirror of frontend constants.js PEER_BENCHMARKS. Percentages of monthly income
# typical for each category. Source: rough Office for National Statistics + BLS averages.
PEER_BENCHMARKS = {
    "Housing": 30, "Rent": 30, "Groceries": 12, "Grocery": 12, "Transport": 10,
    "Eating Out": 5, "Food": 8, "Entertainment": 5, "Shopping": 5, "Subscriptions": 3,
    "Utilities": 5, "Healthcare": 8, "Education": 3, "Clothing": 3, "Fitness": 3,
    "Travel": 4, "Electronics": 3, "Food Delivery": 4, "Other": 5,
}

# Icons per category for action card visuals
_CATEGORY_ICONS = {
    "Eating Out": "\U0001F354",       # burger
    "Coffee & Cafe": "\u2615",        # coffee
    "Subscriptions": "\U0001F4FA",    # tv
    "Shopping": "\U0001F6CD",         # bags
    "Entertainment": "\U0001F3AC",    # clapper
    "Transport": "\U0001F697",        # car
    "Travel": "\u2708",               # plane
    "Food Delivery": "\U0001F35C",    # noodle
    "Groceries": "\U0001F6D2",        # cart
    "Bank Fees": "\U0001F4B3",        # card
    "Utilities": "\U0001F4A1",        # bulb
    "Bills": "\U0001F9FE",            # receipt
    "Healthcare": "\u2695",           # caduceus
    "Fitness": "\U0001F3CB",          # weight
}


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
        "action_plan": generate_action_plan(transactions, user_currency),
        "wins": _what_is_working(transactions, savings_rate, projected_eom, week_change_pct),
    }


def _detect_recurring_subs(out_txns: list[dict]) -> list[dict]:
    """Group OUT transactions by merchant; return ones that look like subs.
    Sub criteria: same merchant, similar amount (+/- 10%), seen >= 2 months."""
    by_merchant = defaultdict(list)
    for t in out_txns:
        m = (t.get("merchant") or "").strip()
        if not m or not t.get("date_iso"):
            continue
        by_merchant[m].append(t)
    subs = []
    for merchant, txns in by_merchant.items():
        if len(txns) < 2:
            continue
        amounts = [float(t.get("money_out") or 0) for t in txns]
        avg = sum(amounts) / len(amounts)
        if avg < 1:
            continue
        # Tight amount range = subscription, not random spend at the same place
        spread = (max(amounts) - min(amounts)) / max(avg, 0.01)
        if spread > 0.25:
            continue
        months = sorted({t["date_iso"][:7] for t in txns})
        if len(months) < 2:
            continue
        subs.append({"merchant": merchant, "monthly_avg": round(avg, 2), "months_seen": len(months)})
    return sorted(subs, key=lambda s: -s["monthly_avg"])


def generate_action_plan(transactions: list[dict], user_currency: str = "$") -> list[dict]:
    """Return ranked deterministic action items. NO LLM. NO randomness.

    Each action: {id, icon, title, action_text, impact_amount, impact_period,
                  detail, priority, category}
    Ranked by impact_amount DESC. Top 5 returned.
    """
    if not transactions:
        return []

    out_txns = [t for t in transactions if t.get("direction") == "OUT"]
    in_txns = [t for t in transactions if t.get("direction") == "IN"]
    if not out_txns:
        return []

    months = sorted({(t.get("date_iso") or "")[:7] for t in transactions if t.get("date_iso")})
    n_months = max(1, len(months))
    monthly_in = sum(float(t.get("money_in") or 0) for t in in_txns) / n_months
    monthly_out = sum(float(t.get("money_out") or 0) for t in out_txns) / n_months

    actions: list[dict] = []

    # Action 1: any spending category materially above peer benchmark
    cat_totals: Counter = Counter()
    for t in out_txns:
        cat_totals[t.get("category") or "Other"] += float(t.get("money_out") or 0)
    if monthly_in > 0:
        for cat, total in cat_totals.most_common():
            monthly_cat = total / n_months
            cat_pct = (monthly_cat / monthly_in) * 100
            benchmark = PEER_BENCHMARKS.get(cat)
            if benchmark is None or cat_pct <= benchmark + 3:
                continue
            target = (benchmark / 100) * monthly_in
            savings = monthly_cat - target
            if savings < 5:
                continue
            actions.append({
                "id": f"reduce:{cat}",
                "icon": _CATEGORY_ICONS.get(cat, "\U0001F4B0"),
                "title": f"Cut back on {cat}",
                "action_text": f"Save {user_currency}{savings:.0f}/month by trimming {cat}",
                "impact_amount": round(savings, 0),
                "impact_period": "month",
                "detail": (
                    f"You spend {cat_pct:.0f}% of income on {cat}. Typical for this category is around {benchmark}%. "
                    f"Bringing it down to typical levels would free up {user_currency}{savings:.0f} per month "
                    f"({user_currency}{savings*12:.0f}/year)."
                ),
                "priority": "high" if savings > 100 else "medium",
                "category": cat,
            })

    # Action 2: pace overspend this month (independent of categories)
    today = date.today()
    ymp = today.strftime("%Y-%m")
    this_in = sum(float(t.get("money_in") or 0) for t in in_txns if (t.get("date_iso") or "").startswith(ymp))
    this_out = sum(float(t.get("money_out") or 0) for t in out_txns if (t.get("date_iso") or "").startswith(ymp))
    days_in_month = _last_day_of_month(today.year, today.month)
    days_left = max(0, days_in_month - today.day)
    days_so_far = max(1, today.day)
    pace = this_out / days_so_far
    projected_eom = this_in - (this_out + pace * days_left)
    if projected_eom < 0 and days_left > 0:
        # How much do we need to cut per day to break even?
        needed_cut_per_day = abs(projected_eom) / days_left
        actions.append({
            "id": "pace:overspend",
            "icon": "\u26A0\uFE0F",
            "title": "On pace to overspend this month",
            "action_text": f"Trim {user_currency}{needed_cut_per_day:.0f}/day for the next {days_left} day{'s' if days_left != 1 else ''} to break even",
            "impact_amount": round(abs(projected_eom), 0),
            "impact_period": "this month",
            "detail": (
                f"At your current pace ({user_currency}{pace:.0f}/day), you'll end the month "
                f"{user_currency}{abs(projected_eom):.0f} in the red. Cutting your daily spend by "
                f"{user_currency}{needed_cut_per_day:.0f} from now till month end balances the books."
            ),
            "priority": "high",
            "category": None,
        })

    # Action 3: subscriptions to review
    subs = _detect_recurring_subs(out_txns)
    if subs:
        sub_total = sum(s["monthly_avg"] for s in subs)
        sub_names = ", ".join(s["merchant"] for s in subs[:3])
        if len(subs) > 3:
            sub_names += f", +{len(subs)-3} more"
        # Estimate canceling 1 saves the average sub cost
        avg_sub = sub_total / len(subs)
        actions.append({
            "id": "subs:review",
            "icon": "\U0001F4FA",
            "title": f"Review {len(subs)} recurring subscription{'s' if len(subs) > 1 else ''}",
            "action_text": f"Save up to {user_currency}{sub_total:.0f}/month by canceling unused subs",
            "impact_amount": round(avg_sub, 0),  # conservative: cancel 1
            "impact_period": "month",
            "detail": (
                f"You're paying for: {sub_names}. Total: {user_currency}{sub_total:.0f}/month. "
                f"Canceling just one unused subscription typically saves around {user_currency}{avg_sub:.0f}/month "
                f"({user_currency}{avg_sub*12:.0f}/year)."
            ),
            "priority": "medium",
            "category": "Subscriptions",
        })

    # Action 4: low savings rate -> emergency fund
    savings_rate = ((monthly_in - monthly_out) / monthly_in * 100) if monthly_in > 0 else 0
    if 0 <= savings_rate < 10 and monthly_out > 0:
        target_fund = monthly_out * 3
        savings_5pct = monthly_in * 0.05
        actions.append({
            "id": "fund:emergency",
            "icon": "\U0001F6E1\uFE0F",
            "title": "Start a 3-month emergency fund",
            "action_text": f"Aim to save {user_currency}{savings_5pct:.0f}/month (~5% of income) toward a {user_currency}{target_fund:.0f} buffer",
            "impact_amount": round(target_fund, 0),
            "impact_period": "total",
            "detail": (
                f"A 3-month emergency fund covering {user_currency}{monthly_out:.0f}/month of expenses "
                f"is {user_currency}{target_fund:.0f}. Setting aside 5% of income each month "
                f"({user_currency}{savings_5pct:.0f}) gets you there in {target_fund/max(savings_5pct,1):.0f} months."
            ),
            "priority": "low",
            "category": None,
        })

    # Sort by impact_amount, return top 5 (smaller list if not many actions surface)
    actions.sort(key=lambda a: -a["impact_amount"])
    return actions[:5]


def _what_is_working(transactions: list[dict], savings_rate: float, projected_eom: float,
                     week_change_pct: float) -> list[str]:
    """Short positive callouts. Empty list if nothing notable."""
    wins = []
    if savings_rate >= 20:
        wins.append(f"Strong {savings_rate:.0f}% savings rate -- well above average.")
    if projected_eom > 0 and savings_rate > 0:
        wins.append("On track to end the month positive.")
    if week_change_pct < -10:
        wins.append(f"Spending dropped {abs(week_change_pct):.0f}% vs last week -- great control.")
    return wins[:3]
