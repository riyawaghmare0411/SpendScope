"""E2E test of Phase C's category-rules user isolation against local backend --
this was verified by hand during Phase C but never captured as a test.
Does NOT import any transactions (the local embedder is broken on this machine).
Run: python tests/test_rules_isolation.py
"""
import asyncio, httpx, time, os, sys
import cleanup

BASE = os.environ.get("SPENDSCOPE_API_BASE", "http://127.0.0.1:8000")
DB_URL = os.environ.get("SPENDSCOPE_DB_URL", "postgresql://spendscope:spendscope_dev@localhost:5432/spendscope")


def step(label, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}{(' -- ' + detail) if detail else ''}")
    return ok


async def main():
    failures = 0
    ts = int(time.time())
    email_a = f"a_{ts}@t.com"
    email_b = f"b_{ts}@t.com"
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            # 1. Sign up user A and user B
            r = await c.post(f"{BASE}/api/auth/signup", json={
                "email": email_a, "password": "test1234", "name": "RulesA", "country": "GB", "currency": "GBP",
            })
            if not step("signup user A", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); sys.exit(1)
            HA = {"Authorization": f"Bearer {r.json()['access_token']}"}

            r = await c.post(f"{BASE}/api/auth/signup", json={
                "email": email_b, "password": "test1234", "name": "RulesB", "country": "GB", "currency": "GBP",
            })
            if not step("signup user B", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); sys.exit(1)
            HB = {"Authorization": f"Bearer {r.json()['access_token']}"}

            # 2. A posts its own rule
            r = await c.post(f"{BASE}/api/category-rules", headers=HA, json={
                "match_type": "contains", "match_value": "ISOLATION-A", "direction": "OUT", "category": "Groceries",
            })
            if not step("POST /api/category-rules as A", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); failures += 1
            rule_id_a = r.json().get("id") if r.status_code == 200 else None

            # 3. B posts its own rule
            r = await c.post(f"{BASE}/api/category-rules", headers=HB, json={
                "match_type": "contains", "match_value": "ISOLATION-B", "direction": "OUT", "category": "Dining",
            })
            if not step("POST /api/category-rules as B", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); failures += 1
            rule_id_b = r.json().get("id") if r.status_code == 200 else None

            # 4. GET as A shows exactly A's rule(s), none of B's
            r = await c.get(f"{BASE}/api/category-rules", headers=HA)
            rules_a = r.json() if r.status_code == 200 else []
            ids_a = {ru["id"] for ru in rules_a}
            values_a = {ru["match_value"] for ru in rules_a}
            a_isolated = r.status_code == 200 and ids_a == {rule_id_a} and values_a == {"ISOLATION-A"}
            if not step("GET /api/category-rules as A shows exactly A's rule, none of B's",
                        a_isolated, f"got {values_a}"):
                failures += 1

            # 5. GET as B shows exactly B's rule(s), none of A's
            r = await c.get(f"{BASE}/api/category-rules", headers=HB)
            rules_b = r.json() if r.status_code == 200 else []
            ids_b = {ru["id"] for ru in rules_b}
            values_b = {ru["match_value"] for ru in rules_b}
            b_isolated = r.status_code == 200 and ids_b == {rule_id_b} and values_b == {"ISOLATION-B"}
            if not step("GET /api/category-rules as B shows exactly B's rule, none of A's",
                        b_isolated, f"got {values_b}"):
                failures += 1

            # 6. GET with no token -> 401
            r = await c.get(f"{BASE}/api/category-rules")
            if not step("GET /api/category-rules with no token -> 401", r.status_code == 401, f"HTTP {r.status_code}"):
                failures += 1

            # 7. POST with whitespace-only match_value -> 400
            r = await c.post(f"{BASE}/api/category-rules", headers=HA, json={
                "match_type": "contains", "match_value": "   ", "direction": "OUT", "category": "Groceries",
            })
            if not step("POST with match_value='   ' -> 400", r.status_code == 400, f"HTTP {r.status_code}"):
                failures += 1

            # 8. B cannot delete A's rule -> 404
            r = await c.delete(f"{BASE}/api/category-rules/{rule_id_a}", headers=HB)
            if not step("B DELETE A's rule id -> 404", r.status_code == 404, f"HTTP {r.status_code}"):
                failures += 1

            # A's rule must still be there -- B's failed delete attempt changed nothing
            r = await c.get(f"{BASE}/api/category-rules", headers=HA)
            still_there = r.status_code == 200 and any(ru["id"] == rule_id_a for ru in r.json())
            if not step("A's rule survives B's failed delete attempt", still_there):
                failures += 1

            # 9. A wipes its data -> A's rules gone
            r = await c.post(f"{BASE}/api/account/wipe-data", headers=HA)
            if not step("POST /api/account/wipe-data as A", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); failures += 1

            r = await c.get(f"{BASE}/api/category-rules", headers=HA)
            rules_a_after = r.json() if r.status_code == 200 else None
            if not step("GET /api/category-rules as A returns empty after wipe",
                        rules_a_after == [], f"got {rules_a_after}"):
                failures += 1

    finally:
        await cleanup.cleanup_test_user(email_a, DB_URL)
        await cleanup.cleanup_test_user(email_b, DB_URL)

    print()
    print("=" * 60)
    if failures == 0:
        print("CATEGORY-RULES ISOLATION E2E: ALL PASS -- Phase C's user-scoped rules verified")
    else:
        print(f"CATEGORY-RULES ISOLATION E2E: {failures} FAILURES -- see above")
    print("=" * 60)
    if failures > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
