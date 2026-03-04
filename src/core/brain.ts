import type { DatabaseConnection } from "../db/database.js";
import { cosineSimilarity, createEmbeddingProvider, validateEmbeddingConfig } from "./embedding.js";
import { loadConfig, saveConfig } from "./config.js";
import { defaultConfig, PRESET_RULES } from "./defaults.js";
import { buildPaths, type MemoryPaths } from "./paths.js";
import { resolveProject } from "./project.js";
import { extractCandidates, routeLayer, shouldPersistCandidate, compressText } from "./governance.js";
import { openDatabase } from "../db/database.js";
import { ensureDir, pathExists, removeDir } from "../utils/fs.js";
import { makeId } from "../utils/id.js";
import { nowIso } from "../utils/time.js";
import { MemoryStore } from "./store.js";
import {
  appendProjectDailySummary,
  writeGlobalProfile,
  writeProjectDecision,
  writeSessionArchive,
  writeSessionSummary
} from "./summary.js";
import type {
  AppConfig,
  ContextBlock,
  DiagnosticCheck,
  MemoryRecord,
  RecallRequest,
  RecallResponse,
  SessionSummaryResult
} from "../types.js";

export interface InitOptions {
  home?: string;
  language?: string;
  responseStyle?: AppConfig["user"]["response_style"];
  scopeMode?: AppConfig["scope"]["default_mode"];
  memoryMode?: AppConfig["memory"]["mode"];
  rules?: string[];
  embedding?: Partial<AppConfig["embedding"]>;
  semanticEnabled?: boolean;
}

export class MemoryBrain {
  readonly config: AppConfig;
  readonly paths: MemoryPaths;
  readonly db: DatabaseConnection;
  readonly store: MemoryStore;

  constructor(config: AppConfig, paths: MemoryPaths, db: DatabaseConnection) {
    this.config = config;
    this.paths = paths;
    this.db = db;
    this.store = new MemoryStore(this.db);
    this.store.expireMemories();
  }

  static async create(home?: string): Promise<MemoryBrain> {
    const config = loadConfig(home);
    const paths = buildPaths(config.storage.home);
    const db = await openDatabase(paths.databaseFile);
    return new MemoryBrain(config, paths, db);
  }

  close(): void {
    this.db.close();
  }

  static async initialize(options: InitOptions = {}): Promise<MemoryBrain> {
    const base = defaultConfig(options.home);
    const config: AppConfig = {
      ...base,
      user: {
        ...base.user,
        language: options.language ?? base.user.language,
        response_style: options.responseStyle ?? base.user.response_style
      },
      scope: {
        default_mode: options.scopeMode ?? base.scope.default_mode
      },
      memory: {
        ...base.memory,
        mode: options.memoryMode ?? base.memory.mode
      },
      search: {
        ...base.search,
        semantic_enabled: options.semanticEnabled ?? base.search.semantic_enabled
      },
      embedding: {
        ...base.embedding,
        ...options.embedding
      },
      rules:
        options.rules?.map((id) => PRESET_RULES.find((rule) => rule.id === id)).filter(Boolean) as AppConfig["rules"] ??
        []
    };
    const paths = buildPaths(config.storage.home);
    for (const dir of [
      paths.configDir,
      paths.dataDir,
      paths.globalSummariesDir,
      paths.projectsSummariesDir,
      paths.sessionsSummariesDir,
      paths.projectArchivesDir,
      paths.sessionArchivesDir,
      paths.ftsDir,
      paths.semanticDir,
      paths.adaptersDir,
      paths.logsDir
    ]) {
      ensureDir(dir);
    }
    saveConfig(config);
    const brain = await MemoryBrain.create(config.storage.home);
    writeGlobalProfile(
      brain.paths,
      [
        `- User: ${brain.config.user.id}`,
        `- Language: ${brain.config.user.language}`,
        `- Response style: ${brain.config.user.response_style}`,
        ...brain.config.rules.map((rule) => `- Rule: ${rule.label}`)
      ]
    );
    return brain;
  }

  status(): Record<string, string | boolean | number> {
    return {
      "Memory home": this.paths.home,
      "Config path": this.paths.configFile,
      "Database path": this.paths.databaseFile,
      "Summaries path": this.paths.summariesDir,
      "Archives path": this.paths.archivesDir,
      "Indexes path": this.paths.indexesDir,
      "Semantic search": this.config.search.semantic_enabled,
      "Embedding provider": this.config.embedding.provider,
      "Embedding model": this.config.embedding.model,
      "Memory mode": this.config.memory.mode,
      "Scope mode": this.config.scope.default_mode
    };
  }

  async doctor(): Promise<DiagnosticCheck[]> {
    const checks: DiagnosticCheck[] = [];
    const requiredPaths = [
      this.paths.home,
      this.paths.configDir,
      this.paths.dataDir,
      this.paths.summariesDir,
      this.paths.archivesDir
    ];
    for (const target of requiredPaths) {
      checks.push({
        name: `path:${target}`,
        ok: pathExists(target),
        details: pathExists(target) ? "exists" : "missing"
      });
    }
    try {
      this.db.prepare("SELECT 1").get();
      checks.push({ name: "sqlite", ok: true, details: "readable" });
    } catch (error) {
      checks.push({
        name: "sqlite",
        ok: false,
        details: error instanceof Error ? error.message : String(error)
      });
    }
    try {
      this.db.prepare("SELECT count(*) AS count FROM memory_fts").get();
      checks.push({ name: "fts", ok: true, details: "available" });
    } catch (error) {
      checks.push({
        name: "fts",
        ok: false,
        details: error instanceof Error ? error.message : String(error)
      });
    }
    const configErrors = validateEmbeddingConfig(this.config.embedding);
    checks.push({
      name: "config",
      ok: configErrors.length === 0,
      details: configErrors.length === 0 ? "valid" : configErrors.join("; ")
    });
    try {
      const provider = createEmbeddingProvider(this.config.embedding);
      checks.push({
        name: "embedding",
        ok: await provider.healthCheck(),
        details: provider.name()
      });
    } catch (error) {
      checks.push({
        name: "embedding",
        ok: false,
        details: error instanceof Error ? error.message : String(error)
      });
    }
    return checks;
  }

  remember(input: {
    content: string;
    scopeHint?: "global" | "project" | "session";
    workspacePath?: string;
    gitRoot?: string;
    sessionId?: string;
    source?: string;
  }): { eventId: string; memoryIds: string[] } {
    const project =
      input.workspacePath !== undefined
        ? resolveProject(input.workspacePath, input.gitRoot)
        : undefined;
    if (project) {
      this.store.upsertProject({
        ...project,
        user_id: this.config.user.id
      });
    }
    const sessionId = input.sessionId ?? makeId("sess");
    const eventId = this.store.insertRawEvent({
      user_id: this.config.user.id,
      session_id: sessionId,
      project_id: project?.id,
      source: input.source ?? "cli",
      content: input.content
    });
    const candidates = extractCandidates(input.content, this.config.memory.mode);
    const memoryIds: string[] = [];
    for (const candidate of candidates) {
      if (!shouldPersistCandidate(candidate, this.config.memory.mode)) {
        continue;
      }
      const scopeType = resolveScopeType(
        this.config.scope.default_mode,
        input.scopeHint,
        candidate.scope_hint
      );
      const scopeId =
        scopeType === "global"
          ? "global"
          : scopeType === "project"
            ? project?.id ?? "project_unknown"
            : sessionId;
      const layer = routeLayer(candidate);
      const memoryId = this.store.insertMemory({
        user_id: this.config.user.id,
        scope_type: scopeType,
        scope_id: scopeId,
        layer,
        candidate,
        source_event_id: eventId
      });
      memoryIds.push(memoryId);
      if (scopeType === "global") {
        writeGlobalProfile(this.paths, [`- ${candidate.summary}`]);
      } else if (scopeType === "project" && project) {
        writeProjectDecision(this.paths, project.id, candidate.type, candidate.summary);
      }
    }
    return { eventId, memoryIds };
  }

  async recall(input: {
    task: string;
    workspacePath?: string;
    gitRoot?: string;
    sessionId?: string;
    tokenBudget?: number;
    debug?: boolean;
  }): Promise<RecallResponse> {
    const project =
      input.workspacePath !== undefined
        ? resolveProject(input.workspacePath, input.gitRoot)
        : undefined;
    if (project) {
      this.store.upsertProject({
        ...project,
        user_id: this.config.user.id
      });
    }
    const request: RecallRequest = {
      user_id: this.config.user.id,
      project_id: project?.id,
      session_id: input.sessionId,
      task: input.task,
      token_budget: input.tokenBudget ?? this.config.memory.token_budget,
      debug: input.debug ?? false
    };
    const lexicalMemories = this.store.searchMemories(request);
    const semanticMemories = await this.semanticRecall(request, lexicalMemories);
    const merged = dedupeById([...lexicalMemories, ...semanticMemories]);
    const prioritized = merged
      .map((memory) => ({
        memory,
        score: scoreMemory(memory, request)
      }))
      .sort((a, b) => b.score - a.score);
    const blocks: ContextBlock[] = [];
    const selected: string[] = [];
    const dropped: string[] = [];
    let used = 0;
    for (const item of prioritized) {
      const content = compressText(item.memory.summary, 220);
      const estimatedTokens = Math.ceil(content.length / 4);
      if (used + estimatedTokens > request.token_budget) {
        dropped.push(item.memory.id);
        continue;
      }
      used += estimatedTokens;
      selected.push(item.memory.id);
      blocks.push({
        type: blockType(item.memory.type, item.memory.scope_type),
        priority: Math.round(item.score),
        content,
        scope_type: item.memory.scope_type,
        layer: item.memory.layer
      });
    }
    this.store.markMemoriesAccessed(selected);
    this.store.logRetrieval({
      request_id: makeId("req"),
      user_id: this.config.user.id,
      project_id: project?.id,
      query_text: request.task,
      scopes_json: JSON.stringify(
        [request.session_id && "session", request.project_id && "project", "global"].filter(Boolean)
      ),
      layers_json: JSON.stringify(["L0", "L1", "L2", "L3"]),
      result_count: blocks.length,
      token_budget: request.token_budget
    });
    return {
      context_blocks: blocks,
      debug: request.debug
        ? {
            selected_memory_ids: selected,
            dropped_memory_ids: dropped
          }
        : undefined
    };
  }

  summarizeSession(input: {
    sessionId: string;
    workspacePath?: string;
    gitRoot?: string;
  }): SessionSummaryResult {
    const project =
      input.workspacePath !== undefined
        ? resolveProject(input.workspacePath, input.gitRoot)
        : undefined;
    const events = this.store.getRawEvents(input.sessionId);
    if (events.length === 0) {
      throw new Error(`No raw events found for session ${input.sessionId}.`);
    }
    const archiveContent = events
      .map((event) => `- [${event.created_at}] ${event.content}`)
      .join("\n");
    const summary = compressText(
      events.map((event) => event.content).join(" "),
      500
    );
    const archivePath = writeSessionArchive(
      this.paths,
      input.sessionId,
      `# Session Archive\n\n${archiveContent}\n`
    );
    const summaryPath = writeSessionSummary(this.paths, input.sessionId, summary);
    const summaryMemoryId = this.store.insertMemory({
      user_id: this.config.user.id,
      scope_type: project ? "project" : "session",
      scope_id: project?.id ?? input.sessionId,
      layer: "L2",
      candidate: {
        type: "summary",
        key: `summary:${input.sessionId}`,
        summary,
        confidence: 0.85,
        scope_hint: project ? "project" : "session",
        value: { session_id: input.sessionId, summarized_at: nowIso() }
      }
    });
    if (project) {
      appendProjectDailySummary(this.paths, project.id, summary);
    }
    return { summaryMemoryId, archivePath, summaryPath };
  }

  inspect(input: { memoryId?: string; retrievalLimit?: number }): unknown {
    if (input.memoryId) {
      return this.store.getMemoryById(input.memoryId);
    }
    return {
      retrieval_logs: this.store.getRetrievalLog(input.retrievalLimit ?? 10)
    };
  }

  enableEmbedding(input: {
    providerType: AppConfig["embedding"]["provider_type"];
    provider: string;
    baseUrl?: string;
    apiKeyEnv?: string;
    model: string;
    dimension?: number;
    transport?: string;
  }): void {
    const nextEmbedding = {
      provider_type: input.providerType,
      provider: input.provider,
      base_url: input.baseUrl ?? "",
      api_key_env: input.apiKeyEnv ?? "",
      model: input.model,
      dimension: input.dimension ?? 0,
      transport: input.transport ?? ""
    };
    const errors = validateEmbeddingConfig(nextEmbedding);
    if (errors.length > 0) {
      throw new Error(errors.join("; "));
    }
    this.config.search.semantic_enabled = true;
    this.config.embedding = nextEmbedding;
    saveConfig(this.config);
  }

  disableEmbedding(): void {
    this.config.search.semantic_enabled = false;
    this.config.embedding = {
      provider: "none",
      provider_type: "none",
      base_url: "",
      api_key_env: "",
      model: "",
      dimension: 0,
      transport: ""
    };
    saveConfig(this.config);
  }

  uninstall(): void {
    this.close();
    removeDir(this.paths.home);
  }

  private async semanticRecall(
    request: RecallRequest,
    lexicalMemories: MemoryRecord[]
  ): Promise<MemoryRecord[]> {
    if (!this.config.search.semantic_enabled) {
      return [];
    }
    const configErrors = validateEmbeddingConfig(this.config.embedding);
    if (configErrors.length > 0) {
      return [];
    }
    try {
      const provider = createEmbeddingProvider(this.config.embedding);
      const queryEmbedding = (await provider.embed([request.task]))[0];
      if (!queryEmbedding) {
        return [];
      }
      const pool = lexicalMemories.length > 0
        ? lexicalMemories
        : this.store
            .getTopMemories("global", "global", ["L1", "L2"], 30)
            .concat(
              request.project_id
                ? this.store.getTopMemories("project", request.project_id, ["L1", "L2"], 30)
                : []
            )
            .concat(
              request.session_id
                ? this.store.getTopMemories("session", request.session_id, ["L0", "L1", "L2"], 20)
                : []
            );
      const uniquePool = dedupeById(pool);
      const scored: Array<{ memory: (typeof uniquePool)[number]; score: number }> = [];
      const dimension = queryEmbedding.length;
      for (const memory of uniquePool) {
        const embedding = await this.ensureMemoryEmbedding(memory.id, memory.summary, dimension);
        if (!embedding) continue;
        scored.push({
          memory,
          score: cosineSimilarity(queryEmbedding, embedding)
        });
      }
      return scored
        .filter((item) => item.score > 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((item) => item.memory);
    } catch {
      return [];
    }
  }

  private async ensureMemoryEmbedding(
    memoryId: string,
    text: string,
    dimension: number
  ): Promise<number[] | null> {
    const existing = this.store.getEmbedding(memoryId);
    if (existing) {
      const vector = JSON.parse(existing.vector_json) as number[];
      if (vector.length === dimension) {
        return vector;
      }
    }
    const provider = createEmbeddingProvider(this.config.embedding);
    const vector = (await provider.embed([text]))[0];
    if (!vector) {
      return null;
    }
    this.store.upsertEmbedding({
      memory_id: memoryId,
      provider: this.config.embedding.provider,
      model: this.config.embedding.model,
      dimension: vector.length,
      vector
    });
    return vector;
  }
}

function blockType(type: string, scope: string): string {
  if (scope === "global") return "stable_preferences";
  if (scope === "project") return "project_constraints";
  if (type === "summary") return "session_summary";
  return "current_session";
}

function scoreMemory(memory: { scope_type: string; layer: string; confidence: number; updated_at: string }, request: RecallRequest): number {
  let score = memory.confidence * 100;
  if (memory.scope_type === "session" && request.session_id) score += 30;
  if (memory.scope_type === "project" && request.project_id) score += 20;
  if (memory.scope_type === "global") score += 10;
  if (memory.layer === "L0") score += 20;
  if (memory.layer === "L1") score += 15;
  const ageHours = (Date.now() - new Date(memory.updated_at).getTime()) / 3600000;
  score += Math.max(0, 12 - ageHours);
  return score;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function resolveScopeType(
  scopeMode: AppConfig["scope"]["default_mode"],
  forcedScope: "global" | "project" | "session" | undefined,
  candidateScope: "global" | "project" | "session"
): "global" | "project" | "session" {
  if (forcedScope) {
    return forcedScope;
  }
  if (candidateScope === "session") {
    return "session";
  }
  if (scopeMode === "project_only") {
    return "project";
  }
  if (scopeMode === "global_only") {
    return "global";
  }
  return candidateScope;
}
