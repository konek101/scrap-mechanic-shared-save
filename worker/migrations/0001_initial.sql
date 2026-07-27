CREATE TABLE worlds (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_steam_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  latest_snapshot_json TEXT
);

CREATE TABLE members (
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  steam_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  google_email TEXT,
  PRIMARY KEY (world_id, steam_id)
);

CREATE TABLE leases (
  world_id TEXT PRIMARY KEY REFERENCES worlds(id) ON DELETE CASCADE,
  host_steam_id TEXT NOT NULL,
  lobby_id TEXT,
  token_hash TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  steam_id TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL
);

CREATE INDEX sessions_expiry ON sessions(expires_at_ms);
