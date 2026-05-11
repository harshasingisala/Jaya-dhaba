# System Architecture

## Components

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Customer ordering UI, admin panel, kitchen display |
| Backend | Flask / Python | API server, order logic, payment verification |
| Database | Supabase Postgres | Source of truth for menu, orders, payments, users |
| Auth | Flask JWT with local `users` table | Admin and staff login/session handling |
| Payments | Razorpay | Payment order creation and signature verification |
| Realtime | Supabase Realtime plus backend SSE | Live order updates |
| Polling fallback | Frontend `setInterval` | Refreshes kitchen orders every 30 seconds |

## Data Flow

Customer places an order in the frontend. The frontend sends `POST /api/orders` to Flask with an idempotency key. Flask validates the payload, writes the order and order items to Supabase, and returns the order ID. The frontend opens Razorpay and then sends `POST /api/payments/verify` to Flask after payment. Flask verifies the HMAC signature, updates the payment row to `completed`, updates the order to `confirmed`, and publishes an order update. The kitchen screen updates by stream or by polling within 30 seconds.

