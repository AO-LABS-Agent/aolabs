import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe } from 'lucide-react';

interface NavbarProps {
  onJumpStage?: (stage: number) => void;
  onScrollFooter?: () => void;
}

function WebsiteIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return <Globe className={className} />;
}

function XLogoIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function GitHubLogoIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
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

export function Navbar({ onJumpStage, onScrollFooter }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.06] bg-obsidian/75 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link
          to="/"
          onClick={() => onJumpStage?.(0)}
          className="group flex items-center gap-3 text-left focus:outline-none"
        >
          <div className="relative h-8 w-8 overflow-hidden rounded-sm border border-white/20 bg-charcoal">
            <img
              src="/ao-logo.jpg"
              alt="AO by AOLABS"
              className="h-full w-full object-cover object-top grayscale contrast-125 transition-transform duration-300 group-hover:scale-110"
            />
          </div>
          <span className="font-display text-sm font-medium tracking-[0.22em] text-ink">AOLABS</span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          <button
            type="button"
            onClick={() => onJumpStage?.(1)}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
          >
            Memory
          </button>
          <button
            type="button"
            onClick={() => onJumpStage?.(2)}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
          >
            Strategies
          </button>
          <button
            type="button"
            onClick={() => onJumpStage?.(3)}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
          >
            Mistakes
          </button>
          <button
            type="button"
            onClick={() => onJumpStage?.(5)}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
          >
            Insights
          </button>
          <button
            type="button"
            onClick={() => onScrollFooter?.()}
            className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted transition-colors hover:text-ink"
          >
            Company
          </button>
        </nav>

        <div className="flex items-center gap-2.5">
          {/* X, website & GitHub links */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <a
              href="https://x.com/aolabsxyz"
              target="_blank"
              rel="noreferrer"
              aria-label="X"
              title="X"
              className="inline-flex h-8 w-8 items-center justify-center border border-white/15 bg-charcoal/60 text-ash transition-colors hover:border-white/40 hover:text-ink"
            >
              <XLogoIcon />
            </a>
            <a
              href="https://aolabs.xyz"
              target="_blank"
              rel="noreferrer"
              aria-label="AOLABS website"
              title="aolabs.xyz"
              className="inline-flex h-8 w-8 items-center justify-center border border-white/15 bg-charcoal/60 text-ash transition-colors hover:border-white/40 hover:text-ink"
            >
              <WebsiteIcon />
            </a>
            <a
              href="https://github.com/AO-LABS-Agent/aolabs"
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              title="GitHub"
              className="inline-flex h-8 w-8 items-center justify-center border border-white/15 bg-charcoal/60 text-ash transition-colors hover:border-white/40 hover:text-ink"
            >
              <GitHubLogoIcon className="h-4 w-4" />
            </a>
          </div>

          <Link
            to="/chat"
            className="bracket-box hidden px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-ink hover:bg-white/[0.04] sm:inline-flex"
          >
            <span className="bracket-inner flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-ink" />
              <span>AO CHAT</span>
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileOpen}
            className="bracket-box px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.15em] text-ink md:hidden"
          >
            <span className="bracket-inner">{mobileOpen ? 'CLOSE' : 'MENU'}</span>
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-obsidian/95 px-6 py-5 backdrop-blur-xl md:hidden">
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => {
                onJumpStage?.(1);
                setMobileOpen(false);
              }}
              className="text-left font-mono text-xs uppercase tracking-[0.18em] text-ash hover:text-ink"
            >
              01 · Memory
            </button>
            <button
              type="button"
              onClick={() => {
                onJumpStage?.(2);
                setMobileOpen(false);
              }}
              className="text-left font-mono text-xs uppercase tracking-[0.18em] text-ash hover:text-ink"
            >
              02 · Strategies
            </button>
            <button
              type="button"
              onClick={() => {
                onJumpStage?.(3);
                setMobileOpen(false);
              }}
              className="text-left font-mono text-xs uppercase tracking-[0.18em] text-ash hover:text-ink"
            >
              03 · Mistakes
            </button>
            <button
              type="button"
              onClick={() => {
                onJumpStage?.(5);
                setMobileOpen(false);
              }}
              className="text-left font-mono text-xs uppercase tracking-[0.18em] text-ash hover:text-ink"
            >
              04 · Insights
            </button>
            <div className="flex items-center gap-2 pt-1">
              <a
                href="https://x.com/aolabsxyz"
                target="_blank"
                rel="noreferrer"
                aria-label="X"
                title="X"
                className="inline-flex h-9 w-9 items-center justify-center border border-white/15 bg-charcoal text-ash hover:border-white/40 hover:text-ink"
              >
                <XLogoIcon />
              </a>
              <a
                href="https://aolabs.xyz"
                target="_blank"
                rel="noreferrer"
                aria-label="AOLABS website"
                title="aolabs.xyz"
                className="inline-flex h-9 w-9 items-center justify-center border border-white/15 bg-charcoal text-ash hover:border-white/40 hover:text-ink"
              >
                <WebsiteIcon />
              </a>
              <a
                href="https://github.com/AO-LABS-Agent/aolabs"
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                title="GitHub"
                className="inline-flex h-9 w-9 items-center justify-center border border-white/15 bg-charcoal text-ash hover:border-white/40 hover:text-ink"
              >
                <GitHubLogoIcon className="h-4 w-4" />
              </a>
              <Link
                to="/chat"
                onClick={() => setMobileOpen(false)}
                className="inline-flex items-center gap-2 bg-ink px-4 py-2 font-mono text-xs font-medium uppercase tracking-[0.16em] text-obsidian"
              >
                Launch AO Chat
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
