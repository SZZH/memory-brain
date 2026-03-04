import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { copyDir, ensureDir, readUtf8, writeUtf8 } from "../utils/fs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveSkillSourceDir(): string {
  const candidates = [
    path.resolve(__dirname, "..", "..", "skill"),
    path.resolve(__dirname, "..", "..", "..", "skill")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(`Unable to locate bundled skill directory. Checked: ${candidates.join(", ")}`);
}

export interface SkillInstallResult {
  host: string;
  sourceDir: string;
  targetDir: string;
  hostRules?: HostRulesInstallResult;
}

export interface HostRulesInstallResult {
  host: string;
  targetFile: string;
  updated: boolean;
}

export function defaultCodexHome(): string {
  return process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

export function defaultClaudeHome(): string {
  return process.env.CLAUDE_HOME || path.join(os.homedir(), ".claude");
}

function defaultCodexInstructionsFile(): string {
  return path.join(defaultCodexHome(), "AGENTS.md");
}

function defaultClaudeInstructionsFile(): string {
  return path.join(defaultClaudeHome(), "CLAUDE.md");
}

export function resolveSkillTargetDir(input?: {
  host?: string;
  targetDir?: string;
}): { host: string; targetDir: string } {
  if (input?.targetDir) {
    return {
      host: input.host ?? "custom",
      targetDir: path.resolve(input.targetDir)
    };
  }
  const host = input?.host ?? "codex";
  if (host === "codex") {
    return {
      host,
      targetDir: path.join(defaultCodexHome(), "skills", "memory-brain")
    };
  }
  if (host === "claude") {
    return {
      host,
      targetDir: path.join(defaultClaudeHome(), "skills", "memory-brain")
    };
  }
  throw new Error(`Unsupported host '${host}'. Use codex, claude, or --target.`);
}

export function installSkillBundle(input?: {
  host?: string;
  targetDir?: string;
}): SkillInstallResult {
  const sourceDir = resolveSkillSourceDir();
  const resolved = resolveSkillTargetDir(input);
  const targetDir = resolved.targetDir;
  ensureDir(path.dirname(targetDir));
  copyDir(sourceDir, targetDir);
  const scriptPath = path.join(targetDir, "scripts", "memory-brain-skill.sh");
  if (fs.existsSync(scriptPath)) {
    fs.chmodSync(scriptPath, 0o755);
  }
  const hostRules =
    input?.targetDir === undefined && (resolved.host === "codex" || resolved.host === "claude")
      ? installHostRules({ host: resolved.host })
      : undefined;
  return {
    host: resolved.host,
    sourceDir,
    targetDir,
    hostRules
  };
}

export function resolveHostInstructionsTarget(input?: {
  host?: string;
  targetFile?: string;
}): { host: string; targetFile: string } {
  if (input?.targetFile) {
    return {
      host: input.host ?? "custom",
      targetFile: path.resolve(input.targetFile)
    };
  }
  const host = input?.host ?? "codex";
  if (host === "codex") {
    return {
      host,
      targetFile: defaultCodexInstructionsFile()
    };
  }
  if (host === "claude") {
    return {
      host,
      targetFile: defaultClaudeInstructionsFile()
    };
  }
  throw new Error(`Unsupported host '${host}'. Use codex, claude, or --target-file.`);
}

export function installHostRules(input?: {
  host?: string;
  targetFile?: string;
}): HostRulesInstallResult {
  const resolved = resolveHostInstructionsTarget(input);
  const block = hostRulesBlock(resolved.host);
  const existing = fs.existsSync(resolved.targetFile) ? readUtf8(resolved.targetFile) : "";
  if (existing.includes(block.trim())) {
    return {
      host: resolved.host,
      targetFile: resolved.targetFile,
      updated: false
    };
  }
  const next = existing.trim().length === 0 ? block : `${existing.trimEnd()}\n\n${block}`;
  writeUtf8(resolved.targetFile, next);
  return {
    host: resolved.host,
    targetFile: resolved.targetFile,
    updated: true
  };
}

function hostRulesBlock(host: string): string {
  const hostLabel = host === "claude" ? "Claude" : "Codex";
  return [
    `# Memory Brain auto recall for ${hostLabel}`,
    "",
    "This routing rule applies to both Chinese and English user requests.",
    "",
    "Use `memory-brain` by default when the user is asking to remember something, continue prior work, recover project context, recover stable user information, or preserve context for later use. Do not wait for the user to explicitly name the skill when the intent is clear.",
    "",
    "Use `memory-brain` as the default local-memory path when recall or persistence would materially improve the answer. Do not require the user to explicitly name the skill each time.",
    "",
    "Natural-language triggers include both English and Chinese expressions such as:",
    "- \"remember this\" / \"记住这个\"",
    "- \"save this context\" / \"保存当前上下文\"",
    "- \"continue this in another thread\" / \"我一会换线程继续\"",
    "- \"resume what we were doing\" / \"继续刚才那个项目\"",
    "- \"what did we do before\" / \"我们刚才做到哪了\"",
    "- \"pick this up later\" / \"这个回头继续\"",
    "- \"my name is ...\" / \"我的名字叫...\"",
    "- \"default to Chinese\" / \"以后默认中文回答\"",
    "- \"in this project, avoid new dependencies\" / \"这个项目不要引入新依赖\"",
    "- \"this taught me ...\" / \"这件事让我意识到...\"",
    "- \"my experience is ...\" / \"我的经历是...\"",
    "- \"I believe ...\" / \"我长期认为...\"",
    "",
    "Default memory workflow:",
    "1. Before continuation, resumption, multi-step implementation, or work likely to benefit from prior context, call `memory-brain recall --task \"<task>\" --workspace \"<cwd>\" --session \"<session_id>\"`.",
    "2. Compress the returned `context_blocks` into the working prompt.",
    "3. During the session, call `memory-brain remember` for stable, reusable facts such as user identity, language preference, project rules, durable decisions, durable experiences, personal reflections, recurring beliefs, or context likely to matter across threads, even if the user did not explicitly say \"save this\".",
    "4. At topic end or after a meaningful implementation stage, call `memory-brain summarize-session --session \"<session_id>\" --workspace \"<cwd>\"`.",
    "",
    "Recall triggers:",
    "- The user says or clearly implies \"continue\", \"continue from last time\", \"same project\", \"继续\", \"回忆\", \"恢复上下文\", or asks what was decided before.",
    "- The task is complex, multi-step, cross-file, or likely to benefit from project history.",
    "- The user asks about stable personal information, preferences, or previously established project conventions.",
    "- The answer is likely to benefit from the user's stored experiences, reflections, beliefs, lessons learned, or durable self-description.",
    "- The current workspace has ongoing history and recall is likely to improve correctness or reduce re-discovery work.",
    "",
    "Automatic remember triggers:",
    "- The user states stable identity or profile information such as name, role, preferred language, or response style.",
    "- The user shares a durable personal experience, reflection, lesson learned, recurring belief, or long-term viewpoint that is likely to improve future answers.",
    "- The user states project constraints, repository rules, dependency restrictions, architecture choices, or durable naming conventions.",
    "- The user changes stage goals or makes a durable decision such as \"先做 MVP，后面再补 embedding\".",
    "- The conversation reaches a handoff point where later continuation is likely, even if the user did not explicitly say \"save this\".",
    "",
    "Write rules:",
    "- Prefer `global` memory for cross-project user preferences, stable identity information, durable experiences, reflections, and recurring beliefs.",
    "- Prefer `project` memory for repository-specific rules, names, conventions, and durable implementation decisions.",
    "- Prefer `session` memory only for temporary constraints that should not become defaults.",
    "- Persist only information that is explicit, stable, reusable, and likely to matter across turns, sessions, projects, or future personalized answers.",
    "- Do not persist casual chat, temporary guesses, one-off wording, temporary emotions, or information useful only for a single immediate reply.",
    "",
    "Execution style:",
    "- Do not run recall on every single turn, but treat continuation, handoff, project resumption, stable preference capture, identity capture, and durable personal-context capture as default memory-brain cases rather than optional ones.",
    "- If `memory-brain` is unavailable or unhealthy, continue the task and briefly note the fallback."
  ].join("\n");
}
