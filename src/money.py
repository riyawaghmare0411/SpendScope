"""Decimal money handling for the plan engine (Phase 0 skeleton -- bodies filled in Wave 1
by BP-A). Every pure module and route that touches plan money goes through this file so
there is exactly one place that knows how to parse, quantize and wire-encode an amount.

Fixes carried from the MoneyMap audit:
- parse_amount must not treat a 0 amount as falsy/absent (a real bug in the ported JS).
- Decimal(str(x)) only, never Decimal(float) -- floats are not exact at the source.
- A value with more decimal places than its currency's exponent is a validation error
  (400), never a silent round to 200.
"""

from decimal import Decimal
from typing import Union

# Exponent (decimal places) per currency. Extend as new currencies are onboarded;
# unknown currencies default to 2 via CURRENCY_EXPONENTS.get(code, 2).
CURRENCY_EXPONENTS: dict[str, int] = {
    "USD": 2, "GBP": 2, "EUR": 2, "INR": 2,
}


class MoneyValidationError(ValueError):
    """Raised when a wire amount has more precision than its currency allows."""


def currency_exponent(currency: str) -> int:
    raise NotImplementedError


def parse_amount(value: Union[str, int, float, Decimal], currency: str) -> Decimal:
    """Parse a wire value into an exact Decimal. 0 is a valid amount, not an absent one.
    Raises MoneyValidationError if value has more decimal places than the currency allows."""
    raise NotImplementedError


def quantize(amount: Decimal, currency: str) -> Decimal:
    """Round `amount` to `currency`'s exponent using banker's-rounding-free HALF_UP."""
    raise NotImplementedError


def to_minor(amount: Decimal, currency: str) -> int:
    """Convert a quantized Decimal amount to integer minor units (e.g. dollars -> cents)."""
    raise NotImplementedError


def from_minor(minor: int, currency: str) -> Decimal:
    """Inverse of to_minor."""
    raise NotImplementedError


def to_json_number(amount: Decimal) -> float:
    """Convert a quantized Decimal to a JSON-safe float. Safe because a value already
    quantized to <=2dp round-trips exactly through float at realistic magnitudes."""
    raise NotImplementedError
