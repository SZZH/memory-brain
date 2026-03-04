import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtempSync, readFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const tsxBin = path.join(process.cwd(), "node_modules", ".bin", "tsx");

async function runCli(args: string[], env?: NodeJS.ProcessEnv) {
  return execFileAsync(tsxBin, ["src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...env }
  });
}

test("cli refuses status before initialization", async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "memory-brain-cli-empty-"));
  await assert.rejects(
    runCli(["status", "--home", home]),
    /Memory Brain is not initialized/
  );
});

test("cli install-skill copies the bundled skill", async () => {
  const codexHome = mkdtempSync(path.join(os.tmpdir(), "memory-brain-codex-"));
  const { stdout } = await runCli([
    "install-skill",
    "--target",
    path.join(codexHome, "skills", "memory-brain")
  ]);
  const parsed = JSON.parse(stdout);
  assert.equal(
    parsed.targetDir,
    path.join(codexHome, "skills", "memory-brain")
  );
});

test("cli install-skill supports the claude host default", async () => {
  const claudeHome = mkdtempSync(path.join(os.tmpdir(), "memory-brain-claude-"));
  const { stdout } = await runCli(["install-skill", "--host", "claude"], {
    CLAUDE_HOME: claudeHome
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.host, "claude");
  assert.equal(
    parsed.targetDir,
    path.join(claudeHome, "skills", "memory-brain")
  );
  assert.equal(parsed.hostRules.host, "claude");
  assert.equal(parsed.hostRules.targetFile, path.join(claudeHome, "CLAUDE.md"));
  const content = readFileSync(parsed.hostRules.targetFile, "utf8");
  assert.match(content, /memory-brain summarize-session/);
});

test("cli init supports non-interactive defaults mode", async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "memory-brain-init-"));
  const { stdout } = await runCli(["init", "--home", home, "--defaults"]);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.initialized, true);
  assert.equal(parsed.home, home);
  const status = await runCli(["status", "--home", home]);
  const statusParsed = JSON.parse(status.stdout);
  assert.equal(statusParsed["Memory home"], home);
});

test("cli setup initializes and installs codex integration in one step", async () => {
  const home = mkdtempSync(path.join(os.tmpdir(), "memory-brain-setup-home-"));
  const codexHome = mkdtempSync(path.join(os.tmpdir(), "memory-brain-setup-codex-"));
  const { stdout } = await runCli(["setup", "--host", "codex", "--home", home], {
    CODEX_HOME: codexHome
  });
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.initialized, true);
  assert.equal(parsed.home, home);
  assert.equal(parsed.skill.host, "codex");
  assert.equal(parsed.skill.targetDir, path.join(codexHome, "skills", "memory-brain"));
  assert.equal(parsed.skill.hostRules.host, "codex");
  assert.equal(parsed.skill.hostRules.targetFile, path.join(codexHome, "AGENTS.md"));
  const rules = readFileSync(parsed.skill.hostRules.targetFile, "utf8");
  assert.match(rules, /memory-brain recall/);
});
