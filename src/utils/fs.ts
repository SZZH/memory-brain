import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function expandHome(inputPath: string): string {
  if (inputPath === "~") {
    return os.homedir();
  }
  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function pathExists(targetPath: string): boolean {
  return fs.existsSync(targetPath);
}

export function readUtf8(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function writeUtf8(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

export function appendUtf8(filePath: string, content: string): void {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, content, "utf8");
}

export function removeDir(targetPath: string): void {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

export function copyDir(sourceDir: string, targetDir: string): void {
  ensureDir(targetDir);
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const from = path.join(sourceDir, entry.name);
    const to = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(from, to);
    } else {
      ensureDir(path.dirname(to));
      fs.copyFileSync(from, to);
    }
  }
}
