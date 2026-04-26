import type { AudioPeak, AudioBandMode } from '../../core/types/audio';

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

interface BandFilterSpec {
  type: BiquadFilterType;
  frequency: number;
  Q?: number;
}

const BAND_FILTER_SPECS: Partial<Record<AudioBandMode, BandFilterSpec[]>> = {
  vocals:       [{ type: 'bandpass', frequency: 2000, Q: 0.5 }],
  instrumental: [{ type: 'notch',    frequency: 1500, Q: 0.4 }],
  bass:         [{ type: 'lowpass',  frequency: 300,  Q: 0.8 }],
  kick:         [{ type: 'bandpass', frequency: 80,   Q: 3   }],
  hihat:        [{ type: 'highpass', frequency: 8000, Q: 0.8 }],
};

/**
 * Decode the blob, run it through a biquad filter chain for the given band
 * mode, and return downsampled peaks from the filtered output.
 *
 * Returns null for 'auto'/'full-mix' (caller should use existing peaks) or
 * when decoding/rendering fails.
 */
export async function extractBandPeaksFromBlob(
  blob: Blob,
  mode: AudioBandMode,
  options: ExtractPeaksOptions = {}
): Promise<AudioPeak[] | null> {
  const filterSpecs = BAND_FILTER_SPECS[mode];
  if (!filterSpecs) return null;

  const { peaksPerSecond = 25 } = options;
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;

  let decodeCtx: AudioContext | null = null;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    decodeCtx = new AudioCtx();
    const inputBuffer = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    await decodeCtx.close();
    decodeCtx = null;

    const offlineCtx = new OfflineAudioContext(
      inputBuffer.numberOfChannels,
      inputBuffer.length,
      inputBuffer.sampleRate
    );
    const source = offlineCtx.createBufferSource();
    source.buffer = inputBuffer;

    let lastNode: AudioNode = source;
    for (const spec of filterSpecs) {
      const filter = offlineCtx.createBiquadFilter();
      filter.type = spec.type;
      filter.frequency.value = spec.frequency;
      if (spec.Q != null) filter.Q.value = spec.Q;
      lastNode.connect(filter);
      lastNode = filter;
    }
    lastNode.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();

    const sampleRate  = rendered.sampleRate;
    const channels    = rendered.numberOfChannels;
    const totalSamples = rendered.length;
    const samplesPerPeak = Math.max(1, Math.floor(sampleRate / peaksPerSecond));
    const totalPeaks = Math.max(1, Math.floor(totalSamples / samplesPerPeak));

    const data: Float32Array[] = [];
    for (let c = 0; c < channels; c++) data.push(rendered.getChannelData(c));

    const peaks: AudioPeak[] = new Array(totalPeaks);
    for (let p = 0; p < totalPeaks; p++) {
      const start = p * samplesPerPeak;
      const end   = Math.min(start + samplesPerPeak, totalSamples);
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
    console.warn('[Lyrixa] Band peak extraction failed:', err);
    return null;
  } finally {
    if (decodeCtx && typeof decodeCtx.close === 'function') {
      try { await decodeCtx.close(); } catch { /* ignore */ }
    }
  }
}
