FROM python:3.13-slim

WORKDIR /app

# Phase 12: onnxruntime (pulled in by fastembed) needs libgomp1 at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY requirements.prod.txt .
RUN pip install --no-cache-dir -r requirements.prod.txt

# Phase 12: pre-download the embedding model into the image so cold starts
# don't hit HuggingFace + the production container has zero outbound deps.
ENV FASTEMBED_CACHE_PATH=/app/.fastembed_cache
RUN python -c "from fastembed import TextEmbedding; TextEmbedding(model_name='BAAI/bge-small-en-v1.5'); print('model baked into image')"

# Block runtime HuggingFace fetches as a privacy belt-and-suspenders.
ENV HF_HUB_OFFLINE=1
ENV TRANSFORMERS_OFFLINE=1

# Copy application code
COPY src/ src/

# Create fallback data dir (JSON file storage for unauthenticated mode)
RUN mkdir -p data/processed

# Non-root user; ensure it owns the cache + data dir
RUN adduser --disabled-password --no-create-home appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

ENV PORT=8000

CMD ["sh", "-c", "uvicorn src.api:app --host 0.0.0.0 --port $PORT"]
