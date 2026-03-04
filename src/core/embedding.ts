import OpenAI from "openai";
import type { EmbeddingConfig } from "../types.js";

export interface EmbeddingProvider {
  name(): string;
  healthCheck(): Promise<boolean>;
  embed(texts: string[]): Promise<number[][]>;
  dimension(): Promise<number>;
}

export class DisabledEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config: EmbeddingConfig) {}

  name(): string {
    return this.config.provider || "none";
  }

  async healthCheck(): Promise<boolean> {
    return this.config.provider_type === "none";
  }

  async embed(): Promise<number[][]> {
    throw new Error("Semantic search is disabled.");
  }

  async dimension(): Promise<number> {
    return this.config.dimension;
  }
}

class OpenAICompatibleEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;

  constructor(private readonly config: EmbeddingConfig) {
    const apiKey = process.env[config.api_key_env];
    if (!apiKey) {
      throw new Error(`Environment variable ${config.api_key_env} is not set.`);
    }
    this.client = new OpenAI({
      apiKey,
      baseURL: config.base_url
    });
  }

  name(): string {
    return this.config.provider;
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.embed(["health check"]);
      return true;
    } catch {
      return false;
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: this.config.model,
      input: texts
    });
    return response.data.map((item) => item.embedding);
  }

  async dimension(): Promise<number> {
    if (this.config.dimension > 0) {
      return this.config.dimension;
    }
    const vectors = await this.embed(["dimension probe"]);
    return vectors[0]?.length ?? 0;
  }
}

export function createEmbeddingProvider(
  config: EmbeddingConfig
): EmbeddingProvider {
  if (config.provider_type === "none") {
    return new DisabledEmbeddingProvider(config);
  }
  if (
    config.provider_type === "api" ||
    config.provider_type === "custom_vendor" ||
    config.provider_type === "self_hosted"
  ) {
    return new OpenAICompatibleEmbeddingProvider(config);
  }
  throw new Error(`Embedding provider type '${config.provider_type}' is not implemented yet.`);
}

export function validateEmbeddingConfig(config: EmbeddingConfig): string[] {
  if (config.provider_type === "none") {
    return [];
  }
  const errors: string[] = [];
  if (!config.provider) errors.push("embedding.provider is required");
  if (!config.model) errors.push("embedding.model is required");
  if (config.provider_type !== "local_model" && !config.base_url) {
    errors.push("embedding.base_url is required");
  }
  if (config.provider_type !== "local_model" && !config.api_key_env) {
    errors.push("embedding.api_key_env is required");
  }
  if (
    config.provider_type === "local_model" &&
    !config.model
  ) {
    errors.push("embedding.model is required for local models");
  }
  if (config.provider_type === "local_model") {
    errors.push("embedding.provider_type=local_model is not implemented yet");
  }
  return errors;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return -1;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return -1;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
