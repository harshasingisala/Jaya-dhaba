# Security Notes

| Action | Priority | Reason |
|---|---|---|
| Set `RAZORPAY_WEBHOOK_SECRET` | Critical | Webhook verification is not production-complete without it |
| Ensure `.env` is never committed | Critical | It contains live secrets |
| Rotate secrets after handover | High | Secrets were handled during stabilization |
| Keep service role key out of frontend | High | Service role bypasses RLS |
| Verify anon cannot read orders regularly | High | Customer order data must stay private |
| Transfer platform ownership | High | Outgoing engineer must not remain sole admin |

Current RLS evidence from final pass: anon role sees 0 orders; service role sees 50 orders.

