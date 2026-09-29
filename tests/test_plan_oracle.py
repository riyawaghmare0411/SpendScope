"""Correctness oracle for GET /api/plan/today: builds the exact same ForecastInput the
API should be building, runs it locally through src.finance, and asserts the API's
safe_to_spend_today/balance_today/lowest_point/overall_risk match that independent
computation exactly (not approximately). Catches wiring bugs in plan_service.py, not
just shape/status-code mismatches.

The scenario is deliberately made DISCRIMINATING (not just correct-looking):
  - current_balance is seeded to a nonzero value directly via asyncpg (a plan_service
    that never fetched/aggregated the account's cash balance would still report 0).
  - the Rent bill is anchored to land BEFORE the Paycheck income within the horizon, so
    the forecast's protected-bills-before-next-income subtraction actually gets exercised
    for day 0 (a plan_service that dropped confirmed rules on the floor would not reflect
    this).
  - a second, independent "no-rules" oracle (same balance, recurring=[]) is computed and
    asserted to DIFFER from the "with-rules" oracle -- proving the scenario itself would
    catch a wiring bug -- before asserting the API matches the with-rules oracle exactly.

Run: python tests/test_plan_oracle.py
"""
import asyncio, httpx, time, os, sys, uuid
from datetime import timedelta
from decimal import Decimal
import asyncpg
import cleanup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from src import finance, money, timeutil
from src.plan_types import ForecastInput, RecurringRule

BASE = os.environ.get("SPENDSCOPE_API_BASE", "http://127.0.0.1:8000")
DB_URL = os.environ.get("SPENDSCOPE_DB_URL", "postgresql://spendscope:spendscope_dev@localhost:5432/spendscope")

CURRENCY = "USD"
HORIZON_DAYS = 30  # matches src.plan_service.DEFAULT_HORIZON_DAYS
STARTING_BALANCE = Decimal("2450.32")  # nonzero, seeded directly via asyncpg (see step 3)
BILL_OFFSET_DAYS = 3     # Rent lands ~3 days from as_of
INCOME_OFFSET_DAYS = 10  # Paycheck lands ~10 days from as_of -- strictly after the bill


def step(label, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}{(' -- ' + detail) if detail else ''}")
    return ok


async def _seed_account_balance(user_id: str, account_name: str, balance: Decimal) -> None:
    """Set the manual account's current_balance directly via asyncpg, exactly like
    test_plaid_fake_sync.py seeds a PlaidItem row -- there is no balance-setting endpoint
    for a manual account, and a zero balance can't discriminate a broken pipeline from a
    working one (0 in -> 0 out either way)."""
    conn = await asyncpg.connect(DB_URL)
    try:
        row = await conn.fetchrow(
            "SELECT id FROM accounts WHERE user_id = $1 AND name = $2", uuid.UUID(user_id), account_name
        )
        if row is None:
            raise RuntimeError(f"no account named {account_name!r} found for user {user_id}")
        await conn.execute("UPDATE accounts SET current_balance = $1 WHERE id = $2", float(balance), row["id"])
    finally:
        await conn.close()


async def main():
    failures = 0
    email = f"planoracle+{int(time.time())}@example.com"
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            # 1. Signup (defaults: country="", currency="USD" -> plan currency USD, tz UTC)
            r = await c.post(f"{BASE}/api/auth/signup", json={
                "email": email, "password": "testpassword123", "name": "PlanOracle",
            })
            if not step("signup", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); sys.exit(1)
            token = r.json()["access_token"]
            user_id = r.json()["user"]["id"]
            H = {"Authorization": f"Bearer {token}"}

            as_of = timeutil.today_for(timeutil.resolve_timezone(None, ""))
            bill_anchor_day = (as_of + timedelta(days=BILL_OFFSET_DAYS)).day
            income_anchor_day = (as_of + timedelta(days=INCOME_OFFSET_DAYS)).day

            # 2. Import a few transactions -- creates a "Primary" USD account (Account's
            # currency column default), establishes a currency to import against. Too few
            # same-merchant occurrences to register as a recurring candidate on their own.
            r = await c.post(f"{BASE}/api/transactions/import", headers=H, json={
                "transactions": [
                    {"date_iso": "2026-09-01", "merchant": "Corner Cafe", "category": "Eating Out", "money_out": 12, "direction": "OUT"},
                    {"date_iso": "2026-09-10", "merchant": "Hardware Store", "category": "Shopping", "money_out": 40, "direction": "OUT"},
                ],
                "account_name": "Primary", "filename": "oracle.csv", "source_type": "csv",
            })
            if not step("import 2 transactions", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); failures += 1

            # 3. Seed a nonzero current_balance on the "Primary" account directly via asyncpg
            # (no balance-setting endpoint exists for a manual account).
            try:
                await _seed_account_balance(user_id, "Primary", STARTING_BALANCE)
                step("seed nonzero current_balance via asyncpg", True, f"balance={STARTING_BALANCE}")
            except Exception as e:
                step("seed nonzero current_balance via asyncpg", False, str(e)); sys.exit(1)

            # 4. Confirmed recurring OUT bill (manual add -> status=confirmed immediately),
            # anchored BEFORE the income below so the forecast's protected-bills-before-
            # next-income subtraction is actually exercised on day 0.
            r = await c.post(f"{BASE}/api/plan/recurring", headers=H, json={
                "label": "Rent", "direction": "OUT", "cadence": "monthly_fixed_day",
                "amount": 900.00, "currency": CURRENCY, "anchor_day": 1,
            })
            if not step("POST /api/plan/recurring (bill)", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); sys.exit(1)
            bill_id = r.json()["id"]

            # 5. PATCH it (exercise the endpoint) -- move the anchor day to land before the
            # income, still confirmed
            r = await c.patch(f"{BASE}/api/plan/recurring/{bill_id}", headers=H, json={"anchor_day": bill_anchor_day})
            if not step("PATCH /api/plan/recurring/{id} (bill anchor_day)", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); failures += 1
            bill = r.json()

            # 6. Confirmed recurring IN income, anchored strictly after the bill
            r = await c.post(f"{BASE}/api/plan/recurring", headers=H, json={
                "label": "Paycheck", "direction": "IN", "cadence": "monthly_fixed_day",
                "amount": 2000.00, "currency": CURRENCY, "anchor_day": income_anchor_day,
            })
            if not step("POST /api/plan/recurring (income)", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); sys.exit(1)
            income = r.json()

            # 7. GET /api/plan/today
            r = await c.get(f"{BASE}/api/plan/today", headers=H)
            if not step("GET /api/plan/today", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); sys.exit(1)
            plan = r.json()
            print(f"     plan: {plan}")

            # 8. INDEPENDENT oracle: same ForecastInput, computed locally.
            rules = [
                RecurringRule(
                    id=bill["id"], label="Rent", direction="OUT", cadence="monthly_fixed_day",
                    amount=Decimal("900.00"), currency=CURRENCY, anchor_day=bill_anchor_day,
                ),
                RecurringRule(
                    id=income["id"], label="Paycheck", direction="IN", cadence="monthly_fixed_day",
                    amount=Decimal("2000.00"), currency=CURRENCY, anchor_day=income_anchor_day,
                ),
            ]
            oracle_input = ForecastInput(
                as_of=as_of,
                horizon_days=HORIZON_DAYS,
                currency=CURRENCY,
                starting_balance=STARTING_BALANCE,
                reserve_buffer=Decimal("0"),  # no PlanSettings row created for this user
                recurring=rules,
                events=[],
            )
            oracle_days = finance.build_forecast(oracle_input)
            oracle_summary = finance.summarize_forecast(oracle_days)

            # 9. DISCRIMINATION CHECK: a second, independent oracle with the same balance but
            # NO recurring rules. If this matched the with-rules oracle, the scenario itself
            # couldn't prove the API actually used the confirmed rules -- so assert first that
            # it does NOT match, before trusting the API-vs-oracle comparison below.
            no_rules_days = finance.build_forecast(ForecastInput(
                as_of=as_of, horizon_days=HORIZON_DAYS, currency=CURRENCY,
                starting_balance=STARTING_BALANCE, reserve_buffer=Decimal("0"),
                recurring=[], events=[],
            ))
            no_rules_summary = finance.summarize_forecast(no_rules_days)
            discriminates = (
                oracle_summary.safe_to_spend_today != no_rules_summary.safe_to_spend_today
                or oracle_summary.lowest_point != no_rules_summary.lowest_point
            )
            if not step("scenario discriminates: with-rules oracle differs from no-rules oracle",
                        discriminates,
                        f"with_rules={oracle_summary.safe_to_spend_today}/{oracle_summary.lowest_point} "
                        f"no_rules={no_rules_summary.safe_to_spend_today}/{no_rules_summary.lowest_point}"):
                print("     scenario is non-discriminating -- fix the test before trusting the checks below"); sys.exit(1)

            expected_safe_to_spend = money.to_json_number(money.quantize(oracle_summary.safe_to_spend_today, CURRENCY))
            expected_balance_today = money.to_json_number(money.quantize(STARTING_BALANCE, CURRENCY))
            expected_lowest_amount = money.to_json_number(money.quantize(oracle_summary.lowest_point, CURRENCY))
            expected_lowest_date = oracle_summary.lowest_point_date.isoformat()
            expected_risk = oracle_summary.overall_risk

            if not step("safe_to_spend_today matches oracle exactly",
                        plan.get("safe_to_spend_today") == expected_safe_to_spend,
                        f"api={plan.get('safe_to_spend_today')} oracle={expected_safe_to_spend}"):
                failures += 1
            if not step("balance_today matches oracle exactly",
                        plan.get("balance_today") == expected_balance_today,
                        f"api={plan.get('balance_today')} oracle={expected_balance_today}"):
                failures += 1
            lowest = plan.get("lowest_point") or {}
            if not step("lowest_point.amount matches oracle exactly",
                        lowest.get("amount") == expected_lowest_amount,
                        f"api={lowest.get('amount')} oracle={expected_lowest_amount}"):
                failures += 1
            if not step("lowest_point.date matches oracle exactly",
                        lowest.get("date") == expected_lowest_date,
                        f"api={lowest.get('date')} oracle={expected_lowest_date}"):
                failures += 1
            if not step("overall_risk matches oracle exactly",
                        plan.get("overall_risk") == expected_risk,
                        f"api={plan.get('overall_risk')} oracle={expected_risk}"):
                failures += 1

            # 10. Also assert the API's own numbers differ from what a no-rules run would have
            # produced -- the same discrimination proof, but against the live API response
            # rather than only the local oracle-vs-oracle comparison above.
            expected_no_rules_safe_to_spend = money.to_json_number(money.quantize(no_rules_summary.safe_to_spend_today, CURRENCY))
            if not step("API safe_to_spend_today differs from a no-rules run (rules were actually used)",
                        plan.get("safe_to_spend_today") != expected_no_rules_safe_to_spend,
                        f"api={plan.get('safe_to_spend_today')} no_rules={expected_no_rules_safe_to_spend}"):
                failures += 1

            # 11. next_income sanity: earliest confirmed IN rule is the Paycheck
            next_income = plan.get("next_income") or {}
            if not step("next_income label is Paycheck", next_income.get("label") == "Paycheck", f"got {next_income}"):
                failures += 1
    finally:
        await cleanup.cleanup_test_user(email, DB_URL)

    print()
    print("=" * 60)
    if failures == 0:
        print("PLAN-ORACLE: ALL PASS -- forecast pipeline matches the local oracle exactly")
    else:
        print(f"PLAN-ORACLE: {failures} FAILURES -- see above")
    print("=" * 60)
    if failures > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
