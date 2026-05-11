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
# gcc: required to compile gevent's C extensions
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=frontend-builder /app/frontend/dist ./static

# Create socket directory — gunicorn.conf.py binds to unix socket here
RUN mkdir -p /run/restaurant

EXPOSE 5000

ENV GUNICORN_BIND=0.0.0.0:5000

# Use gunicorn.conf.py — do NOT pass worker flags here, the conf file owns them
CMD ["gunicorn", "-c", "gunicorn.conf.py", "app:create_app()"]
