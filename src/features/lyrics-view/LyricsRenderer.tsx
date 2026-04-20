import { useEffect, useRef } from 'react';
import type { TimelineSnapshot, TimelineEntry } from '../../core/types/timeline';
import type { LyricLine } from '../../core/types/lyrics';
import './LyricsRenderer.css'; // Premium Vanilla CSS

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

  return (
    <div className="lyrics-wrapper" ref={containerRef}>
      <div className="scroll-padding-top" />
      {entries.map((entry, index) => {
        const isActive = index === snapshot.activeIndex;
        const isPast = index < snapshot.activeIndex;

        // Skip rendering completely blank space strings if they aren't active to save UI noise, 
        // Or render them smaller. Let's just render them as small breaks.
        const isEmpty = entry.data.text.trim() === '';

        return (
          <div
            key={entry.id}
            data-active={isActive}
            className={`lyric-line-box ${isActive ? 'active' : ''} ${isPast ? 'past' : ''} ${isEmpty ? 'empty' : ''}`}
            onClick={() => onLineClick?.(entry.startTime)}
            role="button"
            tabIndex={0}
          >
            <span className="lyric-text">{entry.data.text || '•••'}</span>
          </div>
        );
      })}
      <div className="scroll-padding-bottom" />
    </div>
  );
}
