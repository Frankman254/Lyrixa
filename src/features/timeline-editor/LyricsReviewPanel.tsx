import { useEffect, useMemo, useState } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import { setClipText } from '../../core/timeline/clipEditing';
import { copyTimingToLinkedClips } from '../../core/timeline/clipBatch';
import { createDerivedClip } from '../../core/timeline/lineIdentity';

interface LyricsReviewPanelProps {
  clips: LyricClip[];
  layers: LyricLayer[];
  onClipsChange: (clips: LyricClip[]) => void;
  onSelectClip: (clipId: string) => void;
  onSeek: (time: number) => void;
  onClose: () => void;
}

interface ReviewRow {
  key: string;
  anchor: LyricClip;
  clipsByLayer: Map<string, LyricClip>;
}

const PAGE_SIZE = 100;

export function LyricsReviewPanel({
  clips,
  layers,
  onClipsChange,
  onSelectClip,
  onSeek,
  onClose
}: LyricsReviewPanelProps) {
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const orderedLayers = useMemo(() => [...layers].sort((a, b) => a.order - b.order), [layers]);
  const rows = useMemo(() => buildRows(clips, orderedLayers), [clips, orderedLayers]);
  const filteredRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return rows;
    return rows.filter(row =>
      row.anchor.sourceId?.toLocaleLowerCase().includes(needle) ||
      [...row.clipsByLayer.values()].some(clip => clip.text.toLocaleLowerCase().includes(needle))
    );
  }, [query, rows]);
  useEffect(() => setVisibleCount(PAGE_SIZE), [query]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const patchText = (clipId: string, text: string) => {
    onClipsChange(clips.map(clip => clip.id === clipId ? setClipText(clip, text) : clip));
  };

  const patchAnchorTime = (row: ReviewRow, edge: 'start' | 'end', value: number) => {
    if (!Number.isFinite(value)) return;
    const anchor = row.anchor;
    const next = edge === 'start'
      ? { startTime: Math.max(0, Math.min(value, anchor.endTime - 0.25)) }
      : { endTime: Math.max(anchor.startTime + 0.25, value) };
    onClipsChange(clips.map(clip => clip.id === anchor.id ? { ...clip, ...next } : clip));
  };

  const copyTiming = (anchorId: string) => {
    const result = copyTimingToLinkedClips(clips, layers, anchorId);
    if (result.affectedIds.length > 0) onClipsChange(result.clips);
  };

  const addCounterpart = (row: ReviewRow, layerId: string) => {
    const id = uniqueDerivedId(clips, row.anchor.id, layerId);
    const created = {
      ...createDerivedClip(row.anchor, { id, layerId, text: '' }),
      muted: true
    };
    onClipsChange([...clips, created]);
  };

  return (
    <div className="lyrics-review-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="lyrics-review-panel" role="dialog" aria-modal="true" aria-label="Lyrics review table">
        <header className="lyrics-review-header">
          <div>
            <span className="label-eyebrow">Lyrics review</span>
            <strong>{filteredRows.length} paragraphs · {clips.length} clips</strong>
          </div>
          <div className="lyrics-review-header-actions">
            <input
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search text or source id"
              autoFocus
            />
            <button type="button" onClick={onClose} aria-label="Close lyrics review">×</button>
          </div>
        </header>

        <div className="lyrics-review-scroll">
          <table className="lyrics-review-table">
            <thead>
              <tr>
                <th className="lyrics-review-time-column">Time</th>
                {orderedLayers.map(layer => <th key={layer.id}>{layer.name}</th>)}
                <th className="lyrics-review-actions-column">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, visibleCount).map((row, index) => (
                <tr key={row.key}>
                  <td className="lyrics-review-time-cell">
                    <span className="lyrics-review-index">{index + 1}</span>
                    <label>
                      In
                      <input
                        type="number"
                        step="0.01"
                        value={roundTime(row.anchor.startTime)}
                        onChange={event => patchAnchorTime(row, 'start', Number(event.target.value))}
                      />
                    </label>
                    <label>
                      Out
                      <input
                        type="number"
                        step="0.01"
                        value={roundTime(row.anchor.endTime)}
                        onChange={event => patchAnchorTime(row, 'end', Number(event.target.value))}
                      />
                    </label>
                    <small>{row.anchor.sourceId ?? 'Unlinked clip'}</small>
                  </td>
                  {orderedLayers.map(layer => {
                    const clip = row.clipsByLayer.get(layer.id);
                    return (
                      <td key={layer.id} className={clip ? '' : 'lyrics-review-missing'}>
                        {clip ? (
                          <textarea
                            value={clip.text}
                            onChange={event => patchText(clip.id, event.target.value)}
                            aria-label={`${layer.name} text at ${roundTime(row.anchor.startTime)} seconds`}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => addCounterpart(row, layer.id)}
                            title={`Create an empty linked clip on ${layer.name}`}
                          >
                            + Empty
                          </button>
                        )}
                      </td>
                    );
                  })}
                  <td className="lyrics-review-row-actions">
                    <button type="button" onClick={() => copyTiming(row.anchor.id)}>Match timing</button>
                    <button type="button" onClick={() => {
                      onSeek(row.anchor.startTime);
                      onSelectClip(row.anchor.id);
                      onClose();
                    }}>Focus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleCount < filteredRows.length && (
            <button
              type="button"
              className="lyrics-review-more"
              onClick={() => setVisibleCount(count => count + PAGE_SIZE)}
            >
              Show {Math.min(PAGE_SIZE, filteredRows.length - visibleCount)} more
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function buildRows(clips: LyricClip[], layers: LyricLayer[]): ReviewRow[] {
  const layerOrder = new Map(layers.map((layer, index) => [layer.id, index]));
  const groups = new Map<string, LyricClip[]>();
  const rows: ReviewRow[] = [];
  for (const clip of clips) {
    if (!clip.sourceId) {
      rows.push({ key: `clip:${clip.id}`, anchor: clip, clipsByLayer: new Map([[clip.layerId, clip]]) });
      continue;
    }
    const group = groups.get(clip.sourceId) ?? [];
    group.push(clip);
    groups.set(clip.sourceId, group);
  }

  for (const [sourceId, group] of groups) {
    const ordered = [...group].sort((a, b) => a.startTime - b.startTime || a.layerId.localeCompare(b.layerId));
    const occurrences: ReviewRow[] = [];
    for (const clip of ordered) {
      const occurrence = [...occurrences].reverse().find(row =>
        Math.abs(row.anchor.startTime - clip.startTime) <= 0.05 &&
        !row.clipsByLayer.has(clip.layerId)
      );
      if (occurrence) {
        occurrence.clipsByLayer.set(clip.layerId, clip);
        continue;
      }
      occurrences.push({
        key: `source:${sourceId}:${clip.id}`,
        anchor: clip,
        clipsByLayer: new Map([[clip.layerId, clip]])
      });
    }
    rows.push(...occurrences);
  }

  for (const row of rows) {
    const ordered = [...row.clipsByLayer.values()].sort((a, b) => {
      const aLayer = layers.find(layer => layer.id === a.layerId);
      const bLayer = layers.find(layer => layer.id === b.layerId);
      if (aLayer?.role === 'primary' && bLayer?.role !== 'primary') return -1;
      if (bLayer?.role === 'primary' && aLayer?.role !== 'primary') return 1;
      return (layerOrder.get(a.layerId) ?? 999) - (layerOrder.get(b.layerId) ?? 999);
    });
    row.anchor = ordered[0]!;
    row.clipsByLayer = new Map(ordered.map(clip => [clip.layerId, clip]));
  }
  return rows.sort((a, b) => a.anchor.startTime - b.anchor.startTime || a.key.localeCompare(b.key));
}

function uniqueDerivedId(clips: LyricClip[], anchorId: string, layerId: string): string {
  const ids = new Set(clips.map(clip => clip.id));
  const base = `${anchorId}--${layerId}`;
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function roundTime(value: number): number {
  return Math.round(value * 100) / 100;
}

