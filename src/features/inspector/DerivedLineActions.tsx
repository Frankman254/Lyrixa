import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LyricClip } from '../../core/types/clip';
import type { LyricLayer } from '../../core/types/layer';
import { LYRIC_LAYER_ROLE_LABELS, isDerivedTextRole } from '../../core/types/layer';
import {
  buildLayerRoleIndex,
  findPrimaryClip,
  getRelatedClipsForClip,
  isDerivedClipStale,
  markDerivedClipFresh
} from '../../core/timeline/lineIdentity';
import type { TranslationService } from '../../core/translation/translationService';
import { Group } from './InspectorPrimitives';

/**
 * The derived-line half of the clip inspector.
 *
 * It appears only for a clip on a translation or romanization layer that has a
 * primary line behind it, and it does exactly three things: show the line this
 * text came from, say whether that line has changed since, and let the author
 * ask for one — one — line to be re-translated.
 *
 * Everything here is manual on purpose. A translation the author corrected by
 * hand is real work, so nothing regenerates text without a click, and the
 * staleness badge is computed from the primary text rather than stored, so
 * undoing an edit clears it on its own.
 */

interface DerivedLineActionsProps {
  clip: LyricClip;
  clips: LyricClip[];
  layers: LyricLayer[];
  translation: TranslationService;
  onPatchClip: (patch: Partial<LyricClip>) => void;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'failed'; message: string };

export function DerivedLineActions({
  clip,
  clips,
  layers,
  translation,
  onPatchClip
}: DerivedLineActionsProps) {
  const roles = useMemo(() => buildLayerRoleIndex(layers), [layers]);
  const role = roles.get(clip.layerId);
  const layer = layers.find(item => item.id === clip.layerId);
  const primary = findPrimaryClip(clips, layers, clip.sourceId);
  const derived = isDerivedTextRole(role) && primary !== undefined && primary.id !== clip.id;

  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // Asked once, and only for a clip that could actually use the answer: a
  // standalone session never reaches the service at all.
  useEffect(() => {
    if (!derived) return;
    let cancelled = false;
    void translation.isAvailable().then(
      ok => { if (!cancelled) setAvailable(ok); },
      () => { if (!cancelled) setAvailable(false); }
    );
    return () => { cancelled = true; };
  }, [derived, translation]);

  const targetLanguage = layer?.language;

  const retranslate = useCallback(async () => {
    if (!primary || !targetLanguage) return;
    setStatus({ kind: 'working' });
    try {
      const neighbours = primaryNeighbours(clips, primary);
      const result = await translation.translateLine({
        text: primary.text,
        targetLanguage,
        sourceLanguage: layers.find(item => item.id === primary.layerId)?.language,
        context: neighbours
      });
      // Text and fingerprint move together: the clip is only "up to date"
      // with respect to the exact primary text it was just built from.
      onPatchClip({
        text: result.text,
        sourceTextHash: markDerivedClipFresh(clip, primary.text).sourceTextHash
      });
      setStatus({ kind: 'idle' });
    } catch (error) {
      setStatus({
        kind: 'failed',
        message: error instanceof Error ? error.message : 'The line could not be translated.'
      });
    }
  }, [clip, clips, layers, onPatchClip, primary, targetLanguage, translation]);

  const acceptAsIs = useCallback(() => {
    if (!primary) return;
    onPatchClip({ sourceTextHash: markDerivedClipFresh(clip, primary.text).sourceTextHash });
  }, [clip, onPatchClip, primary]);

  if (!derived || !primary) return null;

  const stale = isDerivedClipStale(clip, primary);
  const roleLabel = role ? LYRIC_LAYER_ROLE_LABELS[role] : 'Derived';
  const related = getRelatedClipsForClip(clips, clip).length;

  return (
    <Group title={`${roleLabel} of a line`} open>
      <div className="insp-derived">
        <div className="insp-derived-head">
          <span className="insp-derived-role">
            {roleLabel}{targetLanguage ? ` · ${targetLanguage}` : ''}
          </span>
          {stale && <span className="insp-derived-badge">Source changed</span>}
        </div>

        <label>
          Source line
          <textarea
            className="form-control form-input"
            rows={2}
            value={primary.text}
            readOnly
            title="Edit this text on its own layer. Editing it here would move work between layers."
          />
        </label>

        <p className="insp-derived-note">
          {related} line{related === 1 ? '' : 's'} share this timing. Editing this text never
          moves the clip; drag it on the timeline if you want it to sit elsewhere.
        </p>

        <div className="insp-button-row">
          <button
            type="button"
            className="ls-btn small"
            disabled={!available || !targetLanguage || status.kind === 'working'}
            onClick={() => void retranslate()}
            title={retranslateHint(available, targetLanguage, translation.name)}
          >
            {status.kind === 'working' ? 'Translating…' : '↻ Retranslate'}
          </button>
          {stale && (
            <button
              type="button"
              className="ls-btn ghost small"
              onClick={acceptAsIs}
              title="Keep this text and stop reporting it as out of date."
            >
              Keep as is
            </button>
          )}
        </div>

        {status.kind === 'failed' && <p className="insp-derived-error">{status.message}</p>}
        {!available && (
          <p className="insp-derived-note">
            No translation service is running. Everything else on this clip still works.
          </p>
        )}
        {available && !targetLanguage && (
          <p className="insp-derived-note">
            Set this layer’s language in the Layer tab to enable retranslation.
          </p>
        )}
      </div>
    </Group>
  );
}

function retranslateHint(
  available: boolean,
  targetLanguage: string | undefined,
  serviceName: string
): string {
  if (!available) return 'No translation service is available right now.';
  if (!targetLanguage) return 'This layer has no language set.';
  return `Ask ${serviceName} to translate this one line into ${targetLanguage}.`;
}

/**
 * The lines immediately before and after the primary, on its own layer.
 *
 * Context only — the service is asked to translate one line and return one
 * line. Nothing else from the project is sent.
 */
function primaryNeighbours(
  clips: LyricClip[],
  primary: LyricClip
): { previous?: string; next?: string } {
  const lane = clips
    .filter(clip => clip.layerId === primary.layerId)
    .sort((a, b) => a.startTime - b.startTime);
  const index = lane.findIndex(clip => clip.id === primary.id);
  if (index < 0) return {};
  return {
    previous: lane[index - 1]?.text,
    next: lane[index + 1]?.text
  };
}
