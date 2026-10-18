// providers.js - Centralized LLM Provider Registry & Presets

const PROVIDERS = {
  nvidia: {
    id: "nvidia",
    name: "NVIDIA NIM",
    badge: "NVIDIA NIM",
    defaultEndpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    keyPlaceholder: "nvapi-...",
    keyLabel: "NVIDIA NIM API Key",
    apiType: "openai", // standard OpenAI-compatible completions
    models: [
      { label: "Nemotron 120B", model: "nvidia/nemotron-3-super-120b-a12b" },
      { label: "Llama 3.3 70B", model: "meta/llama-3.3-70b-instruct" },
      { label: "Llama 3.2 90B", model: "meta/llama-3.2-90b-vision-instruct" },
      { label: "Mixtral 8x22B", model: "mistralai/mixtral-8x22b-instruct-v0.1" }
    ],
    get chips() { return this.models; }
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    badge: "OpenAI",
    defaultEndpoint: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    keyPlaceholder: "sk-...",
    keyLabel: "OpenAI API Key",
    apiType: "openai",
    models: [
      { label: "GPT-4o Mini", model: "gpt-4o-mini" },
      { label: "GPT-4o", model: "gpt-4o" },
      { label: "o3-mini", model: "o3-mini" },
      { label: "GPT-4 Turbo", model: "gpt-4-turbo" }
    ],
    get chips() { return this.models; }
  },
  google: {
    id: "google",
    name: "Google AI Studio",
    badge: "Google Gemini",
    defaultEndpoint: "https://generativelanguage.googleapis.com/v1beta/models",
    defaultModel: "gemini-2.5-flash",
    keyPlaceholder: "AIzaSy...",
    keyLabel: "Google AI Studio API Key",
    apiType: "google", // Native Google GenAI format (generateContent)
    models: [
      { label: "Gemini 2.5 Flash (Free Tier)", model: "gemini-2.5-flash" },
      { label: "Gemini 2.0 Flash (Free Tier)", model: "gemini-2.0-flash" },
      { label: "Gemini 1.5 Flash (Free Tier)", model: "gemini-1.5-flash" },
      { label: "Gemini 2.5 Pro (Free Tier)", model: "gemini-2.5-pro" },
      { label: "Gemini 1.5 Pro (Free Tier)", model: "gemini-1.5-pro" }
    ],
    get chips() { return this.models; }
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    badge: "Claude",
    defaultEndpoint: "https://api.anthropic.com/v1/messages",
    defaultModel: "claude-3-5-haiku-20241022",
    keyPlaceholder: "sk-ant-...",
    keyLabel: "Anthropic API Key",
    apiType: "anthropic",
    models: [
      { label: "Claude 3.5 Haiku", model: "claude-3-5-haiku-20241022" },
      { label: "Claude 3.5 Sonnet", model: "claude-3.5-sonnet-20241022" },
      { label: "Claude 3 Opus", model: "claude-3-opus-20240229" }
    ],
    get chips() { return this.models; }
  },
  groq: {
    id: "groq",
    name: "Groq (Fast)",
    badge: "Groq",
    defaultEndpoint: "https://api.groq.com/openai/v1/chat/completions",
    defaultModel: "llama-3.3-70b-versatile",
    keyPlaceholder: "gsk_...",
    keyLabel: "Groq API Key",
    apiType: "openai",
    models: [
      { label: "Llama 3.3 70B", model: "llama-3.3-70b-versatile" },
      { label: "Llama 3.1 8B", model: "llama-3.1-8b-instant" },
      { label: "Mixtral 8x7B", model: "mixtral-8x7b-32768" },
      { label: "Gemma 2 9B", model: "gemma2-9b-it" }
    ],
    get chips() { return this.models; }
  },
  openrouter: {
    id: "openrouter",
    name: "OpenRouter",
    badge: "OpenRouter",
    defaultEndpoint: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "meta-llama/llama-3.3-70b-instruct",
    keyPlaceholder: "sk-or-...",
    keyLabel: "OpenRouter API Key",
    apiType: "openai",
    models: [
      { label: "Llama 3.3 70B", model: "meta-llama/llama-3.3-70b-instruct" },
      { label: "Claude 3.5 Haiku", model: "anthropic/claude-3.5-haiku" },
      { label: "Gemini Flash 2.0", model: "google/gemini-2.0-flash-001" },
      { label: "DeepSeek R1", model: "deepseek/deepseek-r1" }
    ],
    get chips() { return this.models; }
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    badge: "Ollama Local",
    defaultEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
    defaultModel: "qwen3.5",
    keyPlaceholder: "No API key required",
    keyLabel: "API Key (not required for Ollama)",
    apiType: "openai",
    keyOptional: true,
    models: [
      { label: "qwen3.5", model: "qwen3.5" },
      { label: "qwen3-coder:30b", model: "qwen3-coder:30b" },
      { label: "llama2-uncensored", model: "llama2-uncensored" },
      { label: "dolphin-llama3", model: "dolphin-llama3" }
    ],
    get chips() { return this.models; }
  },
  custom: {
    id: "custom",
    name: "Custom / Local (Ollama, LM Studio)",
    badge: "Custom / Local",
    defaultEndpoint: "http://127.0.0.1:11434/v1/chat/completions",
    defaultModel: "qwen3.5",
    keyPlaceholder: "Optional key or token",
    keyLabel: "API Key / Token (optional)",
    apiType: "openai",
    keyOptional: true,
    models: [
      { label: "qwen3.5", model: "qwen3.5" },
      { label: "qwen3-coder:30b", model: "qwen3-coder:30b" },
      { label: "llama2-uncensored", model: "llama2-uncensored" },
      { label: "dolphin-llama3", model: "dolphin-llama3" },
      { label: "Llama 3.2", model: "llama3.2" },
      { label: "Mistral", model: "mistral" },
      { label: "Qwen 2.5", model: "qwen2.5:7b" },
      { label: "DeepSeek R1", model: "deepseek-r1:8b" }
    ],
    get chips() { return this.models; }
  }
};

const DEFAULT_PROVIDER_ID = "nvidia";

/**
 * Detect provider from endpoint or model if provider is missing in legacy settings
 */
function detectProvider(endpoint, model) {
  const ep = (endpoint || "").toLowerCase();
  const mdl = (model || "").toLowerCase();

  if (ep.includes("nvidia.com") || mdl.startsWith("nvidia/")) return "nvidia";
  if (ep.includes("api.openai.com") || mdl.startsWith("gpt-") || mdl.startsWith("o1-") || mdl.startsWith("o3-")) return "openai";
  if (ep.includes("generativelanguage.googleapis.com") || mdl.startsWith("gemini") || mdl.startsWith("models/gemini")) return "google";
  if (ep.includes("anthropic.com") || mdl.startsWith("claude")) return "anthropic";
  if (ep.includes("groq.com")) return "groq";
  if (ep.includes("openrouter.ai")) return "openrouter";
  if (ep.includes("11434") || mdl === "qwen3.5" || mdl === "qwen3-coder:30b" || mdl === "llama2-uncensored" || mdl === "dolphin-llama3") return "ollama";
  if (ep.includes("localhost") || ep.includes("127.0.0.1")) return "custom";

  return DEFAULT_PROVIDER_ID;
}

/**
 * Resolve provider config object safely with fallback to nvidia
 */
function getProviderConfig(providerId) {
  return PROVIDERS[providerId] || PROVIDERS[DEFAULT_PROVIDER_ID];
}

/**
 * Prevent cross-provider endpoint contamination (e.g. keeping NVIDIA endpoint when switching to Ollama/Custom)
 */
function sanitizeEndpointForProvider(endpoint, providerId) {
  const cfg = getProviderConfig(providerId);
  if (!endpoint || typeof endpoint !== "string") return cfg.defaultEndpoint;
  const ep = endpoint.trim();
  const lower = ep.toLowerCase();

  if (providerId === "ollama") {
    // If endpoint points to an external cloud provider, reset to Ollama local endpoint
    if (lower.includes("nvidia.com") || lower.includes("openai.com") || lower.includes("generativelanguage.googleapis.com") || lower.includes("anthropic.com") || lower.includes("groq.com") || lower.includes("openrouter.ai")) {
      return cfg.defaultEndpoint;
    }
  } else if (providerId === "custom") {
    // If endpoint points to a known cloud provider rather than local / custom host
    if (lower.includes("nvidia.com") || lower.includes("openai.com") || lower.includes("generativelanguage.googleapis.com") || lower.includes("anthropic.com") || lower.includes("groq.com") || lower.includes("openrouter.ai")) {
      return cfg.defaultEndpoint;
    }
  } else if (providerId === "nvidia") {
    if (!lower.includes("nvidia.com")) return cfg.defaultEndpoint;
  } else if (providerId === "openai") {
    if (!lower.includes("api.openai.com")) return cfg.defaultEndpoint;
  } else if (providerId === "google") {
    if (!lower.includes("generativelanguage.googleapis.com")) return cfg.defaultEndpoint;
  } else if (providerId === "anthropic") {
    if (!lower.includes("anthropic.com")) return cfg.defaultEndpoint;
  } else if (providerId === "groq") {
    if (!lower.includes("groq.com")) return cfg.defaultEndpoint;
  } else if (providerId === "openrouter") {
    if (!lower.includes("openrouter.ai")) return cfg.defaultEndpoint;
  }

  return ep;
}

/**
 * Prevent cross-provider model tag contamination
 */
function sanitizeModelForProvider(model, providerId) {
  const cfg = getProviderConfig(providerId);
  if (!model || typeof model !== "string") return cfg.defaultModel;
  const mdl = model.trim();

  if (providerId === "ollama" || providerId === "custom") {
    if (mdl.startsWith("nvidia/") || mdl.startsWith("meta/llama-3.3") || mdl.startsWith("meta/llama-3.2-90b") || mdl.startsWith("mistralai/mixtral-8x22b")) {
      return cfg.defaultModel;
    }
  } else if (providerId === "nvidia") {
    if (mdl === "qwen3.5" || mdl === "qwen3-coder:30b" || mdl === "llama2-uncensored" || mdl === "dolphin-llama3") {
      return cfg.defaultModel;
    }
  }

  return mdl;
}

// Export for module environments if needed
if (typeof module !== "undefined" && module.exports) {
  module.exports = { 
    PROVIDERS, 
    DEFAULT_PROVIDER_ID, 
    detectProvider, 
    getProviderConfig,
    sanitizeEndpointForProvider,
    sanitizeModelForProvider
  };
}
