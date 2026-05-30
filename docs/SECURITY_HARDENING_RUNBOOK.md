# Jaya Dhaba Security Hardening Runbook

## Cloudflare

- Proxy every `A`, `AAAA`, and `CNAME` record through Cloudflare.
- Enable DNSSEC at the registrar.
- Add `TXT @`: `v=spf1 include:_spf.google.com ~all`.
- Add `TXT _dmarc`: `v=DMARC1; p=reject; rua=mailto:security@jayadhaba.online`.
- Add provider-specific DKIM records for the active mail provider.
- Delete orphaned CNAMEs that point at unused SaaS resources.
- Enable Always Use HTTPS, TLS 1.3, minimum TLS 1.2, Automatic HTTPS Rewrites, HSTS with preload, Browser Integrity Check, Bot Fight Mode, Scrape Shield, Page Shield, and Hotlink Protection.

## WAF Rules

- Block SQLi probes containing `' OR`, `UNION SELECT`, `1=1`, `DROP TABLE`, or `xp_cmdshell`.
- Block XSS probes containing `<script>`, `javascript:`, or `onerror=`.
- Block traversal probes containing `../`, `..\`, or `%2e%2e`.
- Block scanner user agents containing `sqlmap`, `nikto`, `nmap`, `masscan`, or `zgrab`; block empty user agents.
- Lock `/admin` to trusted IPs where practical.
- Block non-India admin traffic if all administrators are India-based.
- Allow only `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and `OPTIONS`.
- Block request bodies above 5 MB.

## Rate Limits

- `/api/auth/login`: 5 requests/min/IP, block 24 hours at Cloudflare.
- `/api/auth/register`: 10 requests/hour/IP, block 1 hour.
- `/api/auth/forgot-password`: 3 requests/hour/IP, block 6 hours.
- `/api/*`: 200 requests/min/IP, block 10 minutes.
- `/*`: 2000 requests/min/IP, block 1 hour.
- `/api/payments/webhook`: 100 requests/min and allow only Razorpay source IPs when their published ranges are confirmed.

## Deployment Checks

Run before production release:

```bash
git ls-files .env .env.local .env.production backend/.env frontend/.env
git log -p --all | grep -iE "(password|secret|api_key|token)" | grep -v "test\|example\|placeholder"
grep -rn 'f"SELECT\|f"INSERT\|f"UPDATE\|f"DELETE\|f"DROP' backend/
bandit -r backend/ -ll -ii
pip-audit -r backend/requirements.txt
npm --prefix frontend audit --audit-level=high
```

Supabase RLS verification:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false;
```

The query must return zero rows for exposed application tables.
