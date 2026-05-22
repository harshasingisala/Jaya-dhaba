import os
from pathlib import Path
from urllib.parse import urlparse

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv
import sentry_sdk
from sentry_sdk.integrations.flask import FlaskIntegration

if os.getenv("FLASK_ENV") != "testing":
    load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / ".env")

import db
from auth import optional_user
from realtime import init_realtime
from security_middleware import init_security_middleware
from routes import register_blueprints
from validators import ValidationError

# Sentry setup
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[FlaskIntegration()],
        traces_sample_rate=1.0,
        profiles_sample_rate=1.0,
    )


def create_app(overrides: dict | None = None) -> Flask:
    app = Flask(__name__)
    runtime_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
    is_production = runtime_env == "production"
    is_development = os.environ.get("FLASK_ENV") == "development"
    app.config.update(
        SECRET_KEY=os.getenv("SECRET_KEY")
        or (os.getenv("FLASK_SECRET_KEY") if not is_production else None)
        or (None if is_production else "development-secret"),
        JWT_SECRET_KEY=os.getenv("JWT_SECRET_KEY")
        or (None if is_production else "development-jwt-secret"),
        JWT_ACCESS_TOKEN_EXPIRES=15 * 60,
        DATABASE_URL=os.getenv("DATABASE_URL", ""),
        TAX_BASIS_POINTS=int(os.getenv("TAX_BASIS_POINTS", "500")),
        DOMAIN=os.getenv("DOMAIN", "localhost"),
        UPLOAD_FOLDER=os.getenv("UPLOAD_FOLDER", str(Path(__file__).resolve().parent / "uploads")),
        RAZORPAY_KEY_ID=os.getenv("RAZORPAY_KEY_ID", ""),
        RAZORPAY_KEY_SECRET=os.getenv("RAZORPAY_KEY_SECRET", ""),
        RAZORPAY_WEBHOOK_SECRET=os.getenv("RAZORPAY_WEBHOOK_SECRET", ""),
        OPENAI_API_KEY=os.getenv("OPENAI_API_KEY", ""),
        GOOGLE_API_KEY=os.getenv("GOOGLE_API_KEY", ""),
        CHATBOT_ENABLED=os.getenv("CHATBOT_ENABLED", "false").lower() == "true",
        COOKIE_SECURE=os.getenv("COOKIE_SECURE", "true").lower() == "true",
        SESSION_COOKIE_SECURE=os.getenv("SESSION_COOKIE_SECURE", "true").lower() == "true",
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
        for origin in os.getenv("CORS_ORIGINS", "").split(",")
        if origin.strip()
    ]
    cors_origins = configured_origins or [
        "https://www.jayadhaba.online",
        "https://jayadhaba.online",
    ]
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

    # CORS
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": cors_origins,
                "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "X-CSRF-Token", "Authorization", "Idempotency-Key"],
            }
        },
        supports_credentials=True,
    )

    # Auth & Database
    JWTManager(app)
    init_realtime(app)
    db.configure(app.config["DATABASE_URL"])
    db.init_db(seed=not app.config.get("TESTING"))

    # Security & Middlewares
    init_security_middleware(app)

    @app.before_request
    def load_user():
        if request.method == "OPTIONS":
            return None
        optional_user()

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
        return jsonify({"status": "ok", "version": "1.0.0"}), 200

    @app.get("/health")
    def health_check():
        return jsonify({"status": "ok", "version": "1.0.0"}), 200

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

    @app.errorhandler(500)
    def internal_server_error(error):
        return jsonify({"success": False, "message": "Internal server error", "data": {}, "errors": []}), 500

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
                        recent = conn.execute(
                            """
                            SELECT closed_at FROM daily_closures 
                            WHERE closed_at > datetime('now', '-5 minutes')
                            LIMIT 1
                            """
                        ).fetchone()
                        if recent:
                            app.logger.info("APScheduler: flush already completed by another worker")
                            return

                        # Proceed with flush
                        from routes.admin import live_stats
                        payload = live_stats(conn)
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


def _validate_runtime_config(app: Flask, cors_origins: list[str], is_production: bool) -> None:
    if app.config.get("TESTING") or not is_production:
        return

    errors: list[str] = []
    database_url = app.config.get("DATABASE_URL", "")
    secret_key = app.config.get("SECRET_KEY", "")
    jwt_secret = app.config.get("JWT_SECRET_KEY", "")
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
    if not database_url:
        errors.append("DATABASE_URL must point to Supabase Postgres in production")
    elif database_url.startswith("sqlite"):
        errors.append("SQLite is forbidden as the production order store")
    elif not database_url.startswith(("postgresql://", "postgresql+psycopg://", "postgresql+psycopg2://")):
        errors.append("DATABASE_URL must be a PostgreSQL connection string for Supabase")
    if app.config.get("DOMAIN") in {"", "localhost", "127.0.0.1"}:
        errors.append("DOMAIN must be the production hostname")
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
