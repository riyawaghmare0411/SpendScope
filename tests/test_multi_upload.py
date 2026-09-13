"""E2E test: simulate the multi-file upload flow that the frontend executes.
Three CSVs -> three /api/transactions/import calls -> three accounts created.
"""
import asyncio, httpx, time, asyncpg, os, sys
import cleanup

BASE = os.environ.get("SPENDSCOPE_API_BASE", "http://127.0.0.1:8000")
DB_URL = os.environ.get("SPENDSCOPE_DB_URL", "postgresql://spendscope:spendscope_dev@localhost:5432/spendscope")


def step(label, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}{(' -- ' + detail) if detail else ''}")
    return ok


async def main():
    failures = 0
    email = f"multitest+{int(time.time())}@example.com"
    try:
        async with httpx.AsyncClient(timeout=60.0) as c:
            # 1. Fresh user
            r = await c.post(f"{BASE}/api/auth/signup", json={
                "email": email, "password": "test1234", "name": "MultiTest",
                "country": "GB", "currency": "GBP",
            })
            if not step("signup", r.status_code == 200): sys.exit(1)
            token = r.json()["access_token"]
            user_id = r.json()["user"]["id"]
            H = {"Authorization": f"Bearer {token}"}

            # 2. Simulate three "files" being parsed (skip the parse endpoint, just import directly)
            files = [
                {
                    "transactions": [
                        {"date_iso": "2026-04-01", "merchant": "Tesco", "category": "Other", "money_out": 45, "direction": "OUT"},
                        {"date_iso": "2026-04-05", "merchant": "Wingstop", "category": "Other", "money_out": 18, "direction": "OUT"},
                    ],
                    "account_name": "Lloyds Checking", "filename": "lloyds-apr.csv", "source_type": "csv",
                    "bank_name": "Lloyds",
                },
                {
                    "transactions": [
                        {"date_iso": "2026-04-10", "merchant": "Walmart", "category": "Other", "money_out": 80, "direction": "OUT"},
                        {"date_iso": "2026-04-15", "merchant": "Starbucks", "category": "Other", "money_out": 6, "direction": "OUT"},
                        {"date_iso": "2026-04-20", "merchant": "Direct Deposit", "category": "Income", "money_in": 2200, "direction": "IN"},
                    ],
                    "account_name": "BofA Checking", "filename": "bofa-apr.pdf", "source_type": "pdf",
                    "bank_name": "Bank of America",
                },
                {
                    "transactions": [
                        {"date_iso": "2026-04-25", "merchant": "Amazon", "category": "Other", "money_out": 35, "direction": "OUT"},
                    ],
                    "account_name": "Lloyds Credit Card", "filename": "lloyds-credit-apr.csv", "source_type": "csv",
                    "bank_name": "Lloyds",
                },
            ]

            # 3. POST each (sequential, mimicking the frontend's loop)
            for f in files:
                r = await c.post(f"{BASE}/api/transactions/import", headers=H, json=f)
                if not step(f"import file: {f['filename']}", r.status_code == 200, f"HTTP {r.status_code}"):
                    failures += 1
                    continue

            # 4. Verify three accounts exist
            r = await c.get(f"{BASE}/api/accounts", headers=H)
            accounts = r.json() if r.status_code == 200 else []
            names = sorted(a["name"] for a in accounts)
            expected = sorted(["Lloyds Checking", "BofA Checking", "Lloyds Credit Card"])
            step(f"three accounts created: {names}", names == expected)
            if names != expected: failures += 1

            # 5. Verify total transactions = 6 (2 + 3 + 1)
            r = await c.get(f"{BASE}/api/transactions", headers=H)
            n = len(r.json()) if r.status_code == 200 else -1
            step("total transactions = 6 across 3 files", n == 6, f"got {n}")
            if n != 6: failures += 1

            # 6. Verify each transaction has the correct account_id
            txns = r.json()
            acct_by_name = {a["name"]: a["id"] for a in accounts}
            per_account = {name: 0 for name in expected}
            for t in txns:
                for name, acct_id in acct_by_name.items():
                    if t.get("account_id") == acct_id:
                        per_account[name] += 1
            step("per-account counts: Lloyds Checking=2, BofA Checking=3, Lloyds Credit Card=1",
                 per_account == {"Lloyds Checking": 2, "BofA Checking": 3, "Lloyds Credit Card": 1},
                 f"got {per_account}")
            if per_account != {"Lloyds Checking": 2, "BofA Checking": 3, "Lloyds Credit Card": 1}: failures += 1

            # 7. Verify import_batches: should be 3 batches
            try:
                conn = await asyncpg.connect(DB_URL)
                n_batches = await conn.fetchval("SELECT count(*) FROM import_batches WHERE user_id = $1", user_id)
                await conn.close()
                step("3 import_batches created", n_batches == 3, f"got {n_batches}")
                if n_batches != 3: failures += 1
            except Exception as e:
                step("DB import_batches check", False, f"err: {e}"); failures += 1

            # 8. Test PATCH on an account (rename) -- supports the AccountsListPanel rename feature
            first_acct = accounts[0]
            r = await c.patch(f"{BASE}/api/accounts/{first_acct['id']}", headers=H,
                              json={"name": first_acct["name"] + " (renamed)"})
            step(f"PATCH /api/accounts/{{id}} (rename)", r.status_code == 200, f"HTTP {r.status_code}")
            if r.status_code != 200: failures += 1

            # 9. Test DELETE on an account
            last_acct = accounts[-1]
            r = await c.delete(f"{BASE}/api/accounts/{last_acct['id']}", headers=H)
            step(f"DELETE /api/accounts/{{id}}", r.status_code == 200, f"HTTP {r.status_code}")
            if r.status_code != 200: failures += 1
            # Confirm only 2 accounts remain
            r = await c.get(f"{BASE}/api/accounts", headers=H)
            n = len(r.json()) if r.status_code == 200 else -1
            step("2 accounts remain after delete", n == 2, f"got {n}")
            if n != 2: failures += 1
    finally:
        await cleanup.cleanup_test_user(email, DB_URL)

    print()
    print("=" * 60)
    if failures == 0:
        print("MULTI-FILE UPLOAD E2E: ALL PASS")
    else:
        print(f"MULTI-FILE UPLOAD E2E: {failures} FAILURES")
    print("=" * 60)
    if failures > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
