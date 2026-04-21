import { useEffect, useRef } from 'react';
import type { TimelineSnapshot, TimelineEntry } from '../../core/types/timeline';
import type { LyricLine } from '../../core/types/lyrics';
import type { LyricVisualStyle } from '../../core/types/render';
import { DEFAULT_LYRIC_STYLE } from '../../core/types/render';
import './LyricsRenderer.css';

interface LyricsRendererProps {
  entries: TimelineEntry<LyricLine>[];
  snapshot: TimelineSnapshot<LyricLine>;
  styleConfig?: LyricVisualStyle;
  onLineClick?: (time: number) => void;
}

export function LyricsRenderer({ entries, snapshot, styleConfig = DEFAULT_LYRIC_STYLE, onLineClick }: LyricsRendererProps) {
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

  // Construct Custom CSS Properties from Style Config
  const cssVariables = {
    '--lyric-color-primary': styleConfig.textColor,
    '--lyric-color-active': styleConfig.activeTextColor,
    '--lyric-color-secondary': styleConfig.secondaryTextColor,
    '--lyric-glow': styleConfig.glowColor,
    '--lyric-shadow-intensity': styleConfig.shadowIntensity,
    '--lyric-blur': `${styleConfig.blurAmount}px`,
    '--lyric-font-size': styleConfig.fontSize,
    '--lyric-font-weight': styleConfig.fontWeight,
    '--lyric-letter-spacing': styleConfig.letterSpacing,
    '--lyric-line-spacing': styleConfig.lineSpacing,
    '--lyric-alignment': styleConfig.alignment,
  } as React.CSSProperties;

  return (
    <div 
      className={`lyrics-wrapper ${isInstrumental ? 'instrumental-ambient' : ''}`} 
      ref={containerRef}
      style={cssVariables}
    >
      <div className="scroll-padding-top" />
      {entries.map((entry, index) => {
        const isActive = index === snapshot.activeIndex;
        const isUpcoming = index > snapshot.activeIndex;
        const isPast = index < snapshot.activeIndex;
        const isEmpty = entry.data.text.trim() === '';

        // Inject interpolation variable for fluidity
        const progressStyle = isActive ? { '--progress': snapshot.progress } as React.CSSProperties : {};
        
        let containerClasses = 'lyric-line-box';
        if (isActive) containerClasses += ' active';
        if (isUpcoming) containerClasses += ' upcoming';
        if (isPast) containerClasses += ' past';
        if (isEmpty) containerClasses += ' empty';
        if (isActive && styleConfig.backgroundEmphasis && !isInstrumental) containerClasses += ' emphasize-bg';

        return (
          <div
            key={entry.id}
            data-active={isActive}
            className={containerClasses}
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
