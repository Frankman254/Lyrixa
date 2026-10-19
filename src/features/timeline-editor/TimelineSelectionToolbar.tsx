import { useState } from 'react';
import { formatTimecode } from '../../core/timeline/clips';
import type { PlayheadEdit } from '../../core/timeline/clipEditing';

interface SelectionBounds {
  count: number;
  startTime: number;
  endTime: number;
  span: number;
}

interface TimelineSelectionToolbarProps {
  hasSelection: boolean;
  selectionBounds: SelectionBounds | null;
  offsetInput: string;
  onSelectAll: () => void;
  onSelectAfterPlayhead: () => void;
  onClearSelection: () => void;
  onDuplicateSelected: () => void;
  onDeleteSelected: () => void;
  onSelectLinked: () => void;
  onInsertBlock: () => void;
  onEditText: () => void;
  canEditText: boolean;
  onPlayheadEdit: (edit: PlayheadEdit) => void;
  onMergeSelected: () => void;
  canMerge: boolean;
  onNudgeSelected: (delta: number) => void;
  onOffsetInputChange: (value: string) => void;
  onApplyOffsetInput: () => void;
  onOffsetAllUnlocked: (delta: number) => void;
}

const NUDGE_STEPS = [-1, -0.5, -0.1, 0.1, 0.5, 1];
const OFFSET_STEPS = [-1, -0.5, -0.1, 0.1, 0.5, 1];

export function TimelineSelectionToolbar({
  hasSelection,
  selectionBounds,
  offsetInput,
  onSelectAll,
  onSelectAfterPlayhead,
  onClearSelection,
  onDuplicateSelected,
  onDeleteSelected,
  onSelectLinked,
  onInsertBlock,
  onEditText,
  canEditText,
  onPlayheadEdit,
  onMergeSelected,
  canMerge,
  onNudgeSelected,
  onOffsetInputChange,
  onApplyOffsetInput,
  onOffsetAllUnlocked
}: TimelineSelectionToolbarProps) {
  // Advanced (nudge + lyrics offset) starts collapsed so the basic actions
  // dominate the bar. The user can pop them open when they actually need to
  // shift timings.
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="tl-selection-bar" role="toolbar" aria-label="Clip selection">
      <div className="tl-sel-group">
        <button
          className="tl-btn small primary"
          onClick={onInsertBlock}
          title="Insert an empty block at the playhead on the active layer (N). Double-click an empty lane to insert there."
        >
          + Block
        </button>
        <button
          className="tl-btn small"
          onClick={onEditText}
          disabled={!canEditText}
          title="Type into the selected clip (Enter or double-click)"
        >
          ✎ Text
        </button>
      </div>

      <div className="tl-sel-group" aria-label="Edit at playhead">
        <button
          className="tl-btn small"
          onClick={() => onPlayheadEdit('split')}
          title="Cut the selected clips — or the active layer's clip under the playhead — in two at the playhead (S)"
        >
          ✂ Split
        </button>
        <button
          className="tl-btn small"
          onClick={onMergeSelected}
          disabled={!canMerge}
          title="Join the selected clips of each layer into one line (J)"
        >
          Merge
        </button>
        <button
          className="tl-btn small"
          onClick={() => onPlayheadEdit('trimStart')}
          title="Move the start to the playhead (Q). With nothing selected: the clip under the playhead, or the next one."
        >
          [ Start
        </button>
        <button
          className="tl-btn small"
          onClick={() => onPlayheadEdit('trimEnd')}
          title="Move the end to the playhead (W). With nothing selected: the clip under the playhead, or the one just heard."
        >
          End ]
        </button>
      </div>

      <div className="tl-sel-group">
        <button className="tl-btn small" onClick={onSelectAll}>Select all</button>
        <button className="tl-btn small" onClick={onSelectAfterPlayhead}>
          After playhead
        </button>
        <button
          className="tl-btn small"
          onClick={onSelectLinked}
          disabled={!hasSelection}
          title="Add the same lyric line on the other layers — translation, romaji (L)"
        >
          + Linked
        </button>
        <button
          className="tl-btn small ghost"
          onClick={onClearSelection}
          disabled={!hasSelection}
        >
          Clear
        </button>
        <button
          className="tl-btn small"
          onClick={onDuplicateSelected}
          disabled={!hasSelection}
          title="Duplicate selected clips"
        >
          ⎘ Duplicate
        </button>
        <button
          className="tl-btn small danger"
          onClick={onDeleteSelected}
          disabled={!hasSelection}
          title="Delete selected clips (Backspace / Delete)"
        >
          Delete
        </button>
      </div>

      <div className="tl-sel-stats">
        {selectionBounds ? (
          <>
            <strong>{selectionBounds.count}</strong> clip{selectionBounds.count === 1 ? '' : 's'}
            {' · '}
            <span className="tl-sel-mono">
              {formatTimecode(selectionBounds.startTime, true)}
              {' → '}
              {formatTimecode(selectionBounds.endTime, true)}
            </span>
            {' · span '}
            <span className="tl-sel-mono">
              {selectionBounds.span.toFixed(2)}s
            </span>
          </>
        ) : (
          <span
            className="tl-sel-hint"
            title="Drag empty space to box-select across layers · Shift adds · ⌘V pastes lines as blocks · double-click to add or edit · N inserts at the playhead · S splits · J merges · Q / W move start / end to the playhead · L adds linked lines"
          >
            Drag empty space to box-select across layers · ⇧ adds · ⌘V pastes lines as blocks
          </span>
        )}
      </div>

      <button
        type="button"
        className={`tl-btn small ghost ${advancedOpen ? 'active' : ''}`}
        onClick={() => setAdvancedOpen(open => !open)}
        title="Show / hide nudge + lyrics offset controls"
      >
        {advancedOpen ? 'Advanced ▴' : 'Advanced ▾'}
      </button>

      {advancedOpen && (
        <>
          <div className="tl-sel-group" aria-label="Nudge selected">
            <span className="tl-sel-label">Nudge</span>
            {NUDGE_STEPS.map(step => (
              <button
                key={`nudge-${step}`}
                className="tl-btn small"
                onClick={() => onNudgeSelected(step)}
                disabled={!hasSelection}
                title={`Shift selected clips by ${step > 0 ? '+' : ''}${step}s`}
              >
                {step > 0 ? `+${step}` : `${step}`}
              </button>
            ))}
          </div>

          <div className="tl-sel-group tl-sel-offset" aria-label="Lyrics offset">
            <span className="tl-sel-label">Lyrics offset</span>
            <input
              type="number"
              step="0.05"
              value={offsetInput}
              onChange={(e) => onOffsetInputChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onApplyOffsetInput();
              }}
              className="tl-sel-offset-input"
              aria-label="Lyrics offset seconds"
            />
            <button
              className="tl-btn small primary"
              onClick={onApplyOffsetInput}
              title="Shift all unlocked clips by the value above"
            >
              Apply
            </button>
            {OFFSET_STEPS.map(step => (
              <button
                key={`offset-${step}`}
                className="tl-btn small"
                onClick={() => onOffsetAllUnlocked(step)}
                title={`Shift all unlocked clips by ${step > 0 ? '+' : ''}${step}s`}
              >
                {step > 0 ? `+${step}` : `${step}`}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
