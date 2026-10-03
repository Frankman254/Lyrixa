import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { isManifestSlotDraggable, parseAuthoringManifest } from '../../core/composition/authoringManifest';
import { resolveCueSlotStatus } from '../../core/composition/slotStatus';
import { createCompositionCueId } from '../../core/composition/score';
import type {
  CompositionCue,
  CompositionScore,
  VibrixAuthoringManifest,
  VibrixManifestSlot
} from '../../core/composition/types';
import './CompositionCatalog.css';

interface CompositionCatalogProps {
  manifest?: VibrixAuthoringManifest;
  score: CompositionScore;
  selectedCueId: string | null;
  currentTime: number;
  onManifestChange: (manifest: VibrixAuthoringManifest) => void;
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
  onManifestChange,
  onScoreChange,
  onSelectCue,
  onExportScore,
  onClose
}: CompositionCatalogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const scenes = manifest?.slots.filter(slot => slot.family === 'scene') ?? [];
  const selectedCue = score.cues.find(cue => cue.id === selectedCueId) ?? null;

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = parseAuthoringManifest(JSON.parse(await file.text()));
      if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
      onManifestChange(parsed.manifest);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read Vibrix manifest.');
    }
  };

  const addAtPlayhead = (slot: VibrixManifestSlot) => {
    if (!isManifestSlotDraggable(slot)) return;
    const track = score.tracks.find(candidate => candidate.kind === 'scene');
    if (!track) return;
    const startTimeMs = Math.max(0, Math.round(currentTime * 1000));
    const cue: CompositionCue = {
      id: createCompositionCueId(score, slot.id, startTimeMs),
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
    onScoreChange({ ...score, cues: [...score.cues, cue] });
    onSelectCue(cue.id);
  };

  const updateSelected = (patch: Partial<CompositionCue>) => {
    if (!selectedCue) return;
    onScoreChange({
      ...score,
      cues: score.cues.map(cue => cue.id === selectedCue.id ? { ...cue, ...patch } : cue)
    });
  };

  const deleteSelected = () => {
    if (!selectedCue) return;
    onScoreChange({ ...score, cues: score.cues.filter(cue => cue.id !== selectedCue.id) });
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
        <button type="button" onClick={() => inputRef.current?.click()}>Import manifest</button>
        <button type="button" onClick={onExportScore} disabled={score.cues.length === 0}>Export score</button>
        <input ref={inputRef} type="file" accept=".json,application/json" hidden onChange={handleFile} />
      </div>

      {manifest ? (
        <div className="composition-catalog-meta">
          <strong>{manifest.projectName}</strong>
          <span>Renderer {manifest.rendererVersion}</span>
          <span>{scenes.length} scenes · revision {manifest.revision}</span>
        </div>
      ) : (
        <div className="composition-catalog-empty">
          Import the <code>.vibrix-manifest.json</code> exported by Vibrix.
        </div>
      )}
      {error && <div className="composition-catalog-error" role="alert">{error}</div>}

      <div className="composition-slot-list">
        {scenes.map(slot => {
          const draggable = isManifestSlotDraggable(slot);
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
                  type: event.target.value as NonNullable<CompositionCue['transition']>['type'],
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

function CueStatus({ cue, manifest }: { cue: CompositionCue; manifest?: VibrixAuthoringManifest }) {
  const result = resolveCueSlotStatus(cue, manifest);
  const label = result.status === 'current'
    ? result.slot?.name ?? cue.target.slotId
    : result.status === 'updated'
      ? 'Updated in Vibrix'
      : 'Missing in Vibrix';
  return <div className={`composition-cue-status ${result.status}`}>{label}</div>;
}
