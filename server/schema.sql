PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  handle TEXT NOT NULL,
  source TEXT NOT NULL,
  offer TEXT NOT NULL,
  stage TEXT NOT NULL,
  owner TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  budget TEXT NOT NULL,
  next_action TEXT NOT NULL,
  last_touch TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  slot TEXT NOT NULL,
  owner TEXT NOT NULL,
  status TEXT NOT NULL,
  recovery_action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS webhook_history (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connector_states (
  name TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  last_ping TEXT NOT NULL,
  runs INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS delivery_queue (
  id TEXT PRIMARY KEY,
  connector TEXT NOT NULL,
  channel TEXT NOT NULL,
  target TEXT NOT NULL,
  payload_label TEXT NOT NULL,
  status TEXT NOT NULL,
  last_attempt TEXT NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS operator_notes_history (
  id TEXT PRIMARY KEY,
  note TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  step_label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  target TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS live_test_runs (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  scenario_title TEXT NOT NULL,
  step_label TEXT NOT NULL,
  payload_label TEXT NOT NULL,
  connector TEXT NOT NULL,
  status TEXT NOT NULL,
  result_message TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_test_results (
  rule_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  detail TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_leads_stage_updated ON leads(stage, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_status_updated ON bookings(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_delivery_status_updated ON delivery_queue(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_target_created ON audit_events(target, created_at DESC);
