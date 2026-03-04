export type ScopeType = "global" | "project" | "session";

export type MemoryLayer = "L0" | "L1" | "L2" | "L3";

export type MemoryMode = "safe" | "balanced" | "aggressive";

export type ResponseStyle = "concise" | "engineering_concise" | "detailed";

export type ScopeMode =
  | "project_and_global"
  | "project_only"
  | "global_only";

export type EmbeddingMode =
  | "none"
  | "api"
  | "custom_vendor"
  | "self_hosted"
  | "local_model";

export interface UserConfig {
  id: string;
  language: string;
  response_style: ResponseStyle;
}

export interface StorageConfig {
  home: string;
  local_only: boolean;
}

export interface ScopeConfig {
  default_mode: ScopeMode;
}

export interface MemoryConfig {
  mode: MemoryMode;
  auto_remember: boolean;
  auto_summarize: boolean;
  token_budget: number;
}

export interface SearchConfig {
  fts_enabled: boolean;
  semantic_enabled: boolean;
}

export interface EmbeddingConfig {
  provider: string;
  provider_type: EmbeddingMode;
  base_url: string;
  api_key_env: string;
  model: string;
  dimension: number;
  transport: string;
}

export interface AdaptersConfig {
  skill_enabled: boolean;
  mcp_enabled: boolean;
}

export interface RulePreset {
  id: string;
  label: string;
  content: string;
}

export interface AppConfig {
  user: UserConfig;
  storage: StorageConfig;
  scope: ScopeConfig;
  memory: MemoryConfig;
  search: SearchConfig;
  embedding: EmbeddingConfig;
  adapters: AdaptersConfig;
  rules: RulePreset[];
}

export interface MemoryRecord {
  id: string;
  user_id: string;
  agent_id: string | null;
  scope_type: ScopeType;
  scope_id: string;
  layer: MemoryLayer;
  type: string;
  subject: string | null;
  memory_key: string | null;
  value_json: string | null;
  summary: string;
  confidence: number;
  status: string;
  source_event_id: string | null;
  ttl_seconds: number | null;
  created_at: string;
  updated_at: string;
  last_accessed_at: string | null;
}

export interface CandidateMemory {
  type: string;
  key?: string;
  subject?: string;
  value?: unknown;
  summary: string;
  confidence: number;
  scope_hint: ScopeType;
  layer_hint?: MemoryLayer;
  ttl_seconds?: number;
}

export interface RecallRequest {
  user_id: string;
  project_id?: string;
  session_id?: string;
  task: string;
  token_budget: number;
  debug: boolean;
}

export interface ContextBlock {
  type: string;
  priority: number;
  content: string;
  scope_type: ScopeType;
  layer: MemoryLayer;
}

export interface RecallResponse {
  context_blocks: ContextBlock[];
  debug?: {
    selected_memory_ids: string[];
    dropped_memory_ids: string[];
  };
}

export interface SessionSummaryResult {
  summaryMemoryId: string;
  archivePath: string;
  summaryPath: string;
}

export interface MemoryEmbeddingRecord {
  memory_id: string;
  provider: string;
  model: string;
  dimension: number;
  vector_json: string;
  updated_at: string;
}

export interface DiagnosticCheck {
  name: string;
  ok: boolean;
  details: string;
}
