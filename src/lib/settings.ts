// AOLABS settings — everything the user configures lives in the browser's
// localStorage. There is no server, no database, and no env file required:
// open Settings in the UI, paste your own LLM endpoint + model and your own
// RPC endpoint, and AO runs entirely from your machine.

export type LLMProvider = 'openai' | 'anthropic';

export interface AOSettings {
  /** 'openai' = any OpenAI-compatible chat completions API (OpenAI, Groq,
   *  OpenRouter, Ollama, LM Studio, ...). 'anthropic' = Anthropic Messages API. */
  provider: LLMProvider;
  /** Base URL of your LLM provider, e.g. https://api.openai.com/v1
   *  or https://api.anthropic.com. Empty until you set it. */
  baseUrl: string;
  /** API key for your LLM provider. Stored only in your browser. */
  apiKey: string;
  /** Model name, free-form — any model your endpoint serves. */
  model: string;
  /** Your EVM JSON-RPC endpoint for the chain you want AO to read.
   *  Empty until you set it. Any archive-capable RPC works; a keyed RPC
   *  (e.g. Alchemy) is faster and more reliable than a public one. */
  rpcUrl: string;
  chainId: number;
  chainName: string;
  /** Blockscout-compatible explorer API used as a fallback read path. */
  explorerApiUrl: string;
}

const SETTINGS_KEY = 'ao_settings_v1';

function envDefault(key: string): string {
  try {
    const v = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[
      `VITE_${key}`
    ];
    return typeof v === 'string' ? v : '';
  } catch {
    return '';
  }
}

export function defaultSettings(): AOSettings {
  return {
    provider: envDefault('LLM_PROVIDER') === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: envDefault('LLM_BASE_URL'),
    apiKey: envDefault('LLM_API_KEY'),
    model: envDefault('LLM_MODEL'),
    rpcUrl: envDefault('RPC_URL'),
    chainId: 4663,
    chainName: 'Robinhood Chain',
    explorerApiUrl: 'https://robinhoodchain.blockscout.com/api/v2',
  };
}

export function loadSettings(): AOSettings {
  const defaults = defaultSettings();
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const stored = JSON.parse(raw) as Partial<AOSettings>;
    return {
      ...defaults,
      ...stored,
      provider: stored.provider === 'anthropic' ? 'anthropic' : 'openai',
      chainId: Number.isFinite(Number(stored.chainId)) ? Number(stored.chainId) : defaults.chainId,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: AOSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // storage full or unavailable — settings stay in memory for this session
  }
}

export function isLLMConfigured(s: AOSettings): boolean {
  return Boolean(s.baseUrl.trim() && s.apiKey.trim() && s.model.trim());
}

export function isRPCConfigured(s: AOSettings): boolean {
  return Boolean(s.rpcUrl.trim());
}
