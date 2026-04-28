import type { AudioPeak } from '../../core/types/audio';

export interface ExtractedVocals {
  blob: Blob;
  duration: number;
  peaks: AudioPeak[];
}

interface VocalIsolationOptions {
  peaksPerSecond?: number;
}

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & typeof globalThis & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

/**
 * Browser-side vocal focus pass.
 *
 * This is not neural stem separation. It keeps center-channel material from
 * stereo mixes, then filters toward the vocal band. The result is good enough
 * for timing analysis and rough auditioning, but not Virtual DJ/Demucs quality.
 */
export async function extractVocalsFromMasterBlob(
  blob: Blob,
  options: VocalIsolationOptions = {}
): Promise<ExtractedVocals> {
  const { peaksPerSecond = 25 } = options;
  const AudioCtx = getAudioContextCtor();
  if (!AudioCtx || typeof OfflineAudioContext === 'undefined') {
    throw new Error('Web Audio offline rendering is not available in this browser.');
  }

  let decodeCtx: AudioContext | null = null;
  try {
    const arrayBuffer = await blob.arrayBuffer();
    decodeCtx = new AudioCtx();
    const input = await decodeCtx.decodeAudioData(arrayBuffer.slice(0));
    await decodeCtx.close();
    decodeCtx = null;

    const mono = createCenterChannelBuffer(input);
    const rendered = await renderVocalFilterChain(mono);
    normalizeBuffer(rendered, 0.96);

    return {
      blob: encodeWavBlob(rendered),
      duration: rendered.duration,
      peaks: extractPeaksFromAudioBuffer(rendered, peaksPerSecond)
    };
  } finally {
    if (decodeCtx && typeof decodeCtx.close === 'function') {
      try { await decodeCtx.close(); } catch { /* ignore */ }
    }
  }
}

function createCenterChannelBuffer(input: AudioBuffer): AudioBuffer {
  const sampleRate = input.sampleRate;
  const mono = new AudioBuffer({
    length: input.length,
    numberOfChannels: 1,
    sampleRate
  });
  const output = mono.getChannelData(0);

  if (input.numberOfChannels === 1) {
    output.set(input.getChannelData(0));
    return mono;
  }

  const left = input.getChannelData(0);
  const right = input.getChannelData(1);
  for (let i = 0; i < input.length; i++) {
    // Center extraction: material shared by L/R is favored; wide side content
    // is naturally reduced because it is not copied into the mono mid channel.
    output[i] = ((left[i] ?? 0) + (right[i] ?? 0)) * 0.5;
  }

  return mono;
}

async function renderVocalFilterChain(input: AudioBuffer): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(1, input.length, input.sampleRate);
  const source = ctx.createBufferSource();
  source.buffer = input;

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 120;
  highpass.Q.value = 0.7;

  const lowShelf = ctx.createBiquadFilter();
  lowShelf.type = 'lowshelf';
  lowShelf.frequency.value = 280;
  lowShelf.gain.value = -8;

  const presence = ctx.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 1800;
  presence.Q.value = 1.1;
  presence.gain.value = 3.5;

  const clarity = ctx.createBiquadFilter();
  clarity.type = 'peaking';
  clarity.frequency.value = 3600;
  clarity.Q.value = 1.0;
  clarity.gain.value = 2.5;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 9200;
  lowpass.Q.value = 0.8;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -28;
  compressor.knee.value = 18;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.18;

  source
    .connect(highpass)
    .connect(lowShelf)
    .connect(presence)
    .connect(clarity)
    .connect(lowpass)
    .connect(compressor)
    .connect(ctx.destination);
  source.start(0);

  return ctx.startRendering();
}

function normalizeBuffer(buffer: AudioBuffer, targetPeak: number): void {
  let peak = 0;
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    peak = Math.max(peak, Math.abs(data[i] ?? 0));
  }
  if (peak <= 0) return;
  const gain = Math.min(8, targetPeak / peak);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.max(-1, Math.min(1, (data[i] ?? 0) * gain));
  }
}

function extractPeaksFromAudioBuffer(buffer: AudioBuffer, peaksPerSecond: number): AudioPeak[] {
  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;
  const samplesPerPeak = Math.max(1, Math.floor(sampleRate / peaksPerSecond));
  const totalPeaks = Math.max(1, Math.floor(totalSamples / samplesPerPeak));
  const data = buffer.getChannelData(0);

  const peaks: AudioPeak[] = new Array(totalPeaks);
  for (let p = 0; p < totalPeaks; p++) {
    const start = p * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, totalSamples);
    let max = 0;
    for (let i = start; i < end; i++) {
      max = Math.max(max, Math.abs(data[i] ?? 0));
    }
    peaks[p] = { time: p / peaksPerSecond, amplitude: Math.min(1, max) };
  }
  return peaks;
}

function encodeWavBlob(buffer: AudioBuffer): Blob {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const wav = new ArrayBuffer(44 + data.length * bytesPerSample);
  const view = new DataView(wav);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + data.length * bytesPerSample, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, data.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++, offset += 2) {
    const sample = Math.max(-1, Math.min(1, data[i] ?? 0));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Blob([wav], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
