import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import {
  descriptorForPlacement,
  filterCatalogGroup,
  groupManifestForCatalog,
  placeFromCatalog,
  timelineTrackNameForKind
} from '../../core/composition/catalog';
import type { CompositionPlacement } from '../../core/composition/catalog';
import {
  isManifestSlotDraggable,
  parseAuthoringSource
} from '../../core/composition/authoringManifest';
import { resolveCueDependencyStatus, resolveCueSlotStatus } from '../../core/composition/slotStatus';
import { createCompositionCueId } from '../../core/composition/score';
import type {
  CompositionCueV1,
  CompositionCueV2,
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
  sourceLoading?: boolean;
  onAuthoringImport: (source: VibrixAuthoringSource) => Promise<void>;
  onScoreChange: (score: CompositionScore) => void;
  onSelectCue: (cueId: string | null) => void;
  onExportScore: () => void;
  onClose?: () => void;
}

export const VIBRIX_SLOT_DRAG_TYPE = 'application/x-lyrixa-vibrix-slot';
export const VIBRIX_PLACEMENT_DRAG_TYPE = 'application/x-lyrixa-vibrix-placement';

type CatalogTab = 'all' | 'images' | 'scenes' | 'slots';

function readStoredTab(): CatalogTab {
  try {
    const raw = window.localStorage.getItem('lyrixa_compose_catalog_tab');
    return raw === 'images' || raw === 'scenes' || raw === 'slots' ? raw : 'all';
  } catch {
    return 'all';
  }
}

const WINDOW_STEP = 80;

/**
 * Renders the first `WINDOW_STEP` rows and grows the window when a sentinel
 * scrolls near the viewport. Authoring packages can carry 230+ images whose
 * previews are inline data URLs, so mounting all at once stalls the panel.
 */
function CatalogSection({
  label,
  count,
  open,
  onToggle,
  children
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="composition-catalog-section">
      <button type="button" className="composition-section-header" onClick={onToggle} aria-expanded={open}>
        <span>
          {label} <small>{count}</small>
        </span>
        <span className={`composition-section-chevron ${open ? 'open' : ''}`} aria-hidden="true">›</span>
      </button>
      {open && children}
    </section>
  );
}

function WindowedList<T>({ items, renderItem }: { items: T[]; renderItem: (item: T, index: number) => ReactNode }) {
  const [limit, setLimit] = useState(WINDOW_STEP);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    setLimit(WINDOW_STEP);
  }, [items]);
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || limit >= items.length) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting)) {
          setLimit(current => Math.min(current + WINDOW_STEP, items.length));
        }
      },
      { rootMargin: '400px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, items]);
  if (items.length === 0) return null;
  return (
    <>
      {items.slice(0, limit).map((item, index) => renderItem(item, index))}
      {limit < items.length && <div ref={sentinelRef} className="composition-window-sentinel" aria-hidden="true" />}
    </>
  );
}

export function CompositionCatalog({
  manifest,
  score,
  selectedCueId,
  currentTime,
  sourceKind,
  sourceUnavailable,
  sourceLoading,
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
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<CatalogTab>(() => readStoredTab());
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setQuery('');
  }, [manifest?.revision, manifest?.projectName]);

  const switchTab = (next: CatalogTab) => {
    setTab(next);
    try { window.localStorage.setItem('lyrixa_compose_catalog_tab', next); } catch { /* ignore */ }
  };

  // The All/Slots tabs start with every accordion closed so hundreds of images
  // never bury the families; a section gets its own tab when it is the focus.
  const sectionDefaultOpen = (key: string) =>
    (key === 'images' && tab === 'images') || (key === 'scenes' && tab === 'scenes');

  const toggleSection = (key: string) => {
    setCollapsed(state => ({ ...state, [key]: !(state[key] ?? sectionDefaultOpen(key)) }));
  };

  // A search must reveal matches instead of hiding them behind a closed accordion,
  // so filters force sections open; otherwise the stored collapse state wins.
  const searching = query.trim() !== '';
  const sectionOpen = (key: string) => (searching ? true : collapsed[key] ?? sectionDefaultOpen(key));

  const legacyScore = score.schemaVersion === 1 ? score : null;
  const sustainedScore = score.schemaVersion === 2 ? score : null;
  const rawGroups = useMemo(() => (manifest ? groupManifestForCatalog(manifest) : null), [manifest]);
  const groups = useMemo(
    () => (rawGroups ? filterCatalogGroup(rawGroups, query) : null),
    [rawGroups, query]
  );
  const selectedCueV1 = legacyScore?.cues.find(cue => cue.id === selectedCueId) ?? null;
  const selectedCueV2 = sustainedScore?.cues.find(cue => cue.id === selectedCueId) ?? null;

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

  const startPlacementDrag = (event: DragEvent<HTMLElement>, placement: CompositionPlacement) => {
    event.dataTransfer.setData(
      VIBRIX_PLACEMENT_DRAG_TYPE,
      JSON.stringify(descriptorForPlacement(placement))
    );
    if (placement.kind === 'scene' || placement.kind === 'granular') {
      event.dataTransfer.setData(VIBRIX_SLOT_DRAG_TYPE, placement.slot.id);
    }
    event.dataTransfer.effectAllowed = 'copy';
  };

  const addLegacySceneAtPlayhead = (slot: VibrixManifestSlot) => {
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

  const place = (placement: CompositionPlacement) => {
    if (sustainedScore) {
      const result = placeFromCatalog(
        sustainedScore,
        placement,
        Math.max(0, Math.round(currentTime * 1000))
      );
      if (!result) return;
      onScoreChange(result.score);
      onSelectCue(result.cue.id);
      return;
    }
    if (placement.kind === 'scene') addLegacySceneAtPlayhead(placement.slot);
  };

  const updateSelectedV1 = (patch: Partial<CompositionCueV1>) => {
    if (!selectedCueV1 || !legacyScore) return;
    onScoreChange({
      ...legacyScore,
      cues: legacyScore.cues.map(cue => cue.id === selectedCueV1.id ? { ...cue, ...patch } : cue)
    });
  };

  const updateSelectedV2 = (patch: Partial<CompositionCueV2>) => {
    if (!selectedCueV2 || !sustainedScore) return;
    onScoreChange({
      ...sustainedScore,
      cues: sustainedScore.cues.map(cue => cue.id === selectedCueV2.id ? { ...cue, ...patch } : cue)
    });
  };

  const deleteSelectedV1 = () => {
    if (!selectedCueV1 || !legacyScore) return;
    onScoreChange({ ...legacyScore, cues: legacyScore.cues.filter(cue => cue.id !== selectedCueV1.id) });
    onSelectCue(null);
  };

  const deleteSelectedV2 = () => {
    if (!selectedCueV2 || !sustainedScore) return;
    onScoreChange({ ...sustainedScore, cues: sustainedScore.cues.filter(cue => cue.id !== selectedCueV2.id) });
    onSelectCue(null);
  };

  const slotDisabledHint = (slot: VibrixManifestSlot): string | null =>
    isManifestSlotDraggable(slot) ? null : 'This slot cannot be placed';

  const renderSlotCard = (
    slot: VibrixManifestSlot,
    placement: CompositionPlacement,
    disabledHint: string | null
  ) => {
    const enabled = disabledHint === null && (sustainedScore !== null || legacyScore !== null);
    return (
      <CatalogItem
        key={`${placement.kind === 'granular' ? placement.family : 'slot'}-${slot.id}`}
        name={slot.name}
        sub={slot.revision === 'empty' ? 'Empty slot' : slot.id}
        enabled={enabled}
        disabledHint={disabledHint ?? 'This project uses a legacy score; place objects after opening it in v2'}
        onDragStart={event => startPlacementDrag(event, placement)}
        onAdd={() => place(placement)}
      />
    );
  };

  return (
    <aside className="composition-catalog" aria-label="Vibrix composition catalog">
      <header className="composition-catalog-header">
        <div>
          <span className="label-eyebrow">Vibrix</span>
          <strong>Vibrix catalog</strong>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close catalog">×</button>}
      </header>

      <div className="composition-catalog-actions">
        <button type="button" disabled={importing} onClick={() => inputRef.current?.click()}>
          {importing ? 'Importing…' : 'Import authoring'}
        </button>
        <button type="button" onClick={onExportScore} disabled={score.cues.length === 0 || sourceLoading}>Export score</button>
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
            {` · ${groups?.scenes.length ?? 0} scenes`}
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

      {groups && (
        <div className="composition-catalog-search">
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search slots and images"
            aria-label="Search catalog"
          />
        </div>
      )}

      {rawGroups && (
        <div className="composition-catalog-tabs" role="tablist" aria-label="Catalog kind">
          {([
            ['all', 'All', rawGroups.images.length + rawGroups.scenes.length + rawGroups.granular.reduce((t, s) => t + s.slots.length, 0)],
            ['images', 'Images', rawGroups.images.length],
            ['scenes', 'Scenes', rawGroups.scenes.length],
            ['slots', 'Slots', rawGroups.granular.reduce((t, s) => t + s.slots.length, 0)]
          ] as [CatalogTab, string, number][]).map(([id, label, total]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'active' : ''}
              onClick={() => switchTab(id)}
            >
              {label} <small>{total}</small>
            </button>
          ))}
        </div>
      )}

      <div className="composition-slot-list">
        {groups && (tab === 'all' || tab === 'images') && (
          <CatalogSection
            label="Images"
            count={groups.images.length}
            open={sectionOpen('images')}
            onToggle={() => toggleSection('images')}
          >
            {groups.images.length > 0 ? (
              <WindowedList
                items={groups.images}
                renderItem={image => {
                  const placement: CompositionPlacement = { kind: 'image', image };
                  const enabled = sustainedScore !== null && image.enabled;
                  return (
                    <CatalogItem
                      key={`image-${image.id}`}
                      name={image.name}
                      sub={image.id}
                      thumbnail={image.thumbnailDataUrl
                        ? <img src={image.thumbnailDataUrl} alt="" draggable={false} />
                        : undefined}
                      enabled={enabled}
                      disabledHint={image.enabled
                        ? 'This project uses a legacy score; place objects after opening it in v2'
                        : 'Disabled in Vibrix'}
                      onDragStart={event => startPlacementDrag(event, placement)}
                      onAdd={() => place(placement)}
                    />
                  );
                }}
              />
            ) : (
              <p className="composition-section-empty">
                {searching ? 'No images match your search.' : 'This package has no images.'}
              </p>
            )}
          </CatalogSection>
        )}

        {groups && (tab === 'all' || tab === 'scenes') && (
          <CatalogSection
            label="Scenes"
            count={groups.scenes.length}
            open={sectionOpen('scenes')}
            onToggle={() => toggleSection('scenes')}
          >
            {groups.scenes.length > 0 ? (
              <WindowedList
                items={groups.scenes}
                renderItem={slot => renderSlotCard(slot, { kind: 'scene', slot }, slotDisabledHint(slot))}
              />
            ) : (
              <p className="composition-section-empty">
                {searching ? 'No scenes match your search.' : 'This package has 0 scenes.'}
              </p>
            )}
          </CatalogSection>
        )}

        {groups && (tab === 'all' || tab === 'slots') && (
          groups.granular.length > 0 ? groups.granular.map(section => {
            const label = timelineTrackNameForKind(section.family);
            return (
              <CatalogSection
                key={section.family}
                label={label}
                count={section.slots.length}
                open={sectionOpen(`family-${section.family}`)}
                onToggle={() => toggleSection(`family-${section.family}`)}
              >
                <WindowedList
                  items={section.slots}
                  renderItem={slot => renderSlotCard(
                    slot,
                    { kind: 'granular', slot, family: section.family },
                    slotDisabledHint(slot)
                  )}
                />
                <CatalogItem
                  key={`inherit-${section.family}`}
                  name={`Inherit ${label}`}
                  sub="returns this lane to scene inheritance"
                  enabled={sustainedScore !== null}
                  disabledHint="Inherit cuts are a sustained-score v2 feature"
                  inherit
                  onDragStart={event => startPlacementDrag(event, { kind: 'inherit', family: section.family })}
                  onAdd={() => place({ kind: 'inherit', family: section.family })}
                />
              </CatalogSection>
            );
          }) : (
            <p className="composition-section-empty">No granular slots match your search.</p>
          )
        )}
      </div>

      {selectedCueV1 && legacyScore && (
        <section className="composition-cue-inspector">
          <div className="composition-section-title">Selected cue</div>
          <CueStatus cue={selectedCueV1} manifest={manifest} />
          <label>
            Start (ms)
            <input
              type="number"
              value={selectedCueV1.startTimeMs}
              onChange={event => updateSelectedV1({ startTimeMs: Math.max(0, Math.round(Number(event.target.value))) })}
            />
          </label>
          <label>
            End (ms)
            <input
              type="number"
              value={selectedCueV1.endTimeMs}
              onChange={event => updateSelectedV1({ endTimeMs: Math.max(selectedCueV1.startTimeMs + 1, Math.round(Number(event.target.value))) })}
            />
          </label>
          <label>
            Transition
            <select
              value={selectedCueV1.transition?.type ?? 'cut'}
              onChange={event => updateSelectedV1({
                transition: {
                  type: event.target.value as NonNullable<CompositionCueV1['transition']>['type'],
                  durationMs: selectedCueV1.transition?.durationMs ?? 0,
                  easing: selectedCueV1.transition?.easing ?? 'linear'
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
              value={selectedCueV1.transition?.durationMs ?? 0}
              onChange={event => updateSelectedV1({
                transition: {
                  type: selectedCueV1.transition?.type ?? 'cut',
                  durationMs: Math.max(0, Math.round(Number(event.target.value))),
                  easing: selectedCueV1.transition?.easing ?? 'linear'
                }
              })}
            />
          </label>
          <button type="button" className="composition-delete" onClick={deleteSelectedV1}>Delete cue</button>
        </section>
      )}

      {selectedCueV2 && sustainedScore && (
        <section className="composition-cue-inspector">
          <div className="composition-section-title">Selected cut</div>
          <CueV2Status cue={selectedCueV2} manifest={manifest} />
          <label>
            Start (ms)
            <input
              type="number"
              min="0"
              value={selectedCueV2.startTimeMs}
              onChange={event => updateSelectedV2({ startTimeMs: Math.max(0, Math.round(Number(event.target.value))) })}
            />
          </label>
          <p className="composition-derived-note">
            The cut holds until the next one in its lane. Move it on the timeline.
          </p>
          <button type="button" className="composition-delete" onClick={deleteSelectedV2}>Delete cut</button>
        </section>
      )}
    </aside>
  );
}

interface CatalogItemProps {
  name: string;
  sub: string;
  thumbnail?: ReactNode;
  enabled: boolean;
  disabledHint: string;
  inherit?: boolean;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onAdd: () => void;
}

function CatalogItem({
  name,
  sub,
  thumbnail,
  enabled,
  disabledHint,
  inherit = false,
  onDragStart,
  onAdd
}: CatalogItemProps) {
  return (
    <article
      className={`composition-slot-card ${inherit ? 'composition-inherit-card' : ''} ${enabled ? '' : 'disabled'}`}
      draggable={enabled}
      onDragStart={enabled ? onDragStart : undefined}
    >
      <span className="composition-card-thumb" aria-hidden="true">
        {thumbnail ?? <span className="composition-thumb-placeholder">{name.slice(0, 2).toUpperCase()}</span>}
      </span>
      <div>
        <strong>{name}</strong>
        <span>{sub}</span>
      </div>
      <button
        type="button"
        disabled={!enabled}
        onClick={onAdd}
        title={enabled ? `Add ${name} at playhead` : disabledHint}
        aria-label={enabled ? `Add ${name} at playhead` : `${name}: ${disabledHint}`}
      >
        +
      </button>
    </article>
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

function CueV2Status({ cue, manifest }: { cue: CompositionCueV2; manifest?: VibrixAuthoringManifest }) {
  const result = resolveCueDependencyStatus(cue, manifest);
  const label = result.status === 'current'
    ? result.slot?.name ?? result.image?.name ?? 'Current'
    : result.status === 'inherit'
      ? 'Returns this lane to scene inheritance'
      : result.status === 'updated'
        ? 'Updated in Vibrix'
        : result.status === 'empty'
          ? 'Empty in Vibrix'
          : result.status === 'disabled'
            ? 'Disabled in Vibrix'
            : 'Missing in Vibrix';
  return <div className={`composition-cue-status ${result.status}`}>{label}</div>;
}
