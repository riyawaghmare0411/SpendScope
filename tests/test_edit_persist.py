import asyncio, httpx, time, os, sys
import cleanup

BASE = os.environ.get("SPENDSCOPE_API_BASE", "http://127.0.0.1:8000")

async def main():
    email = f"editfix{int(time.time())}@example.com"
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(f"{BASE}/api/auth/signup", json={"email": email, "password": "test1234", "name": "X", "country": "GB", "currency": "GBP"})
            H = {"Authorization": f"Bearer {r.json()['access_token']}"}
            await c.post(f"{BASE}/api/transactions/import", headers=H, json={
                "transactions": [{"date_iso": "2026-02-27", "merchant": "GO SOUTH COAST", "category": "Other", "money_out": 2.60, "direction": "OUT"}],
                "account_name": "Test", "filename": "t.csv", "source_type": "csv",
            })
            r = await c.get(f"{BASE}/api/transactions", headers=H)
            t = r.json()[0]
            print(f"BEFORE: category={t['category']}")
            r = await c.patch(f"{BASE}/api/transactions/{t['id']}", headers=H, json={"category": "Transport"})
            print(f"PATCH status: {r.status_code}")
            r = await c.get(f"{BASE}/api/transactions", headers=H)
            after_category = r.json()[0]["category"]
            print(f"AFTER:  category={after_category}")
            if after_category != "Transport":
                print("BACKEND BROKEN: category not persisted")
                sys.exit(1)
            print("Backend PATCH works correctly -- the bug was purely on the frontend.")
    finally:
        await cleanup.cleanup_test_user(email)
asyncio.run(main())
