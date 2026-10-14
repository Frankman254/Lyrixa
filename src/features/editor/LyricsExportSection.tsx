import { useState } from 'react';
import type { LyrixaProject } from '../../core/types/project';
import { defaultExportLayerId, listLyricExportFormats } from '../../core/export';
import type { LyricExportFormat, LyricExportOptions } from '../../core/export';

const FORMATS = listLyricExportFormats();

interface LyricsExportSectionProps {
  project: LyrixaProject;
  onExport: (options: LyricExportOptions) => void;
}

/**
 * Format + layer picker for the standard lyric exports (LRC, SRT, VTT…),
 * shown inline in the top bar's More menu.
 */
export function LyricsExportSection({ project, onExport }: LyricsExportSectionProps) {
  const [format, setFormat] = useState<LyricExportFormat>('lrc');
  const [chosenLayerId, setChosenLayerId] = useState<string | null>(null);

  const layers = [...project.layers].sort((a, b) => a.order - b.order);
  // A layer picked earlier may have been deleted since; fall back quietly.
  const layerId = layers.some(layer => layer.id === chosenLayerId)
    ? chosenLayerId
    : defaultExportLayerId(project);
  const info = FORMATS.find(entry => entry.format === format);

  return (
    <div className="tr-more-export" role="group" aria-label="Export lyrics as">
      <span className="tr-more-export-title">Export lyrics as</span>
      <div className="tr-more-export-row">
        <select
          value={format}
          onChange={e => setFormat(e.target.value as LyricExportFormat)}
          aria-label="Lyrics format"
          title={info?.description}
        >
          {FORMATS.map(entry => (
            <option key={entry.format} value={entry.format}>{entry.label}</option>
          ))}
        </select>
        <select
          value={layerId ?? ''}
          onChange={e => setChosenLayerId(e.target.value)}
          aria-label="Layer to export"
          disabled={layers.length === 0}
        >
          {layers.map(layer => (
            <option key={layer.id} value={layer.id}>{layer.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="tr-btn small"
          disabled={!layerId}
          onClick={() => layerId && onExport({ format, layerId })}
          title={info ? `${info.description} (.${info.extension})` : undefined}
        >
          ↓
        </button>
      </div>
    </div>
  );
}
