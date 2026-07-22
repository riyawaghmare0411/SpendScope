"""E2E test of the wipe-data feature against local backend.
Run: python tests/test_wipe.py
"""
import asyncio, httpx, time, asyncpg, os, sys

BASE = os.environ.get("SPENDSCOPE_API_BASE", "http://127.0.0.1:8000")
DB_URL = os.environ.get("SPENDSCOPE_DB_URL", "postgresql://spendscope:spendscope_dev@localhost:5432/spendscope")


def step(label, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}{(' -- ' + detail) if detail else ''}")
    return ok


async def main():
    failures = 0
    async with httpx.AsyncClient(timeout=30.0) as c:
        # 1. Signup
        email = f"wipetest+{int(time.time())}@example.com"
        r = await c.post(f"{BASE}/api/auth/signup", json={
            "email": email, "password": "test1234", "name": "WipeTest",
            "country": "GB", "currency": "GBP",
        })
        if not step("signup", r.status_code == 200, f"HTTP {r.status_code}"):
            print(f"     body: {r.text[:200]}"); sys.exit(1)
        token = r.json()["access_token"]
        user_id = r.json()["user"]["id"]
        H = {"Authorization": f"Bearer {token}"}
        print(f"     user_id={user_id}  email={email}")

        # 2. Import 5 txns
        r = await c.post(f"{BASE}/api/transactions/import", headers=H, json={
            "transactions": [
                {"date_iso": "2026-04-01", "merchant": "Tesco Stores", "category": "Other", "money_out": 45, "direction": "OUT"},
                {"date_iso": "2026-04-05", "merchant": "Wingstop", "category": "Other", "money_out": 20, "direction": "OUT"},
                {"date_iso": "2026-04-10", "merchant": "Spotify", "category": "Other", "money_out": 9.99, "direction": "OUT"},
                {"date_iso": "2026-04-15", "merchant": "Random Cafe", "category": "Other", "money_out": 12, "direction": "OUT"},
                {"date_iso": "2026-04-20", "merchant": "Salary", "category": "Income", "money_in": 2500, "direction": "IN"},
            ],
            "account_name": "WipeAcct", "filename": "wipetest.csv", "source_type": "csv",
        })
        if not step("import 5 transactions", r.status_code == 200, f"HTTP {r.status_code}"):
            print(f"     body: {r.text[:200]}"); failures += 1

        # 3. Verify pre-wipe state
        r = await c.get(f"{BASE}/api/transactions", headers=H)
        n_txn = len(r.json()) if r.status_code == 200 else -1
        step("GET /api/transactions returns 5", n_txn == 5, f"got {n_txn}")
        if n_txn != 5: failures += 1

        r = await c.get(f"{BASE}/api/accounts", headers=H)
        n_acct = len(r.json()) if r.status_code == 200 else -1
        step("GET /api/accounts returns 1", n_acct == 1, f"got {n_acct}")
        if n_acct != 1: failures += 1

        # 5. Add a category rule (writes to JSON file -- known not user-scoped)
        r = await c.post(f"{BASE}/api/category-rules", json={
            "merchant": "tesco", "direction": "OUT", "category": "Groceries"
        })
        if not step("POST /api/category-rules (no auth)", r.status_code == 200, f"HTTP {r.status_code}"):
            failures += 1

        # 6. Call wipe
        r = await c.post(f"{BASE}/api/account/wipe-data", headers=H)
        if not step("POST /api/account/wipe-data", r.status_code == 200, f"HTTP {r.status_code}"):
            print(f"     body: {r.text[:200]}"); failures += 1
        else:
            j = r.json()
            print(f"     response: {j}")

        # 7. Verify post-wipe state
        r = await c.get(f"{BASE}/api/transactions", headers=H)
        n_txn = len(r.json()) if r.status_code == 200 else -1
        step("transactions cleared (==0)", n_txn == 0, f"got {n_txn}")
        if n_txn != 0: failures += 1

        # 8. Accounts cleared
        r = await c.get(f"{BASE}/api/accounts", headers=H)
        n_acct = len(r.json()) if r.status_code == 200 else -1
        step("accounts cleared (==0)", n_acct == 0, f"got {n_acct}")
        if n_acct != 0: failures += 1

        # 9. User row INTACT
        r = await c.get(f"{BASE}/api/auth/me", headers=H)
        ok = r.status_code == 200 and r.json().get("email") == email
        step("user row preserved (auth still works, email matches)", ok, f"HTTP {r.status_code}")
        if not ok: failures += 1

        # Task 3: DB-level verification via asyncpg
        try:
            conn = await asyncpg.connect(DB_URL)
            t_count = await conn.fetchval("SELECT count(*) FROM transactions WHERE user_id = $1", user_id)
            a_count = await conn.fetchval("SELECT count(*) FROM accounts WHERE user_id = $1", user_id)
            i_count = await conn.fetchval("SELECT count(*) FROM import_batches WHERE user_id = $1", user_id)
            await conn.close()
            if not step(f"DB-level: transactions={t_count}, accounts={a_count}, batches={i_count} all zero",
                        t_count == 0 and a_count == 0 and i_count == 0):
                failures += 1
        except Exception as e:
            step("DB-level cross-check", False, f"db error: {e}")
            failures += 1

        # 10. Idempotency: call wipe again
        r = await c.post(f"{BASE}/api/account/wipe-data", headers=H)
        if not step("wipe again (idempotent)", r.status_code == 200, f"HTTP {r.status_code}"):
            failures += 1
        if r.status_code == 200:
            j = r.json()
            print(f"     2nd-wipe deleted counts: {j.get('deleted', j)}")

        # 11. Re-import works
        r = await c.post(f"{BASE}/api/transactions/import", headers=H, json={
            "transactions": [
                {"date_iso": "2026-05-01", "merchant": "After-Wipe Test", "category": "Other", "money_out": 5, "direction": "OUT"},
                {"date_iso": "2026-05-02", "merchant": "Salary 2", "category": "Income", "money_in": 100, "direction": "IN"},
            ],
            "account_name": "PostWipe", "filename": "post.csv", "source_type": "csv",
        })
        if not step("re-import after wipe", r.status_code == 200, f"HTTP {r.status_code}"):
            failures += 1
        r = await c.get(f"{BASE}/api/transactions", headers=H)
        n = len(r.json()) if r.status_code == 200 else -1
        step("GET /api/transactions returns 2 (re-imported)", n == 2, f"got {n}")
        if n != 2: failures += 1

    print()
    print("=" * 60)
    if failures == 0:
        print("WIPE-DATA E2E: ALL PASS -- feature works correctly")
    else:
        print(f"WIPE-DATA E2E: {failures} FAILURES -- see above")
    print("=" * 60)
    if failures > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
