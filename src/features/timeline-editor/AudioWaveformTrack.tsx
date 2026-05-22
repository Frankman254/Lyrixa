import { memo, useMemo, useRef, useEffect } from 'react';
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
  /** Left edge of the visible lane viewport, in lane pixels. */
  visibleStartPx?: number;
  /** Visible viewport width, in pixels. */
  visibleWidthPx?: number;
}

const TARGET_WAVEFORM_CHUNK_SECONDS = 45;
const MAX_WAVEFORM_SEGMENT_WIDTH = 4_800;
const MAX_WAVEFORM_BITMAP_WIDTH = 4_096;
const MIN_OVERSCAN_PX = 360;

function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export const AudioWaveformTrack = memo(function AudioWaveformTrack({
  duration,
  pxPerSecond,
  peaks,
  height = 72,
  color = '#53c2f0',
  seed = 'default',
  visibleStartPx = 0,
  visibleWidthPx = 2000
}: AudioWaveformTrackProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const totalWidth = Math.max(duration, 1) * pxPerSecond;
  const overscanPx = Math.max(MIN_OVERSCAN_PX, visibleWidthPx * 0.25);
  const visibleEndPx = visibleStartPx + visibleWidthPx;
  const desiredChunkWidth = Math.min(
    TARGET_WAVEFORM_CHUNK_SECONDS * pxPerSecond,
    MAX_WAVEFORM_SEGMENT_WIDTH
  );
  const minSegmentWidth = visibleWidthPx + overscanPx * 2;
  const targetSegmentWidth = Math.min(
    Math.max(minSegmentWidth, desiredChunkWidth),
    Math.max(minSegmentWidth, MAX_WAVEFORM_SEGMENT_WIDTH)
  );
  const pageStepPx = Math.max(visibleWidthPx, targetSegmentWidth * 0.5);
  const rawSegmentStartPx = Math.max(0, visibleStartPx - overscanPx);
  const segmentStartPx = Math.max(
    0,
    Math.min(totalWidth, Math.floor(rawSegmentStartPx / pageStepPx) * pageStepPx)
  );
  const segmentEndPx = Math.max(
    segmentStartPx + 1,
    Math.min(totalWidth, Math.max(segmentStartPx + targetSegmentWidth, visibleEndPx + overscanPx))
  );
  const segmentWidth = Math.max(1, segmentEndPx - segmentStartPx);
  const bitmapWidth = Math.max(1, Math.min(segmentWidth, MAX_WAVEFORM_BITMAP_WIDTH));
  const xScale = bitmapWidth / segmentWidth;
  const startTime = segmentStartPx / pxPerSecond;
  const endTime = segmentEndPx / pxPerSecond;

  const resolvedPeaks = useMemo<AudioPeak[]>(() => {
    if (peaks && peaks.length > 0) {
      const padSeconds = Math.max(1, 4 / pxPerSecond);
      return peaks.filter(peak =>
        peak.time >= startTime - padSeconds && peak.time <= endTime + padSeconds
      );
    }
    return generateMockPeaksForRange(startTime, endTime, pxPerSecond, seed);
  }, [peaks, startTime, endTime, pxPerSecond, seed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.floor(bitmapWidth * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, bitmapWidth, height);

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
      const x = (p.time * pxPerSecond - segmentStartPx) * xScale;
      const h = p.amplitude * (height / 2) * 0.9;
      ctx.lineTo(x, midY - h);
    }
    for (let i = resolvedPeaks.length - 1; i >= 0; i--) {
      const p = resolvedPeaks[i]!;
      const x = (p.time * pxPerSecond - segmentStartPx) * xScale;
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
    ctx.lineTo(bitmapWidth, midY);
    ctx.stroke();
  }, [resolvedPeaks, segmentStartPx, bitmapWidth, height, color, pxPerSecond, xScale]);

  return (
    <div className="tl-waveform" style={{ width: `${totalWidth}px`, height: `${height}px` }}>
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          left: `${segmentStartPx}px`,
          width: `${segmentWidth}px`,
          height: `${height}px`,
          display: 'block'
        }}
      />
    </div>
  );
});

function generateMockPeaksForRange(
  startTime: number,
  endTime: number,
  pxPerSecond: number,
  seed: string
): AudioPeak[] {
  const samplesPerSecond = Math.max(16, Math.min(80, Math.ceil(pxPerSecond * 0.6)));
  const startIndex = Math.max(0, Math.floor(startTime * samplesPerSecond));
  const endIndex = Math.max(startIndex + 1, Math.ceil(endTime * samplesPerSecond));
  const out: AudioPeak[] = new Array(endIndex - startIndex + 1);

  for (let i = startIndex; i <= endIndex; i += 1) {
    const t = i / samplesPerSecond;
    const amp = deterministicMockAmplitude(t, seed);
    out[i - startIndex] = { time: t, amplitude: amp };
  }
  return out;
}

function deterministicMockAmplitude(time: number, seed: string): number {
  const seedHash = hashSeed(seed);
  const slow = 0.52 + 0.28 * Math.sin(time * 0.17 + (seedHash % 97));
  const beat = 0.25 + 0.75 * Math.abs(Math.sin(time * Math.PI * 1.8));
  const texture = pseudoNoise(Math.floor(time * 18), seedHash) * 0.42 + 0.58;
  return Math.max(0.08, Math.min(1, slow * beat * texture));
}

function pseudoNoise(index: number, seed: number): number {
  let x = (index + 1) ^ seed;
  x = Math.imul(x ^ (x >>> 16), 2246822507);
  x = Math.imul(x ^ (x >>> 13), 3266489909);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967295;
}
