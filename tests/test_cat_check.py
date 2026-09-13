import asyncio, httpx, time, os, sys
import cleanup

BASE = os.environ.get("SPENDSCOPE_API_BASE", "http://127.0.0.1:8000")

async def main():
    email = f"cattest{int(time.time())}@example.com"
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(f"{BASE}/api/auth/signup", json={"email": email, "password": "test1234", "name": "X", "country": "GB", "currency": "GBP"})
            H = {"Authorization": f"Bearer {r.json()['access_token']}"}
            items = [
                {"merchant": "UBER *TRIP", "direction": "OUT", "amount": 12.44},
                {"merchant": "NON-GBP TRANS FEE", "direction": "OUT", "amount": 0.05},
                {"merchant": "NON-GBP PURCH FEE", "direction": "OUT", "amount": 0.10},
                {"merchant": "TESCO STORES 1234", "direction": "OUT", "amount": 30.00},
                {"merchant": "SPOTIFY UK", "direction": "OUT", "amount": 9.99},
                {"merchant": "BP PETROL STATION", "direction": "OUT", "amount": 45.00},
                {"merchant": "CHOPSTIX SOUTHAMPT", "direction": "OUT", "amount": 4.22},
                {"merchant": "WINGSTOP", "direction": "OUT", "amount": 20.00},
            ]
            r = await c.post(f"{BASE}/api/categorize-local", headers=H, json={"items": items})
            if r.status_code != 200:
                print(f"FAIL: POST /api/categorize-local returned HTTP {r.status_code}: {r.text[:200]}")
                sys.exit(1)

            categories = r.json().get("categories", {})
            for k, v in categories.items():
                print(f"  {k:35s} -> {v}")

            failures = 0
            for item in items:
                key = f"{item['merchant']}|{item['direction']}"
                if key not in categories:
                    print(f"FAIL: no category returned for '{key}'")
                    failures += 1
                    continue
                value = categories[key]
                if not isinstance(value, str) or not value.strip():
                    print(f"FAIL: category for '{key}' is not a non-empty string: {value!r}")
                    failures += 1

            if failures:
                sys.exit(1)
            print("CATEGORIZE-LOCAL: all submitted merchants got a non-empty category")
    finally:
        await cleanup.cleanup_test_user(email)

asyncio.run(main())
