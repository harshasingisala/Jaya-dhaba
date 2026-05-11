# Security Audit

Implemented controls:

- Parameterized SQLite queries with `?` placeholders.
- CI grep blocks `execute(f` and obvious committed secret patterns.
- JWT access tokens expire in 15 minutes; refresh tokens expire in 7 days.
- Refresh token rotation deletes the old session row.
- RBAC roles: `guest`, `customer`, `staff`, `admin`.
- Brute-force protection stores login attempts and `locked_until` in `users`.
- Double-submit CSRF cookie/header on every mutating request except the Razorpay webhook.
- Flask-Limiter memory storage with route-specific login/order/chat limits and `Retry-After`.
- IDOR prevention for `/api/orders/:id` using owner, staff/admin role, or guest public token.
- Razorpay webhook signature verification uses the raw request body and `X-Razorpay-Signature`.
- Razorpay replay rejection uses `X-Razorpay-Event-Id`/event identity plus local payment reference uniqueness.
- Append-only audit log enforced by SQLite triggers.
- Security headers on every response, including HSTS and CSP.
- Sentry backend/frontend hooks are environment-gated.

Verification:

```bash
python -m pytest backend/tests/ --tb=short -q
npm --prefix frontend run build
grep -rn "execute(f" backend/ && exit 1 || true
grep -rn "sk_live_\|sk_test_\|AKIA\|hardcoded_secret" backend/ && exit 1 || true
```

Residual live checks require the operator domain, VPS, Razorpay webhook, Sentry DSN, Cloudflare account, and UptimeRobot account.
