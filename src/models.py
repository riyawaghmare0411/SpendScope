import uuid
from datetime import datetime, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    accounts: Mapped[list["Account"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    import_batches: Mapped[list["ImportBatch"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    category_rules: Mapped[list["CategoryRule"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    budgets: Mapped[list["Budget"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    csv_templates: Mapped[list["CsvTemplate"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    bank_name: Mapped[Optional[str]] = mapped_column(sa.String(255))
    account_type: Mapped[str] = mapped_column(sa.String(50), default="checking")
    currency: Mapped[str] = mapped_column(sa.String(10), default="USD")
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account", cascade="all, delete-orphan")
    import_batches: Mapped[list["ImportBatch"]] = relationship(back_populates="account", cascade="all, delete-orphan")


class ImportBatch(Base):
    __tablename__ = "import_batches"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("accounts.id"), nullable=False, index=True)
    source_filename: Mapped[str] = mapped_column(sa.String(500), nullable=False)
    source_type: Mapped[str] = mapped_column(sa.String(50), default="csv")
    bank_name: Mapped[Optional[str]] = mapped_column(sa.String(255))
    transaction_count: Mapped[int] = mapped_column(sa.Integer, default=0)
    imported_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    status: Mapped[str] = mapped_column(sa.String(50), default="pending")

    user: Mapped["User"] = relationship(back_populates="import_batches")
    account: Mapped["Account"] = relationship(back_populates="import_batches")
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
    category_source: Mapped[str] = mapped_column(sa.String(50), default="auto")
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
