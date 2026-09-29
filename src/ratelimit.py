"""Small in-process rate limiter for the authentication routes.

Deliberately dependency-free and in-memory. The app runs as a single container, so a shared
store (Redis) would add an external moving part for no benefit at this scale. Two
consequences to know about: counters reset when the process restarts, and if the app is ever
scaled to multiple instances each keeps its own counts. Both are acceptable for slowing down
password guessing; neither is acceptable for billing or quotas, so don't reuse this for those.

Bounded on purpose. The keys come from caller-controlled values (client address, submitted
email), so an unbounded dict here would itself be the attack -- send traffic from many
addresses and grow the process until it dies.
"""

import time
from collections import OrderedDict
from typing import Optional

from fastapi import HTTPException, Request

# Most keys are evicted by expiry long before this matters; the cap is the backstop for a
# flood of one-shot keys.
_MAX_TRACKED_KEYS = 10_000

_hits: "OrderedDict[str, list[float]]" = OrderedDict()


def client_key(request: Request, prefix: str) -> str:
    """Identify the caller. Behind Railway/Vercel the socket address is the proxy's, so the
    left-most X-Forwarded-For entry is the real client. That header is only trustworthy
    because a proxy sets it; direct-to-internet deployments could see it spoofed, which would
    let an attacker sidestep the per-address limit. The per-email limit below is the backstop
    for exactly that case."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        addr = forwarded.split(",")[0].strip()
    else:
        addr = request.client.host if request.client else "unknown"
    return f"{prefix}:{addr}"


_LOOPBACK = {"127.0.0.1", "::1", "localhost"}


def is_exempt(request: Request) -> bool:
    """True for traffic that originated on this machine.

    Hosted deployments sit behind a proxy (Railway, Vercel) which always sets
    X-Forwarded-For, so a real user's request is never exempt -- the presence of that header
    alone disqualifies it, regardless of the socket address. What this does exempt is a
    direct loopback connection, which in practice means the test suites and local
    development. Without this, running the suites back to back trips the limiter and tests
    fail for a reason that has nothing to do with what they are testing.
    """
    if request.headers.get("x-forwarded-for"):
        return False
    host = request.client.host if request.client else ""
    return host in _LOOPBACK


def _prune(now: float, window_seconds: int) -> None:
    cutoff = now - window_seconds
    stale = [k for k, times in _hits.items() if not times or times[-1] < cutoff]
    for k in stale:
        _hits.pop(k, None)
    while len(_hits) > _MAX_TRACKED_KEYS:
        _hits.popitem(last=False)


def check(key: str, max_attempts: int, window_seconds: int, message: Optional[str] = None) -> None:
    """Record one attempt against `key` and raise 429 if it exceeds the allowance.

    Counts every attempt, not just failures: a caller hammering login with valid credentials
    is still a caller to slow down, and counting only failures lets an attacker reset the
    window with one known-good login.
    """
    now = time.monotonic()
    _prune(now, window_seconds)

    times = _hits.get(key)
    if times is None:
        times = []
        _hits[key] = times

    cutoff = now - window_seconds
    times[:] = [t for t in times if t >= cutoff]

    if len(times) >= max_attempts:
        retry_after = max(1, int(window_seconds - (now - times[0])))
        raise HTTPException(
            status_code=429,
            detail=message or "Too many attempts. Please wait and try again.",
            headers={"Retry-After": str(retry_after)},
        )

    times.append(now)
    _hits.move_to_end(key)


def reset() -> None:
    """Clear all counters. For tests only."""
    _hits.clear()
