
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  organization TEXT DEFAULT '',
  city TEXT DEFAULT '',
  region TEXT DEFAULT '',
  postal_code TEXT DEFAULT '',
  address TEXT DEFAULT '',
  organization_phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  organization_head TEXT DEFAULT '',
  vehicle_class TEXT DEFAULT '',
  vehicle_description TEXT DEFAULT '',
  team_lead TEXT DEFAULT '',
  team_lead_phone TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  full_name TEXT DEFAULT '',
  birth_date TEXT DEFAULT '',
  document TEXT DEFAULT '',
  is_student INTEGER DEFAULT 0,
  enrollment_order TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  share_url TEXT NOT NULL
);
