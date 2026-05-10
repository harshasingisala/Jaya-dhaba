# Jaya Dhaba — Enterprise Management System

## 🌟 Overview
A production-grade restaurant management system built for high-concurrency, security, and premium user experience.

## 🏗️ Architecture
- **Backend**: Flask (Python 3.11) with SQLAlchemy 2.0.
- **Frontend**: React (Vite) + Tailwind CSS + Framer Motion.
- **Database**: PostgreSQL (Production) / SQLite (Development).
- **Caching/Rate-Limiting**: Redis (Optional, sliding window in-memory fallback).
- **Communication**: JWT (Asymmetric RS256 capable) + Server-Sent Events (SSE) for real-time kitchen updates.

## 🔐 8-Layer Security Framework
1. **Identity**: Argon2id password hashing + strict regex validation.
2. **Tokens**: Short-lived Access Tokens + Refresh Token Rotation.
3. **MFA**: Optional/Mandatory TOTP for administrative roles.
4. **RBAC**: Rank-based access control (Owner > Manager > Staff > Customer).
5. **Session**: Metadata tracking (IP/Fingerprint) + 3-session concurrency limit.
6. **Brute Force**: Automatic 15-minute lockout after 5 failed attempts + Optimistic Locking (`version` field).
7. **Audit**: Immutable, append-only `audit_log` with Postgres triggers.
8. **Integrity**: Double Submit Cookie CSRF protection + Strict CSP/HSTS/XSS headers.

## 📦 Core Modules
1. **Customer Menu**: 3D model support + Category-based dynamic GST.
2. **Order System**: Idempotent order placement + realtime status tracking.
3. **Inventory**: Auto-stock deduction + movement ledger.
4. **Staff Management**: Role management + Shift clocking.
5. **Kitchen Display**: Real-time order stream for chefs.
6. **Billing**: Dynamic tax calculation + PDF bill generation.

## 🚀 Deployment
### Local Development
```bash
cd backend
pip install -r requirements.txt
flask run

cd ../frontend
npm install
npm run dev
```

### Production (Docker)
```bash
docker-compose up --build
```

## 🧪 Testing
Run the audit suite:
```bash
pytest --cov=backend --cov-fail-under=80
bandit -r backend/
```

## 📜 API Documentation
All endpoints use the standardized JSON envelope:
```json
{
  "success": true,
  "message": "Operation description",
  "data": { ... }
}
```
*Full Swagger documentation available at `/api/docs` (in progress).*
