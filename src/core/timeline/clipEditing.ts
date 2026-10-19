import type { LyricClip, LyricWord } from '../types/clip';
import { MIN_CLIP_DURATION, clipDuration } from '../types/clip';
import type { LyricLayer } from '../types/layer';
import { createClipsFromNormalizedLyrics } from './clipsFromLyrics';
import { getSelectableClips } from './clipSelection';

/**
 * Replace a clip's text.
 *
 * `words[]` timed the old text, and the exporters prefer words over text (the
 * enhanced LRC and the Vibrix bundle both read them), so stale words would
 * ship the superseded tokens — they are dropped as soon as the text changes.
 * A block created empty is muted so it never renders as a blank cue; typing
 * into it is the moment it should start showing.
 *
 * Pure: returns the same object when nothing changes.
 */
export function setClipText(clip: LyricClip, text: string): LyricClip {
  if (text === clip.text) return clip;
  const { words: _staleWords, ...rest } = clip;
  void _staleWords;
  const next: LyricClip = { ...rest, text };
  if (clip.muted && clip.text.trim() === '' && text.trim() !== '') {
    next.muted = false;
  }
  return next;
}

export interface InsertClipsOptions {
  layerId: string;
  /** Where the first block starts, in seconds. */
  time: number;
  trackDuration?: number;
  /** Must be unique per call; ids are `${idPrefix}-${index}`. */
  idPrefix: string;
}

export interface InsertClipsResult {
  clips: LyricClip[];
  insertedIds: string[];
}

/**
 * Add hand-made blocks to a layer starting at `time`, one per line.
 *
 * One line is one block (an empty line makes an empty, muted block ready to
 * be typed into): it never runs over the next block on its layer, so a quick
 * insert between two lines doesn't bury the following one. Several lines are
 * a paste: laid out back to back with a duration weighted by length — a first
 * draft the user then drags into place, since they arrive selected.
 */
export function insertClipsAt(
  clips: LyricClip[],
  lines: string[],
  { layerId, time, trackDuration, idPrefix }: InsertClipsOptions
): InsertClipsResult {
  if (lines.length === 0) return { clips, insertedIds: [] };
  const start = Math.max(0, trackDuration != null
    ? Math.min(time, Math.max(0, trackDuration - MIN_CLIP_DURATION))
    : time);
  let inserted = createClipsFromNormalizedLyrics(lines, {
    layerId,
    startTime: start,
    trackDuration,
    strategy: lines.length === 1 ? 'fixed' : 'line-length-weighted',
    idPrefix
  }).map(clip => ({ ...clip, createdBy: 'manual' as const }));

  if (inserted.length === 1) {
    const only = inserted[0]!;
    const nextStart = clips
      .filter(clip => clip.layerId === layerId && clip.startTime > only.startTime)
      .reduce((earliest, clip) => Math.min(earliest, clip.startTime), Infinity);
    if (nextStart < only.endTime && nextStart - only.startTime >= MIN_CLIP_DURATION) {
      inserted = [{ ...only, endTime: nextStart }];
    }
  }

  return {
    clips: [...clips, ...inserted],
    insertedIds: inserted.map(clip => clip.id)
  };
}

/** Split pasted text into lyric lines: trimmed, blank lines dropped. */
export function linesFromPastedText(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map(line => line.trim())
    .filter(Boolean);
}

const CJK_CHAR = /[぀-ヿ㐀-鿿가-힯ｦ-ﾟ]/;

function compact(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * Where to cut `text` so the left part holds the words that end before `time`.
 *
 * Exact only when the words spell the text (whitespace aside), which is what
 * the Transcriptor emits; anything else returns null and the caller falls
 * back to cutting by proportion.
 */
function splitIndexFromWords(text: string, words: LyricWord[], time: number): number | null {
  if (compact(words.map(word => word.text).join('')) !== compact(text)) return null;
  const leftChars = words
    .filter(word => (word.startTime + word.endTime) / 2 < time)
    .reduce((count, word) => count + compact(word.text).length, 0);
  let seen = 0;
  for (let index = 0; index < text.length; index++) {
    if (seen === leftChars) return index;
    if (!/\s/.test(text[index]!)) seen++;
  }
  return text.length;
}

/** Cut by how far into the clip `time` is, on a space when the line has any. */
function splitIndexByProportion(clip: LyricClip, time: number): number {
  const { text } = clip;
  const ratio = (time - clip.startTime) / Math.max(clipDuration(clip), 1e-6);
  const index = Math.round(ratio * text.length);
  if (!/\s/.test(text)) return index;
  let best = -1;
  for (let i = 0; i < text.length; i++) {
    if (/\s/.test(text[i]!) && (best < 0 || Math.abs(i - index) < Math.abs(best - index))) best = i;
  }
  return best < 0 ? index : best;
}

function withText(clip: LyricClip, text: string): LyricClip {
  const next = { ...clip, text };
  if (text === '') next.muted = true;
  return next;
}

/**
 * Cut one clip in two at `time` — the line Whisper glued to the next one.
 *
 * The left half keeps the clip's identity (id, `sourceId`, so its
 * translation stays attached and is flagged stale); the right half is a new
 * hand-made line. With word timings that spell the text, each word goes to
 * the half its midpoint falls in and keeps its timing; otherwise the text is
 * cut by proportion (on a space for spaced scripts) and the words dropped.
 * Returns null when either half would be shorter than `MIN_CLIP_DURATION`.
 */
export function splitClipAt(clip: LyricClip, time: number, rightId: string): [LyricClip, LyricClip] | null {
  if (time - clip.startTime < MIN_CLIP_DURATION || clip.endTime - time < MIN_CLIP_DURATION) return null;
  const words = clip.words ?? [];
  const wordIndex = words.length ? splitIndexFromWords(clip.text, words, time) : null;
  const index = wordIndex ?? splitIndexByProportion(clip, time);
  const leftText = clip.text.slice(0, index).trim();
  const rightText = clip.text.slice(index).trim();

  const { words: _words, sourceId: _sourceId, sourceIndex: _sourceIndex,
    sourceTextHash: _hash, ...base } = clip;
  void _words; void _sourceId; void _sourceIndex; void _hash;

  const { words: _leftWords, ...leftBase } = clip;
  void _leftWords;
  const left = withText({ ...leftBase, endTime: time }, leftText);
  const right = withText({ ...base, id: rightId, startTime: time, createdBy: 'manual' }, rightText);
  if (wordIndex != null) {
    const leftWords = words.filter(word => (word.startTime + word.endTime) / 2 < time);
    const rightWords = words.filter(word => (word.startTime + word.endTime) / 2 >= time);
    if (leftWords.length) left.words = leftWords;
    if (rightWords.length) right.words = rightWords;
  }
  return [left, right];
}

function joinLyricText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  const glue = CJK_CHAR.test(left.at(-1)!) && CJK_CHAR.test(right[0]!) ? '' : ' ';
  return left + glue + right;
}

/**
 * Join clips into one per layer — the line Whisper broke in pieces.
 *
 * Each layer with two or more of `ids` becomes a single clip spanning them,
 * keeping the earliest clip's id and look. Texts are joined with a space,
 * except between two CJK characters. Word timings survive only when every
 * piece had them. Layers with a single selected clip are left alone.
 */
export function mergeClips(clips: LyricClip[], ids: ReadonlySet<string>): { clips: LyricClip[]; mergedIds: string[] } {
  const byLayer = new Map<string, LyricClip[]>();
  for (const clip of clips) {
    if (!ids.has(clip.id)) continue;
    byLayer.set(clip.layerId, [...(byLayer.get(clip.layerId) ?? []), clip]);
  }
  const replaced = new Map<string, LyricClip | null>();
  const mergedIds: string[] = [];
  for (const group of byLayer.values()) {
    if (group.length < 2) continue;
    const ordered = [...group].sort((a, b) => a.startTime - b.startTime);
    const first = ordered[0]!;
    const { words: _words, ...base } = first;
    void _words;
    const merged: LyricClip = {
      ...base,
      text: ordered.reduce((text, clip) => joinLyricText(text, clip.text.trim()), ''),
      startTime: first.startTime,
      endTime: Math.max(...ordered.map(clip => clip.endTime)),
      muted: ordered.every(clip => clip.muted) || undefined
    };
    if (merged.muted === undefined) delete merged.muted;
    if (ordered.every(clip => clip.words?.length)) {
      merged.words = ordered.flatMap(clip => clip.words!);
    }
    replaced.set(first.id, merged);
    for (const clip of ordered.slice(1)) replaced.set(clip.id, null);
    mergedIds.push(first.id);
  }
  if (mergedIds.length === 0) return { clips, mergedIds };
  const next: LyricClip[] = [];
  for (const clip of clips) {
    const swap = replaced.get(clip.id);
    if (swap === undefined) next.push(clip);
    else if (swap) next.push(swap);
  }
  return { clips: next, mergedIds };
}

/**
 * Move one edge of a clip to `time` (the playhead), keeping at least
 * `MIN_CLIP_DURATION`. Words left wholly outside the new window are dropped.
 * Returns the same object when the move isn't possible.
 */
export function trimClipEdge(clip: LyricClip, time: number, edge: 'start' | 'end'): LyricClip {
  if (edge === 'start') {
    const start = Math.max(0, time);
    if (start === clip.startTime || clip.endTime - start < MIN_CLIP_DURATION) return clip;
    const next = { ...clip, startTime: start };
    if (clip.words) next.words = clip.words.filter(word => word.endTime > start);
    return next;
  }
  if (time === clip.endTime || time - clip.startTime < MIN_CLIP_DURATION) return clip;
  const next = { ...clip, endTime: time };
  if (clip.words) next.words = clip.words.filter(word => word.startTime < time);
  return next;
}

export type PlayheadEdit = 'split' | 'trimStart' | 'trimEnd';

export interface PlayheadEditOptions {
  edit: PlayheadEdit;
  time: number;
  /** The selection wins; with nothing selected the edit acts on this layer. */
  selectedIds: ReadonlySet<string>;
  activeLayerId: string | null;
  /** Unique per call; split halves get `${idPrefix}-${index}`. */
  idPrefix: string;
}

/** Which clips a playhead edit acts on when nothing is selected. */
function clipAtPlayhead(layerClips: LyricClip[], time: number, edit: PlayheadEdit): LyricClip | undefined {
  const under = layerClips.find(clip => clip.startTime < time && time < clip.endTime);
  if (under || edit === 'split') return under;
  // Listening along, the playhead is often just past the line that should
  // have ended (End) or just before the one that should already start (Start).
  if (edit === 'trimEnd') {
    return layerClips
      .filter(clip => clip.startTime < time)
      .reduce<LyricClip | undefined>((last, clip) => (!last || clip.startTime > last.startTime ? clip : last), undefined);
  }
  return layerClips
    .filter(clip => clip.startTime > time)
    .reduce<LyricClip | undefined>((next, clip) => (!next || clip.startTime < next.startTime ? clip : next), undefined);
}

/**
 * Split, or move the start/end of, clips at the playhead — the edits made
 * while listening. Acts on the selected clips; with none selected, on the
 * active layer's clip under the playhead (End also reaches the line just
 * heard, Start the line coming next). Locked clips and layers are skipped.
 * `affectedIds` is what the editor selects afterwards: the right half of
 * each cut — the line now playing, ready for the next cut — or the clips
 * whose edge moved.
 */
export function applyPlayheadEdit(
  clips: LyricClip[],
  layers: LyricLayer[],
  { edit, time, selectedIds, activeLayerId, idPrefix }: PlayheadEditOptions
): { clips: LyricClip[]; affectedIds: string[] } {
  const editable = getSelectableClips(clips, layers, { requireVisible: false });
  let targets: LyricClip[];
  if (selectedIds.size > 0) {
    targets = editable.filter(clip => selectedIds.has(clip.id));
  } else {
    const fallback = clipAtPlayhead(editable.filter(clip => clip.layerId === activeLayerId), time, edit);
    targets = fallback ? [fallback] : [];
  }
  const targetIds = new Set(targets.map(clip => clip.id));
  const affectedIds: string[] = [];
  const next: LyricClip[] = [];
  let made = 0;
  for (const clip of clips) {
    if (!targetIds.has(clip.id)) {
      next.push(clip);
      continue;
    }
    if (edit === 'split') {
      const halves = splitClipAt(clip, time, `${idPrefix}-${made}`);
      if (!halves) {
        next.push(clip);
        continue;
      }
      made++;
      next.push(...halves);
      affectedIds.push(halves[1].id);
      continue;
    }
    const moved = trimClipEdge(clip, time, edit === 'trimStart' ? 'start' : 'end');
    next.push(moved);
    if (moved !== clip) affectedIds.push(clip.id);
  }
  return affectedIds.length ? { clips: next, affectedIds } : { clips, affectedIds };
}
