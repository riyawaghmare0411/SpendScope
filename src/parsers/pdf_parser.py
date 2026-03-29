"""
Template-based PDF parser for bank statements.

Uses PyMuPDF (fitz) to extract text, detects the bank format,
and routes to the appropriate parser function.
"""

import re
from datetime import datetime
import fitz


# ---------------------------------------------------------------------------
# Bank detection
# ---------------------------------------------------------------------------

BANK_MARKERS = {
    "Bank of America": ["Deposits and other additions", "debit card subtraction"],
    "Lloyds": ["Lloyds Bank", "Money In (\u00a3)", "Money Out (\u00a3)"],
    "Barclays": ["Barclays", "Your statement"],
    "HSBC": ["HSBC", "Statement of Account"],
    "NatWest": ["NatWest", "Statement"],
    "Santander": ["Santander", "Account Statement"],
    "Monzo": ["Monzo", "monzo.com"],
    "Starling": ["Starling Bank", "starlingbank.com"],
}


def detect_bank_pdf(text: str) -> str:
    """Detect bank from PDF text by checking for known markers.

    Returns the bank name or "Unknown".
    """
    text_upper = text.upper()
    for bank, markers in BANK_MARKERS.items():
        if all(m.upper() in text_upper for m in markers):
            return bank
    return "Unknown"


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def parse_pdf(file_content: bytes) -> dict:
    """Parse a bank statement PDF.

    Takes raw PDF bytes, extracts text via PyMuPDF, detects the bank,
    and parses transactions with the matching template parser.

    Returns dict with bank_name, transactions, raw_text, recognized.
    """
    try:
        doc = fitz.open(stream=file_content, filetype="pdf")
    except Exception as e:
        return {
            "bank_name": "Unknown",
            "transactions": [],
            "raw_text": "",
            "recognized": False,
            "error": f"Could not open PDF: {e}",
        }

    full_text = ""
    all_lines: list[str] = []
    for page in doc:
        page_text = page.get_text()
        full_text += page_text + "\n"
        all_lines.extend(page_text.split("\n"))
    doc.close()

    bank = detect_bank_pdf(full_text)

    # Route to the right parser
    parser_map = {
        "Lloyds": parse_lloyds_pdf,
        "Bank of America": parse_bofa_pdf,
    }

    parser_fn = parser_map.get(bank)
    if parser_fn:
        transactions = parser_fn(all_lines)
        transactions.sort(key=lambda t: t["date_iso"])
        return {
            "bank_name": bank,
            "transactions": transactions,
            "raw_text": full_text,
            "recognized": True,
        }

    return {
        "bank_name": bank,
        "transactions": [],
        "raw_text": full_text,
        "recognized": False,
    }


# ---------------------------------------------------------------------------
# Lloyds parser  (ported from api.py state-machine logic)
# ---------------------------------------------------------------------------

def parse_lloyds_pdf(text_lines: list[str]) -> list[dict]:
    """Parse Lloyds bank statement text lines into transactions.

    PyMuPDF extracts Lloyds PDFs as labeled multi-line fields:
        Date
        02 Jan 26.
        Description
        UBER UK RIDES.
        Type
        DEB.
        Money In (pounds)
        blank.
        Money Out (pounds)
        8.30.
        Balance (pounds)
        31.66.

    This parser reads those labels as a state machine.
    """
    transactions: list[dict] = []
    i = 0
    while i < len(text_lines):
        line = text_lines[i].strip()

        if line == "Date" and i + 1 < len(text_lines):
            date_val = text_lines[i + 1].strip().rstrip(".")

            try:
                dt = datetime.strptime(date_val, "%d %b %y")
                date_iso = dt.strftime("%Y-%m-%d")
            except ValueError:
                i += 1
                continue

            desc = ""
            type_code = ""
            money_in = 0.0
            money_out = 0.0
            balance = 0.0

            j = i + 2
            while j < len(text_lines) and j < i + 20:
                field = text_lines[j].strip()

                if field == "Description" and j + 1 < len(text_lines):
                    desc = text_lines[j + 1].strip().rstrip(".")
                    if desc in ("blank", ""):
                        desc = "[REDACTED]"
                    j += 2
                    continue
                elif field == "Type" and j + 1 < len(text_lines):
                    type_code = text_lines[j + 1].strip().rstrip(".")
                    j += 2
                    continue
                elif field.startswith("Money In") and j + 1 < len(text_lines):
                    val = text_lines[j + 1].strip().rstrip(".")
                    if val not in ("blank", ""):
                        try:
                            money_in = float(val.replace(",", ""))
                        except ValueError:
                            money_in = 0.0
                    j += 2
                    continue
                elif field.startswith("Money Out") and j + 1 < len(text_lines):
                    val = text_lines[j + 1].strip().rstrip(".")
                    if val not in ("blank", ""):
                        try:
                            money_out = float(val.replace(",", ""))
                        except ValueError:
                            money_out = 0.0
                    j += 2
                    continue
                elif field.startswith("Balance") and j + 1 < len(text_lines):
                    val = text_lines[j + 1].strip().rstrip(".")
                    if val not in ("blank", ""):
                        try:
                            balance = float(val.replace(",", ""))
                        except ValueError:
                            balance = 0.0
                    j += 2
                    break
                else:
                    j += 1
                    continue

            direction = "IN" if money_in > 0 and money_out == 0 else "OUT"
            amount = money_in if direction == "IN" else money_out

            if money_in > 0 or money_out > 0:
                transactions.append({
                    "date_iso": date_iso,
                    "description": desc,
                    "merchant": desc,
                    "category": "",
                    "type": type_code,
                    "amount": round(amount, 2),
                    "money_in": round(money_in, 2),
                    "money_out": round(money_out, 2),
                    "balance": round(balance, 2) if balance else None,
                    "direction": direction,
                    "is_redacted": False,
                })

            i = j
        else:
            i += 1

    return transactions


# ---------------------------------------------------------------------------
# Bank of America parser
# ---------------------------------------------------------------------------

# Regex for BofA date at start of line: MM/DD/YY
_BOFA_DATE_RE = re.compile(r"^(\d{2}/\d{2}/\d{2})$")
# Regex for BofA amount: optional minus, digits, comma-groups, dash, two digits
# BofA uses dash as decimal separator: 300-00 means 300.00, -182-78 means -182.78
_BOFA_AMT_RE = re.compile(r"^-?[\d,]+-\d{2}$")
# Also handle normal decimal format (seen in totals): $6,316.92
_BOFA_AMT_NORMAL_RE = re.compile(r"^-?\$?[\d,]+\.\d{2}$")


def _parse_bofa_amount(raw: str) -> float:
    """Parse BofA amount string. They use dash as decimal: 300-00 -> 300.00, -182-78 -> -182.78."""
    s = raw.strip().replace("$", "").replace(",", "")
    if not s:
        return 0.0
    # Check if it uses dash-decimal format (last 3 chars are -XX)
    if re.match(r"^-?\d+-\d{2}$", s):
        # Split on the LAST dash which is the decimal separator
        neg = s.startswith("-")
        s_abs = s.lstrip("-")
        parts = s_abs.rsplit("-", 1)
        if len(parts) == 2:
            val = float(f"{parts[0]}.{parts[1]}")
            return -val if neg else val
    # Normal format
    try:
        return float(s)
    except ValueError:
        return 0.0


def parse_bofa_pdf(text_lines: list[str]) -> list[dict]:
    """Parse Bank of America PDF statement.

    BofA PDFs have sections:
      - "Deposits and other additions" (direction=IN)
      - "ATM and debit card subtractions" (direction=OUT)
      - "Other subtractions" (direction=OUT)

    Within each section, transactions appear as:
      date_line (MM/DD/YY)
      description_line (may span multiple lines)
      amount_line (e.g., 300-00 or -182-78)
    """
    transactions: list[dict] = []
    section = None  # current section determines direction
    i = 0

    # Skip lines we don't care about
    skip_markers = [
        "Page ", "PULL:", "continued on", "Total ", "Date", "Description",
        "A.ount", "Amount", "BANK OF AMERICA", "Bank of America",
        "January ", "February ", "March ", "April ", "May ", "June ",
        "July ", "August ", "September ", "October ", "November ", "December ",
        "When you use", "Scan ", "Learn more", "What would", "To reach",
        "However", "business purposes", "SSM-", "Braille",
        "Account summary", "Beginning balance", "Ending balance",
        "Deposits and other", "Service ", "Pause and veri",
        "bankofamerica", "bofa.com",
    ]

    while i < len(text_lines):
        line = text_lines[i].strip()

        # Detect section changes
        line_lower = line.lower()
        if "deposits and other additions" in line_lower:
            section = "IN"
            i += 1
            continue
        if "debit card subtraction" in line_lower or "atm and debit" in line_lower:
            section = "OUT"
            i += 1
            continue
        if "other subtraction" in line_lower:
            section = "OUT"
            i += 1
            continue
        if "withdrawals and other" in line_lower:
            section = "OUT"
            i += 1
            continue

        # Skip non-transaction lines
        if not line or any(line.startswith(m) for m in skip_markers):
            i += 1
            continue

        # Look for date pattern
        date_match = _BOFA_DATE_RE.match(line)
        if date_match and section:
            date_str = date_match.group(1)
            try:
                dt = datetime.strptime(date_str, "%m/%d/%y")
                date_iso = dt.strftime("%Y-%m-%d")
            except ValueError:
                i += 1
                continue

            # Collect description lines until we hit an amount
            desc_parts = []
            j = i + 1
            amount = 0.0
            found_amount = False

            while j < len(text_lines) and j < i + 10:
                next_line = text_lines[j].strip()

                # Check if this line is an amount
                if _BOFA_AMT_RE.match(next_line) or _BOFA_AMT_NORMAL_RE.match(next_line):
                    amount = _parse_bofa_amount(next_line)
                    found_amount = True
                    j += 1
                    break

                # Check if this is a new date (next transaction) -- stop
                if _BOFA_DATE_RE.match(next_line):
                    break

                # Check for section headers / skip markers
                if any(next_line.startswith(m) for m in skip_markers):
                    break

                # It's a description line
                if next_line:
                    desc_parts.append(next_line)
                j += 1

            if found_amount and desc_parts:
                description = " ".join(desc_parts)
                abs_amount = abs(amount)
                direction = section

                # For deposits section, amount should be positive
                # For subtraction sections, amount is negative in the PDF
                money_in = abs_amount if direction == "IN" else 0.0
                money_out = abs_amount if direction == "OUT" else 0.0

                transactions.append({
                    "date_iso": date_iso,
                    "description": description,
                    "merchant": description,
                    "category": "",
                    "type": "",
                    "amount": round(abs_amount, 2),
                    "money_in": round(money_in, 2),
                    "money_out": round(money_out, 2),
                    "balance": None,
                    "direction": direction,
                    "is_redacted": False,
                })

            i = j
        else:
            i += 1

    return transactions
