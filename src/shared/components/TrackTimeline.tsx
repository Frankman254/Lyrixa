import type { TimelineEntry } from '../../core/types/timeline';
import type { LyricLine } from '../../core/types/lyrics';
import './TrackTimeline.css';

interface TrackTimelineProps {
  entries: TimelineEntry<LyricLine>[];
  currentTime: number;
  duration: number;
  onSeek?: (time: number) => void;
}

export function TrackTimeline({ entries, currentTime, duration, onSeek }: TrackTimelineProps) {
  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPct = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(clickPct * duration);
  };

  return (
    <div className="track-timeline-container">
      <div className="timeline-time start">{formatTime(currentTime)}</div>
      
      <div className="timeline-bar-wrapper" onClick={handleTimelineClick}>
        <div className="timeline-bar-bg" />
        <div 
          className="timeline-bar-fill" 
          style={{ width: `${progressPct}%` }}
        />
        
        {/* Render lyric markers */}
        {entries.map(entry => {
          const markerPct = duration > 0 ? (entry.startTime / duration) * 100 : 0;
          // Don't render marker if it's beyond the duration
          if (markerPct > 100) return null;
          
          const isPassed = entry.startTime <= currentTime;
          
          return (
            <div 
              key={entry.id}
              className={`timeline-marker ${isPassed ? 'passed' : ''}`}
              style={{ left: `${markerPct}%` }}
              title={`Lyric at ${formatTime(entry.startTime)}`}
            />
          );
        })}
        
        {/* Playhead */}
        <div 
          className="timeline-playhead" 
          style={{ left: `${progressPct}%` }}
        />
      </div>

      <div className="timeline-time end">{formatTime(duration)}</div>
    </div>
  );
}
