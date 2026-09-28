"""Plaid privacy engineering, ported from MoneyMap's plaid-privacy.ts (Phase 0 skeleton --
bodies filled in Wave 1 by BP-A). Riya's decision (2026-09-26): Plaid-synced merchant/
description text is READABLE but redacted, not client-side encrypted like uploaded rows --
this module is what "redacted" means in practice, plus the rest of MoneyMap's Plaid privacy
rules (opaque handles, fixed error copy, server-generated display labels).
"""

import hashlib
import re
from typing import Optional

# 4+ consecutive digits get replaced -- long enough to catch account/card numbers without
# eating ordinary short numbers (e.g. "Store #42").
DIGIT_RUN_RE = re.compile(r"\d{4,}")

# Fixed, non-leaking copy per Plaid error_code. Never surface Plaid's own error text verbatim
# to the client -- it can include institution-specific detail we don't want to expose.
PLAID_ERROR_COPY: dict[str, str] = {
    "ITEM_LOGIN_REQUIRED": "This bank needs you to reconnect. Use Reconnect to continue syncing.",
    "INSUFFICIENT_CREDENTIALS": "This bank needs you to reconnect. Use Reconnect to continue syncing.",
    "INVALID_CREDENTIALS": "This bank needs you to reconnect. Use Reconnect to continue syncing.",
    "INSTITUTION_DOWN": "This bank's servers are temporarily unavailable. Try again shortly.",
    "INSTITUTION_NOT_RESPONDING": "This bank's servers are temporarily unavailable. Try again shortly.",
    "RATE_LIMIT_EXCEEDED": "Too many sync attempts. Please wait a few minutes and try again.",
    "PRODUCT_NOT_READY": "This bank is still preparing your data. Try again shortly.",
}
DEFAULT_ERROR_COPY = "We couldn't sync this bank right now. Try again shortly."


def redact_digits(text: str) -> str:
    """Replace every run of 4+ digits in `text` with a fixed placeholder."""
    return DIGIT_RUN_RE.sub("****", text)


def opaque_handle(raw_id: str) -> str:
    """SHA-256 hex digest of `raw_id`, truncated -- an opaque handle for logs/telemetry
    that is never reversible back to Plaid's own account/item id."""
    return hashlib.sha256(raw_id.encode()).hexdigest()[:16]


def error_copy_for(error_code: Optional[str]) -> str:
    """PLAID_ERROR_COPY[error_code] if known, else DEFAULT_ERROR_COPY. Never passes through
    Plaid's own error_message."""
    return PLAID_ERROR_COPY.get(error_code, DEFAULT_ERROR_COPY)


def generate_display_label(kind: str, index: int) -> str:
    """Server-generated account label, e.g. generate_display_label("checking", 1) ->
    "Checking 1". Used instead of Plaid's official_name/mask, neither of which ever
    leaves the server."""
    return f"{kind.replace('_', ' ').title()} {index}"
