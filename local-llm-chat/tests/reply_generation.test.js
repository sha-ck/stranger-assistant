const { test } = require('node:test');
const assert = require('node:assert');

// Simulate sanitizeReply from background.js with post-prefix quote stripping
function sanitizeReply(text, maxChars = 140) {
  if (!text || typeof text !== "string") return "";
  let clean = text.trim();
  
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  clean = clean.replace(/^(Reply|Suggested reply|Me|You):\s*/i, "");
  clean = clean.replace(/^As an AI[^,.]*[,.]\s*/i, "");
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, "");
  
  if ((clean.startsWith('"') && clean.endsWith('"')) || (clean.startsWith("'") && clean.endsWith("'"))) {
    clean = clean.slice(1, -1).trim();
  }
  clean = clean.replace(/\s+/g, " ").trim();

  if (maxChars && clean.length > maxChars) {
    clean = clean.slice(0, maxChars).trim();
  }
  return clean;
}

test('Reply Sanitization - Strips reasoning tokens and prefixes', () => {
  const rawWithThinking = '<think>I should be sarcastic here</think>Hey there stranger, what is up?';
  const clean = sanitizeReply(rawWithThinking, 140);
  assert.strictEqual(clean, 'Hey there stranger, what is up?');

  const prefixed = 'Reply: "Yeah, totally makes sense!"';
  const cleanPrefixed = sanitizeReply(prefixed, 140);
  assert.strictEqual(cleanPrefixed, 'Yeah, totally makes sense!');
});

test('Ollama Chat Completion Generation - Generates reply successfully when Origin is localhost', async () => {
  try {
    const res = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost'
      },
      body: JSON.stringify({
        model: 'qwen3.5',
        messages: [
          { role: 'system', content: 'You are a friendly chat assistant. Keep reply under 10 words.' },
          { role: 'user', content: 'hi there' }
        ],
        temperature: 0.7,
        max_tokens: 250,
        stream: false
      }),
      signal: AbortSignal.timeout(3000)
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.choices && data.choices[0]?.message);
    const content = data.choices[0].message.content || data.choices[0].message.reasoning;
    assert.ok(content, 'Expected non-empty completion content or reasoning');
    const reply = sanitizeReply(content, 140);
    assert.ok(reply.length > 0, 'Clean reply should not be empty');
  } catch (err) {
    if (err.name === 'TimeoutError' || err.cause?.code === 'ECONNREFUSED' || err.message.includes('fetch failed')) {
      return;
    }
    throw err;
  }
});

