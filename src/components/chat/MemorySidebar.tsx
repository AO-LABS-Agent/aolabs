import { useState } from 'react';
import { RefreshCw, ShieldAlert, TrendingUp, Activity, Clock, MessageSquare, Trash2 } from 'lucide-react';
import type { ChatSessionSummary, WalletMemoryResponse } from '../../lib/apiClient';

interface MemorySidebarProps {
  addressInput: string;
  setAddressInput: (val: string) => void;
  scanning: boolean;
  scanError: string | null;
  scanNote?: string | null;
  walletData: WalletMemoryResponse | null;
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onScan: (addr?: string) => void;
  onSelectSession: (session: ChatSessionSummary) => void;
  onDeleteSession: (sessionId: string) => void;
}

type MemoryTab = 'history' | 'strategies' | 'mistakes' | 'habits' | 'shifts';

const EXPLORER_MAINNET = 'https://robinhoodchain.blockscout.com';

export function MemorySidebar({
  addressInput,
  setAddressInput,
  scanning,
  scanError,
  scanNote,
  walletData,
  sessions,
  activeSessionId,
  onScan,
  onSelectSession,
  onDeleteSession,
}: MemorySidebarProps) {
  const [tab, setTab] = useState<MemoryTab>('history');

  return (
    <aside className="flex h-full w-full flex-col border-r border-white/[0.08] bg-charcoal/90 lg:w-[340px] lg:shrink-0">
      {/* Mainnet EVM Address Scanner (Paste Only — No Connect Wallet, Mainnet Only) */}
      <div className="border-b border-white/[0.08] p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
            Robinhood Chain Mainnet
          </span>
          <span className="border border-white/15 px-2 py-0.5 font-mono text-[10px] text-ink">
            4663
          </span>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onScan();
          }}
          className="mt-3 space-y-2"
        >
          <input
            type="text"
            value={addressInput}
            onChange={(e) => setAddressInput(e.target.value)}
            placeholder="Paste 0x... EVM address"
            className="w-full overflow-hidden border border-white/15 bg-obsidian px-3 py-2 font-mono text-[11px] text-ink placeholder:text-muted focus:border-white/50 focus:outline-none"
          />
          <button
            type="submit"
            disabled={scanning}
            className="inline-flex w-full items-center justify-center gap-2 bg-ink px-3 py-2 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-obsidian transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${scanning ? 'animate-spin' : ''}`} />
            <span>{scanning ? 'Scanning Address...' : 'Scan Address'}</span>
          </button>
        </form>

        {scanError && (
          <p className="mt-2 font-mono text-[11px] text-red-400">{scanError}</p>
        )}
        {scanning && scanNote && (
          <p className="mt-2 font-mono text-[11px] text-muted animate-pulse">{scanNote}</p>
        )}
        {!scanning && walletData?.servedFromStored && (
          <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted">
            Showing saved memory — the live scan was rate-limited. Press Scan Address again in a minute to refresh.
          </p>
        )}

        {walletData && (
          <div className="mt-3 grid grid-cols-2 gap-2 border border-white/10 bg-obsidian/70 p-2.5 font-mono text-[10px]">
            <div>
              <span className="block text-muted">BALANCE</span>
              <span className="text-ink">{walletData.snapshot.nativeBalanceEth} ETH</span>
            </div>
            <div>
              <span className="block text-muted">INDEXED TXS</span>
              <span className="text-ink">{walletData.snapshot.transactions.length}</span>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Tabs: History + 4 Memory Views */}
      <div className="grid grid-cols-5 border-b border-white/[0.08] font-mono text-[9px] uppercase">
        {(
          [
            ['history', 'Chats'],
            ['strategies', 'Strat'],
            ['mistakes', 'Errors'],
            ['habits', 'Habits'],
            ['shifts', 'Shifts'],
          ] as Array<[MemoryTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`py-2.5 tracking-[0.08em] transition-colors ${
              tab === key
                ? 'border-b-2 border-ink bg-white/[0.04] text-ink'
                : 'text-muted hover:text-ash'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
        {tab === 'history' && (
          <>
            {sessions.length === 0 ? (
              <div className="border border-dashed border-white/15 p-4 text-xs leading-relaxed text-muted">
                Your saved AO conversations will appear here automatically.
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={`group flex items-start justify-between gap-2 border p-3 transition-colors ${
                    activeSessionId === s.id
                      ? 'border-white/40 bg-white/[0.06]'
                      : 'border-white/10 bg-obsidian/70 hover:border-white/25'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSession(s)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-ink line-clamp-1">
                      <MessageSquare className="h-3 w-3 shrink-0 text-muted" />
                      <span className="min-w-0 truncate">{s.title}</span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 font-mono text-[9px] text-muted">
                      {s.wallet_address && (
                        <span>
                          {s.wallet_address.slice(0, 6)}...{s.wallet_address.slice(-4)}
                        </span>
                      )}
                      <span>{new Date(s.updated_at).toLocaleDateString()}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label="Delete chat session"
                    onClick={() => onDeleteSession(s.id)}
                    className="shrink-0 p-1 text-muted opacity-70 hover:text-ink hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))
            )}
          </>
        )}

        {tab !== 'history' && !walletData && (
          <div className="border border-dashed border-white/15 p-4 text-xs leading-relaxed text-muted">
            Paste any Robinhood Chain Mainnet <code className="font-mono text-ink">0x</code> address above and click <strong>Scan Address</strong>—or paste an address directly into the chat.
          </div>
        )}

        {tab === 'strategies' && walletData &&
          walletData.memory.strategies.map((s, idx) => {
            const swaps = walletData.snapshot.transactions.filter((t) => t.txType === 'swap');
            const tokenCounts = new Map<string, number>();
            for (const t of swaps) {
              if (t.tokenIn) tokenCounts.set(t.tokenIn, (tokenCounts.get(t.tokenIn) || 0) + 1);
              if (t.tokenOut) tokenCounts.set(t.tokenOut, (tokenCounts.get(t.tokenOut) || 0) + 1);
            }
            const topTokens = [...tokenCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
            return (
            <div key={idx} className="border border-white/10 bg-obsidian/80 p-3">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-ink">
                  <TrendingUp className="h-3.5 w-3.5 shrink-0 text-ash" />
                  <span className="truncate">{s.name}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted">
                  {Math.round(s.confidenceScore * 100)}%
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ash">{s.description}</p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-muted">
                <span>{swaps.length} swaps</span>
                {s.avgHoldHours != null && <span>avg hold ~{s.avgHoldHours}h</span>}
                <span>{walletData.snapshot.transactions.length} indexed txs</span>
              </div>
              {topTokens.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {topTokens.map(([sym, n]) => (
                    <span key={sym} className="border border-white/15 px-2 py-0.5 font-mono text-[10px] text-ink">
                      {sym} · {n}
                    </span>
                  ))}
                </div>
              )}
              {s.supportingTxHashes.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                  <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                    Supporting transactions
                  </span>
                  {s.supportingTxHashes.slice(0, 3).map((h) => (
                    <a
                      key={h}
                      href={`${EXPLORER_MAINNET}/tx/${h}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block font-mono text-[10px] text-muted underline hover:text-ink"
                    >
                      View tx {h.slice(0, 10)}... ↗
                    </a>
                  ))}
                </div>
              )}
            </div>
            );
          })}

        {tab === 'mistakes' && walletData &&
          walletData.memory.mistakes.map((m, idx) => {
            // Over-approval: list every still-unrevoked allowance grant with
            // its own tx link (from the Approval-event scan). Fall back to the
            // stored related tx hashes when no approval detail is available.
            const unrevoked =
              m.category === 'over_approval'
                ? (walletData.snapshot.approvals || []).filter((a) => !a.revoked)
                : [];
            const revokedCount =
              m.category === 'over_approval' ? (walletData.snapshot.approvals || []).filter((a) => a.revoked).length : 0;
            // Fallback: stored approval tx hashes not already covered by the
            // detailed list. A partial live scan (dead RPC) must not hide
            // grants the stored memory already knows — show both, deduped.
            const knownHashes = new Set(unrevoked.map((a) => a.txHash.toLowerCase()));
            const fallbackHashes =
              m.category === 'over_approval'
                ? (m.relatedTxHashes || []).filter((h) => h && h !== m.txHash && !knownHashes.has(h.toLowerCase()))
                : [];
            return (
            <div key={idx} className="border border-white/10 bg-obsidian/80 p-3">
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase text-ink">
                  <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-ash" />
                  <span className="truncate">{m.category.replace('_', ' ')}</span>
                </span>
                <span className="shrink-0 border border-white/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-ash">
                  {m.severity}
                </span>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-ash">{m.summary}</p>
              {unrevoked.length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-white/10 pt-2">
                  <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                    Unrevoked approvals ({unrevoked.length}
                    {revokedCount > 0 ? ` · ${revokedCount} already revoked` : ''})
                  </span>
                  {unrevoked.slice(0, 10).map((a) => (
                    <div key={a.txHash} className="flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 truncate font-mono text-[10px] text-ash">
                        {a.tokenSymbol} → {a.spender.slice(0, 6)}...{a.spender.slice(-4)}
                        {a.isUnlimited ? ' · Unlimited' : ''}
                      </span>
                      <a
                        href={`${EXPLORER_MAINNET}/tx/${a.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 font-mono text-[10px] text-muted underline hover:text-ink"
                      >
                        {a.txHash.slice(0, 10)}... ↗
                      </a>
                    </div>
                  ))}
                  {unrevoked.length > 10 && (
                    <span className="block font-mono text-[10px] text-muted">
                      +{unrevoked.length - 10} more unrevoked approvals
                    </span>
                  )}
                </div>
              )}
              {fallbackHashes.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                  <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                    Approval transactions
                  </span>
                  {fallbackHashes.slice(0, 10).map((h) => (
                    <a
                      key={h}
                      href={`${EXPLORER_MAINNET}/tx/${h}`}
                      target="_blank"
                      rel="noreferrer"
                      className="block font-mono text-[10px] text-muted underline hover:text-ink"
                    >
                      View tx {h.slice(0, 10)}... ↗
                    </a>
                  ))}
                </div>
              )}
              {unrevoked.length === 0 && fallbackHashes.length === 0 && m.txHash && (
                <a
                  href={`${EXPLORER_MAINNET}/tx/${m.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block font-mono text-[10px] text-muted underline hover:text-ink"
                >
                  View tx {m.txHash.slice(0, 10)}... ↗
                </a>
              )}
            </div>
            );
          })}

        {tab === 'habits' && walletData && (
          <div className="space-y-3 border border-white/10 bg-obsidian/80 p-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase text-muted">
                <Clock className="h-3.5 w-3.5" />
                Risk Profile
              </span>
              <span className="font-mono text-[11px] uppercase text-ink">
                {walletData.memory.habits.riskProfile}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-muted">Avg Swaps / Wk</span>
              <span className="font-mono text-[11px] text-ink">
                {walletData.memory.habits.avgTradesPerWeek}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase text-muted">Total Swaps</span>
              <span className="font-mono text-[11px] text-ink">
                {walletData.snapshot.transactions.filter((t) => t.txType === 'swap').length}
                {' / '}
                {walletData.snapshot.transactions.length} txs
              </span>
            </div>
            {(() => {
              const ts = walletData.snapshot.transactions
                .map((t) => new Date(t.timestamp).getTime())
                .filter((n) => Number.isFinite(n));
              if (ts.length === 0) return null;
              const first = new Date(Math.min(...ts)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              const last = new Date(Math.max(...ts)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
              return (
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 font-mono text-[10px] uppercase text-muted">Active Period</span>
                  <span className="text-right font-mono text-[11px] text-ink">
                    {first} — {last}
                  </span>
                </div>
              );
            })()}
            <div>
              <span className="block font-mono text-[10px] uppercase text-muted">Preferred Tokens</span>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(walletData.memory.habits.preferredTokens.length
                  ? walletData.memory.habits.preferredTokens
                  : ['ETH']
                ).map((tok) => (
                  <span key={tok} className="border border-white/15 px-2 py-0.5 font-mono text-[10px] text-ink">
                    {tok}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="block font-mono text-[10px] uppercase text-muted">Peak UTC Hours</span>
              <p className="mt-1 font-mono text-[11px] text-ash">
                {walletData.memory.habits.activeHoursUtc.length
                  ? walletData.memory.habits.activeHoursUtc.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ')
                  : 'Insufficient window'}
              </p>
            </div>
          </div>
        )}

        {tab === 'shifts' && walletData &&
          walletData.memory.behaviorShifts.map((b, idx) => (
            <div key={idx} className="border border-white/10 bg-obsidian/80 p-3">
              <div className="flex min-w-0 items-center gap-1.5 font-mono text-[10px] uppercase text-ink">
                <Activity className="h-3.5 w-3.5 shrink-0 text-ash" />
                <span className="truncate">{b.windowLabel}</span>
              </div>
              <p className="mt-2 font-mono text-[10px] text-muted">Before: {b.previousPattern}</p>
              <p className="font-mono text-[10px] text-ink">Now: {b.currentPattern}</p>
              <p className="mt-2 text-xs leading-relaxed text-ash">{b.insightNote}</p>
            </div>
          ))}
      </div>
    </aside>
  );
}
