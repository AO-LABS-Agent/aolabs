import { useState } from 'react';
import { X, Check, AlertTriangle, Loader2 } from 'lucide-react';
import {
  loadSettings,
  saveSettings,
  type AOSettings,
  type LLMProvider,
} from '../../lib/settings';
import { testLLMConnection } from '../../lib/llm';

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
}

const PROVIDER_HELP: Record<LLMProvider, { baseUrl: string; model: string }> = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-4-5',
  },
};

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const [form, setForm] = useState<AOSettings>(() => loadSettings());
  const [saved, setSaved] = useState(false);
  const [llmStatus, setLlmStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [rpcStatus, setRpcStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [testingLlm, setTestingLlm] = useState(false);
  const [testingRpc, setTestingRpc] = useState(false);

  if (!open) return null;

  const set = <K extends keyof AOSettings>(key: K, value: AOSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleProviderChange = (provider: LLMProvider) => {
    const help = PROVIDER_HELP[provider];
    setForm((prev) => ({
      ...prev,
      provider,
      baseUrl: prev.baseUrl || help.baseUrl,
      model: prev.model || help.model,
    }));
    setSaved(false);
  };

  const handleSave = () => {
    saveSettings({ ...form, baseUrl: form.baseUrl.trim(), apiKey: form.apiKey.trim(), model: form.model.trim(), rpcUrl: form.rpcUrl.trim() });
    setSaved(true);
    setLlmStatus(null);
    setRpcStatus(null);
  };

  const handleTestLlm = async () => {
    setTestingLlm(true);
    setLlmStatus(null);
    try {
      saveSettings(form);
      const reply = await testLLMConnection(form);
      setLlmStatus({ ok: true, msg: `Connected — model replied: “${reply.slice(0, 60)}”` });
    } catch (err) {
      const code = err instanceof Error ? err.message : '';
      setLlmStatus({
        ok: false,
        msg:
          code === 'AO_LLM_AUTH_FAILED'
            ? 'Authentication failed — check your API key.'
            : code === 'AO_LLM_BUSY'
              ? 'Provider rate-limited — try again in a moment.'
              : 'Could not reach that base URL. Check the URL and your network (some providers block browser calls — use an OpenAI-compatible endpoint or a local proxy).',
      });
    } finally {
      setTestingLlm(false);
    }
  };

  const handleTestRpc = async () => {
    setTestingRpc(true);
    setRpcStatus(null);
    try {
      saveSettings(form);
      const url = form.rpcUrl.trim();
      if (!url) throw new Error('empty');
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json()) as { result?: string; error?: { message?: string } };
      if (json?.error || typeof json?.result !== 'string') {
        throw new Error(json?.error?.message || 'bad response');
      }
      setRpcStatus({ ok: true, msg: `Connected — latest block ${parseInt(json.result, 16).toLocaleString()}.` });
    } catch {
      setRpcStatus({ ok: false, msg: 'Could not reach that RPC endpoint. Check the URL — it must be a JSON-RPC HTTP endpoint for your chain.' });
    } finally {
      setTestingRpc(false);
    }
  };

  const inputCls =
    'w-full border border-white/15 bg-obsidian px-3 py-2 font-mono text-xs text-ink placeholder:text-muted focus:border-white/40 focus:outline-none';
  const labelCls = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.16em] text-ash';

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-obsidian/85 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg border border-white/15 bg-charcoal shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-sm font-medium tracking-[0.2em] text-ink">AO SETTINGS</h2>
            <p className="mt-1 text-xs text-muted">Your keys stay in your browser — nothing is uploaded anywhere.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="border border-white/15 p-1.5 text-ash hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          {/* LLM */}
          <section>
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">AI Model</h3>
            <div className="space-y-3">
              <div>
                <label className={labelCls} htmlFor="ao-provider">Provider</label>
                <select
                  id="ao-provider"
                  value={form.provider}
                  onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
                  className={`${inputCls} appearance-none`}
                >
                  <option value="openai">OpenAI-compatible (OpenAI, Groq, OpenRouter, Ollama, …)</option>
                  <option value="anthropic">Anthropic (Messages API)</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="ao-base-url">Base URL</label>
                <input
                  id="ao-base-url"
                  type="text"
                  value={form.baseUrl}
                  onChange={(e) => set('baseUrl', e.target.value)}
                  placeholder={PROVIDER_HELP[form.provider].baseUrl}
                  className={inputCls}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="ao-api-key">API key</label>
                <input
                  id="ao-api-key"
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => set('apiKey', e.target.value)}
                  placeholder="sk-…"
                  className={inputCls}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <label className={labelCls} htmlFor="ao-model">Model name</label>
                <input
                  id="ao-model"
                  type="text"
                  value={form.model}
                  onChange={(e) => set('model', e.target.value)}
                  placeholder={PROVIDER_HELP[form.provider].model}
                  className={inputCls}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  Any model your endpoint serves — type the name exactly as your provider lists it.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestLlm}
                  disabled={testingLlm || !form.baseUrl.trim() || !form.apiKey.trim() || !form.model.trim()}
                  className="inline-flex items-center gap-1.5 border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ash hover:border-white/40 hover:text-ink disabled:opacity-40"
                >
                  {testingLlm && <Loader2 className="h-3 w-3 animate-spin" />}
                  Test connection
                </button>
                {llmStatus && (
                  <span className={`flex items-center gap-1 text-[11px] ${llmStatus.ok ? 'text-ink' : 'text-red-400'}`}>
                    {llmStatus.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                    {llmStatus.msg}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Chain / RPC */}
          <section className="border-t border-white/10 pt-5">
            <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Chain &amp; RPC</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls} htmlFor="ao-chain-name">Chain name</label>
                  <input
                    id="ao-chain-name"
                    type="text"
                    value={form.chainName}
                    onChange={(e) => set('chainName', e.target.value)}
                    className={inputCls}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className={labelCls} htmlFor="ao-chain-id">Chain ID</label>
                  <input
                    id="ao-chain-id"
                    type="number"
                    value={form.chainId}
                    onChange={(e) => set('chainId', Number(e.target.value) || 4663)}
                    className={inputCls}
                    autoComplete="off"
                  />
                </div>
              </div>
              <div>
                <label className={labelCls} htmlFor="ao-rpc-url">RPC endpoint</label>
                <input
                  id="ao-rpc-url"
                  type="text"
                  value={form.rpcUrl}
                  onChange={(e) => set('rpcUrl', e.target.value)}
                  placeholder="https://rpc.mainnet.chain.robinhood.com"
                  className={inputCls}
                  autoComplete="off"
                  spellCheck={false}
                />
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  Your own JSON-RPC endpoint for this chain. Any archive-capable RPC works — a keyed RPC
                  (e.g. Alchemy free tier) is faster and more reliable than a public one. Leave it empty
                  and wallet scanning stays disabled.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestRpc}
                  disabled={testingRpc || !form.rpcUrl.trim()}
                  className="inline-flex items-center gap-1.5 border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ash hover:border-white/40 hover:text-ink disabled:opacity-40"
                >
                  {testingRpc && <Loader2 className="h-3 w-3 animate-spin" />}
                  Test RPC
                </button>
                {rpcStatus && (
                  <span className={`flex items-center gap-1 text-[11px] ${rpcStatus.ok ? 'text-ink' : 'text-red-400'}`}>
                    {rpcStatus.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                    {rpcStatus.msg}
                  </span>
                )}
              </div>
              <div>
                <label className={labelCls} htmlFor="ao-explorer-url">Explorer API (fallback read path)</label>
                <input
                  id="ao-explorer-url"
                  type="text"
                  value={form.explorerApiUrl}
                  onChange={(e) => set('explorerApiUrl', e.target.value)}
                  className={inputCls}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-4">
          <span className="text-[11px] text-muted">
            {saved ? 'Settings saved in this browser.' : 'Changes apply after saving.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-white/15 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ash hover:text-ink"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="bg-ink px-4 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-obsidian hover:bg-white"
            >
              Save settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
