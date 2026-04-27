"""Plaid bank sync integration.

Handles the OAuth-style flow:
  1. create_link_token(user_id) -> token frontend uses to open Plaid Link
  2. exchange_public_token(public_token) -> long-lived access_token
  3. sync_transactions(access_token, cursor) -> new/modified/removed txns
  4. verify_webhook(jwt_header, body) -> validated webhook payload

Access tokens are NEVER stored in plaintext. They live encrypted with Fernet
using PLAID_TOKEN_ENCRYPTION_KEY (server-side env var). If the DB is leaked
but env vars aren't, the tokens stay safe.

Plaid is server-to-server by design: bank data flows Bank -> Plaid -> our server
-> user's browser. Manual CSV/PDF upload remains the privacy-max alternative.
"""

import os
import json
import hashlib
import time
from typing import Optional

import httpx
from cryptography.fernet import Fernet
import jwt as pyjwt

# Plaid SDK
from plaid.api import plaid_api
from plaid.configuration import Configuration
from plaid.api_client import ApiClient
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.transactions_sync_request import TransactionsSyncRequest
from plaid.model.item_remove_request import ItemRemoveRequest


# ---------- Plaid client (lazy singleton) ----------

_PLAID_HOSTS = {
    "sandbox": "https://sandbox.plaid.com",
    "development": "https://development.plaid.com",
    "production": "https://production.plaid.com",
}

_client_cache: Optional[plaid_api.PlaidApi] = None


def get_plaid_client() -> plaid_api.PlaidApi:
    """Return a configured Plaid API client. Raises if env vars missing."""
    global _client_cache
    if _client_cache is not None:
        return _client_cache

    client_id = os.getenv("PLAID_CLIENT_ID")
    secret = os.getenv("PLAID_SECRET")
    env = os.getenv("PLAID_ENV", "sandbox").lower()
    if not client_id or not secret:
        raise RuntimeError("PLAID_CLIENT_ID and PLAID_SECRET must be set in environment")
    host = _PLAID_HOSTS.get(env)
    if not host:
        raise RuntimeError(f"Invalid PLAID_ENV: {env}. Must be sandbox|development|production")

    config = Configuration(host=host, api_key={"clientId": client_id, "secret": secret})
    _client_cache = plaid_api.PlaidApi(ApiClient(config))
    return _client_cache


def is_plaid_configured() -> bool:
    """True if Plaid env vars are set (used by API to gate endpoints gracefully)."""
    return bool(os.getenv("PLAID_CLIENT_ID") and os.getenv("PLAID_SECRET") and os.getenv("PLAID_TOKEN_ENCRYPTION_KEY"))


# ---------- Token encryption (Fernet) ----------

def _get_fernet() -> Fernet:
    key = os.getenv("PLAID_TOKEN_ENCRYPTION_KEY")
    if not key:
        raise RuntimeError("PLAID_TOKEN_ENCRYPTION_KEY missing. Generate via Fernet.generate_key().")
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(plaintext: str) -> str:
    """Encrypt access_token for at-rest storage. Returns base64 string."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt stored access_token back to plaintext for API calls."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()


# ---------- 4-step OAuth flow ----------

def create_link_token(user_id: str, country_codes: list[str] = None) -> str:
    """Step 1: Create link_token for frontend to open Plaid Link modal."""
    client = get_plaid_client()
    countries = [CountryCode(c) for c in (country_codes or ["GB", "US"])]
    request = LinkTokenCreateRequest(
        products=[Products("transactions")],
        client_name="SpendScope",
        country_codes=countries,
        language="en",
        user=LinkTokenCreateRequestUser(client_user_id=user_id),
    )
    webhook_url = os.getenv("PLAID_WEBHOOK_URL", "").strip()
    if webhook_url:
        request.webhook = webhook_url
    response = client.link_token_create(request)
    return response["link_token"]


def exchange_public_token(public_token: str) -> dict:
    """Step 3: Exchange public_token (from frontend) for permanent access_token + item_id."""
    client = get_plaid_client()
    request = ItemPublicTokenExchangeRequest(public_token=public_token)
    response = client.item_public_token_exchange(request)
    return {
        "access_token": response["access_token"],
        "item_id": response["item_id"],
    }


def sync_transactions(access_token: str, cursor: Optional[str] = None, count: int = 500) -> dict:
    """Step 4: Fetch new/modified/removed transactions since the given cursor.

    Returns:
        {
            "added": [Transaction, ...],
            "modified": [Transaction, ...],
            "removed": [{"transaction_id": str}, ...],
            "next_cursor": str,
            "has_more": bool,
        }
    """
    client = get_plaid_client()
    kwargs = {"access_token": access_token, "count": count}
    if cursor:
        kwargs["cursor"] = cursor
    request = TransactionsSyncRequest(**kwargs)
    response = client.transactions_sync(request)
    return {
        "added": [tx.to_dict() for tx in response["added"]],
        "modified": [tx.to_dict() for tx in response["modified"]],
        "removed": [r.to_dict() for r in response["removed"]],
        "next_cursor": response["next_cursor"],
        "has_more": response["has_more"],
        "accounts": [a.to_dict() for a in response.get("accounts", [])],
    }


def remove_item(access_token: str) -> bool:
    """Disconnect a Plaid Item (revokes the access_token at Plaid's end)."""
    try:
        client = get_plaid_client()
        client.item_remove(ItemRemoveRequest(access_token=access_token))
        return True
    except Exception:
        return False


# ---------- Webhook signature verification ----------

# Cache of public keys fetched from Plaid (kid -> JWK dict)
_jwk_cache: dict = {}


def verify_webhook(jwt_header: str, body_bytes: bytes) -> dict:
    """Verify Plaid webhook signature (ES256 JWT) and return parsed body.

    Plaid signs every webhook. The 'Plaid-Verification' header is a JWT signed
    with a per-merchant key. We:
      1. Read the JWT header to get the key id (kid)
      2. Fetch the public key from Plaid (cached)
      3. Verify JWT signature
      4. Check timestamp freshness (within 5 min)
      5. Verify body sha256 matches the JWT claim

    Raises ValueError on any failure.
    """
    if not jwt_header:
        raise ValueError("Missing Plaid-Verification header")

    try:
        header = pyjwt.get_unverified_header(jwt_header)
    except pyjwt.PyJWTError as e:
        raise ValueError(f"Invalid JWT header: {e}")

    if header.get("alg") != "ES256":
        raise ValueError(f"Unexpected alg: {header.get('alg')}")
    kid = header.get("kid")
    if not kid:
        raise ValueError("Missing kid in JWT header")

    # Fetch JWK if not cached
    jwk = _jwk_cache.get(kid)
    if jwk is None:
        client = get_plaid_client()
        from plaid.model.webhook_verification_key_get_request import WebhookVerificationKeyGetRequest
        resp = client.webhook_verification_key_get(WebhookVerificationKeyGetRequest(key_id=kid))
        jwk = resp["key"].to_dict() if hasattr(resp["key"], "to_dict") else resp["key"]
        _jwk_cache[kid] = jwk

    # Verify JWT signature
    try:
        public_key = pyjwt.algorithms.ECAlgorithm.from_jwk(json.dumps(jwk))
        payload = pyjwt.decode(jwt_header, public_key, algorithms=["ES256"])
    except pyjwt.PyJWTError as e:
        raise ValueError(f"JWT signature verification failed: {e}")

    # Freshness check: issued within 5 minutes
    iat = payload.get("iat", 0)
    now = int(time.time())
    if now - iat > 300:
        raise ValueError(f"Webhook too old: {now - iat}s")

    # Body hash check
    body_sha256 = hashlib.sha256(body_bytes).hexdigest()
    if body_sha256 != payload.get("request_body_sha256"):
        raise ValueError("Body hash mismatch")

    return json.loads(body_bytes.decode())


# ---------- Plaid -> SpendScope category mapping ----------

# Plaid's personal_finance_category.primary -> SpendScope's 20 categories
# Source: https://plaid.com/docs/api/products/transactions/#categories
_PLAID_CATEGORY_MAP = {
    "INCOME": "Income",
    "TRANSFER_IN": "Income",
    "TRANSFER_OUT": "Transfers",
    "LOAN_PAYMENTS": "Bills",
    "BANK_FEES": "Bank Fees",
    "ENTERTAINMENT": "Entertainment",
    "FOOD_AND_DRINK": "Eating Out",
    "GENERAL_MERCHANDISE": "Shopping",
    "HOME_IMPROVEMENT": "Shopping",
    "MEDICAL": "Healthcare",
    "PERSONAL_CARE": "Healthcare",
    "GENERAL_SERVICES": "Bills",
    "GOVERNMENT_AND_NON_PROFIT": "Bills",
    "TRANSPORTATION": "Transport",
    "TRAVEL": "Travel",
    "RENT_AND_UTILITIES": "Utilities",
}

# Detailed sub-categories override the primary mapping
_PLAID_DETAILED_OVERRIDES = {
    "FOOD_AND_DRINK_GROCERIES": "Groceries",
    "FOOD_AND_DRINK_RESTAURANT": "Eating Out",
    "FOOD_AND_DRINK_RESTAURANTS": "Eating Out",
    "FOOD_AND_DRINK_FAST_FOOD": "Eating Out",
    "FOOD_AND_DRINK_COFFEE": "Coffee & Cafe",
    "FOOD_AND_DRINK_BEER_WINE_AND_LIQUOR": "Eating Out",
    "GENERAL_MERCHANDISE_ONLINE_MARKETPLACES": "Shopping",
    "GENERAL_MERCHANDISE_DEPARTMENT_STORES": "Shopping",
    "GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES": "Shopping",
    "GENERAL_MERCHANDISE_BOOKSTORES_AND_NEWSSTANDS": "Shopping",
    "GENERAL_MERCHANDISE_ELECTRONICS": "Shopping",
    "GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES": "Shopping",
    "TRANSPORTATION_PUBLIC_TRANSIT": "Transport",
    "TRANSPORTATION_TAXIS_AND_RIDE_SHARES": "Transport",
    "TRANSPORTATION_GAS": "Transport",
    "TRANSPORTATION_PARKING": "Transport",
    "TRANSPORTATION_BIKES_AND_SCOOTERS": "Transport",
    "TRAVEL_FLIGHTS": "Travel",
    "TRAVEL_LODGING": "Travel",
    "TRAVEL_RENTAL_CARS": "Travel",
    "RENT_AND_UTILITIES_RENT": "Rent",
    "RENT_AND_UTILITIES_INTERNET_AND_CABLE": "Utilities",
    "RENT_AND_UTILITIES_TELEPHONE": "Utilities",
    "RENT_AND_UTILITIES_GAS_AND_ELECTRICITY": "Utilities",
    "RENT_AND_UTILITIES_WATER": "Utilities",
    "GENERAL_SERVICES_INSURANCE": "Insurance",
    "GENERAL_SERVICES_AUTOMOTIVE": "Transport",
    "GENERAL_SERVICES_EDUCATION": "Education",
    "ENTERTAINMENT_TV_AND_MOVIES": "Subscriptions",
    "ENTERTAINMENT_MUSIC_AND_AUDIO": "Subscriptions",
    "ENTERTAINMENT_VIDEO_GAMES": "Entertainment",
    "ENTERTAINMENT_SPORTING_EVENTS_AMUSEMENT_PARKS_AND_MUSEUMS": "Entertainment",
    "PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS": "Fitness",
    "PERSONAL_CARE_HAIR_AND_BEAUTY": "Healthcare",
    "PERSONAL_CARE_LAUNDRY_AND_DRY_CLEANING": "Bills",
}


def map_plaid_category(personal_finance_category: Optional[dict]) -> str:
    """Map Plaid's personal_finance_category to one of SpendScope's 20 categories.

    personal_finance_category looks like:
        {"primary": "FOOD_AND_DRINK", "detailed": "FOOD_AND_DRINK_RESTAURANT", "confidence_level": "VERY_HIGH"}
    """
    if not personal_finance_category:
        return "Other"
    detailed = personal_finance_category.get("detailed")
    if detailed and detailed in _PLAID_DETAILED_OVERRIDES:
        return _PLAID_DETAILED_OVERRIDES[detailed]
    primary = personal_finance_category.get("primary")
    if primary and primary in _PLAID_CATEGORY_MAP:
        return _PLAID_CATEGORY_MAP[primary]
    return "Other"


def plaid_txn_to_spendscope(plaid_txn: dict) -> dict:
    """Convert a Plaid transaction dict to SpendScope's internal format.

    Plaid sign convention: positive amount = money OUT (debit/spend),
                           negative amount = money IN (credit/income).
    SpendScope uses money_in/money_out and direction explicitly.
    """
    plaid_amount = float(plaid_txn.get("amount", 0))
    direction = "OUT" if plaid_amount >= 0 else "IN"
    abs_amount = abs(plaid_amount)
    name = plaid_txn.get("name", "") or ""
    merchant = plaid_txn.get("merchant_name") or name
    return {
        "date_iso": str(plaid_txn.get("date", "")),
        "description": name,
        "merchant": merchant,
        "category": map_plaid_category(plaid_txn.get("personal_finance_category")),
        "type": "DEB" if direction == "OUT" else "CR",
        "amount": abs_amount,
        "money_in": abs_amount if direction == "IN" else 0,
        "money_out": abs_amount if direction == "OUT" else 0,
        "balance": None,
        "direction": direction,
        "is_redacted": False,
        "category_source": "plaid",
        "_plaid_transaction_id": plaid_txn.get("transaction_id"),
        "_plaid_account_id": plaid_txn.get("account_id"),
    }
