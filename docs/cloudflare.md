# Cloudflare Setup

1. Add the operator-owned domain to Cloudflare on the free tier.
2. Set the registrar nameservers to the two Cloudflare nameservers.
3. Point the frontend hostnames (`@` and `www`) at the frontend platform with proxy enabled.
4. Route `api` through Cloudflare to the Flask backend origin. If a proxied CNAME to Render triggers Cloudflare Error 1000, use a Cloudflare Worker or Cloudflare for SaaS/custom hostname setup for `api.DOMAIN`; do not fall back to direct browser calls to the Render hostname.
5. In Render, add `api.DOMAIN` as a custom domain for the backend service so the proxied host header routes to Flask.
6. Set SSL/TLS mode to `Full (strict)`. Do not use `Flexible`.
7. Enable `Always Use HTTPS`, `Automatic HTTPS Rewrites`, and HSTS with at least one year max age.
8. Add a Cloudflare request header transform rule or Worker header injection for `api.DOMAIN` that sends `X-Cloudflare-Secret` with the value stored in `CLOUDFLARE_TUNNEL_SECRET`.
9. Add a firewall rule to block traffic that does not originate from Cloudflare IP ranges before exposing origin-only admin paths.
10. Add a cache rule for `/api/*` with cache level `Bypass`.
11. Add a rate limiting rule for `/api/auth/login`: `100 requests per 10 seconds per IP`.

If the `api` DNS record cannot be proxied directly because Cloudflare returns Error 1000, deploy the Worker in `docs/cloudflare-api-worker.js`, add a Worker secret named `CLOUDFLARE_TUNNEL_SECRET`, and route `api.DOMAIN/*` to that Worker.

After DNS has propagated, run `bash scripts/setup_tls.sh` on the VPS and verify:

```bash
curl -I https://DOMAIN
curl -f https://DOMAIN/api/health
curl -i -X OPTIONS https://api.DOMAIN/api/menu \
  -H "Origin: https://www.DOMAIN" \
  -H "Access-Control-Request-Method: GET"
```
