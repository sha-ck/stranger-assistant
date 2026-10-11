// background.js - NVIDIA NIM Service Worker with Named Profiles

const DEFAULT_PROFILE_NAME = "Default";
const DEFAULT_ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions";
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

const DEFAULT_SETTINGS = {
  enabled: false,
  profiles: {
    [DEFAULT_PROFILE_NAME]: {
      name: DEFAULT_PROFILE_NAME,
      apiKey: "",
      endpoint: DEFAULT_ENDPOINT,
      model: DEFAULT_MODEL
    }
  },
  activeProfileName: DEFAULT_PROFILE_NAME,
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

// Helper to sanitize error text and remove any trace of API keys
function sanitizeError(errorText, apiKey) {
  if (!errorText) return "Unknown error occurred.";
  let cleaned = String(errorText);
  if (apiKey && apiKey.length > 4) {
    cleaned = cleaned.split(apiKey).join("[REDACTED_API_KEY]");
  }
  return cleaned.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED]");
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

  // Remove common AI intro prefixes
  cleaned = cleaned.replace(/^(Reply|Suggested reply|Me|You):\s*/i, "");
  cleaned = cleaned.replace(/^As an AI[^,.]*[,.]\s*/i, "");

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

// Extract active profile credentials
function resolveActiveCredentials(settings) {
  const activeName = settings.activeProfileName || DEFAULT_PROFILE_NAME;
  const profile = settings.profiles && settings.profiles[activeName];

  return {
    apiKey: ((profile?.apiKey || settings.apiKey) || "").trim(),
    endpoint: ((profile?.endpoint || settings.endpoint) || DEFAULT_ENDPOINT).trim(),
    model: ((profile?.model || settings.model) || DEFAULT_MODEL).trim()
  };
}

// Validate API key connection with a lightweight 1-token test
async function validateApiKey({ apiKey, endpoint, model }) {
  const key = (apiKey || "").trim();
  if (!key) {
    return { ok: false, error: "API key is required." };
  }

  const ep = (endpoint || DEFAULT_ENDPOINT).trim();
  const mdl = (model || DEFAULT_MODEL).trim();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(ep, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: mdl,
        messages: [{ role: "user", content: "test" }],
        max_tokens: 1
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 401) {
        return { ok: false, error: "401 Unauthorized: Invalid API key." };
      }
      if (response.status === 403) {
        return { ok: false, error: "403 Forbidden: No access to requested model." };
      }
      if (response.status === 429) {
        return { ok: false, error: "429 Rate Limit: Too many requests." };
      }
      return { ok: false, error: `Connection failed with HTTP ${response.status}.` };
    }

    return { ok: true, message: "Valid API key connection." };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return { ok: false, error: "Connection timed out after 10s." };
    }
    return { ok: false, error: sanitizeError(err.message || String(err), key) };
  }
}

// Call NVIDIA NIM API
async function callNvidiaNim({ incoming, history = [], partner = "stranger", tone, customInstructions }) {
  const settings = await getSettings();
  const credentials = resolveActiveCredentials(settings);

  const apiKey = credentials.apiKey;
  if (!apiKey) {
    return {
      ok: false,
      error: "Active NVIDIA NIM API key is missing. Please set it in the side panel."
    };
  }

  const endpoint = credentials.endpoint;
  const model = credentials.model;
  const selectedTone = tone || settings.tone || DEFAULT_SETTINGS.tone;
  const systemPromptToUse = (settings.customPrompt && settings.customPrompt.trim()) 
    ? settings.customPrompt.trim() 
    : SYSTEM_PROMPT;

  // Build message chain
  const messages = [
    { role: "system", content: systemPromptToUse }
  ];

  // Add conversation history if available
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

  // Append latest user message with tone and custom instructions
  let userContent = 
    `Partner name: ${partner}\n` +
    `Tone context: ${selectedTone}\n`;

  if (customInstructions && customInstructions.trim()) {
    userContent += `User instructions/keywords: Follow this guidance strictly: ${customInstructions.trim()}\n`;
  }

  userContent += 
    `Stranger: "${incoming}"\n\n` +
    `Draft my short reply:`;

  messages.push({
    role: "user",
    content: userContent
  });

  const payload = {
    model: model,
    messages: messages,
    temperature: 0.8,
    max_tokens: 120,
    stream: false
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

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
        return { ok: false, error: "NIM 401 Unauthorized: Invalid or expired API key." };
      }
      if (status === 403) {
        return { ok: false, error: "NIM 403 Forbidden: Access denied for requested model." };
      }
      if (status === 429) {
        return { ok: false, error: "NIM 429 Rate Limit: Too many requests, please slow down." };
      }
      if (status >= 500) {
        return { ok: false, error: "NIM 5xx: NVIDIA server error occurred." };
      }

      return {
        ok: false,
        error: `NIM Request failed with HTTP ${status}: ${sanitizeError(errorDetails, apiKey)}`
      };
    }

    const data = await response.json();
    const replyRaw = data?.choices?.[0]?.message?.content || "";
    const cleanReply = sanitizeReply(replyRaw, settings.maxChars);

    return {
      ok: true,
      reply: cleanReply
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return { ok: false, error: "NIM Request timed out after 15 seconds." };
    }
    return {
      ok: false,
      error: sanitizeError(err.message || String(err), apiKey)
    };
  }
}

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

  if (message.type === "NIM_GENERATE") {
    callNvidiaNim(message).then(result => {
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
      tabChatStates[tabId] = { ...prev, platform, incoming, generated, state, error, lastUpdate: timestamp };
      chrome.runtime.sendMessage({ type: "TAB_STATE_UPDATE", tabId, state: tabChatStates[tabId] });
      if (sendResponse) sendResponse({ ok: true });
    }
    return true;
  }
});