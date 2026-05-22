# ── Stage 1: Frontend Build ────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Backend ───────────────────────────────────────────────────────
FROM python:3.11-slim
WORKDIR /app

# libpq-dev: required for psycopg2
# gcc: required to compile Python packages with native extensions
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist ./static

# Create socket directory for legacy gunicorn.conf.py deployments
RUN mkdir -p /run/restaurant

EXPOSE 10000

# Flask-SocketIO requires one Eventlet worker so admin realtime rooms stay coherent.
CMD ["sh", "-c", "gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:${PORT:-10000} 'app:create_app()'"]
