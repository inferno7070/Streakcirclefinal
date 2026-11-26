// =============================================================
// groq-client.js: tiny wrapper around the Groq chat-completions API (uses fetch).
// =============================================================
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

export async function requestGroqCompletion(messages, { apiKey, model, tools, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('GROQ_API_KEY is not configured');
  if (!model || typeof model !== 'string') throw new Error('GROQ_MODEL is not configured');
  const response = await fetchImpl(GROQ_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto', parallel_tool_calls: false, max_completion_tokens: 1000 }),
    signal: AbortSignal.timeout(45000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body?.error?.message || `Groq request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const message = body?.choices?.[0]?.message;
  if (!message) throw new Error('Groq returned an empty response');
  return message;
}
