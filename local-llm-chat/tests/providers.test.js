const { test } = require('node:test');
const assert = require('node:assert');
const {
  PROVIDERS,
  DEFAULT_PROVIDER_ID,
  getProviderConfig,
  sanitizeEndpointForProvider,
  sanitizeModelForProvider
} = require('../providers.js');

test('Provider Config - Ollama & Custom have keyOptional enabled', () => {
  const ollama = getProviderConfig('ollama');
  assert.strictEqual(ollama.id, 'ollama');
  assert.strictEqual(ollama.keyOptional, true);
  assert.strictEqual(ollama.defaultEndpoint, 'http://127.0.0.1:11434/v1/chat/completions');

  const custom = getProviderConfig('custom');
  assert.strictEqual(custom.id, 'custom');
  assert.strictEqual(custom.keyOptional, true);
  assert.strictEqual(custom.defaultEndpoint, 'http://127.0.0.1:11434/v1/chat/completions');
});

test('Endpoint Sanitization - Cleans cloud contamination for Ollama', () => {
  const contaminated = 'https://integrate.api.nvidia.com/v1/chat/completions';
  const cleaned = sanitizeEndpointForProvider(contaminated, 'ollama');
  assert.strictEqual(cleaned, 'http://127.0.0.1:11434/v1/chat/completions');

  const customContaminated = 'https://api.openai.com/v1/chat/completions';
  const customCleaned = sanitizeEndpointForProvider(customContaminated, 'custom');
  assert.strictEqual(customCleaned, 'http://127.0.0.1:11434/v1/chat/completions');
});

test('Endpoint Sanitization - Preserves valid local / custom endpoints', () => {
  const customLocal = 'http://localhost:1234/v1/chat/completions';
  const result = sanitizeEndpointForProvider(customLocal, 'custom');
  assert.strictEqual(result, customLocal);

  const customLan = 'http://192.168.1.100:11434/v1/chat/completions';
  const resultLan = sanitizeEndpointForProvider(customLan, 'custom');
  assert.strictEqual(resultLan, customLan);
});

test('Model Sanitization - Cleans cloud model contamination for Ollama', () => {
  const cloudModel = 'nvidia/nemotron-3-super-120b-a12b';
  const cleaned = sanitizeModelForProvider(cloudModel, 'ollama');
  assert.strictEqual(cleaned, 'qwen3.5');

  const validLocal = 'qwen3.5:latest';
  const kept = sanitizeModelForProvider(validLocal, 'ollama');
  assert.strictEqual(kept, validLocal);
});
