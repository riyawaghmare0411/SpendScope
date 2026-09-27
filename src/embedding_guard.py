"""Guards Plaid sync against the broken-locally onnxruntime dependency (ENV-1).

categorize_local.embed_text loads a real ONNX model on first call; on this machine that
currently fails (broken VC++ redistributable). Wave 1's plaid_sync.py calls this instead
of embed_text directly so a sync never 500s just because embeddings are unavailable --
the merchant still gets categorized by rules/starter-rules, just not by KNN this run.
"""

from typing import Optional

from src.categorize_local import embed_text


def safe_embed(value: str) -> Optional[list[float]]:
    try:
        return embed_text(value)
    except Exception:
        return None
