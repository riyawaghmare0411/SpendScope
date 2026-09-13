"""
Redaction detector for bank statement PDFs and CSVs.

Checks for common signs of redacted or censored content:
asterisked fields, blank descriptions, black-box placeholders, etc.
"""

import re

# Patterns that indicate a redacted/censored value
_REDACTED_PATTERNS = re.compile(
    r"^\[?REDACTED\]?$"       # [REDACTED] or REDACTED
    r"|^\*{2,}$"              # ** or more asterisks
    r"|^X{3,}$"               # XXX or more
    r"|^x{3,}$"               # xxx or more
    r"|^#{3,}$"               # ### or more
    r"|^-{3,}$",              # --- or more (sometimes used as blanking)
    re.IGNORECASE,
)

_INVALID_DATE = re.compile(r"^0{4}-0{2}-0{2}$")  # 0000-00-00


# ---------------------------------------------------------------------------
# CSV / parsed-transaction redaction detection
# ---------------------------------------------------------------------------

def detect_csv_redactions(transactions: list[dict]) -> list[int]:
    """Check parsed transactions for signs of redaction.

    Looks for:
    - Missing/empty description or merchant fields
    - Zero amounts with no description
    - Fields containing only asterisks, X's, or [REDACTED]
    - Obviously invalid dates (0000-00-00)

    Returns list of transaction indices that are flagged.
    """
    flagged: list[int] = []
    for idx, txn in enumerate(transactions):
        if _is_txn_redacted(txn):
            flagged.append(idx)
    return flagged


def _is_txn_redacted(txn: dict) -> bool:
    """Return True if a single transaction looks redacted."""
    desc = str(txn.get("description", "")).strip()
    merchant = str(txn.get("merchant", "")).strip()
    date = str(txn.get("date_iso", "")).strip()
    amount = txn.get("amount", txn.get("money_out", 0)) or 0
    money_in = txn.get("money_in", 0) or 0
    money_out = txn.get("money_out", 0) or 0

    # Empty description/merchant
    if not desc and not merchant:
        return True

    # Redaction-pattern fields
    if _REDACTED_PATTERNS.match(desc) or _REDACTED_PATTERNS.match(merchant):
        return True

    # Zero amount AND blank description (likely censored row)
    if amount == 0 and money_in == 0 and money_out == 0 and not desc:
        return True

    # Invalid date
    if _INVALID_DATE.match(date):
        return True

    return False


# ---------------------------------------------------------------------------
# Flag transactions
# ---------------------------------------------------------------------------

def flag_redacted_transactions(
    transactions: list[dict], redacted_indices: list[int]
) -> list[dict]:
    """Set is_redacted=True on flagged transactions.

    Returns the same list (mutated in place for convenience).
    """
    idx_set = set(redacted_indices)
    for i, txn in enumerate(transactions):
        txn["is_redacted"] = i in idx_set
    return transactions
