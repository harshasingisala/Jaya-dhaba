# Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| Frontend shows failed fetch | Backend not reachable | Start backend and verify `/api/health` |
| CORS error with `DEPLOYMENT_NOT_FOUND` from Vercel | `api.jayadhaba.online` is routed to Vercel instead of the Flask API origin | Remove `api.jayadhaba.online` from Vercel, point the Cloudflare `api` record to the Render backend, and keep the Cloudflare origin secret header rule enabled |
| Cloudflare Error 1000 on `api.jayadhaba.online` | Cloudflare proxy is pointing at an origin Cloudflare forbids proxying directly | Route `api` with a Cloudflare Worker/custom hostname setup that forwards to Render and injects `X-Cloudflare-Secret` |
| CORS error | Frontend origin missing | Add origin to `CORS_ORIGINS` |
| Supabase connection fails | Bad `DATABASE_URL` | Verify the URL is Postgres and password is URL-encoded |
| Payment popup does not open | Browser key missing | Set `VITE_RAZORPAY_KEY_ID` |
| Payment verification fails | Wrong Razorpay secret | Match `RAZORPAY_KEY_SECRET` to Razorpay dashboard |
| Webhook rejected | Wrong webhook secret | Match `RAZORPAY_WEBHOOK_SECRET` |
| Kitchen stale | Stream disconnected | Wait 30 seconds or refresh page |
| Duplicate order | Missing idempotency key | Frontend must send `Idempotency-Key` |
