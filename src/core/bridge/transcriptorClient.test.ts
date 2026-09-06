import { describe, expect, it, vi } from 'vitest';
import { TranscriptorClient } from './transcriptorClient';
import {
  DEFAULT_TRANSCRIPTOR_BASE_URL,
  readRequestedJobId,
  resolveBridgeEndpoints,
  TRANSCRIPTOR_BASE_URL_STORAGE_KEY
} from './bridgeConfig';

const BASE = '/transcriptor';

const JOB_RECORD = {
  id: 'job-1',
  title: 'Kimi no na wa',
  duration: 245.5,
  status: 'completed',
  files: {
    lyrixa: 'Kimi no na wa.lyrixa.json',
    audio: 'Kimi no na wa.mp3',
    srt: 'Kimi no na wa.srt'
  },
  settings: { language: 'ja' }
};

const BRIDGE_ENVELOPE = {
  schemaVersion: 1,
  app: 'Lyrixa',
  exportedAt: '2026-01-01T00:00:00.000Z',
  transcriptor: { source: 'transcriptor', bridgeSchemaVersion: 2 },
  project: {
    id: 'transcriptor-job-1',
    name: 'Kimi no na wa',
    lyricMode: 'single',
    audioTracks: { master: { fileName: 'Kimi no na wa.mp3', duration: 245.5 } },
    rawLyricsText: 'one\ntwo',
    normalizedLyrics: ['one', 'two'],
    layers: [
      {
        id: 'layer-main', name: 'Letra original', layerType: 'lyrics',
        role: 'primary', language: 'ja',
        color: '#2e7afb', visible: true, locked: false, order: 0
      },
      {
        id: 'layer-backing', name: 'Traducción · es', layerType: 'backing',
        role: 'translation', language: 'es',
        color: '#8a5cf6', visible: true, locked: false, order: 1
      }
    ],
    clips: [
      {
        id: 'clip-0000', text: 'one', startTime: 0, endTime: 2,
        layerId: 'layer-main', sourceId: 'segment-0', sourceIndex: 0,
        transitionIn: 'fade', transitionOut: 'fade', position: 'center'
      },
      {
        id: 'clip-0001', text: 'two', startTime: 2, endTime: 4,
        layerId: 'layer-main', sourceId: 'segment-0', sourceIndex: 1,
        transitionIn: 'fade', transitionOut: 'fade', position: 'center'
      },
      {
        id: 'clip-0000-t', text: 'uno', startTime: 0, endTime: 2,
        layerId: 'layer-backing', sourceId: 'clip-0000', sourceIndex: 0,
        transitionIn: 'fade', transitionOut: 'fade', position: 'center'
      }
    ],
    currentTime: 0,
    renderMode: 'editor'
  }
};

interface RouteMap {
  [path: string]: () => Response;
}

/** A fake Transcriptor: known routes answer, everything else 404s. */
function fakeService(routes: RouteMap, onRequest?: (path: string) => void): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const path = String(input).replace(BASE, '');
    onRequest?.(path);
    const handler = routes[path];
    return handler ? handler() : jsonResponse({ error: 'no existe' }, 404);
  }) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function client(fetchImpl: typeof fetch): TranscriptorClient {
  return new TranscriptorClient({ baseUrl: BASE, fetchImpl, timeoutMs: 1000 });
}

describe('resolving where Transcriptor lives', () => {
  it('defaults to a same-origin path so no CORS grant is needed', () => {
    const endpoints = resolveBridgeEndpoints({ href: 'http://localhost:5173/', storage: null });

    expect(endpoints.transcriptorBaseUrl).toBe(DEFAULT_TRANSCRIPTOR_BASE_URL);
    expect(endpoints.transcriptorBaseUrl).not.toMatch(/localhost:\d+/);
  });

  it('lets a desktop shell hand over an address through the URL', () => {
    const endpoints = resolveBridgeEndpoints({
      href: 'http://localhost:5173/?transcriptor=http://127.0.0.1:9100/',
      storage: null
    });

    expect(endpoints.transcriptorBaseUrl).toBe('http://127.0.0.1:9100');
  });

  it('prefers the URL over a stored preference', () => {
    const storage = { getItem: () => 'http://stored:1234' };

    const endpoints = resolveBridgeEndpoints({
      href: 'http://localhost:5173/?transcriptor=http://url:9999',
      storage
    });

    expect(endpoints.transcriptorBaseUrl).toBe('http://url:9999');
  });

  it('falls back to the stored preference, then to build-time env', () => {
    const storage = { getItem: (key: string) => (key === TRANSCRIPTOR_BASE_URL_STORAGE_KEY ? 'http://stored:1234' : null) };

    expect(resolveBridgeEndpoints({ href: 'http://x/', storage }).transcriptorBaseUrl)
      .toBe('http://stored:1234');
    expect(resolveBridgeEndpoints({
      href: 'http://x/',
      storage: null,
      env: { VITE_TRANSCRIPTOR_URL: 'http://env:4321' }
    }).transcriptorBaseUrl).toBe('http://env:4321');
  });

  it('reports no LiveWallpaper address when none is configured', () => {
    expect(resolveBridgeEndpoints({ href: 'http://x/', storage: null }).liveWallpaperBaseUrl)
      .toBeUndefined();
  });

  it('survives storage that throws, as private-mode browsers do', () => {
    const storage = { getItem: () => { throw new Error('denied'); } };

    expect(() => resolveBridgeEndpoints({ href: 'http://x/', storage })).not.toThrow();
  });
});

describe('reading the requested job id from the URL', () => {
  it('reads ?job=', () => {
    expect(readRequestedJobId('http://localhost:5173/?job=abc123')).toBe('abc123');
  });

  it('reports none for an ordinary standalone session', () => {
    expect(readRequestedJobId('http://localhost:5173/')).toBeNull();
  });

  it('refuses a job id that could escape the service path', () => {
    expect(readRequestedJobId('http://x/?job=../../etc/passwd')).toBeNull();
    expect(readRequestedJobId('http://x/?job=a/b')).toBeNull();
  });
});

describe('loading a project from a job', () => {
  it('uses the dedicated endpoint when Transcriptor serves one', async () => {
    const seen: string[] = [];
    const service = fakeService(
      { '/api/jobs/job-1/lyrixa': () => jsonResponse(BRIDGE_ENVELOPE) },
      path => seen.push(path)
    );

    const project = await client(service).getProject('job-1');

    expect(project.name).toBe('Kimi no na wa');
    expect(seen).toEqual(['/api/jobs/job-1/lyrixa']);
  });

  it('falls back to the job record and file download on builds without it', async () => {
    // This is today's Transcriptor: no /lyrixa route, but a discoverable file.
    const seen: string[] = [];
    const service = fakeService(
      {
        '/api/jobs/job-1': () => jsonResponse(JOB_RECORD),
        '/download/job-1/Kimi%20no%20na%20wa.lyrixa.json': () => jsonResponse(BRIDGE_ENVELOPE)
      },
      path => seen.push(path)
    );

    const project = await client(service).getProject('job-1');

    expect(project.name).toBe('Kimi no na wa');
    expect(seen).toContain('/api/jobs/job-1');
  });

  it('preserves layer roles and languages from the bridge', async () => {
    const service = fakeService({ '/api/jobs/job-1/lyrixa': () => jsonResponse(BRIDGE_ENVELOPE) });

    const project = await client(service).getProject('job-1');

    expect(project.layers.map(l => [l.role, l.language])).toEqual([
      ['primary', 'ja'],
      ['translation', 'es']
    ]);
  });

  it('repairs the bridge sourceIds so translations find their primary line', async () => {
    const service = fakeService({ '/api/jobs/job-1/lyrixa': () => jsonResponse(BRIDGE_ENVELOPE) });

    const project = await client(service).getProject('job-1');
    const main = project.clips.find(c => c.id === 'clip-0000')!;
    const translation = project.clips.find(c => c.id === 'clip-0000-t')!;
    const other = project.clips.find(c => c.id === 'clip-0001')!;

    expect(translation.sourceId).toBe(main.sourceId);
    expect(other.sourceId).not.toBe(main.sourceId);
  });

  it('fingerprints the imported translation so staleness works from the start', async () => {
    const service = fakeService({ '/api/jobs/job-1/lyrixa': () => jsonResponse(BRIDGE_ENVELOPE) });

    const project = await client(service).getProject('job-1');

    expect(project.clips.find(c => c.id === 'clip-0000-t')!.sourceTextHash).toBeTruthy();
    expect(project.clips.find(c => c.id === 'clip-0000')!.sourceTextHash).toBeUndefined();
  });

  it('never stores an object URL from the bridge import', async () => {
    const service = fakeService({ '/api/jobs/job-1/lyrixa': () => jsonResponse(BRIDGE_ENVELOPE) });

    const project = await client(service).getProject('job-1');

    expect(project.audioTracks.master?.objectUrl).toBeUndefined();
  });
});

describe('when Transcriptor is not there', () => {
  const unreachable = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;

  it('reports offline rather than throwing something unrecognizable', async () => {
    await expect(client(unreachable).getProject('job-1')).rejects.toMatchObject({
      name: 'TranscriptorBridgeError',
      reason: 'offline'
    });
  });

  it('answers the availability probe with false instead of throwing', async () => {
    await expect(client(unreachable).isAvailable()).resolves.toBe(false);
  });

  it('reports not-found for a job the service does not have', async () => {
    const service = fakeService({});

    await expect(client(service).getProject('missing')).rejects.toMatchObject({
      reason: 'not-found'
    });
  });

  it('explains that a job has no Lyrixa export yet', async () => {
    const service = fakeService({
      '/api/jobs/job-1': () => jsonResponse({ ...JOB_RECORD, files: { srt: 'x.srt' } })
    });

    await expect(client(service).getProject('job-1')).rejects.toThrow(/no Lyrixa export yet/);
  });

  it('rejects a payload that is not a Lyrixa project', async () => {
    const service = fakeService({
      '/api/jobs/job-1/lyrixa': () => jsonResponse({ app: 'NotLyrixa' }),
      '/api/jobs/job-1': () => jsonResponse(JOB_RECORD),
      '/download/job-1/Kimi%20no%20na%20wa.lyrixa.json': () => jsonResponse({ app: 'NotLyrixa' })
    });

    await expect(client(service).getProject('job-1')).rejects.toMatchObject({
      reason: 'invalid'
    });
  });

  it('gives up on a request that hangs', async () => {
    const hanging = (() => new Promise<Response>(() => {})) as unknown as typeof fetch;
    const impatient = new TranscriptorClient({ baseUrl: BASE, fetchImpl: hanging, timeoutMs: 10 });

    await expect(impatient.getJob('job-1')).rejects.toMatchObject({ reason: 'offline' });
  });
});

describe('loading the audio for a job', () => {
  function audioResponse(name: string): Response {
    return new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': `attachment; filename="${name}"`
      }
    });
  }

  it('uses the dedicated audio endpoint when it exists', async () => {
    const service = fakeService({
      '/api/jobs/job-1/audio': () => audioResponse('song.mp3')
    });

    const audio = await client(service).getAudio('job-1');

    expect(audio.fileName).toBe('song.mp3');
    expect(audio.mimeType).toBe('audio/mpeg');
    expect(await audio.blob.arrayBuffer()).toHaveProperty('byteLength', 3);
  });

  it('falls back to the job record download on builds without it', async () => {
    const service = fakeService({
      '/api/jobs/job-1': () => jsonResponse(JOB_RECORD),
      '/download/job-1/Kimi%20no%20na%20wa.mp3': () => audioResponse('Kimi no na wa.mp3')
    });

    const audio = await client(service).getAudio('job-1');

    expect(audio.fileName).toBe('Kimi no na wa.mp3');
  });

  it('says so plainly when the job kept no audio', async () => {
    const service = fakeService({
      '/api/jobs/job-1': () => jsonResponse({ ...JOB_RECORD, files: { lyrixa: 'a.lyrixa.json' } })
    });

    await expect(client(service).getAudio('job-1')).rejects.toThrow(/kept no audio/);
  });
});

describe('reading a job record', () => {
  it('reads the fields the editor needs and ignores the rest', async () => {
    const service = fakeService({
      '/api/jobs/job-1': () => jsonResponse({ ...JOB_RECORD, somethingNew: { nested: true } })
    });

    await expect(client(service).getJob('job-1')).resolves.toEqual({
      id: 'job-1',
      title: 'Kimi no na wa',
      duration: 245.5,
      status: 'completed',
      audioFileName: 'Kimi no na wa.mp3',
      projectFileName: 'Kimi no na wa.lyrixa.json',
      language: 'ja'
    });
  });

  it('accepts a files entry given as an object with a name', async () => {
    const service = fakeService({
      '/api/jobs/job-1': () => jsonResponse({
        ...JOB_RECORD,
        files: { ...JOB_RECORD.files, audio: { name: 'stem.wav', url: '/x' } }
      })
    });

    await expect(client(service).getJob('job-1')).resolves.toMatchObject({
      audioFileName: 'stem.wav'
    });
  });
});

describe('standalone Lyrixa', () => {
  it('makes no network call at all until a job is requested', () => {
    const spy = vi.fn();
    const service = fakeService({}, spy);

    // Constructing the client is the whole of the bridge's start-up cost.
    client(service);

    expect(spy).not.toHaveBeenCalled();
  });
});
