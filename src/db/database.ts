import initSqlJs from "sql.js";
import path from "node:path";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { ensureDir, pathExists } from "../utils/fs.js";
import { SCHEMA_SQL } from "./schema.js";

type SqlValue = string | number | Uint8Array | null;
type BindParams = SqlValue[] | Record<string, SqlValue> | undefined;

export interface DatabaseConnection {
  close(): void;
  exec(sql: string): void;
  prepare(sql: string): PreparedStatement;
  run(sql: string, params?: BindParams): { changes: number };
  save(): void;
}

export interface PreparedStatement {
  run(params?: BindParams): { changes: number };
  get<T>(...params: SqlValue[]): T | undefined;
  all<T>(...params: SqlValue[]): T[];
}

type SqlJsDatabase = any;
type SqlJsStatic = any;

class SqlJsDatabaseConnection implements DatabaseConnection {
  constructor(
    private readonly db: SqlJsDatabase,
    private readonly databaseFile: string
  ) {}

  close(): void {
    this.save();
    this.db.close();
  }

  exec(sql: string): void {
    this.db.run(sql);
    this.save();
  }

  prepare(sql: string): PreparedStatement {
    return new SqlJsPreparedStatement(this.db, sql, () => this.save());
  }

  run(sql: string, params?: BindParams): { changes: number } {
    this.db.run(sql, normalizeParams(params));
    const changes = this.db.getRowsModified();
    this.save();
    return { changes };
  }

  save(): void {
    ensureDir(path.dirname(this.databaseFile));
    writeFileSync(this.databaseFile, this.db.export());
  }
}

class SqlJsPreparedStatement implements PreparedStatement {
  constructor(
    private readonly db: SqlJsDatabase,
    private readonly sql: string,
    private readonly onWrite: () => void
  ) {}

  run(params?: BindParams): { changes: number } {
    const stmt = this.db.prepare(this.sql);
    try {
      if (params !== undefined) {
        stmt.bind(normalizeParams(params));
      }
      while (stmt.step()) {
        // Drain rows for statements that can return results.
      }
    } finally {
      stmt.free();
    }
    const changes = this.db.getRowsModified();
    this.onWrite();
    return { changes };
  }

  get<T>(...params: SqlValue[]): T | undefined {
    const stmt = this.db.prepare(this.sql);
    try {
      if (params.length > 0) {
        stmt.bind(normalizeParams(params));
      }
      if (!stmt.step()) {
        return undefined;
      }
      return stmt.getAsObject() as T;
    } finally {
      stmt.free();
    }
  }

  all<T>(...params: SqlValue[]): T[] {
    const stmt = this.db.prepare(this.sql);
    try {
      if (params.length > 0) {
        stmt.bind(normalizeParams(params));
      }
      const rows: T[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as T);
      }
      return rows;
    } finally {
      stmt.free();
    }
  }
}


function normalizeParams(params?: BindParams): BindParams {
  if (!params || Array.isArray(params)) {
    return params;
  }
  const normalized: Record<string, SqlValue> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith(":") || key.startsWith("@") || key.startsWith("$")) {
      normalized[key] = value;
    } else {
      normalized[`@${key}`] = value;
    }
  }
  return normalized;
}

let sqlJsPromise: Promise<SqlJsStatic> | undefined;

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const require = createRequire(import.meta.url);
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    sqlJsPromise = initSqlJs({
      locateFile: (file) => {
        if (file.endsWith(".wasm")) {
          return wasmPath;
        }
        return file;
      }
    });
  }
  return sqlJsPromise;
}

export async function openDatabase(databaseFile: string): Promise<DatabaseConnection> {
  ensureDir(path.dirname(databaseFile));
  const SQL = await loadSqlJs();
  const data = pathExists(databaseFile) ? readFileSync(databaseFile) : undefined;
  const db = new SQL.Database(data);
  db.run("PRAGMA foreign_keys = ON");
  db.run(SCHEMA_SQL);
  const connection = new SqlJsDatabaseConnection(db, databaseFile);
  connection.save();
  return connection;
}
