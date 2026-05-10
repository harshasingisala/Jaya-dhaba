# Deployment

First-time deploy on Ubuntu 22.04:

```bash
ssh root@SERVER_IP
git clone https://github.com/youruser/restaurant /var/www/restaurant
cd /var/www/restaurant
bash scripts/setup_server.sh
bash scripts/setup_tls.sh
supervisorctl start restaurant-backend
systemctl reload nginx
curl -f https://DOMAIN/api/health
```

Follow `docs/cloudflare.md`, `docs/uptimerobot.md`, and `docs/razorpay_live.md` before accepting live traffic.

Subsequent deploys are automatic on push to `main` through `.github/workflows/deploy.yml`. Manual deploy:

```bash
cd /var/www/restaurant
bash scripts/deploy.sh
```

Required GitHub secrets:

- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `DOMAIN`

Production readiness checks:

```bash
curl -I https://DOMAIN
curl -f https://DOMAIN/api/health
curl -f https://DOMAIN/api/menu
certbot renew --dry-run
grep -rn "execute(f" backend/ && exit 1 || true
```
