import path from "node:path";
import { expandHome } from "../utils/fs.js";

export interface MemoryPaths {
  home: string;
  configDir: string;
  configFile: string;
  dataDir: string;
  databaseFile: string;
  summariesDir: string;
  globalSummariesDir: string;
  projectsSummariesDir: string;
  sessionsSummariesDir: string;
  archivesDir: string;
  projectArchivesDir: string;
  sessionArchivesDir: string;
  indexesDir: string;
  ftsDir: string;
  semanticDir: string;
  adaptersDir: string;
  logsDir: string;
}

export function buildPaths(homeInput: string): MemoryPaths {
  const home = expandHome(homeInput);
  return {
    home,
    configDir: path.join(home, "config"),
    configFile: path.join(home, "config", "config.toml"),
    dataDir: path.join(home, "data"),
    databaseFile: path.join(home, "data", "memory.db"),
    summariesDir: path.join(home, "data", "summaries"),
    globalSummariesDir: path.join(home, "data", "summaries", "global"),
    projectsSummariesDir: path.join(home, "data", "summaries", "projects"),
    sessionsSummariesDir: path.join(home, "data", "summaries", "sessions"),
    archivesDir: path.join(home, "data", "archives"),
    projectArchivesDir: path.join(home, "data", "archives", "projects"),
    sessionArchivesDir: path.join(home, "data", "archives", "sessions"),
    indexesDir: path.join(home, "data", "indexes"),
    ftsDir: path.join(home, "data", "indexes", "fts"),
    semanticDir: path.join(home, "data", "indexes", "semantic"),
    adaptersDir: path.join(home, "adapters"),
    logsDir: path.join(home, "logs")
  };
}
