# Rollback Runbook

Target recovery time: under 60 seconds after the bad revision is identified.

## Code Rollback

```bash
cd /var/www/restaurant
git revert HEAD --no-edit
git push origin main
```

GitHub Actions will run tests and deploy the revert.

## Manual Emergency Rollback

```bash
cd /var/www/restaurant
bash scripts/deploy.sh
```

`scripts/deploy.sh` records the previous revision and restores it automatically if smoke tests fail.

## Database Restore

```bash
supervisorctl stop restaurant-backend
cp /var/www/restaurant/backups/restaurant_YYYYMMDD_HHMMSS.db /var/www/restaurant/backend/restaurant.db
chown restaurant:www-data /var/www/restaurant/backend/restaurant.db
chmod 640 /var/www/restaurant/backend/restaurant.db
supervisorctl start restaurant-backend
curl -f https://DOMAIN/api/health
```
