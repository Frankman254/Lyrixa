import { describe, expect, it, vi } from 'vitest';
import {
  createTranscriptorTranslationService,
  createUnavailableTranslationService,
  TranslationUnavailableError
} from './translationService';
import { TranscriptorClient } from '../bridge/transcriptorClient';

const BASE = '/transcriptor';

function client(handler: (path: string, init?: RequestInit) => Response): TranscriptorClient {
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input).replace(BASE, ''), init)) as unknown as typeof fetch;
  return new TranscriptorClient({ baseUrl: BASE, fetchImpl, timeoutMs: 500 });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

describe('translating one line on demand', () => {
  it('sends only the line the user asked about', async () => {
    const seen: { path: string; body: unknown }[] = [];
    const service = createTranscriptorTranslationService(
      client((path, init) => {
        seen.push({ path, body: JSON.parse(String(init?.body ?? '{}')) });
        return json({ text: 'tu nombre' });
      })
    );

    const result = await service.translateLine({
      text: '君の名は',
      targetLanguage: 'es',
      sourceLanguage: 'ja'
    });

    expect(result.text).toBe('tu nombre');
    expect(seen).toHaveLength(1);
    expect(seen[0]!.path).toBe('/api/translate/line');
    expect(seen[0]!.body).toMatchObject({ text: '君の名は', target: 'es', source: 'ja' });
  });

  it('never re-translates the rest of the project', async () => {
    // The whole point of the per-line unit: editing one phrase must cost one
    // request, not a pass over every clip.
    const calls = vi.fn(() => json({ text: 'ok' }));
    const service = createTranscriptorTranslationService(client(calls));

    await service.translateLine({ text: 'a', targetLanguage: 'es' });
    await service.translateLine({ text: 'b', targetLanguage: 'es' });

    expect(calls).toHaveBeenCalledTimes(2);
  });

  it('passes neighbouring lines as context without asking for them back', async () => {
    let body: Record<string, unknown> = {};
    const service = createTranscriptorTranslationService(
      client((_path, init) => {
        body = JSON.parse(String(init?.body ?? '{}'));
        return json({ text: 'la suya' });
      })
    );

    await service.translateLine({
      text: 'hers',
      targetLanguage: 'es',
      context: { previous: 'she took the letter', next: 'and left' }
    });

    expect(body.text).toBe('hers');
    expect(body.context).toEqual({ previous: 'she took the letter', next: 'and left' });
  });

  it('accepts a service that names the field `translation`', async () => {
    const service = createTranscriptorTranslationService(client(() => json({ translation: 'hola' })));

    await expect(service.translateLine({ text: 'hi', targetLanguage: 'es' }))
      .resolves.toMatchObject({ text: 'hola' });
  });
});

describe('refusing to guess', () => {
  it('will not translate an empty line', async () => {
    const service = createTranscriptorTranslationService(client(() => json({ text: 'x' })));

    await expect(service.translateLine({ text: '   ', targetLanguage: 'es' }))
      .rejects.toMatchObject({ reason: 'rejected' });
  });

  it('will not translate into a language nobody named', async () => {
    const service = createTranscriptorTranslationService(client(() => json({ text: 'x' })));

    await expect(service.translateLine({ text: 'hello', targetLanguage: '' }))
      .rejects.toThrow(/no language set/);
  });

  it('rejects an empty answer rather than blanking the clip', async () => {
    const service = createTranscriptorTranslationService(client(() => json({ text: '  ' })));

    await expect(service.translateLine({ text: 'hello', targetLanguage: 'es' }))
      .rejects.toMatchObject({ reason: 'rejected' });
  });
});

describe('degrading when there is nothing to ask', () => {
  it('reports unsupported on a build with no per-line route', async () => {
    const service = createTranscriptorTranslationService(client(() => json({ error: 'nope' }, 404)));

    await expect(service.translateLine({ text: 'hello', targetLanguage: 'es' }))
      .rejects.toMatchObject({ reason: 'unsupported' });
    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('distinguishes "no translator installed" from "route missing"', async () => {
    const service = createTranscriptorTranslationService(client(() => json({ error: 'sin traductor' }, 409)));

    await expect(service.translateLine({ text: 'hello', targetLanguage: 'es' }))
      .rejects.toMatchObject({ reason: 'no-translator' });
  });

  it('reports offline when Transcriptor is not running', async () => {
    const unreachable = (() => Promise.reject(new TypeError('fetch failed'))) as unknown as typeof fetch;
    const service = createTranscriptorTranslationService(
      new TranscriptorClient({ baseUrl: BASE, fetchImpl: unreachable, timeoutMs: 200 })
    );

    await expect(service.translateLine({ text: 'hello', targetLanguage: 'es' }))
      .rejects.toMatchObject({ reason: 'offline' });
    await expect(service.isAvailable()).resolves.toBe(false);
  });

  it('probes once and remembers the answer', async () => {
    const calls = vi.fn(() => json({ error: 'nope' }, 404));
    const service = createTranscriptorTranslationService(client(calls));

    await service.isAvailable();
    await service.isAvailable();

    expect(calls).toHaveBeenCalledTimes(1);
  });
});

describe('the standalone editor', () => {
  it('offers no translation and says why, without breaking anything', async () => {
    const service = createUnavailableTranslationService();

    await expect(service.isAvailable()).resolves.toBe(false);
    await expect(service.translateLine({ text: 'hello', targetLanguage: 'es' }))
      .rejects.toBeInstanceOf(TranslationUnavailableError);
  });

  it('is a real service object, so callers need no null checks', () => {
    const service = createUnavailableTranslationService();

    expect(typeof service.translateLine).toBe('function');
    expect(typeof service.isAvailable).toBe('function');
  });
});
