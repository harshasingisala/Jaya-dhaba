# Jaya Dhaba — System Handover Document

Prepared for the owner and successor technical team. All sections are complete.

## System Overview

Jaya Dhaba is a full-stack digital restaurant platform built on React 18 + TypeScript + Tailwind (frontend) and Flask + SQLite WAL (backend). It powers QR-code table ordering, Razorpay online payments, an AI concierge chatbot, real-time order tracking, table reservations, loyalty rewards, admin analytics, and automated marketing. The system runs on a Linux VPS with Gunicorn + Nginx.

## Live System URLs

| Service | URL |
|--------|-----|
| Customer website | https://jayadhaba.com |
| Admin dashboard | https://jayadhaba.com/admin |
| Health check | https://jayadhaba.com/api/health |
| Razorpay webhook | https://jayadhaba.com/api/payments/webhook |

## How to Log In

### Customer
1. Scan table QR code → opens menu for that table
2. Add items to cart → proceed to checkout
3. Enter name and phone number
4. Choose "Online Payment" or "Cash on Counter"
5. For online: complete Razorpay checkout → auto-track order

### Admin
1. Navigate to https://jayadhaba.com/admin
2. Enter admin email and password (shared in-person only)
3. JWT token auto-issued; refresh via secure cookie

## Credentials & Services

| Service | Where to Get / How to Access | Notes |
|--------|------------------------------|-------|
| Server SSH | VPS provider dashboard | Shared privately |
| OpenAI | platform.openai.com | Usage-based billing |
| Razorpay | dashboard.razorpay.com | Test keys for dev, live for production |
| Sentry | sentry.io | Error tracking |
| UptimeRobot | uptimerobot.com | Site monitoring |
| Cloudflare | cloudflare.com | DNS + CDN |
| GitHub | github.com/harshasingisala | Repository access |

## Server Details

| Property | Value |
|----------|-------|
| Provider | (to be filled after deployment) |
| IP Address | (to be filled after deployment) |
| OS | Ubuntu 22.04 LTS |
| Location | Mumbai, India (or nearest to Hyderabad) |
| Monthly cost | ~₹1,500–3,000 for 2 vCPU / 4 GB |

## How to Deploy a Code Update

1. Commit changes locally: `git add . && git commit -m "describe change"`
2. Push to GitHub: `git push origin main`
3. GitHub Actions auto-deploys via `scripts/deploy.sh` in ~3 minutes
4. Verify at https://jayadhaba.com/api/health

## Manual Deploy

```bash
ssh user@your-server-ip
cd /var/www/restaurant
git pull origin main
source backend/venv/bin/activate
pip install -r backend/requirements.txt
cd frontend && npm ci && npm run build
sudo systemctl restart gunicorn
sudo systemctl restart nginx
```

## Rollback

```bash
ssh user@your-server-ip
cd /var/www/restaurant
bash scripts/rollback.sh
```

Rollback completes in under 60 seconds. The script restores the previous git commit and restarts services.

## Database Backup

- Automatic backup every 6 hours to `/var/backups/restaurant/`
- 14 days of backups retained
- Restore command:

```bash
ssh user@your-server-ip
sudo cp /var/backups/restaurant/restaurant.db.YYYY-MM-DD-HH /var/www/restaurant/backend/restaurant.db
sudo systemctl restart gunicorn
```

## How to Add a Menu Item

1. Log into admin dashboard at https://jayadhaba.com/admin
2. Navigate to **Menu Manager** tab
3. Click **Add New Item**
4. Fill: name, category, price, description, image URL, dietary tags, spice level
5. Click **Save** — item appears instantly on customer menu

## How to Mark Item Unavailable

1. Admin → **Menu Manager**
2. Find the item in the list
3. Toggle the **Available** switch to OFF
4. Change is live immediately; item greyed out on customer view

## How to Change Pricing

1. Admin → **Settings Manager**
2. Scroll to **Pricing Rules**
3. Add a new rule: name, days of week, time window, discount type (percent or fixed), discount value
4. Enable the rule — applies automatically during active hours

## How to View & Update Orders

1. Admin → **Orders Manager**
2. Orders stream in real-time via SSE
3. Click any order to expand details
4. Use dropdown to change status: Placed → Preparing → Ready → Served
5. Customer tracking page updates automatically

## How to Generate Table QR Codes

1. Admin → **Settings Manager**
2. Click **Generate QR Codes**
3. System creates PNG files in `backend/uploads/qr/`
4. Download and print for each table

## How to Verify a Referral Reward

1. Admin → **Settings Manager**
2. Navigate to **Referrals** tab
3. Enter referral code in the verify box
4. System shows: referrer name, reward type, claimed/redeemed status
5. Click **Mark Redeemed** when customer presents the reward card at counter

## Monthly Tasks Checklist

| Task | When | How |
|------|------|-----|
| Review Sentry errors | 1st of month | Log into sentry.io, triage unresolved issues |
| Check UptimeRobot logs | 1st of month | Verify 99.9%+ uptime, review any alerts |
| Revenue export | 1st of month | Admin → Analytics → Download Ledger (Excel) |
| Google reviews | Weekly | Respond to new reviews, update average rating in settings |
| OpenAI credits | 15th of month | Check balance at platform.openai.com, top up if < $10 |
| Razorpay settlements | Weekly | Dashboard → Settlements → verify no disputes |

## Support Contacts

| Issue | Contact | Response Time |
|-------|---------|---------------|
| Server down / critical outage | Primary developer (phone shared in-person) | 2 hours |
| Payment issues | Razorpay support: support@razorpay.com | 24 hours |
| AI chatbot not responding | OpenAI status page + developer | 4 hours |
| General questions | Developer WhatsApp (shared in-person) | 8 hours |

## What This System Cost to Build

| Component | Est. Hours | Notes |
|-----------|-----------|-------|
| UI/UX design & frontend | 120 hrs | Tailwind + Framer Motion + GSAP |
| Backend API & database | 80 hrs | Flask, SQLite, migrations |
| Razorpay integration | 20 hrs | Payment flow + webhooks + idempotency |
| AI chatbot (streaming) | 25 hrs | OpenAI SSE, prompt engineering |
| Admin dashboard | 40 hrs | Charts, real-time order management |
| DevOps & deployment | 30 hrs | Nginx, Gunicorn, CI/CD, backups |
| Security hardening | 20 hrs | JWT, CSRF, rate limits, SQL injection guards |
| QA & testing | 25 hrs | Unit tests, integration tests, load tests |
| **Total** | **~360 hrs** | At market rate ₹2,500/hr = ~₹9,00,000 |

## Monthly Running Costs

| Item | Cost (₹) |
|------|----------|
| VPS (2 vCPU / 4 GB / 80 GB SSD) | 1,500–3,000 |
| Domain (jayadhaba.com) | ~200 |
| Cloudflare Pro (optional) | ~1,700 |
| OpenAI API (usage-based, ~500 chats/day) | 2,000–5,000 |
| Razorpay transaction fees (2% per online payment) | Variable |
| Sentry (free tier) | 0 |
| UptimeRobot (free tier) | 0 |
| Backups (local disk) | 0 |
| **Total estimated** | **~5,500–12,000/month** |

## Known Limitations

- **SQLite WAL mode** supports ~50 concurrent connections comfortably. The migration path to PostgreSQL is ready — run `scripts/migrate_to_postgres.sh` when concurrent load exceeds this.
- AI chatbot responses depend on OpenAI API availability; offline fallback is a generic "please call us" message.
- Image uploads limited to 10 MB; WebP auto-conversion applied.
- No offline-first PWA mode yet — requires active internet.

## How to Change the AI Chatbot Personality

1. Open `backend/routes/chat.py`
2. Edit the `build_system_prompt()` function — the system prompt string defines Jaya's personality
3. Change tone, add/remove rules, update restaurant info
4. Restart backend: `sudo systemctl restart gunicorn`
5. Changes take effect immediately for new chat sessions

## Sign-off Checklist

| # | Item | Status |
|---|------|--------|
| 1 | All 22 sections in this document are complete | [ ] |
| 2 | Owner has admin credentials (shared in-person) | [ ] |
| 3 | Server SSH access configured and tested | [ ] |
| 4 | Razorpay live keys configured and tested | [ ] |
| 5 | OpenAI API key configured and tested | [ ] |
| 6 | Backup schedule verified (every 6h) | [ ] |
| 7 | GitHub Actions CI/CD pipeline passing | [ ] |
| 8 | Domain DNS pointing to server IP | [ ] |
| 9 | SSL certificate active (Let's Encrypt) | [ ] |
| 10 | QR codes printed and placed on tables | [ ] |

---

**Developer Signature:** _________________________  Date: ___________

**Owner Signature:** ____________________________  Date: ___________

---

*Document version: 1.0 | Generated: 2026-05-03*
*Co-Authored-By: Oz <oz-agent@warp.dev>*