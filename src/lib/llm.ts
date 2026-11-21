// Generic LLM client — AO talks to whatever endpoint YOU configure in
// Settings. Two shapes are supported:
//
//  - 'openai': any OpenAI-compatible chat completions API
//    (OpenAI, Groq, OpenRouter, Together, Ollama, LM Studio, ...)
//    POST {baseUrl}/chat/completions with a Bearer key.
//  - 'anthropic': Anthropic Messages API
//    POST {baseUrl}/v1/messages with an x-api-key header.
//
// No vendor is hardcoded anywhere. The base URL and model name are free-form:
// type any endpoint your provider gives you. The client only ever extracts
// the reply text — no reasoning blocks, fingerprints, or provider metadata
// are read or stored.

import type { AOSettings } from './settings';
import { scrubModelOutput } from './security';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

function cleanBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

async function callOpenAICompatible(
  settings: AOSettings,
  messages: LLMMessage[]
): Promise<string> {
  const base = cleanBaseUrl(settings.baseUrl);
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      temperature: 0.35,
      max_tokens: 2048,
      messages,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('AO_LLM_AUTH_FAILED');
    }
    if (res.status === 429) throw new Error('AO_LLM_BUSY');
    throw new Error('AO_LLM_ERROR');
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return json?.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(
  settings: AOSettings,
  messages: LLMMessage[]
): Promise<string> {
  const base = cleanBaseUrl(settings.baseUrl);
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const rest = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));
  const res = await fetch(`${base}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': settings.apiKey.trim(),
      'anthropic-version': '2023-06-01',
      // Required by Anthropic for direct browser calls.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: settings.model.trim(),
      max_tokens: 2048,
      system: system || undefined,
      messages: rest,
    }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error('AO_LLM_AUTH_FAILED');
    }
    if (res.status === 429) throw new Error('AO_LLM_BUSY');
    throw new Error('AO_LLM_ERROR');
  }
  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };
  const textBlock = (json?.content || []).find((c) => c.type === 'text' && typeof c.text === 'string');
  return textBlock?.text ?? '';
}

/** Send a chat turn to the user's configured model and return clean text. */
export async function generateAOReply(
  settings: AOSettings,
  messages: LLMMessage[]
): Promise<{ reply: string; redacted: boolean }> {
  const raw =
    settings.provider === 'anthropic'
      ? await callAnthropic(settings, messages)
      : await callOpenAICompatible(settings, messages);
  const { text, redacted } = scrubModelOutput(raw);
  return { reply: text, redacted };
}

/** Small connectivity check used by the Settings panel. */
export async function testLLMConnection(settings: AOSettings): Promise<string> {
  const { reply } = await generateAOReply(settings, [
    { role: 'user', content: 'Reply with the single word OK and nothing else.' },
  ]);
  return reply;
}
