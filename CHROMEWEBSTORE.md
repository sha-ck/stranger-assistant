# Chrome Web Store Listing & Store Metadata

> **Extension Name**: OmniChat AI - Universal Copilot  
> **Version**: 2.1.0  
> **Manifest Version**: MV3  
> **Target Store**: Chrome Web Store  
> **Category**: Productivity / Communication  
> **Last Updated**: 2026-10-18  

---

## 1. Store Listing Details

### Summary (132 characters max)
Universal AI chat copilot and autoresponder powered by NVIDIA NIM, OpenAI, Google AI Studio, Anthropic, Groq & local LLMs.

### Detailed Description
OmniChat AI is a high-speed, multi-provider conversational copilot designed to help you communicate faster and more naturally across web-based chat platforms. Whether you are chatting with strangers online, networking, or brainstorming, OmniChat provides instantaneous suggestions, context-aware auto-replies, and seamless provider switching.

#### ✨ Key Features
- **Multi-Provider AI Ecosystem**: Connect directly to your favorite provider with single-click switching:
  - NVIDIA NIM (Nemotron 3 Super, Llama 3.3 70B, DeepSeek R1)
  - Google AI Studio (Gemini 2.5 Flash, Gemini 2.5 Pro)
  - OpenAI (GPT-4o, GPT-4o Mini, o3-mini)
  - Anthropic (Claude 3.7 Sonnet, Claude 3.5 Haiku)
  - Groq (Llama 3.3 70B Versatile, Mixtral 8x7B)
  - Ollama & Custom Endpoints (Local private inference with automatic origin/CORS negotiation)
- **Named Configuration Profiles**: Save distinct model configurations, custom parameters, and specialized API keys for different conversation styles or workflows.
- **Side Panel Interface**: Seamlessly integrated into Chrome's native side panel with dark mode glassmorphism UI.
- **Smart DOM Chat Adapter**: Automatically observes real-time chat feeds, extracts inbound messages, respects humanized typing intervals, and injects drafts without breaking webpage context.
- **Privacy-First Design**: API keys and profile settings are stored exclusively in your local browser storage (`chrome.storage.local`). Direct requests travel only between your browser and your chosen AI endpoint or local server.

---

## 2. Permissions Justification

| Permission | Justification |
| :--- | :--- |
| `sidePanel` | Provides a persistent, dedicated side panel interface to configure models, manage profiles, and monitor auto-reply actions alongside chat tabs. |
| `storage` | Safely stores user profile configurations, active provider selection, and API credentials locally on the user's device (`chrome.storage.local`). |
| `scripting` | Coordinates programmatic execution and injection of the chat adapter helper on supported chat web pages. |
| `tabs` | Identifies active browser tab IDs and URLs to ensure AI responses are delivered to the currently open chat session. |
| `declarativeNetRequest` | Automatically modifies the `Origin` header for local Ollama HTTP requests (`:11434/`) to resolve local web-security restrictions without exposing credentials. |

### Host Permissions Justification
- `<all_urls>`: Enables the chat adapter to detect and draft conversational assistance across any web chat interface the user opens.
- `https://integrate.api.nvidia.com/*`: Allows direct API calls to NVIDIA NIM inference services when selected by the user.
- `http://localhost:11434/*` & `http://127.0.0.1:11434/*`: Enables direct, private communication with locally running Ollama instances without proxy servers.

---

## 3. Privacy & Data Use Disclosure

- **Single Purpose**: Real-time conversational AI drafting and chat assistance.
- **Data Collection**: No personal data is collected, sold, or transferred to third-party tracking services.
- **User Content Handling**: Chat text processed by the extension is forwarded strictly to the user-configured AI endpoint (NVIDIA NIM, Google AI Studio, OpenAI, Anthropic, Groq, or local Ollama) for text generation purposes only.
- **Credential Security**: API keys are saved strictly in Chrome local storage and are never transmitted to external analytics or developer servers.

---

## 4. Release & Build Notes

- **Version 2.1.0**:
  - Added multi-provider architecture: NVIDIA NIM, OpenAI, Anthropic, Google AI Studio, Groq, and Ollama.
  - Added named profile management with live create, switch, and delete dialogs.
  - Added `declarativeNetRequest` origin rewrite for zero-friction local Ollama connectivity.
  - Added automated test suite for provider validation, error sanitization, and CORS handling.
