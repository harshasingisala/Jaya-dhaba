import multiprocessing
import os

# Socket.IO rooms are in-process, so keep one eventlet worker on Render.
workers = 1
worker_class = "eventlet"
worker_connections = int(os.environ.get("GUNICORN_WORKER_CONNECTIONS", "2000"))
threads = 1

timeout = int(os.environ.get("GUNICORN_TIMEOUT", "120"))
keepalive = int(os.environ.get("GUNICORN_KEEPALIVE", "5"))
graceful_timeout = int(os.environ.get("GUNICORN_GRACEFUL_TIMEOUT", "30"))

bind = f"0.0.0.0:{os.environ.get('PORT', '5000')}"

accesslog = "-"
errorlog = "-"
loglevel = os.environ.get("GUNICORN_LOG_LEVEL", "warning")

max_requests = int(os.environ.get("GUNICORN_MAX_REQUESTS", "1000"))
max_requests_jitter = int(os.environ.get("GUNICORN_MAX_REQUESTS_JITTER", "100"))
preload_app = True

if os.path.isdir("/dev/shm"):  # nosec B108
    worker_tmp_dir = "/dev/shm"  # nosec B108


def post_fork(server, worker):
    os.environ["GUNICORN_WORKER_ID"] = str(worker.number)
    server.log.info("Worker %s forked with PID %s", worker.number, worker.pid)
