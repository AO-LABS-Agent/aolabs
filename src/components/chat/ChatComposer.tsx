import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';

interface ChatComposerProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function ChatComposer({ disabled, onSend }: ChatComposerProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow the textarea so the placeholder and long messages are never
  // clipped mid-line on narrow screens (capped at ~5 lines).
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [value]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  return (
    <div className="shrink-0 border-t border-white/[0.08] bg-obsidian/90 px-4 py-3 sm:px-8 sm:py-4">
      <div className="mx-auto flex max-w-3xl items-end gap-2 border border-white/15 bg-charcoal p-2 focus-within:border-white/45">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Ask AO about your strategies, mistakes, habits, or $TOKEN markets..."
          className="max-h-36 min-w-0 flex-1 resize-none overflow-hidden bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none"
        />
        <button
          type="button"
          disabled={disabled || !value.trim()}
          onClick={submit}
          aria-label="Send message to AO"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center bg-ink text-obsidian transition-opacity hover:opacity-90 disabled:opacity-35"
        >
          <ArrowUp className="h-4 w-4" />
        </button>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center font-mono text-[10px] tracking-[0.12em] text-muted">
        AO ANALYZES ROBINHOOD CHAIN MEMORY &amp; LIVE DEX FEEDS · ANALYTICAL INSIGHTS ONLY, NOT FINANCIAL ADVICE
      </p>
    </div>
  );
}
