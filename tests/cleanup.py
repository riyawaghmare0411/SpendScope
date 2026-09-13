"""Shared test-user cleanup, used by every tests/test_*.py in a `finally` block
so a test run (pass OR fail) never leaves rows behind in the shared local DB.

NOTE: named cleanup.py, not _cleanup.py -- .gitignore has `_*.py` for one-off
local deploy scripts, which would silently keep a leading-underscore file out
of the repo entirely (never committed, breaking every test's import in CI).

Most user_id foreign keys are ON DELETE NO ACTION at the DB level (only
plaid_items.user_id is ON DELETE CASCADE) -- a bare `DELETE FROM users` would
raise a ForeignKeyViolation whenever the test user still owns accounts,
transactions, import_batches, category_rules, budgets or csv_templates rows.
So this deletes a user's owned rows first, in FK-safe (child-before-parent)
order, then the user row itself.

Run directly to sweep already-leftover test users by email pattern:
    python tests/cleanup.py
"""
import asyncio, os, sys
import asyncpg

DB_URL = os.environ.get("SPENDSCOPE_DB_URL", "postgresql://spendscope:spendscope_dev@localhost:5432/spendscope")

# Never delete these regardless of what pattern is passed in.
PROTECTED_EMAILS = {"riya@spendscope.local"}

# FK-safe order: transactions/import_batches/accounts/plaid_items form a chain
# (transactions -> import_batches -> accounts -> plaid_items); the rest only
# reference users directly and can go anywhere before the users row itself.
_CHILD_TABLES = [
    "transactions", "import_batches", "category_rules", "budgets", "csv_templates", "accounts", "plaid_items",
]


async def _delete_user_and_children(conn, user_id) -> None:
    for table in _CHILD_TABLES:
        await conn.execute(f"DELETE FROM {table} WHERE user_id = $1", user_id)
    await conn.execute("DELETE FROM users WHERE id = $1", user_id)


async def cleanup_test_user(email: str, db_url: str = None) -> None:
    """Delete one test user (exact email match) and every row it owns.
    No-op if the user doesn't exist. Call this in a `finally` block so it
    runs whether the test passed or failed.
    """
    if email in PROTECTED_EMAILS:
        print(f"[cleanup] refusing to delete protected email {email!r}")
        return
    conn = await asyncpg.connect(db_url or DB_URL)
    try:
        row = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        if row is None:
            return
        await _delete_user_and_children(conn, row["id"])
    finally:
        await conn.close()


async def cleanup_matching(pattern: str, db_url: str = None) -> int:
    """Delete every user whose email matches a SQL LIKE pattern (e.g. 'enctest+%')
    and everything they own. Returns how many users were deleted. For one-off
    sweeps of leftover rows from before this cleanup helper existed.
    """
    conn = await asyncpg.connect(db_url or DB_URL)
    try:
        rows = await conn.fetch("SELECT id, email FROM users WHERE email LIKE $1", pattern)
        rows = [r for r in rows if r["email"] not in PROTECTED_EMAILS]
        for row in rows:
            await _delete_user_and_children(conn, row["id"])
        return len(rows)
    finally:
        await conn.close()


if __name__ == "__main__":
    # One-time sweep of today's leftover test rows (Task B-3). Never touches
    # riya@spendscope.local -- that's Riya's demo login, not a test artifact.
    patterns = sys.argv[1:] or [
        "enctest+%", "cattest%", "wipetest+%", "multitest+%", "samebank+%",
        "a_%@t.com", "b_%@t.com", "browsercheck@%",
    ]

    async def _main():
        total = 0
        for p in patterns:
            n = await cleanup_matching(p)
            print(f"  deleted {n} user(s) matching {p!r}")
            total += n
        print(f"TOTAL: {total} test user(s) deleted")

    asyncio.run(_main())
