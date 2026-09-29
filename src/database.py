import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql+asyncpg://spendscope:spendscope_dev@localhost:5432/spendscope")

engine = create_async_engine(DATABASE_URL, echo=False)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


# Phase 12A: pgvector must exist before create_all -- models.py declares a Vector(384)
# column, so CREATE TABLE needs the extension's type to exist first.
_VECTOR_EXTENSION_STMT = "CREATE EXTENSION IF NOT EXISTS vector"

# Idempotent ALTER TABLE / CREATE EXTENSION statements that run after metadata.create_all.
# Postgres 9.6+ supports ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
# Safe to run on every startup.
_PHASE10_ALTERS = [
    # Phase 7: zero-knowledge encryption fields (production never had these -- caught during Phase 13 deploy)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_salt VARCHAR(64)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_codes_hash TEXT",
    # Phase E: envelope-encrypted DEK storage (replaces broken direct-PBKDF2 encryption)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS wrapped_dek TEXT",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS encrypted_data TEXT",
    # Phase 9: import_batches.plaid_item_id (production never had this either)
    "ALTER TABLE import_batches ADD COLUMN IF NOT EXISTS plaid_item_id UUID REFERENCES plaid_items(id)",
    "CREATE INDEX IF NOT EXISTS ix_import_batches_plaid_item_id ON import_batches(plaid_item_id)",
    # Phase 10B: per-card metadata
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plaid_account_id VARCHAR(255)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ix_accounts_plaid_account_id ON accounts(plaid_account_id) WHERE plaid_account_id IS NOT NULL",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS plaid_item_id UUID REFERENCES plaid_items(id) ON DELETE CASCADE",
    "CREATE INDEX IF NOT EXISTS ix_accounts_plaid_item_id ON accounts(plaid_item_id)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mask VARCHAR(10)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS subtype VARCHAR(50)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credit_limit NUMERIC(12,2)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS current_balance NUMERIC(12,2)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS available_balance NUMERIC(12,2)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS due_day INTEGER",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ",
    # Phase 12A: pgvector for local merchant-similarity categorization (no Claude)
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS embedding vector(384)",
    "CREATE INDEX IF NOT EXISTS ix_transactions_embedding ON transactions USING hnsw (embedding vector_cosine_ops)",
    # Phase F: CategoryRule.direction (IN/OUT) migrated from legacy JSON rules
    "ALTER TABLE category_rules ADD COLUMN IF NOT EXISTS direction VARCHAR(10)",
]

# Phase 0 (MoneyMap integration, 2026-09-27): schema for the plan/forecast engine + Plaid
# correctness fixes. Runs after _PHASE10_ALTERS in the same fail-loud per-statement loop.
_PHASE0_ALTERS = [
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(64)",
    # Bug fix: models.py's old plaid_account_id index=True created a NON-unique index that
    # collided by name with the intended unique index below, so it silently no-opped -- there
    # was NO real uniqueness on Plaid account ids. Drop the stale non-unique index, then add the
    # correctly-scoped one (per-user, partial on non-null).
    "DROP INDEX IF EXISTS ix_accounts_plaid_account_id",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_accounts_user_plaid_account_id ON accounts(user_id, plaid_account_id) WHERE plaid_account_id IS NOT NULL",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS kind VARCHAR(30)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS counts_as_cash BOOLEAN",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS statement_balance NUMERIC(12,2)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS minimum_payment NUMERIC(12,2)",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS next_due_date DATE",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS apr_bps INTEGER",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance_as_of TIMESTAMPTZ",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS term_months INTEGER",
    "ALTER TABLE accounts ADD COLUMN IF NOT EXISTS balance_source VARCHAR(20)",
    # Disconnecting a Plaid item must keep the account + its transactions, not cascade-delete them.
    "ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_plaid_item_id_fkey",
    "ALTER TABLE accounts ADD CONSTRAINT accounts_plaid_item_id_fkey FOREIGN KEY (plaid_item_id) REFERENCES plaid_items(id) ON DELETE SET NULL",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS plaid_transaction_id VARCHAR(255)",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_transactions_user_plaid_transaction_id ON transactions(user_id, plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS pending BOOLEAN DEFAULT FALSE",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(10)",
    "ALTER TABLE budgets ADD COLUMN IF NOT EXISTS currency VARCHAR(10)",
]

# One-time DATA backfills, deliberately NOT run on every boot.
#
# The statements above only add columns/indexes: idempotent, cheap, safe to re-run on every
# start. These rewrite rows. Running them on every boot means every deploy -- and every
# automatic restart, of which railway.json allows ten on failure -- issues a full-table write
# over real financial data, and a failure partway through the loop leaves the set half
# applied. They exist to populate columns added by Phase 0 on a database that predates them,
# which is a thing you do once.
#
# Run them deliberately by starting the app once with RUN_DATA_BACKFILLS=1, then remove it.
_ONE_TIME_BACKFILLS = [
    "UPDATE accounts SET counts_as_cash = TRUE WHERE counts_as_cash IS NULL AND account_type IN ('checking','savings')",
    "UPDATE accounts SET counts_as_cash = FALSE WHERE counts_as_cash IS NULL",
    # mask is dropped from every API response as of Phase 0 (BP-ACCT) -- clear existing values.
    "UPDATE accounts SET mask = NULL WHERE mask IS NOT NULL",
    "UPDATE transactions t SET currency = a.currency FROM accounts a WHERE t.account_id = a.id AND t.currency IS NULL",
    "UPDATE budgets b SET currency = u.currency FROM users u WHERE b.user_id = u.id AND b.currency IS NULL",
]


async def init_db():
    # Step 1: vector extension, its own transaction, before create_all needs it.
    try:
        async with engine.begin() as conn:
            await conn.execute(text(_VECTOR_EXTENSION_STMT))
    except Exception as e:
        print(f"[migration] FAILED: {_VECTOR_EXTENSION_STMT[:80]} -- {e}")
        raise

    # Step 2: create any missing tables.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Step 3: each ALTER/INDEX in its own transaction -- one failure must not silently
    # abort the rest, and any failure must fail boot loudly instead of "booting healthy".
    statements = list(_PHASE10_ALTERS) + list(_PHASE0_ALTERS)
    if os.getenv("RUN_DATA_BACKFILLS") == "1":
        print(f"[migration] RUN_DATA_BACKFILLS=1 -- including {len(_ONE_TIME_BACKFILLS)} data backfills")
        statements += _ONE_TIME_BACKFILLS

    for stmt in statements:
        try:
            async with engine.begin() as conn:
                await conn.execute(text(stmt))
        except Exception as e:
            print(f"[migration] FAILED: {stmt[:80]} -- {e}")
            raise
