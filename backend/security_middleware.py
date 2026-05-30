import secrets
import os
from flask import Flask, request, jsonify, make_response, current_app
from rate_limits import enforce_limit, request_limit, request_rule
from request_context import get_real_ip

CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"


def request_ip() -> str:
    return get_real_ip()


def init_security_middleware(app: Flask):
    
    @app.before_request
    def security_checks():
        if request.method == "OPTIONS":
            return None

        runtime_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
        if not current_app.config.get("TESTING") and runtime_env == "production":
            expected = current_app.config.get("CLOUDFLARE_TUNNEL_SECRET")
            if not expected or not secrets.compare_digest(request.headers.get("X-Cloudflare-Secret", ""), expected):
                return jsonify({"success": False, "message": "Forbidden"}), 403

        # 1. Rate Limiting (Global & Auth)
        if not current_app.config.get("TESTING"):
            if request.path.startswith("/socket.io"):
                return None
            if runtime_env == "development":
                return None
            ip = request_ip()
            if request.path.startswith("/api/auth/"):
                burst = enforce_limit(f"rate:auth-burst:{ip}", 3, 10)
                if burst:
                    return burst
                limit = enforce_limit(f"rate:auth:{ip}", 8, 60)
                if limit:
                    return limit

            route_max, route_window = request_limit()
            route_limit = enforce_limit(
                f"rate:route:{ip}:{request.method}:{request_rule()}",
                route_max,
                route_window,
            )
            if route_limit:
                return route_limit

            global_limit = enforce_limit(f"rate:global:{ip}", 500, 60)
            if global_limit:
                return global_limit

        # Reject non-JSON API mutations with a body before route code parses it.
        if (
            request.method not in ("GET", "HEAD", "OPTIONS", "TRACE")
            and request.path.startswith("/api/")
            and request.path not in ("/api/payments/webhook", "/api/csp-report")
            and (request.content_length or 0) > 0
            and request.mimetype not in {"application/json", "text/json"}
        ):
            return jsonify({"success": False, "message": "Content-Type must be application/json"}), 415

        # 2. CSRF Protection (Double Submit Cookie)
        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            # Webhooks are authenticated by provider signatures; chat remains public but rate limited.
            if request.path not in ("/api/payments/webhook", "/api/csp-report", "/api/jaya-concierge", "/api/chat", "/api/chat/"):
                cookie_token = request.cookies.get(CSRF_COOKIE)
                header_token = request.headers.get(CSRF_HEADER)
                
                if not cookie_token or not header_token or not secrets.compare_digest(cookie_token, header_token):
                    return jsonify({"message": "CSRF validation failed", "success": False}), 403

    @app.after_request
    def apply_security_headers(response):
        # 1. HSTS
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        
        # 2. CSP (Strict)
        csp = (
            "default-src 'self'; "
            "script-src 'self' https://checkout.razorpay.com https://cdn.razorpay.com https://cdnjs.cloudflare.com https://static.cloudflareinsights.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' https://api.jayadhaba.online https://*.supabase.co https://api.razorpay.com https://checkout.razorpay.com https://static.cloudflareinsights.com https://cloudflareinsights.com wss:; "
            "frame-src https://*.razorpay.com; "
            "frame-ancestors 'none'; "
            "object-src 'none'; "
            "base-uri 'self'; "
            "form-action 'self'; "
            "upgrade-insecure-requests; "
            "report-uri https://api.jayadhaba.online/api/csp-report;"
        )
        response.headers["Content-Security-Policy"] = csp
        
        # 3. Other Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), accelerometer=(), gyroscope=(), magnetometer=()"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"
        response.headers["Cross-Origin-Resource-Policy"] = "same-origin"
        response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
        response.headers["X-Download-Options"] = "noopen"
        if request.path.startswith("/api/auth/") or request.path.startswith("/api/admin/"):
            response.headers["Cache-Control"] = "no-store, max-age=0"
            response.headers["Pragma"] = "no-cache"
        if request.path.startswith("/api/"):
            origin = request.headers.get("Origin")
            allowed_origins = current_app.config.get("CORS_ORIGINS_RESOLVED") or []
            if origin in allowed_origins:
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Credentials"] = "true"
                response.headers["Vary"] = "Origin"
                response.headers["Access-Control-Allow-Headers"] = "Content-Type, X-CSRF-Token, Authorization, Idempotency-Key"
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers.pop("X-Powered-By", None)
        response.headers.pop("Server", None)
        
        return response


def generate_csrf_token():
    return secrets.token_urlsafe(32)
