import multiprocessing
import os

# ---------------------------------------------------------------------------
# Worker model
# gevent is REQUIRED. gthread holds one thread per SSE connection indefinitely.
# With 4 workers × 2 threads = 8 max concurrent requests — 8 SSE clients
# deadlocks the entire API. gevent uses greenlets: thousands of concurrent
# SSE connections per worker, no thread exhaustion.
# ---------------------------------------------------------------------------
bind = os.getenv("GUNICORN_BIND", "unix:/run/restaurant/gunicorn.sock")
worker_class = "gevent"
workers = multiprocessing.cpu_count() * 2 + 1  # 3 on 1-core VPS, 5 on 2-core
worker_connections = 1000  # greenlets per worker — handles SSE + normal traffic

# ---------------------------------------------------------------------------
# Post-fork hook: Set worker ID so APScheduler can detect primary worker
# Only worker 0 runs the APScheduler background jobs
# ---------------------------------------------------------------------------
def post_fork(server, worker):
    worker_id = worker.number  # 0-indexed worker number
    os.environ["GUNICORN_WORKER_ID"] = str(worker_id)
    server.log.info(f"Worker {worker_id} forked with PID {worker.pid}")

# ---------------------------------------------------------------------------
# Timeouts
# timeout = 0 means Gunicorn never kills a worker for being slow.
# SSE connections are intentionally long-lived — a 30s timeout would kill them.
# graceful_timeout gives in-flight requests time to finish on restart/deploy.
# ---------------------------------------------------------------------------
timeout = 0
graceful_timeout = 30
keepalive = 5

# ---------------------------------------------------------------------------
# Memory leak protection
# Workers restart after this many requests. Jitter prevents all workers
# restarting simultaneously under load.
# ---------------------------------------------------------------------------
max_requests = 1000
max_requests_jitter = 150

# ---------------------------------------------------------------------------
# Performance
# /dev/shm is RAM-backed — faster than disk for worker heartbeat files.
# ---------------------------------------------------------------------------
worker_tmp_dir = "/dev/shm"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
accesslog = "-"
errorlog = "-"
loglevel = "info"
