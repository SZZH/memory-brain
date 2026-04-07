import test from "node:test";
import assert from "node:assert/strict";
import { extractCandidates } from "../src/core/governance.js";
import { resolveMemoryScope } from "../src/core/brain.js";

test("governance extracts stability-cue preferences and handoff intents", () => {
  const candidates = extractCandidates(
    "以后默认中文回答，always use concise answers，下次继续今天的上下文。",
    "balanced"
  );
  assert.equal(
    candidates.some(
      (candidate) => candidate.key === "language" && candidate.value === "zh-CN"
    ),
    true
  );
  assert.equal(
    candidates.some(
      (candidate) => candidate.key === "response_style" && candidate.value === "concise"
    ),
    true
  );
  assert.equal(
    candidates.some((candidate) => candidate.type === "handoff"),
    true
  );
});

test("low-confidence candidates stay in session unless they are explicitly forced", () => {
  assert.equal(
    resolveMemoryScope("project_and_global", undefined, "global", 0.6),
    "session"
  );
  assert.equal(
    resolveMemoryScope("project_and_global", undefined, "project", 0.9),
    "project"
  );
  assert.equal(
    resolveMemoryScope("project_and_global", "global", "session", 0.1),
    "global"
  );
});
