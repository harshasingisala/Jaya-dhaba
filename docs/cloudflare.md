# Cloudflare Setup

1. Add the operator-owned domain to Cloudflare on the free tier.
2. Set the registrar nameservers to the two Cloudflare nameservers.
3. Add an `A` record for `@` pointing to the VPS IP with proxy enabled.
4. Add an `A` record for `www` pointing to the VPS IP with proxy enabled.
5. Add `CNAME api -> @` only if you later split API traffic to `api.DOMAIN`.
6. Set SSL/TLS mode to `Full (strict)`. Do not use `Flexible`.
7. Enable `Always Use HTTPS`, `Automatic HTTPS Rewrites`, and HSTS with at least one year max age.
8. Add a firewall rule to block traffic that does not originate from Cloudflare IP ranges before exposing origin-only admin paths.
9. Add a cache rule for `/api/*` with cache level `Bypass`.
10. Add a rate limiting rule for `/api/auth/login`: `100 requests per 10 seconds per IP`.

After DNS has propagated, run `bash scripts/setup_tls.sh` on the VPS and verify:

```bash
curl -I https://DOMAIN
curl -f https://DOMAIN/api/health
```
