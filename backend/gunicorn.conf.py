import os

# ---------------------------------------------------------------------------
# Worker model
# Eventlet is required for Flask-SocketIO on Render. Keep one worker so
# Socket.IO rooms and in-memory emits stay coherent for all admin clients.
# ---------------------------------------------------------------------------
bind = os.getenv("GUNICORN_BIND", f"0.0.0.0:{os.getenv('PORT', '10000')}")
worker_class = "eventlet"
workers = 1
worker_connections = 1000

# ---------------------------------------------------------------------------
# Post-fork hook: Set worker ID so APScheduler can detect primary worker.
# ---------------------------------------------------------------------------
def post_fork(server, worker):
    worker_id = worker.number
    os.environ["GUNICORN_WORKER_ID"] = str(worker_id)
    server.log.info(f"Worker {worker_id} forked with PID {worker.pid}")


# ---------------------------------------------------------------------------
# Timeouts
# timeout = 0 means Gunicorn never kills a worker for being slow.
# SSE connections are intentionally long-lived.
# ---------------------------------------------------------------------------
timeout = 0
graceful_timeout = 30
keepalive = 5

# ---------------------------------------------------------------------------
# Memory leak protection
# ---------------------------------------------------------------------------
max_requests = 1000
max_requests_jitter = 150

# ---------------------------------------------------------------------------
# Performance
# ---------------------------------------------------------------------------
worker_tmp_dir = "/dev/shm"

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
accesslog = "-"
errorlog = "-"
loglevel = "info"
