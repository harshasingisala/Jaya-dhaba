import secrets
import os
from flask import Flask, request, jsonify, make_response, current_app
from rate_limits import enforce_limit

CSRF_COOKIE = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"


def request_ip() -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return forwarded or request.remote_addr or "0.0.0.0"


def init_security_middleware(app: Flask):
    
    @app.before_request
    def security_checks():
        # 1. Rate Limiting (Global & Auth)
        if not current_app.config.get("TESTING"):
            if request.method == "OPTIONS" or request.path.startswith("/socket.io"):
                return None
            runtime_env = (os.getenv("APP_ENV") or os.getenv("FLASK_ENV") or "").lower()
            if runtime_env == "development":
                return None
            ip = request_ip()
            if request.path.startswith("/api/auth/"):
                limit = enforce_limit(f"rate:auth:{ip}", 20, 60)
                if limit: return limit
            else:
                limit = enforce_limit(f"rate:global:{ip}", 500, 60)
                if limit: return limit

        # 2. CSRF Protection (Double Submit Cookie)
        if request.method not in ("GET", "HEAD", "OPTIONS", "TRACE"):
            # Webhooks are authenticated by provider signatures; chat remains public but rate limited.
            if request.path not in ("/api/payments/webhook", "/api/jaya-concierge", "/api/chat", "/api/chat/"):
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
            "script-src 'self' https://checkout.razorpay.com https://cdnjs.cloudflare.com; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "img-src 'self' data: blob: https:; "
            "connect-src 'self' https://api.razorpay.com; "
            "frame-src 'self' https://api.razorpay.com; "
            "frame-ancestors 'none'; "
            "object-src 'none'; "
            "base-uri 'self';"
        )
        response.headers["Content-Security-Policy"] = csp
        
        # 3. Other Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if request.path.startswith("/api/auth/") or request.path.startswith("/api/admin/"):
            response.headers["Cache-Control"] = "no-store, max-age=0"
            response.headers["Pragma"] = "no-cache"
        response.headers.pop("X-Powered-By", None)
        response.headers.pop("Server", None)
        
        return response


def generate_csrf_token():
    return secrets.token_urlsafe(32)
