// sidepanel.js - Controller for TWS NIM Assistant with Named Profiles & Multi-Reply Cards

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
  // Root fallbacks for backward compatibility
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

let currentSettings = { ...DEFAULT_SETTINGS };

// Track generated replies with metadata for tone and states
// Structure: [{ text: "", tone: "", loading: false }]
let generatedReplyItems = [];
let selectedCardIndex = -1;
let isGeneratingAll = false;
let lastGeneratedMessage = ""; // Track what message current replies belong to

const dom = {
  appTitle: document.getElementById("appTitle"),
  appSubtitle: document.getElementById("appSubtitle"),
  providerBadge: document.getElementById("providerBadge"),
  enabled: document.getElementById("enabled"),
  btnGlobalApiStatus: document.getElementById("btnGlobalApiStatus"),
  apiStatusDot: document.getElementById("apiStatusDot"),
  apiStatusLabel: document.getElementById("apiStatusLabel"),
  btnPasteIncoming: document.getElementById("btnPasteIncoming"),
  btnClearIncoming: document.getElementById("btnClearIncoming"),
  btnOpenApiConfigFromProfile: document.getElementById("btnOpenApiConfigFromProfile"),
  apiConfigDialog: document.getElementById("apiConfigDialog"),
  btnCloseApiDialog: document.getElementById("btnCloseApiDialog"),
  popupStatusBanner: document.getElementById("popupStatusBanner"),
  popupStatusDot: document.getElementById("popupStatusDot"),
  popupStatusTitle: document.getElementById("popupStatusTitle"),
  popupStatusDesc: document.getElementById("popupStatusDesc"),
  popupProviderSelect: document.getElementById("popupProviderSelect"),
  popupApiKeyLabel: document.getElementById("popupApiKeyLabel"),
  popupApiKey: document.getElementById("popupApiKey"),
  btnClearPopupKey: document.getElementById("btnClearPopupKey"),
  btnTogglePopupKeyVisibility: document.getElementById("btnTogglePopupKeyVisibility"),
  popupKeyHint: document.getElementById("popupKeyHint"),
  popupModelDisplay: document.getElementById("popupModelDisplay"),
  popupEndpointDisplay: document.getElementById("popupEndpointDisplay"),
  popupFeedbackMessage: document.getElementById("popupFeedbackMessage"),
  btnTestPopupKey: document.getElementById("btnTestPopupKey"),
  btnSavePopupKey: document.getElementById("btnSavePopupKey"),
  profileSelect: document.getElementById("profileSelect"),
  btnNewProfile: document.getElementById("btnNewProfile"),
  btnSaveProfile: document.getElementById("btnSaveProfile"),
  btnDeleteProfile: document.getElementById("btnDeleteProfile"),
  profileName: document.getElementById("profileName"),
  providerSelect: document.getElementById("providerSelect"),
  apiKeyLabel: document.getElementById("apiKeyLabel"),
  apiKey: document.getElementById("apiKey"),
  btnToggleKeyVisibility: document.getElementById("btnToggleKeyVisibility"),
  modelSelect: document.getElementById("modelSelect"),
  modelChipsContainer: document.getElementById("modelChipsContainer"),
  model: document.getElementById("model"),
  endpoint: document.getElementById("endpoint"),
  customPrompt: document.getElementById("customPrompt"),
  btnResetPrompt: document.getElementById("btnResetPrompt"),
  tone: document.getElementById("tone"),
  contextTurns: document.getElementById("contextTurns"),
  maxChars: document.getElementById("maxChars"),
  autoGenerate: document.getElementById("autoGenerate"),
  autoSend: document.getElementById("autoSend"),
  minDelayMs: document.getElementById("minDelayMs"),
  maxDelayMs: document.getElementById("maxDelayMs"),
  maxSessionMessages: document.getElementById("maxSessionMessages"),
  incomingDisplay: document.getElementById("incomingDisplay"),
  incomingBadge: document.getElementById("incomingBadge"),
  replyChoicesSection: document.getElementById("replyChoicesSection"),
  replyCardsContainer: document.getElementById("replyCardsContainer"),
  replyCount: document.getElementById("replyCount"),
  selectedPreview: document.getElementById("selectedPreview"),
  replyTest: document.getElementById("replyTest"),
  customKeywords: document.getElementById("customKeywords"),
  btnRegenCustom: document.getElementById("btnRegenCustom"),
  btnGenerate: document.getElementById("btnGenerate"),
  btnCopy: document.getElementById("btnCopy"),
  btnSendSelected: document.getElementById("btnSendSelected"),
  statusMessage: document.getElementById("statusMessage"),
  emptyState: document.getElementById("emptyState"),
  deleteProfileDialog: document.getElementById("deleteProfileDialog"),
  deleteProfileTargetName: document.getElementById("deleteProfileTargetName")
};

// ── Global API Connection State & Synchronization ──
let currentApiStatus = "gray"; // "green" | "yellow" | "red" | "gray"
let currentApiDetails = {
  providerName: "NVIDIA NIM",
  model: "",
  message: "Checking connection status…",
  error: "",
  shortLabel: ""
};

let validationSeq = 0;
let lastValidatedParams = null;
let isValidationInProgress = false;
let activeValidationPromise = null;

function updateApiConnectionStatus(status, details = {}) {
  currentApiStatus = status;
  currentApiDetails = { ...currentApiDetails, ...details };

  const prov = currentApiDetails.providerName || "API";
  const mdl = currentApiDetails.model || "";

  // 1. Synchronize Global Navigation Button
  if (dom.btnGlobalApiStatus) {
    dom.btnGlobalApiStatus.className = `api-status-btn status-${status}`;

    let label = "Checking…";
    let tooltip = "API Connection: Checking…";

    const isKeyOpt = Boolean(details.keyOptional || (typeof getProviderConfig === "function" && getProviderConfig(currentSettings?.profiles?.[currentSettings?.activeProfileName]?.provider || dom.providerSelect?.value)?.keyOptional));

    if (status === "green") {
      label = "Connected";
      tooltip = `${prov} ${mdl ? "(" + mdl + ")" : ""}: Connected and ready.`;
    } else if (status === "yellow") {
      label = "Validating…";
      tooltip = `Testing connection with ${prov}…`;
    } else if (status === "red") {
      label = details.shortLabel || (isKeyOpt ? "Offline" : "Connection Failed");
      tooltip = `Connection Error: ${details.error || (isKeyOpt ? "Cannot reach local server." : "Invalid API key or network failure.")}`;
    } else { // gray
      label = isKeyOpt ? "Not Connected" : "Not Configured";
      tooltip = isKeyOpt ? `${prov}: Not connected. Click to test local connection.` : `API Connection: Not configured. Click to enter your API key.`;
    }

    if (dom.apiStatusLabel) {
      dom.apiStatusLabel.textContent = label;
    }
    dom.btnGlobalApiStatus.setAttribute("aria-label", tooltip);
    dom.btnGlobalApiStatus.setAttribute("title", tooltip);
  }

  // 2. Synchronize Popup Status Banner
  if (dom.popupStatusBanner) {
    dom.popupStatusBanner.className = `popup-status-banner status-${status}`;
    const isKeyOpt = Boolean(details.keyOptional || (typeof getProviderConfig === "function" && getProviderConfig(currentSettings?.profiles?.[currentSettings?.activeProfileName]?.provider || dom.providerSelect?.value)?.keyOptional));

    if (dom.popupStatusTitle) {
      if (status === "green") {
        dom.popupStatusTitle.textContent = "Connected & Validated";
      } else if (status === "yellow") {
        dom.popupStatusTitle.textContent = "Validating Connection…";
      } else if (status === "red") {
        dom.popupStatusTitle.textContent = details.shortLabel === "Missing Key" 
          ? "API Key Missing" 
          : (details.shortLabel === "Offline" ? "Local Server Offline" : "Connection Failed");
      } else {
        dom.popupStatusTitle.textContent = isKeyOpt ? "Not Connected" : "Not Configured";
      }
    }

    if (dom.popupStatusDesc) {
      if (status === "green") {
        dom.popupStatusDesc.textContent = details.message || `Active and ready to generate replies via ${prov}.`;
      } else if (status === "yellow") {
        dom.popupStatusDesc.textContent = details.message || `Testing connection with ${prov}…`;
      } else if (status === "red") {
        dom.popupStatusDesc.textContent = details.error || (isKeyOpt ? "Unable to reach local server. Make sure it is running." : "Unable to connect. Please check your credentials.");
      } else {
        dom.popupStatusDesc.textContent = details.message || (isKeyOpt ? `Configure and test connection for ${prov}.` : `Enter an API key for ${prov} to enable AI suggestions.`);
      }
    }
  }

  // 3. Update Popup Test Button State
  if (dom.btnTestPopupKey) {
    if (status === "yellow") {
      dom.btnTestPopupKey.disabled = true;
      dom.btnTestPopupKey.textContent = "Testing…";
    } else {
      dom.btnTestPopupKey.disabled = false;
      dom.btnTestPopupKey.textContent = "🔍 Test Connection";
    }
  }
}

function showPopupFeedback(text, type = "info") {
  if (!dom.popupFeedbackMessage) return;
  dom.popupFeedbackMessage.className = `popup-feedback ${type}`;
  dom.popupFeedbackMessage.textContent = text;
  dom.popupFeedbackMessage.style.display = "block";
}

function hidePopupFeedback() {
  if (!dom.popupFeedbackMessage) return;
  dom.popupFeedbackMessage.style.display = "none";
  dom.popupFeedbackMessage.textContent = "";
}

function getActionableErrorMessage(rawError, providerId, providerName) {
  const err = (rawError || "").trim();
  const lower = err.toLowerCase();
  const isLocal = providerId === "ollama" || providerId === "custom";

  if (!isLocal && (lower.includes("401") || lower.includes("unauthorized") || (lower.includes("invalid") && lower.includes("key")))) {
    return `Invalid or expired API key. Verify that your ${providerName} key is copied correctly without extra spaces or quotes.`;
  }
  if (lower.includes("403") || lower.includes("forbidden") || lower.includes("access denied")) {
    return isLocal
      ? `Local server rejected request (HTTP 403 Forbidden). Local server (Ollama) blocked the request due to CORS origin restrictions. Restart extension or ensure OLLAMA_ORIGINS="*" is allowed.`
      : `Access forbidden (HTTP 403). Your ${providerName} account does not have permission for the selected model.`;
  }
  if (lower.includes("404") || lower.includes("not found")) {
    return isLocal
      ? `Model or endpoint not found (HTTP 404). Check if the model is installed locally (e.g. 'ollama pull <model>') or verify endpoint URL.`
      : `Model or endpoint not found (HTTP 404). Check the model tag or endpoint URL in Profile settings.`;
  }
  if (lower.includes("429") || lower.includes("rate limit") || lower.includes("quota")) {
    return `Rate limit or quota exceeded (HTTP 429). Check your usage balance on ${providerName} dashboard.`;
  }
  if (lower.includes("time") && (lower.includes("out") || lower.includes("abort"))) {
    return isLocal
      ? `Local connection timed out. The local LLM may be busy loading the model into memory.`
      : `Connection timed out after 10 seconds. Check your internet connection or verify provider server availability.`;
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("offline") || lower.includes("cannot reach")) {
    return isLocal
      ? `Cannot reach local server. Make sure ${providerName} is running locally (e.g., at http://127.0.0.1:11434).`
      : `Network error. Unable to reach ${providerName} servers. Check your internet or proxy connection.`;
  }
  if (err.length > 0) {
    return err;
  }
  return isLocal
    ? `Unable to connect to ${providerName}. Please check that the server is running and endpoint URL is correct.`
    : `Unable to connect to ${providerName}. Please check your credentials and endpoint.`;
}

async function runApiValidation({ force = false, isManualTest = false } = {}) {
  const activeName = currentSettings.activeProfileName;
  const profile = currentSettings.profiles[activeName] || {};
  const provider = profile.provider || dom.providerSelect?.value || DEFAULT_PROVIDER_ID;
  const cfg = getProviderConfig(provider);
  const isKeyOptional = provider === "ollama" || provider === "custom" || Boolean(cfg.keyOptional);

  const apiKey = (dom.popupApiKey ? dom.popupApiKey.value : (dom.apiKey ? dom.apiKey.value : (profile.apiKey || ""))).trim();
  const endpoint = (profile.endpoint || dom.endpoint?.value || cfg.defaultEndpoint).trim();
  const model = (profile.model || dom.model?.value || cfg.defaultModel).trim();

  // If no API key and provider requires a key:
  if (!apiKey && provider !== "custom" && provider !== "ollama" && !cfg.keyOptional) {
    const isAssistantEnabled = dom.enabled?.checked;
    updateApiConnectionStatus(isAssistantEnabled ? "red" : "gray", {
      providerName: cfg.name,
      model: model,
      keyOptional: false,
      shortLabel: isAssistantEnabled ? "Missing Key" : "Not Configured",
      error: `API key is required for ${cfg.name}. Please enter your key to connect.`,
      message: `Enter your ${cfg.name} API key to enable AI suggestions.`
    });
    if (isManualTest) {
      showPopupFeedback(`Please enter a ${cfg.name} API key to test.`, "error");
    }
    return false;
  }

  // Deduplication check: if parameters haven't changed and already validated green, skip unless forced
  const currentParamsHash = `${provider}::${apiKey}::${endpoint}::${model}`;
  if (!force && lastValidatedParams === currentParamsHash && currentApiStatus === "green") {
    return true;
  }

  // If identical validation is currently in-flight, return active promise to avoid duplicate network calls
  if (isValidationInProgress && lastValidatedParams === currentParamsHash && activeValidationPromise) {
    return activeValidationPromise;
  }

  const seq = ++validationSeq;
  isValidationInProgress = true;
  lastValidatedParams = currentParamsHash;

  updateApiConnectionStatus("yellow", {
    providerName: cfg.name,
    model: model,
    keyOptional: isKeyOptional,
    message: isKeyOptional ? `Checking connection to ${cfg.name}…` : `Verifying connection with ${cfg.name}…`
  });

  if (isManualTest) {
    showPopupFeedback(`Testing connection to ${cfg.name}…`, "info");
  }

  const validationPromise = (async () => {
    try {
      let ep = endpoint;
      if (provider === "google" && !ep.includes("generativelanguage.googleapis.com")) {
        ep = cfg.defaultEndpoint;
      }

      const res = await chrome.runtime.sendMessage({
        type: "VALIDATE_KEY",
        provider,
        apiKey,
        endpoint: ep,
        model: model.replace(/^models\//, "")
      });

      // Avoid race conditions if superseded
      if (seq !== validationSeq) return false;

      if (res && res.ok) {
        updateApiConnectionStatus("green", {
          providerName: cfg.name,
          model: model,
          keyOptional: isKeyOptional,
          message: res.message || `Successfully connected to ${cfg.name}!`
        });
        if (isManualTest) {
          showPopupFeedback(isKeyOptional ? `✓ Connected to ${cfg.name}!` : `✓ Connected! ${cfg.name} API key is valid.`, "success");
        }
        return true;
      } else {
        const rawError = res ? res.error : (isKeyOptional ? "Connection failed." : "Key validation failed.");
        const actionable = getActionableErrorMessage(rawError, provider, cfg.name);
        updateApiConnectionStatus("red", {
          providerName: cfg.name,
          model: model,
          keyOptional: isKeyOptional,
          error: actionable,
          shortLabel: isKeyOptional ? "Offline" : "Invalid Key"
        });
        if (isManualTest) {
          showPopupFeedback(`✗ ${actionable}`, "error");
        }
        return false;
      }
    } catch (err) {
      if (seq !== validationSeq) return false;
      const actionable = getActionableErrorMessage(err.message, provider, cfg.name);
      updateApiConnectionStatus("red", {
        providerName: cfg.name,
        model: model,
        keyOptional: isKeyOptional,
        error: actionable,
        shortLabel: isKeyOptional ? "Offline" : "Failed"
      });
      if (isManualTest) {
        showPopupFeedback(`✗ ${actionable}`, "error");
      }
      return false;
    } finally {
      if (seq === validationSeq) {
        isValidationInProgress = false;
        activeValidationPromise = null;
      }
    }
  })();

  activeValidationPromise = validationPromise;
  return validationPromise;
}

function openApiConfigPopup() {
  hidePopupFeedback();
  displayActiveProfile();
  if (dom.apiConfigDialog && typeof dom.apiConfigDialog.showModal === "function") {
    if (!dom.apiConfigDialog.open) {
      dom.apiConfigDialog.showModal();
    }
  }
}

let statusDismissTimer = null;

function showStatus(text, type = "info") {
  if (statusDismissTimer) {
    clearTimeout(statusDismissTimer);
    statusDismissTimer = null;
  }
  dom.statusMessage.className = type;
  dom.statusMessage.textContent = text;
  dom.statusMessage.style.display = "block";

  // Auto-dismiss info and success alerts after 5 seconds to reduce cognitive noise
  if (type === "info" || type === "success") {
    statusDismissTimer = setTimeout(() => {
      clearStatus();
    }, 5000);
  }
}

function clearStatus() {
  if (statusDismissTimer) {
    clearTimeout(statusDismissTimer);
    statusDismissTimer = null;
  }
  dom.statusMessage.style.display = "none";
  dom.statusMessage.textContent = "";
}

// Fetch default prompt from background
async function getDefaultPrompt() {
  try {
    const res = await chrome.runtime.sendMessage({ type: "GET_DEFAULT_SYSTEM_PROMPT" });
    if (res && res.ok && res.prompt) {
      return res.prompt;
    }
  } catch (e) {}
  return "";
}

// Update or render model dropdown for current provider
function renderModelDropdown(providerId, activeModel) {
  if (!dom.modelSelect) return;
  dom.modelSelect.innerHTML = "";

  const cfg = getProviderConfig(providerId);
  const models = cfg.models || cfg.chips || [];
  let matched = false;

  models.forEach(modelInfo => {
    const opt = document.createElement("option");
    opt.value = modelInfo.model;
    opt.textContent = modelInfo.label;
    if (modelInfo.model === activeModel) {
      opt.selected = true;
      matched = true;
    }
    dom.modelSelect.appendChild(opt);
  });

  // Custom model tag option
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "Custom Model Tag…";
  if (!matched && activeModel) {
    customOpt.selected = true;
  }
  dom.modelSelect.appendChild(customOpt);
}

// Update UI elements to match active provider configuration
function updateProviderUI(providerId, updateFields = false) {
  const cfg = getProviderConfig(providerId);

  if (dom.providerSelect) {
    dom.providerSelect.value = cfg.id;
  }
  if (dom.popupProviderSelect) {
    dom.popupProviderSelect.value = cfg.id;
  }
  if (dom.providerBadge) {
    dom.providerBadge.textContent = cfg.badge || cfg.name;
  }
  if (dom.apiKeyLabel) {
    dom.apiKeyLabel.textContent = cfg.keyLabel;
  }
  if (dom.popupApiKeyLabel) {
    dom.popupApiKeyLabel.textContent = cfg.keyLabel;
  }
  if (dom.apiKey) {
    dom.apiKey.placeholder = cfg.keyPlaceholder;
  }
  if (dom.popupApiKey) {
    dom.popupApiKey.placeholder = cfg.keyPlaceholder;
  }

  if (updateFields) {
    dom.endpoint.value = cfg.defaultEndpoint;
    dom.model.value = cfg.defaultModel;
  }

  if (dom.popupModelDisplay) {
    dom.popupModelDisplay.textContent = dom.model.value;
  }
  if (dom.popupEndpointDisplay) {
    dom.popupEndpointDisplay.textContent = dom.endpoint.value;
    dom.popupEndpointDisplay.title = dom.endpoint.value;
  }

  renderModelDropdown(cfg.id, dom.model.value);
}

// Populate the profile select dropdown
function renderProfileDropdown() {
  dom.profileSelect.innerHTML = "";
  const names = Object.keys(currentSettings.profiles || {});
  if (names.length === 0) {
    names.push(DEFAULT_PROFILE_NAME);
    currentSettings.profiles = {
      [DEFAULT_PROFILE_NAME]: {
        name: DEFAULT_PROFILE_NAME,
        provider: DEFAULT_PROVIDER_ID,
        apiKey: "",
        endpoint: DEFAULT_ENDPOINT,
        model: DEFAULT_MODEL
      }
    };
  }

  names.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === currentSettings.activeProfileName) {
      opt.selected = true;
    }
    dom.profileSelect.appendChild(opt);
  });
}

// Load current active profile into the UI fields
function displayActiveProfile() {
  const profile = currentSettings.profiles[currentSettings.activeProfileName] || {
    name: currentSettings.activeProfileName || DEFAULT_PROFILE_NAME,
    provider: DEFAULT_PROVIDER_ID,
    apiKey: "",
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL
  };

  const provider = profile.provider || detectProvider(profile.endpoint, profile.model);
  profile.provider = provider;
  const cfg = getProviderConfig(provider);

  dom.profileName.value = profile.name || currentSettings.activeProfileName;
  if (dom.apiKey) dom.apiKey.value = profile.apiKey || "";
  if (dom.popupApiKey) dom.popupApiKey.value = profile.apiKey || "";

  // Prevent endpoint contamination from prior providers (e.g. NVIDIA endpoint on Ollama/Custom profile)
  let ep = sanitizeEndpointForProvider(profile.endpoint, provider);
  profile.endpoint = ep;
  dom.endpoint.value = ep;

  let mdl = sanitizeModelForProvider(profile.model, provider);
  profile.model = mdl;
  dom.model.value = mdl;

  if (dom.popupModelDisplay) {
    dom.popupModelDisplay.textContent = mdl;
  }
  if (dom.popupEndpointDisplay) {
    dom.popupEndpointDisplay.textContent = ep;
    dom.popupEndpointDisplay.title = ep;
  }

  updateProviderUI(provider, false);
}

// Save settings to chrome.storage.local
let saveTimeout = null;
function persistSettings(immediate = false) {
  clearTimeout(saveTimeout);
  
  const doSave = async () => {
    // Sync current UI fields into active profile
    const activeName = currentSettings.activeProfileName;
    const selectedProvider = (dom.providerSelect?.value) || DEFAULT_PROVIDER_ID;
    const cfg = getProviderConfig(selectedProvider);

    const activeKey = (dom.popupApiKey ? dom.popupApiKey.value : (dom.apiKey ? dom.apiKey.value : "")).trim();
    if (dom.apiKey) dom.apiKey.value = activeKey;
    if (dom.popupApiKey) dom.popupApiKey.value = activeKey;

    if (activeName && currentSettings.profiles[activeName]) {
      const ep = sanitizeEndpointForProvider(dom.endpoint.value.trim() || cfg.defaultEndpoint, selectedProvider);
      const mdl = sanitizeModelForProvider((dom.model.value.trim() || cfg.defaultModel).replace(/^models\//, ""), selectedProvider);
      currentSettings.profiles[activeName] = {
        name: activeName,
        provider: selectedProvider,
        apiKey: activeKey,
        endpoint: ep,
        model: mdl
      };
    }

    currentSettings.enabled = dom.enabled.checked;
    currentSettings.customPrompt = dom.customPrompt.value.trim();
    currentSettings.tone = dom.tone.value;
    currentSettings.contextTurns = parseInt(dom.contextTurns.value, 10) || DEFAULT_SETTINGS.contextTurns;
    currentSettings.maxChars = parseInt(dom.maxChars.value, 10) || DEFAULT_SETTINGS.maxChars;
    currentSettings.autoGenerate = dom.autoGenerate.checked;
    currentSettings.autoSend = dom.autoSend.checked;
    currentSettings.minDelayMs = parseInt(dom.minDelayMs.value, 10) || DEFAULT_SETTINGS.minDelayMs;
    currentSettings.maxDelayMs = parseInt(dom.maxDelayMs.value, 10) || DEFAULT_SETTINGS.maxDelayMs;
    currentSettings.maxSessionMessages = parseInt(dom.maxSessionMessages.value, 10) || DEFAULT_SETTINGS.maxSessionMessages;
    currentSettings.customKeywords = (dom.customKeywords?.value || "").trim();

    // Root mirrors for active profile
    const active = currentSettings.profiles[activeName];
    if (active) {
      currentSettings.provider = active.provider;
      currentSettings.apiKey = active.apiKey;
      currentSettings.model = active.model;
      currentSettings.endpoint = active.endpoint;
    }

    try {
      await chrome.storage.local.set({ settings: currentSettings });
    } catch (err) {
      showStatus("Failed to save settings: " + err.message, "error");
    }
  };

  if (immediate) {
    doSave();
  } else {
    saveTimeout = setTimeout(doSave, 250);
  }
}

// Load settings from storage
async function loadSettings() {
  try {
    const res = await chrome.storage.local.get("settings");
    const stored = res.settings || {};

    // Backward compatibility: upgrade single key to profiles if missing
    let profiles = stored.profiles;
    let activeProfileName = stored.activeProfileName || DEFAULT_PROFILE_NAME;

    if (!profiles || Object.keys(profiles).length === 0) {
      const detected = detectProvider(stored.endpoint, stored.model);
      profiles = {
        [DEFAULT_PROFILE_NAME]: {
          name: DEFAULT_PROFILE_NAME,
          provider: detected,
          apiKey: stored.apiKey || "",
          endpoint: stored.endpoint || DEFAULT_ENDPOINT,
          model: stored.model || DEFAULT_MODEL
        }
      };
    } else {
      // Ensure every profile has a provider property & sanitize invalid endpoint/model
      Object.keys(profiles).forEach(k => {
        const p = profiles[k];
        if (!p.provider) {
          p.provider = detectProvider(p.endpoint, p.model);
        }
        p.endpoint = sanitizeEndpointForProvider(p.endpoint, p.provider);
        p.model = sanitizeModelForProvider(p.model, p.provider);
        if (p.provider === "google") {
          if (!p.model || p.model.startsWith("gemini-3.8") || p.model.startsWith("gemini-3.5")) {
            p.model = PROVIDERS.google?.defaultModel || "gemini-2.5-flash";
          }
        }
      });
    }

    currentSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      profiles,
      activeProfileName
    };

    dom.enabled.checked = !!currentSettings.enabled;

    renderProfileDropdown();
    displayActiveProfile();

    if (currentSettings.customPrompt && currentSettings.customPrompt.trim()) {
      dom.customPrompt.value = currentSettings.customPrompt;
    } else {
      const defaultPrompt = await getDefaultPrompt();
      dom.customPrompt.value = defaultPrompt;
    }

    dom.tone.value = currentSettings.tone || DEFAULT_SETTINGS.tone;
    dom.contextTurns.value = currentSettings.contextTurns || DEFAULT_SETTINGS.contextTurns;
    dom.maxChars.value = currentSettings.maxChars || DEFAULT_SETTINGS.maxChars;
    dom.autoGenerate.checked = !!currentSettings.autoGenerate;
    dom.autoSend.checked = !!currentSettings.autoSend;
    dom.minDelayMs.value = currentSettings.minDelayMs || DEFAULT_SETTINGS.minDelayMs;
    dom.maxDelayMs.value = currentSettings.maxDelayMs || DEFAULT_SETTINGS.maxDelayMs;
    dom.maxSessionMessages.value = currentSettings.maxSessionMessages || DEFAULT_SETTINGS.maxSessionMessages;

    // Restore saved custom keywords if present
    if (currentSettings.customKeywords && dom.customKeywords) {
      dom.customKeywords.value = currentSettings.customKeywords;
    }

    // Automatically validate existing API key on application load
    runApiValidation({ force: true, isManualTest: false });
  } catch (err) {
    showStatus("Could not load settings: " + err.message, "error");
  }
}

// ── Reply Cards Logic & Dynamic Rendering ──

function updateReplyCountDisplay() {
  const validReplies = generatedReplyItems.filter(item => item && item.text && item.text.trim()).length;
  const isSelected = selectedCardIndex >= 0 && generatedReplyItems[selectedCardIndex]?.text ? 1 : 0;
  dom.replyCount.textContent = `${isSelected} selected / ${validReplies} available`;
}

function renderReplyCards() {
  const container = dom.replyCardsContainer;
  container.innerHTML = "";

  const hasAnyValidReply = generatedReplyItems.some(item => item && (item.text || item.loading));
  if (!hasAnyValidReply) {
    dom.replyChoicesSection.style.display = "none";
    dom.selectedPreview.style.display = "none";
    if (dom.emptyState) dom.emptyState.style.display = "block";
    return;
  }

  if (dom.emptyState) dom.emptyState.style.display = "none";
  dom.replyChoicesSection.style.display = "block";

  generatedReplyItems.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "reply-card";
    card.dataset.index = index;

    if (item.loading) {
      card.classList.add("loading");
    }
    if (selectedCardIndex === index && !item.loading && item.text) {
      card.classList.add("selected");
    }

    const numberSpan = document.createElement("span");
    numberSpan.className = "card-number";
    if (item.loading) {
      numberSpan.classList.add("skeleton-pulse");
      numberSpan.textContent = "";
    } else {
      numberSpan.textContent = index + 1;
    }

    const contentArea = document.createElement("div");
    contentArea.className = "card-content-area";

    if (item.loading) {
      // Modern skeleton lines with shimmering pulse
      const sk1 = document.createElement("div");
      sk1.className = "skeleton-line skeleton-pulse";
      sk1.style.width = "35%";

      const sk2 = document.createElement("div");
      sk2.className = "skeleton-line skeleton-pulse";
      sk2.style.width = "88%";

      const sk3 = document.createElement("div");
      sk3.className = "skeleton-line skeleton-pulse";
      sk3.style.width = "62%";

      contentArea.appendChild(sk1);
      contentArea.appendChild(sk2);
      contentArea.appendChild(sk3);
    } else {
      const headerMeta = document.createElement("div");
      headerMeta.className = "card-header-meta";

      const toneTag = document.createElement("span");
      toneTag.className = "card-tone-tag";
      toneTag.textContent = item.tone || `Choice ${index + 1}`;
      headerMeta.appendChild(toneTag);

      const cardText = document.createElement("p");
      cardText.className = "card-text";
      cardText.textContent = item.text || "—";

      contentArea.appendChild(headerMeta);
      contentArea.appendChild(cardText);
    }

    // Actions area: Quick Copy & Individual Regenerate
    const actionsArea = document.createElement("div");
    actionsArea.className = "card-actions";

    const btnQuickCopy = document.createElement("button");
    btnQuickCopy.className = "card-mini-btn";
    btnQuickCopy.type = "button";
    btnQuickCopy.title = "Copy reply to clipboard";
    btnQuickCopy.textContent = "📋";
    btnQuickCopy.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!item.text) return;
      try {
        await navigator.clipboard.writeText(item.text);
        btnQuickCopy.textContent = "✓";
        btnQuickCopy.classList.add("copied");
        showStatus(`Reply #${index + 1} copied to clipboard!`, "success");
        setTimeout(() => {
          btnQuickCopy.textContent = "📋";
          btnQuickCopy.classList.remove("copied");
        }, 1500);
      } catch (err) {
        showStatus("Copy failed: " + err.message, "error");
      }
    });

    const btnSingleRegen = document.createElement("button");
    btnSingleRegen.className = "card-mini-btn";
    btnSingleRegen.type = "button";
    btnSingleRegen.title = "Regenerate this specific reply";
    btnSingleRegen.textContent = "🔄";
    btnSingleRegen.addEventListener("click", (e) => {
      e.stopPropagation();
      regenerateSingleReply(index);
    });

    actionsArea.appendChild(btnQuickCopy);
    actionsArea.appendChild(btnSingleRegen);

    card.appendChild(numberSpan);
    card.appendChild(contentArea);
    card.appendChild(actionsArea);

    card.addEventListener("click", () => {
      selectCard(index);
    });

    container.appendChild(card);
  });

  updateReplyCountDisplay();

  // If a valid selection is active, sync with preview
  if (selectedCardIndex >= 0 && generatedReplyItems[selectedCardIndex]?.text) {
    dom.replyTest.value = generatedReplyItems[selectedCardIndex].text;
    dom.selectedPreview.style.display = "block";
  } else {
    dom.selectedPreview.style.display = "none";
  }
}

function selectCard(index) {
  if (!generatedReplyItems[index] || !generatedReplyItems[index].text || generatedReplyItems[index].loading) {
    return;
  }

  selectedCardIndex = index;
  renderReplyCards();
  showStatus(`Reply #${index + 1} selected.`, "info");
}

// Compute 4 distinct styles/tones for replies based on primary tone
function getDistinctTones(baseTone) {
  const allTones = [
    "Friendly and casual",
    "Funny and playful",
    "Warm and thoughtful",
    "Short and direct",
    "Flirty but respectful",
    "Chill and relaxed"
  ];

  const primary = baseTone || dom.tone.value || "Friendly and casual";
  const result = [primary];

  for (const t of allTones) {
    if (result.length >= 4) break;
    if (!result.includes(t)) {
      result.push(t);
    }
  }

  while (result.length < 4) {
    result.push(`Variation ${result.length + 1}`);
  }

  return result;
}

// Regenerate one individual reply without disrupting the other three
async function regenerateSingleReply(index) {
  const incoming = dom.incomingDisplay.value.trim();
  if (!incoming) {
    showStatus("No incoming message to reply to.", "error");
    return;
  }

  const selectedProvider = dom.providerSelect?.value || DEFAULT_PROVIDER_ID;
  const cfg = getProviderConfig(selectedProvider);

  const activeProfile = currentSettings.profiles[currentSettings.activeProfileName] || {};
  const apiKey = (dom.popupApiKey ? dom.popupApiKey.value : (dom.apiKey ? dom.apiKey.value : (activeProfile.apiKey || ""))).trim();
  if (!apiKey && selectedProvider !== "custom" && selectedProvider !== "ollama" && !cfg.keyOptional) {
    showStatus(`Please enter or select an active ${cfg.name} API key.`, "error");
    return;
  }

  if (isGeneratingAll) {
    showStatus("Full generation already in progress. Please wait.", "info");
    return;
  }

  const targetItem = generatedReplyItems[index];
  if (!targetItem) return;

  targetItem.loading = true;
  renderReplyCards();
  showStatus(`Regenerating Reply #${index + 1} (${targetItem.tone})…`, "info");

  const keywords = (dom.customKeywords?.value || "").trim();

  try {
    const res = await chrome.runtime.sendMessage({
      type: "GENERATE_REPLY",
      provider: selectedProvider,
      endpoint: dom.endpoint.value.trim(),
      model: dom.model.value.trim(),
      apiKey: apiKey,
      incoming: incoming,
      partner: "Stranger",
      tone: targetItem.tone,
      customInstructions: keywords,
      history: []
    });

    targetItem.loading = false;
    if (res && res.ok && res.reply) {
      targetItem.text = res.reply;
      if (selectedCardIndex === index) {
        dom.replyTest.value = res.reply;
      }
      showStatus(`Reply #${index + 1} updated!`, "success");
    } else {
      showStatus(`Reply #${index + 1} failed: ${res?.error || "Unknown error"}`, "error");
    }
  } catch (err) {
    targetItem.loading = false;
    showStatus(`Failed to regenerate Reply #${index + 1}: ${err.message}`, "error");
  }

  renderReplyCards();
}

// Clear generated replies and reset selection state
function clearGeneratedReplies() {
  generatedReplyItems = [];
  selectedCardIndex = -1;
  lastGeneratedMessage = "";
  if (dom.replyTest) {
    dom.replyTest.value = "";
  }
  renderReplyCards();
  updateReplyCountDisplay();
}

// Generate or Regenerate all 4 replies
async function generateMultipleReplies({ isRegeneration = false } = {}) {
  const incoming = dom.incomingDisplay.value.trim();
  if (!incoming) {
    showStatus("Please enter, paste, or wait for a message to reply to.", "error");
    dom.incomingDisplay.focus();
    return;
  }

  const selectedProvider = dom.providerSelect?.value || DEFAULT_PROVIDER_ID;
  const cfg = getProviderConfig(selectedProvider);

  const activeProfile = currentSettings.profiles[currentSettings.activeProfileName] || {};
  const apiKey = (dom.popupApiKey ? dom.popupApiKey.value : (dom.apiKey ? dom.apiKey.value : (activeProfile.apiKey || ""))).trim();
  if (!apiKey && selectedProvider !== "custom" && selectedProvider !== "ollama" && !cfg.keyOptional) {
    showStatus(`Please configure an active ${cfg.name} API key via the top status button.`, "error");
    updateApiConnectionStatus("red", {
      providerName: cfg.name,
      shortLabel: "Missing Key",
      error: `API key required for ${cfg.name}. Click top status button to configure.`
    });
    return;
  }

  if (isGeneratingAll) {
    showStatus("Generation request is already in progress.", "info");
    return;
  }

  isGeneratingAll = true;
  dom.btnGenerate.disabled = true;
  dom.btnRegenCustom.disabled = true;
  dom.btnGenerate.textContent = "⏳ Generating…";

  // Automatically read custom keywords from field (never ignored)
  const keywords = (dom.customKeywords?.value || "").trim();

  // If this is the initial generation or message changed, initialize the items
  const distinctTones = getDistinctTones(dom.tone.value);
  const previousReplies = [...generatedReplyItems];

  if (!isRegeneration || generatedReplyItems.length === 0 || lastGeneratedMessage !== incoming) {
    // Fresh generation: initialize 4 loading slots
    generatedReplyItems = distinctTones.map(tone => ({
      text: "",
      tone: tone,
      loading: true
    }));
    selectedCardIndex = -1;
  } else {
    // Regeneration: mark existing cards as loading without wiping text until new results arrive
    generatedReplyItems = generatedReplyItems.map((item, idx) => ({
      ...item,
      tone: item.tone || distinctTones[idx],
      loading: true
    }));
  }

  renderReplyCards();
  showStatus(
    keywords 
      ? `Generating replies with custom instructions ("${keywords}")…` 
      : `Generating 4 varied replies via ${cfg.name}…`, 
    "info"
  );

  // Parallel generation of 4 distinct replies
  const promises = distinctTones.map((tone, i) => {
    return chrome.runtime.sendMessage({
      type: "GENERATE_REPLY",
      provider: selectedProvider,
      endpoint: dom.endpoint.value.trim(),
      model: dom.model.value.trim(),
      apiKey: apiKey,
      incoming: incoming,
      partner: "Stranger",
      tone: tone,
      customInstructions: keywords,
      history: []
    }).then(response => {
      if (response && response.ok && response.reply) {
        return { index: i, tone, text: response.reply, ok: true };
      } else {
        return { index: i, tone, error: response?.error || "Empty response", ok: false };
      }
    }).catch(err => {
      return { index: i, tone, error: err.message || String(err), ok: false };
    });
  });

  const results = await Promise.allSettled(promises);

  // Build a fresh array to avoid mutating generatedReplyItems during iteration
  const updatedReplies = distinctTones.map((tone, idx) => ({
    ...generatedReplyItems[idx],
    tone,
    loading: true
  }));
  let successCount = 0;
  results.forEach(res => {
    const data = res.value;
    if (data && data.ok && data.text) {
      const idx = data.index;
      updatedReplies[idx] = {
        text: data.text,
        tone: data.tone,
        loading: false
      };
      successCount++;
    } else {
      const idx = data?.index ?? 0;
      const fallbackText = previousReplies[idx]?.text || "";
      updatedReplies[idx] = {
        text: fallbackText,
        tone: distinctTones[idx],
        loading: false
      };
      console.warn(`Reply ${idx + 1} failed:`, data?.error);
    }
  });
  // Replace old items with the updated array
  generatedReplyItems = updatedReplies;

  isGeneratingAll = false;
  dom.btnGenerate.disabled = false;
  dom.btnRegenCustom.disabled = false;
  dom.btnGenerate.textContent = "⚡ Generate Replies";
  lastGeneratedMessage = incoming;

  if (successCount > 0) {
    // If no card was selected or previous selection was invalid, pick first successful
    if (selectedCardIndex < 0 || !generatedReplyItems[selectedCardIndex]?.text) {
      const firstValid = generatedReplyItems.findIndex(r => r.text);
      if (firstValid >= 0) selectedCardIndex = firstValid;
    }
    renderReplyCards();
    showStatus(`${successCount} of 4 replies ready. Click any card to select or copy directly.`, "success");
  } else {
    // Extract first informative error message from failed requests
    const firstError = results.map(r => r.value?.error).find(err => Boolean(err && err.trim())) || "";
    const isKeyOptional = selectedProvider === "ollama" || selectedProvider === "custom" || Boolean(cfg.keyOptional);
    const providerHint = isKeyOptional 
      ? `Check that ${cfg.name} is running and model '${dom.model.value.trim()}' is installed.` 
      : `Please verify your ${cfg.name} API key connection.`;

    // If complete failure, restore previous
    if (previousReplies.length > 0 && previousReplies.some(r => r.text)) {
      generatedReplyItems = previousReplies.map(r => ({ ...r, loading: false }));
      renderReplyCards();
      showStatus(
        firstError 
          ? `Regeneration failed: ${firstError} (previous replies preserved)`
          : `Regeneration failed; previous replies were preserved. ${providerHint}`, 
        "error"
      );
    } else {
      generatedReplyItems = [];
      renderReplyCards();
      showStatus(
        firstError 
          ? `Reply generation failed: ${firstError}`
          : `All reply generations failed. ${providerHint}`, 
        "error"
      );
    }
  }
}

// ── Event Listeners ──

// Global API Status button in top navigation -> open popup
if (dom.btnGlobalApiStatus) {
  dom.btnGlobalApiStatus.addEventListener("click", () => {
    openApiConfigPopup();
  });
}

// Profile section shortcut -> open popup
if (dom.btnOpenApiConfigFromProfile) {
  dom.btnOpenApiConfigFromProfile.addEventListener("click", () => {
    openApiConfigPopup();
  });
}

// Close API Configuration Dialog
if (dom.btnCloseApiDialog) {
  dom.btnCloseApiDialog.addEventListener("click", () => {
    if (dom.apiConfigDialog) dom.apiConfigDialog.close();
  });
}

// Dismiss popup when clicking backdrop outside dialog card
if (dom.apiConfigDialog) {
  dom.apiConfigDialog.addEventListener("click", (e) => {
    const rect = dom.apiConfigDialog.getBoundingClientRect();
    const isInDialog = (
      rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX && e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) {
      dom.apiConfigDialog.close();
    }
  });
}

// Toggle API Key visibility in popup (masked by default)
if (dom.btnTogglePopupKeyVisibility) {
  dom.btnTogglePopupKeyVisibility.addEventListener("click", () => {
    if (dom.popupApiKey.type === "password") {
      dom.popupApiKey.type = "text";
      dom.btnTogglePopupKeyVisibility.textContent = "🔒";
    } else {
      dom.popupApiKey.type = "password";
      dom.btnTogglePopupKeyVisibility.textContent = "👁️";
    }
  });
}

// Clear API Key button in popup
if (dom.btnClearPopupKey) {
  dom.btnClearPopupKey.addEventListener("click", () => {
    if (dom.popupApiKey) dom.popupApiKey.value = "";
    if (dom.apiKey) dom.apiKey.value = "";
    persistSettings(true);
    hidePopupFeedback();

    const selectedProvider = dom.popupProviderSelect?.value || dom.providerSelect?.value || DEFAULT_PROVIDER_ID;
    const cfg = getProviderConfig(selectedProvider);

    updateApiConnectionStatus(dom.enabled?.checked ? "red" : "gray", {
      providerName: cfg.name,
      shortLabel: dom.enabled?.checked ? "Missing Key" : "Not Configured",
      error: `API key cleared. A valid ${cfg.name} key is required to generate replies.`,
      message: `API key cleared. Enter your ${cfg.name} key to connect.`
    });
    showStatus("API key cleared.", "info");
  });
}

// Manual Test Connection button in popup
if (dom.btnTestPopupKey) {
  dom.btnTestPopupKey.addEventListener("click", async () => {
    persistSettings(true);
    await runApiValidation({ force: true, isManualTest: true });
  });
}

// Save & Connect button in popup
if (dom.btnSavePopupKey) {
  dom.btnSavePopupKey.addEventListener("click", async () => {
    persistSettings(true);
    showPopupFeedback("Saving settings and verifying connection…", "info");
    const ok = await runApiValidation({ force: true, isManualTest: true });
    if (ok) {
      const selectedProvider = dom.popupProviderSelect?.value || dom.providerSelect?.value || DEFAULT_PROVIDER_ID;
      const cfg = getProviderConfig(selectedProvider);
      const isKeyOpt = selectedProvider === "ollama" || selectedProvider === "custom" || Boolean(cfg.keyOptional);
      showStatus(isKeyOpt ? `${cfg.name} connected and verified!` : "API key saved and verified!", "success");
      setTimeout(() => {
        if (dom.apiConfigDialog && dom.apiConfigDialog.open) {
          dom.apiConfigDialog.close();
        }
      }, 1000);
    }
  });
}

// Debounced auto-validation on typing in popup key input
let keyDebounceTimer = null;
if (dom.popupApiKey) {
  dom.popupApiKey.addEventListener("input", () => {
    if (dom.apiKey) dom.apiKey.value = dom.popupApiKey.value;
    clearTimeout(keyDebounceTimer);
    hidePopupFeedback();
    keyDebounceTimer = setTimeout(() => {
      persistSettings(false);
      runApiValidation({ force: true, isManualTest: false });
    }, 800);
  });
}

function onProviderSelected(selectedProvider) {
  const activeName = currentSettings.activeProfileName;
  const currentProfile = currentSettings.profiles[activeName] || {};
  const previousProvider = currentProfile.provider || dom.providerSelect?.value || DEFAULT_PROVIDER_ID;

  if (dom.providerSelect) dom.providerSelect.value = selectedProvider;
  if (dom.popupProviderSelect) dom.popupProviderSelect.value = selectedProvider;
  const cfg = getProviderConfig(selectedProvider);

  const providerChanged = previousProvider !== selectedProvider;

  // When provider is switched, clear the old API key (which is not valid anymore for the chosen provider)
  if (providerChanged) {
    if (dom.apiKey) dom.apiKey.value = "";
    if (dom.popupApiKey) dom.popupApiKey.value = "";
    if (currentProfile) {
      currentProfile.apiKey = "";
    }
    currentSettings.apiKey = "";
    lastValidatedParams = null;
  }

  // Apply provider defaults to endpoint and model
  dom.endpoint.value = cfg.defaultEndpoint;
  dom.model.value = cfg.defaultModel;

  if (currentProfile) {
    currentProfile.provider = selectedProvider;
    currentProfile.endpoint = cfg.defaultEndpoint;
    currentProfile.model = cfg.defaultModel;
  }

  updateProviderUI(selectedProvider, false);
  persistSettings(true);
  hidePopupFeedback();
  runApiValidation({ force: true, isManualTest: false });

  if (providerChanged) {
    if (selectedProvider === "ollama" || selectedProvider === "custom" || cfg.keyOptional) {
      showStatus(`Switched to ${cfg.name}. Old API key cleared (no key needed for Ollama).`, "info");
    } else {
      showStatus(`Switched to ${cfg.name}. Old API key cleared — please enter a valid ${cfg.name} key.`, "info");
    }
  } else {
    showStatus(`Provider: ${cfg.name}.`, "info");
  }
}

// Popup Provider Select listener
if (dom.popupProviderSelect) {
  dom.popupProviderSelect.addEventListener("change", () => {
    onProviderSelected(dom.popupProviderSelect.value);
  });
}

// Editable Message Input: Paste from clipboard
if (dom.btnPasteIncoming) {
  dom.btnPasteIncoming.addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        dom.incomingDisplay.value = text;
        dom.incomingDisplay.focus();
        showStatus("Pasted message from clipboard.", "info");
      } else {
        dom.incomingDisplay.focus();
        showStatus("Clipboard is empty.", "info");
      }
    } catch (err) {
      dom.incomingDisplay.focus();
      showStatus("Clipboard read blocked by browser permissions. Use Ctrl+V to paste.", "info");
    }
  });
}

// Editable Message Input: Clear content
if (dom.btnClearIncoming) {
  dom.btnClearIncoming.addEventListener("click", () => {
    dom.incomingDisplay.value = "";
    dom.incomingDisplay.focus();
    clearGeneratedReplies();
    showStatus("Message input cleared.", "info");
  });
}

// Profile Switch event
dom.profileSelect.addEventListener("change", () => {
  const selected = dom.profileSelect.value;
  if (selected && currentSettings.profiles[selected]) {
    currentSettings.activeProfileName = selected;
    displayActiveProfile();
    persistSettings();
    runApiValidation({ force: true, isManualTest: false });
    showStatus(`Switched to profile "${selected}".`, "info");
  }
});

// Create New Profile
dom.btnNewProfile.addEventListener("click", () => {
  const existingCount = Object.keys(currentSettings.profiles).length;
  const newName = `Profile ${existingCount + 1}`;
  dom.profileName.value = newName;
  if (dom.apiKey) dom.apiKey.value = "";
  if (dom.popupApiKey) dom.popupApiKey.value = "";
  dom.providerSelect.value = DEFAULT_PROVIDER_ID;
  if (dom.popupProviderSelect) dom.popupProviderSelect.value = DEFAULT_PROVIDER_ID;
  const cfg = getProviderConfig(DEFAULT_PROVIDER_ID);
  dom.model.value = cfg.defaultModel;
  dom.endpoint.value = cfg.defaultEndpoint;
  updateProviderUI(DEFAULT_PROVIDER_ID, false);
  dom.profileName.focus();
  runApiValidation({ force: true, isManualTest: false });
  showStatus(`Enter details for "${newName}", configure key via top status button.`, "info");
});

// Save Profile
dom.btnSaveProfile.addEventListener("click", () => {
  const name = dom.profileName.value.trim();
  if (!name) {
    showStatus("Please enter a profile name.", "error");
    return;
  }

  const selectedProvider = dom.providerSelect?.value || DEFAULT_PROVIDER_ID;
  const cfg = getProviderConfig(selectedProvider);
  const activeKey = (dom.popupApiKey ? dom.popupApiKey.value : (dom.apiKey ? dom.apiKey.value : "")).trim();

  const profileData = {
    name: name,
    provider: selectedProvider,
    apiKey: activeKey,
    model: dom.model.value.trim() || cfg.defaultModel,
    endpoint: dom.endpoint.value.trim() || cfg.defaultEndpoint
  };

  currentSettings.profiles[name] = profileData;
  currentSettings.activeProfileName = name;

  renderProfileDropdown();
  displayActiveProfile();
  persistSettings();
  runApiValidation({ force: true, isManualTest: false });
  showStatus(`Profile "${name}" saved and set as active.`, "success");
});

// Delete Profile - with native <dialog> confirmation
dom.btnDeleteProfile.addEventListener("click", () => {
  const current = currentSettings.activeProfileName;
  const profileKeys = Object.keys(currentSettings.profiles);

  if (profileKeys.length <= 1) {
    // Reset the only profile instead of deleting
    currentSettings.profiles[DEFAULT_PROFILE_NAME] = {
      name: DEFAULT_PROFILE_NAME,
      provider: DEFAULT_PROVIDER_ID,
      apiKey: "",
      endpoint: DEFAULT_ENDPOINT,
      model: DEFAULT_MODEL
    };
    currentSettings.activeProfileName = DEFAULT_PROFILE_NAME;
    renderProfileDropdown();
    displayActiveProfile();
    persistSettings();
    runApiValidation({ force: true, isManualTest: false });
    showStatus(`Reset "${current}" to clean default.`, "info");
    return;
  }

  // Open confirmation dialog
  if (dom.deleteProfileDialog && typeof dom.deleteProfileDialog.showModal === "function") {
    if (dom.deleteProfileTargetName) {
      dom.deleteProfileTargetName.textContent = current;
    }
    dom.deleteProfileDialog.showModal();
  } else {
    // Fallback if dialog not supported
    if (confirm(`Are you sure you want to delete profile "${current}"?`)) {
      performDeleteProfile(current);
    }
  }
});

function performDeleteProfile(profileToDelete) {
  delete currentSettings.profiles[profileToDelete];
  const remaining = Object.keys(currentSettings.profiles);
  currentSettings.activeProfileName = remaining[0];

  renderProfileDropdown();
  displayActiveProfile();
  persistSettings();
  runApiValidation({ force: true, isManualTest: false });
  showStatus(`Deleted "${profileToDelete}". Active profile is now "${remaining[0]}".`, "info");
}

// Handle dialog close confirmation
if (dom.deleteProfileDialog) {
  dom.deleteProfileDialog.addEventListener("close", () => {
    if (dom.deleteProfileDialog.returnValue === "confirm") {
      const current = currentSettings.activeProfileName;
      performDeleteProfile(current);
    }
  });
}

// Fallback legacy Toggle API Key visibility
if (dom.btnToggleKeyVisibility && dom.apiKey) {
  dom.btnToggleKeyVisibility.addEventListener("click", () => {
    if (dom.apiKey.type === "password") {
      dom.apiKey.type = "text";
      dom.btnToggleKeyVisibility.textContent = "🔒";
    } else {
      dom.apiKey.type = "password";
      dom.btnToggleKeyVisibility.textContent = "👁️";
    }
  });
}

// Fallback legacy Test Key Connection
if (dom.btnTestKey) {
  dom.btnTestKey.addEventListener("click", async () => {
    await runApiValidation({ force: true, isManualTest: true });
  });
}

// Provider selection change listener
if (dom.providerSelect) {
  dom.providerSelect.addEventListener("change", () => {
    onProviderSelected(dom.providerSelect.value);
  });
}

// Model Dropdown selection listener
if (dom.modelSelect) {
  dom.modelSelect.addEventListener("change", () => {
    const selected = dom.modelSelect.value;
    if (selected === "__custom__") {
      if (dom.model) {
        dom.model.focus();
        dom.model.select();
      }
    } else {
      if (dom.model) {
        dom.model.value = selected;
      }
      if (dom.popupModelDisplay) {
        dom.popupModelDisplay.textContent = selected;
      }
      persistSettings(true);
      showStatus(`Model selected: ${selected}`, "info");
    }
  });
}

// Keep dropdown synchronized when manual model tag changes
if (dom.model) {
  dom.model.addEventListener("input", () => {
    const val = dom.model.value.trim();
    if (dom.modelSelect) {
      const options = Array.from(dom.modelSelect.options);
      const match = options.find(opt => opt.value === val);
      if (match) {
        dom.modelSelect.value = val;
      } else {
        dom.modelSelect.value = "__custom__";
      }
    }
    if (dom.popupModelDisplay) {
      dom.popupModelDisplay.textContent = val;
    }
  });
}

// Endpoint input change
if (dom.endpoint) {
  dom.endpoint.addEventListener("input", () => {
    if (dom.popupEndpointDisplay) {
      dom.popupEndpointDisplay.textContent = dom.endpoint.value.trim();
      dom.popupEndpointDisplay.title = dom.endpoint.value.trim();
    }
  });
}

// Attach auto-save listeners to toggle switches with instant persistence
[dom.enabled, dom.autoGenerate, dom.autoSend].forEach(toggle => {
  if (toggle) {
    toggle.addEventListener("change", () => {
      persistSettings(true);
      if (toggle === dom.enabled) {
        // Re-evaluate validation state display (e.g. gray vs red for missing key)
        runApiValidation({ force: false, isManualTest: false });
      }
    });
  }
});

// Attach auto-save listeners to other form controls
[
  dom.apiKey, dom.endpoint, dom.model, dom.customPrompt, dom.tone,
  dom.contextTurns, dom.maxChars,
  dom.minDelayMs, dom.maxDelayMs, dom.maxSessionMessages
].forEach(input => {
  if (input) {
    input.addEventListener("input", () => persistSettings(false));
    input.addEventListener("change", () => persistSettings(false));
  }
});

// Reset persona prompt button
dom.btnResetPrompt.addEventListener("click", async () => {
  const defaultPrompt = await getDefaultPrompt();
  dom.customPrompt.value = defaultPrompt;
  persistSettings();
  showStatus("Reset persona prompt to default.", "info");
});

// Primary Generate button (uses incoming text + custom keywords)
dom.btnGenerate.addEventListener("click", () => {
  generateMultipleReplies({ isRegeneration: false });
});

// Regenerate action beside keywords field (uses incoming text + custom keywords)
dom.btnRegenCustom.addEventListener("click", () => {
  generateMultipleReplies({ isRegeneration: true });
});

// Auto-persist keywords when user types
if (dom.customKeywords) {
  dom.customKeywords.addEventListener("input", () => {
    persistSettings(false);
  });
  // Also support pressing Enter in the keywords input to trigger generation
  dom.customKeywords.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      generateMultipleReplies({ isRegeneration: generatedReplyItems.length > 0 });
    }
  });
}

// Copy button
dom.btnCopy.addEventListener("click", async () => {
  const text = dom.replyTest.value.trim();
  if (!text) {
    showStatus("Nothing to copy.", "error");
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showStatus("Reply copied to clipboard.", "success");
  } catch (err) {
    showStatus("Clipboard copy failed: " + err.message, "error");
  }
});

// Send selected reply
if (dom.btnSendSelected) {
  dom.btnSendSelected.addEventListener("click", async () => {
    const text = dom.replyTest.value.trim();
    if (!text) {
      showStatus("No reply selected to send.", "error");
      return;
    }

    try {
      // Send to active tab's content script
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        await chrome.tabs.sendMessage(tab.id, {
          type: "INJECT_REPLY",
          reply: text
        });
        showStatus("Reply sent to chat!", "success");
        // Clear the generated reply values now that it has been sent
        clearGeneratedReplies();
      } else {
        showStatus("No active chat tab found.", "error");
      }
    } catch (err) {
      showStatus("Failed to send: " + err.message, "error");
    }
  });
}

// Listener for STATUS_UPDATE / TAB_STATE_UPDATE messages from background/content
function addStatusListener() {
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && (msg.type === "STATUS_UPDATE" || msg.type === "TAB_STATE_UPDATE")) {
      const state = msg.state || msg;
      const incoming = state.incoming || msg.incoming;
      if (incoming && dom.incomingDisplay) {
        const isNewMessage = dom.incomingDisplay.value !== incoming;
        if (isNewMessage) {
          dom.incomingDisplay.value = incoming;
          // Clear old reply values so new message gets a fresh generation
          clearGeneratedReplies();

          // Update badge
          dom.incomingBadge.textContent = "New!";
          dom.incomingBadge.classList.add("active");
          setTimeout(() => {
            if (dom.incomingBadge) dom.incomingBadge.classList.remove("active");
          }, 3000);

          if (currentSettings.autoGenerate && !isGeneratingAll) {
            showStatus("New message received. Auto-generating fresh replies…", "info");
            generateMultipleReplies({ isRegeneration: false });
          } else {
            showStatus("New message received. Ready to generate replies for latest text.", "info");
          }
        }
      }
      if (state.generated && dom.replyTest) {
        // If an auto-generated reply came in from background watcher, display it if no choices yet
        if (generatedReplyItems.length === 0) {
          generatedReplyItems = [{
            text: state.generated,
            tone: "Auto-Generated",
            loading: false
          }];
          selectedCardIndex = 0;
          renderReplyCards();
        }
      }
    }
  });
}

// Dynamically adapt header title to current tab
async function updateTabContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.title && dom.appTitle && dom.appSubtitle) {
      let pageTitle = tab.title.trim();
      // Clean up common long title suffixes
      if (pageTitle.length > 26) {
        pageTitle = pageTitle.substring(0, 24) + "…";
      }
      dom.appTitle.textContent = `${pageTitle}`;
      
      let host = "";
      try {
        if (tab.url) {
          host = new URL(tab.url).hostname.replace(/^www\./, "");
        }
      } catch (e) {}

      dom.appSubtitle.textContent = host ? `Active on ${host}` : "Universal conversational copilot";
    }
  } catch (err) {
    // Fallback if tab permissions restricted
    if (dom.appTitle) dom.appTitle.textContent = "OmniChat Copilot";
    if (dom.appSubtitle) dom.appSubtitle.textContent = "Universal conversational copilot";
  }
}

// Track tab activation and title updates
function addTabListeners() {
  chrome.tabs.onActivated.addListener(() => {
    updateTabContext();
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.title || changeInfo.url) {
      updateTabContext();
    }
  });
}

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  loadSettings();
  addStatusListener();
  updateTabContext();
  addTabListeners();
});