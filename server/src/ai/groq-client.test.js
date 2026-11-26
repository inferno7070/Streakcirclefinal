import test from 'node:test';
import assert from 'node:assert/strict';
import { requestGroqCompletion } from './groq-client.js';

const toolSchema = [{ type: 'function', function: { name: 'mark_complete', parameters: { type: 'object', properties: { habit: { type: 'string' } }, required: ['habit'] } } }];

test('Groq client sends the documented chat-completions request with tool schemas', async () => {
  let captured;
  const fakeFetch = async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => ({ choices: [{ message: { role: 'assistant', content: 'Hello' } }] }) };
  };
  const message = await requestGroqCompletion([{ role: 'user', content: 'Hi' }], { apiKey: 'test-key', model: 'openai/gpt-oss-20b', tools: toolSchema, fetchImpl: fakeFetch });
  assert.equal(message.content, 'Hello');
  assert.equal(captured.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(captured.options.headers.Authorization, 'Bearer test-key');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.model, 'openai/gpt-oss-20b');
  assert.deepEqual(body.tools, toolSchema);
  assert.equal(body.tool_choice, 'auto');
  assert.equal(body.parallel_tool_calls, false);
  assert.equal(body.max_completion_tokens, 1000);
});

test('Groq client preserves provider status for rate-limit handling', async () => {
  const fakeFetch = async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }) });
  await assert.rejects(
    requestGroqCompletion([], { apiKey: 'test-key', model: 'openai/gpt-oss-20b', tools: toolSchema, fetchImpl: fakeFetch }),
    (error) => error.status === 429 && /rate limited/.test(error.message),
  );
});

test('Groq client rejects missing credentials before making a request', async () => {
  await assert.rejects(requestGroqCompletion([], { model: 'openai/gpt-oss-20b', tools: toolSchema }), /GROQ_API_KEY/);
});
