"""Phase 12C: Cold-start keyword rule pack.

Used as a fallback BEFORE pgvector neighbor search has anything to learn from
(brand-new user, no manual edits yet). Pure substring matching, case-insensitive.

This is intentionally a small, opinionated list of common UK + US merchants.
The full personalization happens via the user's own edits (Phase 11 modal).
"""

from __future__ import annotations
from typing import Optional

STARTER_RULES: list[dict[str, str]] = [
    # ---------- UK supermarkets / groceries ----------
    {"merchant": "tesco",       "category": "Groceries"},
    {"merchant": "sainsbury",   "category": "Groceries"},
    {"merchant": "asda",        "category": "Groceries"},
    {"merchant": "aldi",        "category": "Groceries"},
    {"merchant": "lidl",        "category": "Groceries"},
    {"merchant": "morrisons",   "category": "Groceries"},
    {"merchant": "waitrose",    "category": "Groceries"},
    {"merchant": "co-op",       "category": "Groceries"},
    {"merchant": "iceland",     "category": "Groceries"},
    {"merchant": "marks & spencer", "category": "Groceries"},
    # ---------- US supermarkets / groceries ----------
    {"merchant": "walmart",     "category": "Groceries"},
    {"merchant": "kroger",      "category": "Groceries"},
    {"merchant": "trader joe",  "category": "Groceries"},
    {"merchant": "whole foods", "category": "Groceries"},
    {"merchant": "safeway",     "category": "Groceries"},
    {"merchant": "publix",      "category": "Groceries"},
    {"merchant": "costco",      "category": "Groceries"},
    # ---------- Eating out / food delivery ----------
    {"merchant": "deliveroo",   "category": "Eating Out"},
    {"merchant": "uber eats",   "category": "Eating Out"},
    {"merchant": "doordash",    "category": "Eating Out"},
    {"merchant": "grubhub",     "category": "Eating Out"},
    {"merchant": "just eat",    "category": "Eating Out"},
    {"merchant": "wingstop",    "category": "Eating Out"},
    {"merchant": "mcdonald",    "category": "Eating Out"},
    {"merchant": "burger king", "category": "Eating Out"},
    {"merchant": "kfc",         "category": "Eating Out"},
    {"merchant": "chipotle",    "category": "Eating Out"},
    {"merchant": "subway",      "category": "Eating Out"},
    {"merchant": "domino",      "category": "Eating Out"},
    {"merchant": "nando",       "category": "Eating Out"},
    {"merchant": "pret",        "category": "Eating Out"},
    {"merchant": "wagamama",    "category": "Eating Out"},
    # ---------- Coffee ----------
    {"merchant": "starbucks",   "category": "Coffee & Cafe"},
    {"merchant": "costa",       "category": "Coffee & Cafe"},
    {"merchant": "caffe nero",  "category": "Coffee & Cafe"},
    {"merchant": "dunkin",      "category": "Coffee & Cafe"},
    # ---------- Transport ----------
    {"merchant": "tfl",         "category": "Transport"},
    {"merchant": "transport for london", "category": "Transport"},
    {"merchant": "uber",        "category": "Transport"},
    {"merchant": "lyft",        "category": "Transport"},
    {"merchant": "bolt",        "category": "Transport"},
    {"merchant": "national rail","category": "Transport"},
    {"merchant": "trainline",   "category": "Transport"},
    {"merchant": "shell",       "category": "Transport"},
    {"merchant": "bp ",         "category": "Transport"},
    {"merchant": "esso",        "category": "Transport"},
    {"merchant": "chevron",     "category": "Transport"},
    {"merchant": "exxon",       "category": "Transport"},
    # ---------- Subscriptions / streaming ----------
    {"merchant": "netflix",     "category": "Subscriptions"},
    {"merchant": "spotify",     "category": "Subscriptions"},
    {"merchant": "disney+",     "category": "Subscriptions"},
    {"merchant": "disney plus", "category": "Subscriptions"},
    {"merchant": "amazon prime","category": "Subscriptions"},
    {"merchant": "apple.com/bill", "category": "Subscriptions"},
    {"merchant": "icloud",      "category": "Subscriptions"},
    {"merchant": "youtube premium", "category": "Subscriptions"},
    {"merchant": "hulu",        "category": "Subscriptions"},
    {"merchant": "now tv",      "category": "Subscriptions"},
    # ---------- Shopping / e-commerce ----------
    {"merchant": "amazon",      "category": "Shopping"},
    {"merchant": "amzn",        "category": "Shopping"},
    {"merchant": "ebay",        "category": "Shopping"},
    {"merchant": "target",      "category": "Shopping"},
    {"merchant": "argos",       "category": "Shopping"},
    {"merchant": "ikea",        "category": "Shopping"},
    {"merchant": "shein",       "category": "Shopping"},
    {"merchant": "asos",        "category": "Shopping"},
    {"merchant": "zara",        "category": "Shopping"},
    {"merchant": "h&m",         "category": "Shopping"},
    # ---------- Utilities / bills ----------
    {"merchant": "british gas", "category": "Utilities"},
    {"merchant": "octopus energy", "category": "Utilities"},
    {"merchant": "edf",         "category": "Utilities"},
    {"merchant": "thames water","category": "Utilities"},
    {"merchant": "comcast",     "category": "Utilities"},
    {"merchant": "verizon",     "category": "Utilities"},
    {"merchant": "att",         "category": "Utilities"},
    {"merchant": "vodafone",    "category": "Utilities"},
    {"merchant": "ee ",         "category": "Utilities"},
    {"merchant": "o2",          "category": "Utilities"},
    {"merchant": "three",       "category": "Utilities"},
    # ---------- Fitness / health ----------
    {"merchant": "puregym",     "category": "Fitness"},
    {"merchant": "the gym",     "category": "Fitness"},
    {"merchant": "planet fitness", "category": "Fitness"},
    {"merchant": "anytime fitness", "category": "Fitness"},
    # ---------- Bank / fees ----------
    {"merchant": "atm fee",     "category": "Bank Fees"},
    {"merchant": "interest charge", "category": "Bank Fees"},
    {"merchant": "overdraft",   "category": "Bank Fees"},
]


def match_starter_rule(merchant: str) -> Optional[str]:
    """Case-insensitive substring match against the starter pack.
    Returns the category name or None if no rule matches.
    """
    if not merchant:
        return None
    m = merchant.lower()
    for r in STARTER_RULES:
        if r["merchant"] in m:
            return r["category"]
    return None
