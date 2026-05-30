# Environment Inventory

| Variable | Current Status | Purpose | Source of Truth |
|---|---|---|---|
| `DATABASE_URL` | Set | Supabase Postgres connection | Supabase dashboard |
| `FLASK_SECRET_KEY` | Set | Flask signing secret | Handover secret store |
| `JWT_SECRET_KEY` | Set | JWT signing secret | Handover secret store |
| `RAZORPAY_KEY_ID` | Live key set | Razorpay API key | Razorpay dashboard |
| `RAZORPAY_KEY_SECRET` | Set | Razorpay API secret | Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | Missing | Webhook signature verification | Razorpay dashboard |
| `REDIS_URL` | Required | Rate-limit, JWT blacklist, and stream-ticket storage | Redis provider |
| `DB_ENCRYPTION_KEY` | Required | Database field encryption | Handover secret store |
| `CLOUDFLARE_TUNNEL_SECRET` | Required | Reject direct origin traffic that bypasses Cloudflare | Cloudflare transform rule / Handover secret store |
| `VITE_RAZORPAY_KEY_ID` | Live key set | Browser payment popup | Razorpay dashboard |
| `VITE_API_BASE_URL` | Missing | Frontend backend URL | Hosting dashboard |
| `VITE_SUPABASE_URL` | Missing | Optional frontend Supabase URL | Supabase dashboard |
| `VITE_SUPABASE_ANON_KEY` | Missing | Optional frontend anon key | Supabase dashboard |

Do not put `SUPABASE_SERVICE_KEY` in frontend variables.
