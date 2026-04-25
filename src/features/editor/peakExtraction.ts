import type { AudioPeak } from '../../core/types/audio';

export interface ExtractPeaksOptions {
  /** How dense the peaks should be. Default: 25/s — enough for activity detection. */
  peaksPerSecond?: number;
}

/**
 * Decode an audio Blob and produce a downsampled peak array.
 *
 * Returns null when decoding fails (unsupported codec, corrupt file, no Web
 * Audio support). Callers should treat null as "no real peaks available" and
 * fall back to the mock waveform.
 *
 * Decoding happens in a fresh, short-lived AudioContext that is closed
 * immediately afterward — extraction does not interfere with playback.
 */
export async function extractPeaksFromBlob(
  blob: Blob,
  options: ExtractPeaksOptions = {}
): Promise<AudioPeak[] | null> {
  const { peaksPerSecond = 25 } = options;
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || (window as any).webkitAudioContext;
  if (!Ctor) return null;

  let ctx: AudioContext | null = null;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    ctx = new Ctor();
    const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

    const sampleRate = buffer.sampleRate;
    const channels = buffer.numberOfChannels;
    const totalSamples = buffer.length;
    const samplesPerPeak = Math.max(1, Math.floor(sampleRate / peaksPerSecond));
    const totalPeaks = Math.max(1, Math.floor(totalSamples / samplesPerPeak));

    // Read all channels once to avoid copying inside the inner loop.
    const data: Float32Array[] = [];
    for (let c = 0; c < channels; c++) data.push(buffer.getChannelData(c));

    const peaks: AudioPeak[] = new Array(totalPeaks);
    for (let p = 0; p < totalPeaks; p++) {
      const start = p * samplesPerPeak;
      const end = Math.min(start + samplesPerPeak, totalSamples);
      let max = 0;
      for (let i = start; i < end; i++) {
        let acc = 0;
        for (let c = 0; c < channels; c++) acc += Math.abs(data[c]![i]!);
        const v = acc / channels;
        if (v > max) max = v;
      }
      peaks[p] = { time: p / peaksPerSecond, amplitude: Math.min(1, max) };
    }
    return peaks;
  } catch (err) {
    console.warn('[Lyrixa] Peak extraction failed:', err);
    return null;
  } finally {
    if (ctx && typeof ctx.close === 'function') {
      try { await ctx.close(); } catch { /* ignore */ }
    }
  }
}
