import type { ModelApi, ModelDefinitionConfig } from "../config/types.js";

export const OPENCODE_ZEN_API_BASE_URL = "https://opencode.ai/zen/v1";
export const MODELS_DEV_API_URL = "https://models.dev/api.json";
export const OPENCODE_ZEN_DEFAULT_MODEL = "opencode/claude-opus-4-6";

let cachedModels: ModelDefinitionConfig[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

export const OPENCODE_ZEN_MODEL_ALIASES: Record<string, string> = {
  opus: "claude-opus-4-6",
  "opus-4.6": "claude-opus-4-6",
  "opus-4.5": "claude-opus-4-5",
  "opus-4": "claude-opus-4-6",
  sonnet: "claude-opus-4-6",
  "sonnet-4": "claude-opus-4-6",
  haiku: "claude-opus-4-6",
  "haiku-3.5": "claude-opus-4-6",
  gpt5: "gpt-5.2",
  "gpt-5": "gpt-5.2",
  "gpt-5.1": "gpt-5.1",
  gpt4: "gpt-5.1",
  "gpt-4": "gpt-5.1",
  "gpt-mini": "gpt-5.1-codex-mini",
  o1: "gpt-5.2",
  o3: "gpt-5.2",
  "o3-mini": "gpt-5.1-codex-mini",
  codex: "gpt-5.1-codex",
  "codex-mini": "gpt-5.1-codex-mini",
  "codex-max": "gpt-5.1-codex-max",
  gemini: "gemini-3-pro",
  "gemini-pro": "gemini-3-pro",
  "gemini-3": "gemini-3-pro",
  flash: "gemini-3-flash",
  "gemini-flash": "gemini-3-flash",
  glm: "glm-4.7",
  "glm-free": "glm-4.7",
  minimax: "minimax-m2.5-free",
  "minimax-free": "minimax-m2.5-free",
  "minimax-m2.5": "minimax-m2.5-free",
  "minimax-m2.1": "minimax-m2.1-free",
  kimi: "kimi-k2.5-free",
  "kimi-free": "kimi-k2.5-free",
  "kimi-k2.5": "kimi-k2.5-free",
  "big-pickle": "big-pickle",
  pickle: "big-pickle",
  "gpt-5-nano": "gpt-5-nano",
  nano: "gpt-5-nano",
};

export function resolveOpencodeZenAlias(modelIdOrAlias: string): string {
  const normalized = modelIdOrAlias.toLowerCase().trim();
  return OPENCODE_ZEN_MODEL_ALIASES[normalized] ?? modelIdOrAlias;
}

export function resolveOpencodeZenModelApi(modelId: string): ModelApi {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("gpt-")) {
    return "openai-responses";
  }
  if (lower.startsWith("claude-") || lower.startsWith("minimax-")) {
    return "anthropic-messages";
  }
  if (lower.startsWith("gemini-")) {
    return "google-generative-ai";
  }
  return "openai-completions";
}

function supportsImageInput(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  if (lower.includes("glm") || lower.includes("minimax")) {
    return false;
  }
  return true;
}

export function getOpencodeZenStaticFallbackModels(): ModelDefinitionConfig[] {
  const models = [
    {
      id: "big-pickle",
      name: "Big Pickle",
      reasoning: false,
      contextWindow: 200000,
      maxTokens: 128000,
    },
    {
      id: "kimi-k2.5-free",
      name: "Kimi K2.5 Free",
      reasoning: true,
      contextWindow: 262144,
      maxTokens: 262144,
    },
    {
      id: "minimax-m2.5-free",
      name: "MiniMax M2.5 Free",
      reasoning: false,
      contextWindow: 204800,
      maxTokens: 131072,
    },
    {
      id: "trinity-large-preview-free",
      name: "Trinity Large Preview",
      reasoning: false,
      contextWindow: 131072,
      maxTokens: 131072,
    },
  ];

  return models.map((m) => ({
    ...m,
    api: resolveOpencodeZenModelApi(m.id),
    input: supportsImageInput(m.id) ? (["text", "image"] as const) : (["text"] as const),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }));
}

interface ModelsDevModel {
  id?: string;
  name?: string;
  provider?: string;
  description?: string;
  status?: string | null;
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
  limit?: {
    context?: number;
    output?: number;
  };
  modalities?: {
    input?: string[];
    output?: string[];
  };
  reasoning?: boolean;
}

interface ModelsDevProvider {
  id?: string;
  name?: string;
  models?: Record<string, ModelsDevModel>;
}

interface ModelsDevResponse {
  [providerId: string]: ModelsDevProvider;
}

function isFreeAndActiveModel(model: ModelsDevModel): boolean {
  if (model.status === "deprecated") {
    return false;
  }

  if (!model.cost) {
    return false;
  }

  return model.cost.input === 0 && model.cost.output === 0;
}

function buildModelDefinition(model: ModelsDevModel): ModelDefinitionConfig | null {
  const id = model.id;
  if (!id) {
    return null;
  }

  const name = model.name || id;
  const contextWindow = model.limit?.context || 128000;
  const maxTokens = model.limit?.output || 8192;
  const reasoning = model.reasoning ?? true;

  const input: ("text" | "image")[] = ["text"];
  if (model.modalities?.input?.includes("image")) {
    input.push("image");
  }

  return {
    id,
    name,
    api: resolveOpencodeZenModelApi(id),
    reasoning,
    input,
    cost: {
      input: model.cost?.input || 0,
      output: model.cost?.output || 0,
      cacheRead: model.cost?.cache_read || 0,
      cacheWrite: model.cost?.cache_write || 0,
    },
    contextWindow,
    maxTokens,
  };
}

export async function fetchOpencodeZenModelsFromModelsDev(): Promise<ModelDefinitionConfig[]> {
  const now = Date.now();
  if (cachedModels && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const fetchPromise = fetch(MODELS_DEV_API_URL, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("Request timeout")), 30000);
    });

    const response = await Promise.race([fetchPromise, timeoutPromise]);

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as ModelsDevResponse;

    const opencodeData = data.opencode;
    if (!opencodeData || !opencodeData.models) {
      throw new Error("No opencode models found");
    }

    const freeModels = Object.values(opencodeData.models)
      .filter(isFreeAndActiveModel)
      .map(buildModelDefinition)
      .filter((m): m is ModelDefinitionConfig => m !== null);

    if (freeModels.length === 0) {
      return getOpencodeZenStaticFallbackModels();
    }

    cachedModels = freeModels;
    cacheTimestamp = now;

    return freeModels;
  } catch {
    return getOpencodeZenStaticFallbackModels();
  }
}

export function clearOpencodeZenModelCache(): void {
  cachedModels = null;
  cacheTimestamp = 0;
}

export async function buildOpencodeZenFreeProvider(): Promise<{
  baseUrl: string;
  api: ModelApi;
  authHeader: boolean;
  apiKey: string;
  models: ModelDefinitionConfig[];
}> {
  const models = await fetchOpencodeZenModelsFromModelsDev();
  return {
    baseUrl: OPENCODE_ZEN_API_BASE_URL,
    api: "openai-completions",
    authHeader: false,
    apiKey: "no-auth-required",
    models,
  };
}
