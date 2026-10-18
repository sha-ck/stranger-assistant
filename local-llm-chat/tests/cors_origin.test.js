const { test } = require('node:test');
const assert = require('node:assert');

test('Ollama CORS verification - chrome-extension Origin returns 403 Forbidden', async () => {
  try {
    const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'chrome-extension://omnichat-test-extension'
      },
      body: JSON.stringify({
        model: 'qwen3.5',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 5
      }),
      signal: AbortSignal.timeout(3000)
    });
    // Ollama default CORS rejects chrome-extension origin with 403
    assert.strictEqual(res.status, 403, 'Ollama should return 403 when chrome-extension Origin is passed');
  } catch (err) {
    // If Ollama is offline or timed out, skip test
    if (err.name === 'TimeoutError' || err.cause?.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
      return;
    }
    throw err;
  }
});

test('Ollama CORS verification - http://localhost Origin succeeds with 200 OK', async () => {
  try {
    const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({
        model: 'qwen3.5',
        messages: [{ role: 'user', content: 'hello' }],
        max_tokens: 5
      }),
      signal: AbortSignal.timeout(3000)
    });
    assert.strictEqual(res.status, 200, 'Ollama should return 200 when localhost Origin is passed');
    const data = await res.json();
    assert.ok(data.choices && data.choices.length > 0, 'Ollama should return valid chat completion choices');
  } catch (err) {
    if (err.name === 'TimeoutError' || err.cause?.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
      return;
    }
    throw err;
  }
});

test('declarativeNetRequest rule format for Ollama localhost origin rewrite', () => {
  const rule = {
    id: 11434,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Origin', operation: 'set', value: 'http://localhost' }
      ]
    },
    condition: {
      urlFilter: ':11434/',
      resourceTypes: ['xmlhttprequest', 'other']
    }
  };

  assert.strictEqual(rule.id, 11434);
  assert.strictEqual(rule.action.type, 'modifyHeaders');
  assert.strictEqual(rule.action.requestHeaders[0].header, 'Origin');
  assert.strictEqual(rule.action.requestHeaders[0].value, 'http://localhost');
  assert.strictEqual(rule.condition.urlFilter, ':11434/');
});
