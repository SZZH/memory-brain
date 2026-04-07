import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { MemoryBrain } from "../src/core/brain.js";

test("remembering the same key supersedes the previous record", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-supersede-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const sessionId = "sess_supersede";
  try {
    const first = brain.remember({
      content: "以后默认中文回答。",
      workspacePath: process.cwd(),
      sessionId
    });
    const second = brain.remember({
      content: "以后默认中文回答，并且尽量简洁。",
      workspacePath: process.cwd(),
      sessionId
    });
    assert.ok(first.memoryIds[0]);
    assert.ok(second.memoryIds[0]);
    const original = brain.store.getMemoryById(first.memoryIds[0]);
    const replacement = brain.store.getMemoryById(second.memoryIds[0]);
    assert.equal(original?.status, "superseded");
    assert.equal(original?.superseded_by_memory_id, second.memoryIds[0]);
    assert.equal(replacement?.supersedes_memory_id, first.memoryIds[0]);
  } finally {
    brain.uninstall();
  }
});

test("remember logs candidate persistence failures for retry", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-failure-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const sessionId = "sess_failure";
  const store = brain.store as typeof brain.store & {
    insertMemory: typeof brain.store.insertMemory;
  };
  const originalInsertMemory = store.insertMemory;
  store.insertMemory = () => {
    throw new Error("boom");
  };
  try {
    assert.throws(
      () =>
        brain.remember({
          content: "以后默认中文回答。",
          workspacePath: process.cwd(),
          sessionId
        }),
      /remember failed/
    );
    const logPath = path.join(home, "logs", "remember-failures.ndjson");
    const logContent = readFileSync(logPath, "utf8");
    assert.match(logContent, /boom/);
    assert.match(logContent, /以后默认中文回答/);
  } finally {
    store.insertMemory = originalInsertMemory;
    brain.uninstall();
  }
});
