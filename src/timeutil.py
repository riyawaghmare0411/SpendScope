"""User-timezone-aware day boundaries for the plan engine (Phase 0 skeleton -- bodies
filled in Wave 1 by BP-A). Replaces bare date.today() calls (stats_coach.py:116,262) that
silently use the SERVER's timezone instead of the user's.

Multinational target markets (USA, UK, Europe, India) get a country->tz fallback so a user
who hasn't set User.timezone explicitly still gets a sane "today" instead of UTC's.
"""

from datetime import date, datetime
from typing import Optional

DEFAULT_TZ = "UTC"

# Fallback IANA tz by country code, used only when User.timezone is unset. Not exhaustive --
# covers the four launch markets plus a couple of common test/dev cases.
COUNTRY_TZ_FALLBACK: dict[str, str] = {
    "US": "America/New_York",
    "GB": "Europe/London",
    "IN": "Asia/Kolkata",
    "DE": "Europe/Berlin",
    "FR": "Europe/Paris",
    "GE": "Asia/Tbilisi",
}


def resolve_timezone(user_timezone: Optional[str], country: Optional[str]) -> str:
    """User.timezone wins; else COUNTRY_TZ_FALLBACK[country]; else DEFAULT_TZ."""
    raise NotImplementedError


def today_for(tz_name: str) -> date:
    """The calendar date right now in `tz_name`. Use instead of date.today() anywhere in
    the plan engine -- the server's own timezone is never the right answer for a user."""
    raise NotImplementedError


def now_for(tz_name: str) -> datetime:
    raise NotImplementedError
