import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { once } from "node:events";
import { MemoryBrain } from "../src/core/brain.js";

function embeddingForText(text: string): number[] {
  const normalized = text.toLowerCase();
  if (
    normalized.includes("architecture") ||
    normalized.includes("design review") ||
    normalized.includes("system design")
  ) {
    return [1, 0, 0];
  }
  if (
    normalized.includes("bugfix") ||
    normalized.includes("regression") ||
    normalized.includes("hotfix")
  ) {
    return [0, 1, 0];
  }
  return [0, 0, 1];
}

async function startMockEmbeddingServer() {
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/embeddings") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.from(chunk));
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const input = Array.isArray(body.input) ? body.input : [body.input];
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        object: "list",
        data: input.map((text: string, index: number) => ({
          object: "embedding",
          index,
          embedding: embeddingForText(text)
        })),
        model: body.model,
        usage: {
          prompt_tokens: 1,
          total_tokens: 1
        }
      })
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("failed to bind mock server");
  }
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`
  };
}

test("semantic recall supplements lexical recall through an openai-compatible provider", async () => {
  const { server, baseUrl } = await startMockEmbeddingServer();
  const home = path.join(os.tmpdir(), `memory-brain-semantic-${Date.now()}`);
  process.env.MEMORY_BRAIN_TEST_API_KEY = "test-key";
  let brain: MemoryBrain | null = null;
  try {
    brain = await MemoryBrain.initialize({ home });
    brain.enableEmbedding({
      providerType: "api",
      provider: "mock-openai",
      baseUrl,
      apiKeyEnv: "MEMORY_BRAIN_TEST_API_KEY",
      model: "mock-embedding"
    });
    brain.remember({
      content: "This project requires architecture sign-off before implementation.",
      workspacePath: process.cwd(),
      sessionId: "sess_semantic"
    });
    const result = await brain.recall({
      task: "Need a design review before coding",
      workspacePath: process.cwd(),
      sessionId: "sess_semantic",
      debug: true
    });
    assert.equal(
      result.context_blocks.some((block) =>
        block.content.includes("architecture sign-off before implementation")
      ),
      true
    );
  } finally {
    brain?.uninstall();
    server.close();
    delete process.env.MEMORY_BRAIN_TEST_API_KEY;
  }
});
