import { useEffect, useRef } from 'react';
import type { TimelineSnapshot, TimelineEntry } from '../../core/types/timeline';
import type { LyricLine } from '../../core/types/lyrics';
import type { LyricVisualStyle } from '../../core/types/render';
import { DEFAULT_LYRIC_STYLE, resolveLyricStyle } from '../../core/types/render';
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
  const resolvedStyle = resolveLyricStyle(styleConfig);

  // Construct Custom CSS Properties from Style Config
  const cssVariables = {
    '--lyric-color-primary': resolvedStyle.textColor,
    '--lyric-color-active': resolvedStyle.activeTextColor,
    '--lyric-color-secondary': resolvedStyle.secondaryTextColor,
    '--lyric-glow': resolvedStyle.glowColor,
    '--lyric-glow-intensity': resolvedStyle.glowIntensity,
    '--lyric-shadow-intensity': resolvedStyle.shadowIntensity,
    '--lyric-blur': `${resolvedStyle.blurAmount}px`,
    '--lyric-font-size': resolvedStyle.fontSize,
    '--lyric-font-weight': resolvedStyle.fontWeight,
    '--lyric-font-family': resolvedStyle.fontFamily,
    '--lyric-letter-spacing': resolvedStyle.letterSpacing,
    '--lyric-line-spacing': resolvedStyle.lineHeight,
    '--lyric-alignment': resolvedStyle.alignment,
    '--lyric-opacity': resolvedStyle.opacity,
    '--lyric-stroke-color': resolvedStyle.strokeColor,
    '--lyric-stroke-width': `${resolvedStyle.strokeWidth}px`,
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
        if (isActive && (resolvedStyle.backgroundEmphasis || resolvedStyle.backgroundPill) && !isInstrumental) containerClasses += ' emphasize-bg';

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
