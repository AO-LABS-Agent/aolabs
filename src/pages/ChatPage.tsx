import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { PanelLeft, Plus, Settings, Globe } from 'lucide-react';
import { MemorySidebar } from '../components/chat/MemorySidebar';
import { ChatThread } from '../components/chat/ChatThread';
import { ChatComposer } from '../components/chat/ChatComposer';
import { SettingsPanel } from '../components/chat/SettingsPanel';
import { loadSettings } from '../lib/settings';
import {
  fetchChatSessions,
  fetchSessionMessages,
  getOrCreateClientId,
  removeChatSession,
  scanWalletAddress,
  sendAOChat,
  type ChatSessionSummary,
  type ChatTurn,
  type WalletMemoryResponse,
} from '../lib/apiClient';

function GlobeIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return <Globe className={className} />;
}

function XLogoIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubLogoIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  );
}

export function ChatPage() {
  const [clientId] = useState<string>(() => getOrCreateClientId());
  const [addressInput, setAddressInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [walletData, setWalletData] = useState<WalletMemoryResponse | null>(null);

  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chainLabel, setChainLabel] = useState(() => {
    const s = loadSettings();
    return `${s.chainName.toUpperCase()} · ${s.chainId}`;
  });
  const typingVideoRef = useRef<HTMLVideoElement | null>(null);

  // Sync looping 30fps typing video cleanly with chatLoading state
  useEffect(() => {
    const vid = typingVideoRef.current;
    if (!vid) return;
    if (chatLoading) {
      vid.currentTime = 0;
      const playPromise = vid.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay fallback handled silently
        });
      }
    } else {
      vid.pause();
    }
  }, [chatLoading]);

  // Load chat sessions from localStorage on mount
  const refreshSessions = async () => {
    const list = await fetchChatSessions(clientId);
    setSessions(list);
  };

  useEffect(() => {
    refreshSessions();
  }, [clientId]);

  const handleScan = async (overrideAddress?: string) => {
    const target = (overrideAddress ?? addressInput).trim();
    if (!target) {
      setScanError('Paste a Robinhood Chain Mainnet 0x address first.');
      return;
    }
    setScanning(true);
    setScanError(null);
    setScanNote(null);
    try {
      const data = await scanWalletAddress(target, (p) => {
        setScanNote(`Scanning on-chain history… ${p.txsFound} transaction${p.txsFound === 1 ? '' : 's'} found`);
      });
      setWalletData(data);
      setAddressInput(data.snapshot.address);
      setScanNote(null);
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Unable to scan address.');
    } finally {
      setScanning(false);
    }
  };

  const handleSelectSession = async (session: ChatSessionSummary) => {
    setActiveSessionId(session.id);
    setSidebarOpen(false);
    const loaded = await fetchSessionMessages(session.id);
    setMessages(loaded);
    if (session.wallet_address) {
      setAddressInput(session.wallet_address);
      if (walletData?.snapshot.address.toLowerCase() !== session.wallet_address.toLowerCase()) {
        handleScan(session.wallet_address);
      }
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    await removeChatSession(sessionId, clientId);
    if (activeSessionId === sessionId) {
      setActiveSessionId(null);
      setMessages([]);
    }
    await refreshSessions();
  };

  const handleNewChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setSidebarOpen(false);
  };

  const handleSendMessage = async (text: string) => {
    const nextHistory = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextHistory);
    setChatLoading(true);
    try {
      const res = await sendAOChat({
        message: text,
        walletAddress: walletData?.snapshot.address || (addressInput.startsWith('0x') ? addressInput : undefined),
        sessionId: activeSessionId,
        clientId,
        history: nextHistory.map((m) => ({ role: m.role, content: m.content })),
      });

      if (res.sessionId && res.sessionId !== activeSessionId) {
        setActiveSessionId(res.sessionId);
      }
      if (res.scannedWallet) {
        setWalletData(res.scannedWallet);
        setAddressInput(res.scannedWallet.snapshot.address);
        // Live scan came back empty: retry from the explorer API in this
        // browser and refresh the sidebar memory with the full history.
        if (res.scannedWallet.snapshot.txCount === 0 && res.scannedWallet.snapshot.transactions.length === 0) {
          try {
            const refreshed = await scanWalletAddress(res.scannedWallet.snapshot.address);
            setWalletData(refreshed);
          } catch {
            // keep the server result
          }
        }
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: res.reply, markets: res.markets }]);
      await refreshSessions();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err instanceof Error ? err.message : 'AO Core could not process that request.',
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <div className="flex h-dvh w-full flex-col overflow-x-hidden bg-obsidian text-ink">
      {/* Top Chat Utility Bar */}
      <header className="z-30 flex h-14 shrink-0 items-center justify-between border-b border-white/[0.08] bg-obsidian/90 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle memory & chat history sidebar"
            className="border border-white/15 p-1.5 text-ash hover:text-ink lg:hidden"
          >
            <PanelLeft className="h-4 w-4" />
          </button>

          <Link to="/" className="flex items-center gap-2.5">
            <div className="h-7 w-7 overflow-hidden rounded-sm border border-white/20 bg-charcoal">
              <img src="/ao-logo.jpg" alt="AOLABS" className="h-full w-full object-cover object-top grayscale" />
            </div>
            <span className="font-display text-sm font-medium tracking-[0.2em] text-ink">AOLABS</span>
          </Link>

          <span className="hidden border border-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted sm:inline-block">
            {chainLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {walletData && (
            <span className="hidden border border-white/15 bg-charcoal px-2.5 py-1 font-mono text-[10px] text-ash md:inline-block">
              {walletData.snapshot.address.slice(0, 6)}...{walletData.snapshot.address.slice(-4)}
            </span>
          )}

          {/* X, website & GitHub links */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <a
              href="https://x.com/aolabsxyz"
              target="_blank"
              rel="noreferrer"
              aria-label="X"
              title="X"
              className="inline-flex h-7 w-7 items-center justify-center border border-white/15 bg-charcoal/60 text-ash transition-colors hover:border-white/40 hover:text-ink"
            >
              <XLogoIcon />
            </a>
            <a
              href="https://aolabs.xyz"
              target="_blank"
              rel="noreferrer"
              aria-label="AOLABS website"
              title="aolabs.xyz"
              className="inline-flex h-7 w-7 items-center justify-center border border-white/15 bg-charcoal/60 text-ash transition-colors hover:border-white/40 hover:text-ink"
            >
              <GlobeIcon />
            </a>
            <a
              href="https://github.com/AO-LABS-Agent/aolabs"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              title="GitHub"
              className="inline-flex h-7 w-7 items-center justify-center border border-white/15 bg-charcoal/60 text-ash transition-colors hover:border-white/40 hover:text-ink"
            >
              <GitHubLogoIcon />
            </a>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Open settings"
            title="Settings — LLM endpoint, model & RPC"
            className="inline-flex h-7 w-7 items-center justify-center border border-white/15 bg-charcoal/60 text-ash transition-colors hover:border-white/40 hover:text-ink"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>

          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex items-center gap-1.5 border border-white/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ash hover:border-white/40 hover:text-ink"
          >
            <Plus className="h-3 w-3" />
            <span>New Chat</span>
          </button>
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex">
          <MemorySidebar
            addressInput={addressInput}
            setAddressInput={setAddressInput}
            scanning={scanning}
            scanError={scanError}
            scanNote={scanNote}
            walletData={walletData}
            sessions={sessions}
            activeSessionId={activeSessionId}
            onScan={handleScan}
            onSelectSession={handleSelectSession}
            onDeleteSession={handleDeleteSession}
          />
        </div>

        {/* Mobile Drawer Sidebar */}
        {sidebarOpen && (
          <div className="fixed inset-0 top-14 z-40 flex bg-obsidian/80 backdrop-blur-sm lg:hidden">
            <div className="h-full w-[320px] max-w-[88vw] bg-charcoal">
              <MemorySidebar
                addressInput={addressInput}
                setAddressInput={setAddressInput}
                scanning={scanning}
                scanError={scanError}
                scanNote={scanNote}
                walletData={walletData}
                sessions={sessions}
                activeSessionId={activeSessionId}
                onScan={handleScan}
                onSelectSession={handleSelectSession}
                onDeleteSession={handleDeleteSession}
              />
            </div>
            <button
              type="button"
              aria-label="Close sidebar overlay"
              className="flex-1"
              onClick={() => setSidebarOpen(false)}
            />
          </div>
        )}

        {/* Chat Stream + Floating Centered AO Companion Character (Pip-style with real 30fps video) */}
        <section className="relative flex min-w-0 flex-1 flex-col bg-obsidian">
          <div className="pointer-events-none absolute top-3 left-0 right-0 z-20 flex flex-col items-center">
            <div
              className={`relative h-20 w-20 overflow-hidden rounded-full border bg-obsidian shadow-[0_10px_32px_rgba(0,0,0,0.88)] transition-all duration-300 ${
                chatLoading ? 'border-white/60 scale-105' : 'border-white/20'
              }`}
            >
              {/* Idle monochrome AO portrait */}
              <img
                src="/ao-logo.jpg"
                alt="AO"
                className={`absolute inset-0 h-full w-full object-cover object-top grayscale contrast-125 transition-opacity duration-300 ${
                  chatLoading ? 'opacity-0' : 'opacity-100'
                }`}
              />
              {/* Smooth 30fps looping MP4 typing video when AO is replying */}
              <video
                ref={typingVideoRef}
                src="/frames/ao-typing.mp4"
                poster="/frames/ao-typing-1.jpg"
                loop
                muted
                playsInline
                preload="auto"
                className={`absolute inset-0 h-full w-full object-cover object-center grayscale contrast-115 transition-opacity duration-300 ${
                  chatLoading ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </div>
            <div className="-mt-2.5 flex items-center gap-1.5 rounded-full border border-white/20 bg-obsidian/95 px-3 py-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink shadow-lg backdrop-blur-md">
              {chatLoading && <span className="h-1.5 w-1.5 rounded-full bg-ink animate-ping" />}
              <span>{chatLoading ? 'AO · TYPING' : 'AO'}</span>
            </div>
          </div>

          <ChatThread messages={messages} loading={chatLoading} onSelectStarter={handleSendMessage} />
          <ChatComposer disabled={chatLoading} onSend={handleSendMessage} />
        </section>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          const s = loadSettings();
          setChainLabel(`${s.chainName.toUpperCase()} · ${s.chainId}`);
        }}
      />
    </div>
  );
}
