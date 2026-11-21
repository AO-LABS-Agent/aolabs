import { sanitizeOnChainField } from './security';
import { loadSettings } from './settings';

export interface NormalizedTx {
  txHash: string;
  blockNumber: number;
  timestamp: string;
  txType: 'swap' | 'transfer' | 'approve' | 'contract_call' | 'failed';
  methodName: string;
  tokenIn: string | null;
  tokenOut: string | null;
  amountIn: number | null;
  amountOut: number | null;
  usdValue: number | null;
  gasEth: number;
  status: 'ok' | 'error';
}

export interface ApprovalGrant {
  txHash: string;
  blockNumber: number;
  timestamp: string;
  token: string;
  tokenSymbol: string;
  spender: string;
  /** Raw allowance value as a decimal string (2^256-1 = unlimited). */
  valueRaw: string;
  isUnlimited: boolean;
  /** True when a later approve(spender, 0) exists for the same token+spender. */
  revoked: boolean;
}

export interface WalletExplorerSnapshot {
  address: string;
  chainId: number;
  nativeBalanceEth: number;
  txCount: number;
  tokens: Array<{ symbol: string; address: string; balance: number; usdPrice: number | null }>;
  transactions: NormalizedTx[];
  /** ERC-20 Approval grants (newest first). Grants only; revokes are folded into `revoked`. */
  approvals?: ApprovalGrant[];
  /** Revoke events (approve(spender, 0)) in the scanned window — lets the
   * client resolve `revoked` across merged windows. */
  approvalRevokes?: Array<{ token: string; spender: string; blockNumber: number }>;
  /** True when the server-side explorer read failed outright (RPC down /
   * rate-limited) and the snapshot is an empty fallback — clients should
   * retry instead of treating it as "no activity". */
  scanFailed?: boolean;
  /** Top block actually scanned (RPC path only); drives windowed pagination. */
  scanTop?: number;
}

/** Chain + explorer endpoints come from the user's Settings (localStorage). */
function chainId(): number {
  return loadSettings().chainId || 4663;
}
function explorerApiBase(): string {
  return loadSettings().explorerApiUrl.replace(/\/+$/, '') || 'https://robinhoodchain.blockscout.com/api/v2';
}
function rpcUrl(): string {
  return loadSettings().rpcUrl.trim().replace(/\/+$/, '');
}
export const ROBINHOOD_MAINNET_CHAIN_ID = 4663;

// Public Robinhood Chain RPC endpoints — all keyless, so they live in code,
// not env. The official RPC is rate-limited from datacenter IPs and
// sometimes answers empty, so every RPC call rotates across the pool on
// failure: the next endpoint is tried before giving up. wss:// endpoints
// are excluded (fetch needs https). Tested from our VM 2026-11-20: most
// alternates are slow or reject archive eth_getLogs (PublicNode needs a
// token for archive logs, dRPC caps ranges at 100 blocks, bloXroute has
// no eth_getLogs on the free endpoint) — they are a fallback, not a
// replacement; the official RPC stays first in the pool.
// AOLABS ships with NO hardcoded RPC. The user sets their own endpoint in
// Settings — any archive-capable JSON-RPC works (a keyed RPC such as
// Alchemy is faster and more reliable than a public one). The endpoint is
// tried first for balance/nonce/tx-detail calls; the indexed Transfers API
// (fetchAlchemyTransfers) is attempted on the same endpoint and falls back
// to the eth_getLogs scan when the endpoint does not support it.
/** The user's configured RPC endpoint (single). Empty until set in Settings. */
function rpcEndpoints(_count: number): string[] {
  const url = rpcUrl();
  return url ? [url] : [];
}
/** Endpoints for eth_getLogs: the same user-configured RPC. Note: some
 * keyed RPCs cap eth_getLogs ranges (Alchemy Free: 10 blocks) — the
 * Transfers API path covers transfers in that case, and the approval scan
 * is time-boxed so a capped endpoint degrades gracefully instead of
 * hanging the scan. */
function rpcLogEndpoints(_count: number): string[] {
  const url = rpcUrl();
  return url ? [url] : [];
}

// --- On-chain RPC fallback -------------------------------------------------
// When the explorer API is unreachable (or rate-limited), the snapshot is
// rebuilt from the user's own RPC endpoint:
//   eth_getBalance / eth_getTransactionCount for the headline numbers, plus
//   eth_getLogs (ERC-20 Transfer events over the full chain history, newest-
//   first, via the busiest token contracts discovered from GeckoTerminal)
//   for real tx history. The browser-side explorer fetch in
//   src/lib/apiClient.ts remains as an extra full-history path.
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
const MAX_UINT256 = (1n << 256n) - 1n;
const NOX_TOKEN_ADDRESS = '0x2fb1422011cc33c610b24fcccf0d1755212afd2b';
const RPC_LOG_RANGE = 10000000; // max blocks per eth_getLogs call WITH a single address filter
const RPC_SCAN_MAX_BLOCKS = 60000000; // ~2.5 months of history per sync; older activity stays in localStorage
const RPC_MAX_TXS = 50;

// Top traded tokens on Robinhood Chain, discovered live from GeckoTerminal
// (no key needed). The RPC allows 10M-block eth_getLogs ranges only when an
// `address` filter is present, so scanning the busiest token contracts over
// the full chain history is how we recover a wallet's real tx list without
// an indexer. Cached 10 minutes per server instance.
let topTokensCache: { at: number; tokens: string[] } | null = null;

// Top traded tokens on Robinhood Chain. The live GeckoTerminal list is
// fetched when reachable, but datacenter IPs are often rate-limited, so a
// static snapshot of the top pools (captured 2026-11-20) is always merged
// in — without it a blocked GeckoTerminal fetch leaves the scan covering
// only NOX and the wallet's real activity comes back empty.
const STATIC_TOP_TOKENS = [
  '0x5fc5360d0400a0fd4f2af552add042d716f1d168', // USDG
  '0x0bd7d308f8e1639fab988df18a8011f41eacad73', // WETH
  '0xbbb6c29bcc3a1028a2b54310df73f4f7a3bcb373', // ANT
  '0x1b0e319c6a659f002271b69db8a7df2f911c153e', // GME
  '0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec', // NVDA
  '0x88de4991146ecf15e4ca2cf44dce3b9f5c0f1e18', // MI
  '0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea', // SPCX
  '0x117cc2133c37b721f49de2a7a74833232b3b4c0c', // SPY
  '0x86923f96303d656e4aa86d9d42d1e57ad2023fdc', // AMD
  '0x255979302fd6a5e2ff6dce0d8b018f51e06e243a', // UNIWALL
  '0x5c275f84ae7b58f75e68709f60241bbac4a1ad52', // CATMARIO
  '0x4213406ae9e84e64a2dd7e4bb4da0c25f9842f47',
  '0xff080c8ce2e5feadaca0da81314ae59d232d4afd',
  '0x9409cb484d1b1f628231099f58109469733ce6e8',
  '0x020bfc650a365f8bb26819deaabf3e21291018b4',
  '0x39dbed3a2bd333467115de45665cc57f813c4571',
  '0x38eb9bb6700093513315d4de20d8932ae93704c6',
  '0x549bfdcf781e614cd1a31682889fd44c3bae0fa7',
  '0x96a7b2b073487205e6b3703a69ee9bfe76051e18',
  '0x6b44f4d45ac1757e34c2c609b1e3ad0f3e589dd2',
];

async function fetchTopRobinhoodTokens(): Promise<string[]> {
  if (topTokensCache && Date.now() - topTokensCache.at < 10 * 60 * 1000) return topTokensCache.tokens;
  const tokens = new Set<string>([NOX_TOKEN_ADDRESS, ...STATIC_TOP_TOKENS]);
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch('https://api.geckoterminal.com/api/v2/networks/robinhood/pools?page=1', {
      headers: { Accept: 'application/json' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = (await res.json()) as any;
      for (const pool of data?.data || []) {
        for (const rel of [pool?.relationships?.base_token?.data, pool?.relationships?.quote_token?.data]) {
          const id = String(rel?.id || '');
          const addr = id.split('_').pop()?.toLowerCase() || '';
          if (/^0x[a-f0-9]{40}$/.test(addr) && addr !== '0x0000000000000000000000000000000000000000') tokens.add(addr);
        }
        if (tokens.size >= 40) break;
      }
    }
  } catch {
    // fall through with the static set
  }
  const list = [...tokens].slice(0, 40);
  topTokensCache = { at: Date.now(), tokens: list };
  return list;
}

async function fetchLogsRange(
  from: number,
  to: number,
  topics: unknown[],
  address: string | string[]
): Promise<{ ok: true; logs: any[] } | { ok: false; message: string }> {
  // One user-configured endpoint: a single failure means this range is
  // skipped for this pass (the next scan/window retries it) instead of
  // hanging the whole window.
  for (const url of rpcLogEndpoints(2)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getLogs',
          params: [{ fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16), address, topics }],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as { result?: any[]; error?: { message?: string } };
      if (data?.error) continue;
      return { ok: true, logs: Array.isArray(data?.result) ? data.result : [] };
    } catch {
      continue;
    }
  }
  return { ok: false, message: 'all RPC endpoints failed' };
}

const METHOD_NAMES: Record<string, string> = {
  '0x095ea7b3': 'approve',
  '0xa9059cbb': 'transfer',
  '0x23b872dd': 'transferFrom',
  '0x38ed1739': 'swapExactTokensForTokens',
  '0x8803dbee': 'swapTokensForExactTokens',
  '0x7ff36ab5': 'swapExactETHForTokens',
  '0x18cbafe5': 'swapExactTokensForETH',
  '0xfb3bdb41': 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
  '0x5c11d795': 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
  '0x3593564c': 'execute',
  '0xac9650d8': 'multicall',
  '0x1cff79cd': 'claim',
  '0x4e71d92d': 'claim',
};

async function rpcCall(method: string, params: unknown[]): Promise<any | null> {
  // Single user-configured endpoint, one quick retry: under parallel
  // bursts a free-tier RPC occasionally 429s, and a 700ms retry beats
  // failing the whole scan.
  const endpoints = rpcEndpoints(3);
  for (let i = 0; i < endpoints.length; i++) {
    const url = endpoints[i];
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) break;
        const data = (await res.json()) as { result?: any; error?: unknown };
        if (data?.error || data?.result === undefined) break;
        return data.result;
      } catch {
        break;
      }
    }
  }
  return null;
}

function hexToBigInt(value: unknown): bigint {
  try {
    if (typeof value === 'string' && /^0x[0-9a-fA-F]+$/.test(value)) return BigInt(value);
  } catch {
    // fall through
  }
  return 0n;
}

function decodeAbiUint(hexData: string): number {
  const clean = hexData.replace(/^0x/, '');
  if (clean.length < 64) return 0;
  try {
    return Number(BigInt('0x' + clean.slice(0, 64)));
  } catch {
    return 0;
  }
}

function hexToUtf8(hex: string): string {
  try {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return new TextDecoder().decode(bytes).replace(/\0/g, '');
  } catch {
    return '';
  }
}

function decodeAbiString(hexData: string): string {
  const clean = hexData.replace(/^0x/, '');
  try {
    if (clean.length >= 128) {
      const len = Number(BigInt('0x' + clean.slice(64, 128)));
      if (len > 0 && len <= 64) {
        return hexToUtf8(clean.slice(128, 128 + len * 2));
      }
    }
    // bytes32 fallback (e.g. some tokens return symbol as bytes32)
    return hexToUtf8(clean.slice(0, 64));
  } catch {
    return '';
  }
}

async function fetchTokenMeta(tokenAddress: string): Promise<{ decimals: number; symbol: string }> {
  const [decRaw, symRaw] = await Promise.all([
    rpcCall('eth_call', [{ to: tokenAddress, data: '0x313ce567' }, 'latest']),
    rpcCall('eth_call', [{ to: tokenAddress, data: '0x95d89b41' }, 'latest']),
  ]);
  const decimals = typeof decRaw === 'string' ? decodeAbiUint(decRaw) : 18;
  const symbol = typeof symRaw === 'string' ? decodeAbiString(symRaw) || 'TOKEN' : 'TOKEN';
  return { decimals: decimals > 0 && decimals <= 36 ? decimals : 18, symbol: sanitizeOnChainField(symbol, 24) };
}

type TransferLeg = { token: string; from: string; to: string; value: bigint; blockNumber: number };

/**
 * Enumerate a wallet's ERC-20 transfers via an indexed Transfers API
 * (alchemy_getAssetTransfers) — one paginated call per direction, full
 * history, no log-range limits. Attempted on the user's configured RPC
 * whenever one is set: it succeeds on Alchemy-style endpoints and returns
 * null on any other endpoint (or when the call fails), so the caller falls
 * back to the eth_getLogs scan. Output shape matches the log scan's
 * logsByHash/seenHashes (newest first), so the rest of the pipeline is
 * unchanged. The Approval scan still uses eth_getLogs on the configured
 * RPC — approve() calls emit no Transfer event, so the Transfers API
 * cannot see them.
 */
async function fetchAlchemyTransfers(
  address: string
): Promise<{
  logsByHash: Map<string, TransferLeg[]>;
  seenHashes: string[];
  blockTs: Map<number, string>;
  tokenMeta: Map<string, { decimals: number; symbol: string }>;
} | null> {
  const alchemyUrl = rpcUrl();
  if (!alchemyUrl) return null;
  const allTransfers: any[] = [];
  for (const key of ['fromAddress', 'toAddress'] as const) {
    let pageKey: string | undefined;
    let pages = 0;
    do {
      const params: Record<string, unknown> = {
        fromBlock: '0x0',
        toBlock: 'latest',
        category: ['erc20'],
        withMetadata: true,
        excludeZeroValue: true,
        maxCount: 1000,
      };
      params[key] = address;
      if (pageKey) params.pageKey = pageKey;
      let data: any = null;
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        const res = await fetch(alchemyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'alchemy_getAssetTransfers', params: [params] }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (!res.ok) return null;
        data = await res.json();
      } catch {
        return null;
      }
      if (data?.error) return null;
      const transfers = Array.isArray(data?.result?.transfers) ? data.result.transfers : [];
      allTransfers.push(...transfers);
      pageKey = data?.result?.pageKey;
      pages++;
    } while (pageKey && pages < 10);
  }
  // Newest first; dedupe by uniqueId (a self-transfer appears in both lists).
  allTransfers.sort(
    (a, b) => Number(BigInt(String(b.blockNum || '0x0'))) - Number(BigInt(String(a.blockNum || '0x0')))
  );
  const logsByHash = new Map<string, TransferLeg[]>();
  const seenHashes: string[] = [];
  const seen = new Set<string>();
  const seenTransferIds = new Set<string>();
  // Seed data the Transfers API already carries, so the pipeline below
  // does not re-fetch it per block/token over RPC: block timestamps
  // (metadata.blockTimestamp) and token decimals/symbol
  // (rawContract.decimal + asset). This cuts ~110 Alchemy calls per scan
  // — the free tier is slow under parallel bursts and rate-limits them.
  const blockTs = new Map<number, string>();
  const tokenMeta = new Map<string, { decimals: number; symbol: string }>();
  for (const t of allTransfers) {
    const uid = String(t.uniqueId || `${t.hash}:${t.from}:${t.to}:${t.rawContract?.value}`);
    if (seenTransferIds.has(uid)) continue;
    seenTransferIds.add(uid);
    const hash = String(t.hash || '').toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(hash)) continue;
    const token = String(t.rawContract?.address || '').toLowerCase();
    if (!token) continue;
    let value = 0n;
    try {
      value = BigInt(String(t.rawContract?.value || '0x0'));
    } catch {
      value = 0n;
    }
    const blockNumber = Number(BigInt(String(t.blockNum || '0x0')));
    const leg: TransferLeg = {
      token,
      from: String(t.from || '').toLowerCase(),
      to: String(t.to || '').toLowerCase(),
      value,
      blockNumber,
    };
    const list = logsByHash.get(hash) || [];
    list.push(leg);
    logsByHash.set(hash, list);
    if (!seen.has(hash)) {
      seen.add(hash);
      seenHashes.push(hash);
    }
    const ts = String(t.metadata?.blockTimestamp || '');
    if (blockNumber > 0 && ts && !blockTs.has(blockNumber)) {
      const parsed = Date.parse(ts);
      if (Number.isFinite(parsed)) blockTs.set(blockNumber, new Date(parsed).toISOString());
    }
    if (!tokenMeta.has(token)) {
      const dec = parseInt(String(t.rawContract?.decimal || '0x12'), 16);
      const symbol = sanitizeOnChainField(String(t.asset || 'TOKEN'), 24);
      tokenMeta.set(token, {
        decimals: Number.isFinite(dec) && dec > 0 && dec <= 36 ? dec : 18,
        symbol: symbol || 'TOKEN',
      });
    }
  }
  if (seenHashes.length === 0) return null;
  return { logsByHash, seenHashes, blockTs, tokenMeta };
}

async function fetchRpcSnapshot(
  address: string,
  opts?: { toBlock?: number; depthBlocks?: number }
): Promise<WalletExplorerSnapshot | null> {
  const [balanceHex, nonceHex, latestHex] = await Promise.all([
    rpcCall('eth_getBalance', [address, 'latest']),
    rpcCall('eth_getTransactionCount', [address, 'latest']),
    rpcCall('eth_blockNumber', []),
  ]);
  if (balanceHex === null || nonceHex === null || latestHex === null) return null;

  const nativeBalanceEth = Number(hexToBigInt(balanceHex)) / 1e18;
  const txCount = Number(hexToBigInt(nonceHex));
  const latest = Number(hexToBigInt(latestHex));
  const padded = '0x000000000000000000000000' + address.slice(2);
  // Windowed scans (opts.toBlock / opts.depthBlocks) let the client walk the
  // full history in 20M-block chunks that each fit the serverless window.
  const scanTop = opts?.toBlock ?? latest;
  const scanDepth = opts?.depthBlocks ?? RPC_SCAN_MAX_BLOCKS;

  // Full-history Transfer scan: the RPC allows 10M-block ranges only with a
  // SINGLE address filter (an address array drops the limit to 100k blocks),
  // so scan each top token contract separately, newest range first, and stop
  // as soon as enough txs are found. A range that matches too many logs is
  // split in half (down to 30k blocks) instead of failing the scan.
  const seenHashes: string[] = [];
  const seen = new Set<string>();
  const logsByHash = new Map<string, TransferLeg[]>();
  // Indexed Transfers API first (no log-range limits): when the user's
  // RPC supports it, it replaces the eth_getLogs Transfer scan entirely.
  // Falls back to the log scan when the endpoint is absent, unsupported,
  // or returns nothing. The Approval scan below still runs either way.
  const alchemy = await fetchAlchemyTransfers(address);
  const useAlchemy = alchemy !== null;
  if (alchemy) {
    for (const [hash, legs] of alchemy.logsByHash) logsByHash.set(hash, legs);
    for (const hash of alchemy.seenHashes) {
      seen.add(hash);
      seenHashes.push(hash);
    }
  }
  const tokenAddresses = useAlchemy ? [] : await fetchTopRobinhoodTokens();
  const collectLogs = (logs: any[]) => {
    for (const log of logs) {
      const hash = String(log.transactionHash || '').toLowerCase();
      if (!hash) continue;
      const entry: TransferLeg = {
        token: String(log.address || '').toLowerCase(),
        from: '0x' + String(log.topics?.[1] || '').slice(-40),
        to: '0x' + String(log.topics?.[2] || '').slice(-40),
        value: hexToBigInt(log.data),
        blockNumber: Number(hexToBigInt(log.blockNumber || '0x0')),
      };
      const list = logsByHash.get(hash) || [];
      list.push(entry);
      logsByHash.set(hash, list);
      if (!seen.has(hash)) {
        seen.add(hash);
        seenHashes.push(hash);
      }
    }
  };
  const scanRangeToken = async (from: number, to: number, token: string, topics: unknown[], attempt = 0): Promise<void> => {
    const res = await fetchLogsRange(from, to, topics, token);
    if (res.ok) {
      collectLogs(res.logs);
      return;
    }
    if (/exceeds limit|only \d+ are allowed|narrow the block range/i.test(res.message) && to - from > 30000) {
      const mid = Math.floor((from + to) / 2);
      await scanRangeToken(from, mid, token, topics);
      await scanRangeToken(mid + 1, to, token, topics);
      return;
    }
    // Transient failure (timeout / network / rate limit): one retry.
    if (attempt === 0) await scanRangeToken(from, to, token, topics, 1);
  };
  // ERC-20 Approval events (owner = wallet). Approve txs emit no Transfer
  // log, so the Transfer scan never sees them — this is the only way to list
  // every allowance the wallet granted, and to tell which ones were later
  // revoked by a subsequent approve(spender, 0).
  const approvalLogs: Array<{ token: string; spender: string; value: bigint; txHash: string; blockNumber: number }> = [];
  const collectApprovalLogs = (logs: any[]) => {
    for (const log of logs) {
      const hash = String(log.transactionHash || '').toLowerCase();
      const blockNumber = Number(hexToBigInt(log.blockNumber || '0x0'));
      if (!hash || !blockNumber) continue;
      approvalLogs.push({
        token: String(log.address || '').toLowerCase(),
        spender: '0x' + String(log.topics?.[2] || '').slice(-40),
        value: hexToBigInt(log.data),
        txHash: hash,
        blockNumber,
      });
    }
  };
  const scanApprovalsRange = async (from: number, to: number, token: string): Promise<void> => {
    const res = await fetchLogsRange(from, to, [APPROVAL_TOPIC, padded], token);
    if (res.ok) {
      collectApprovalLogs(res.logs);
      return;
    }
    if (/exceeds limit|only \d+ are allowed|narrow the block range/i.test(res.message) && to - from > 30000) {
      const mid = Math.floor((from + to) / 2);
      await scanApprovalsRange(from, mid, token);
      await scanApprovalsRange(mid + 1, to, token);
      return;
    }
    // No retry on transient failure: a timed-out range just yields fewer
    // approvals this pass (the next scan/window retries it) instead of
    // doubling a 10s timeout across every range.
  };
  const runWithConcurrency = async (tasks: Array<() => Promise<void>>, limit: number): Promise<void> => {
    let index = 0;
    const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (index < tasks.length) {
        const task = tasks[index++];
        await task();
      }
    });
    await Promise.all(workers);
  };
  for (let groupStart = scanTop; groupStart > 0 && scanTop - groupStart < scanDepth && (useAlchemy || seenHashes.length < RPC_MAX_TXS); groupStart -= RPC_LOG_RANGE * 3) {
    if (!useAlchemy) {
      const transferTasks: Array<() => Promise<void>> = [];
      for (let to = groupStart; to > groupStart - RPC_LOG_RANGE * 3 && to > 0; to -= RPC_LOG_RANGE) {
        const from = Math.max(0, to - RPC_LOG_RANGE + 1);
        for (const token of tokenAddresses) {
          transferTasks.push(() => scanRangeToken(from, to, token, [TRANSFER_TOPIC, padded]));
          transferTasks.push(() => scanRangeToken(from, to, token, [TRANSFER_TOPIC, null, padded]));
        }
      }
      // Time-boxed like the approval scan below: a dead public RPC must
      // not hold the whole sync hostage. Whatever logs were collected by
      // then are used; the rest retries on the next scan/window.
      await Promise.race([
        runWithConcurrency(transferTasks, 8),
        new Promise((resolve) => setTimeout(resolve, 25000)),
      ]);
    }
    // Approvals only for tokens the wallet actually SPENT in this group
    // (an outgoing leg): allowances are granted for tokens it trades. Cap
    // at the 8 most-spent tokens — the Approval scan costs one eth_getLogs
    // call per (token, 10M range), and the public RPC degrades fast under
    // burst load; an unbounded token list makes a window call time out
    // and find NO approvals at all. The top 8 cover every token with real
    // trading activity (all 9 known grants sit on NVDA/GME/USDG/WETH).
    // No retry here: a timed-out range just yields fewer approvals this
    // pass — the next scan/window retries it — instead of doubling a 6s
    // timeout.
    const groupFrom = groupStart - RPC_LOG_RANGE * 3 + 1;
    const outCount = new Map<string, number>();
    for (const l of [...logsByHash.values()].flat()) {
      if (l.from === address && l.blockNumber >= groupFrom && l.blockNumber <= groupStart) {
        outCount.set(l.token, (outCount.get(l.token) || 0) + 1);
      }
    }
    const activeTokens = [...outCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([token]) => token);
    if (activeTokens.length > 0) {
      const approvalTasks: Array<() => Promise<void>> = [];
      for (let to = groupStart; to > groupStart - RPC_LOG_RANGE * 3 && to > 0; to -= RPC_LOG_RANGE) {
        const from = Math.max(0, to - RPC_LOG_RANGE + 1);
        for (const token of activeTokens) approvalTasks.push(() => scanApprovalsRange(from, to, token));
      }
      // Time-box the approval scan: when the public RPC is dead, every
      // range burns the full 6s timeout — without a cap the scan holds
      // the whole sync hostage and finds nothing anyway. 20s is enough
      // when the RPC is healthy (~2-3s/call); whatever was collected by
      // then is used, the rest retries on the next scan/window.
      await Promise.race([
        runWithConcurrency(approvalTasks, 8),
        new Promise((resolve) => setTimeout(resolve, 20000)),
      ]);
    }
  }

  // Resolve tx details (newest first by discovery order = newest chunks first).
  const txHashes = seenHashes.slice(0, RPC_MAX_TXS);
  // Seed block timestamps + token metadata from the Alchemy transfers when
  // available (see fetchAlchemyTransfers) — the fetch loops below skip
  // anything already known, which cuts ~110 RPC calls per scan.
  const blockTs = new Map<number, string>(alchemy?.blockTs ?? []);
  const tokenMeta = new Map<string, { decimals: number; symbol: string }>(alchemy?.tokenMeta ?? []);
  const transactions: NormalizedTx[] = [];
  const tokenBalances = new Map<string, { symbol: string; address: string; balance: number; usdPrice: number | null }>();

  // Fetch all tx + receipt details in parallel batches first.
  const allDetails: Array<{ hash: string; tx: any; receipt: any }> = [];
  for (let i = 0; i < txHashes.length; i += 10) {
    const batch = txHashes.slice(i, i + 10);
    const details = await Promise.all(
      batch.map(async (hash) => {
        const [tx, receipt] = await Promise.all([
          rpcCall('eth_getTransactionByHash', [hash]),
          rpcCall('eth_getTransactionReceipt', [hash]),
        ]);
        return { hash, tx, receipt };
      })
    );
    allDetails.push(...details);
  }
  // Then resolve every distinct block timestamp and token metadata in parallel.
  const blockNumbers = [
    ...new Set(allDetails.filter((d) => d.tx).map((d) => Number(hexToBigInt(d.tx.blockNumber)))),
  ].filter((b) => !blockTs.has(b));
  await Promise.all(
    blockNumbers.map(async (blockNumber) => {
      const block = await rpcCall('eth_getBlockByNumber', ['0x' + blockNumber.toString(16), false]);
      const ts = block?.timestamp ? Number(hexToBigInt(block.timestamp)) * 1000 : Date.now();
      blockTs.set(blockNumber, new Date(ts).toISOString());
    })
  );
  const distinctTokens = [
    ...new Set(allDetails.flatMap((d) => (logsByHash.get(d.hash) || []).map((l) => l.token))),
  ].filter((t) => !tokenMeta.has(t));
  await Promise.all(
    distinctTokens.map(async (token) => {
      tokenMeta.set(token, await fetchTokenMeta(token));
    })
  );

  for (const { hash, tx, receipt } of allDetails) {
    if (!tx) continue;
    {
      const blockNumber = Number(hexToBigInt(tx.blockNumber));
      const legs = logsByHash.get(hash) || [];
      const outLeg = legs.find((l) => l.from === address);
      const inLeg = legs.find((l) => l.to === address);
      const metaOf = (leg?: { token: string; value: bigint }) => {
        if (!leg) return { symbol: null as string | null, amount: null as number | null };
        const meta = tokenMeta.get(leg.token) || { decimals: 18, symbol: 'TOKEN' };
        return { symbol: meta.symbol, amount: Number((Number(leg.value) / Math.pow(10, Math.min(meta.decimals, 18))).toFixed(6)) };
      };
      const out = metaOf(outLeg);
      const inn = metaOf(inLeg);
      const input = String(tx.input || '0x');
      const selector = input.slice(0, 10).toLowerCase();
      const method = METHOD_NAMES[selector] || (input === '0x' ? 'transfer' : 'contract_call');
      const status: 'ok' | 'error' = receipt?.status === '0x1' ? 'ok' : receipt?.status === '0x0' ? 'error' : 'ok';
      const gasUsed = hexToBigInt(receipt?.gasUsed);
      const gasPrice = hexToBigInt(receipt?.effectiveGasPrice ?? tx.gasPrice);
      let txType: NormalizedTx['txType'] = 'transfer';
      // Selector-only method names lie: 0x095ea7b3 on a non-token contract
      // is not an approval. Only trust 'approve' when the receipt actually
      // emitted an Approval event for the wallet.
      const hasApprovalLog = (receipt?.logs || []).some(
        (l: any) => String(l.topics?.[0] || '').toLowerCase() === APPROVAL_TOPIC
      );
      if (status === 'error') txType = 'failed';
      else if (/approve/i.test(method) && hasApprovalLog) txType = 'approve';
      else if ((outLeg && inLeg) || /swap|execute|multicall/i.test(method)) txType = 'swap';
      else if (method !== 'transfer') txType = 'contract_call';
      transactions.push({
        txHash: hash,
        blockNumber,
        timestamp: blockTs.get(blockNumber) || new Date().toISOString(),
        txType,
        methodName: sanitizeOnChainField(method, 48),
        tokenIn: out.symbol,
        tokenOut: inn.symbol,
        amountIn: out.amount,
        amountOut: inn.amount,
        usdValue: null,
        gasEth: Number((Number(gasUsed * gasPrice) / 1e18).toFixed(8)),
        status,
      });
    }
  }

  // Token balances for tokens seen in recent transfers.
  await Promise.all(
    [...tokenMeta.keys()].map(async (token) => {
      const meta = tokenMeta.get(token)!;
      const data = '0x70a08231' + padded.slice(2);
      const balRaw = await rpcCall('eth_call', [{ to: token, data }, 'latest']);
      const raw = typeof balRaw === 'string' ? hexToBigInt(balRaw) : 0n;
      tokenBalances.set(token, {
        symbol: meta.symbol,
        address: token,
        balance: Number((Number(raw) / Math.pow(10, Math.min(meta.decimals, 18))).toFixed(6)),
        usdPrice: null,
      });
    })
  );

  transactions.sort((a, b) => b.blockNumber - a.blockNumber);

  // Resolve Approval grants: a grant is unrevoked when no later
  // approve(spender, 0) exists for the same (token, spender) pair.
  const approvals: ApprovalGrant[] = [];
  let approvalRevokes: Array<{ token: string; spender: string; blockNumber: number }> = [];
  if (approvalLogs.length > 0) {
    const approvalTokens = [...new Set(approvalLogs.map((l) => l.token))];
    await Promise.all(
      approvalTokens.map(async (token) => {
        if (!tokenMeta.has(token)) tokenMeta.set(token, await fetchTokenMeta(token));
      })
    );
    const approvalBlocks = [...new Set(approvalLogs.map((l) => l.blockNumber))].filter(
      (b) => !blockTs.has(b)
    );
    await Promise.all(
      approvalBlocks.map(async (blockNumber) => {
        const block = await rpcCall('eth_getBlockByNumber', ['0x' + blockNumber.toString(16), false]);
        const ts = block?.timestamp ? Number(hexToBigInt(block.timestamp)) * 1000 : Date.now();
        blockTs.set(blockNumber, new Date(ts).toISOString());
      })
    );
    const seenApproval = new Set<string>();
    for (const log of approvalLogs) {
      if (log.value === 0n) continue; // revoke events only cancel grants, never listed
      const key = `${log.token}|${log.spender}|${log.txHash}`;
      if (seenApproval.has(key)) continue;
      seenApproval.add(key);
      const revoked = approvalLogs.some(
        (r) =>
          r.token === log.token &&
          r.spender === log.spender &&
          r.value === 0n &&
          r.blockNumber > log.blockNumber
      );
      const meta = tokenMeta.get(log.token) || { decimals: 18, symbol: 'TOKEN' };
      approvals.push({
        txHash: log.txHash,
        blockNumber: log.blockNumber,
        timestamp: blockTs.get(log.blockNumber) || new Date().toISOString(),
        token: log.token,
        tokenSymbol: meta.symbol,
        spender: log.spender,
        valueRaw: log.value.toString(),
        isUnlimited: log.value === MAX_UINT256,
        revoked,
      });
    }
    approvals.sort((a, b) => b.blockNumber - a.blockNumber);
    const seenRevoke = new Set<string>();
    approvalRevokes = approvalLogs
      .filter((l) => l.value === 0n)
      .filter((l) => {
        const k = `${l.token}|${l.spender}|${l.blockNumber}`;
        if (seenRevoke.has(k)) return false;
        seenRevoke.add(k);
        return true;
      })
      .map((l) => ({ token: l.token, spender: l.spender, blockNumber: l.blockNumber }));
  }

  return {
    address,
    chainId: chainId(),
    nativeBalanceEth: Number(nativeBalanceEth.toFixed(6)),
    txCount,
    tokens: [...tokenBalances.values()].slice(0, 20),
    transactions,
    approvals: approvals.slice(0, 30),
    approvalRevokes,
    scanTop,
  };
}

/** Validate + normalize a client-supplied snapshot (browser Blockscout fetch). */
export function sanitizeClientSnapshot(input: unknown): WalletExplorerSnapshot | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as Record<string, any>;
  const address = typeof s.address === 'string' ? s.address.trim().toLowerCase() : '';
  if (!isValidEvmAddress(address)) return null;
  const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
  const transactions: NormalizedTx[] = Array.isArray(s.transactions)
    ? s.transactions.slice(0, 50).flatMap((t: any) => {
        if (!t || typeof t.txHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(t.txHash)) return [];
        return [
          {
            txHash: t.txHash.toLowerCase(),
            blockNumber: num(t.blockNumber),
            timestamp: typeof t.timestamp === 'string' ? t.timestamp : new Date().toISOString(),
            txType: ['swap', 'transfer', 'approve', 'contract_call', 'failed'].includes(t.txType) ? t.txType : 'transfer',
            methodName: sanitizeOnChainField(String(t.methodName || 'transfer'), 48),
            tokenIn: typeof t.tokenIn === 'string' ? sanitizeOnChainField(t.tokenIn, 24) : null,
            tokenOut: typeof t.tokenOut === 'string' ? sanitizeOnChainField(t.tokenOut, 24) : null,
            amountIn: typeof t.amountIn === 'number' ? t.amountIn : null,
            amountOut: typeof t.amountOut === 'number' ? t.amountOut : null,
            usdValue: null,
            gasEth: num(t.gasEth),
            status: t.status === 'error' ? 'error' : 'ok',
          } as NormalizedTx,
        ];
      })
    : [];
  const tokens = Array.isArray(s.tokens)
    ? s.tokens.slice(0, 20).flatMap((t: any) => {
        if (!t || typeof t.symbol !== 'string' || typeof t.address !== 'string') return [];
        return [{ symbol: sanitizeOnChainField(t.symbol, 24), address: t.address.toLowerCase(), balance: num(t.balance), usdPrice: typeof t.usdPrice === 'number' ? t.usdPrice : null }];
      })
    : [];
  // Approval grants from the merged client snapshot: validate shape, then
  // re-resolve `revoked` from the merged revoke list (a revoke found in a
  // newer window cancels an older grant).
  const approvalRevokes: Array<{ token: string; spender: string; blockNumber: number }> = Array.isArray(
    s.approvalRevokes
  )
    ? s.approvalRevokes.slice(0, 30).flatMap((r: any) => {
        if (!r || typeof r.token !== 'string' || typeof r.spender !== 'string') return [];
        return [{ token: r.token.toLowerCase(), spender: r.spender.toLowerCase(), blockNumber: num(r.blockNumber) }];
      })
    : [];
  const rawApprovals: ApprovalGrant[] = Array.isArray(s.approvals)
    ? s.approvals.slice(0, 30).flatMap((a: any) => {
        if (!a || typeof a.txHash !== 'string' || !/^0x[0-9a-f]{64}$/.test(a.txHash)) return [];
        return [
          {
            txHash: a.txHash.toLowerCase(),
            blockNumber: num(a.blockNumber),
            timestamp: typeof a.timestamp === 'string' ? a.timestamp : new Date().toISOString(),
            token: typeof a.token === 'string' ? a.token.toLowerCase() : '',
            tokenSymbol: typeof a.tokenSymbol === 'string' ? sanitizeOnChainField(a.tokenSymbol, 24) : 'TOKEN',
            spender: typeof a.spender === 'string' ? a.spender.toLowerCase() : '',
            valueRaw: typeof a.valueRaw === 'string' ? a.valueRaw.slice(0, 80) : '0',
            isUnlimited: Boolean(a.isUnlimited),
            revoked: Boolean(a.revoked),
          } as ApprovalGrant,
        ];
      })
    : [];
  const approvals = rawApprovals.map((g) => ({
    ...g,
    revoked:
      g.revoked ||
      approvalRevokes.some(
        (r) => r.token === g.token && r.spender === g.spender && r.blockNumber > g.blockNumber
      ),
  }));
  return {
    address,
    chainId: chainId(),
    nativeBalanceEth: num(s.nativeBalanceEth),
    txCount: num(s.txCount, transactions.length),
    tokens,
    transactions,
    approvals,
    approvalRevokes,
    scanFailed: Boolean(s.scanFailed),
  };
}

async function fetchBlockscoutJson<T>(url: string): Promise<T | null> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export function isValidEvmAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}

export async function fetchRobinhoodWalletSnapshot(
  rawAddress: string,
  opts?: { toBlock?: number; depthBlocks?: number }
): Promise<WalletExplorerSnapshot> {
  const address = rawAddress.trim().toLowerCase();
  const base = explorerApiBase();

  const [addrInfo, txsRes, transfersRes, tokensRes] = await Promise.all([
    fetchBlockscoutJson<{ coin_balance?: string; transactions_count?: string }>(`${base}/addresses/${address}`),
    fetchBlockscoutJson<{ items?: Array<Record<string, any>> }>(`${base}/addresses/${address}/transactions`),
    fetchBlockscoutJson<{ items?: Array<Record<string, any>> }>(`${base}/addresses/${address}/token-transfers`),
    fetchBlockscoutJson<{ items?: Array<Record<string, any>> }>(`${base}/addresses/${address}/tokens`),
  ]);

  // If the explorer API answers nothing, fall back to the user's RPC so
  // balance / tx count are never silently 0.
  let rpcFailed = false;
  if (!addrInfo) {
    const rpcSnapshot = await fetchRpcSnapshot(address, opts);
    if (rpcSnapshot) return rpcSnapshot;
    rpcFailed = true;
  }

  const nativeBalanceEth = addrInfo?.coin_balance
    ? Number(BigInt(addrInfo.coin_balance)) / 1e18
    : 0;

  const transfersByHash = new Map<string, Array<{ dir: 'in' | 'out'; symbol: string; amount: number }>>();
  for (const tr of transfersRes?.items || []) {
    const hash = String(tr.tx_hash || tr.transaction_hash || '').toLowerCase();
    if (!hash) continue;
    const dec = Number(tr.total?.decimals || tr.token?.decimals || 18);
    const rawVal = Number(tr.total?.value || 0);
    const amount = Number.isFinite(rawVal) ? rawVal / Math.pow(10, Math.min(dec, 18)) : 0;
    const symbol = sanitizeOnChainField(tr.token?.symbol || 'TOKEN', 24);
    const fromAddr = String(tr.from?.hash || '').toLowerCase();
    const dir: 'in' | 'out' = fromAddr === address ? 'out' : 'in';
    const list = transfersByHash.get(hash) || [];
    list.push({ dir, symbol, amount });
    transfersByHash.set(hash, list);
  }

  const transactions: NormalizedTx[] = (txsRes?.items || []).slice(0, 50).map((tx) => {
    const hash = String(tx.hash || '').toLowerCase();
    const status: 'ok' | 'error' = tx.status === 'ok' || tx.result === 'success' ? 'ok' : 'error';
    const method = sanitizeOnChainField(tx.method || tx.tx_types?.[0] || 'transfer', 48);
    const feeWei = Number(tx.fee?.value || 0);
    const gasEth = Number.isFinite(feeWei) ? feeWei / 1e18 : 0;
    const legs = transfersByHash.get(hash) || [];
    const outLeg = legs.find((l) => l.dir === 'out');
    const inLeg = legs.find((l) => l.dir === 'in');

    let txType: NormalizedTx['txType'] = 'transfer';
    if (status === 'error') txType = 'failed';
    else if (/approve/i.test(method)) txType = 'approve';
    else if ((outLeg && inLeg) || /swap|exactInput|execute|multicall/i.test(method)) txType = 'swap';
    else if (method && method !== 'transfer') txType = 'contract_call';

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
      usdValue: null,
      gasEth: Number(gasEth.toFixed(8)),
      status,
    };
  });

  const tokens = (tokensRes?.items || []).slice(0, 20).map((item) => {
    const dec = Number(item.token?.decimals || 18);
    const rawVal = Number(item.value || 0);
    return {
      symbol: sanitizeOnChainField(item.token?.symbol || 'TOKEN', 24),
      address: String(item.token?.address || '').toLowerCase(),
      balance: Number((rawVal / Math.pow(10, Math.min(dec, 18))).toFixed(6)),
      usdPrice: item.token?.exchange_rate ? Number(item.token.exchange_rate) : null,
    };
  });

  return {
    address,
    chainId: chainId(),
    nativeBalanceEth: Number(nativeBalanceEth.toFixed(6)),
    txCount: Number(addrInfo?.transactions_count || transactions.length),
    tokens,
    transactions,
    scanFailed: rpcFailed && !addrInfo,
  };
}
