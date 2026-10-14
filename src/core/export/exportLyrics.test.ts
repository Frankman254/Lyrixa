import { describe, expect, it } from 'vitest';
import { defaultExportLayerId, exportLyrics, listLyricExportFormats } from './index';
import { formatLrcTime, formatSrtTime, formatVttTime } from './timecode';
import { normalizeProject } from '../project/serialization';
import type { LyrixaProject } from '../types/project';
import type { LyricClip } from '../types/clip';

function clip(id: string, text: string, startTime: number, endTime: number, extra: Partial<LyricClip> = {}): LyricClip {
  return {
    id,
    text,
    startTime,
    endTime,
    layerId: 'main',
    transitionIn: 'fade',
    transitionOut: 'fade',
    position: 'center',
    ...extra
  };
}

const LAYERS = [
  { id: 'main', name: 'Main', layerType: 'lyrics', color: '#fff', visible: true, locked: false, order: 0 },
  { id: 'es', name: 'Spanish', layerType: 'lyrics', color: '#fff', visible: true, locked: false, order: 1, role: 'translation', language: 'es' },
  { id: 'romaji', name: 'Romaji', layerType: 'lyrics', color: '#fff', visible: true, locked: false, order: 2 }
];

function project(clips: LyricClip[], input: Partial<LyrixaProject> = {}): LyrixaProject {
  return normalizeProject({ id: 'p1', name: 'Song', layers: LAYERS, clips, ...input } as Partial<LyrixaProject>);
}

describe('timecodes', () => {
  it('rounds before splitting so seconds never read 60', () => {
    expect(formatLrcTime(59.999)).toBe('01:00.00');
    expect(formatLrcTime(12.345)).toBe('00:12.35');
    expect(formatLrcTime(3725.5)).toBe('62:05.50');
    expect(formatSrtTime(59.9996)).toBe('00:01:00,000');
    expect(formatSrtTime(3725.0424)).toBe('01:02:05,042');
    expect(formatVttTime(1.5)).toBe('00:00:01.500');
  });

  it('treats negative and non-finite times as zero', () => {
    expect(formatLrcTime(-3)).toBe('00:00.00');
    expect(formatSrtTime(Number.NaN)).toBe('00:00:00,000');
  });
});

describe('exportLyrics — LRC', () => {
  it('writes a header, one line per clip and a blank line on each silence', () => {
    const p = project(
      [clip('a', 'first', 1, 3), clip('b', 'second', 3, 5), clip('c', 'third', 8, 10)],
      { audioTracks: { master: { fileName: 'song.mp3', duration: 125 } } }
    );
    const { text, fileName, cueCount } = exportLyrics(p, { format: 'lrc' });

    expect(fileName).toBe('Song.lrc');
    expect(cueCount).toBe(3);
    expect(text).toBe([
      '[ti:Song]',
      '[length:02:05]',
      '[re:Lyrixa]',
      '',
      '[00:01.00]first',
      '[00:03.00]second',
      '[00:05.00]',
      '[00:08.00]third',
      '[00:10.00]',
      ''
    ].join('\n'));
  });

  it('keeps overlapping clips in start order without blank lines between them', () => {
    const p = project([clip('b', 'later', 2, 6), clip('a', 'earlier', 1, 4)]);
    const lines = exportLyrics(p, { format: 'lrc' }).text.split('\n');

    expect(lines).toContain('[00:01.00]earlier');
    expect(lines.indexOf('[00:01.00]earlier')).toBeLessThan(lines.indexOf('[00:02.00]later'));
    expect(lines).not.toContain('[00:04.00]');
    expect(lines).toContain('[00:06.00]');
  });

  it('skips muted, empty and broken clips and joins multi-line text', () => {
    const p = project([
      clip('a', 'one\n\n two ', 1, 2),
      clip('b', 'muted', 3, 4, { muted: true }),
      clip('c', '   ', 5, 6),
      clip('d', 'backwards', 8, 7),
      clip('e', 'nan', Number.NaN, 9)
    ]);
    const result = exportLyrics(p, { format: 'lrc' });

    expect(result.cueCount).toBe(1);
    expect(result.text).toContain('[00:01.00]one two');
    expect(result.text).not.toContain('muted');
  });

  it('keeps Japanese text and a Japanese title intact', () => {
    const p = project([clip('a', '夜に駆ける', 0.5, 2)], { name: '夜に駆ける' });
    const result = exportLyrics(p, { format: 'lrc' });

    expect(result.fileName).toBe('夜に駆ける.lrc');
    expect(result.text).toContain('[ti:夜に駆ける]');
    expect(result.text).toContain('[00:00.50]夜に駆ける');
  });
});

describe('exportLyrics — Enhanced LRC', () => {
  it('writes word tags and closes with the last word end', () => {
    const p = project([
      clip('a', 'hello world', 1, 3, {
        words: [
          { text: 'world', startTime: 1.6, endTime: 2.4 },
          { text: 'hello', startTime: 1, endTime: 1.5 }
        ]
      })
    ]);

    expect(exportLyrics(p, { format: 'lrc-enhanced' }).text)
      .toContain('[00:01.00]<00:01.00>hello <00:01.60>world <00:02.40>');
  });

  it('falls back to a plain line when a clip has no usable words', () => {
    const p = project([
      clip('a', 'no words', 1, 2),
      clip('b', 'broken words', 3, 4, { words: [{ text: 'x', startTime: Number.NaN, endTime: 1 }] })
    ]);
    const text = exportLyrics(p, { format: 'lrc-enhanced' }).text;

    expect(text).toContain('[00:01.00]no words');
    expect(text).toContain('[00:03.00]broken words');
    expect(text).not.toContain('<');
  });

  it('drops only the invalid words of a line', () => {
    const p = project([
      clip('a', 'a b', 1, 3, {
        words: [
          { text: 'a', startTime: 1, endTime: 1.5 },
          { text: 'b', startTime: 2, endTime: 1 }
        ]
      })
    ]);

    expect(exportLyrics(p, { format: 'lrc-enhanced' }).text).toContain('[00:01.00]<00:01.00>a <00:01.50>');
  });
});

describe('exportLyrics — SRT and WebVTT', () => {
  it('numbers SRT cues with comma milliseconds', () => {
    const p = project([clip('a', 'one', 1.25, 2.5), clip('b', 'two\nlines', 3, 4)]);

    expect(exportLyrics(p, { format: 'srt' }).text).toBe(
      '1\n00:00:01,250 --> 00:00:02,500\none\n\n2\n00:00:03,000 --> 00:00:04,000\ntwo\nlines\n'
    );
  });

  it('writes a WEBVTT header and escapes markup', () => {
    const p = project([clip('a', 'Tom & <Jerry> --> run', 1, 2)]);
    const result = exportLyrics(p, { format: 'vtt' });

    expect(result.text).toBe('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nTom &amp; &lt;Jerry&gt; → run\n');
    expect(result.mimeType).toContain('text/vtt');
    expect(result.fileName).toBe('Song.vtt');
  });

  it('exports an empty but valid file when the layer has no text', () => {
    const p = project([]);
    expect(exportLyrics(p, { format: 'vtt' }).text).toBe('WEBVTT\n');
    expect(exportLyrics(p, { format: 'srt' }).text).toBe('');
    expect(exportLyrics(p, { format: 'txt' }).cueCount).toBe(0);
  });
});

describe('exportLyrics — layers', () => {
  const clips = [
    clip('a', 'hello', 1, 2),
    clip('b', 'hola', 1, 2, { layerId: 'es' }),
    clip('c', 'konnichiwa', 1, 2, { layerId: 'romaji' })
  ];

  it('exports only the chosen layer and tags the file with its language or name', () => {
    const p = project(clips);
    const es = exportLyrics(p, { format: 'txt', layerId: 'es' });
    const romaji = exportLyrics(p, { format: 'srt', layerId: 'romaji' });

    expect(es.text).toBe('hola\n');
    expect(es.fileName).toBe('Song.es.txt');
    expect(romaji.fileName).toBe('Song.Romaji.srt');
    expect(romaji.text).toContain('konnichiwa');
  });

  it('defaults to the primary layer, else the top-most layer with text', () => {
    expect(defaultExportLayerId(project(clips))).toBe('main');
    expect(defaultExportLayerId(project([clip('b', 'hola', 1, 2, { layerId: 'es' })]))).toBe('es');

    const withPrimary = project(clips, {
      layers: LAYERS.map(layer => layer.id === 'romaji' ? { ...layer, role: 'primary' } : layer)
    } as Partial<LyrixaProject>);
    expect(defaultExportLayerId(withPrimary)).toBe('romaji');
    expect(exportLyrics(withPrimary, { format: 'txt' }).text).toBe('konnichiwa\n');
  });

  it('rejects a layer that does not exist', () => {
    expect(() => exportLyrics(project(clips), { format: 'lrc', layerId: 'nope' })).toThrow();
  });

  it('lists every format once', () => {
    const formats = listLyricExportFormats().map(info => info.format);
    expect(new Set(formats).size).toBe(formats.length);
    expect(formats).toEqual(['lrc', 'lrc-enhanced', 'srt', 'vtt', 'txt']);
  });
});
