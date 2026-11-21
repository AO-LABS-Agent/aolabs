// Client-side AO orchestration. Everything runs in the browser:
//  - wallet scans read the user's configured RPC + public explorer APIs
//  - wallet memory + chat history live in localStorage (see store.ts)
//  - chat replies come from the user's own configured LLM endpoint (see llm.ts)
//
// No request ever leaves the browser except to the endpoints the user
// configured (LLM, RPC) and the public market/explorer APIs.

import { loadSettings, isRPCConfigured, isLLMConfigured } from './settings';
import { inspectUserInput, AO_SYSTEM_PROMPT } from './security';
import { generateAOReply, type LLMMessage } from './llm';
import {
  fetchRobinhoodWalletSnapshot,
  isValidEvmAddress,
  sanitizeClientSnapshot,
  type ApprovalGrant,
  type WalletExplorerSnapshot,
} from './explorer';
import { analyzeWalletMemory, formatMemoryForPrompt } from './memory';
import { lookupMarketSnapshots, type MarketSnapshot } from './market';
import {
  saveWalletMemory,
  loadWalletMemory,
  listSessions,
  createSession,
  touchSession,
  deleteSession,
  readSessionMessages,
  appendSessionMessage,
} from './store';

export type { MarketSnapshot };
export type { ApprovalGrant };

export interface WalletMemoryResponse {
  walletId: string | null;
  persisted: boolean;
  syncedAt: string;
  nextScanToBlock?: number | null;
  /** True when stored memory was served because the live scan came back
   * partial/failed (RPC rate-limited or not configured). */
  servedFromStored?: boolean;
  snapshot: WalletExplorerSnapshot;
  memory: ReturnType<typeof analyzeWalletMemory>;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  markets?: MarketSnapshot[];
  timestamp?: string;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  wallet_address: string | null;
  created_at: string;
  updated_at: string;
}

export function getOrCreateClientId(): string {
  try {
    const existing = window.localStorage.getItem('ao_client_id');
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `ao_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem('ao_client_id', generated);
    return generated;
  } catch {
    return `ao_ephemeral_${Date.now()}`;
  }
}

const TRANSFER_DECIMALS = 18;

function sanitizeField(value: string, max: number): string {
  return value.replace(/[<>"'`]/g, '').slice(0, max) || 'TOKEN';
}

/**
 * Fetch the wallet snapshot straight from the explorer API in the user's
 * browser. Real browsers pass the explorer's bot protection, so this is
 * the full-history path when the RPC scan comes back empty.
 */
export async function fetchBlockscoutSnapshotFromBrowser(
  rawAddress: string
): Promise<WalletExplorerSnapshot | null> {
  const address = rawAddress.trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(address)) return null;
  const base = loadSettings().explorerApiUrl.replace(/\/+$/, '');
  const getJson = async (url: string): Promise<any | null> => {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) return null;
      return (await res.json()) as any;
    } catch {
      return null;
    }
  };
  const [addrInfo, txsRes, transfersRes, tokensRes] = await Promise.all([
    getJson(`${base}/addresses/${address}`),
    getJson(`${base}/addresses/${address}/transactions`),
    getJson(`${base}/addresses/${address}/token-transfers`),
    getJson(`${base}/addresses/${address}/tokens`),
  ]);
  if (!addrInfo && !txsRes && !transfersRes && !tokensRes) return null;

  const transfersByHash = new Map<string, Array<{ dir: 'in' | 'out'; symbol: string; amount: number }>>();
  for (const tr of transfersRes?.items || []) {
    const hash = String(tr.tx_hash || tr.transaction_hash || '').toLowerCase();
    if (!hash) continue;
    const dec = Number(tr.total?.decimals || tr.token?.decimals || TRANSFER_DECIMALS);
    const amount = Number(tr.total?.value || 0) / Math.pow(10, Math.min(dec, 18));
    const symbol = sanitizeField(tr.token?.symbol || 'TOKEN', 24);
    const dir: 'in' | 'out' = String(tr.from?.hash || '').toLowerCase() === address ? 'out' : 'in';
    const list = transfersByHash.get(hash) || [];
    list.push({ dir, symbol, amount: Number.isFinite(amount) ? amount : 0 });
    transfersByHash.set(hash, list);
  }

  const transactions = (txsRes?.items || []).slice(0, 50).map((tx: any) => {
    const hash = String(tx.hash || '').toLowerCase();
    const status = tx.status === 'ok' || tx.result === 'success' ? 'ok' : 'error';
    const method = sanitizeField(tx.method || tx.tx_types?.[0] || 'transfer', 48);
    const legs = transfersByHash.get(hash) || [];
    const outLeg = legs.find((l) => l.dir === 'out');
    const inLeg = legs.find((l) => l.dir === 'in');
    let txType = 'transfer';
    if (status === 'error') txType = 'failed';
    else if (/approve/i.test(method)) txType = 'approve';
    else if ((outLeg && inLeg) || /swap|exactInput|execute|multicall/i.test(method)) txType = 'swap';
    else if (method !== 'transfer') txType = 'contract_call';
    return {
      txHash: hash,
      blockNumber: Number(tx.block || tx.block_number || 0),
      timestamp: String(tx.timestamp || new Date().toISOString()),
      txType,
      methodName: method,
      tokenIn: outLeg?.symbol || null,
      tokenOut: inLeg?.symbol || null,
      amountIn: outLeg ? Number(outLeg.amount.toFixed(6)) : null,
      amountOut: inLeg ? Number(inLeg.amount.toFixed(6)) : null,
      gasEth: Number((Number(tx.fee?.value || 0) / 1e18).toFixed(8)),
      status,
    };
  });

  const tokens = (tokensRes?.items || []).slice(0, 20).map((item: any) => {
    const dec = Number(item.token?.decimals || TRANSFER_DECIMALS);
    return {
      symbol: sanitizeField(item.token?.symbol || 'TOKEN', 24),
      address: String(item.token?.address || '').toLowerCase(),
      balance: Number((Number(item.value || 0) / Math.pow(10, Math.min(dec, 18))).toFixed(6)),
      usdPrice: item.token?.exchange_rate ? Number(item.token.exchange_rate) : null,
    };
  });

  return {
    address,
    chainId: loadSettings().chainId || 4663,
    nativeBalanceEth: addrInfo?.coin_balance ? Number(BigInt(addrInfo.coin_balance)) / 1e18 : 0,
    txCount: Number(addrInfo?.transactions_count || transactions.length),
    tokens,
    transactions,
  };
}

export type ScanProgress = { windowsDone: number; txsFound: number };

/** Resolve `revoked` for every approval grant against the full merged
 * revoke list: a grant is revoked when a zero-value Approval for the same
 * (token, spender) pair exists at a later block — including revokes found
 * in a newer window than the grant itself. */
export function resolveApprovals(
  grants: ApprovalGrant[],
  revokes: Array<{ token: string; spender: string; blockNumber: number }>
): ApprovalGrant[] {
  return grants.map((g) => ({
    ...g,
    revoked:
      g.revoked ||
      revokes.some(
        (r) => r.token === g.token && r.spender === g.spender && r.blockNumber > g.blockNumber
      ),
  }));
}

export async function scanWalletAddress(
  address: string,
  onProgress?: (p: ScanProgress) => void
): Promise<WalletMemoryResponse> {
  const settings = loadSettings();
  if (!isRPCConfigured(settings)) {
    throw new Error(
      'No RPC endpoint configured. Open Settings and add your chain RPC endpoint first — AO reads on-chain history through it.'
    );
  }
  const target = address.trim().toLowerCase();
  if (!isValidEvmAddress(target)) {
    throw new Error('Paste a valid 0x wallet address first.');
  }

  // Walk the full chain history in 20M-block windows, merging txs
  // newest-first until 30 are found or the chain start is reached.
  const WINDOW_BLOCKS = 20000000;
  const mergedTxs = new Map<string, WalletExplorerSnapshot['transactions'][number]>();
  const mergedTokens = new Map<string, WalletExplorerSnapshot['tokens'][number]>();
  const mergedApprovals = new Map<string, ApprovalGrant>();
  const mergedRevokes = new Map<string, { token: string; spender: string; blockNumber: number }>();
  const mergeApprovals = (snap: WalletExplorerSnapshot) => {
    for (const a of snap.approvals || []) mergedApprovals.set(a.txHash, a);
    for (const r of snap.approvalRevokes || [])
      mergedRevokes.set(`${r.token}|${r.spender}|${r.blockNumber}`, r);
  };

  const fetchWindow = async (
    body: { toBlock?: number; depthBlocks: number },
    attempt = 0
  ): Promise<WalletExplorerSnapshot> => {
    const snap = await fetchRobinhoodWalletSnapshot(target, body);
    // A window whose explorer read failed outright is retried once after a
    // pause — public RPCs rate-limit — instead of being treated as
    // "no activity" and walking on with empty data.
    if (snap.scanFailed && attempt === 0) {
      await new Promise((r) => setTimeout(r, 1500));
      return fetchWindow(body, 1);
    }
    return snap;
  };

  let head: WalletExplorerSnapshot | null = null;
  let nextScanToBlock: number | null = null;
  let windowsDone = 0;
  let current = await fetchWindow({ depthBlocks: WINDOW_BLOCKS });
  windowsDone += 1;
  head = current;
  for (const t of current.transactions) mergedTxs.set(t.txHash, t);
  for (const tok of current.tokens) mergedTokens.set(tok.address, tok);
  mergeApprovals(current);
  nextScanToBlock = current.scanTop && current.scanTop - WINDOW_BLOCKS > 0 ? current.scanTop - WINDOW_BLOCKS : null;
  onProgress?.({ windowsDone, txsFound: mergedTxs.size });

  while (mergedTxs.size < 30 && nextScanToBlock !== null && nextScanToBlock > 0) {
    current = await fetchWindow({ toBlock: nextScanToBlock, depthBlocks: WINDOW_BLOCKS });
    windowsDone += 1;
    for (const t of current.transactions) mergedTxs.set(t.txHash, t);
    for (const tok of current.tokens) mergedTokens.set(tok.address, tok);
    mergeApprovals(current);
    nextScanToBlock = current.scanTop && current.scanTop - WINDOW_BLOCKS > 0 ? current.scanTop - WINDOW_BLOCKS : null;
    onProgress?.({ windowsDone, txsFound: mergedTxs.size });
    // A failed window ends the walk here: the merged data so far is real,
    // and a further window would only add empty results.
    if (current.scanFailed) break;
  }

  const buildResponse = (snapshot: WalletExplorerSnapshot, servedFromStored = false): WalletMemoryResponse => {
    const analysis = analyzeWalletMemory(snapshot);
    saveWalletMemory(snapshot.address, snapshot, analysis);
    return {
      walletId: snapshot.address,
      persisted: true,
      snapshot,
      memory: analysis,
      syncedAt: new Date().toISOString(),
      nextScanToBlock: null,
      servedFromStored,
    };
  };

  if (mergedTxs.size > 0 && head) {
    const mergedSnapshot: WalletExplorerSnapshot = {
      ...head,
      tokens: [...mergedTokens.values()],
      transactions: [...mergedTxs.values()].sort((a, b) => b.blockNumber - a.blockNumber).slice(0, 50),
      approvals: resolveApprovals([...mergedApprovals.values()], [...mergedRevokes.values()]).sort(
        (a, b) => b.blockNumber - a.blockNumber
      ),
      approvalRevokes: [...mergedRevokes.values()],
      // If the walk stopped early on a failed window, the merged snapshot is
      // partial — keep the fuller stored memory instead.
      scanFailed: current.scanFailed || false,
    };
    const sanitized = sanitizeClientSnapshot(mergedSnapshot) ?? mergedSnapshot;
    if (sanitized.scanFailed) {
      const stored = loadWalletMemory(target);
      if (stored && stored.snapshot.transactions.length > 0) {
        return {
          walletId: target,
          persisted: true,
          snapshot: {
            ...stored.snapshot,
            ...(sanitized.approvals?.length ? { approvals: sanitized.approvals } : {}),
            ...(sanitized.approvalRevokes?.length ? { approvalRevokes: sanitized.approvalRevokes } : {}),
          },
          memory: stored.analysis,
          syncedAt: new Date().toISOString(),
          nextScanToBlock: null,
          servedFromStored: true,
        };
      }
    }
    return buildResponse(sanitized);
  }

  // RPC scan came back empty: retry the explorer read from this browser,
  // which can read the explorer API directly.
  try {
    const browserSnapshot = await fetchBlockscoutSnapshotFromBrowser(target);
    if (browserSnapshot && (browserSnapshot.txCount > 0 || browserSnapshot.transactions.length > 0)) {
      const sanitized = sanitizeClientSnapshot(browserSnapshot) ?? browserSnapshot;
      return buildResponse(sanitized);
    }
  } catch {
    // fall through to the stored result
  }

  const stored = loadWalletMemory(target);
  if (stored && stored.snapshot.transactions.length > 0) {
    return {
      walletId: target,
      persisted: true,
      snapshot: stored.snapshot,
      memory: stored.analysis,
      syncedAt: new Date().toISOString(),
      nextScanToBlock: null,
      servedFromStored: true,
    };
  }
  if (head?.scanFailed) {
    throw new Error('The chain explorer is temporarily rate-limited. Please wait a minute and press Scan Address again.');
  }
  throw new Error('No on-chain activity found for this address. Check the address and your RPC endpoint in Settings.');
}

export async function sendAOChat(params: {
  message: string;
  walletAddress?: string;
  sessionId?: string | null;
  clientId: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<{
  sessionId: string | null;
  reply: string;
  markets: MarketSnapshot[];
  scannedWallet?: WalletMemoryResponse | null;
  blockedByGuard?: boolean;
}> {
  const settings = loadSettings();

  // Pre-LLM prompt injection firewall
  const check = inspectUserInput(params.message || '');
  if (check.blocked) {
    return {
      sessionId: params.sessionId || null,
      reply: check.deflectionMessage || 'That request cannot be processed.',
      markets: [],
      scannedWallet: null,
      blockedByGuard: true,
    };
  }

  if (!isLLMConfigured(settings)) {
    return {
      sessionId: params.sessionId || null,
      reply:
        'AO is not configured yet. Open Settings (gear icon, top right) and add your LLM provider, base URL, API key and model — then ask me again.',
      markets: [],
      scannedWallet: null,
      blockedByGuard: false,
    };
  }

  // Auto-detect an EVM wallet address directly inside the chat message
  const addressInPromptMatch = check.sanitizedInput.match(/\b(0x[a-fA-F0-9]{40})\b/);
  const addressInPrompt = addressInPromptMatch?.[1];
  const targetWalletAddress =
    addressInPrompt ||
    (params.walletAddress && isValidEvmAddress(params.walletAddress) ? params.walletAddress.trim() : undefined);

  let walletContext = formatMemoryForPrompt(null, null);
  let scannedWallet: WalletMemoryResponse | null = null;
  // Tokens to pull live DEX markets for when the user names no $TOKEN:
  // the wallet's top 3 preferred tokens, so a strategy answer is not
  // anchored on the single most-traded token alone.
  let inferredTokens: string[] = [];

  if (targetWalletAddress && isValidEvmAddress(targetWalletAddress)) {
    // Fast path: use the last stored memory in localStorage first. A live
    // full-history RPC scan takes 40s+ and would stall every chat reply;
    // the SCAN ADDRESS button is the refresh path for new activity. Only
    // wallets with no stored memory get a live scan here (20s budget).
    const stored = loadWalletMemory(targetWalletAddress);
    if (stored && stored.snapshot.transactions.length > 0) {
      walletContext = formatMemoryForPrompt(stored.snapshot, stored.analysis);
      scannedWallet = {
        walletId: targetWalletAddress.toLowerCase(),
        persisted: true,
        snapshot: stored.snapshot,
        memory: stored.analysis,
        syncedAt: stored.syncedAt,
        servedFromStored: true,
      };
      inferredTokens = stored.analysis.habits.preferredTokens.slice(0, 3);
    } else if (isRPCConfigured(settings)) {
      const liveScan = fetchRobinhoodWalletSnapshot(targetWalletAddress);
      const timedOut = new Promise<null>((resolve) => setTimeout(() => resolve(null), 20000));
      const snapshot = await Promise.race([liveScan, timedOut]);
      if (snapshot) {
        const analysis = analyzeWalletMemory(snapshot);
        saveWalletMemory(snapshot.address, snapshot, analysis);
        walletContext = formatMemoryForPrompt(snapshot, analysis);
        scannedWallet = {
          walletId: snapshot.address,
          persisted: true,
          snapshot,
          memory: analysis,
          syncedAt: new Date().toISOString(),
        };
        inferredTokens = analysis.habits.preferredTokens.slice(0, 3);
      }
    }
  }

  // Fetch live GeckoTerminal + DEX Screener snapshots: for an explicit
  // $TOKEN symbol only that token; otherwise the wallet's top 3 preferred
  // tokens in parallel (deduped, capped at 8 pool cards).
  let markets: MarketSnapshot[] = [];
  const symbolMatch = check.sanitizedInput.match(/\$([A-Za-z0-9]{2,12})/);
  const marketLookupTerms = symbolMatch?.[1] ? [symbolMatch[1]] : inferredTokens.slice(0, 3);
  if (marketLookupTerms.length > 0) {
    const all = await Promise.all(marketLookupTerms.map((t) => lookupMarketSnapshots(t)));
    const seen = new Set<string>();
    markets = all
      .flat()
      .filter((m) => {
        const key = (m.pairAddress || `${m.symbol}-${m.source}`).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);
  }

  const marketContext = markets.length > 0 ? JSON.stringify(markets, null, 2) : '';

  const systemContent = [
    AO_SYSTEM_PROMPT,
    '',
    '<untrusted_onchain_data type="wallet_memory">',
    walletContext,
    '</untrusted_onchain_data>',
    marketContext
      ? `\n<untrusted_onchain_data type="live_market">\n${marketContext}\n</untrusted_onchain_data>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const recentHistory: LLMMessage[] = params.history.slice(-10).map((m) => ({
    role: m.role,
    content: m.content.slice(0, 1500),
  }));

  let reply: string;
  try {
    const result = await generateAOReply(settings, [
      { role: 'system', content: systemContent },
      ...recentHistory,
      { role: 'user', content: `<user_query>\n${check.sanitizedInput}\n</user_query>` },
    ]);
    reply = result.reply;
  } catch (err) {
    const code = err instanceof Error ? err.message : 'AO_LLM_ERROR';
    reply =
      code === 'AO_LLM_AUTH_FAILED'
        ? 'Your LLM API key was rejected. Check the API key in Settings and try again.'
        : code === 'AO_LLM_BUSY'
          ? 'Your LLM provider is rate-limited right now. Please wait a moment and retry.'
          : 'AO could not reach your LLM endpoint. Check the base URL in Settings and try again.';
    return { sessionId: params.sessionId || null, reply, markets, scannedWallet, blockedByGuard: false };
  }

  // Persist chat session & messages to localStorage
  let sessionId = params.sessionId || null;
  if (!sessionId) {
    const created = createSession(check.sanitizedInput, targetWalletAddress || null);
    sessionId = created.id;
  } else {
    touchSession(sessionId, targetWalletAddress || undefined);
  }
  appendSessionMessage(sessionId, { role: 'user', content: check.sanitizedInput, timestamp: new Date().toISOString() });
  appendSessionMessage(sessionId, { role: 'assistant', content: reply, markets, timestamp: new Date().toISOString() });

  return { sessionId, reply, markets, scannedWallet, blockedByGuard: false };
}

export async function fetchChatSessions(_clientId: string): Promise<ChatSessionSummary[]> {
  return listSessions();
}

export async function fetchSessionMessages(sessionId: string): Promise<ChatTurn[]> {
  return readSessionMessages(sessionId);
}

export async function removeChatSession(sessionId: string, _clientId: string): Promise<void> {
  deleteSession(sessionId);
}
