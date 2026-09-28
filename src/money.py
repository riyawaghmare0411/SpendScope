"""Decimal money handling for the plan engine (Phase 0 skeleton -- bodies filled in Wave 1
by BP-A). Every pure module and route that touches plan money goes through this file so
there is exactly one place that knows how to parse, quantize and wire-encode an amount.

Fixes carried from the MoneyMap audit:
- parse_amount must not treat a 0 amount as falsy/absent (a real bug in the ported JS).
- Decimal(str(x)) only, never Decimal(float) -- floats are not exact at the source.
- A value with more decimal places than its currency's exponent is a validation error
  (400), never a silent round to 200.
"""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Union

# Exponent (decimal places) per currency. Extend as new currencies are onboarded;
# unknown currencies default to 2 via CURRENCY_EXPONENTS.get(code, 2).
CURRENCY_EXPONENTS: dict[str, int] = {
    "USD": 2, "GBP": 2, "EUR": 2, "INR": 2,
}


class MoneyValidationError(ValueError):
    """Raised when a wire amount has more precision than its currency allows."""


def currency_exponent(currency: str) -> int:
    return CURRENCY_EXPONENTS.get(currency, 2)


def parse_amount(value: Union[str, int, float, Decimal], currency: str) -> Decimal:
    """Parse a wire value into an exact Decimal. 0 is a valid amount, not an absent one.
    Raises MoneyValidationError for anything that isn't a genuine finite amount: missing,
    non-numeric ("abc", ""), non-finite (NaN/Infinity), a bool, or more decimal places than
    the currency allows -- every case is a client-input problem (400), never a crash (500)."""
    if value is None or isinstance(value, bool):
        raise MoneyValidationError(f"Amount is required for {currency}")
    try:
        amount = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise MoneyValidationError(f"{value!r} is not a valid amount for {currency}")
    if not amount.is_finite():
        raise MoneyValidationError(f"{value!r} is not a valid amount for {currency}")
    exponent = currency_exponent(currency)
    decimal_places = -amount.as_tuple().exponent
    if decimal_places > exponent:
        raise MoneyValidationError(
            f"{value!r} has more decimal places than {currency} allows ({exponent})"
        )
    return amount


def quantize(amount: Decimal, currency: str) -> Decimal:
    """Round `amount` to `currency`'s exponent using banker's-rounding-free HALF_UP."""
    exponent = currency_exponent(currency)
    quantum = Decimal(1).scaleb(-exponent)
    return amount.quantize(quantum, rounding=ROUND_HALF_UP)


def to_minor(amount: Decimal, currency: str) -> int:
    """Convert a quantized Decimal amount to integer minor units (e.g. dollars -> cents)."""
    exponent = currency_exponent(currency)
    return int(amount.scaleb(exponent).to_integral_value(rounding=ROUND_HALF_UP))


def from_minor(minor: int, currency: str) -> Decimal:
    """Inverse of to_minor."""
    exponent = currency_exponent(currency)
    return Decimal(minor).scaleb(-exponent)


def to_json_number(amount: Decimal) -> float:
    """Convert a quantized Decimal to a JSON-safe float. Safe because a value already
    quantized to <=2dp round-trips exactly through float at realistic magnitudes."""
    return float(amount)
