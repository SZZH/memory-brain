import type { DatabaseConnection } from "../db/database.js";
import type {
  CandidateMemory,
  MemoryEmbeddingRecord,
  MemoryRecord,
  RecallRequest,
  ScopeType
} from "../types.js";
import { makeId } from "../utils/id.js";
import { nowIso } from "../utils/time.js";

export class MemoryStore {
  constructor(private readonly db: DatabaseConnection) {}

  private readonly activeClause = `
    status = 'active'
    AND (
      ttl_seconds IS NULL
      OR ttl_seconds <= 0
      OR (strftime('%s', created_at) + ttl_seconds) > strftime('%s', 'now')
    )
  `;

  upsertProject(project: {
    id: string;
    user_id: string;
    workspace_path: string;
    git_root: string | null;
    name: string;
  }): void {
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO projects (id, user_id, workspace_path, git_root, name, created_at, updated_at)
         VALUES (@id, @user_id, @workspace_path, @git_root, @name, @created_at, @updated_at)
         ON CONFLICT(id) DO UPDATE SET
           workspace_path = excluded.workspace_path,
           git_root = excluded.git_root,
           name = excluded.name,
           updated_at = excluded.updated_at`
      )
      .run({ ...project, created_at: now, updated_at: now });
  }

  insertRawEvent(input: {
    user_id: string;
    agent_id?: string | null;
    session_id?: string;
    project_id?: string;
    source?: string;
    content: string;
    metadata_json?: string;
  }): string {
    const id = makeId("evt");
    this.db
      .prepare(
        `INSERT INTO raw_events
          (id, user_id, agent_id, session_id, project_id, source, content, metadata_json, created_at)
         VALUES
          (@id, @user_id, @agent_id, @session_id, @project_id, @source, @content, @metadata_json, @created_at)`
      )
      .run({
        id,
        user_id: input.user_id,
        agent_id: input.agent_id ?? null,
        session_id: input.session_id ?? null,
        project_id: input.project_id ?? null,
        source: input.source ?? "cli",
        content: input.content,
        metadata_json: input.metadata_json ?? null,
        created_at: nowIso()
      });
    return id;
  }

  insertMemory(input: {
    user_id: string;
    agent_id?: string | null;
    scope_type: ScopeType;
    scope_id: string;
    layer: string;
    candidate: CandidateMemory;
    source_event_id?: string;
  }): string {
    const existing = input.candidate.key
      ? this.findActiveMemoryByKey(
          input.scope_type,
          input.scope_id,
          input.candidate.key
        )
      : null;
    const id = existing?.id ?? makeId("mem");
    const now = nowIso();
    this.db
      .prepare(
        `INSERT INTO memories
          (id, user_id, agent_id, scope_type, scope_id, layer, type, subject, memory_key, value_json, summary, confidence, status, source_event_id, ttl_seconds, created_at, updated_at, last_accessed_at)
         VALUES
          (@id, @user_id, @agent_id, @scope_type, @scope_id, @layer, @type, @subject, @memory_key, @value_json, @summary, @confidence, @status, @source_event_id, @ttl_seconds, @created_at, @updated_at, @last_accessed_at)
         ON CONFLICT(id) DO UPDATE SET
          layer = excluded.layer,
          type = excluded.type,
          subject = excluded.subject,
          memory_key = excluded.memory_key,
          value_json = excluded.value_json,
          summary = excluded.summary,
          confidence = excluded.confidence,
          status = excluded.status,
          source_event_id = excluded.source_event_id,
          ttl_seconds = excluded.ttl_seconds,
          updated_at = excluded.updated_at`
      )
      .run({
        id,
        user_id: input.user_id,
        agent_id: input.agent_id ?? null,
        scope_type: input.scope_type,
        scope_id: input.scope_id,
        layer: input.layer,
        type: input.candidate.type,
        subject: input.candidate.subject ?? null,
        memory_key: input.candidate.key ?? null,
        value_json:
          input.candidate.value === undefined
            ? null
            : JSON.stringify(input.candidate.value),
        summary: input.candidate.summary,
        confidence: input.candidate.confidence,
        status: "active",
        source_event_id: input.source_event_id ?? null,
        ttl_seconds: input.candidate.ttl_seconds ?? null,
        created_at: existing?.created_at ?? now,
        updated_at: now,
        last_accessed_at: null
      });
    this.refreshFts(id, input.scope_type, input.scope_id, input.layer, input.candidate.summary);
    return id;
  }

  private refreshFts(
    memoryId: string,
    scopeType: string,
    scopeId: string,
    layer: string,
    content: string
  ): void {
    this.db.prepare("DELETE FROM memory_fts WHERE memory_id = ?").run([memoryId]);
    this.db
      .prepare(
        "INSERT INTO memory_fts (memory_id, scope_type, scope_id, layer, content) VALUES (?, ?, ?, ?, ?)"
      )
      .run([memoryId, scopeType, scopeId, layer, content]);
  }

  findActiveMemoryByKey(
    scopeType: ScopeType,
    scopeId: string,
    memoryKey: string
  ): MemoryRecord | undefined {
    return this.db
      .prepare(
        `SELECT * FROM memories
         WHERE scope_type = ? AND scope_id = ? AND memory_key = ? AND ${this.activeClause}
         ORDER BY updated_at DESC
         LIMIT 1`
      )
      .get<MemoryRecord>(scopeType, scopeId, memoryKey);
  }

  getMemoriesByScope(scopeType: ScopeType, scopeId: string): MemoryRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM memories
         WHERE scope_type = ? AND scope_id = ? AND ${this.activeClause}
         ORDER BY updated_at DESC`
      )
      .all<MemoryRecord>(scopeType, scopeId);
  }

  searchMemories(request: RecallRequest): MemoryRecord[] {
    const results: MemoryRecord[] = [];
    const seen = new Set<string>();
    const add = (rows: MemoryRecord[]) => {
      for (const row of rows) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          results.push(row);
        }
      }
    };
    if (request.session_id) {
      add(this.getTopMemories("session", request.session_id, ["L0", "L1"], 8));
    }
    if (request.project_id) {
      add(this.getTopMemories("project", request.project_id, ["L1", "L2"], 12));
    }
    add(this.getTopMemories("global", "global", ["L1", "L2"], 10));
    add(this.searchByText(request.task, 12, request.project_id, request.session_id));
    return results;
  }

  getTopMemories(
    scopeType: ScopeType,
    scopeId: string,
    layers: string[],
    limit: number
  ): MemoryRecord[] {
    const placeholders = layers.map(() => "?").join(", ");
    return this.db
      .prepare(
        `SELECT * FROM memories
         WHERE scope_type = ? AND scope_id = ? AND layer IN (${placeholders}) AND ${this.activeClause}
         ORDER BY confidence DESC, updated_at DESC
         LIMIT ?`
      )
      .all<MemoryRecord>(scopeType, scopeId, ...layers, limit);
  }

  searchByText(
    query: string,
    limit: number,
    projectId?: string,
    sessionId?: string
  ): MemoryRecord[] {
    const terms = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (terms.length === 0) {
      return [];
    }
    const where = terms
      .map(() => "LOWER(f.content) LIKE ?")
      .join(" OR ");
    const rows = this.db
      .prepare(
        `SELECT m.*
         FROM memory_fts f
         JOIN memories m ON m.id = f.memory_id
         WHERE (${where}) AND ${this.activeClause}
         ORDER BY m.confidence DESC, m.updated_at DESC
         LIMIT ?`
      )
      .all<MemoryRecord>(...terms.map((term) => `%${term}%`), limit);
    return rows.filter((row) => {
      if (row.scope_type === "global") return true;
      if (row.scope_type === "project") return row.scope_id === projectId;
      if (row.scope_type === "session") return row.scope_id === sessionId;
      return false;
    });
  }

  getRawEvents(sessionId: string): { content: string; created_at: string }[] {
    return this.db
      .prepare(
        `SELECT content, created_at
         FROM raw_events
         WHERE session_id = ?
         ORDER BY created_at ASC`
      )
      .all<{ content: string; created_at: string }>(sessionId);
  }

  logRetrieval(input: {
    request_id: string;
    user_id: string;
    project_id?: string;
    query_text: string;
    scopes_json: string;
    layers_json: string;
    result_count: number;
    token_budget: number;
  }): void {
    this.db
      .prepare(
        `INSERT INTO retrieval_logs
          (id, request_id, user_id, project_id, query_text, scopes_json, layers_json, result_count, token_budget, created_at)
         VALUES
          (@id, @request_id, @user_id, @project_id, @query_text, @scopes_json, @layers_json, @result_count, @token_budget, @created_at)`
      )
      .run({
        id: makeId("rlog"),
        ...input,
        project_id: input.project_id ?? null,
        created_at: nowIso()
      });
  }

  getRetrievalLog(limit = 20): unknown[] {
    return this.db
      .prepare(
        "SELECT * FROM retrieval_logs ORDER BY created_at DESC LIMIT ?"
      )
      .all(limit);
  }

  getMemoryById(id: string): MemoryRecord | undefined {
    return this.db
      .prepare("SELECT * FROM memories WHERE id = ?")
      .get<MemoryRecord>(id);
  }

  markMemoriesAccessed(ids: string[]): void {
    if (ids.length === 0) return;
    const now = nowIso();
    const stmt = this.db.prepare(
      "UPDATE memories SET last_accessed_at = ? WHERE id = ?"
    );
    for (const id of ids) {
      stmt.run([now, id]);
    }
  }

  expireMemories(): number {
    const result = this.db
      .prepare(
        `UPDATE memories
         SET status = 'expired', updated_at = ?
         WHERE status = 'active'
           AND ttl_seconds IS NOT NULL
           AND ttl_seconds > 0
           AND (strftime('%s', created_at) + ttl_seconds) <= strftime('%s', 'now')`
      )
      .run([nowIso()]);
    return result.changes;
  }

  getEmbedding(memoryId: string): MemoryEmbeddingRecord | undefined {
    return this.db
      .prepare("SELECT * FROM memory_embeddings WHERE memory_id = ?")
      .get<MemoryEmbeddingRecord>(memoryId);
  }

  upsertEmbedding(input: {
    memory_id: string;
    provider: string;
    model: string;
    dimension: number;
    vector: number[];
  }): void {
    this.db
      .prepare(
        `INSERT INTO memory_embeddings
          (memory_id, provider, model, dimension, vector_json, updated_at)
         VALUES
          (@memory_id, @provider, @model, @dimension, @vector_json, @updated_at)
         ON CONFLICT(memory_id) DO UPDATE SET
          provider = excluded.provider,
          model = excluded.model,
          dimension = excluded.dimension,
          vector_json = excluded.vector_json,
          updated_at = excluded.updated_at`
      )
      .run({
        memory_id: input.memory_id,
        provider: input.provider,
        model: input.model,
        dimension: input.dimension,
        vector_json: JSON.stringify(input.vector),
        updated_at: nowIso()
      });
  }
}
