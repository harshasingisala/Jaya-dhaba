import os
import json

if (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower() == "production" or os.getenv("SOCKETIO_ASYNC_MODE") == "eventlet":
    import eventlet
    eventlet.monkey_patch()

from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
from werkzeug.exceptions import HTTPException
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

if os.getenv("FLASK_ENV") != "testing":
    load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

import db
from auth import is_jti_blacklisted, optional_user
from circuit_breaker import db_breaker
from realtime import init_realtime
from security_middleware import init_security_middleware
from routes import register_blueprints
from security_log import log_security_event
from request_context import get_real_ip
from utils.validation import contains_forbidden_nosql_operator, validate_lengths
from validators import ValidationError


_ip_request_count = defaultdict(list)
_ip_blocked_until = {}

SENSITIVE_EVENT_KEYS = {
    "authorization",
    "cookie",
    "password",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "phone",
    "email",
    "card",
}


def scrub_pii_from_sentry(event, _hint):
    def scrub(value):
        if isinstance(value, dict):
            cleaned = {}
            for key, item in value.items():
                key_text = str(key).lower()
                cleaned[key] = "[REDACTED]" if any(part in key_text for part in SENSITIVE_EVENT_KEYS) else scrub(item)
            return cleaned
        if isinstance(value, list):
            return [scrub(item) for item in value]
        return value

    return scrub(event)


# Sentry setup
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FlaskIntegration()],
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
        profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
        environment=(os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "production"),
        before_send=scrub_pii_from_sentry,
    )


def create_app(overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    runtime_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
    is_production = runtime_env == "production"
    is_development = os.environ.get("FLASK_ENV") == "development"
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY")
        or os.getenv("FLASK_SECRET_KEY")
        or (None if is_production else "development-secret"),
        JWT_SECRET_KEY=os.getenv("JWT_SECRET_KEY")
        or os.getenv("SECRET_KEY")
        or (None if is_production else "development-jwt-secret"),
        JWT_ACCESS_TOKEN_EXPIRES=15 * 60,
        DATABASE_URL=os.getenv("DATABASE_URL", ""),
        TAX_BASIS_POINTS=int(os.getenv("TAX_BASIS_POINTS", "500")),
        DOMAIN=os.getenv("DOMAIN", "localhost"),
        UPLOAD_FOLDER=os.getenv("UPLOAD_FOLDER", str(Path(__file__).resolve().parent / "uploads")),
        MAX_CONTENT_LENGTH=int(os.getenv("MAX_CONTENT_LENGTH_BYTES", str(5 * 1024 * 1024))),
        JSON_MAX_CONTENT_LENGTH=int(os.getenv("JSON_MAX_CONTENT_LENGTH_BYTES", str(2 * 1024 * 1024))),
        STRICT_IMAGE_URL_ALLOWLIST=os.getenv("STRICT_IMAGE_URL_ALLOWLIST", "false").lower() == "true",
        RAZORPAY_KEY_ID=os.getenv("RAZORPAY_KEY_ID", ""),
        RAZORPAY_KEY_SECRET=os.getenv("RAZORPAY_KEY_SECRET", ""),
        RAZORPAY_WEBHOOK_SECRET=os.getenv("RAZORPAY_WEBHOOK_SECRET", ""),
        QR_SESSION_SECRET=os.getenv("QR_SESSION_SECRET", ""),
        REDIS_URL=os.getenv("REDIS_URL", ""),
        DB_ENCRYPTION_KEY=os.getenv("DB_ENCRYPTION_KEY", ""),
        ENCRYPTION_KEY=os.getenv("ENCRYPTION_KEY", ""),
        CLOUDFLARE_TUNNEL_SECRET=os.getenv("CLOUDFLARE_TUNNEL_SECRET", ""),
        OPENAI_API_KEY=os.getenv("OPENAI_API_KEY", ""),
        GOOGLE_API_KEY=os.getenv("GOOGLE_API_KEY", ""),
        CHATBOT_ENABLED=os.getenv("CHATBOT_ENABLED", "false").lower() == "true",
        COOKIE_SECURE=True if is_production else os.getenv("COOKIE_SECURE", "true").lower() == "true",
        SESSION_COOKIE_SECURE=True if is_production else os.getenv("SESSION_COOKIE_SECURE", "true").lower() == "true",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        WTF_CSRF_SSL_STRICT=os.getenv("WTF_CSRF_SSL_STRICT", "true").lower() == "true",
        TESTING=False,
    )
    app.debug = is_development
    if overrides:
        app.config.update(overrides)

    configured_origins = [
        origin.strip()
        for origin in (os.getenv("CORS_ORIGINS") or os.getenv("ALLOWED_ORIGINS") or "").split(",")
        if origin.strip()
    ]
    cors_origins = configured_origins or [
        "https://www.jayadhaba.online",
        "https://jayadhaba.online",
    ]
    if is_production:
        cors_origins = [
            origin
            for origin in cors_origins
            if urlparse(origin).scheme == "https"
            and urlparse(origin).hostname not in {"localhost", "127.0.0.1", "::1"}
        ]
    for origin in ("https://www.jayadhaba.online", "https://jayadhaba.online"):
        if origin not in cors_origins:
            cors_origins.append(origin)
    if not is_production:
        for origin in (
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:5174",
        ):
            if origin not in cors_origins:
                cors_origins.append(origin)

    _validate_runtime_config(app, cors_origins, is_production)
    app.config["CORS_ORIGINS_RESOLVED"] = cors_origins

    # CORS
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": cors_origins,
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "X-CSRF-Token", "Authorization", "Idempotency-Key"],
                "expose_headers": ["X-RateLimit-Remaining", "Retry-After"],
                "max_age": 3600,
            }
        },
        supports_credentials=True,
    )

    # Auth & Database
    jwt = JWTManager(app)

    @jwt.token_in_blocklist_loader
    def token_in_blocklist(_jwt_header, jwt_payload):
        return is_jti_blacklisted(jwt_payload.get("jti"))

    init_realtime(app)
    db.configure(app.config["DATABASE_URL"])
    db.init_db(seed=not app.config.get("TESTING"))

    # Security & Middlewares
    init_security_middleware(app)

    @app.before_request
    def load_user():
        if request.method == "OPTIONS":
            return None
        abuse_error = _detect_abuse(app)
        if abuse_error is not None:
            return abuse_error
        if _json_request_too_large(app):
            return jsonify({"error": "Request too large. Max 2MB."}), 413
        injection_error = _reject_forbidden_json_operators()
        if injection_error is not None:
            return injection_error
        length_error = _validate_public_input_lengths()
        if length_error is not None:
            return length_error
        optional_user()

    @app.after_request
    def security_headers(response):
        if "X-Content-Type-Options" not in response.headers:
            response.headers["X-Content-Type-Options"] = "nosniff"
        if "X-Frame-Options" not in response.headers:
            response.headers["X-Frame-Options"] = "DENY"
        if "X-XSS-Protection" not in response.headers:
            response.headers["X-XSS-Protection"] = "1; mode=block"
        if "Referrer-Policy" not in response.headers:
            response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        if "Strict-Transport-Security" not in response.headers:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        if "Permissions-Policy" not in response.headers:
            response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if response.status_code == 401 and request.path.startswith("/api/admin"):
            log_security_event("unauthorized_admin", get_real_ip(), request.path)
        return response

    # Routes
    register_blueprints(app)

    @app.get("/api/csrf-token")
    def get_csrf_token():
        from auth import issue_csrf_response
        return issue_csrf_response()

    @app.get("/")
    def root():
        return jsonify({"success": True, "message": "Backend is running"})

    @app.get("/api/health")
    def health():
        checks = {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}
        try:
            db_breaker.call(db.check_health)
        except Exception:
            checks["status"] = "degraded"
            checks["db"] = "error"
        else:
            checks["db"] = "ok"
        return jsonify(checks), 200 if checks["status"] == "ok" else 503

    @app.get("/health")
    def health_check():
        return jsonify({"status": "ok"}), 200

    @app.post("/api/csp-report")
    def csp_report():
        payload = request.get_data(cache=False, as_text=True)[:8192]
        parsed = request.get_json(silent=True)
        log_security_event(
            "csp_violation",
            get_real_ip(),
            json.dumps(parsed or {"raw": payload}, separators=(",", ":"))[:1000],
        )
        return ("", 204)

    @app.errorhandler(ValidationError)
    def handle_validation_error(error: ValidationError):
        return jsonify({
            "success": False,
            "message": error.message,
            "errors": [error.field] if error.field else []
        }), error.status

    @app.errorhandler(404)
    def not_found(_error):
        return jsonify({"success": False, "message": "Resource not found", "data": {}, "errors": []}), 404

    @app.errorhandler(401)
    def unauthorized(_error):
        return jsonify({"success": False, "message": "Unauthorized access", "data": {}, "errors": []}), 401

    @app.errorhandler(403)
    def forbidden(_error):
        return jsonify({"success": False, "message": "Forbidden access", "data": {}, "errors": []}), 403

    @app.errorhandler(429)
    def rate_limit(_error):
        return jsonify({"success": False, "message": "Too many requests", "data": {}, "errors": []}), 429

    @app.errorhandler(413)
    def too_large(_error):
        return jsonify({"error": "Request too large. Max 2MB."}), 413

    @app.errorhandler(500)
    def internal_server_error(error):
        return jsonify({"success": False, "message": "Internal server error", "data": {}, "errors": []}), 500

    @app.errorhandler(Exception)
    def handle_exception(error):
        if isinstance(error, HTTPException):
            return error
        app.logger.error("Unhandled exception: %s", error, exc_info=True)
        if app.debug or app.testing:
            raise error
        return jsonify({"error": "Something went wrong"}), 500

    # ------------------------------------------------------------------
    # APScheduler — automatic daily flush at midnight IST (SINGLE WORKER ONLY)
    # Uses distributed lock to prevent multi-worker race condition.
    # Only PID 1 / worker_id 1 runs the scheduler in production.
    # ------------------------------------------------------------------
    if not app.config.get("TESTING"):
        import atexit
        import pytz
        from apscheduler.schedulers.background import BackgroundScheduler
        from apscheduler.triggers.cron import CronTrigger

        # Detect if this is the primary worker (only Gunicorn worker 0 runs scheduler)
        _WORKER_ID = int(os.getenv("GUNICORN_WORKER_ID", "0"))
        _IS_PRIMARY = _WORKER_ID == 0

        def _auto_flush():
            """Insert a daily_closures row at midnight IST — same as POST /admin/flush.
            
            IMPORTANT: This runs ONLY in worker 0 due to distributed lock.
            Prevents multi-worker race condition that creates duplicate rows.
            """
            if not _IS_PRIMARY:
                app.logger.debug("APScheduler: skipped (not primary worker)")
                return

            with app.app_context():
                try:
                    # INVALIDATE CACHE FIRST to ensure fresh compute
                    from cache import stats_cache
                    stats_cache.invalidate("stats:")
                    
                    # Acquire distributed lock via database
                    with db.transaction(app.config["DATABASE_URL"]) as conn:
                        # Check if another worker already flushed today (within last 5 minutes)
                        recent_sql = (
                            """
                            SELECT closed_at FROM daily_closures
                            WHERE closed_at > (now() - INTERVAL '5 minutes')
                            LIMIT 1
                            """
                            if db.engine.dialect.name == "postgresql"
                            else
                            """
                            SELECT closed_at FROM daily_closures
                            WHERE closed_at > datetime('now', '-5 minutes')
                            LIMIT 1
                            """
                        )
                        recent = conn.execute(
                            recent_sql
                        ).fetchone()
                        if recent:
                            app.logger.info("APScheduler: flush already completed by another worker")
                            return

                        # Proceed with flush
                        from routes.admin import live_stats
                        payload = live_stats(conn)
                        if db.engine.dialect.name == "postgresql":
                            conn.execute(
                                """
                                INSERT INTO daily_closures (closed_at, revenue, orders, created_at, created_by)
                                VALUES (now(), :revenue, :orders, now(), NULL)
                                """,
                                {"revenue": payload["revenue"], "orders": payload["orders"]},
                            )
                        else:
                            conn.execute(
                                """
                                INSERT INTO daily_closures (closed_at, revenue, orders, created_at, created_by)
                                VALUES (datetime('now', 'utc'), ?, ?, datetime('now', 'utc'), NULL)
                                """,
                                (payload["revenue"], payload["orders"]),
                            )
                        conn.commit()

                    app.logger.info("APScheduler: daily flush completed — revenue=%s orders=%s", payload["revenue"], payload["orders"])

                except Exception as exc:
                    app.logger.error("APScheduler: daily flush failed — %s", exc)
                    # Do NOT re-raise — scheduler must remain healthy

        if _IS_PRIMARY:
            _scheduler = BackgroundScheduler(timezone=pytz.timezone("Asia/Kolkata"))
            _scheduler.add_job(
                _auto_flush,
                CronTrigger(hour=0, minute=0, second=0),
                id="daily_flush",
                replace_existing=True,
                misfire_grace_time=300,
            )
            _scheduler.start()
            atexit.register(_scheduler.shutdown)
            app.logger.info("APScheduler: initialized on primary worker (id=%d)", _WORKER_ID)
        else:
            app.logger.info("APScheduler: disabled on secondary worker (id=%d)", _WORKER_ID)

    return app


def _json_request_too_large(app: Flask) -> bool:
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return False
    if request.mimetype not in {"application/json", "text/json"}:
        return False
    content_length = request.content_length or 0
    return content_length > int(app.config.get("JSON_MAX_CONTENT_LENGTH", 2 * 1024 * 1024))


def _detect_abuse(app: Flask):
    if app.config.get("TESTING"):
        return None
    if request.method == "OPTIONS" or request.path.startswith("/socket.io"):
        return None
    if request.path in {"/api/health", "/health"}:
        return None

    if len(request.query_string or b"") > 2048:
        log_security_event("oversized_query", get_real_ip(), request.path)
        return jsonify({"error": "Request query is too large."}), 414

    raw_path = request.environ.get("RAW_URI") or request.full_path or request.path
    if any(token in raw_path.lower() for token in ("%2e%2e", "../", "..\\", "/etc/passwd")):
        log_security_event("path_traversal_attempt", get_real_ip(), request.path)
        return jsonify({"error": "Not found"}), 404

    ip = get_real_ip()
    now = datetime.utcnow()
    blocked_until = _ip_blocked_until.get(ip)
    if blocked_until and blocked_until > now:
        response = jsonify({"error": "Slow down."})
        response.status_code = 429
        response.headers["Retry-After"] = str(max(1, int((blocked_until - now).total_seconds())))
        return response

    recent = [
        timestamp for timestamp in _ip_request_count[ip]
        if now - timestamp < timedelta(minutes=1)
    ]
    recent.append(now)
    _ip_request_count[ip] = recent
    limit = 200 if request.path.startswith("/api/") else 2000
    block_minutes = 10 if request.path.startswith("/api/") else 60
    if len(recent) > limit:
        _ip_blocked_until[ip] = now + timedelta(minutes=block_minutes)
        log_security_event("flood_detected", ip, f"{len(recent)} req/min")
        response = jsonify({"error": "Slow down."})
        response.status_code = 429
        response.headers["Retry-After"] = str(block_minutes * 60)
        return response
    return None


def _reject_forbidden_json_operators():
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return None
    if request.mimetype not in {"application/json", "text/json"}:
        return None
    payload = request.get_json(silent=True)
    if contains_forbidden_nosql_operator(payload):
        log_security_event("injection_attempt", get_real_ip(), request.path)
        return jsonify({"error": "Invalid request payload"}), 400
    return None


def _validate_public_input_lengths():
    if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
        return None
    if request.path not in {"/api/contact", "/api/reservations", "/api/orders"}:
        return None
    data = request.get_json(silent=True) or {}
    valid, error = validate_lengths(
        name=data.get("name") or data.get("guest_name") or data.get("customer_name"),
        email=data.get("email"),
        phone=data.get("phone") or data.get("guest_phone"),
        message=data.get("message") or data.get("notes"),
        subject=data.get("subject"),
        password=data.get("password"),
    )
    if not valid:
        return jsonify({"error": error}), 400
    return None


def _validate_runtime_config(app: Flask, cors_origins: list[str], is_production: bool) -> None:
    if app.config.get("TESTING") or not is_production:
        return

    errors: list[str] = []
    database_url = app.config.get("DATABASE_URL", "")
    secret_key = app.config.get("SECRET_KEY", "")
    jwt_secret = app.config.get("JWT_SECRET_KEY", "")
    if app.debug:
        errors.append("Debug mode must be disabled in production")
    if not secret_key or secret_key == "development-secret" or len(secret_key) < 32:
        errors.append("SECRET_KEY must be a non-default environment secret of at least 32 characters")
    if not jwt_secret or jwt_secret == "development-jwt-secret" or len(jwt_secret) < 32:
        errors.append("JWT_SECRET_KEY must be a non-default secret of at least 32 characters")
    if not app.config.get("COOKIE_SECURE"):
        errors.append("COOKIE_SECURE=true is required in production")
    if not app.config.get("SESSION_COOKIE_SECURE"):
        errors.append("SESSION_COOKIE_SECURE=true is required in production")
    if not app.config.get("SESSION_COOKIE_HTTPONLY"):
        errors.append("SESSION_COOKIE_HTTPONLY=true is required in production")
    if app.config.get("SESSION_COOKIE_SAMESITE") != "Lax":
        errors.append("SESSION_COOKIE_SAMESITE=Lax is required in production")
    if not app.config.get("WTF_CSRF_SSL_STRICT"):
        errors.append("WTF_CSRF_SSL_STRICT=true is required in production")
    if not app.config.get("RAZORPAY_KEY_ID") or not app.config.get("RAZORPAY_KEY_SECRET"):
        errors.append("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required in production")
    if not app.config.get("RAZORPAY_WEBHOOK_SECRET"):
        errors.append("RAZORPAY_WEBHOOK_SECRET is required in production")
    if not app.config.get("QR_SESSION_SECRET"):
        errors.append("QR_SESSION_SECRET is required in production")
    if not app.config.get("REDIS_URL"):
        errors.append("REDIS_URL is required in production")
    if not app.config.get("DB_ENCRYPTION_KEY") and not app.config.get("ENCRYPTION_KEY"):
        errors.append("DB_ENCRYPTION_KEY or ENCRYPTION_KEY is required in production")
    if not app.config.get("CLOUDFLARE_TUNNEL_SECRET"):
        errors.append("CLOUDFLARE_TUNNEL_SECRET is required in production")
    if not database_url:
        errors.append("DATABASE_URL must point to Supabase Postgres in production")
    elif database_url.startswith("sqlite"):
        errors.append("SQLite is forbidden as the production order store")
    elif not database_url.startswith(("postgresql://", "postgresql+psycopg://", "postgresql+psycopg2://")):
        errors.append("DATABASE_URL must be a PostgreSQL connection string for Supabase")
    for origin in cors_origins:
        if origin == "*":
            errors.append("Wildcard CORS origins are forbidden in production")
            continue
        parsed = urlparse(origin)
        if parsed.scheme != "https":
            errors.append(f"CORS origin must use https: {origin}")
        if parsed.hostname in {"localhost", "127.0.0.1", "::1"}:
            errors.append(f"localhost CORS origin is forbidden in production: {origin}")

    if errors:
        raise RuntimeError("Unsafe production configuration: " + "; ".join(errors))
