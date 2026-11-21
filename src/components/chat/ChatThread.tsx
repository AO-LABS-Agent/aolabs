import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ExternalLink } from 'lucide-react';
import type { ChatTurn } from '../../lib/apiClient';

interface ChatThreadProps {
  messages: ChatTurn[];
  loading: boolean;
  onSelectStarter: (prompt: string) => void;
}

const STARTER_PROMPTS = [
  'Audit my recent Robinhood Chain transaction mistakes and gas waste.',
  'Summarize my recurring trading strategy and preferred tokens.',
  'How has my trading behavior shifted in my latest activity?',
  'Check live $ETH liquidity and 24h momentum on Robinhood Chain.',
];

// Minimal safe Markdown renderer for AO replies (bold, italic, code,
// headings, lists, links). Content is HTML-escaped first, so no raw HTML
// from the model can ever execute.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+)`/g, '<code class="rounded-sm bg-white/10 px-1 py-0.5 font-mono text-[12px] text-ink">$1</code>');
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" class="text-ink underline underline-offset-2">$1</a>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-ink">$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong class="font-semibold text-ink">$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_\w])_([^_\n]+)_/g, '$1<em>$2</em>');
  return out;
}

function renderMarkdown(content: string): string {
  const codeBlocks: string[] = [];
  const withPlaceholders = content.replace(/```(?:[\w-]*\n)?([\s\S]*?)```/g, (_, code) => {
    codeBlocks.push(`<pre class="overflow-x-auto rounded-sm border border-white/10 bg-obsidian/90 p-3 font-mono text-[12px] leading-relaxed text-ink">${escapeHtml(String(code).replace(/\n$/, ''))}</pre>`);
    return `\u0000${codeBlocks.length - 1}\u0000`;
  });

  const lines = withPlaceholders.split('\n');
  const blocks: string[] = [];
  let list: { type: 'ul' | 'ol'; items: string[] } | null = null;
  const flushList = () => {
    if (!list) return;
    const tag = list.type;
    blocks.push(
      `<${tag} class="${tag === 'ul' ? 'list-disc' : 'list-decimal'} space-y-1 pl-5 marker:text-muted">${list.items.map((i) => `<li>${i}</li>`).join('')}</${tag}>`
    );
    list = null;
  };
  const flushParagraph = (paraLines: string[]) => {
    if (paraLines.length === 0) return;
    blocks.push(`<p>${paraLines.map((l) => renderInline(l)).join('<br />')}</p>`);
  };

  let para: string[] = [];
  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (/^\u0000\d+\u0000$/.test(trimmed)) {
      flushList();
      flushParagraph(para);
      para = [];
      blocks.push(codeBlocks[Number(trimmed.replace(/\u0000/g, ''))]);
      continue;
    }
    const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList();
      flushParagraph(para);
      para = [];
      const level = heading[1].length;
      const cls = level === 1 ? 'text-base font-semibold text-ink' : level === 2 ? 'text-sm font-semibold text-ink' : 'text-sm font-medium text-ink';
      blocks.push(`<h${level} class="${cls}">${renderInline(heading[2])}</h${level}>`);
      continue;
    }
    const ul = trimmed.match(/^[-*]\s+(.*)$/);
    const ol = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      flushParagraph(para);
      para = [];
      const type = ul ? 'ul' : 'ol';
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      list.items.push(renderInline((ul || ol)![1]));
      continue;
    }
    if (trimmed === '') {
      flushList();
      flushParagraph(para);
      para = [];
      continue;
    }
    flushList();
    para.push(line);
  }
  flushList();
  flushParagraph(para);
  return blocks.join('');
}

export function ChatThread({ messages, loading, onSelectStarter }: ChatThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  };

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottomRef.current = nearBottom;
    setShowJump(!nearBottom);
  };

  // Follow new messages only while the user is already at the bottom; when
  // they scrolled up to read history, show the jump-to-latest button instead.
  useEffect(() => {
    if (nearBottomRef.current) scrollToBottom(false);
  }, [messages.length, loading]);

  if (messages.length === 0) {
    return (
      // Scrollable (not centered-overflow): on small phones the avatar +
      // heading + 4 starter cards are taller than the viewport — with plain
      // justify-center the top was cut off and the content spilled over the
      // composer. `m-auto` centers when it fits and scrolls when it doesn't.
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="m-auto flex w-full max-w-2xl flex-col items-center px-6 pt-24 pb-8 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
          AO · ROBINHOOD CHAIN MEMORY SPACE
        </p>
        <h1 className="mt-2 font-display text-2xl font-light tracking-[-0.02em] text-ink sm:text-3xl">
          Ask AO about your on-chain memory.
        </h1>
        <p className="mt-3 max-w-md text-xs leading-relaxed text-ash sm:text-sm">
          Paste any Robinhood Chain Mainnet <code className="font-mono text-ink">0x</code> address in the sidebar or directly in chat to scan activity, or query live DEX feeds.
        </p>

        <div className="mt-8 grid w-full max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2">
          {STARTER_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onSelectStarter(prompt)}
              className="border border-white/10 bg-charcoal/80 p-3.5 text-left text-xs leading-relaxed text-ash transition-colors hover:border-white/35 hover:text-ink"
            >
              {prompt}
            </button>
          ))}
        </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-6 overflow-x-hidden overflow-y-auto px-4 pt-28 pb-6 sm:px-8"
      >
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`mx-auto flex max-w-3xl gap-3.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
        >
          {msg.role === 'assistant' && (
            <div className="mt-0.5 h-7 w-7 shrink-0 overflow-hidden rounded-sm border border-white/20 bg-charcoal">
              <img
                src="/ao-logo.jpg"
                alt="AO"
                className="h-full w-full object-cover object-top grayscale contrast-125"
              />
            </div>
          )}

          <div
            className={`max-w-[85%] space-y-3 ${
              msg.role === 'user'
                ? 'border border-white/20 bg-white/[0.06] px-4 py-3 text-sm text-ink'
                : 'border border-white/[0.08] bg-charcoal/90 px-4 py-3.5 text-sm leading-relaxed text-ash'
            }`}
          >
            {msg.role === 'assistant' ? (
              <div
                className="space-y-3 break-words [&_p]:leading-relaxed [&_a]:break-all"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
              />
            ) : (
              <div className="whitespace-pre-wrap break-words">{msg.content}</div>
            )}

            {msg.markets && msg.markets.length > 0 && (
              <div className="grid grid-cols-1 gap-2 border-t border-white/10 pt-3 sm:grid-cols-2">
                {msg.markets.slice(0, 4).map((m, mIdx) => (
                  <a
                    key={mIdx}
                    href={m.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between border border-white/10 bg-obsidian/80 px-3 py-2 transition-colors hover:border-white/35"
                  >
                    <div>
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink">
                        <span>{m.symbol}</span>
                        <span className="text-[9px] uppercase text-muted">{m.source}</span>
                      </div>
                      <div className="font-mono text-[10px] text-muted">
                        Liq ${Math.round(m.liquidityUsd).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-xs text-ink">${m.priceUsd.toFixed(m.priceUsd < 1 ? 5 : 2)}</div>
                      <div className={`flex items-center justify-end gap-1 text-[10px] ${m.priceChange24h >= 0 ? 'text-ink' : 'text-muted'}`}>
                        <span>{m.priceChange24h >= 0 ? '+' : ''}{m.priceChange24h.toFixed(2)}%</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}

      {loading && (
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="h-7 w-7 overflow-hidden rounded-sm border border-white/20 bg-charcoal">
            <img src="/ao-logo.jpg" alt="AO" className="h-full w-full object-cover object-top grayscale" />
          </div>
          <span className="font-mono text-xs uppercase tracking-[0.16em] text-muted animate-pulse">
            AO is typing a response...
          </span>
        </div>
      )}
      </div>

      {showJump && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          aria-label="Jump to latest message"
          className="absolute bottom-4 left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/25 bg-charcoal/95 text-ink shadow-[0_6px_20px_rgba(0,0,0,0.7)] backdrop-blur-md transition-colors hover:border-white/50"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
