import { useState } from 'react';
import { formatTimecode } from '../../core/timeline/clips';

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
        <button className="tl-btn small" onClick={onSelectAll}>Select all</button>
        <button className="tl-btn small" onClick={onSelectAfterPlayhead}>
          After playhead
        </button>
        <button
          className="tl-btn small ghost"
          onClick={onClearSelection}
          disabled={!hasSelection}
        >
          Clear
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
          <span className="muted">No selection</span>
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
