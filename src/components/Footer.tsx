import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

interface FooterProps {
  onJumpStage?: (stage: number) => void;
}

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function Footer({ onJumpStage }: FooterProps) {
  const ditherRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const draw = () => {
      const c = ditherRef.current;
      if (!c) return;
      const w = c.clientWidth || window.innerWidth;
      const h = c.clientHeight || 96;
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return;

      ctx.fillStyle = '#070709';
      ctx.fillRect(0, 0, w, h);

      const cell = 4;
      for (let y = 0; y < h; y += cell) {
        const vRatio = y / h;
        for (let x = 0; x < w; x += cell) {
          const hBias = Math.max(0, 1 - (x / w) * 1.15);
          const threshold = (BAYER4[(y / cell) % 4][(x / cell) % 4] + 0.5) / 16;
          const density = Math.sin(vRatio * Math.PI) * (0.14 + hBias * 0.24);
          if (density > threshold) {
            ctx.fillStyle = 'rgba(244, 244, 245, 0.14)';
            ctx.fillRect(x, y, cell - 1, cell - 1);
          }
        }
      }
    };

    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, []);

  return (
    <>
      <div className="relative h-24 w-full overflow-hidden bg-obsidian">
        <canvas ref={ditherRef} className="block h-full w-full" />
      </div>

      <footer id="site-footer" className="border-t border-white/[0.08] bg-obsidian px-5 pt-14 pb-12 sm:px-8 lg:px-12">
        <div className="mx-auto max-w-[1440px]">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 overflow-hidden rounded-sm border border-white/20 bg-charcoal">
                  <img
                    src="/ao-logo.jpg"
                    alt="AO Footer Logo"
                    className="h-full w-full object-cover object-top grayscale contrast-125"
                  />
                </div>
                <span className="font-display text-sm font-medium tracking-[0.22em] text-ink">AOLABS</span>
              </div>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
                AO is the persistent wallet memory AI built exclusively for Robinhood Chain.
              </p>
              <div className="mt-6 flex flex-col gap-2 font-mono text-xs text-ash">
                <a href="https://robinhoodchain.blockscout.com/" target="_blank" rel="noreferrer" className="w-fit transition-colors hover:text-ink">
                  Robinhood Chain Explorer ↗
                </a>
                <a href="https://x.com/aolabsxyz" target="_blank" rel="noreferrer" className="w-fit transition-colors hover:text-ink">
                  Contact on X ↗
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:grid-cols-5 lg:col-span-8">
              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Product</h3>
                <ul className="mt-4 space-y-2.5 text-xs text-ash">
                  <li><button type="button" onClick={() => onJumpStage?.(1)} className="hover:text-ink">Wallet memory</button></li>
                  <li><button type="button" onClick={() => onJumpStage?.(2)} className="hover:text-ink">Strategy graph</button></li>
                  <li><button type="button" onClick={() => onJumpStage?.(3)} className="hover:text-ink">Mistake alerts</button></li>
                  <li><button type="button" onClick={() => onJumpStage?.(4)} className="hover:text-ink">Behavior shifts</button></li>
                </ul>
              </div>

              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Workspace</h3>
                <ul className="mt-4 space-y-2.5 text-xs text-ash">
                  <li><Link to="/chat" className="hover:text-ink">AO Chat Space</Link></li>
                  <li><Link to="/chat" className="hover:text-ink">Sync Wallet</Link></li>
                  <li><Link to="/chat" className="hover:text-ink">Market Intelligence</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Network</h3>
                <ul className="mt-4 space-y-2.5 text-xs text-ash">
                  <li><a href="https://robinhoodchain.blockscout.com/" target="_blank" rel="noreferrer" className="hover:text-ink">Blockscout (4663)</a></li>
                  <li><a href="https://www.geckoterminal.com/" target="_blank" rel="noreferrer" className="hover:text-ink">GeckoTerminal</a></li>
                  <li><a href="https://dexscreener.com/" target="_blank" rel="noreferrer" className="hover:text-ink">DEX Screener</a></li>
                </ul>
              </div>

              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Company</h3>
                <ul className="mt-4 space-y-2.5 text-xs text-ash">
                  <li><button type="button" onClick={() => onJumpStage?.(0)} className="hover:text-ink">About AOLABS</button></li>
                  <li><a href="https://aolabs.xyz" target="_blank" rel="noreferrer" className="hover:text-ink">aolabs.xyz</a></li>
                  <li><a href="https://github.com/AO-LABS-Agent/aolabs" target="_blank" rel="noreferrer" className="hover:text-ink">GitHub — AOLABS framework</a></li>
                  <li><a href="https://x.com/aolabsxyz" target="_blank" rel="noreferrer" className="hover:text-ink">X</a></li>
                </ul>
              </div>

              <div>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">Legal</h3>
                <ul className="mt-4 space-y-2.5 text-xs text-ash">
                  <li><span className="text-muted">Private by default</span></li>
                  <li><span className="text-muted">Read-only wallet sync</span></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-14 flex flex-col items-start justify-between gap-3 border-t border-white/[0.06] pt-6 font-mono text-[11px] text-muted sm:flex-row sm:items-center">
            <span>© 2026 AOLABS</span>
            <span>AOLABS builds persistent wallet memory and personal on-chain intelligence with AO.</span>
          </div>
        </div>
      </footer>
    </>
  );
}
