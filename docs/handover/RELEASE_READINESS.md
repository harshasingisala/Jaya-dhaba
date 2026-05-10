# Release Readiness

## Backup

Schema backup file: `backups/supabase_schema_backup_20260510T031135Z.sql`

## Final Checklist

| Item | Status | Evidence |
|---|---|---|
| Backend health | Pass | `/api/health` returned success |
| Menu load | Pass | 30 items returned in route test |
| Order creation | Pass | Route test returned 201 |
| Order item persistence | Pass | `order_items` row existed during test |
| Payment initialization | Pass | Razorpay order ID returned |
| Payment verification | Pass | Payment status `completed` verified |
| Replay protection | Pass | Replayed verification returned already processed |
| RLS | Pass | anon sees 0 orders, service role sees 50 |
| Realtime publication | Pass | `orders` is in `supabase_realtime` |
| Polling fallback | Pass | Kitchen screen has 30 second interval |
| Frontend build | Fail | Local esbuild permission error reading parent directory |
| Git clean/tagged | Fail | Working tree has many existing uncommitted changes |
| Env inventory | Conditional | Missing webhook and frontend deployment variables |
| Platform transfer | Pending | Requires dashboard access confirmation |

Final status: Conditionally safe for backend/database handover, not fully release-ready until frontend build and platform transfer are completed.

