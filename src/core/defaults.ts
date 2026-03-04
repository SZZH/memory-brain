import os from "node:os";
import path from "node:path";
import type { AppConfig, RulePreset } from "../types.js";

export const DEFAULT_HOME = path.join(os.homedir(), ".memory-brain");

export const PRESET_RULES: RulePreset[] = [
  {
    id: "zh_engineering_minimal",
    label: "Chinese + engineering-first + minimal changes",
    content:
      "Prefer Chinese responses. Prefer engineering-first answers. Prefer minimal changes."
  },
  {
    id: "zh_concise",
    label: "Chinese + concise answers",
    content: "Prefer Chinese responses. Prefer concise answers."
  },
  {
    id: "en_engineering",
    label: "English + engineering-first",
    content: "Prefer English responses. Prefer engineering-first answers."
  }
];

export function defaultConfig(home = DEFAULT_HOME): AppConfig {
  return {
    user: {
      id: os.userInfo().username,
      language: "zh-CN",
      response_style: "engineering_concise"
    },
    storage: {
      home,
      local_only: true
    },
    scope: {
      default_mode: "project_and_global"
    },
    memory: {
      mode: "balanced",
      auto_remember: true,
      auto_summarize: true,
      token_budget: 1000
    },
    search: {
      fts_enabled: true,
      semantic_enabled: false
    },
    embedding: {
      provider: "none",
      provider_type: "none",
      base_url: "",
      api_key_env: "",
      model: "",
      dimension: 0,
      transport: ""
    },
    adapters: {
      skill_enabled: true,
      mcp_enabled: false
    },
    rules: []
  };
}
