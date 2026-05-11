# Razorpay Live Checklist

1. Complete Razorpay account activation and business verification.
2. Configure the production webhook endpoint: `https://DOMAIN/api/payments/webhook`.
3. Enable the required payment events, including `payment.captured` and `payment.failed`.
4. Copy the live key id to `RAZORPAY_KEY_ID`.
5. Copy the live key secret to `RAZORPAY_KEY_SECRET`.
6. Copy the webhook signing secret to `RAZORPAY_WEBHOOK_SECRET`.
7. Keep staging on Razorpay test mode until a full order, retry, failed-payment, and webhook replay test passes.
8. Replace staging keys with live keys only after webhook signature validation and duplicate delivery handling are confirmed.
9. Place a low-value live payment and verify the local order moves from `pending` to `confirmed` only after server verification or a signed webhook.
