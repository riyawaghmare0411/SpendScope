"""Fake Plaid client for local/CI testing without real Sandbox/Production credentials
(Phase 0 skeleton -- bodies filled in Wave 1 by BP-SVC).

Riya's Plaid access tier is still unconfirmed ("i dont know yet need to check"). Gating
the whole Plaid surface behind PLAID_ENV=fake + this fixture-driven client means every
route, the sync orchestration, and the plan-engine tests can run today regardless of tier --
only the actual real-bank PC test (Riya's hands) needs real credentials.

Scenario selection: the `public_token` string passed to exchange_public_token picks a
fixture set, e.g. "fake-public-token:debt-heavy-user" -> data/plaid_fixtures/debt-heavy-user.json.
"""

import os
from typing import Optional, Protocol


class PlaidClientProtocol(Protocol):
    def create_link_token(self, user_id: str, country_codes: Optional[list[str]] = None) -> str: ...
    def exchange_public_token(self, public_token: str) -> dict: ...
    def sync_transactions(self, access_token: str, cursor: Optional[str] = None, count: int = 500) -> dict: ...
    def remove_item(self, access_token: str) -> bool: ...


class FakePlaidClient:
    def create_link_token(self, user_id: str, country_codes: Optional[list[str]] = None) -> str:
        raise NotImplementedError

    def exchange_public_token(self, public_token: str) -> dict:
        raise NotImplementedError

    def sync_transactions(self, access_token: str, cursor: Optional[str] = None, count: int = 500) -> dict:
        raise NotImplementedError

    def remove_item(self, access_token: str) -> bool:
        raise NotImplementedError


def get_client() -> PlaidClientProtocol:
    """PLAID_ENV=fake -> FakePlaidClient(); otherwise the real src.plaid_service module,
    which already satisfies PlaidClientProtocol structurally."""
    raise NotImplementedError
