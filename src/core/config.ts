import { parse as parseToml } from "toml";
import { stringify as stringifyToml } from "smol-toml";
import { defaultConfig } from "./defaults.js";
import { buildPaths } from "./paths.js";
import { ensureDir, pathExists, readUtf8, writeUtf8 } from "../utils/fs.js";
import type { AppConfig } from "../types.js";

function mergeConfig(base: AppConfig, loaded: Partial<AppConfig>): AppConfig {
  return {
    ...base,
    ...loaded,
    user: { ...base.user, ...loaded.user },
    storage: { ...base.storage, ...loaded.storage },
    scope: { ...base.scope, ...loaded.scope },
    memory: { ...base.memory, ...loaded.memory },
    search: { ...base.search, ...loaded.search },
    embedding: { ...base.embedding, ...loaded.embedding },
    adapters: { ...base.adapters, ...loaded.adapters },
    rules: loaded.rules ?? base.rules
  };
}

export function loadConfig(home?: string): AppConfig {
  const base = defaultConfig(home);
  const paths = buildPaths(base.storage.home);
  if (!pathExists(paths.configFile)) {
    return base;
  }
  const parsed = parseToml(readUtf8(paths.configFile)) as Partial<AppConfig>;
  const merged = mergeConfig(base, parsed);
  merged.storage.home = paths.home;
  return merged;
}

export function saveConfig(config: AppConfig): void {
  const paths = buildPaths(config.storage.home);
  ensureDir(paths.configDir);
  writeUtf8(paths.configFile, stringifyToml(config));
}

export function configExists(home?: string): boolean {
  const base = defaultConfig(home);
  const paths = buildPaths(base.storage.home);
  return pathExists(paths.configFile);
}

export function requireConfig(home?: string): void {
  if (!configExists(home)) {
    throw new Error(
      `Memory Brain is not initialized. Run 'memory-brain init' first for ${buildPaths(defaultConfig(home).storage.home).home}.`
    );
  }
}
