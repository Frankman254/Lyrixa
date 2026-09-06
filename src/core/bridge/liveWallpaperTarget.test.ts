import { describe, expect, it, vi } from 'vitest';
import {
  createFileLiveWallpaperTarget,
  createHttpLiveWallpaperTarget,
  resolveLiveWallpaperTarget,
  sendProjectToLiveWallpaper
} from './liveWallpaperTarget';
import { normalizeProject } from '../project/serialization';
import { parseLyricsBundleEnvelope } from '../project/lyricsBundle';
import type { LyrixaProject } from '../types/project';

function project(): LyrixaProject {
  return normalizeProject({
    id: 'p1',
    name: 'My Song',
    rawLyricsText: 'one',
    normalizedLyrics: ['one'],
    layers: [{
      id: 'jp', name: 'Original', layerType: 'lyrics', role: 'primary', language: 'ja',
      color: '#fff', visible: true, locked: false, order: 0
    }],
    clips: [{
      id: 'c1', text: 'one', startTime: 0, endTime: 2, layerId: 'jp', sourceId: 'line-1',
      transitionIn: 'fade', transitionOut: 'fade', position: 'center'
    }]
  } as unknown as Partial<LyrixaProject>);
}

describe('sending to a running LiveWallpaper', () => {
  it('posts the same bundle a file export would produce', async () => {
    let posted = '';
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      posted = String(init?.body ?? '');
      return new Response(JSON.stringify({ projectId: 'lw-9' }), { status: 200 });
    }) as unknown as typeof fetch;

    const result = await sendProjectToLiveWallpaper(
      project(),
      createHttpLiveWallpaperTarget({ baseUrl: 'http://127.0.0.1:7777', fetchImpl })
    );

    expect(result).toMatchObject({ kind: 'http', projectRef: 'lw-9' });
    // Parses as a bundle: the transport did not invent its own payload shape.
    expect(parseLyricsBundleEnvelope(JSON.parse(posted)).fragment.layers[0]!.role).toBe('primary');
  });

  it('reports a refusal instead of pretending it landed', async () => {
    const fetchImpl = (async () => new Response('', { status: 500 })) as unknown as typeof fetch;

    await expect(sendProjectToLiveWallpaper(
      project(),
      createHttpLiveWallpaperTarget({ baseUrl: 'http://127.0.0.1:7777', fetchImpl })
    )).rejects.toThrow(/refused the bundle/);
  });

  it('is unavailable when the renderer is not running', async () => {
    const fetchImpl = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;

    await expect(
      createHttpLiveWallpaperTarget({ baseUrl: 'http://127.0.0.1:7777', fetchImpl }).isAvailable()
    ).resolves.toBe(false);
  });
});

describe('the file destination', () => {
  it('always works, with no service of any kind', async () => {
    const saveFile = vi.fn();
    const target = createFileLiveWallpaperTarget({ saveFile });

    await expect(target.isAvailable()).resolves.toBe(true);

    const result = await sendProjectToLiveWallpaper(project(), target);

    expect(result.kind).toBe('download');
    expect(saveFile).toHaveBeenCalledWith('My-Song.lyrixa-lyrics.json', expect.any(Blob));
  });

  it('writes a bundle a renderer can parse', async () => {
    let written = '';
    const target = createFileLiveWallpaperTarget({
      saveFile: async (_name, blob) => { written = await blob.text(); }
    });

    await sendProjectToLiveWallpaper(project(), target);

    expect(parseLyricsBundleEnvelope(JSON.parse(written)).fragment.clips[0]!.sourceId)
      .toBe('line-1');
  });
});

describe('choosing a destination', () => {
  it('prefers a live connection when one answers', async () => {
    const http = { name: 'http', isAvailable: async () => true, send: vi.fn() };
    const file = { name: 'file', isAvailable: async () => true, send: vi.fn() };

    await expect(resolveLiveWallpaperTarget([http, file])).resolves.toBe(http);
  });

  it('falls back to the file destination when nothing is listening', async () => {
    const http = { name: 'http', isAvailable: async () => false, send: vi.fn() };
    const file = createFileLiveWallpaperTarget({ saveFile: vi.fn() });

    await expect(resolveLiveWallpaperTarget([http, file])).resolves.toBe(file);
  });

  it('refuses to guess when nothing at all is configured', async () => {
    await expect(resolveLiveWallpaperTarget([])).rejects.toThrow(/No LiveWallpaper destination/);
  });
});
