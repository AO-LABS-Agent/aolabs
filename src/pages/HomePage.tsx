import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { HeroDitherCanvas } from '../components/HeroDitherCanvas';
import { Footer } from '../components/Footer';

const STAGE_LABELS = [
  'AO · WALLET MEMORY',
  '01 · ON-CHAIN RECALL',
  '02 · STRATEGY GRAPH',
  '03 · MISTAKE GUARD',
  '04 · BEHAVIOR DRIFT',
  '05 · PERSONAL INSIGHTS',
];

const ENGINE_TICKER = [
  'ROBINHOOD CHAIN',
  'WALLET MEMORY',
  'STRATEGY GRAPH',
  'MISTAKE GUARD',
  'HABIT ENGINE',
  'BEHAVIOR AI',
];

export function HomePage() {
  const runwayRef = useRef<HTMLElement | null>(null);
  const [activeStage, setActiveStage] = useState(0);
  const [prevStage, setPrevStage] = useState(-1);
  const [hideScrollCue, setHideScrollCue] = useState(false);
  const [tickerIdx, setTickerIdx] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTickerIdx((i) => (i + 1) % ENGINE_TICKER.length);
    }, 2400);
    return () => window.clearInterval(id);
  }, []);

  const handleStageChange = useCallback((next: number, progress: number) => {
    setActiveStage((curr) => {
      if (curr !== next) setPrevStage(curr);
      return next;
    });
    setHideScrollCue(progress > 0.05 || next > 0);
  }, []);

  const jumpToStage = useCallback((stageIdx: number) => {
    const el = runwayRef.current;
    if (!el) return;
    const scrollable = Math.max(1, el.offsetHeight - window.innerHeight);
    window.scrollTo({ top: el.offsetTop + (stageIdx / 5) * scrollable, behavior: 'smooth' });
  }, []);

  const scrollToFooter = useCallback(() => {
    document.getElementById('site-footer')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const stageClass = (idx: number, centered = true) =>
    `stage-panel ${centered ? 'stage-centered' : ''} ${
      activeStage === idx ? 'is-active' : prevStage === idx ? 'is-exiting' : ''
    }`;

  return (
    <div className="min-h-screen bg-obsidian text-ink">
      <Navbar onJumpStage={jumpToStage} onScrollFooter={scrollToFooter} />

      <main ref={runwayRef} className="relative h-[650vh] w-full">
        <div className="monochrome-stage-bg sticky top-0 h-screen w-full overflow-hidden">
          <HeroDitherCanvas runwayRef={runwayRef} onStageChange={handleStageChange} />

          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/65 to-transparent lg:bg-gradient-to-r lg:from-obsidian lg:via-obsidian/70 lg:to-transparent" />
          <div className="film-grain absolute inset-0" />

          <div className="relative z-20 mx-auto flex h-full max-w-[1440px] flex-col justify-between px-5 pt-20 pb-8 sm:px-8 lg:px-12">
            {/* Top Status Bar */}
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="font-mono text-xs tracking-[0.2em] text-ink">
                  <span>{String(activeStage).padStart(2, '0')}</span>
                  <span className="text-muted"> / 05</span>
                </div>
                <div className="hidden h-px w-10 bg-white/15 sm:block" />
                <div className="hidden font-mono text-[11px] uppercase tracking-[0.2em] text-muted sm:block">
                  {STAGE_LABELS[activeStage]}
                </div>
              </div>

              <div className="flex items-center gap-1.5" role="tablist" aria-label="Scroll sections">
                {[0, 1, 2, 3, 4, 5].map((idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => jumpToStage(idx)}
                    aria-label={`Jump to section 0${idx}`}
                    className={`h-1.5 transition-all ${
                      activeStage === idx ? 'w-6 bg-white' : 'w-2.5 bg-white/25 hover:bg-white/60'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Left Narrative Stages */}
            <div className="relative flex-1 w-full max-w-xl">
              <section className={stageClass(0, false)}>
                <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
                  The wallet memory layer for Robinhood Chain
                </p>
                <h1 className="font-display text-4xl font-light leading-[1.06] tracking-[-0.03em] text-ink sm:text-5xl lg:text-[3.75rem]">
                  Your wallet remembers<br />everything.
                </h1>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-ash sm:text-[15px]">
                  AO builds persistent memory from your Robinhood Chain activity—remembering your strategies, transaction mistakes, trading habits, and behavioral shifts to deliver personal insights.
                </p>
              </section>

              <section className={stageClass(1)}>
                <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-muted">01 · MEMORY</p>
                <h2 className="font-display text-3xl font-light leading-[1.1] tracking-[-0.03em] text-ink sm:text-5xl">
                  Every move,<br />remembered.
                </h2>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-ash sm:text-[15px]">
                  AO reads your Robinhood Chain swaps, entries, exits, and contract interactions into structured wallet memory—turning raw on-chain history into context your AI recalls instantly.
                </p>
              </section>

              <section className={stageClass(2)}>
                <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-muted">02 · STRATEGIES</p>
                <h2 className="font-display text-3xl font-light leading-[1.1] tracking-[-0.03em] text-ink sm:text-5xl">
                  Knows how<br />you trade.
                </h2>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-ash sm:text-[15px]">
                  From conviction holds to rapid rotations, AO maps your recurring playbooks, position sizing habits, and timing edges alongside live liquidity from GeckoTerminal and DEX Screener.
                </p>
              </section>

              <section className={stageClass(3)}>
                <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-muted">03 · MISTAKES</p>
                <h2 className="font-display text-3xl font-light leading-[1.1] tracking-[-0.03em] text-ink sm:text-5xl">
                  Catch patterns<br />before they repeat.
                </h2>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-ash sm:text-[15px]">
                  Reverted transactions, gas leaks, over-approvals, and mistimed exits are surfaced in plain words—so AO warns you before an old habit costs you again.
                </p>
              </section>

              <section className={stageClass(4)}>
                <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.22em] text-muted">04 · BEHAVIOR</p>
                <h2 className="font-display text-3xl font-light leading-[1.1] tracking-[-0.03em] text-ink sm:text-5xl">
                  Tracks how<br />you evolve.
                </h2>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-ash sm:text-[15px]">
                  Markets shift and your conviction shifts with them. AO detects changes in risk tolerance, trading cadence, and token rotation to reveal blind spots as they form.
                </p>
              </section>

              <section className={stageClass(5)}>
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">05 · INSIGHTS</span>
                  <span className="bracket-box px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ash">
                    <span className="bracket-inner flex items-center gap-2">
                      <span className="text-muted">ENGINE</span>
                      <span className="min-w-[104px] text-ink ticker-animate">{ENGINE_TICKER[tickerIdx]}</span>
                    </span>
                  </span>
                </div>
                <h2 className="font-display text-3xl font-light leading-[1.1] tracking-[-0.03em] text-ink sm:text-5xl">
                  Personal intelligence<br />from day one.
                </h2>
                <p className="mt-5 max-w-md text-sm leading-relaxed text-ash sm:text-[15px]">
                  Open the dedicated AO Chat Space, sync your Robinhood Chain address once, and turn your on-chain history into a private, adaptive memory engine.
                </p>

                <div className="mt-7 flex flex-wrap items-center gap-3.5">
                  <Link
                    to="/chat"
                    className="inline-flex items-center gap-3 bg-ink px-5 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-obsidian transition-opacity hover:opacity-90"
                  >
                    <span className="text-obsidian/60">01</span>
                    <span>Open AO Chat</span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => jumpToStage(1)}
                    className="bracket-box border border-white/15 bg-charcoal/80 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] text-ink hover:bg-graphite"
                  >
                    <span className="bracket-inner flex items-center gap-3">
                      <span className="text-muted">02</span>
                      <span>Explore Memory</span>
                    </span>
                  </button>
                </div>
              </section>
            </div>

            {/* Clean Bottom Bar — Only SCROLL TO ENTER cue on Stage 00 */}
            <div className="flex items-end justify-center">
              <button
                type="button"
                onClick={() => jumpToStage(1)}
                className={`bracket-box px-4 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-ash transition-opacity duration-500 hover:text-ink ${
                  hideScrollCue ? 'pointer-events-none opacity-0' : 'opacity-100'
                }`}
              >
                <span className="bracket-inner flex items-center gap-2">
                  <span>Scroll to enter</span>
                  <span className="inline-block animate-bounce">↓</span>
                </span>
              </button>
            </div>
          </div>
        </div>
      </main>

      <Footer onJumpStage={jumpToStage} />
    </div>
  );
}
