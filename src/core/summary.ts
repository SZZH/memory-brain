import path from "node:path";
import type { MemoryPaths } from "./paths.js";
import { appendUtf8, ensureDir, pathExists, readUtf8, writeUtf8 } from "../utils/fs.js";
import { todayDate } from "../utils/time.js";

export function writeGlobalProfile(
  paths: MemoryPaths,
  profileLines: string[]
): string {
  ensureDir(paths.globalSummariesDir);
  const filePath = path.join(paths.globalSummariesDir, "profile.md");
  if (!pathExists(filePath)) {
    writeUtf8(filePath, "# Global Profile\n\n");
  }
  appendUniqueBulletLines(filePath, profileLines);
  return filePath;
}

export function writeProjectDecision(
  paths: MemoryPaths,
  projectId: string,
  title: string,
  body: string
): string {
  const dir = path.join(paths.projectsSummariesDir, projectId);
  ensureDir(dir);
  const filePath = path.join(dir, "decisions.md");
  if (!pathExists(filePath)) {
    writeUtf8(filePath, "# Project Decisions\n\n");
  }
  appendUtf8(filePath, `## ${title}\n\n${body}\n\n`);
  return filePath;
}

export function appendProjectDailySummary(
  paths: MemoryPaths,
  projectId: string,
  body: string
): string {
  const dir = path.join(paths.projectsSummariesDir, projectId, "summaries");
  ensureDir(dir);
  const filePath = path.join(dir, `${todayDate()}.md`);
  if (!pathExists(filePath)) {
    writeUtf8(filePath, "# Daily Summary\n\n");
  }
  appendUtf8(filePath, `## ${new Date().toISOString()}\n\n${body}\n\n`);
  return filePath;
}

export function writeSessionSummary(
  paths: MemoryPaths,
  sessionId: string,
  summary: string
): string {
  ensureDir(paths.sessionsSummariesDir);
  const filePath = path.join(paths.sessionsSummariesDir, `${sessionId}.md`);
  writeUtf8(filePath, `# Session Summary\n\n${summary}\n`);
  return filePath;
}

export function writeSessionArchive(
  paths: MemoryPaths,
  sessionId: string,
  content: string
): string {
  const dir = path.join(paths.sessionArchivesDir, sessionId);
  ensureDir(dir);
  const filePath = path.join(dir, "raw.md");
  writeUtf8(filePath, content);
  return filePath;
}

function appendUniqueBulletLines(filePath: string, lines: string[]): void {
  const existing = pathExists(filePath) ? readUtf8(filePath) : "";
  const existingLines = new Set(existing.split("\n").map((line) => line.trim()).filter(Boolean));
  const additions = lines
    .map((line) => line.trim())
    .filter((line) => line && !existingLines.has(line))
    .map((line) => `${line}\n`)
    .join("");
  if (additions) {
    appendUtf8(filePath, additions);
  }
}
