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


# Idempotent ALTER TABLE / CREATE EXTENSION statements that run after metadata.create_all.
# Postgres 9.6+ supports ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
# Safe to run on every startup.
_PHASE10_ALTERS = [
    # Phase 7: zero-knowledge encryption fields (production never had these -- caught during Phase 13 deploy)
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS encryption_salt VARCHAR(64)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS recovery_codes_hash TEXT",
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
    "CREATE EXTENSION IF NOT EXISTS vector",
    "ALTER TABLE transactions ADD COLUMN IF NOT EXISTS embedding vector(384)",
    "CREATE INDEX IF NOT EXISTS ix_transactions_embedding ON transactions USING hnsw (embedding vector_cosine_ops)",
]


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        for stmt in _PHASE10_ALTERS:
            try:
                await conn.execute(text(stmt))
            except Exception as e:
                print(f"[migration] skipped: {stmt[:80]} -- {e}")
