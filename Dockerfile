FROM python:3.13-slim

WORKDIR /app

# Install Python deps
COPY requirements.prod.txt .
RUN pip install --no-cache-dir -r requirements.prod.txt

# Copy application code
COPY src/ src/

# Create fallback data dir (JSON file storage for unauthenticated mode)
RUN mkdir -p data/processed

# Non-root user
RUN adduser --disabled-password --no-create-home appuser
USER appuser

EXPOSE 8000

ENV PORT=8000

CMD ["sh", "-c", "uvicorn src.api:app --host 0.0.0.0 --port $PORT"]
