import type { WalletExplorerSnapshot } from './explorer';

export interface WalletMemoryAnalysis {
  strategies: Array<{
    name: string;
    description: string;
    confidenceScore: number;
    avgHoldHours: number | null;
    supportingTxHashes: string[];
  }>;
  mistakes: Array<{
    category: string;
    severity: 'low' | 'medium' | 'high';
    summary: string;
    estimatedLossUsd: number | null;
    txHash: string | null;
    /** Every detected tx for this mistake (e.g. all unrevoked approval txs). */
    relatedTxHashes?: string[];
  }>;
  habits: {
    activeHoursUtc: number[];
    avgTradesPerWeek: number;
    preferredTokens: string[];
    avgPositionUsd: number;
    riskProfile: 'conservative' | 'balanced' | 'aggressive';
  };
  behaviorShifts: Array<{
    windowLabel: string;
    previousPattern: string;
    currentPattern: string;
    shiftType: string;
    insightNote: string;
  }>;
  personalInsights: Array<{
    title: string;
    body: string;
    priority: 'low' | 'normal' | 'high';
  }>;
}

export function analyzeWalletMemory(snapshot: WalletExplorerSnapshot): WalletMemoryAnalysis {
  const txs = snapshot.transactions;
  const swaps = txs.filter((t) => t.txType === 'swap');
  const failed = txs.filter((t) => t.status === 'error');
  const approvals = txs.filter((t) => t.txType === 'approve');

  // 1. Preferred tokens & active UTC hours
  const tokenFreq = new Map<string, number>();
  const hourFreq = new Map<number, number>();
  for (const tx of txs) {
    if (tx.tokenIn) tokenFreq.set(tx.tokenIn, (tokenFreq.get(tx.tokenIn) || 0) + 1);
    if (tx.tokenOut) tokenFreq.set(tx.tokenOut, (tokenFreq.get(tx.tokenOut) || 0) + 1);
    const hr = new Date(tx.timestamp).getUTCHours();
    if (!Number.isNaN(hr)) hourFreq.set(hr, (hourFreq.get(hr) || 0) + 1);
  }

  const preferredTokens = [...tokenFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([sym]) => sym);

  const activeHoursUtc = [...hourFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([hr]) => hr);

  const avgTradesPerWeek = txs.length > 0 ? Number(Math.max(1, swaps.length / 2).toFixed(1)) : 0;
  const riskProfile: 'conservative' | 'balanced' | 'aggressive' =
    swaps.length >= 15 || failed.length >= 3
      ? 'aggressive'
      : swaps.length >= 5
      ? 'balanced'
      : 'conservative';

  // 2. Strategies
  const strategies: WalletMemoryAnalysis['strategies'] = [];
  if (swaps.length > 0) {
    strategies.push({
      name: preferredTokens.length > 0 ? `${preferredTokens[0]} Rotation Playbook` : 'Active DEX Swapping',
      description: `Executed ${swaps.length} swaps across recent Robinhood Chain activity${
        preferredTokens.length ? `, concentrated in ${preferredTokens.slice(0, 3).join(', ')}` : ''
      }.`,
      confidenceScore: Math.min(0.95, 0.55 + swaps.length * 0.03),
      avgHoldHours: swaps.length >= 4 ? 18 : 72,
      supportingTxHashes: swaps.slice(0, 5).map((s) => s.txHash),
    });
  } else {
    strategies.push({
      name: 'Spot Holding & Accumulation',
      description: `Low swap turnover detected on Robinhood Chain (${snapshot.tokens.length} tracked token balances, ${snapshot.nativeBalanceEth} ETH native balance).`,
      confidenceScore: 0.72,
      avgHoldHours: 168,
      supportingTxHashes: txs.slice(0, 3).map((t) => t.txHash),
    });
  }

  // 3. Mistakes
  const mistakes: WalletMemoryAnalysis['mistakes'] = [];
  for (const f of failed.slice(0, 4)) {
    mistakes.push({
      category: 'reverted_tx',
      severity: 'high',
      summary: `Reverted "${f.methodName}" transaction burned ${f.gasEth} ETH in gas without completing execution.`,
      estimatedLossUsd: null,
      txHash: f.txHash,
    });
  }
  // Over-approval: prefer the Approval-event scan (every allowance grant,
  // with revoke status resolved). Fall back to approve txs when the scan
  // found no Approval events (e.g. browser Blockscout snapshot path).
  const approvalGrants = (snapshot.approvals || []).filter((a) => !a.revoked);
  const approvalTxCount =
    (snapshot.approvals?.length ?? 0) > 0 ? snapshot.approvals!.length : approvals.length;
  if (approvalGrants.length > 0 || approvals.length >= 4) {
    const unrevoked = approvalGrants.length > 0 ? approvalGrants : approvals.map((a) => ({ txHash: a.txHash }));
    const unlimitedCount = approvalGrants.filter((a) => a.isUnlimited).length;
    const revokedCount = (snapshot.approvals?.length ?? 0) - approvalGrants.length;
    mistakes.push({
      category: 'over_approval',
      severity: 'medium',
      summary:
        `${approvalTxCount} token approval call${approvalTxCount === 1 ? '' : 's'} detected` +
        (approvalGrants.length > 0
          ? ` — ${approvalGrants.length} still unrevoked${unlimitedCount > 0 ? ` (${unlimitedCount} unlimited)` : ''}${
              revokedCount > 0 ? `, ${revokedCount} already revoked` : ''
            }. Review and revoke unused allowances.`
          : '—review and revoke unused allowances.'),
      estimatedLossUsd: null,
      txHash: unrevoked[0]?.txHash || approvals[0]?.txHash || null,
      relatedTxHashes: unrevoked.slice(0, 10).map((a) => a.txHash),
    });
  }
  if (mistakes.length === 0) {
    mistakes.push({
      category: 'clean_execution',
      severity: 'low',
      summary: 'No reverted transactions detected in the latest synced Robinhood Chain window.',
      estimatedLossUsd: 0,
      txHash: null,
    });
  }

  // 4. Behavior Shifts (Compare newer half vs older half of synced window)
  const mid = Math.floor(txs.length / 2);
  const recentHalf = txs.slice(0, mid);
  const olderHalf = txs.slice(mid);
  const recentSwaps = recentHalf.filter((t) => t.txType === 'swap').length;
  const olderSwaps = olderHalf.filter((t) => t.txType === 'swap').length;

  const behaviorShifts: WalletMemoryAnalysis['behaviorShifts'] = [
    {
      windowLabel: 'Recent vs. Prior Window',
      previousPattern: `${olderSwaps} swaps across ${olderHalf.length} transactions`,
      currentPattern: `${recentSwaps} swaps across ${recentHalf.length} transactions`,
      shiftType: recentSwaps > olderSwaps ? 'risk_increase' : 'frequency_drop',
      insightNote:
        recentSwaps > olderSwaps
          ? 'Swap velocity increased in your latest transactions—watch for over-trading during volatile moves.'
          : 'Execution pace cooled down compared to your prior window, showing more selective entries.',
    },
  ];

  // 5. Personal Insights
  const personalInsights: WalletMemoryAnalysis['personalInsights'] = [
    {
      title: 'Robinhood Chain Execution Summary',
      body: `AO indexed ${txs.length} recent transactions (${swaps.length} swaps, ${failed.length} failed) and ${snapshot.tokens.length} token balances on Chain ID ${snapshot.chainId}.`,
      priority: failed.length > 0 ? 'high' : 'normal',
    },
  ];

  return {
    strategies,
    mistakes,
    habits: {
      activeHoursUtc,
      avgTradesPerWeek,
      preferredTokens,
      avgPositionUsd: 0,
      riskProfile,
    },
    behaviorShifts,
    personalInsights,
  };
}

export function formatMemoryForPrompt(
  snapshot: WalletExplorerSnapshot | null,
  analysis: WalletMemoryAnalysis | null
): string {
  if (!snapshot || !analysis) {
    return 'No Robinhood Chain wallet has been synced yet. Ask the user to paste or connect a 0x address to build persistent wallet memory.';
  }

  return JSON.stringify(
    {
      network: `Robinhood Chain (Chain ID ${snapshot.chainId})`,
      wallet: snapshot.address,
      nativeBalanceEth: snapshot.nativeBalanceEth,
      txCount: snapshot.txCount,
      holdings: snapshot.tokens.slice(0, 8),
      strategies: analysis.strategies,
      mistakes: analysis.mistakes,
      habits: analysis.habits,
      behaviorShifts: analysis.behaviorShifts,
      recentTransactions: snapshot.transactions.slice(0, 12).map((t) => ({
        hash: t.txHash,
        type: t.txType,
        method: t.methodName,
        in: t.tokenIn ? `${t.amountIn ?? ''} ${t.tokenIn}` : null,
        out: t.tokenOut ? `${t.amountOut ?? ''} ${t.tokenOut}` : null,
        status: t.status,
        time: t.timestamp,
      })),
    },
    null,
    2
  );
}
