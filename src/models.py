import uuid
from datetime import datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector  # Phase 12A: 384-dim merchant embeddings

from src.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(sa.String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[Optional[str]] = mapped_column(sa.String(255))
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    auth_provider: Mapped[str] = mapped_column(sa.String(50), default="local")
    oauth_id: Mapped[Optional[str]] = mapped_column(sa.String(255))
    country: Mapped[Optional[str]] = mapped_column(sa.String(100))
    currency: Mapped[str] = mapped_column(sa.String(10), default="USD")
    encryption_salt: Mapped[Optional[str]] = mapped_column(sa.String(64), nullable=True)
    recovery_codes_hash: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    accounts: Mapped[list["Account"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    import_batches: Mapped[list["ImportBatch"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    category_rules: Mapped[list["CategoryRule"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    budgets: Mapped[list["Budget"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    csv_templates: Mapped[list["CsvTemplate"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    plaid_items: Mapped[list["PlaidItem"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    bank_name: Mapped[Optional[str]] = mapped_column(sa.String(255))
    account_type: Mapped[str] = mapped_column(sa.String(50), default="checking")
    currency: Mapped[str] = mapped_column(sa.String(10), default="USD")
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)

    # Phase 10B: per-card metadata (NULL for non-Plaid accounts).
    # plaid_account_id has a partial unique index added in database.py so multiple NULLs are allowed.
    plaid_account_id: Mapped[Optional[str]] = mapped_column(sa.String(255), index=True, nullable=True)
    plaid_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(sa.ForeignKey("plaid_items.id", ondelete="CASCADE"), nullable=True, index=True)
    mask: Mapped[Optional[str]] = mapped_column(sa.String(10))
    subtype: Mapped[Optional[str]] = mapped_column(sa.String(50))
    credit_limit: Mapped[Optional[float]] = mapped_column(sa.Numeric(12, 2))
    current_balance: Mapped[Optional[float]] = mapped_column(sa.Numeric(12, 2))
    available_balance: Mapped[Optional[float]] = mapped_column(sa.Numeric(12, 2))
    due_day: Mapped[Optional[int]] = mapped_column(sa.Integer)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True))

    user: Mapped["User"] = relationship(back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    import_batches: Mapped[list["ImportBatch"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    plaid_item: Mapped[Optional["PlaidItem"]] = relationship(back_populates="accounts")


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("accounts.id"), nullable=False, index=True)
    plaid_item_id: Mapped[Optional[uuid.UUID]] = mapped_column(sa.ForeignKey("plaid_items.id"), nullable=True, index=True)
    source_filename: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    source_type: Mapped[str] = mapped_column(sa.String(50), default="csv")
    bank_name: Mapped[Optional[str]] = mapped_column(sa.String(255))
    transaction_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    imported_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    status: Mapped[str] = mapped_column(sa.String(50), default="pending")

    user: Mapped["User"] = relationship(back_populates="import_batches")
    account: Mapped["Account"] = relationship(back_populates="import_batches")
    plaid_item: Mapped[Optional["PlaidItem"]] = relationship(back_populates="import_batches")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="import_batch", cascade="all, delete-orphan")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    import_batch_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("import_batches.id"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("accounts.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id"), nullable=False, index=True)
    date: Mapped[datetime] = mapped_column(sa.Date, nullable=False, index=True)
    description: Mapped[str] = mapped_column(sa.Text, nullable=False)
    merchant: Mapped[Optional[str]] = mapped_column(sa.String(255))
    category: Mapped[Optional[str]] = mapped_column(sa.String(100))
    type: Mapped[Optional[str]] = mapped_column(sa.String(50))
    amount: Mapped[float] = mapped_column(sa.Numeric(12, 2), nullable=False)
    balance: Mapped[Optional[float]] = mapped_column(sa.Numeric(12, 2))
    direction: Mapped[str] = mapped_column(sa.String(10), default="debit")
    is_redacted: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    encrypted_data: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    category_source: Mapped[str] = mapped_column(sa.String(50), default="auto")
    # Phase 12A: 384-dim merchant embedding for local vector-similarity categorization.
    # Filled at import time + every PATCH that changes the merchant string.
    embedding: Mapped[Optional[list[float]]] = mapped_column(Vector(384), nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship(back_populates="transactions")
    account: Mapped["Account"] = relationship(back_populates="transactions")
    import_batch: Mapped["ImportBatch"] = relationship(back_populates="transactions")


class CategoryRule(Base):
    __tablename__ = "category_rules"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id"), nullable=False, index=True)
    match_type: Mapped[str] = mapped_column(sa.String(50), nullable=False)
    match_value: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    category: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    priority: Mapped[int] = mapped_column(sa.Integer, default=0)
    is_learned: Mapped[bool] = mapped_column(sa.Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="category_rules")


class Budget(Base):
    __tablename__ = "budgets"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    amount: Mapped[float] = mapped_column(sa.Numeric(12, 2), nullable=False)
    period: Mapped[str] = mapped_column(sa.String(20), default="monthly")
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="budgets")


class CsvTemplate(Base):
    __tablename__ = "csv_templates"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(sa.ForeignKey("users.id"), nullable=True, index=True)
    bank_name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    country: Mapped[Optional[str]] = mapped_column(sa.String(100))
    column_mapping: Mapped[dict] = mapped_column(sa.JSON, nullable=False)
    date_format: Mapped[str] = mapped_column(sa.String(50), default="%Y-%m-%d")
    encoding: Mapped[str] = mapped_column(sa.String(50), default="utf-8")
    header_row: Mapped[int] = mapped_column(sa.Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)

    user: Mapped[Optional["User"]] = relationship(back_populates="csv_templates")


class PlaidItem(Base):
    """Represents one Plaid bank connection per user.

    The access_token from Plaid lives in `access_token_encrypted` -- encrypted
    at rest with Fernet using the server-side PLAID_TOKEN_ENCRYPTION_KEY env var.
    The plaintext token is never stored.
    """
    __tablename__ = "plaid_items"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id: Mapped[str] = mapped_column(sa.String(255), unique=True, nullable=False, index=True)
    access_token_encrypted: Mapped[str] = mapped_column(sa.Text, nullable=False)
    institution_id: Mapped[Optional[str]] = mapped_column(sa.String(255))
    institution_name: Mapped[Optional[str]] = mapped_column(sa.String(255))
    sync_cursor: Mapped[Optional[str]] = mapped_column(sa.Text)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True))
    sync_status: Mapped[str] = mapped_column(sa.String(50), default="active")
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    user: Mapped["User"] = relationship(back_populates="plaid_items")
    import_batches: Mapped[list["ImportBatch"]] = relationship(back_populates="plaid_item")
    accounts: Mapped[list["Account"]] = relationship(back_populates="plaid_item")
