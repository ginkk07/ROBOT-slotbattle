CREATE TABLE IF NOT EXISTS slotbattle_sessions (
  game_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  state_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_slotbattle_sessions_owner_status_updated
  ON slotbattle_sessions (owner_id, status, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slotbattle_sessions_one_active_per_owner
  ON slotbattle_sessions (owner_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS slotbattle_profiles (
  player_id TEXT PRIMARY KEY,
  profile_json TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  updated_at TEXT NOT NULL
);
