import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  isManifestSlotDraggable,
  parseAuthoringSource
} from '../../core/composition/authoringManifest';
import { resolveCueSlotStatus } from '../../core/composition/slotStatus';
import { createCompositionCueId } from '../../core/composition/score';
import type {
  CompositionCueV1,
  CompositionScore,
  VibrixAuthoringManifest,
  VibrixAuthoringSource,
  VibrixManifestSlot
} from '../../core/composition/types';
import './CompositionCatalog.css';

interface CompositionCatalogProps {
  manifest?: VibrixAuthoringManifest;
  score: CompositionScore;
  selectedCueId: string | null;
  currentTime: number;
  sourceKind?: VibrixAuthoringSource['kind'];
  sourceUnavailable?: boolean;
  onAuthoringImport: (source: VibrixAuthoringSource) => Promise<void>;
  onScoreChange: (score: CompositionScore) => void;
  onSelectCue: (cueId: string | null) => void;
  onExportScore: () => void;
  onClose?: () => void;
}

export const VIBRIX_SLOT_DRAG_TYPE = 'application/x-lyrixa-vibrix-slot';

export function CompositionCatalog({
  manifest,
  score,
  selectedCueId,
  currentTime,
  sourceKind,
  sourceUnavailable,
  onAuthoringImport,
  onScoreChange,
  onSelectCue,
  onExportScore,
  onClose
}: CompositionCatalogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const scenes = manifest?.slots.filter(slot => slot.family === 'scene') ?? [];
  const legacyScore = score.schemaVersion === 1 ? score : null;
  const selectedCue = legacyScore?.cues.find(cue => cue.id === selectedCueId) ?? null;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const parsed = parseAuthoringSource(JSON.parse(await file.text()));
      if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
      await onAuthoringImport(parsed.source);
      setError(null);
      setNotice(parsed.source.kind === 'package'
        ? `Authoring package imported (${formatFileSize(file.size)}).`
        : 'Legacy manifest imported.');
    } catch (reason) {
      setNotice(null);
      setError(reason instanceof Error ? reason.message : 'Could not read Vibrix authoring source.');
    } finally {
      setImporting(false);
    }
  };

  const addAtPlayhead = (slot: VibrixManifestSlot) => {
    if (!legacyScore || !isManifestSlotDraggable(slot)) return;
    const track = legacyScore.tracks.find(candidate => candidate.kind === 'scene');
    if (!track) return;
    const startTimeMs = Math.max(0, Math.round(currentTime * 1000));
    const cue: CompositionCueV1 = {
      id: createCompositionCueId(legacyScore, slot.id, startTimeMs),
      trackId: track.id,
      startTimeMs,
      endTimeMs: startTimeMs + 8000,
      target: {
        kind: 'scene',
        family: 'scene',
        slotId: slot.id,
        slotRevision: slot.revision
      },
      transition: { type: 'cut', durationMs: 0, easing: 'linear' },
      priority: 0,
      enabled: true
    };
    onScoreChange({ ...legacyScore, cues: [...legacyScore.cues, cue] });
    onSelectCue(cue.id);
  };

  const updateSelected = (patch: Partial<CompositionCueV1>) => {
    if (!selectedCue || !legacyScore) return;
    onScoreChange({
      ...legacyScore,
      cues: legacyScore.cues.map(cue => cue.id === selectedCue.id ? { ...cue, ...patch } : cue)
    });
  };

  const deleteSelected = () => {
    if (!selectedCue || !legacyScore) return;
    onScoreChange({ ...legacyScore, cues: legacyScore.cues.filter(cue => cue.id !== selectedCue.id) });
    onSelectCue(null);
  };

  return (
    <aside className="composition-catalog" aria-label="Vibrix composition catalog">
      <header className="composition-catalog-header">
        <div>
          <span className="label-eyebrow">Vibrix</span>
          <strong>Scene catalog</strong>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close catalog">×</button>}
      </header>

      <div className="composition-catalog-actions">
        <button type="button" disabled={importing} onClick={() => inputRef.current?.click()}>
          {importing ? 'Importing…' : 'Import authoring'}
        </button>
        <button type="button" onClick={onExportScore} disabled={score.cues.length === 0}>Export score</button>
        <input
          ref={inputRef}
          type="file"
          accept=".vibrix-authoring,.vibrix-manifest.json,.json,application/json,application/x-vibrix-authoring+json"
          hidden
          onChange={handleFile}
        />
      </div>

      {manifest ? (
        <div className="composition-catalog-meta">
          <strong>{manifest.projectName}</strong>
          <span>Renderer {manifest.rendererVersion}</span>
          <span>
            {manifest.slots.length} slots
            {manifest.schemaVersion === 2 ? ` · ${manifest.images.length} images` : ''}
            {` · ${scenes.length} scenes`}
          </span>
          <span>{sourceKind === 'package' ? 'Portable package' : 'Loose manifest'} · revision {manifest.revision}</span>
        </div>
      ) : (
        <div className="composition-catalog-empty">
          Import a <code>.vibrix-authoring</code> package or legacy <code>.vibrix-manifest.json</code> exported by Vibrix.
        </div>
      )}
      {sourceUnavailable && (
        <div className="composition-catalog-error" role="alert">
          The saved authoring source is not available on this device. Import it again.
        </div>
      )}
      {error && <div className="composition-catalog-error" role="alert">{error}</div>}
      {notice && <div className="composition-catalog-notice" role="status">{notice}</div>}
      {score.schemaVersion === 2 && (
        <div className="composition-catalog-notice" role="status">
          Sustained score v2 is active. Timeline placement becomes available in L3.
        </div>
      )}

      <div className="composition-slot-list">
        {manifest && scenes.length === 0 && (
          <div className="composition-catalog-empty">
            Package ready. This Vibrix project publishes no scene slots yet; image and granular-track authoring arrives in later sequencer levels.
          </div>
        )}
        {scenes.map(slot => {
          const draggable = legacyScore !== null && isManifestSlotDraggable(slot);
          return (
            <article
              key={slot.id}
              className={`composition-slot-card ${draggable ? '' : 'disabled'}`}
              draggable={draggable}
              onDragStart={(event: DragEvent<HTMLElement>) => {
                event.dataTransfer.setData(VIBRIX_SLOT_DRAG_TYPE, slot.id);
                event.dataTransfer.effectAllowed = 'copy';
              }}
            >
              <div>
                <strong>{slot.name}</strong>
                <span>{slot.revision === 'empty' ? 'Empty slot' : slot.id}</span>
              </div>
              <button
                type="button"
                disabled={!draggable}
                onClick={() => addAtPlayhead(slot)}
                title={draggable ? 'Add scene at playhead' : 'This slot cannot be placed'}
              >
                +
              </button>
            </article>
          );
        })}
      </div>

      {selectedCue && (
        <section className="composition-cue-inspector">
          <div className="composition-section-title">Selected cue</div>
          <CueStatus cue={selectedCue} manifest={manifest} />
          <label>
            Start (ms)
            <input
              type="number"
              value={selectedCue.startTimeMs}
              onChange={event => updateSelected({ startTimeMs: Math.max(0, Math.round(Number(event.target.value))) })}
            />
          </label>
          <label>
            End (ms)
            <input
              type="number"
              value={selectedCue.endTimeMs}
              onChange={event => updateSelected({ endTimeMs: Math.max(selectedCue.startTimeMs + 1, Math.round(Number(event.target.value))) })}
            />
          </label>
          <label>
            Transition
            <select
              value={selectedCue.transition?.type ?? 'cut'}
              onChange={event => updateSelected({
                transition: {
                  type: event.target.value as NonNullable<CompositionCueV1['transition']>['type'],
                  durationMs: selectedCue.transition?.durationMs ?? 0,
                  easing: selectedCue.transition?.easing ?? 'linear'
                }
              })}
            >
              <option value="cut">Cut</option>
              <option value="crossfade">Crossfade</option>
              <option value="morph">Morph</option>
            </select>
          </label>
          <label>
            Transition duration (ms)
            <input
              type="number"
              min="0"
              value={selectedCue.transition?.durationMs ?? 0}
              onChange={event => updateSelected({
                transition: {
                  type: selectedCue.transition?.type ?? 'cut',
                  durationMs: Math.max(0, Math.round(Number(event.target.value))),
                  easing: selectedCue.transition?.easing ?? 'linear'
                }
              })}
            />
          </label>
          <button type="button" className="composition-delete" onClick={deleteSelected}>Delete cue</button>
        </section>
      )}
    </aside>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function CueStatus({ cue, manifest }: { cue: CompositionCueV1; manifest?: VibrixAuthoringManifest }) {
  const result = resolveCueSlotStatus(cue, manifest);
  const label = result.status === 'current'
    ? result.slot?.name ?? cue.target.slotId
    : result.status === 'updated'
      ? 'Updated in Vibrix'
      : 'Missing in Vibrix';
  return <div className={`composition-cue-status ${result.status}`}>{label}</div>;
}
