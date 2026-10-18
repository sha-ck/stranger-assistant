// background.js - Multi-Provider AI Service Worker with Named Profiles
importScripts("providers.js");

const DEFAULT_PROFILE_NAME = "Default";
const DEFAULT_ENDPOINT = PROVIDERS.nvidia.defaultEndpoint;
const DEFAULT_MODEL = PROVIDERS.nvidia.defaultModel;

const DEFAULT_SETTINGS = {
  enabled: false,
  profiles: {
    [DEFAULT_PROFILE_NAME]: {
      name: DEFAULT_PROFILE_NAME,
      provider: DEFAULT_PROVIDER_ID,
      apiKey: "",
      endpoint: DEFAULT_ENDPOINT,
      model: DEFAULT_MODEL
    }
  },
  activeProfileName: DEFAULT_PROFILE_NAME,
  provider: DEFAULT_PROVIDER_ID,
  apiKey: "",
  endpoint: DEFAULT_ENDPOINT,
  model: DEFAULT_MODEL,
  tone: "Friendly and casual",
  customPrompt: "",
  contextTurns: 6,
  maxChars: 140,
  autoGenerate: false,
  autoSend: false,
  minDelayMs: 2500,
  maxDelayMs: 6000,
  maxSessionMessages: 30
};
// In-memory map to track chat state per browser tab
const tabChatStates = {};

const SYSTEM_PROMPT = 
  "You are chatting 1-on-1 with a stranger online, drafting casual replies in my exact voice.\n" +
  "Adopt a relaxed, curious, playfully sarcastic, and occasionally cheeky persona.\n\n" +
  "Rules:\n" +
  "1. Use predominantly lowercase letters, including lowercased 'i'.\n" +
  "2. Never end final sentences with periods. Only use question marks for questions.\n" +
  "3. Express laughter with text markers like 'lol', 'lmao', or 'hehe' instead of visual emojis.\n" +
  "4. Keep replies concise, short, and grounded. Natural texting habits only.\n" +
  "5. Use teasing, banter, and rhetorical tags like 'huh?' or 'is that right?' naturally.\n" +
  "6. Ask at most one direct question to keep the conversation flowing. Match the other person's energy.\n" +
  "7. Avoid formal greetings, corporate language, excessive enthusiasm, em-dashes, robotic transitions, and emoji spam.\n" +
  "8. Never invent personal facts, locations, jobs, relationships, feelings, or promises on my behalf.\n" +
  "9. Return only the raw reply text to send, without explanations, prefixes, or quotation marks.";

// Enable side panel behavior
chrome.sidePanel.setPanelBehavior({
  openPanelOnActionClick: true
}).catch(() => {});

// Automatically rewrite Origin header for local LLMs (Ollama) to bypass strict CORS 403 Forbidden
const OLLAMA_CORS_RULE_ID = 11434;
async function setupOllamaCorsRule() {
  if (typeof chrome === "undefined" || !chrome.declarativeNetRequest) return;
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [OLLAMA_CORS_RULE_ID],
      addRules: [
        {
          id: OLLAMA_CORS_RULE_ID,
          priority: 1,
          action: {
            type: "modifyHeaders",
            requestHeaders: [
              { header: "Origin", operation: "set", value: "http://localhost" }
            ]
          },
          condition: {
            urlFilter: ":11434/",
            resourceTypes: ["xmlhttprequest", "other"]
          }
        }
      ]
    });
  } catch (err) {
    console.warn("Could not register Ollama declarativeNetRequest rule:", err);
  }
}

// Ensure CORS rule is installed and active
if (typeof chrome !== "undefined" && chrome.runtime) {
  if (chrome.runtime.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => {
      setupOllamaCorsRule();
    });
  }
  if (chrome.runtime.onStartup) {
    chrome.runtime.onStartup.addListener(() => {
      setupOllamaCorsRule();
    });
  }
  setupOllamaCorsRule();
}

// Helper to sanitize error text and remove any trace of API keys
function sanitizeError(errorText, apiKey) {
  if (!errorText) return "Unknown error occurred.";
  let cleaned = String(errorText);
  if (apiKey && apiKey.length > 4) {
    cleaned = cleaned.split(apiKey).join("[REDACTED_API_KEY]");
  }
  return cleaned
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED]")
    .replace(/x-api-key:\s*[A-Za-z0-9_\-\.]+/gi, "x-api-key: [REDACTED]")
    .replace(/key=[A-Za-z0-9_\-\.]+/gi, "key=[REDACTED]");
}

// Clean generated reply text to match custom personality
function sanitizeReply(text, maxChars = 140) {
  if (!text) return "hey, what's up";
  let cleaned = text.trim();

  // Strip surrounding quotes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Remove common AI intro prefixes and reasoning tokens
  cleaned = cleaned.replace(/^(Reply|Suggested reply|Me|You):\s*/i, "");
  cleaned = cleaned.replace(/^As an AI[^,.]*[,.]\s*/i, "");
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");

  // Strip surrounding quotes again if they were inside prefixes
  if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // Remove em dashes and double hyphens
  cleaned = cleaned.replace(/—/g, ", ");
  cleaned = cleaned.replace(/--/g, "-");

  // Match lowercase habits (lowercase 'i' and uncapitalized first letter)
  cleaned = cleaned.replace(/\bI\b/g, "i")
                   .replace(/\bI'm\b/g, "i'm")
                   .replace(/\bI've\b/g, "i've")
                   .replace(/\bI'll\b/g, "i'll")
                   .replace(/\bI'd\b/g, "i'd");

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
  }

  // Rule: Never end final sentence with a period. Preserve question marks.
  cleaned = cleaned.replace(/\.+$/, "");

  // Enforce max character limit
  if (cleaned.length > maxChars) {
    cleaned = cleaned.slice(0, maxChars).trim();
    const lastSpace = cleaned.lastIndexOf(" ");
    if (lastSpace > 40) {
      cleaned = cleaned.slice(0, lastSpace);
    }
    cleaned = cleaned.replace(/\.+$/, "");
  }

  return cleaned || "hey, what's up";
}

// Fetch stored settings and active credentials
async function getSettings() {
  const result = await chrome.storage.local.get("settings");
  const stored = result.settings || {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

// Build robust Google Gemini generateContent URL
function buildGoogleGenerateContentUrl(endpoint, model, apiKey) {
  let ep = (endpoint || "https://generativelanguage.googleapis.com/v1beta/models").trim();
  const mdl = (model || "gemini-3.8-flash").trim().replace(/^models\//, "");

  // If endpoint points to another provider or OpenAI compatibility path, reset to native Google base
  if (!ep.includes("generativelanguage.googleapis.com") || ep.includes("/openai") || ep.includes("/chat/completions")) {
    ep = "https://generativelanguage.googleapis.com/v1beta/models";
  }

  let base = ep.replace(/\/+$/, "");

  // If base already contains :generateContent, extract base up to /models
  if (base.includes(":generateContent")) {
    base = base.split(":generateContent")[0];
  }

  // If base ends with an existing model path like /models/gemini-xxx, strip model part
  if (/\/models\/[^/]+$/.test(base)) {
    base = base.replace(/\/models\/[^/]+$/, "/models");
  }

  // Ensure base ends with /models
  if (!base.endsWith("/models")) {
    if (base.includes("/models/")) {
      base = base.substring(0, base.indexOf("/models") + 7);
    } else {
      base = `${base}/models`;
    }
  }

  let url = `${base}/${mdl}:generateContent`;

  if (apiKey && !url.includes("key=")) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}key=${encodeURIComponent(apiKey.trim())}`;
  }

  return url;
}

// Extract active profile credentials
function resolveActiveCredentials(settings) {
  const activeName = settings.activeProfileName || DEFAULT_PROFILE_NAME;
  const profile = settings.profiles && settings.profiles[activeName];
  const provider = profile?.provider || settings.provider || detectProvider(profile?.endpoint || settings.endpoint, profile?.model || settings.model);
  const cfg = getProviderConfig(provider);
  let rawEndpoint = ((profile?.endpoint || settings.endpoint) || cfg.defaultEndpoint).trim();
  let rawModel = ((profile?.model || settings.model) || cfg.defaultModel).trim();

  let endpoint = sanitizeEndpointForProvider(rawEndpoint, provider);
  let model = sanitizeModelForProvider(rawModel, provider);

  // If Google provider, ensure endpoint points to GenerativeLanguage API and model is valid
  if (provider === "google") {
    if (!endpoint.includes("generativelanguage.googleapis.com")) {
      endpoint = PROVIDERS.google?.defaultEndpoint || "https://generativelanguage.googleapis.com/v1beta/models";
    }
    // Ensure a valid free-tier model is selected
    if (!model || model.startsWith("gemini-3.8") || model.startsWith("gemini-3.5")) {
      model = PROVIDERS.google?.defaultModel || "gemini-2.5-flash";
    }
  }

  return {
    provider,
    apiKey: ((profile?.apiKey || settings.apiKey) || "").trim(),
    endpoint,
    model
  };
}

// Validate API key connection with a lightweight 1-token test
async function validateApiKey({ apiKey, endpoint, model, provider }) {
  const prov = provider || detectProvider(endpoint, model);
  const cfg = getProviderConfig(prov);
  const key = (apiKey || "").trim();

  if (!key && prov !== "custom" && prov !== "ollama" && !cfg.keyOptional) {
    return { ok: false, error: `${cfg.name} API key is required.` };
  }

  let ep = sanitizeEndpointForProvider((endpoint || cfg.defaultEndpoint).trim(), prov);
  if (prov === "google" && !ep.includes("generativelanguage.googleapis.com")) {
    ep = cfg.defaultEndpoint;
  }
  const mdl = sanitizeModelForProvider((model || cfg.defaultModel).trim(), prov);

  // Special fast-path for Ollama / Local to prevent timeouts while loading models into VRAM
  const isOllama = prov === "ollama" || ep.includes("11434") || (prov === "custom" && ep.includes("11434"));
  if (isOllama) {
    let tagsUrl = "http://127.0.0.1:11434/api/tags";
    try {
      const u = new URL(ep);
      tagsUrl = `${u.origin}/api/tags`;
    } catch (_) {}

    try {
      const checkController = new AbortController();
      const checkTimeout = setTimeout(() => checkController.abort(), 4000);
      const tagsRes = await fetch(tagsUrl, { signal: checkController.signal });
      clearTimeout(checkTimeout);

      if (tagsRes.ok) {
        const tagsData = await tagsRes.json();
        const installedModels = (tagsData.models || []).map(m => (m.name || "").toLowerCase());
        const cleanMdl = mdl.toLowerCase().replace(/:latest$/, "");
        const hasModel = installedModels.some(m => 
          m === cleanMdl || 
          m === `${cleanMdl}:latest` || 
          m.startsWith(`${cleanMdl}:`) ||
          cleanMdl === m.replace(/:latest$/, "")
        );

        if (hasModel) {
          return { ok: true, message: `Ollama is running locally with '${mdl}'. Ready to generate!` };
        } else {
          const availList = installedModels.slice(0, 4).join(", ") || "none";
          return { ok: true, message: `Ollama connected. Model '${mdl}' will be loaded on generation (Installed: ${availList}).` };
        }
      } else {
        return {
          ok: false,
          error: `Ollama returned HTTP ${tagsRes.status} at ${tagsUrl}. Make sure the Ollama service is healthy.`
        };
      }
    } catch (err) {
      return {
        ok: false,
        error: `Cannot reach Ollama at ${ep}. Make sure Ollama is running locally.`
      };
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    let headers = { "Content-Type": "application/json" };
    let body = null;

    if (prov === "anthropic" || ep.includes("anthropic.com")) {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
      body = JSON.stringify({
        model: mdl,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1
      });
    } else if (prov === "google" || cfg.apiType === "google" || ep.includes("generativelanguage.googleapis.com")) {
      // Native Google GenAI (Gemini) API
      headers["x-goog-api-key"] = key;
      const cleanMdl = mdl.replace(/^models\//, "");
      const targetUrl = buildGoogleGenerateContentUrl(ep, cleanMdl, key);
      
      body = JSON.stringify({
        contents: [{ parts: [{ text: "test" }] }],
        generationConfig: { maxOutputTokens: 1 }
      });

      let response = await fetch(targetUrl, {
        method: "POST",
        headers: headers,
        body: body,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errJson = null;
        try {
          errJson = await response.json();
        } catch (_) {}
        const serverMsg = errJson?.error?.message || "";

        if (response.status === 400 || response.status === 401 || response.status === 403) {
          return { ok: false, error: `Invalid ${cfg.name} API key. ${serverMsg || "Please check your key from Google AI Studio."} (HTTP ${response.status})` };
        }
        if (response.status === 404) {
          // Probe what models this key actually has access to
          try {
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
            const listRes = await fetch(listUrl, { headers: { "x-goog-api-key": key } });
            if (listRes.ok) {
              const listData = await listRes.json();
              const availableModels = (listData.models || [])
                .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
                .map(m => m.name.replace(/^models\//, ""));

              const modelExists = availableModels.some(m => m.toLowerCase() === cleanMdl.toLowerCase());

              // If model exists in catalog, test direct canonical URL
              if (modelExists) {
                const canonicalUrl = `https://generativelanguage.googleapis.com/v1beta/models/${cleanMdl}:generateContent?key=${encodeURIComponent(key)}`;
                const retryRes = await fetch(canonicalUrl, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-goog-api-key": key },
                  body: body
                });
                if (retryRes.ok) {
                  return { ok: true, message: `Valid ${cfg.name} connection with model '${cleanMdl}'.` };
                }
              }

              // Filter modern models (e.g. 3.8, 3.5)
              const modernModels = availableModels.filter(m => m.includes("3.8") || m.includes("3.5"));
              const suggested = modernModels[0] || "gemini-3.8-flash";

              return { 
                ok: false, 
                error: `API key is valid, but model '${cleanMdl}' is restricted or retired for this project. Please switch to '${suggested}' or '${modernModels[1] || "gemini-3.5-flash"}'.` 
              };
            }
          } catch (e) {
            // ignore fallback error
          }
          return { ok: false, error: `Model '${cleanMdl}' not found on Google AI Studio. ${serverMsg || "Please choose a supported model like 'gemini-3.8-flash'."}` };
        }
        if (response.status === 429) {
          return { ok: false, error: "429 Rate Limit: Google AI Studio quota exceeded." };
        }
        return { ok: false, error: `Connection failed with HTTP ${response.status}. ${serverMsg}` };
      }

      return { ok: true, message: `Valid ${cfg.name} connection with model '${cleanMdl}'.` };
    } else {
      if (key) {
        headers["Authorization"] = `Bearer ${key}`;
      }
      body = JSON.stringify({
        model: mdl,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1
      });
    }

    const response = await fetch(ep, {
      method: "POST",
      headers: headers,
      body: body,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: `401 Unauthorized: Invalid ${cfg.name} API key.` };
      }
      if (response.status === 403) {
        return { ok: false, error: `403 Forbidden: No access to model '${mdl}'.` };
      }
      if (response.status === 404) {
        return { ok: false, error: `404 Not Found: Check endpoint URL or model '${mdl}'.` };
      }
      if (response.status === 429) {
        return { ok: false, error: "429 Rate Limit: Too many requests, please slow down." };
      }
      return { ok: false, error: `Connection failed with HTTP ${response.status}.` };
    }

    return { ok: true, message: `Valid ${cfg.name} connection.` };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return { ok: false, error: "Connection timed out after 10s." };
    }
    return { ok: false, error: sanitizeError(err.message || String(err), key) };
  }
}

// Call Multi-Provider LLM API
async function callLLMProvider({ incoming, history = [], partner = "stranger", tone, customInstructions, provider, endpoint: msgEndpoint, model: msgModel, apiKey: msgApiKey }) {
  const settings = await getSettings();
  const credentials = resolveActiveCredentials(settings);

  const activeProvider = provider || credentials.provider || DEFAULT_PROVIDER_ID;
  const cfg = getProviderConfig(activeProvider);

  const rawEndpoint = (msgEndpoint || credentials.endpoint || cfg.defaultEndpoint).trim();
  const rawModel = (msgModel || credentials.model || cfg.defaultModel).trim();

  const endpoint = sanitizeEndpointForProvider(rawEndpoint, activeProvider);
  const model = sanitizeModelForProvider(rawModel, activeProvider);
  const apiKey = (msgApiKey !== undefined && msgApiKey !== null && msgApiKey !== "") ? msgApiKey.trim() : credentials.apiKey;

  if (!apiKey && activeProvider !== "custom" && activeProvider !== "ollama" && !cfg.keyOptional) {
    return {
      ok: false,
      error: `Active ${cfg.name} API key is missing. Please set it in the side panel.`
    };
  }
  const selectedTone = tone || settings.tone || DEFAULT_SETTINGS.tone;
  const systemPromptToUse = (settings.customPrompt && settings.customPrompt.trim()) 
    ? settings.customPrompt.trim() 
    : SYSTEM_PROMPT;

  // Build prompt content
  let userContent = 
    `Partner name: ${partner}\n` +
    `Tone context: ${selectedTone}\n`;

  if (customInstructions && customInstructions.trim()) {
    userContent += `User instructions/keywords: Follow this guidance strictly: ${customInstructions.trim()}\n`;
  }

  userContent += 
    `Stranger: "${incoming}"\n\n` +
    `Draft my short reply:`;

  const isLocal = activeProvider === "custom" || activeProvider === "ollama" || endpoint.includes("11434") || endpoint.includes("localhost") || endpoint.includes("127.0.0.1");
  const timeoutMs = isLocal ? 90000 : 25000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    const isAnthropic = activeProvider === "anthropic" || endpoint.includes("anthropic.com");
    const isGoogle = activeProvider === "google" || cfg.apiType === "google" || endpoint.includes("generativelanguage.googleapis.com");

    if (isAnthropic) {
      // Anthropic Messages API format
      const messages = [];
      if (Array.isArray(history) && history.length > 0) {
        for (const turn of history) {
          if (turn.text && turn.role) {
            messages.push({
              role: turn.role === "stranger" ? "user" : "assistant",
              content: turn.text
            });
          }
        }
      }
      messages.push({ role: "user", content: userContent });

      const payload = {
        model: model,
        system: systemPromptToUse,
        messages: messages,
        temperature: 0.8,
        max_tokens: 120
      };

      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } else if (isGoogle) {
      // Native Google GenAI (Gemini) format
      const targetUrl = buildGoogleGenerateContentUrl(endpoint, model, apiKey);

      const contents = [];
      if (Array.isArray(history) && history.length > 0) {
        for (const turn of history) {
          if (turn.text && turn.role) {
            contents.push({
              role: turn.role === "stranger" ? "user" : "model",
              parts: [{ text: turn.text }]
            });
          }
        }
      }
      contents.push({
        role: "user",
        parts: [{ text: userContent }]
      });

      const payload = {
        systemInstruction: {
          parts: [{ text: systemPromptToUse }]
        },
        contents: contents,
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 140
        }
      };

      response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } else {
      // Standard OpenAI-compatible format (NVIDIA, OpenAI, Groq, OpenRouter, Custom)
      const messages = [{ role: "system", content: systemPromptToUse }];

      if (Array.isArray(history) && history.length > 0) {
        for (const turn of history) {
          if (turn.text && turn.role) {
            messages.push({
              role: turn.role === "stranger" ? "user" : "assistant",
              content: turn.text
            });
          }
        }
      }

      messages.push({ role: "user", content: userContent });

      const payload = {
        model: model,
        messages: messages,
        temperature: 0.8,
        max_tokens: isLocal ? 450 : 120,
        stream: false
      };

      const headers = {
        "Content-Type": "application/json"
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      response = await fetch(endpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      const status = response.status;
      let errorDetails = "";
      try {
        const errorJson = await response.json();
        errorDetails = JSON.stringify(errorJson);
      } catch (e) {
        errorDetails = await response.text().catch(() => "");
      }

      if (status === 401) {
        return { ok: false, error: `${cfg.name} 401 Unauthorized: Invalid or expired API key.` };
      }
      if (status === 403) {
        if (isLocal) {
          return {
            ok: false,
            error: `${cfg.name} 403 Forbidden: Local server rejected the request due to CORS origin restrictions. If using Ollama, ensure OLLAMA_ORIGINS="*" is allowed or restart extension.`
          };
        }
        return { ok: false, error: `${cfg.name} 403 Forbidden: Access denied for requested model.` };
      }
      if (status === 404) {
        if (isLocal) {
          return { ok: false, error: `${cfg.name} 404 Not Found: Model '${model}' was not found. Check if it is installed (e.g. 'ollama pull ${model}') or verify endpoint URL.` };
        }
        return { ok: false, error: `${cfg.name} 404 Not Found: Check endpoint URL or model tag.` };
      }
      if (status === 429) {
        return { ok: false, error: `${cfg.name} 429 Rate Limit: Too many requests, please slow down.` };
      }
      if (status >= 500) {
        return { ok: false, error: `${cfg.name} 5xx: Server error occurred on provider side.` };
      }

      return {
        ok: false,
        error: `${cfg.name} request failed (HTTP ${status}): ${sanitizeError(errorDetails, apiKey)}`
      };
    }

    const data = await response.json();
    let replyRaw = "";

    if (isAnthropic) {
      replyRaw = data?.content?.[0]?.text || "";
    } else if (isGoogle) {
      replyRaw = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      replyRaw = data?.choices?.[0]?.message?.content || "";
      if (!replyRaw && data?.choices?.[0]?.message?.reasoning) {
        const reasoning = data.choices[0].message.reasoning;
        const matches = reasoning.match(/"([^"\n]{4,120})"/g);
        if (matches && matches.length > 0) {
          replyRaw = matches[matches.length - 1].replace(/"/g, "");
        } else {
          const sentences = reasoning.split(/[.\n]+/).map(s => s.trim()).filter(Boolean);
          replyRaw = sentences[sentences.length - 1] || "";
        }
      }
    }

    const cleanReply = sanitizeReply(replyRaw, settings.maxChars);

    return {
      ok: true,
      reply: cleanReply
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return { ok: false, error: `${cfg.name} request timed out after ${isLocal ? "90" : "25"} seconds.` };
    }
    const errMsg = err.message || String(err);
    if (isLocal && (errMsg.includes("Failed to fetch") || errMsg.includes("NetworkError") || errMsg.includes("Network error"))) {
      return {
        ok: false,
        error: `Cannot reach local server at ${endpoint}. Make sure ${cfg.name} is running.`
      };
    }
    return {
      ok: false,
      error: sanitizeError(errMsg, apiKey)
    };
  }
}

// Backward compatibility alias for NVIDIA NIM calls
const callNvidiaNim = callLLMProvider;

// Runtime message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_SETTINGS") {
    getSettings().then(settings => {
      sendResponse({ ok: true, settings });
    });
    return true;
  }

  if (message.type === "GET_DEFAULT_SYSTEM_PROMPT") {
    sendResponse({ ok: true, prompt: SYSTEM_PROMPT });
    return true;
  }

  if (message.type === "SET_SETTINGS") {
    chrome.storage.local.get("settings").then(res => {
      const updated = { ...(res.settings || DEFAULT_SETTINGS), ...(message.settings || {}) };
      chrome.storage.local.set({ settings: updated }).then(() => {
        sendResponse({ ok: true, settings: updated });
      });
    });
    return true;
  }

  if (message.type === "VALIDATE_KEY") {
    validateApiKey(message).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === "GENERATE_REPLY" || message.type === "NIM_GENERATE") {
    callLLMProvider(message).then(result => {
      sendResponse(result);
    });
    return true;
  }

  if (message.type === "STATUS_UPDATE") {
    if (sender.tab && sender.tab.id !== undefined) {
      const { platform, incoming, generated, state, error } = message;
      const tabId = sender.tab.id;
      const timestamp = Date.now();
      const prev = tabChatStates[tabId] || {};
      const generatedVal = (state === "NEW_MESSAGE" && !generated) ? "" : (generated !== undefined ? generated : prev.generated);
      tabChatStates[tabId] = { ...prev, platform, incoming, generated: generatedVal, state, error, lastUpdate: timestamp };
      chrome.runtime.sendMessage({ type: "TAB_STATE_UPDATE", tabId, state: tabChatStates[tabId] });
      if (sendResponse) sendResponse({ ok: true });
    }
    return true;
  }
});