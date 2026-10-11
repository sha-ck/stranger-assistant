// sidepanel.js - Controller for TWS NIM Assistant with Named Profiles & Multi-Reply Cards

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
  // Root fallbacks for backward compatibility
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
  enabled: document.getElementById("enabled"),
  profileSelect: document.getElementById("profileSelect"),
  btnNewProfile: document.getElementById("btnNewProfile"),
  btnSaveProfile: document.getElementById("btnSaveProfile"),
  btnDeleteProfile: document.getElementById("btnDeleteProfile"),
  profileName: document.getElementById("profileName"),
  apiKey: document.getElementById("apiKey"),
  btnToggleKeyVisibility: document.getElementById("btnToggleKeyVisibility"),
  btnTestKey: document.getElementById("btnTestKey"),
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
  chips: document.querySelectorAll(".chip-btn")
};

function showStatus(text, type = "info") {
  dom.statusMessage.className = type;
  dom.statusMessage.textContent = text;
  dom.statusMessage.style.display = "block";
}

function clearStatus() {
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

// Update chip active classes
function updateActiveChip(modelName) {
  dom.chips.forEach(chip => {
    if (chip.getAttribute("data-model") === modelName) {
      chip.classList.add("active");
    } else {
      chip.classList.remove("active");
    }
  });
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
    apiKey: "",
    endpoint: DEFAULT_ENDPOINT,
    model: DEFAULT_MODEL
  };

  dom.profileName.value = profile.name || currentSettings.activeProfileName;
  dom.apiKey.value = profile.apiKey || "";
  dom.endpoint.value = profile.endpoint || DEFAULT_ENDPOINT;
  dom.model.value = profile.model || DEFAULT_MODEL;

  updateActiveChip(dom.model.value);
}

// Save settings to chrome.storage.local
let saveTimeout = null;
function persistSettings(immediate = false) {
  clearTimeout(saveTimeout);
  
  const doSave = async () => {
    // Sync current UI fields into active profile
    const activeName = currentSettings.activeProfileName;
    if (activeName && currentSettings.profiles[activeName]) {
      currentSettings.profiles[activeName] = {
        name: activeName,
        apiKey: dom.apiKey.value.trim(),
        endpoint: dom.endpoint.value.trim() || DEFAULT_ENDPOINT,
        model: dom.model.value.trim() || DEFAULT_MODEL
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
      profiles = {
        [DEFAULT_PROFILE_NAME]: {
          name: DEFAULT_PROFILE_NAME,
          apiKey: stored.apiKey || "",
          endpoint: stored.endpoint || DEFAULT_ENDPOINT,
          model: stored.model || DEFAULT_MODEL
        }
      };
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
    return;
  }

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
    numberSpan.textContent = index + 1;

    const contentArea = document.createElement("div");
    contentArea.className = "card-content-area";

    const headerMeta = document.createElement("div");
    headerMeta.className = "card-header-meta";

    const toneTag = document.createElement("span");
    toneTag.className = "card-tone-tag";
    toneTag.textContent = item.tone || `Choice ${index + 1}`;
    headerMeta.appendChild(toneTag);

    const cardText = document.createElement("p");
    cardText.className = "card-text";
    cardText.textContent = item.loading ? "Generating reply" : (item.text || "—");

    contentArea.appendChild(headerMeta);
    contentArea.appendChild(cardText);

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

  const apiKey = dom.apiKey.value.trim();
  if (!apiKey) {
    showStatus("Please enter or select an active NVIDIA NIM API key.", "error");
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
      type: "NIM_GENERATE",
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

// Generate or Regenerate all 4 replies
async function generateMultipleReplies({ isRegeneration = false } = {}) {
  const incoming = dom.incomingDisplay.value.trim();
  if (!incoming) {
    showStatus("No incoming message to reply to. Waiting for incoming chat…", "error");
    return;
  }

  const apiKey = dom.apiKey.value.trim();
  if (!apiKey) {
    showStatus("Please enter or select an active NVIDIA NIM API key.", "error");
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
      : "Generating 4 varied replies via NVIDIA NIM…", 
    "info"
  );

  // Parallel generation of 4 distinct replies
  const promises = distinctTones.map((tone, i) => {
    return chrome.runtime.sendMessage({
      type: "NIM_GENERATE",
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
    // If complete failure, restore previous
    if (previousReplies.length > 0 && previousReplies.some(r => r.text)) {
      generatedReplyItems = previousReplies.map(r => ({ ...r, loading: false }));
      renderReplyCards();
      showStatus("Regeneration failed; previous replies were preserved. Check your API key.", "error");
    } else {
      generatedReplyItems = [];
      renderReplyCards();
      showStatus("All reply generations failed. Please verify your API key connection.", "error");
    }
  }
}

// ── Event Listeners ──

// Profile Switch event
dom.profileSelect.addEventListener("change", () => {
  const selected = dom.profileSelect.value;
  if (selected && currentSettings.profiles[selected]) {
    currentSettings.activeProfileName = selected;
    displayActiveProfile();
    persistSettings();
    showStatus(`Switched to profile "${selected}".`, "info");
  }
});

// Create New Profile
dom.btnNewProfile.addEventListener("click", () => {
  const existingCount = Object.keys(currentSettings.profiles).length;
  const newName = `Profile ${existingCount + 1}`;
  dom.profileName.value = newName;
  dom.apiKey.value = "";
  dom.model.value = DEFAULT_MODEL;
  dom.endpoint.value = DEFAULT_ENDPOINT;
  dom.profileName.focus();
  showStatus(`Enter key and details for "${newName}", then click Save Profile.`, "info");
});

// Save Profile
dom.btnSaveProfile.addEventListener("click", () => {
  const name = dom.profileName.value.trim();
  if (!name) {
    showStatus("Please enter a profile name.", "error");
    return;
  }

  const profileData = {
    name: name,
    apiKey: dom.apiKey.value.trim(),
    model: dom.model.value.trim() || DEFAULT_MODEL,
    endpoint: dom.endpoint.value.trim() || DEFAULT_ENDPOINT
  };

  currentSettings.profiles[name] = profileData;
  currentSettings.activeProfileName = name;

  renderProfileDropdown();
  displayActiveProfile();
  persistSettings();
  showStatus(`Profile "${name}" saved and set as active.`, "success");
});

// Delete Profile
dom.btnDeleteProfile.addEventListener("click", () => {
  const current = currentSettings.activeProfileName;
  const profileKeys = Object.keys(currentSettings.profiles);

  if (profileKeys.length <= 1) {
    // Reset the only profile instead of deleting
    currentSettings.profiles[DEFAULT_PROFILE_NAME] = {
      name: DEFAULT_PROFILE_NAME,
      apiKey: "",
      endpoint: DEFAULT_ENDPOINT,
      model: DEFAULT_MODEL
    };
    currentSettings.activeProfileName = DEFAULT_PROFILE_NAME;
    renderProfileDropdown();
    displayActiveProfile();
    persistSettings();
    showStatus(`Reset "${current}" to clean default.`, "info");
    return;
  }

  delete currentSettings.profiles[current];
  const remaining = Object.keys(currentSettings.profiles);
  currentSettings.activeProfileName = remaining[0];

  renderProfileDropdown();
  displayActiveProfile();
  persistSettings();
  showStatus(`Deleted "${current}". Active profile is now "${remaining[0]}".`, "info");
});

// Toggle API Key visibility
dom.btnToggleKeyVisibility.addEventListener("click", () => {
  if (dom.apiKey.type === "password") {
    dom.apiKey.type = "text";
    dom.btnToggleKeyVisibility.textContent = "🔒";
  } else {
    dom.apiKey.type = "password";
    dom.btnToggleKeyVisibility.textContent = "👁️";
  }
});

// Test Key Connection
dom.btnTestKey.addEventListener("click", async () => {
  const apiKey = dom.apiKey.value.trim();
  if (!apiKey) {
    showStatus("Please enter an API key to test.", "error");
    return;
  }

  dom.btnTestKey.disabled = true;
  dom.btnTestKey.textContent = "Testing...";
  showStatus("Verifying API key connection with NVIDIA NIM...", "info");

  try {
    const res = await chrome.runtime.sendMessage({
      type: "VALIDATE_KEY",
      apiKey: apiKey,
      endpoint: dom.endpoint.value.trim() || DEFAULT_ENDPOINT,
      model: dom.model.value.trim() || DEFAULT_MODEL
    });

    if (res && res.ok) {
      showStatus("Connection successful! API key is valid.", "success");
    } else {
      showStatus(res ? res.error : "Key validation failed.", "error");
    }
  } catch (err) {
    showStatus("Connection error: " + err.message, "error");
  } finally {
    dom.btnTestKey.disabled = false;
    dom.btnTestKey.textContent = "Test Key Connection";
  }
});

// Quick Model Chips click listener
dom.chips.forEach(chip => {
  chip.addEventListener("click", () => {
    const selectedModel = chip.getAttribute("data-model");
    dom.model.value = selectedModel;
    updateActiveChip(selectedModel);
    persistSettings();
    showStatus(`Model changed to ${chip.textContent}.`, "info");
  });
});

// Attach auto-save listeners to toggle switches with instant persistence
[dom.enabled, dom.autoGenerate, dom.autoSend].forEach(toggle => {
  if (toggle) {
    toggle.addEventListener("change", () => {
      persistSettings(true);
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
        dom.incomingDisplay.value = incoming;
        // Update badge
        dom.incomingBadge.textContent = "New!";
        dom.incomingBadge.classList.add("active");
        setTimeout(() => {
          if (dom.incomingBadge) dom.incomingBadge.classList.remove("active");
        }, 3000);

        // If the incoming message changed and differs from what current replies were generated for,
        // inform user with clear context badge
        if (isNewMessage && lastGeneratedMessage && lastGeneratedMessage !== incoming) {
          showStatus("New message received. Ready to generate replies for latest text.", "info");
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