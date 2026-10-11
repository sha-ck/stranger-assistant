// content.js - TalkWithStranger DOM Automation & Safety Engine

(() => {
// ------- Configuration & Settings -------
  let settings = {
    enabled: false,
    apiKey: "",
    endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
    model: "nvidia/nemotron-3-super-120b-a12b",
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

  // ------- Platform Adapter Interface -------
  /**
   * All adapters must implement the following methods:
   *   matches(url, doc) -> boolean
   *   getLogContainer(doc) -> HTMLElement|null
   *   getInputElement(doc) -> HTMLElement|null
   *   getSendButton(doc) -> HTMLElement|null
   *   isPartnerTyping(doc) -> boolean
   *   isPartnerDisconnected(doc) -> boolean
   *   extractMessages(logEl, maxTurns) -> array of {role, text, id}
   *   injectText(inputEl, text) -> boolean
   *   clickSend(sendBtn) -> void
   */

  // ----- TalkWithStranger specific adapter -----
  const twsAdapter = {
    id: "tws",
    name: "TalkWithStranger",
    matches: (url, doc) => url.host.endsWith("talkwithstranger.com"),
    getLogContainer: (doc) => doc.getElementById("logwrapper"),
    getInputElement: (doc) => doc.querySelector(".emojionearea-editor[contenteditable]") || doc.getElementById("chatMessageInput"),
    getSendButton: (doc) => doc.getElementById("chatSendButton"),
    isPartnerTyping: (doc) => {
      const typing = doc.getElementById("typing");
      const muted = doc.getElementById("muted-partner");
      return isVisible(typing) || isVisible(muted);
    },
    isPartnerDisconnected: (doc) => {
      const refreshBtn = doc.getElementById("refresh");
      if (isVisible(refreshBtn)) return true;
      const msgs = doc.querySelectorAll(".status-msg, #log-msg");
      for (const m of msgs) {
        const txt = (m.textContent || "").toLowerCase();
        if (txt.includes("disconnected") || txt.includes("left the chat") || txt.includes("stranger has left")) return true;
      }
      return false;
    },
    extractMessages: (logEl, maxTurns) => {
      const history = [];
      const msgs = logEl.querySelectorAll(".strangermsg, .youmsg");
      const start = Math.max(0, msgs.length - maxTurns);
      for (let i = start; i < msgs.length; i++) {
        const el = msgs[i];
        const role = el.classList.contains("strangermsg") ? "stranger" : "user";
        const txtEl = el.querySelector(".message");
        if (txtEl && txtEl.textContent) {
          history.push({ role, text: txtEl.textContent.trim(), id: `${i}` });
        }
      }
      return history;
    },
    injectText: (inputEl, text) => {
      if (!inputEl) return false;
      inputEl.focus();
      if (inputEl.isContentEditable) {
        inputEl.textContent = text;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        inputEl.value = text;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
        inputEl.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return true;
    },
    clickSend: (btn) => { if (btn) btn.click(); }
  };

  // ----- Generic heuristic adapter (basic placeholder) -----
  const genericAdapter = {
    id: "generic",
    name: "GenericChat",
    matches: (url, doc) => true, // fallback for any site
    getLogContainer: (doc) => {
      const candidates = Array.from(doc.querySelectorAll("div, ul, ol"));
      return candidates.find(c => {
        const style = window.getComputedStyle(c);
        const overflow = style.overflowY || style.overflow;
        const hasMessages = c.querySelectorAll(".message, .msg, .bubble, [class*='chat'], [class*='message']").length > 0;
        return (overflow === "auto" || overflow === "scroll") && hasMessages;
      }) || null;
    },
    getInputElement: (doc) => doc.querySelector("div[contenteditable='true']") || doc.querySelector("textarea:not([hidden])") || doc.querySelector("input[type='text']"),
    getSendButton: (doc) => {
      const btns = Array.from(doc.querySelectorAll("button, input[type='submit']"));
      return btns.find(b => {
        const lbl = b.getAttribute('aria-label') || b.textContent || "";
        return /send|submit|enter/i.test(lbl);
      }) || null;
    },
    isPartnerTyping: (doc) => false,
    isPartnerDisconnected: (doc) => false,
    extractMessages: (logEl, maxTurns) => {
      const msgs = Array.from(logEl.querySelectorAll(".message, .msg, .bubble, [class*='chat'], [class*='message']"));
      const start = Math.max(0, msgs.length - maxTurns);
      const history = [];
      for (let i = start; i < msgs.length; i++) {
        const el = msgs[i];
        const text = el.textContent?.trim();
        if (text) {
          const role = /incoming|remote|received|left/i.test(el.className) ? "stranger" : "user";
          history.push({ role, text, id: `${i}` });
        }
      }
      return history;
    },
    injectText: (inputEl, text) => {
      if (!inputEl) return false;
      inputEl.focus();
      if (inputEl.isContentEditable) {
        inputEl.textContent = text;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        inputEl.value = text;
        inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      return true;
    },
    clickSend: (btn) => { if (btn) btn.click(); }
  };

  // Platform Registry
  const PlatformRegistry = {
    adapters: [twsAdapter, genericAdapter],
    getAdapter: function(url, doc) {
      for (const a of this.adapters) {
        try { if (a.matches(url, doc)) return a; } catch (e) { console.warn("Adapter match error", e); }
      }
      return null;
    }
  };

  // ------- Live Status Sync -------
  function sendStatus(update) {
    chrome.runtime.sendMessage({ type: "STATUS_UPDATE", ...update });
  }

  // Keep a reference to the currently selected adapter for the active tab
  let activeAdapter = null;

  let sessionMessageCount = 0;
  let lastSentTimestamp = 0;
  let lastIncomingHash = "";
  let lastSentHash = "";
  let isGenerating = false;
  let activeSendTimer = null;
  let debounceTimer = null;

  // Simple string hash for duplicate checks
  function simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  // Check if an element is visible in the DOM
  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
  }

  // Check if partner has disconnected
  function isPartnerDisconnected() {
    const refreshBtn = document.getElementById("refresh");
    if (isVisible(refreshBtn)) return true;

    const statusMsgs = document.querySelectorAll(".status-msg, #log-msg");
    for (const msg of statusMsgs) {
      const text = (msg.textContent || "").toLowerCase();
      if (text.includes("disconnected") || text.includes("left the chat") || text.includes("stranger has left")) {
        return true;
      }
    }
    return false;
  }

  // Check if partner is actively typing
  function isPartnerTyping() {
    const typingIndicator = document.getElementById("typing");
    const mutedPartner = document.getElementById("muted-partner");
    return isVisible(typingIndicator) || isVisible(mutedPartner);
  }

  // Fetch settings from background
  function refreshSettings() {
    chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (response) => {
      if (response && response.ok && response.settings) {
        settings = { ...settings, ...response.settings };
      }
    });
  }

  // Sync settings when modified from side panel
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
    }
  });

  // Inject text into the chat input field
  function fillChatInput(text) {
    const editor = document.querySelector(".emojionearea-editor[contenteditable]");
    if (editor) {
      editor.focus();
      editor.textContent = text;
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      editor.dispatchEvent(new Event("change", { bubbles: true }));
      editor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Enter" }));
      return true;
    }

    const fallbackInput = document.getElementById("chatMessageInput");
    if (fallbackInput) {
      fallbackInput.focus();
      fallbackInput.value = text;
      fallbackInput.dispatchEvent(new Event("input", { bubbles: true }));
      fallbackInput.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    return false;
  }

  // Trigger send button with rate limiting and safety verification
  function scheduleAutoSend(incomingText, replyText) {
    if (activeSendTimer) {
      clearTimeout(activeSendTimer);
      activeSendTimer = null;
    }

    if (!settings.autoSend || !settings.enabled) return;

    // Safety check: session limit
    if (sessionMessageCount >= settings.maxSessionMessages) {
      console.warn("[TWS NIM] Max session messages reached. Auto-send halted.");
      return;
    }

    // Duplicate check: hash(last incoming + reply)
    const duplicateHash = simpleHash(incomingText + "|" + replyText);
    if (duplicateHash === lastSentHash) {
      console.warn("[TWS NIM] Duplicate reply detected. Skipping send.");
      return;
    }

    // Randomized delay between minDelayMs and maxDelayMs
    const minDelay = Math.max(500, settings.minDelayMs || 2500);
    const maxDelay = Math.max(minDelay, settings.maxDelayMs || 6000);
    const randomDelay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    activeSendTimer = setTimeout(() => {
      activeSendTimer = null;

      // Abort if partner disconnected
      if (isPartnerDisconnected()) {
        console.warn("[TWS NIM] Partner disconnected. Aborting send.");
        return;
      }

      // If partner is typing, defer send for 2 seconds
      if (isPartnerTyping()) {
        console.log("[TWS NIM] Partner is typing. Holding auto-send...");
        scheduleAutoSend(incomingText, replyText);
        return;
      }

      // Enforce minimum 3-second rate limit between messages
      const now = Date.now();
      const elapsedSinceLastSend = now - lastSentTimestamp;
      if (elapsedSinceLastSend < 3000) {
        const remainingWait = 3000 - elapsedSinceLastSend;
        setTimeout(() => scheduleAutoSend(incomingText, replyText), remainingWait);
        return;
      }

      const sendBtn = document.getElementById("chatSendButton");
      if (sendBtn) {
        sendBtn.click();
        lastSentTimestamp = Date.now();
        lastSentHash = duplicateHash;
        sessionMessageCount++;
        console.log(`[TWS NIM] Reply sent (${sessionMessageCount}/${settings.maxSessionMessages})`);
      }
    }, randomDelay);
  }

  // ------- History extraction using active adapter -------
  function extractHistory(maxTurns) {
    if (!activeAdapter) return [];
    const logEl = activeAdapter.getLogContainer(document);
    if (!logEl) return [];
    return activeAdapter.extractMessages(logEl, maxTurns);
  }

// ------- DOM mutation handling using adapter & status sync -------
  function handleDomMutations() {
    if (!settings.enabled) return;
    // Ensure we have an adapter for the current page
    if (!activeAdapter) {
      const url = new URL(location.href);
      activeAdapter = PlatformRegistry.getAdapter(url, document);
      if (!activeAdapter) {
        console.warn("[AutoChat] No compatible platform adapter found.");
        return;
      }
      sendStatus({ platform: activeAdapter.name, state: "DETECTING" });
    }

    // Abort if partner disconnected according to adapter
    if (activeAdapter.isPartnerDisconnected(document)) return;

    const logEl = activeAdapter.getLogContainer(document);
    if (!logEl) return;

    // Extract messages via adapter
    const msgs = activeAdapter.extractMessages(logEl, settings.contextTurns || 6);
    if (!msgs || msgs.length === 0) return;

    const strangerMsgs = msgs.filter(m => m.role === "stranger");
    if (strangerMsgs.length === 0) return;
    const latest = strangerMsgs[strangerMsgs.length - 1];
    const incomingText = latest.text;
    if (!incomingText) return;

    const incomingHash = simpleHash(incomingText);
    if (incomingHash === lastIncomingHash) return;
    lastIncomingHash = incomingHash;

    sendStatus({ platform: activeAdapter.name, incoming: incomingText, state: "NEW_MESSAGE" });

    if (!settings.autoGenerate) return;
    if (isGenerating) return;
    isGenerating = true;

    const partnerName = ""; // fallback; can be enhanced per platform
    const history = extractHistory(settings.contextTurns || 6);

    chrome.runtime.sendMessage({
      type: "NIM_GENERATE",
      incoming: incomingText,
      history: history,
      partner: partnerName,
      tone: settings.tone
    }, (response) => {
      isGenerating = false;
      if (!response || !response.ok || !response.reply) {
        if (response && response.error) console.warn("[AutoChat]", response.error);
        sendStatus({ platform: activeAdapter.name, state: "ERROR", error: response?.error });
        return;
      }
      sendStatus({ platform: activeAdapter.name, generated: response.reply, state: "READY" });

      const inputEl = activeAdapter.getInputElement(document);
      const injected = activeAdapter.injectText(inputEl, response.reply);

      if (injected && settings.autoSend) {
        scheduleAutoSend(incomingText, response.reply);
        sendStatus({ platform: activeAdapter.name, state: "SENDING" });
      }
    });
  }

  // Setup DOM observer
  function initObserver() {
    const logWrapper = document.getElementById("logwrapper");
    if (!logWrapper) {
      // Retry in 1 second if page is still bootstrapping
      setTimeout(initObserver, 1000);
      return;
    }

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(handleDomMutations, 300);
    });

    observer.observe(logWrapper, {
      childList: true,
      subtree: true,
      characterData: true
    });

    // Reset session message count on new chat
    const newChatBtn = document.getElementById("chatStartStopButton");
    if (newChatBtn) {
      newChatBtn.addEventListener("click", () => {
        sessionMessageCount = 0;
        lastIncomingHash = "";
        lastSentHash = "";
        if (activeSendTimer) {
          clearTimeout(activeSendTimer);
          activeSendTimer = null;
        }
      });
    }

    // Listen for manual injection or triggers from side panel
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message && message.type === "INJECT_REPLY" && message.reply) {
        const inputEl = (activeAdapter && activeAdapter.getInputElement(document)) ||
          document.querySelector(".emojionearea-editor[contenteditable]") ||
          document.getElementById("chatMessageInput");

        if (inputEl) {
          if (activeAdapter && activeAdapter.injectText) {
            activeAdapter.injectText(inputEl, message.reply);
          } else {
            fillChatInput(message.reply);
          }

          // Trigger Enter key event for Emojionearea or input
          setTimeout(() => {
            const enterEvt = new KeyboardEvent("keydown", {
              bubbles: true,
              cancelable: true,
              key: "Enter",
              code: "Enter",
              keyCode: 13,
              which: 13
            });
            inputEl.dispatchEvent(enterEvt);

            const sendBtn = (activeAdapter && activeAdapter.getSendButton(document)) ||
              document.getElementById("chatSendButton");
            if (sendBtn) {
              sendBtn.click();
            }
          }, 150);

          if (sendResponse) sendResponse({ ok: true });
        } else {
          if (sendResponse) sendResponse({ ok: false, error: "Input element not found" });
        }
        return true;
      }
    });

    console.log("[TWS NIM] Content script initialized and watching #logwrapper");
  }

  // Start initialization
  refreshSettings();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initObserver);
  } else {
    initObserver();
  }
})();
