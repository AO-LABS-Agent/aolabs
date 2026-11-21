import { useEffect, useRef } from 'react';

interface HeroDitherCanvasProps {
  runwayRef: React.RefObject<HTMLElement | null>;
  onStageChange: (stage: number, progress: number) => void;
}

const FRAME_SRCS = [
  '/frames/ao-01.jpg',
  '/frames/ao-02.jpg',
  '/frames/ao-03.jpg',
  '/frames/ao-04.jpg',
  '/frames/ao-05.jpg',
  '/frames/ao-06.jpg',
];

const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

// Locked production parameters: Full Dither + Smooth scrubbing
const SMOOTH_DAMPING = 0.07;
const VIRTUAL_FRAMES = 60;

export function HeroDitherCanvas({ runwayRef, onStageChange }: HeroDitherCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufA = document.createElement('canvas');
    const ctxA = bufA.getContext('2d')!;
    const bufB = document.createElement('canvas');
    const ctxB = bufB.getContext('2d')!;
    const bufOut = document.createElement('canvas');
    const ctxOut = bufOut.getContext('2d')!;

    let targetProgress = 0;
    let smoothProgress = 0;
    let lastFrameIdx = -1;
    let lastStage = -1;
    let rafId = 0;

    const images: HTMLImageElement[] = FRAME_SRCS.map((src) => {
      const img = new Image();
      img.onload = () => {
        lastFrameIdx = -1;
      };
      img.src = src;
      return img;
    });

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

    const getDrawRect = (img: HTMLImageElement, w: number, h: number) => {
      const isDesktop = w >= 1024;
      const maxW = isDesktop ? w * 0.52 : w * 0.94;
      const maxH = isDesktop ? h * 0.94 : h * 0.84;
      const aspect = (img.naturalWidth || 3) / (img.naturalHeight || 4);
      let drawW = maxW;
      let drawH = drawW / aspect;
      if (drawH > maxH) {
        drawH = maxH;
        drawW = drawH * aspect;
      }
      const dx = isDesktop ? w * 0.68 - drawW * 0.5 : (w - drawW) * 0.5;
      const dy = isDesktop ? h - drawH : h * 0.5 - drawH * 0.5;
      return { dx, dy, drawW, drawH };
    };

    const drawFullDitherFrame = (p: number) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);

      // Subtle rotating monochrome telemetry ring behind AO
      const isDesktop = w >= 1024;
      const cx = isDesktop ? w * 0.68 : w * 0.5;
      const cy = h * 0.48;
      const r = Math.min(w, h) * (isDesktop ? 0.30 : 0.34);

      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.rotate(p * Math.PI * 1.6);
      ctx.setLineDash([4, 12]);
      ctx.strokeStyle = 'rgba(244,244,245,0.14)';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      const maxIdx = images.length - 1;
      const exact = p * maxIdx;
      const idxA = clamp(Math.floor(exact), 0, maxIdx);
      const idxB = clamp(idxA + 1, 0, maxIdx);
      const blend = exact - idxA;

      const imgA = images[idxA];
      const imgB = images[idxB]?.complete ? images[idxB] : imgA;
      if (!imgA || !imgA.complete || !imgA.naturalWidth) return;

      const rect = getDrawRect(imgA, w, h);
      const bw = 300;
      const bh = Math.round(bw * (rect.drawH / Math.max(1, rect.drawW)));

      if (bufA.width !== bw || bufA.height !== bh) {
        bufA.width = bufB.width = bufOut.width = bw;
        bufA.height = bufB.height = bufOut.height = bh;
      }

      ctxA.clearRect(0, 0, bw, bh);
      ctxA.drawImage(imgA, 0, 0, bw, bh);
      ctxB.clearRect(0, 0, bw, bh);
      ctxB.drawImage(imgB, 0, 0, bw, bh);

      const dataA = ctxA.getImageData(0, 0, bw, bh).data;
      const dataB = ctxB.getImageData(0, 0, bw, bh).data;
      const outImg = ctxOut.createImageData(bw, bh);
      const out = outImg.data;

      // Full Bayer 4x4 ordered monochrome dithering across every frame
      for (let y = 0; y < bh; y++) {
        const row = BAYER4[y & 3];
        for (let x = 0; x < bw; x++) {
          const idx = (y * bw + x) * 4;
          const threshold = (row[x & 3] + 0.5) / 16;
          const useB = blend > threshold;
          const rVal = useB ? dataB[idx] : dataA[idx];
          const gVal = useB ? dataB[idx + 1] : dataA[idx + 1];
          const bVal = useB ? dataB[idx + 2] : dataA[idx + 2];
          const lum = (0.299 * rVal + 0.587 * gVal + 0.114 * bVal) / 255;
          const on = lum > threshold * 0.9;
          out[idx] = on ? 236 : 7;
          out[idx + 1] = on ? 236 : 7;
          out[idx + 2] = on ? 240 : 9;
          out[idx + 3] = 255;
        }
      }
      ctxOut.putImageData(outImg, 0, 0);

      ctx.save();
      ctx.globalCompositeOperation = 'lighten';
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bufOut, rect.dx, rect.dy, rect.drawW, rect.drawH);
      ctx.restore();

      const fadeH = h * 0.16;
      const botGrad = ctx.createLinearGradient(0, h - fadeH, 0, h);
      botGrad.addColorStop(0, 'rgba(7,7,9,0)');
      botGrad.addColorStop(1, 'rgba(7,7,9,1)');
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, h - fadeH, w, fadeH);
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastFrameIdx = -1;
    };

    const onScroll = () => {
      const el = runwayRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = Math.max(1, el.offsetHeight - window.innerHeight);
      targetProgress = clamp(-rect.top / scrollable, 0, 1);
    };

    const tick = () => {
      smoothProgress += (targetProgress - smoothProgress) * SMOOTH_DAMPING;
      if (Math.abs(targetProgress - smoothProgress) < 0.0002) {
        smoothProgress = targetProgress;
      }

      const frameIdx = clamp(Math.round(smoothProgress * (VIRTUAL_FRAMES - 1)), 0, VIRTUAL_FRAMES - 1);
      const snappedStage = clamp(Math.round(smoothProgress * 5), 0, 5);

      if (snappedStage !== lastStage) {
        lastStage = snappedStage;
        onStageChange(snappedStage, smoothProgress);
      }

      if (frameIdx !== lastFrameIdx) {
        lastFrameIdx = frameIdx;
        drawFullDitherFrame(smoothProgress);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    resize();
    onScroll();
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', onScroll, { passive: true });
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [runwayRef, onStageChange]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />;
}
