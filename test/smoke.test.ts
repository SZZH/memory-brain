import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { MemoryBrain } from "../src/core/brain.js";
import type { ContextBlock } from "../src/types.js";

test("initializes, remembers, recalls, and summarizes", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-test-${Date.now()}`);
  let brain = await MemoryBrain.initialize({ home });
  brain.close();
  brain = await MemoryBrain.create(home);
  const sessionId = "sess_test";
  const rememberResult = brain.remember({
    content: "以后默认用中文回答，这个项目里尽量最小改动。",
    workspacePath: process.cwd(),
    sessionId
  });
  assert.ok(rememberResult.memoryIds.length >= 2);
  const recallResult = await brain.recall({
    task: "继续当前项目实现，保持最小改动并用中文输出",
    workspacePath: process.cwd(),
    sessionId,
    debug: true
  });
  assert.ok(recallResult.context_blocks.length >= 1);
  const summaryResult = brain.summarizeSession({
    sessionId,
    workspacePath: process.cwd()
  });
  assert.ok(summaryResult.summaryMemoryId);
  const profile = readFileSync(path.join(home, "data/summaries/global/profile.md"), "utf8");
  assert.match(profile, /Respond in Chinese by default/);
  brain.uninstall();
});

test("ttl memories expire and stop participating in recall", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-ttl-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const store = brain.store;
  store.insertMemory({
    user_id: brain.config.user.id,
    scope_type: "session",
    scope_id: "sess_ttl",
    layer: "L1",
    candidate: {
      type: "session_boundary",
      key: "ttl_test",
      summary: "This should expire.",
      confidence: 1,
      scope_hint: "session",
      ttl_seconds: 1
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 1100));
  store.expireMemories();
  const recallResult = await brain.recall({
    task: "ttl_test",
    sessionId: "sess_ttl",
    workspacePath: process.cwd()
  });
  assert.equal(recallResult.context_blocks.some((block) => block.content.includes("expire")), false);
  brain.uninstall();
});

test("summarize-session rejects empty sessions", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-empty-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  assert.throws(() => {
    brain.summarizeSession({
      sessionId: "sess_empty",
      workspacePath: process.cwd()
    });
  }, /No raw events found/);
  brain.uninstall();
});

test("auto-remembers user identity and project handoff from natural language", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-natural-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const sessionId = "sess_natural";
  const rememberResult = brain.remember({
    content:
      "我的名字叫曾好。记住这个会话的上下文，我一会要在其他线程继续实现。项目的中文名称叫记忆大脑。",
    workspacePath: process.cwd(),
    sessionId
  });
  assert.ok(rememberResult.memoryIds.length >= 3);
  const recallResult = await brain.recall({
    task: "继续记忆大脑这个项目，并按已知用户信息继续",
    workspacePath: process.cwd(),
    sessionId
  });
  const combined = recallResult.context_blocks.map((block: ContextBlock) => block.content).join("\n");
  assert.match(combined, /曾好|记忆大脑|continue in another thread/i);
  brain.uninstall();
});

test("auto-remembers staged project decisions from natural language", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-decision-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const rememberResult = brain.remember({
    content: "这个项目先做MVP，后面再补embedding。",
    workspacePath: process.cwd(),
    sessionId: "sess_decision"
  });
  assert.ok(rememberResult.memoryIds.length >= 1);
  brain.uninstall();
});

test("auto-remembers English durable preferences and constraints", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-english-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const sessionId = "sess_english";
  const rememberResult = brain.remember({
    content:
      "Default to Chinese responses. Do not add new dependencies in this project. Only provide a plan in this round.",
    workspacePath: process.cwd(),
    sessionId
  });
  assert.ok(rememberResult.memoryIds.length >= 2);
  const recallResult = await brain.recall({
    task: "continue this project with known defaults and constraints",
    workspacePath: process.cwd(),
    sessionId
  });
  const combined = recallResult.context_blocks.map((block: ContextBlock) => block.content).join("\n");
  assert.match(combined, /Chinese|dependencies|plan/i);
  brain.uninstall();
});

test("auto-remembers durable reflection insight", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-reflection-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const sessionId = "sess_reflection";
  const rememberResult = brain.remember({
    content: "I learned from this incident that logs must be structured.",
    workspacePath: process.cwd(),
    sessionId
  });
  assert.ok(rememberResult.memoryIds.length >= 1);
  const recallResult = await brain.recall({
    task: "what did I learn from the incident",
    workspacePath: process.cwd(),
    sessionId
  });
  const combined = recallResult.context_blocks.map((block: ContextBlock) => block.content).join("\n");
  assert.match(combined, /logs must be structured|incident/i);
  brain.uninstall();
});

test("staged project decision is recalled from natural language memory", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-decision-recall-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const sessionId = "sess_decision_recall";
  brain.remember({
    content: "这个项目先做MVP，后面再补embedding。",
    workspacePath: process.cwd(),
    sessionId
  });
  const recallResult = await brain.recall({
    task: "回忆一下这个项目当前阶段计划",
    workspacePath: process.cwd(),
    sessionId
  });
  const combined = recallResult.context_blocks.map((block: ContextBlock) => block.content).join("\n");
  assert.match(combined, /first MVP, then embedding|mvp/i);
  brain.uninstall();
});

test("auto-remembers branch deletion approval rule after merge to main", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-branch-rule-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const sessionId = "sess_branch_rule";
  const rememberResult = brain.remember({
    content:
      "sts2-guide 项目规则：如果 bugfix 或 feature 分支的改动已经合并到 main，只有在用户明确允许后，才删除该分支。",
    workspacePath: process.cwd(),
    sessionId
  });
  assert.ok(rememberResult.memoryIds.length >= 1);
  const recallResult = await brain.recall({
    task: "这个项目里，分支合并到 main 后什么时候才能删除？",
    workspacePath: process.cwd(),
    sessionId
  });
  const combined = recallResult.context_blocks.map((block: ContextBlock) => block.content).join("\n");
  assert.match(combined, /explicit user approval|delete the branch only with explicit user approval/i);
  brain.uninstall();
});

test("auto-remembers default delivery target for sending local files to the user", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-delivery-target-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const sessionId = "sess_delivery_target";
  const rememberResult = brain.remember({
    content: "以后当我说把电脑里的内容发给我时，默认发到微信文件传输助手。",
    workspacePath: process.cwd(),
    sessionId
  });
  assert.ok(rememberResult.memoryIds.length >= 1);
  const recallResult = await brain.recall({
    task: "回忆用户把电脑里的内容发给自己时的默认发送目标",
    workspacePath: process.cwd(),
    sessionId
  });
  const combined = recallResult.context_blocks.map((block: ContextBlock) => block.content).join("\n");
  assert.match(combined, /File Transfer Assistant|文件传输助手/i);
  brain.uninstall();
});

test("explicit remember intent persists unsupported global preference as fallback summary", async () => {
  const home = path.join(os.tmpdir(), `memory-brain-explicit-remember-${Date.now()}`);
  const brain = await MemoryBrain.initialize({ home });
  const sessionId = "sess_explicit_remember";
  const rememberResult = brain.remember({
    content: "记住这个：以后当我让你把电脑里的内容发给自己时，默认发到企业微信收藏。",
    workspacePath: process.cwd(),
    sessionId
  });
  assert.ok(rememberResult.memoryIds.length >= 1);
  const recallResult = await brain.recall({
    task: "回忆用户明确要求记住的默认发送目标",
    workspacePath: process.cwd(),
    sessionId
  });
  const combined = recallResult.context_blocks.map((block: ContextBlock) => block.content).join("\n");
  assert.match(combined, /企业微信收藏|默认发到企业微信收藏/i);
  brain.uninstall();
});
