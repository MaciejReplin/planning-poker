CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scale_type TEXT NOT NULL DEFAULT 'fibonacci',
  custom_scale TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS estimations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  jira_key TEXT,
  jira_url TEXT,
  title TEXT,
  final_estimate TEXT,
  status TEXT NOT NULL DEFAULT 'voting',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  estimation_id INTEGER NOT NULL REFERENCES estimations(id),
  participant TEXT NOT NULL,
  value TEXT NOT NULL,
  UNIQUE(estimation_id, participant)
);

CREATE INDEX IF NOT EXISTS idx_estimations_room ON estimations(room_id);
CREATE INDEX IF NOT EXISTS idx_votes_estimation ON votes(estimation_id);
