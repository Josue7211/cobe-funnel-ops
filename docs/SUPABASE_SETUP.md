# Supabase Setup

This repo expects its own Supabase project. Do not point it at another app's database or reuse another project's auth/redirect settings.

## Required env vars

Set these for the `cobe-funnel-ops` deployment:

- `COBE_SUPABASE_URL`
- `COBE_SUPABASE_SERVICE_ROLE_KEY`
- `COBE_SUPABASE_STATE_TABLE`

## Schema

Apply [`server/remote-schema.sql`](../server/remote-schema.sql) to a fresh Supabase project. It creates the repo-owned tables:

- `cobe_funnel_ops_state_snapshots`
- `cobe_funnel_ops_leads`
- `cobe_funnel_ops_bookings`
- `cobe_funnel_ops_conversations`
- `cobe_funnel_ops_messages`
- `cobe_funnel_ops_delivery_queue`
- `cobe_funnel_ops_delivery_attempts`
- `cobe_funnel_ops_audit_events`

## Notes

- Keep auth local to this repo unless you intentionally add a separate auth flow.
- Use a new Supabase project or a dedicated schema/database owned by this repo.
- If you change table names, update `server/supabaseSync.js` and reapply the schema.
