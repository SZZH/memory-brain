#!/usr/bin/env node
import { Command } from "commander";
import * as p from "@clack/prompts";
import process from "node:process";
import { MemoryBrain } from "./core/brain.js";
import { DEFAULT_HOME, PRESET_RULES } from "./core/defaults.js";
import { buildPaths } from "./core/paths.js";
import { configExists, requireConfig } from "./core/config.js";
import { installSkillBundle } from "./core/skill.js";
import type { EmbeddingConfig, EmbeddingMode } from "./types.js";

const program = new Command();

program
  .name("memory-brain")
  .description("Local-first long-term memory runtime for agent skills.")
  .version("0.1.0");

program
  .command("setup")
  .description("Initialize Memory Brain and install the skill plus host auto-recall rules.")
  .option("--host <host>", "Target host: codex|claude", "codex")
  .option("--home <path>", "Memory home path")
  .option("--target <dir>", "Explicit target directory for the skill bundle")
  .action(async (options) => {
    const home = options.home ?? DEFAULT_HOME;
    const initialized = !configExists(home);
    if (initialized) {
      const brain = await MemoryBrain.initialize({ home });
      brain.close();
    }
    const skill = installSkillBundle({
      host: options.host,
      targetDir: options.target
    });
    printObject({
      initialized,
      home: buildPaths(home).home,
      skill
    });
  });

program
  .command("init")
  .description("Advanced: run the interactive initialization wizard.")
  .option("--home <path>", "Custom memory home path")
  .option("--defaults", "Initialize non-interactively with defaults", false)
  .action(async (options) => {
    if (options.defaults) {
      const brain = await MemoryBrain.initialize({
        home: options.home ?? DEFAULT_HOME
      });
      brain.close();
      console.log(
        JSON.stringify(
          {
            initialized: true,
            home: buildPaths(options.home ?? DEFAULT_HOME).home
          },
          null,
          2
        )
      );
      return;
    }
    p.intro("Memory Brain initialization");
    const existingHome = options.home ?? DEFAULT_HOME;
    if (configExists(existingHome)) {
      p.note(`Existing config detected at ${buildPaths(existingHome).configFile}`);
    }
    const storageChoice = await p.select({
      message: "Storage location",
      initialValue: "default",
      options: [
        { value: "default", label: `Use default (${DEFAULT_HOME})` },
        { value: "custom", label: "Choose a custom path" }
      ]
    });
    if (p.isCancel(storageChoice)) return cancel();
    const customHome =
      storageChoice === "custom"
        ? await p.text({
            message: "Custom memory home path",
            placeholder: DEFAULT_HOME,
            validate: (value) => (value.trim() ? undefined : "Path is required")
          })
        : DEFAULT_HOME;
    if (p.isCancel(customHome)) return cancel();
    const language = await p.select({
      message: "Default language",
      initialValue: "zh-CN",
      options: [
        { value: "zh-CN", label: "Chinese (zh-CN)" },
        { value: "en-US", label: "English (en-US)" },
        { value: Intl.DateTimeFormat().resolvedOptions().locale, label: "Follow system locale" }
      ]
    });
    if (p.isCancel(language)) return cancel();
    const responseStyle = await p.select({
      message: "Default response style",
      initialValue: "engineering_concise",
      options: [
        { value: "concise", label: "concise" },
        { value: "engineering_concise", label: "engineering_concise" },
        { value: "detailed", label: "detailed" }
      ]
    });
    if (p.isCancel(responseStyle)) return cancel();
    const scopeMode = await p.select({
      message: "Default memory scope mode",
      initialValue: "project_and_global",
      options: [
        { value: "project_and_global", label: "Project + global preferences" },
        { value: "project_only", label: "Project only" },
        { value: "global_only", label: "Global preferences across all projects" }
      ]
    });
    if (p.isCancel(scopeMode)) return cancel();
    const memoryMode = await p.select({
      message: "Memory mode",
      initialValue: "balanced",
      options: [
        { value: "safe", label: "safe" },
        { value: "balanced", label: "balanced" },
        { value: "aggressive", label: "aggressive" }
      ]
    });
    if (p.isCancel(memoryMode)) return cancel();
    const rulePreset = await p.multiselect({
      message: "Long-term rule presets",
      options: PRESET_RULES.map((rule) => ({
        value: rule.id,
        label: rule.label
      }))
    });
    if (p.isCancel(rulePreset)) return cancel();
    const semanticMode = await p.select({
      message: "Semantic retrieval configuration",
      initialValue: "none",
      options: [
        { value: "none", label: "Disable semantic search for now" },
        { value: "api", label: "Use an API-based embedding provider" },
        { value: "local_model", label: "Use a local embedding model (not implemented yet)" }
      ]
    });
    if (p.isCancel(semanticMode)) return cancel();
    let embedding: Partial<EmbeddingConfig> | undefined = undefined;
    if (semanticMode !== "none") {
      const provider = await p.text({
        message: "Provider name",
        placeholder: semanticMode === "api" ? "openai-compatible" : "local-model"
      });
      if (p.isCancel(provider)) return cancel();
      const baseUrl =
        semanticMode === "api"
          ? await p.text({
              message: "Base URL",
              placeholder: "https://api.example.com/v1"
            })
          : "";
      if (p.isCancel(baseUrl)) return cancel();
      const apiKeyEnv =
        semanticMode === "api"
          ? await p.text({
              message: "API key environment variable name",
              placeholder: "OPENAI_API_KEY"
            })
          : "";
      if (p.isCancel(apiKeyEnv)) return cancel();
      const model = await p.text({
        message: "Model name",
        placeholder: semanticMode === "api" ? "text-embedding-3-small" : "bge-small"
      });
      if (p.isCancel(model)) return cancel();
      embedding = {
        provider_type: semanticMode as EmbeddingMode,
        provider,
        base_url: typeof baseUrl === "string" ? baseUrl : "",
        api_key_env: typeof apiKeyEnv === "string" ? apiKeyEnv : "",
        model: typeof model === "string" ? model : ""
      };
    }
    const confirmed = await p.confirm({
      message: "Confirm and initialize?",
      initialValue: true
    });
    if (p.isCancel(confirmed) || !confirmed) return cancel();
    const brain = await MemoryBrain.initialize({
      home: typeof customHome === "string" ? customHome : DEFAULT_HOME,
      language: String(language),
      responseStyle: responseStyle as never,
      scopeMode: scopeMode as never,
      memoryMode: memoryMode as never,
      rules: rulePreset as string[],
      semanticEnabled: semanticMode !== "none",
      embedding
    });
    brain.close();
    p.note(`Default memory home:\n  ${buildPaths(String(customHome)).home}`);
    p.outro("Memory Brain initialized.");
  });

program
  .command("install-skill")
  .description("Advanced: install only the bundled Memory Brain skill. For Codex and Claude, host auto-recall rules are installed too.")
  .option("--host <host>", "Target host: codex|claude", "codex")
  .option("--target <dir>", "Explicit target directory for the skill bundle")
  .action((options) => {
    const result = installSkillBundle({
      host: options.host,
      targetDir: options.target
    });
    printObject(result);
  });

program
  .command("status")
  .description("Show runtime paths and configuration state.")
  .option("--home <path>")
  .action(async (options) => withBrain(options.home, async (brain) => printObject(brain.status())));

program
  .command("doctor")
  .description("Run health checks.")
  .option("--home <path>")
  .action(async (options) => {
    await withBrain(options.home, async (brain) => {
      const checks = await brain.doctor();
      for (const check of checks) {
        console.log(`${check.ok ? "OK" : "FAIL"}  ${check.name}  ${check.details}`);
      }
      if (checks.some((check) => !check.ok)) {
        process.exitCode = 1;
      }
    });
  });

program
  .command("remember")
  .description("Extract and persist memory from text.")
  .requiredOption("--text <text>", "Input text")
  .option("--home <path>", "Memory home path")
  .option("--scope <scope>", "Force scope: global|project|session")
  .option("--workspace <path>", "Workspace path for project scope", process.cwd())
  .option("--git-root <path>", "Optional git root")
  .option("--session <id>", "Session ID")
  .option("--source <source>", "Source tag", "cli")
  .action(async (options) =>
    withBrain(options.home, async (brain) => {
      const result = brain.remember({
        content: options.text,
        scopeHint: options.scope,
        workspacePath: options.workspace,
        gitRoot: options.gitRoot,
        sessionId: options.session,
        source: options.source
      });
      printObject(result);
    })
  );

program
  .command("recall")
  .description("Recall relevant memories as prompt-ready context blocks.")
  .requiredOption("--task <task>", "Task description")
  .option("--home <path>", "Memory home path")
  .option("--workspace <path>", "Workspace path", process.cwd())
  .option("--git-root <path>", "Optional git root")
  .option("--session <id>", "Session ID")
  .option("--token-budget <n>", "Token budget", parseInt)
  .option("--debug", "Include selected and dropped IDs", false)
  .action(async (options) =>
    withBrain(options.home, async (brain) => {
      const result = await brain.recall({
        task: options.task,
        workspacePath: options.workspace,
        gitRoot: options.gitRoot,
        sessionId: options.session,
        tokenBudget: options.tokenBudget,
        debug: options.debug
      });
      printObject(result);
    })
  );

program
  .command("summarize-session")
  .description("Summarize a session, write archives, and persist L2 memory.")
  .requiredOption("--session <id>", "Session ID")
  .option("--home <path>", "Memory home path")
  .option("--workspace <path>", "Workspace path", process.cwd())
  .option("--git-root <path>", "Optional git root")
  .action(async (options) =>
    withBrain(options.home, async (brain) => {
      printObject(
        brain.summarizeSession({
          sessionId: options.session,
          workspacePath: options.workspace,
          gitRoot: options.gitRoot
        })
      );
    })
  );

program
  .command("inspect")
  .description("Inspect a memory record or recent retrieval logs.")
  .option("--home <path>", "Memory home path")
  .option("--memory-id <id>", "Memory ID")
  .option("--limit <n>", "Retrieval log limit", parseInt, 10)
  .action(async (options) =>
    withBrain(options.home, async (brain) => {
      printObject(
        brain.inspect({
          memoryId: options.memoryId,
          retrievalLimit: options.limit
        })
      );
    })
  );

program
  .command("enable-embedding")
  .description("Enable semantic retrieval with a provider-neutral config.")
  .option("--home <path>", "Memory home path")
  .requiredOption("--provider-type <type>", "api|custom_vendor|self_hosted|local_model")
  .requiredOption("--provider <name>", "Provider name")
  .requiredOption("--model <name>", "Model name")
  .option("--base-url <url>", "Base URL")
  .option("--api-key-env <name>", "Embedding API key environment variable")
  .option("--dimension <n>", "Embedding dimension", parseInt)
  .option("--transport <name>", "Transport type")
  .action(async (options) =>
    withBrain(options.home, async (brain) => {
      brain.enableEmbedding({
        providerType: options.providerType,
        provider: options.provider,
        model: options.model,
        baseUrl: options.baseUrl,
        apiKeyEnv: options.apiKeyEnv,
        dimension: options.dimension,
        transport: options.transport
      });
      console.log("Semantic retrieval enabled.");
    })
  );

program
  .command("disable-embedding")
  .description("Disable semantic retrieval.")
  .option("--home <path>", "Memory home path")
  .action(async (options) =>
    withBrain(options.home, async (brain) => {
      brain.disableEmbedding();
      console.log("Semantic retrieval disabled.");
    })
  );

program
  .command("uninstall")
  .description("Remove the memory home directory.")
  .option("--home <path>", "Memory home path")
  .option("--yes", "Confirm removal without prompt", false)
  .action(async (options) => {
    const confirmed =
      options.yes ||
      (await p.confirm({
        message: `Delete ${options.home ?? DEFAULT_HOME}?`,
        initialValue: false
      }));
    if (p.isCancel(confirmed) || !confirmed) return cancel();
    await withBrain(options.home, async (brain) => {
      brain.uninstall();
      console.log("Removed memory home.");
    });
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exit(1);
});

async function withBrain(
  home: string | undefined,
  fn: (brain: MemoryBrain) => void | Promise<void>
): Promise<void> {
  requireConfig(home);
  const brain = await MemoryBrain.create(home);
  try {
    await fn(brain);
  } finally {
    brain.close();
  }
}

function printObject(value: unknown): void {
  console.log(JSON.stringify(value, null, 2));
}

function cancel(): void {
  p.cancel("Cancelled.");
  process.exit(1);
}
