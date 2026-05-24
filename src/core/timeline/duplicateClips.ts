import type { LyricClip } from '../types/clip';

interface DuplicateClipSelectionOptions {
  trackDuration?: number;
  gapSeconds?: number;
}

export interface DuplicateClipSelectionResult {
  clips: LyricClip[];
  duplicatedIds: string[];
}

export function duplicateClipSelection(
  clips: LyricClip[],
  clipIds: Iterable<string>,
  {
    trackDuration,
    gapSeconds = 0.1
  }: DuplicateClipSelectionOptions = {}
): DuplicateClipSelectionResult {
  const selectedIds = new Set(clipIds);
  const originals = clips
    .filter(clip => selectedIds.has(clip.id))
    .sort((a, b) => a.startTime - b.startTime || a.layerId.localeCompare(b.layerId));

  if (originals.length === 0) {
    return { clips, duplicatedIds: [] };
  }

  const start = Math.min(...originals.map(clip => clip.startTime));
  const end = Math.max(...originals.map(clip => clip.endTime));
  const span = Math.max(0.25, end - start);
  const requestedShift = span + gapSeconds;
  const boundedShift = Number.isFinite(trackDuration)
    ? Math.max(0, Math.min(requestedShift, Math.max(0, trackDuration! - end)))
    : requestedShift;
  const shift = boundedShift > 0 ? boundedShift : requestedShift;
  const stamp = Date.now().toString(36);

  const duplicatedIds: string[] = [];
  const duplicates = originals.map((clip, index) => {
    const id = `dup-${stamp}-${index}-${Math.random().toString(36).slice(2, 6)}`;
    duplicatedIds.push(id);
    return {
      ...clip,
      id,
      sourceId: clip.sourceId ? `${clip.sourceId}-dup-${id}` : id,
      sourceIndex: undefined,
      startTime: clip.startTime + shift,
      endTime: clip.endTime + shift,
      createdBy: 'manual' as const
    };
  });

  return {
    clips: [...clips, ...duplicates],
    duplicatedIds
  };
}
