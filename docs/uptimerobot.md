# UptimeRobot Monitoring

1. Create a free UptimeRobot account.
2. Add a new HTTP monitor.
3. URL: `https://DOMAIN/api/health`.
4. Interval: 5 minutes.
5. Alert when the monitor fails twice.
6. Add an email alert contact for `ADMIN_EMAIL`.
7. Confirm the monitor is green after TLS is installed.

Use this manual test to trigger Sentry after deploy:

```bash
curl -H "X-CSRF-Token: invalid" -X POST https://DOMAIN/api/orders
```

The request should fail cleanly with a non-500 response and produce an audit entry. For unhandled exception visibility, use the Sentry dashboard release health after deploying with `SENTRY_DSN` set.
