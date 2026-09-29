"""E2E test of the Plaid fake-client sync path (PLAID_ENV=fake, no real Sandbox creds
needed): verify accounts + transactions land, sync again and verify no duplicate
transactions are created (upsert by plaid_transaction_id, not blind-insert) and the
sync_cursor advances.

NOTE on POST /api/plaid/exchange-token: as currently wired, that route always calls the
REAL src.plaid_service.exchange_public_token (routes/plaid.py's `ps.exchange_public_token`
is never routed through src.plaid_fake.get_client() -- only the sync path is, via
`_sync_plaid_item`'s explicit `client=plaid_fake.get_client()`). A fake public token like
"fake-public-token:simple-checking" is therefore rejected by the real Plaid Sandbox API
regardless of PLAID_ENV, and PLAID_ENV=fake itself makes src.plaid_service.get_plaid_client()
raise ("Invalid PLAID_ENV: fake") since "fake" isn't sandbox|development|production. This
looks like a gap left over from Wave 1 (routes/plaid.py's own docstring still says a later
lane extends "fake client selection"), and routes/plaid.py / plaid_service.py are both
out of this wave's scope ("do not touch ... routes/plaid.py route already built").
So this test seeds the PlaidItem row directly (exactly what exchange-token would have
persisted, via the same encrypt_token()) instead of going through exchange-token's HTTP
call, then drives everything else -- POST /api/plaid/sync, accounts, transactions,
upsert/cursor checks -- through the real running server.

IMPORTANT -- this exercises PLAID_ENV=fake behavior in src/plaid_fake.get_client(), which is
read by the SERVER process at request time, not by this test process. Setting PLAID_ENV in
this test's own environment has no effect on the server: src/api.py calls
load_dotenv(override=True) at import time, which overwrites the shell's PLAID_ENV with
whatever .env has (normally PLAID_ENV=sandbox) in the server process before it ever handles a
request. Before running this test, the SERVER you point SPENDSCOPE_API_BASE at must itself
have been started with PLAID_ENV=fake in effect AFTER its own load_dotenv(override=True) has
already run -- either set PLAID_ENV=fake in that server's .env for the duration of the test
run, or boot it with the env var forced in AFTER importing src.api, e.g. (note the order --
setting it before the import gets clobbered by load_dotenv(override=True) during the import):
    python -c "import src.api, os; os.environ['PLAID_ENV']='fake'; import uvicorn; uvicorn.run(src.api.app, host='127.0.0.1', port=8001)"
Without this, POST /api/plaid/sync reaches the REAL Plaid SDK instead of the fake client and
this test fails with an HTTP 500 that has nothing to do with the upsert logic it's meant to
check -- see the fail-fast check right after the first sync call below.

Run: python tests/test_plaid_fake_sync.py
"""
import asyncio, httpx, time, os, sys, uuid
import asyncpg
import cleanup

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from dotenv import load_dotenv
load_dotenv()  # populates PLAID_TOKEN_ENCRYPTION_KEY etc. for encrypt_token() below

from src.database import async_session
from src.models import PlaidItem
from src.plaid_service import encrypt_token

BASE = os.environ.get("SPENDSCOPE_API_BASE", "http://127.0.0.1:8000")
DB_URL = os.environ.get("SPENDSCOPE_DB_URL", "postgresql://spendscope:spendscope_dev@localhost:5432/spendscope")

FIXTURE_TXN_COUNT = 15  # data/plaid_fixtures/simple-checking.json's "added" length


def step(label, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    print(f"  [{mark}] {label}{(' -- ' + detail) if detail else ''}")
    return ok


async def _seed_plaid_item(user_id: str) -> str:
    """Persist a PlaidItem exactly as POST /api/plaid/exchange-token would have, with an
    access token the fake client's scenario-selection convention recognizes."""
    access_token = f"fake-access-token:simple-checking:{uuid.uuid4().hex}"
    async with async_session() as session:
        item = PlaidItem(
            user_id=uuid.UUID(user_id),
            item_id=f"fake-item-{uuid.uuid4().hex}",
            access_token_encrypted=encrypt_token(access_token),
            institution_name="Fake Bank",
            sync_status="active",
        )
        session.add(item)
        await session.commit()
        await session.refresh(item)
        return str(item.id)


async def main():
    failures = 0
    email = f"plaidfake+{int(time.time())}@example.com"
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            # 1. Signup
            r = await c.post(f"{BASE}/api/auth/signup", json={
                "email": email, "password": "testpassword123", "name": "PlaidFakeSync",
            })
            if not step("signup", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); sys.exit(1)
            token = r.json()["access_token"]
            user_id = r.json()["user"]["id"]
            H = {"Authorization": f"Bearer {token}"}

            # 2. Seed a PlaidItem pointed at the "simple-checking" fixture (see module
            # docstring for why this replaces a literal exchange-token call).
            item_id = await _seed_plaid_item(user_id)
            step("seed PlaidItem (simple-checking scenario)", True, f"item_id={item_id}")

            # 3. First sync -- pulls all 15 fixture transactions + 1 account
            r = await c.post(f"{BASE}/api/plaid/sync", headers=H, json={"item_id": item_id})
            if not step("POST /api/plaid/sync (first)", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}")
                print("     Is the server at", BASE, "actually running with PLAID_ENV=fake in effect?")
                print("     (see this file's module docstring -- setting PLAID_ENV in THIS process does nothing;")
                print("     the server process needs it, after its own load_dotenv(override=True).)")
                sys.exit(1)
            first_sync = r.json()
            print(f"     first sync: {first_sync}")
            if not step(f"first sync added={FIXTURE_TXN_COUNT}", first_sync.get("added") == FIXTURE_TXN_COUNT, f"got {first_sync}"):
                failures += 1

            # 4. Accounts landed
            r = await c.get(f"{BASE}/api/accounts", headers=H)
            accounts = r.json() if r.status_code == 200 else []
            if not step("GET /api/accounts returns 1 Plaid account", len(accounts) == 1, f"got {len(accounts)}"):
                failures += 1
            elif not step("account is_plaid=True", accounts[0].get("is_plaid") is True, f"got {accounts[0]}"):
                failures += 1

            # 5. Transactions landed (all 15 from the fixture's "added" list)
            r = await c.get(f"{BASE}/api/transactions", headers=H)
            txns_after_first = r.json() if r.status_code == 200 else []
            if not step(f"GET /api/transactions returns {FIXTURE_TXN_COUNT}", len(txns_after_first) == FIXTURE_TXN_COUNT,
                        f"got {len(txns_after_first)}"):
                failures += 1

            # 6. sync_cursor set after the first sync
            conn = await asyncpg.connect(DB_URL)
            try:
                cursor_after_first = await conn.fetchval(
                    "SELECT sync_cursor FROM plaid_items WHERE id = $1", uuid.UUID(item_id)
                )
            finally:
                await conn.close()
            if not step("sync_cursor set after first sync", bool(cursor_after_first), f"got {cursor_after_first!r}"):
                failures += 1

            # 7. Force a full re-serve of the fixture: reset sync_cursor to NULL so the fake
            # client's next sync_transactions(cursor=None) starts back at offset 0 and pages
            # through the same 15 fixture items again. A blind-insert regression in
            # plaid_sync.py (upsert-by-plaid_transaction_id broken/skipped) would create 15
            # duplicate transaction rows here; the correct upsert path recognizes every
            # plaid_transaction_id as already-present and updates in place instead.
            conn = await asyncpg.connect(DB_URL)
            try:
                await conn.execute("UPDATE plaid_items SET sync_cursor = NULL WHERE id = $1", uuid.UUID(item_id))
            finally:
                await conn.close()

            r = await c.post(f"{BASE}/api/plaid/sync", headers=H, json={"item_id": item_id})
            if not step("POST /api/plaid/sync (again, cursor reset to NULL)", r.status_code == 200, f"HTTP {r.status_code}"):
                print(f"     body: {r.text[:200]}"); sys.exit(1)
            resync = r.json()
            print(f"     resync: {resync}")
            if not step("re-sync added=0 (every fixture item already exists)", resync.get("added") == 0, f"got {resync}"):
                failures += 1
            if not step(f"re-sync modified={FIXTURE_TXN_COUNT} (upsert, not blind-insert)",
                        resync.get("modified") == FIXTURE_TXN_COUNT, f"got {resync}"):
                failures += 1

            r = await c.get(f"{BASE}/api/transactions", headers=H)
            txns_after_second = r.json() if r.status_code == 200 else []
            if not step(f"transaction count unchanged after re-sync ({FIXTURE_TXN_COUNT})",
                        len(txns_after_second) == FIXTURE_TXN_COUNT, f"got {len(txns_after_second)}"):
                failures += 1

            # No duplicate transaction rows (the actual upsert-not-blind-insert check)
            ids_seen = [t.get("id") for t in txns_after_second]
            if not step("no duplicate transaction rows", len(ids_seen) == len(set(ids_seen)), f"{len(ids_seen)} rows, {len(set(ids_seen))} unique"):
                failures += 1

            # 8. DB-level: no duplicate plaid_transaction_id rows, and sync_cursor is back at
            # the fixture's item count after re-serving it from offset 0.
            conn = await asyncpg.connect(DB_URL)
            try:
                cursor_after_resync = await conn.fetchval(
                    "SELECT sync_cursor FROM plaid_items WHERE id = $1", uuid.UUID(item_id)
                )
                total_rows, distinct_plaid_ids = await conn.fetchrow(
                    "SELECT count(*), count(DISTINCT plaid_transaction_id) FROM transactions WHERE user_id = $1",
                    uuid.UUID(user_id),
                )
            finally:
                await conn.close()
            if not step("sync_cursor advanced (or held) past the fixture's item count",
                        cursor_after_resync is not None and int(cursor_after_resync) >= FIXTURE_TXN_COUNT,
                        f"got {cursor_after_resync!r}"):
                failures += 1
            if not step("0 duplicate plaid_transaction_id rows (DB-level)",
                        total_rows == distinct_plaid_ids == FIXTURE_TXN_COUNT,
                        f"rows={total_rows} distinct_plaid_ids={distinct_plaid_ids}"):
                failures += 1
    finally:
        await cleanup.cleanup_test_user(email, DB_URL)

    print()
    print("=" * 60)
    if failures == 0:
        print("PLAID-FAKE-SYNC: ALL PASS -- upsert-by-plaid_transaction_id works correctly")
    else:
        print(f"PLAID-FAKE-SYNC: {failures} FAILURES -- see above")
    print("=" * 60)
    if failures > 0:
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
