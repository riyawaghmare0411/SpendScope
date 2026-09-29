"""E2E test: same bank, multiple files -- each must produce its own account.
Mimics the FE behavior after Bug 1 fix: per-file unique account names like
'Lloyds - jan', 'Lloyds - feb', 'Lloyds - mar'.
"""
import asyncio, httpx, time, os, sys
import cleanup

BASE = os.environ.get("SPENDSCOPE_API_BASE", "http://127.0.0.1:8000")


def step(label, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}{(' -- ' + detail) if detail else ''}")
    return ok


async def main():
    failures = 0
    email = f"samebank+{int(time.time())}@example.com"
    try:
        async with httpx.AsyncClient(timeout=60.0) as c:
            # 1. Fresh user
            r = await c.post(f"{BASE}/api/auth/signup", json={
                "email": email, "password": "testpassword123", "name": "SameBank",
                "country": "GB", "currency": "GBP",
            })
            if not step("signup", r.status_code == 200): sys.exit(1)
            token = r.json()["access_token"]
            H = {"Authorization": f"Bearer {token}"}

            # 2. Three imports, SAME bank, DIFFERENT account_name + filename
            files = [
                {
                    "transactions": [
                        {"date_iso": "2026-01-03", "merchant": "Tesco Jan", "category": "Other", "money_out": 12, "direction": "OUT"},
                        {"date_iso": "2026-01-14", "merchant": "Sainsbury Jan", "category": "Other", "money_out": 22, "direction": "OUT"},
                    ],
                    "account_name": "Lloyds - jan", "filename": "lloyds-jan.csv", "source_type": "csv",
                    "bank_name": "Lloyds",
                },
                {
                    "transactions": [
                        {"date_iso": "2026-02-02", "merchant": "Aldi Feb", "category": "Other", "money_out": 30, "direction": "OUT"},
                        {"date_iso": "2026-02-10", "merchant": "Costa Feb", "category": "Other", "money_out": 4, "direction": "OUT"},
                        {"date_iso": "2026-02-18", "merchant": "Salary Feb", "category": "Income", "money_in": 2500, "direction": "IN"},
                    ],
                    "account_name": "Lloyds - feb", "filename": "lloyds-feb.csv", "source_type": "csv",
                    "bank_name": "Lloyds",
                },
                {
                    "transactions": [
                        {"date_iso": "2026-03-04", "merchant": "Boots Mar", "category": "Other", "money_out": 9, "direction": "OUT"},
                        {"date_iso": "2026-03-20", "merchant": "Pret Mar", "category": "Other", "money_out": 7, "direction": "OUT"},
                    ],
                    "account_name": "Lloyds - mar", "filename": "lloyds-mar.csv", "source_type": "csv",
                    "bank_name": "Lloyds",
                },
            ]
            expected_counts = {"Lloyds - jan": 2, "Lloyds - feb": 3, "Lloyds - mar": 2}
            total_expected = sum(expected_counts.values())

            # 3. POST each
            for f in files:
                r = await c.post(f"{BASE}/api/transactions/import", headers=H, json=f)
                if not step(f"import: {f['account_name']}", r.status_code == 200, f"HTTP {r.status_code}"):
                    failures += 1

            # 4. 3 separate accounts
            r = await c.get(f"{BASE}/api/accounts", headers=H)
            accounts = r.json() if r.status_code == 200 else []
            names = sorted(a["name"] for a in accounts)
            expected_names = sorted(expected_counts.keys())
            if not step(f"3 separate accounts: {names}", names == expected_names):
                failures += 1

            # 5. Total transactions = sum of all imports
            r = await c.get(f"{BASE}/api/transactions", headers=H)
            n = len(r.json()) if r.status_code == 200 else -1
            if not step(f"total transactions = {total_expected}", n == total_expected, f"got {n}"):
                failures += 1

            # 6. Each account's transaction_count matches what was POSTed
            for a in accounts:
                want = expected_counts.get(a["name"])
                got = a.get("transaction_count")
                if not step(f"account '{a['name']}' transaction_count = {want}", got == want, f"got {got}"):
                    failures += 1
    finally:
        await cleanup.cleanup_test_user(email)

    print()
    print("=" * 60)
    if failures == 0:
        print("SAME-BANK DEDUP E2E: ALL PASS")
    else:
        print(f"SAME-BANK DEDUP E2E: {failures} FAILURES")
    print("=" * 60)
    if failures > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
