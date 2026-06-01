import type { ShortcutDefinition } from './types';

/**
 * Single source of truth for every user-visible keyboard shortcut in Lyrixa.
 *
 * Ids are namespaced by the surface that owns them; multiple ids can share a
 * default key when they live in mutually-exclusive contexts (e.g. Space is the
 * transport play/pause in the timeline AND the hold-to-time key inside Sync
 * mode — only one is active at any moment).
 */
export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  // ── Transport ─────────────────────────────────────────────────
  {
    id: 'transport.playPause',
    label: 'Play / Pause',
    description: 'Toggle master track playback while editing the timeline.',
    group: 'Transport',
    default: { key: ' ' }
  },

  // ── Sync mode ─────────────────────────────────────────────────
  {
    id: 'sync.holdTap',
    label: 'Hold to time current line',
    description: 'Press-and-hold while a lyric line is sung; release on its end.',
    group: 'Sync',
    default: { key: ' ' }
  },
  {
    id: 'sync.undo',
    label: 'Undo last line',
    description: 'Removes the last timed clip and seeks back to its end.',
    group: 'Sync',
    default: { key: 'Backspace' }
  },
  {
    id: 'sync.playPause',
    label: 'Play / Pause (sync mode)',
    group: 'Sync',
    default: { key: 'p' }
  },
  {
    id: 'sync.playPauseAlt',
    label: 'Play / Pause alt (sync mode)',
    group: 'Sync',
    default: { key: 'k' }
  },
  {
    id: 'sync.nudgeEarlier',
    label: 'Nudge all timings earlier',
    group: 'Sync',
    default: { key: 'ArrowLeft' }
  },
  {
    id: 'sync.nudgeLater',
    label: 'Nudge all timings later',
    group: 'Sync',
    default: { key: 'ArrowRight' }
  },
  {
    id: 'sync.stepBack',
    label: 'Re-time previous line',
    description: 'Move the cursor back one paragraph so the next tap re-times it.',
    group: 'Sync',
    default: { key: 'ArrowLeft', shift: true }
  },

  // ── Timeline ──────────────────────────────────────────────────
  {
    id: 'timeline.selectAll',
    label: 'Select all clips',
    group: 'Timeline',
    default: { key: 'a', ctrlOrMeta: true }
  },
  {
    id: 'timeline.clearSelection',
    label: 'Clear selection',
    group: 'Timeline',
    default: { key: 'Escape' }
  },
  {
    id: 'timeline.nudgeEarlier',
    label: 'Nudge selected clips earlier',
    description: 'Hold Shift for ½-second steps, Alt for 1-second steps.',
    group: 'Timeline',
    default: { key: 'ArrowLeft' }
  },
  {
    id: 'timeline.nudgeLater',
    label: 'Nudge selected clips later',
    description: 'Hold Shift for ½-second steps, Alt for 1-second steps.',
    group: 'Timeline',
    default: { key: 'ArrowRight' }
  },

  // ── Clip ──────────────────────────────────────────────────────
  {
    id: 'clip.duplicate',
    label: 'Duplicate selected clips',
    description: 'Places a copy of the selected clip or clip group just after the selection.',
    group: 'Clip',
    default: { key: 'd' }
  },
  {
    id: 'clip.delete',
    label: 'Delete selected clips',
    description: 'Deletes the selected clip or clip group from the timeline.',
    group: 'Clip',
    default: { key: 'Backspace' }
  },

  // ── General ───────────────────────────────────────────────────
  {
    id: 'shortcuts.open',
    label: 'Open shortcuts panel',
    group: 'General',
    default: { key: '?', shift: true }
  }
];

export const SHORTCUT_BY_ID: Record<string, ShortcutDefinition> = Object.fromEntries(
  SHORTCUT_DEFINITIONS.map(def => [def.id, def])
);
