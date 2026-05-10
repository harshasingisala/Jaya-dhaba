# Troubleshooting

| Symptom | Likely Cause | Resolution |
|---|---|---|
| Frontend shows failed fetch | Backend not reachable | Start backend and verify `/api/health` |
| CORS error | Frontend origin missing | Add origin to `CORS_ORIGINS` |
| Supabase connection fails | Bad `DATABASE_URL` | Verify the URL is Postgres and password is URL-encoded |
| Payment popup does not open | Browser key missing | Set `VITE_RAZORPAY_KEY_ID` |
| Payment verification fails | Wrong Razorpay secret | Match `RAZORPAY_KEY_SECRET` to Razorpay dashboard |
| Webhook rejected | Wrong webhook secret | Match `RAZORPAY_WEBHOOK_SECRET` |
| Kitchen stale | Stream disconnected | Wait 30 seconds or refresh page |
| Duplicate order | Missing idempotency key | Frontend must send `Idempotency-Key` |

