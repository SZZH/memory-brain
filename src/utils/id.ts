import crypto from "node:crypto";

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export function stableHash(input: string): string {
  return crypto.createHash("sha1").update(input).digest("hex");
}
