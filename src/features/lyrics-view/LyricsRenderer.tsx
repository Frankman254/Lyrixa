import { useEffect, useRef } from 'react';
import type { TimelineSnapshot, TimelineEntry } from '../../core/types/timeline';
import type { LyricLine } from '../../core/types/lyrics';
import './LyricsRenderer.css';

interface LyricsRendererProps {
  entries: TimelineEntry<LyricLine>[];
  snapshot: TimelineSnapshot<LyricLine>;
  onLineClick?: (time: number) => void;
}

export function LyricsRenderer({ entries, snapshot, onLineClick }: LyricsRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logic tied to active index
  useEffect(() => {
    if (snapshot.activeIndex >= 0 && containerRef.current) {
      const activeElement = containerRef.current.querySelector('[data-active="true"]');
      if (activeElement) {
        activeElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [snapshot.activeIndex]);

  const isInstrumental = snapshot.phase === 'instrumental-gap';

  return (
    <div className={`lyrics-wrapper ${isInstrumental ? 'instrumental-ambient' : ''}`} ref={containerRef}>
      <div className="scroll-padding-top" />
      {entries.map((entry, index) => {
        const isActive = index === snapshot.activeIndex;
        const isUpcoming = index > snapshot.activeIndex;
        const isPast = index < snapshot.activeIndex;
        const isEmpty = entry.data.text.trim() === '';

        // Inject interpolation variable for fluidity
        const progressStyle = isActive ? { '--progress': snapshot.progress } as React.CSSProperties : {};

        return (
          <div
            key={entry.id}
            data-active={isActive}
            className={`lyric-line-box ${isActive ? 'active' : ''} ${isUpcoming ? 'upcoming' : ''} ${isPast ? 'past' : ''} ${isEmpty ? 'empty' : ''}`}
            style={progressStyle}
            onClick={() => onLineClick?.(entry.startTime)}
            role="button"
            tabIndex={0}
          >
            <span className="lyric-text">{entry.data.text || '•••'}</span>
            {isActive && !isInstrumental && (
              <div className="progress-bar-container">
                <div className="progress-bar-fill" />
              </div>
            )}
          </div>
        );
      })}
      <div className="scroll-padding-bottom" />
    </div>
  );
}
