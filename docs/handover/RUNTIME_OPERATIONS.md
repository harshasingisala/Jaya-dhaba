# Runtime Operations

## Admin

Login with the owner account stored in the secure handover vault or local `.env` during transition.

Use the admin Orders tab to view orders and update status. Valid backend statuses are `pending`, `confirmed`, `preparing`, `ready`, `served`, and `cancelled`.

## Kitchen

The kitchen display reads active orders from `/api/kitchen/orders` and also listens to `/api/kitchen/stream`. If the stream drops, the frontend polls every 30 seconds.

## Payments

Payment initialization uses Razorpay orders. Successful verification writes `payments.status = completed` and updates `orders.status = confirmed`.

Refunds are handled in the Razorpay dashboard. There is no backend refund endpoint in this handover build.

