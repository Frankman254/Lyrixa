import { useMemo, useRef, useEffect } from 'react';
import type { AudioPeak } from '../../core/types/audio';

export type { AudioPeak };

interface AudioWaveformTrackProps {
  duration: number;
  pxPerSecond: number;
  /** Real peak data (if already extracted). When omitted, a mock waveform is generated. */
  peaks?: AudioPeak[];
  height?: number;
  color?: string;
  /** Seed keeps the mock waveform stable between renders for the same track. */
  seed?: string;
}

/**
 * Deterministic PRNG so the mock waveform doesn't jitter between renders.
 * xmur3 + mulberry32 — tiny, non-crypto, good enough for visual noise.
 */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateMockPeaks(duration: number, samplesPerSecond: number, seed: string): AudioPeak[] {
  const rand = mulberry32(hashSeed(seed));
  const total = Math.max(1, Math.floor(duration * samplesPerSecond));
  const out: AudioPeak[] = new Array(total);
  let envelope = 0.4;
  for (let i = 0; i < total; i++) {
    const t = i / samplesPerSecond;
    // Slowly drifting envelope — creates "song dynamics" feel.
    envelope += (rand() - 0.5) * 0.08;
    envelope = Math.max(0.15, Math.min(0.95, envelope));
    const beat = 0.25 + 0.75 * Math.abs(Math.sin(t * Math.PI * 1.8));
    const jitter = 0.4 + rand() * 0.6;
    const amp = Math.min(1, envelope * beat * jitter);
    out[i] = { time: t, amplitude: amp };
  }
  return out;
}

export function AudioWaveformTrack({
  duration,
  pxPerSecond,
  peaks,
  height = 72,
  color = '#53c2f0',
  seed = 'default'
}: AudioWaveformTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const resolvedPeaks = useMemo<AudioPeak[]>(() => {
    if (peaks && peaks.length > 0) return peaks;
    return generateMockPeaks(Math.max(duration, 1), 20, seed);
  }, [peaks, duration, seed]);

  const totalWidth = Math.max(duration, 1) * pxPerSecond;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(totalWidth * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, totalWidth, height);

    const midY = height / 2;

    // Fill envelope with gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `${color}55`);
    gradient.addColorStop(0.5, `${color}aa`);
    gradient.addColorStop(1, `${color}55`);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(0, midY);

    for (let i = 0; i < resolvedPeaks.length; i++) {
      const p = resolvedPeaks[i]!;
      const x = p.time * pxPerSecond;
      const h = p.amplitude * (height / 2) * 0.9;
      ctx.lineTo(x, midY - h);
    }
    for (let i = resolvedPeaks.length - 1; i >= 0; i--) {
      const p = resolvedPeaks[i]!;
      const x = p.time * pxPerSecond;
      const h = p.amplitude * (height / 2) * 0.9;
      ctx.lineTo(x, midY + h);
    }
    ctx.closePath();
    ctx.fill();

    // Center baseline
    ctx.strokeStyle = `${color}44`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(totalWidth, midY);
    ctx.stroke();
  }, [resolvedPeaks, totalWidth, height, color, pxPerSecond]);

  return (
    <div className="tl-waveform" style={{ width: `${totalWidth}px`, height: `${height}px` }}>
      <canvas
        ref={canvasRef}
        style={{ width: `${totalWidth}px`, height: `${height}px`, display: 'block' }}
      />
    </div>
  );
}
