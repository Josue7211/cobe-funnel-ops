create table if not exists public.cobe_funnel_ops_leads (
  id text primary key,
  name text not null,
  handle text not null,
  source text not null,
  offer text not null,
  stage text not null,
  owner text not null,
  tags_json jsonb not null default '[]'::jsonb,
  budget text not null,
  next_action text not null,
  last_touch text not null,
  sync_source text not null default 'sqlite',
  synced_at timestamptz not null default now()
);

create table if not exists public.cobe_funnel_ops_bookings (
  id text primary key,
  lead_id text not null,
  slot text not null,
  owner text not null,
  status text not null,
  recovery_action text not null,
  sync_source text not null default 'sqlite',
  synced_at timestamptz not null default now()
);

create table if not exists public.cobe_funnel_ops_conversations (
  id text primary key,
  lead_id text not null,
  intent text not null,
  score integer not null default 0,
  automation_summary text not null,
  sync_source text not null default 'sqlite',
  synced_at timestamptz not null default now()
);

create table if not exists public.cobe_funnel_ops_messages (
  id text primary key,
  conversation_id text not null,
  sender text not null,
  text text not null,
  message_timestamp text not null,
  sync_source text not null default 'sqlite',
  synced_at timestamptz not null default now()
);

create table if not exists public.cobe_funnel_ops_delivery_queue (
  id text primary key,
  connector text not null,
  channel text not null,
  target text not null,
  payload_label text not null,
  status text not null,
  last_attempt text not null,
  note text not null,
  sync_source text not null default 'sqlite',
  synced_at timestamptz not null default now()
);

create table if not exists public.cobe_funnel_ops_delivery_attempts (
  id text primary key,
  delivery_id text not null,
  status text not null,
  detail text not null,
  attempted_at text not null,
  sync_source text not null default 'sqlite',
  synced_at timestamptz not null default now()
);

create table if not exists public.cobe_funnel_ops_audit_events (
  id text primary key,
  kind text not null,
  title text not null,
  detail text not null,
  target text not null,
  event_timestamp text not null,
  sync_source text not null default 'sqlite',
  synced_at timestamptz not null default now()
);

grant usage on schema public to postgres, anon, authenticated, service_role;
grant select, insert, update, delete on
  public.cobe_funnel_ops_leads,
  public.cobe_funnel_ops_bookings,
  public.cobe_funnel_ops_conversations,
  public.cobe_funnel_ops_messages,
  public.cobe_funnel_ops_delivery_queue,
  public.cobe_funnel_ops_delivery_attempts,
  public.cobe_funnel_ops_audit_events,
  public.cobe_funnel_ops_state_snapshots
to anon, authenticated, service_role;
