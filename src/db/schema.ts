export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  layer TEXT NOT NULL,
  type TEXT NOT NULL,
  subject TEXT,
  memory_key TEXT,
  value_json TEXT,
  summary TEXT NOT NULL,
  confidence REAL DEFAULT 0.5,
  status TEXT DEFAULT 'active',
  source_event_id TEXT,
  ttl_seconds INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_accessed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_key ON memories(memory_key);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);

CREATE TABLE IF NOT EXISTS raw_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  agent_id TEXT,
  session_id TEXT,
  project_id TEXT,
  source TEXT,
  content TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  git_root TEXT,
  name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS retrieval_logs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  project_id TEXT,
  query_text TEXT,
  scopes_json TEXT,
  layers_json TEXT,
  result_count INTEGER,
  token_budget INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_embeddings (
  memory_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  dimension INTEGER NOT NULL,
  vector_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_fts (
  memory_id TEXT PRIMARY KEY,
  scope_type TEXT,
  scope_id TEXT,
  layer TEXT,
  content TEXT NOT NULL
);

`;
