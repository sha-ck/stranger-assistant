const { test } = require('node:test');
const assert = require('node:assert');

// Simulate getActionableErrorMessage logic to test expected error messages
function getActionableErrorMessage(rawError, providerId, providerName) {
  const err = (rawError || "").trim();
  const lower = err.toLowerCase();
  const isLocal = providerId === "ollama" || providerId === "custom";

  if (!isLocal && (lower.includes("401") || lower.includes("unauthorized") || (lower.includes("invalid") && lower.includes("key")))) {
    return `Invalid or expired API key. Verify that your ${providerName} key is copied correctly without extra spaces or quotes.`;
  }
  if (lower.includes("403") || lower.includes("forbidden") || lower.includes("access denied")) {
    return isLocal
      ? `Local server rejected request (HTTP 403 Forbidden). Local server (Ollama) blocked the request due to CORS. Ensure Ollama allows extension origins or OLLAMA_ORIGINS="*" is set.`
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

test('Error Handling - 403 for local/Ollama does not claim model access denied', () => {
  const localError = getActionableErrorMessage(
    'Custom / Local (Ollama, LM Studio) 403 Forbidden: Access denied for requested model',
    'custom',
    'Custom / Local (Ollama, LM Studio)'
  );
  assert.ok(
    !localError.includes('Your Custom / Local (Ollama, LM Studio) account does not have permission'),
    'Should not blame cloud account permissions for local provider'
  );
  assert.ok(
    localError.includes('CORS') || localError.includes('OLLAMA_ORIGINS'),
    'Should identify CORS / OLLAMA_ORIGINS origin blocking'
  );
});

test('Error Handling - 403 for cloud providers explains account permission', () => {
  const cloudError = getActionableErrorMessage(
    '403 Forbidden: Access denied for requested model',
    'nvidia',
    'NVIDIA NIM'
  );
  assert.ok(
    cloudError.includes('account does not have permission'),
    'Cloud 403 should mention account permissions'
  );
});

test('Error Handling - 404 for local provider guides user to pull model', () => {
  const local404 = getActionableErrorMessage(
    '404 Not Found',
    'ollama',
    'Ollama (Local)'
  );
  assert.ok(
    local404.includes('ollama pull'),
    'Local 404 should suggest ollama pull'
  );
});

test('Error Handling - Connection refused informs user to start local server', () => {
  const localConn = getActionableErrorMessage(
    'Failed to fetch',
    'ollama',
    'Ollama (Local)'
  );
  assert.ok(
    localConn.includes('Make sure Ollama (Local) is running locally'),
    'Connection failure should advise running local server'
  );
});
