"""Template-based CSV parser for bank transaction files."""

import csv
import io
import json
import os
import re
from datetime import datetime
from pathlib import Path

TEMPLATES_DIR = Path(__file__).parent / "templates"
CURRENCY_RE = re.compile(r'[£$€₹₺₽¥,\s]')


def load_templates() -> list[dict]:
    """Load all JSON template files from the templates directory."""
    templates = []
    if not TEMPLATES_DIR.exists():
        return templates
    for f in TEMPLATES_DIR.glob("*.json"):
        try:
            with open(f, "r", encoding="utf-8") as fh:
                templates.append(json.load(fh))
        except (json.JSONDecodeError, OSError):
            continue
    return templates


def _normalize_headers(headers: list[str]) -> str:
    """Join headers lowercase, stripped, for pattern matching."""
    return ",".join(h.strip().lower() for h in headers)


def detect_bank(headers: list[str], filename: str = "") -> dict | None:
    """Auto-detect which bank template matches a CSV.

    Checks header patterns first, then filename patterns as fallback.
    Returns the matching template dict or None.
    """
    templates = load_templates()
    normalized = _normalize_headers(headers)
    fn_lower = filename.lower() if filename else ""

    # Score each template: header match is primary, filename is tiebreaker
    best, best_score = None, 0
    for tpl in templates:
        score = 0
        for pattern in tpl.get("header_patterns", []):
            pattern_cols = [c.strip() for c in pattern.split(",")]
            # Check if all pattern columns exist in the normalized headers
            if all(col in normalized for col in pattern_cols):
                # Score by how many columns matched
                score = max(score, len(pattern_cols))
        # Filename bonus (small, only breaks ties)
        if fn_lower:
            for fp in tpl.get("filename_patterns", []):
                if fp in fn_lower:
                    score += 0.5
                    break
        if score > best_score:
            best, best_score = tpl, score

    return best if best_score > 0 else None


def _clean_amount(val: str) -> float | None:
    """Parse an amount string, stripping currency symbols and whitespace."""
    if val is None:
        return None
    val = str(val).strip()
    if not val or val == '-':
        return None
    # Strip currency symbols and thousands separators
    cleaned = CURRENCY_RE.sub('', val)
    # Handle parentheses as negative: (123.45) -> -123.45
    if cleaned.startswith('(') and cleaned.endswith(')'):
        cleaned = '-' + cleaned[1:-1]
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_date(val: str, fmt: str) -> str | None:
    """Parse a date string and return ISO format YYYY-MM-DD.

    Tries the given format first, then common fallbacks.
    """
    val = str(val).strip()
    if not val:
        return None

    # If format includes time but value might not have it, try both
    formats_to_try = [fmt]
    # Common fallback formats
    fallbacks = [
        "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y",
        "%Y-%m-%d %H:%M:%S", "%d %b %Y", "%d %B %Y",
        "%d.%m.%Y", "%m/%d/%y", "%d/%m/%y",
        "%Y/%m/%d", "%b %d, %Y", "%B %d, %Y",
    ]
    for fb in fallbacks:
        if fb not in formats_to_try:
            formats_to_try.append(fb)

    for f in formats_to_try:
        try:
            return datetime.strptime(val, f).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _get_col(row: dict, col_name: str | None) -> str:
    """Get a column value from a row dict, case-insensitive and stripped."""
    if not col_name:
        return ""
    # Exact match first
    if col_name in row:
        return str(row[col_name]).strip()
    # Case-insensitive match
    col_lower = col_name.lower().strip()
    for k, v in row.items():
        if k.lower().strip() == col_lower:
            return str(v).strip()
    return ""


def _read_csv(file_content: str, encoding: str = "utf-8", skip_rows: int = 0, header_row: int = 0) -> tuple[list[str], list[dict], list[list[str]]]:
    """Read CSV content, returning (headers, rows_as_dicts, raw_rows).

    Handles BOM, different line endings, and skip rows.
    """
    # Strip BOM
    if file_content.startswith('\ufeff'):
        file_content = file_content[1:]

    # Normalize line endings
    file_content = file_content.replace('\r\n', '\n').replace('\r', '\n')

    lines = file_content.split('\n')

    # Skip leading rows
    total_skip = skip_rows + header_row
    if total_skip >= len(lines):
        return [], [], []

    # Rejoin for csv.reader, skipping initial rows
    content_from_header = '\n'.join(lines[total_skip:])
    reader = csv.reader(io.StringIO(content_from_header))

    all_rows = list(reader)
    if not all_rows:
        return [], [], []

    # First row after skips is the header
    headers = [h.strip() for h in all_rows[0]]

    # Build dicts for data rows, skip empty rows
    data_dicts = []
    raw_rows = []
    for row in all_rows[1:]:
        # Skip empty rows or rows that are all empty
        if not row or all(c.strip() == '' for c in row):
            continue
        # Pad row if shorter than headers
        padded = row + [''] * (len(headers) - len(row))
        data_dicts.append(dict(zip(headers, padded)))
        raw_rows.append(row)

    return headers, data_dicts, raw_rows


def _build_transaction(row: dict, columns: dict, date_format: str, amount_mode: str) -> dict:
    """Build a normalized transaction dict from a CSV row using template column mappings."""
    # Date
    date_col = columns.get("date", "")
    date_raw = _get_col(row, date_col)
    date_iso = _parse_date(date_raw, date_format)

    # Description and merchant
    description = _get_col(row, columns.get("description", ""))
    merchant = _get_col(row, columns.get("merchant", "")) or description
    category = _get_col(row, columns.get("category", ""))
    txn_type = _get_col(row, columns.get("type", ""))

    # Direction from data (if available)
    direction_raw = _get_col(row, columns.get("direction", ""))

    # Amounts
    money_in = 0.0
    money_out = 0.0
    amount = 0.0

    if amount_mode == "split":
        in_col = columns.get("money_in", "")
        out_col = columns.get("money_out", "")
        mi = _clean_amount(_get_col(row, in_col))
        mo = _clean_amount(_get_col(row, out_col))
        money_in = abs(mi) if mi else 0.0
        money_out = abs(mo) if mo else 0.0
        amount = money_in if money_in > 0 else money_out

    elif amount_mode == "single":
        amt_col = columns.get("amount", "")
        raw_amt = _clean_amount(_get_col(row, amt_col))
        if raw_amt is not None:
            if raw_amt >= 0:
                money_in = raw_amt
                money_out = 0.0
            else:
                money_in = 0.0
                money_out = abs(raw_amt)
            amount = abs(raw_amt)

    elif amount_mode == "single_absolute":
        amt_col = columns.get("amount", "")
        raw_amt = _clean_amount(_get_col(row, amt_col))
        amount = abs(raw_amt) if raw_amt is not None else 0.0
        # Determine direction from type column
        type_lower = txn_type.lower()
        if any(kw in type_lower for kw in ["credit", "deposit", "cr", "refund", "payment in"]):
            money_in = amount
            money_out = 0.0
        else:
            money_in = 0.0
            money_out = amount

    # Determine direction
    if direction_raw and direction_raw.upper() in ("IN", "OUT"):
        direction = direction_raw.upper()
    elif money_in > 0 and money_out == 0:
        direction = "IN"
    elif money_out > 0:
        direction = "OUT"
    else:
        direction = "OUT"

    # Balance
    bal_col = columns.get("balance", "")
    balance = _clean_amount(_get_col(row, bal_col))

    return {
        "date_iso": date_iso or "",
        "description": description,
        "merchant": merchant,
        "category": category,
        "type": txn_type,
        "amount": amount,
        "money_in": money_in,
        "money_out": money_out,
        "balance": balance,
        "direction": direction,
        "is_redacted": False,
    }


def parse_csv(file_content: str, template: dict = None) -> dict:
    """Parse CSV content using a template. Auto-detects bank if no template given.

    Returns dict with bank_name, transactions, unmapped flag, headers, preview_rows.
    """
    # First pass: read headers for detection
    headers_raw, _, _ = _read_csv(file_content)

    if template is None:
        template = detect_bank(headers_raw)

    if template is None:
        # No template matched -- return unmapped result with preview
        headers, _, raw_rows = _read_csv(file_content)
        return {
            "bank_name": "Unknown",
            "transactions": [],
            "unmapped": True,
            "headers": headers,
            "preview_rows": raw_rows[:5],
        }

    # Parse with template
    skip_rows = template.get("skip_rows", 0)
    header_row = template.get("header_row", 0)
    headers, rows, raw_rows = _read_csv(
        file_content,
        encoding=template.get("encoding", "utf-8"),
        skip_rows=skip_rows,
        header_row=header_row,
    )

    columns = template.get("columns", {})
    date_format = template.get("date_format", "%Y-%m-%d")
    amount_mode = template.get("amount_mode", "single")

    transactions = []
    for row in rows:
        txn = _build_transaction(row, columns, date_format, amount_mode)
        # Skip rows that produced no date and no amount (likely junk)
        if txn["date_iso"] or txn["amount"] > 0:
            transactions.append(txn)

    return {
        "bank_name": template.get("bank_name", "Unknown"),
        "transactions": transactions,
        "unmapped": False,
        "headers": headers,
        "preview_rows": raw_rows[:5],
    }


def parse_with_mapping(file_content: str, mapping: dict) -> dict:
    """Parse CSV using a user-provided column mapping.

    mapping keys:
        date_col: column name for date
        description_col: column name for description
        amount_col: single amount column (or None)
        money_in_col: credit column (or None)
        money_out_col: debit column (or None)
        balance_col: balance column (or None)
        date_format: strftime format string
    """
    headers, rows, raw_rows = _read_csv(file_content)

    date_col = mapping.get("date_col", "")
    desc_col = mapping.get("description_col", "")
    amount_col = mapping.get("amount_col")
    in_col = mapping.get("money_in_col")
    out_col = mapping.get("money_out_col")
    bal_col = mapping.get("balance_col")
    date_fmt = mapping.get("date_format", "%Y-%m-%d")

    # Determine amount mode from what's provided
    if in_col and out_col:
        mode = "split"
        columns = {
            "date": date_col,
            "description": desc_col,
            "money_in": in_col,
            "money_out": out_col,
            "balance": bal_col or "",
        }
    elif amount_col:
        mode = "single"
        columns = {
            "date": date_col,
            "description": desc_col,
            "amount": amount_col,
            "balance": bal_col or "",
        }
    else:
        return {
            "bank_name": "Custom",
            "transactions": [],
            "unmapped": True,
            "headers": headers,
            "preview_rows": raw_rows[:5],
        }

    transactions = []
    for row in rows:
        txn = _build_transaction(row, columns, date_fmt, mode)
        if txn["date_iso"] or txn["amount"] > 0:
            transactions.append(txn)

    return {
        "bank_name": "Custom",
        "transactions": transactions,
        "unmapped": False,
        "headers": headers,
        "preview_rows": raw_rows[:5],
    }
