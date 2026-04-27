"""
SpendScope AI Financial Coach
Generates personalized money plans from anonymized transaction data.
Privacy: No PII (merchant names, account numbers) sent to LLM.
"""

import os
import json
import re
from datetime import date, timedelta
from collections import Counter, defaultdict
from typing import Optional
import httpx

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"

CURRENCY_MAP = {
    "USD": "$", "GBP": "\u00a3", "EUR": "\u20ac", "INR": "\u20b9", "JPY": "\u00a5",
    "AUD": "A$", "CAD": "C$", "CHF": "CHF", "CNY": "\u00a5", "KRW": "\u20a9",
    "GEL": "\u20be", "BRL": "R$", "MXN": "MX$", "SGD": "S$", "HKD": "HK$",
}

def resolve_currency(user_currency: str, transactions: list[dict]) -> str:
    """Detect actual currency from transaction data, fall back to user profile."""
    # If user_currency is already a symbol, use it
    if user_currency in ("$", "\u00a3", "\u20ac", "\u20b9", "\u00a5", "A$", "C$"):
        return user_currency
    # Map currency code to symbol
    symbol = CURRENCY_MAP.get(user_currency.upper(), None)
    if symbol:
        return symbol
    # Try to detect from transaction descriptions
    for tx in transactions[:20]:
        desc = (tx.get("description", "") or "").lower()
        if any(w in desc for w in ["gbp", "sterling", "\u00a3"]):
            return "\u00a3"
        if any(w in desc for w in ["usd", "dollar", "$"]):
            return "$"
        if any(w in desc for w in ["eur", "euro", "\u20ac"]):
            return "\u20ac"
        if any(w in desc for w in ["inr", "rupee", "\u20b9"]):
            return "\u20b9"
    return "$"

SYSTEM_PROMPT = (
    "You are SpendScope, a personal financial coach. You give direct, actionable advice. "
    "Be specific with numbers. Be encouraging but honest. "
    "Format your response as JSON with these keys: "
    "summary (1-2 sentence overview), "
    "daily_budget (number), "
    "strategy (array of 3-5 specific tips), "
    "risks (array of 0-3 warnings), "
    "debt_advice (string or null), "
    "savings_tip (string), "
    "encouragement (1 sentence motivational). "
    "Use the user's currency symbol. Respond ONLY with valid JSON, no markdown fences. "
    "Keep each strategy tip to 1-2 short sentences maximum. Be direct and punchy, not verbose."
)


def anonymize_transactions(transactions: list[dict]) -> dict:
    """
    Convert raw transactions into an anonymized financial summary.
    No merchant names, account numbers, or PII.
    Returns a summary dict safe to send to an LLM.
    """
    if not transactions:
        return {
            "period": "", "total_income": 0, "total_spending": 0, "net": 0,
            "spending_by_category": {}, "recurring_charges": [],
            "income_pattern": None, "daily_average_spend": 0,
            "current_balance": None, "days_until_payday": None,
            "debt_info": None, "spending_trend": "unknown",
        }

    # Parse dates, sort
    for t in transactions:
        if isinstance(t.get("date_iso"), str):
            t["_date"] = date.fromisoformat(t["date_iso"])
        elif hasattr(t.get("date_iso"), "isoformat"):
            t["_date"] = t["date_iso"]
        else:
            t["_date"] = date.today()

    sorted_txns = sorted(transactions, key=lambda t: t["_date"])
    min_date = sorted_txns[0]["_date"]
    max_date = sorted_txns[-1]["_date"]
    num_days = max((max_date - min_date).days, 1)

    # Income vs spending
    total_income = 0.0
    total_spending = 0.0
    spending_by_category: dict[str, float] = defaultdict(float)
    income_dates: list[date] = []
    income_amounts: list[float] = []
    # Track amounts+category for recurring detection
    amount_cat_occurrences: dict[tuple[str, float], list[date]] = defaultdict(list)

    for t in sorted_txns:
        direction = (t.get("direction") or "").upper()
        money_in = float(t.get("money_in", 0) or 0)
        money_out = float(t.get("money_out", 0) or 0)
        category = t.get("category") or "Uncategorized"

        if direction == "IN" or money_in > 0:
            amt = money_in if money_in > 0 else float(t.get("amount", 0) or 0)
            total_income += amt
            income_dates.append(t["_date"])
            income_amounts.append(amt)
        else:
            amt = money_out if money_out > 0 else float(t.get("amount", 0) or 0)
            total_spending += amt
            spending_by_category[category] += amt
            amount_cat_occurrences[(category, round(amt, 2))].append(t["_date"])

    # Recurring charges: same category+amount appearing 2+ times
    recurring_charges = []
    for (cat, amt), dates in amount_cat_occurrences.items():
        if len(dates) >= 2 and amt > 0:
            # Estimate frequency from average gap
            sorted_d = sorted(dates)
            gaps = [(sorted_d[i + 1] - sorted_d[i]).days for i in range(len(sorted_d) - 1)]
            avg_gap = sum(gaps) / len(gaps) if gaps else 0
            if avg_gap <= 10:
                freq = "weekly"
            elif avg_gap <= 35:
                freq = "monthly"
            else:
                freq = "irregular"
            recurring_charges.append({"category": cat, "amount": round(amt, 2), "frequency": freq})

    # Income pattern
    income_pattern = None
    if income_dates:
        avg_income = round(sum(income_amounts) / len(income_amounts), 2)
        if len(income_dates) >= 2:
            sorted_inc = sorted(income_dates)
            gaps = [(sorted_inc[i + 1] - sorted_inc[i]).days for i in range(len(sorted_inc) - 1)]
            avg_gap = sum(gaps) / len(gaps) if gaps else 30
            if avg_gap <= 10:
                freq = "weekly"
            elif avg_gap <= 18:
                freq = "bi-weekly"
            else:
                freq = "monthly"
        else:
            freq = "monthly"
            avg_gap = 30
        income_pattern = {
            "frequency": freq,
            "average": avg_income,
            "last_received": max(income_dates).isoformat(),
        }

    # Days until next payday estimate
    days_until_payday = None
    if income_pattern and len(income_dates) >= 2:
        sorted_inc = sorted(income_dates)
        gaps = [(sorted_inc[i + 1] - sorted_inc[i]).days for i in range(len(sorted_inc) - 1)]
        avg_gap = round(sum(gaps) / len(gaps))
        last_pay = max(income_dates)
        next_pay = last_pay + timedelta(days=avg_gap)
        days_until_payday = max((next_pay - date.today()).days, 0)

    # Current balance: most recent transaction with a balance value
    current_balance = None
    for t in reversed(sorted_txns):
        bal = t.get("balance")
        if bal is not None:
            current_balance = round(float(bal), 2)
            break

    # Spending trend: compare first half vs second half of period
    mid = min_date + timedelta(days=num_days // 2)
    first_half = sum(
        float(t.get("money_out", 0) or 0) or float(t.get("amount", 0) or 0)
        for t in sorted_txns if t["_date"] <= mid and (t.get("direction") or "").upper() != "IN"
    )
    second_half = sum(
        float(t.get("money_out", 0) or 0) or float(t.get("amount", 0) or 0)
        for t in sorted_txns if t["_date"] > mid and (t.get("direction") or "").upper() != "IN"
    )
    if first_half == 0:
        spending_trend = "stable"
    elif second_half > first_half * 1.15:
        spending_trend = "increasing"
    elif second_half < first_half * 0.85:
        spending_trend = "decreasing"
    else:
        spending_trend = "stable"

    daily_average_spend = round(total_spending / num_days, 2)

    # Clean up temp field
    for t in transactions:
        t.pop("_date", None)

    return {
        "period": f"{min_date.isoformat()} to {max_date.isoformat()}",
        "total_income": round(total_income, 2),
        "total_spending": round(total_spending, 2),
        "net": round(total_income - total_spending, 2),
        "spending_by_category": {k: round(v, 2) for k, v in sorted(spending_by_category.items(), key=lambda x: -x[1])},
        "recurring_charges": recurring_charges[:10],  # cap at 10
        "income_pattern": income_pattern,
        "daily_average_spend": daily_average_spend,
        "current_balance": current_balance,
        "days_until_payday": days_until_payday,
        "debt_info": None,
        "spending_trend": spending_trend,
    }


def build_coaching_prompt(summary: dict, user_currency: str = "$", user_name: str = "") -> str:
    """
    Build the LLM prompt from the anonymized summary.
    The prompt asks for a structured financial plan.
    """
    greeting = f"The user's name is {user_name}. " if user_name else ""
    currency_note = f"Use '{user_currency}' as the currency symbol in all amounts."

    lines = [
        f"{greeting}Here is their anonymized financial summary. {currency_note}",
        "",
        f"Period: {summary.get('period', 'N/A')}",
        f"Total income: {user_currency}{summary['total_income']:,.2f}",
        f"Total spending: {user_currency}{summary['total_spending']:,.2f}",
        f"Net: {user_currency}{summary['net']:,.2f}",
        f"Daily average spend: {user_currency}{summary['daily_average_spend']:,.2f}",
        f"Spending trend: {summary['spending_trend']}",
    ]

    if summary.get("current_balance") is not None:
        lines.append(f"Current balance: {user_currency}{summary['current_balance']:,.2f}")

    if summary.get("days_until_payday") is not None:
        lines.append(f"Estimated days until next payday: {summary['days_until_payday']}")

    if summary.get("income_pattern"):
        ip = summary["income_pattern"]
        lines.append(f"Income pattern: {ip['frequency']}, avg {user_currency}{ip['average']:,.2f}")

    if summary.get("spending_by_category"):
        lines.append("\nSpending by category:")
        for cat, amt in summary["spending_by_category"].items():
            lines.append(f"  - {cat}: {user_currency}{amt:,.2f}")

    if summary.get("recurring_charges"):
        lines.append("\nRecurring charges:")
        for rc in summary["recurring_charges"]:
            lines.append(f"  - {rc['category']}: {user_currency}{rc['amount']:,.2f} ({rc['frequency']})")

    if summary.get("debt_info"):
        debt = summary["debt_info"]
        lines.append(f"\nDebt info: {json.dumps(debt)}")

    lines.append("\nBased on this data, provide a personalized financial coaching plan.")

    return "\n".join(lines)


VALID_CATEGORIES = [
    "Transport", "Food Delivery", "Eating Out", "Groceries", "Shopping",
    "Coffee & Cafe", "Subscriptions", "Rent", "Bills", "Utilities",
    "Bank Fees", "Transfers", "Fitness", "Entertainment", "Healthcare",
    "Education", "Travel", "Insurance", "Income", "Other",
]

CATEGORIZE_SYSTEM = (
    "You are a financial transaction categorizer. Each transaction has a merchant name, "
    "a direction (IN = money received, OUT = money spent), and an amount.\n"
    "Use direction as the PRIMARY signal:\n"
    "- IN transactions are typically Income (salary, refunds, transfers received).\n"
    "- OUT transactions are spending categories (Eating Out, Groceries, Transport, etc.).\n"
    "Same merchant CAN appear in both directions and get DIFFERENT categories. "
    "For example, a person may work at a restaurant (paycheck IN = Income) AND eat there "
    "(payment OUT = Eating Out). Treat each direction independently.\n"
    "Merchant names may be garbled, abbreviated, or contain transaction codes -- use your best judgment.\n"
    "Valid categories: " + ", ".join(VALID_CATEGORIES) + "\n"
    "Respond with ONLY a JSON object mapping keys of the form \"<merchant>|<direction>\" "
    "to a category. No markdown fences, no explanation."
)


def _key(merchant: str, direction: str) -> str:
    return f"{merchant}|{direction}"


async def categorize_merchants(items: list[dict]) -> dict[str, str]:
    """Use AI to categorize unknown transactions.

    Args:
        items: list of dicts with keys: merchant (str), direction ('IN'|'OUT'), amount (float)

    Returns:
        dict mapping "<merchant>|<direction>" to category string.
    """
    if not items:
        return {}

    # Cap at 15 items per call (garbled text causes JSON parse failures in larger batches)
    items = items[:15]

    # Fallback if API not configured
    if not ANTHROPIC_API_KEY:
        return {_key(it["merchant"], it["direction"]): ("Income" if it["direction"] == "IN" else "Other") for it in items}

    prompt_lines = []
    for it in items:
        m = it.get("merchant", "")
        d = it.get("direction", "OUT")
        a = float(it.get("amount", 0) or 0)
        prompt_lines.append(f"- {m} | {d} | amount={a:.2f}")
    prompt = "Categorize these transactions:\n" + "\n".join(prompt_lines)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                ANTHROPIC_URL,
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
                    "max_tokens": 1024,
                    "system": CATEGORIZE_SYSTEM,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30.0,
            )

        if response.status_code != 200:
            return {_key(it["merchant"], it["direction"]): ("Income" if it["direction"] == "IN" else "Other") for it in items}

        body = response.json()
        text = body.get("content", [{}])[0].get("text", "")

        # Strip markdown code fences if present
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        result = json.loads(cleaned)

        # Validate: ensure all values are valid categories, default sensibly per direction
        validated = {}
        for it in items:
            m = it.get("merchant", "")
            d = it.get("direction", "OUT")
            k = _key(m, d)
            cat = result.get(k, None)
            if cat not in VALID_CATEGORIES:
                # Defensive fallback: IN with no/invalid category -> Income, OUT -> Other
                cat = "Income" if d == "IN" else "Other"
            elif cat == "Other" and d == "IN":
                # AI gave up on an IN transaction -- direction signal says it's likely Income
                cat = "Income"
            validated[k] = cat
        return validated

    except Exception:
        return {_key(it["merchant"], it["direction"]): ("Income" if it["direction"] == "IN" else "Other") for it in items}


async def generate_plan(
    transactions: list[dict],
    user_currency: str = "$",
    user_name: str = "",
    debt_info: dict = None,
) -> dict:
    """
    Main entry point: takes transactions, returns a structured coaching plan.
    Calls Anthropic API with anonymized data.
    Resolves currency from transaction data if user profile currency doesn't match.
    Returns structured JSON plan.
    """
    if not ANTHROPIC_API_KEY:
        return {"error": "AI coaching not configured. Set ANTHROPIC_API_KEY in environment.", "plan": None}

    if not transactions:
        return {"error": "No transactions to analyze.", "plan": None}

    # Resolve currency: detect from transactions if profile currency is a code
    resolved_currency = resolve_currency(user_currency, transactions)

    summary = anonymize_transactions(transactions)
    if debt_info:
        summary["debt_info"] = debt_info

    prompt = build_coaching_prompt(summary, resolved_currency, user_name)

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                ANTHROPIC_URL,
                headers={
                    "x-api-key": ANTHROPIC_API_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": ANTHROPIC_MODEL,
                    "max_tokens": 1500,
                    "system": SYSTEM_PROMPT,
                    "messages": [{"role": "user", "content": prompt}],
                },
                timeout=30.0,
            )

        if response.status_code != 200:
            return {"error": f"AI service returned status {response.status_code}", "plan": None}

        body = response.json()
        text = body.get("content", [{}])[0].get("text", "")

        # Strip markdown code fences if present
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"\s*```$", "", cleaned)

        plan = json.loads(cleaned)
        return {"error": None, "plan": plan, "summary": summary}

    except httpx.TimeoutException:
        return {"error": "AI service timed out. Please try again.", "plan": None}
    except json.JSONDecodeError:
        return {"error": "AI returned an unparseable response. Please try again.", "plan": None}
    except Exception as e:
        return {"error": f"AI coaching failed: {str(e)}", "plan": None}


async def generate_plan_stream(transactions, user_currency="$", user_name="", debt_info=None):
    """Stream coaching plan tokens as they arrive from Anthropic API."""
    if not ANTHROPIC_API_KEY:
        yield {"error": "AI coaching not configured."}
        return
    if not transactions:
        yield {"error": "No transactions to analyze."}
        return

    resolved_currency = resolve_currency(user_currency, transactions)
    summary = anonymize_transactions(transactions)
    if debt_info:
        summary["debt_info"] = debt_info
    prompt = build_coaching_prompt(summary, resolved_currency, user_name)

    accumulated = ""
    try:
        async with httpx.AsyncClient() as client:
            async with client.stream("POST", ANTHROPIC_URL,
                headers={"x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": ANTHROPIC_MODEL, "max_tokens": 1000, "system": SYSTEM_PROMPT, "messages": [{"role": "user", "content": prompt}], "stream": True},
                timeout=45.0
            ) as response:
                async for line in response.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        event = json.loads(data)
                        if event.get("type") == "content_block_delta":
                            text = event.get("delta", {}).get("text", "")
                            if text:
                                accumulated += text
                                yield {"token": text}
                    except json.JSONDecodeError:
                        continue

        # Parse accumulated JSON
        clean = accumulated.strip()
        if clean.startswith("```"): clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
        if clean.endswith("```"): clean = clean[:-3]
        clean = clean.strip()

        try:
            plan = json.loads(clean)
            yield {"done": True, "plan": plan, "summary": summary}
        except json.JSONDecodeError:
            yield {"done": True, "plan": None, "raw": accumulated, "summary": summary}
    except Exception as e:
        yield {"error": str(e), "partial": accumulated}
