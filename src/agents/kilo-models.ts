import type { ModelApi, ModelDefinitionConfig } from "../config/types.js";

export const KILO_API_BASE_URL = "https://api.kilo.ai/api/openrouter";
export const KILO_MODELS_ENDPOINT = `${KILO_API_BASE_URL}/models`;
export const KILO_DEFAULT_MODEL = "kilo/auto-free";

let cachedModels: ModelDefinitionConfig[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

export const KILO_MODEL_ALIASES: Record<string, string> = {
  auto: "kilo/auto-free",
  router: "openrouter/free",
  bodybuilder: "openrouter/bodybuilder",
  trinity: "arcee-ai/trinity-large-preview:free",
  corethink: "corethink:free",
  "giga-potato": "giga-potato",
  "giga-potato-thinking": "giga-potato-thinking",
  minimax: "minimax/minimax-m2.5:free",
  kimi: "moonshotai/kimi-k2.5:free",
  "kimi-k2.5": "moonshotai/kimi-k2.5:free",
  qwen: "qwen/qwen3-vl-30b-a3b-thinking",
  qwen30b: "qwen/qwen3-vl-30b-a3b-thinking",
  qwen235b: "qwen/qwen3-235b-a22b-thinking-2507",
  stepfun: "stepfun/step-3.5-flash:free",
};

export function resolveKiloAlias(modelIdOrAlias: string): string {
  const normalized = modelIdOrAlias.toLowerCase().trim();
  return KILO_MODEL_ALIASES[normalized] ?? modelIdOrAlias;
}

export function resolveKiloModelApi(modelId: string): ModelApi {
  const lower = modelId.toLowerCase();
  if (lower.includes("claude")) {
    return "anthropic-messages";
  }
  if (lower.includes("gemini")) {
    return "google-generative-ai";
  }
  if (lower.includes("gpt-")) {
    return "openai-responses";
  }
  return "openai-completions";
}

function supportsImageInput(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  if (lower.includes("vl") || lower.includes("vision")) {
    return true;
  }
  if (lower.includes("kimi") || lower.includes("qwen") || lower.includes("gemini")) {
    return true;
  }
  if (lower.includes("minimax") && !lower.includes("vl")) {
    return false;
  }
  return true;
}

export function getKiloStaticFallbackModels(): ModelDefinitionConfig[] {
  const models = [
    {
      id: "kilo/auto-free",
      name: "Kilo: Auto Free",
      reasoning: true,
      contextWindow: 204800,
      maxTokens: 102400,
    },
    {
      id: "openrouter/free",
      name: "Free Models Router",
      reasoning: true,
      contextWindow: 200000,
      maxTokens: 100000,
    },
    {
      id: "openrouter/bodybuilder",
      name: "Body Builder (beta)",
      reasoning: false,
      contextWindow: 128000,
      maxTokens: 64000,
    },
    {
      id: "arcee-ai/trinity-large-preview:free",
      name: "Arcee AI: Trinity Large Preview",
      reasoning: false,
      contextWindow: 131000,
      maxTokens: 65500,
    },
    {
      id: "corethink:free",
      name: "CoreThink",
      reasoning: false,
      contextWindow: 78000,
      maxTokens: 8192,
    },
    {
      id: "giga-potato",
      name: "Giga Potato",
      reasoning: false,
      contextWindow: 256000,
      maxTokens: 128000,
    },
    {
      id: "giga-potato-thinking",
      name: "Giga Potato Thinking",
      reasoning: true,
      contextWindow: 256000,
      maxTokens: 128000,
    },
    {
      id: "minimax/minimax-m2.5:free",
      name: "MiniMax: MiniMax M2.5",
      reasoning: true,
      contextWindow: 204800,
      maxTokens: 102400,
    },
    {
      id: "moonshotai/kimi-k2.5:free",
      name: "MoonshotAI: Kimi K2.5",
      reasoning: true,
      contextWindow: 262144,
      maxTokens: 131072,
    },
    {
      id: "qwen/qwen3-vl-30b-a3b-thinking",
      name: "Qwen: Qwen3 VL 30B A3B Thinking",
      reasoning: true,
      contextWindow: 131072,
      maxTokens: 65536,
    },
    {
      id: "qwen/qwen3-235b-a22b-thinking-2507",
      name: "Qwen: Qwen3 235B A22B Thinking 2507",
      reasoning: true,
      contextWindow: 131072,
      maxTokens: 65536,
    },
    {
      id: "stepfun/step-3.5-flash:free",
      name: "StepFun: Step 3.5 Flash",
      reasoning: true,
      contextWindow: 256000,
      maxTokens: 128000,
    },
  ];

  return models.map((m) => ({
    ...m,
    api: resolveKiloModelApi(m.id),
    input: supportsImageInput(m.id) ? (["text", "image"] as const) : (["text"] as const),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }));
}

interface KiloModelsResponse {
  data: Array<{
    id: string;
    object: "model";
    created?: number;
    owned_by?: string;
    name?: string;
    description?: string;
    pricing?: {
      prompt?: string | number;
      completion?: string | number;
      request?: string | number;
      image?: string | number;
      web_search?: string | number;
      internal_reasoning?: string | number;
      input_cache_read?: string | number;
    };
    context_length?: number;
    max_tokens?: number;
    reasoning?: boolean;
  }>;
}

function isFreeModel(model: KiloModelsResponse["data"][number]): boolean {
  if (!model.pricing) {
    return false;
  }

  if (model.id === "openrouter/bodybuilder") {
    return true;
  }

  const promptPrice = model.pricing.prompt;
  const completionPrice = model.pricing.completion;

  const isZero = (val: string | number | undefined): boolean => {
    if (val === undefined || val === null) {
      return false;
    }
    if (typeof val === "number") {
      return val === 0;
    }
    if (typeof val === "string") {
      const num = parseFloat(val);
      return !isNaN(num) && num === 0;
    }
    return false;
  };

  return isZero(promptPrice) && isZero(completionPrice);
}

function buildModelDefinition(model: KiloModelsResponse["data"][number]): ModelDefinitionConfig {
  const id = model.id;
  const name = model.name || id.split("/").pop() || id;
  const contextWindow = model.context_length || 128000;
  const maxTokens = model.max_tokens || 8192;
  const reasoning = model.reasoning ?? true;

  return {
    id,
    name,
    api: resolveKiloModelApi(id),
    reasoning,
    input: supportsImageInput(id) ? (["text", "image"] as const) : (["text"] as const),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow,
    maxTokens,
  };
}

export async function fetchKiloModels(): Promise<ModelDefinitionConfig[]> {
  const now = Date.now();
  if (cachedModels && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModels;
  }

  try {
    const fetchPromise = fetch(KILO_MODELS_ENDPOINT, {
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

    const data = (await response.json()) as KiloModelsResponse;

    if (!data.data || !Array.isArray(data.data)) {
      throw new Error("Invalid response format");
    }

    const freeModels = data.data.filter(isFreeModel).map(buildModelDefinition);

    if (freeModels.length === 0) {
      return getKiloStaticFallbackModels();
    }

    cachedModels = freeModels;
    cacheTimestamp = now;

    return freeModels;
  } catch {
    return getKiloStaticFallbackModels();
  }
}

export function clearKiloModelCache(): void {
  cachedModels = null;
  cacheTimestamp = 0;
}

export async function buildKiloProvider(): Promise<{
  baseUrl: string;
  api: ModelApi;
  authHeader: boolean;
  apiKey: string;
  models: ModelDefinitionConfig[];
}> {
  const models = await fetchKiloModels();
  return {
    baseUrl: KILO_API_BASE_URL,
    api: "openai-completions",
    authHeader: false,
    apiKey: "no-auth-required",
    models,
  };
}
