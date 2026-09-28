"""Fake Plaid client for local/CI testing without real Sandbox/Production credentials
(Phase 0 skeleton -- bodies filled in Wave 1 by BP-SVC).

Riya's Plaid access tier is still unconfirmed ("i dont know yet need to check"). Gating
the whole Plaid surface behind PLAID_ENV=fake + this fixture-driven client means every
route, the sync orchestration, and the plan-engine tests can run today regardless of tier --
only the actual real-bank PC test (Riya's hands) needs real credentials.

Scenario selection: the `public_token` string passed to exchange_public_token picks a
fixture set, e.g. "fake-public-token:debt-heavy-user" -> data/plaid_fixtures/debt-heavy-user.json.
"""

import json
import os
import re
import uuid
from typing import Optional, Protocol

_DEFAULT_SCENARIO = "simple-checking"
_FIXTURES_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), "..", "data", "plaid_fixtures"))


class PlaidClientProtocol(Protocol):
    def create_link_token(self, user_id: str, country_codes: Optional[list[str]] = None) -> str: ...
    def exchange_public_token(self, public_token: str) -> dict: ...
    def sync_transactions(self, access_token: str, cursor: Optional[str] = None, count: int = 500) -> dict: ...
    def remove_item(self, access_token: str) -> bool: ...


def _scenario_from_public_token(public_token: str) -> str:
    """"fake-public-token:debt-heavy-user" -> "debt-heavy-user". No ":" -> default scenario."""
    parts = (public_token or "").split(":", 1)
    return parts[1] if len(parts) == 2 and parts[1] else _DEFAULT_SCENARIO


def _scenario_from_access_token(access_token: str) -> str:
    """The fake access_token embeds the scenario so a later sync_transactions call (which
    only receives the access_token, not the original public_token) knows which fixture to
    keep paginating over."""
    parts = (access_token or "").split(":")
    return parts[1] if len(parts) >= 2 and parts[1] else _DEFAULT_SCENARIO


def _load_fixture(scenario: str) -> dict:
    if not re.fullmatch(r"[A-Za-z0-9_-]+", scenario or ""):
        raise FileNotFoundError(f"No Plaid fixture for scenario '{scenario}'")
    path = os.path.join(_FIXTURES_DIR, f"{scenario}.json")
    if not os.path.isfile(path):
        raise FileNotFoundError(f"No Plaid fixture for scenario '{scenario}'")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _combined_items(fixture: dict) -> list[tuple[str, dict]]:
    """Flatten added/modified/removed into one ordered stream so pagination can slice
    across all three the way a real Plaid page can."""
    items: list[tuple[str, dict]] = []
    for t in fixture.get("added", []) or []:
        items.append(("added", t))
    for t in fixture.get("modified", []) or []:
        items.append(("modified", t))
    for t in fixture.get("removed", []) or []:
        items.append(("removed", t))
    return items


class FakePlaidClient:
    def create_link_token(self, user_id: str, country_codes: Optional[list[str]] = None) -> str:
        return f"fake-link-token:{user_id}"

    def exchange_public_token(self, public_token: str) -> dict:
        scenario = _scenario_from_public_token(public_token)
        _load_fixture(scenario)  # validates the scenario exists before handing back a token for it
        return {
            "access_token": f"fake-access-token:{scenario}:{uuid.uuid4().hex}",
            "item_id": f"fake-item-{uuid.uuid4().hex}",
        }

    def sync_transactions(self, access_token: str, cursor: Optional[str] = None, count: int = 500) -> dict:
        scenario = _scenario_from_access_token(access_token)
        fixture = _load_fixture(scenario)
        items = _combined_items(fixture)

        offset = int(cursor) if cursor else 0
        offset = max(0, min(offset, len(items)))
        page = items[offset: offset + count]
        new_offset = offset + len(page)

        return {
            "added": [t for kind, t in page if kind == "added"],
            "modified": [t for kind, t in page if kind == "modified"],
            "removed": [t for kind, t in page if kind == "removed"],
            "next_cursor": str(new_offset),
            "has_more": new_offset < len(items),
            "accounts": fixture.get("accounts", []),
        }

    def remove_item(self, access_token: str) -> bool:
        return True


def get_client() -> PlaidClientProtocol:
    """PLAID_ENV=fake -> FakePlaidClient(); otherwise the real src.plaid_service module,
    which already satisfies PlaidClientProtocol structurally."""
    if os.getenv("PLAID_ENV", "").strip().lower() == "fake":
        return FakePlaidClient()
    from src import plaid_service
    return plaid_service
