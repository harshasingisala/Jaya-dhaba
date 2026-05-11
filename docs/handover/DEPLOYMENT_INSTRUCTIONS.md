# Deployment Instructions

## Frontend

Deploy the `frontend` folder with Vercel or equivalent static hosting.

Build command: `npm run build`  
Output directory: `dist`

Required frontend variables:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Public backend URL |
| `VITE_SUPABASE_URL` | Supabase project URL if direct client use is enabled |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key only, never service key |
| `VITE_RAZORPAY_KEY_ID` | Razorpay browser key |

## Backend

Deploy the `backend` folder to a Python host that supports Flask/Gunicorn. Start command should use the existing app entrypoint, for example `gunicorn run:app`.

Required backend variables: `DATABASE_URL`, `FLASK_SECRET_KEY`, `JWT_SECRET_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `CORS_ORIGINS`, `DOMAIN`.

Health check: `GET /api/health`.

## Razorpay Webhook

Webhook URL: `https://<backend-domain>/api/payments/webhook`

Enable events: `payment.captured`, `payment.failed`.

The Razorpay webhook secret must exactly match `RAZORPAY_WEBHOOK_SECRET`.

