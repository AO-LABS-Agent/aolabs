// Live market snapshots from public DEX data (no key needed):
// GeckoTerminal + DEX Screener, for the chain AO is configured to read.
// Runs entirely in the browser.

import { sanitizeOnChainField } from './security';

export interface MarketSnapshot {
  source: 'dexscreener' | 'geckoterminal';
  symbol: string;
  name: string;
  pairAddress: string;
  priceUsd: number;
  priceChange24h: number;
  liquidityUsd: number;
  volume24hUsd: number;
  dexName: string;
  url: string;
}

const GECKOTERMINAL_NETWORK = 'robinhood';
const DEXSCREENER_CHAIN_ID = 'robinhood';

const cache = new Map<string, { expiresAt: number; data: MarketSnapshot[] }>();
const CACHE_TTL_MS = 45_000;

async function fetchDexScreener(query: string): Promise<MarketSnapshot[]> {
  const preferredChain = DEXSCREENER_CHAIN_ID.toLowerCase();
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(query)}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { pairs?: Array<Record<string, any>> };
    const pairs = json.pairs || [];

    // Prioritize this chain's pairs first, then highest liquidity
    const sorted = [...pairs].sort((a, b) => {
      const aMatch = String(a.chainId || '').toLowerCase().includes(preferredChain) ? 1 : 0;
      const bMatch = String(b.chainId || '').toLowerCase().includes(preferredChain) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      return Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0);
    });

    return sorted.slice(0, 4).map((p) => ({
      source: 'dexscreener',
      symbol: sanitizeOnChainField(p.baseToken?.symbol || query.toUpperCase(), 20),
      name: sanitizeOnChainField(p.baseToken?.name || 'Token', 40),
      pairAddress: String(p.pairAddress || ''),
      priceUsd: Number(p.priceUsd || 0),
      priceChange24h: Number(p.priceChange?.h24 || 0),
      liquidityUsd: Number(p.liquidity?.usd || 0),
      volume24hUsd: Number(p.volume?.h24 || 0),
      dexName: sanitizeOnChainField(p.dexId || 'DEX', 24),
      url: String(p.url || 'https://dexscreener.com/'),
    }));
  } catch {
    return [];
  }
}

async function fetchGeckoTerminal(query: string): Promise<MarketSnapshot[]> {
  const network = GECKOTERMINAL_NETWORK.toLowerCase();
  const isAddress = /^0x[a-fA-F0-9]{40}$/.test(query.trim());
  const url = isAddress
    ? `https://api.geckoterminal.com/api/v2/networks/${encodeURIComponent(network)}/tokens/${query.trim().toLowerCase()}/pools`
    : `https://api.geckoterminal.com/api/v2/search/pools?query=${encodeURIComponent(query)}&network=${encodeURIComponent(network)}`;

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json;version=20230302' } });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Array<Record<string, any>> };
    return (json.data || []).slice(0, 4).map((item) => {
      const attr = item.attributes || {};
      return {
        source: 'geckoterminal',
        symbol: sanitizeOnChainField(String(attr.name || query).split('/')[0].trim(), 20),
        name: sanitizeOnChainField(attr.name || query, 48),
        pairAddress: String(attr.address || ''),
        priceUsd: Number(attr.base_token_price_usd || 0),
        priceChange24h: Number(attr.price_change_percentage?.h24 || 0),
        liquidityUsd: Number(attr.reserve_in_usd || 0),
        volume24hUsd: Number(attr.volume_usd?.h24 || 0),
        dexName: 'GeckoTerminal',
        url: `https://www.geckoterminal.com/${network}/pools/${attr.address || ''}`,
      };
    });
  } catch {
    return [];
  }
}

export async function lookupMarketSnapshots(rawQuery: string): Promise<MarketSnapshot[]> {
  const q = sanitizeOnChainField(rawQuery, 64).trim();
  if (!q) return [];

  const cacheKey = q.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.data;

  const [dexRes, geckoRes] = await Promise.all([fetchDexScreener(q), fetchGeckoTerminal(q)]);
  const merged = [...geckoRes, ...dexRes];

  // Deduplicate by pairAddress
  const seen = new Set<string>();
  const unique = merged.filter((m) => {
    const key = m.pairAddress.toLowerCase() || `${m.symbol}-${m.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);

  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, data: unique });
  return unique;
}
