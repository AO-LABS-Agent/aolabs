// Local persistence for AOLABS — everything lives in the browser's
// localStorage. No server, no database, no account. Clearing your browser
// data erases your AO memory and chat history; export anything you want
// to keep.

import type { WalletMemoryResponse, ChatTurn, ChatSessionSummary } from './apiClient';
import type { WalletMemoryAnalysis } from './memory';

const WALLET_KEY_PREFIX = 'ao_wallet_';
const SESSIONS_KEY = 'ao_sessions_v1';
const MESSAGES_KEY_PREFIX = 'ao_session_messages_';

export interface StoredWalletMemory {
  snapshot: WalletMemoryResponse['snapshot'];
  analysis: WalletMemoryAnalysis;
  syncedAt: string;
}

export function saveWalletMemory(
  address: string,
  snapshot: WalletMemoryResponse['snapshot'],
  analysis: WalletMemoryAnalysis
): void {
  try {
    const stored: StoredWalletMemory = { snapshot, analysis, syncedAt: new Date().toISOString() };
    window.localStorage.setItem(WALLET_KEY_PREFIX + address.toLowerCase(), JSON.stringify(stored));
  } catch {
    // storage full — memory stays in memory for this session
  }
}

export function loadWalletMemory(address: string): StoredWalletMemory | null {
  try {
    const raw = window.localStorage.getItem(WALLET_KEY_PREFIX + address.toLowerCase());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredWalletMemory;
    if (!parsed?.snapshot || !parsed?.analysis) return null;
    return parsed;
  } catch {
    return null;
  }
}

function readSessions(): ChatSessionSummary[] {
  try {
    const raw = window.localStorage.getItem(SESSIONS_KEY);
    const list = raw ? (JSON.parse(raw) as ChatSessionSummary[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeSessions(list: ChatSessionSummary[]): void {
  try {
    window.localStorage.setItem(SESSIONS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function listSessions(): ChatSessionSummary[] {
  return readSessions().sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
}

export function createSession(firstMessage: string, walletAddress: string | null): ChatSessionSummary {
  const now = new Date().toISOString();
  const session: ChatSessionSummary = {
    id:
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `ao_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    title: firstMessage.slice(0, 60) || 'New chat',
    wallet_address: walletAddress,
    created_at: now,
    updated_at: now,
  };
  const list = readSessions();
  list.unshift(session);
  writeSessions(list);
  return session;
}

export function touchSession(id: string, walletAddress?: string | null): void {
  const list = readSessions();
  const found = list.find((s) => s.id === id);
  if (!found) return;
  found.updated_at = new Date().toISOString();
  if (walletAddress !== undefined) found.wallet_address = walletAddress;
  writeSessions(list);
}

export function deleteSession(id: string): void {
  writeSessions(readSessions().filter((s) => s.id !== id));
  try {
    window.localStorage.removeItem(MESSAGES_KEY_PREFIX + id);
  } catch {
    // ignore
  }
}

export function readSessionMessages(sessionId: string): ChatTurn[] {
  try {
    const raw = window.localStorage.getItem(MESSAGES_KEY_PREFIX + sessionId);
    const list = raw ? (JSON.parse(raw) as ChatTurn[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function appendSessionMessage(sessionId: string, turn: ChatTurn): void {
  try {
    const list = readSessionMessages(sessionId);
    list.push(turn);
    window.localStorage.setItem(MESSAGES_KEY_PREFIX + sessionId, JSON.stringify(list));
  } catch {
    // ignore
  }
}
