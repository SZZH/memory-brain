import path from "node:path";
import { stableHash } from "../utils/id.js";

export interface ProjectDescriptor {
  id: string;
  workspace_path: string;
  git_root: string | null;
  name: string;
}

export function resolveProject(
  workspacePath: string,
  gitRoot?: string | null
): ProjectDescriptor {
  const normalizedWorkspace = path.resolve(workspacePath);
  const identityBase = gitRoot ? path.resolve(gitRoot) : normalizedWorkspace;
  const name = path.basename(identityBase);
  return {
    id: stableHash(identityBase),
    workspace_path: normalizedWorkspace,
    git_root: gitRoot ? path.resolve(gitRoot) : null,
    name
  };
}
