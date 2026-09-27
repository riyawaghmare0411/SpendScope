"""ORM tables for the plan/forecast engine (Phase 0 of the MoneyMap integration).

Imported once by src/models.py so Base.metadata.create_all registers these tables.
No SQLAlchemy model here ever imports from src.models -- keeps this module import-safe
as a leaf dependency of models.py.
"""

import uuid
from datetime import datetime, date, timezone
from typing import Optional

import sqlalchemy as sa
from sqlalchemy.orm import Mapped, mapped_column

from src.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class PlanSettings(Base):
    """One row per user: overrides for the forecast/safe-to-spend engine.

    Absent row (or absent field) means "use the computed default" -- e.g. no
    daily_limit override means the forecast derives it from history instead.
    """
    __tablename__ = "plan_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    daily_limit: Mapped[Optional[float]] = mapped_column(sa.Numeric(12, 2), nullable=True)
    base_currency: Mapped[Optional[str]] = mapped_column(sa.String(10), nullable=True)
    reserve_buffer: Mapped[Optional[float]] = mapped_column(sa.Numeric(12, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PlanBalance(Base):
    """Per-currency cash-position snapshot feeding the forecast's day-0 balance.

    Composite PK (user_id, currency) -- balances are never summed across currencies.
    Updated by a Plaid sync (source="plaid") or a manual checkpoint (source="manual").
    """
    __tablename__ = "plan_balances"

    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    currency: Mapped[str] = mapped_column(sa.String(10), primary_key=True)
    balance: Mapped[float] = mapped_column(sa.Numeric(12, 2), nullable=False, default=0)
    as_of: Mapped[Optional[datetime]] = mapped_column(sa.DateTime(timezone=True), nullable=True)
    source: Mapped[str] = mapped_column(sa.String(20), default="manual")
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class RecurringRule(Base):
    """A detected or manually-added recurring bill/income.

    Confirm-once-then-automatic (Riya's decision): only status="confirmed" rows feed the
    forecast; "suggested" rows sit in the Today page's review list; "dismissed" rows are
    remembered and never re-suggested. next_date is NOT stored here -- it's computed fresh
    per response from cadence + anchor_day/anchor_weekday (src/recurrence.py, Wave 1).
    """
    __tablename__ = "recurring_rules"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(sa.ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    label: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    direction: Mapped[str] = mapped_column(sa.String(10), nullable=False)  # IN | OUT
    cadence: Mapped[str] = mapped_column(sa.String(20), nullable=False)  # monthly_fixed_day | biweekly | weekly | semimonthly | four_weekly | irregular
    anchor_day: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    anchor_weekday: Mapped[Optional[int]] = mapped_column(sa.Integer, nullable=True)
    amount: Mapped[float] = mapped_column(sa.Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    merchant_key: Mapped[Optional[str]] = mapped_column(sa.String(255), nullable=True)
    status: Mapped[str] = mapped_column(sa.String(20), default="suggested")  # suggested | confirmed | dismissed
    source: Mapped[str] = mapped_column(sa.String(20), default="detected")  # detected | manual
    confidence: Mapped[Optional[float]] = mapped_column(sa.Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class BalanceUpdate(Base):
    """A manual balance checkpoint for one account (mostly manual debt/cash accounts that
    have no Plaid feed). Log-only, append-mostly; Account.current_balance is the live value,
    this is the audit trail feeding balance_as_of / balance_source."""
    __tablename__ = "balance_updates"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False, index=True)
    balance: Mapped[float] = mapped_column(sa.Numeric(12, 2), nullable=False)
    as_of: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)


class PlanEvent(Base):
    """A one-off future event the user schedules directly (planned expense/income/transfer),
    distinct from an inferred RecurringRule. Always user-confirmed by construction (no
    suggested/dismissed states -- there is nothing to detect for a one-off)."""
    __tablename__ = "plan_events"

    id: Mapped[uuid.UUID] = mapped_column(sa.Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(sa.ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True)
    date: Mapped[date] = mapped_column(sa.Date, nullable=False)
    label: Mapped[str] = mapped_column(sa.String(255), nullable=False)
    direction: Mapped[str] = mapped_column(sa.String(10), nullable=False)  # IN | OUT
    amount: Mapped[float] = mapped_column(sa.Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(sa.String(10), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(sa.Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(sa.DateTime(timezone=True), default=utcnow, onupdate=utcnow)
