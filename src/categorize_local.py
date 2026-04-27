"""Phase 12B: Local merchant categorization via vector similarity.

Replaces the previous Claude-based categorize_merchants(). Zero outbound network calls.

How it works:
1. fastembed (ONNX runtime) embeds the merchant string -> 384-dim vector
2. pgvector cosine-distance KNN search over the user's manually-categorized history
3. Direction-aware (Wingstop salary IN won't match Wingstop meal OUT)
4. Only learns from category_source='manual' rows (user's authoritative edits via Phase 11 modal)
   so the matcher never amplifies its own past auto-categorizations.

The embedder is lazy-loaded (singleton) -- first call downloads ~80MB model to
~/.cache/fastembed/, cached for subsequent calls. Embedding latency ~30-60ms on CPU.
"""

from __future__ import annotations

from collections import Counter
from typing import Optional, Iterable

from sqlalchemy import text


_MODEL = None
EMBED_DIM = 384
MODEL_NAME = "BAAI/bge-small-en-v1.5"  # 384-dim, English, ~80MB ONNX


def get_embedder():
    """Lazy singleton -- model loads on first call only."""
    global _MODEL
    if _MODEL is None:
        from fastembed import TextEmbedding
        _MODEL = TextEmbedding(model_name=MODEL_NAME)
    return _MODEL


def embed_text(value: str) -> list[float]:
    """Return a 384-dim vector (native Python floats) for the given string.
    Empty / None inputs return a zero vector."""
    s = (value or "").strip()
    if not s:
        return [0.0] * EMBED_DIM
    vec = next(get_embedder().embed([s]))
    return [float(x) for x in vec]


def embed_many(values: Iterable[str]) -> list[list[float]]:
    """Batch-embed a list of strings. Single ONNX inference per batch -- much
    faster than calling embed_text() in a loop for >1 input."""
    cleaned = [(v or "").strip() for v in values]
    if not cleaned:
        return []
    safe = [c if c else " " for c in cleaned]
    vectors = list(get_embedder().embed(safe))
    out: list[list[float]] = []
    for orig, vec in zip(cleaned, vectors):
        if not orig:
            out.append([0.0] * EMBED_DIM)
        else:
            out.append([float(x) for x in vec])
    return out


async def categorize_by_neighbors(
    user_id,
    merchant: str,
    direction: str,
    db,
    *,
    k: int = 5,
    threshold: float = 0.65,
) -> Optional[str]:
    """Find the K nearest already-categorized transactions of the same direction
    for this user. Return the majority category if at least 2 of the top-K agree
    AND top similarity >= threshold. Otherwise return None (caller defaults to
    'Other' / starter pack / etc).

    Args:
        user_id: UUID of the requesting user.
        merchant: Raw merchant string from the new transaction.
        direction: 'IN' or 'OUT'. Same-direction matches only.
        db: AsyncSession (Depends(get_db)).
        k: Number of nearest neighbors to consider.
        threshold: Cosine similarity floor (0..1). Below this, no match.
    """
    if not merchant or not merchant.strip():
        return None
    qvec = embed_text(merchant.strip())
    # pgvector: <=> is cosine distance (0 = identical, 2 = opposite). We compute
    # similarity = 1 - distance. asyncpg accepts the python list directly when the
    # column type is registered via pgvector.asyncpg or by casting at SQL level.
    # We cast explicitly via ::vector to be safe across drivers.
    rows = await db.execute(
        text(
            """
            SELECT category, 1 - (embedding <=> CAST(:qvec AS vector)) AS sim
            FROM transactions
            WHERE user_id = CAST(:uid AS uuid)
              AND direction = :dir
              AND embedding IS NOT NULL
              AND category IS NOT NULL
              AND category != 'Other'
              AND category_source = 'manual'
            ORDER BY embedding <=> CAST(:qvec AS vector)
            LIMIT :k
            """
        ),
        {"qvec": str(qvec), "uid": str(user_id), "dir": direction, "k": k},
    )
    neighbors = rows.fetchall()
    if not neighbors:
        return None
    # Top neighbor must clear the threshold
    if neighbors[0][1] < threshold:
        return None
    # Majority vote among the neighbors that themselves clear the threshold
    above = [r[0] for r in neighbors if r[1] >= threshold]
    if not above:
        return None
    top_cat, count = Counter(above).most_common(1)[0]
    # Need at least 2 confirming neighbors when k>=3, otherwise top neighbor is decisive
    min_agree = 2 if len(above) >= 3 else 1
    return top_cat if count >= min_agree else None
