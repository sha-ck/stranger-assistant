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

// Track generated replies for the 4 cards
let generatedReplies = ["", "", "", ""];
let selectedCardIndex = -1;

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
  replyTest: document.getElementById("replyTest"),
  replyCount: document.getElementById("replyCount"),
  replyCardsContainer: document.getElementById("replyCardsContainer"),
  selectedPreview: document.getElementById("selectedPreview"),
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
  } catch (err) {
    showStatus("Could not load settings: " + err.message, "error");
  }
}

// ── Reply Cards Logic ──

function resetReplyCards() {
  generatedReplies = ["", "", "", ""];
  selectedCardIndex = -1;
  for (let i = 0; i < 4; i++) {
    const textEl = document.getElementById(`replyText${i}`);
    textEl.textContent = "—";
    textEl.classList.add("empty");
    const card = textEl.closest(".reply-card");
    card.classList.remove("selected", "loading");
  }
  dom.replyCount.textContent = "0 / 4";
  dom.selectedPreview.style.display = "none";
  dom.replyTest.value = "";
}

function setCardLoading(index, loading) {
  const card = document.querySelectorAll(".reply-card")[index];
  if (loading) {
    card.classList.add("loading");
  } else {
    card.classList.remove("loading");
  }
}

function setCardText(index, text) {
  const textEl = document.getElementById(`replyText${index}`);
  generatedReplies[index] = text;
  textEl.textContent = text || "—";
  textEl.classList.toggle("empty", !text);

  // Update counter
  const filled = generatedReplies.filter(r => r).length;
  dom.replyCount.textContent = `${filled} / 4`;
}

function selectCard(index) {
  if (!generatedReplies[index]) return;

  // Deselect previous
  document.querySelectorAll(".reply-card").forEach(c => c.classList.remove("selected"));

  // Select new
  selectedCardIndex = index;
  const card = document.querySelectorAll(".reply-card")[index];
  card.classList.add("selected");

  // Show preview
  dom.replyTest.value = generatedReplies[index];
  dom.selectedPreview.style.display = "block";
}

// Card click handlers
document.querySelectorAll(".reply-card").forEach(card => {
  card.addEventListener("click", () => {
    const idx = parseInt(card.getAttribute("data-index"), 10);
    selectCard(idx);
  });
});

// Generate 4 replies
async function generateMultipleReplies(extraKeywords) {
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

  resetReplyCards();
  dom.btnGenerate.disabled = true;
  dom.btnGenerate.textContent = "⏳ Generating…";
  showStatus("Generating 4 reply options via NVIDIA NIM…", "info");

  // Set all cards to loading
  for (let i = 0; i < 4; i++) setCardLoading(i, true);

  // Fire 4 requests in parallel
  const tones = [
    dom.tone.value,
    "Funny and playful",
    "Short and direct",
    "Warm and thoughtful"
  ];

  // Deduplicate: if user's selected tone already matches one of the fallback tones,
  // swap in an alternative
  const allTones = [
    "Friendly and casual", "Funny and playful", "Warm and thoughtful",
    "Short and direct", "Flirty but respectful", "Chill and relaxed"
  ];
  const usedTones = new Set();
  const finalTones = [];
  for (const t of tones) {
    if (usedTones.has(t)) {
      // Find an unused tone
      const alt = allTones.find(a => !usedTones.has(a));
      if (alt) {
        finalTones.push(alt);
        usedTones.add(alt);
      } else {
        finalTones.push(t);
      }
    } else {
      finalTones.push(t);
      usedTones.add(t);
    }
  }

  const promises = finalTones.map((tone, i) => {
    let incomingText = incoming;
    if (extraKeywords) {
      incomingText += `\n\n[User wants reply about: ${extraKeywords}]`;
    }
    return chrome.runtime.sendMessage({
      type: "NIM_GENERATE",
      incoming: incomingText,
      partner: "Stranger",
      tone: tone,
      history: []
    }).then(response => {
      setCardLoading(i, false);
      if (response && response.ok) {
        setCardText(i, response.reply);
      } else {
        setCardText(i, "");
        console.warn(`Reply ${i + 1} failed:`, response?.error);
      }
    }).catch(err => {
      setCardLoading(i, false);
      setCardText(i, "");
      console.error(`Reply ${i + 1} error:`, err);
    });
  });

  await Promise.allSettled(promises);

  dom.btnGenerate.disabled = false;
  dom.btnGenerate.textContent = "⚡ Generate 4 Replies";

  const filled = generatedReplies.filter(r => r).length;
  if (filled > 0) {
    showStatus(`${filled} of 4 replies generated. Click one to select.`, "success");
    // Auto-select the first successful one
    const firstIdx = generatedReplies.findIndex(r => r);
    if (firstIdx >= 0) selectCard(firstIdx);
  } else {
    showStatus("All reply generations failed. Check your API key.", "error");
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

// Generate 4 replies button
dom.btnGenerate.addEventListener("click", () => {
  generateMultipleReplies();
});

// Custom keywords re-gen button
dom.btnRegenCustom.addEventListener("click", () => {
  const keywords = dom.customKeywords.value.trim();
  if (!keywords) {
    showStatus("Enter some keywords first (e.g. movies, funny, weekend).", "error");
    return;
  }
  generateMultipleReplies(keywords);
});

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
        dom.incomingDisplay.value = incoming;
        // Update badge
        dom.incomingBadge.textContent = "New!";
        dom.incomingBadge.classList.add("active");
        setTimeout(() => dom.incomingBadge.classList.remove("active"), 3000);
      }
      if (state.generated && dom.replyTest) {
        // If a single auto-generated reply came in, put it in card 0
        if (!generatedReplies[0]) {
          setCardText(0, state.generated);
          selectCard(0);
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