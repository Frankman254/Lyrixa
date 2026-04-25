import type { ReactNode } from 'react';

export type TrackHeaderVariant = 'default' | 'audio' | 'thin' | 'spacer';

interface TimelineTrackHeaderProps {
  title: string;
  /** Color for the swatch + left border. Omit for spacer/thin variants. */
  color?: string;
  /** Optional small label rendered next to the title (e.g. "vocals"). */
  badge?: string;
  /** Right-aligned action buttons (toggles, etc). */
  actions?: ReactNode;
  variant?: TrackHeaderVariant;
}

/**
 * Sticky left header column shared by every row of the timeline.
 *
 * All rows (ruler, audio tracks, lyric tracks) use this component so their
 * lane content starts at exactly the same x-coordinate and the playhead /
 * ruler / clips visually align.
 */
export function TimelineTrackHeader({
  title,
  color,
  badge,
  actions,
  variant = 'default'
}: TimelineTrackHeaderProps) {
  const classes = ['tl-track-header', `variant-${variant}`].join(' ');
  const style = color ? { borderLeftColor: color } : undefined;

  return (
    <div className={classes} style={style}>
      {variant !== 'spacer' && (
        <div className="tl-track-title">
          {color && <span className="tl-track-swatch" style={{ background: color }} />}
          <span className="tl-track-name">{title}</span>
          {badge && <span className="tl-track-badge">{badge}</span>}
        </div>
      )}
      {actions && <div className="tl-track-actions">{actions}</div>}
    </div>
  );
}
