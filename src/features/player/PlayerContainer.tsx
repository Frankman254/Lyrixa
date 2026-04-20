import { useState, useEffect, useRef, useMemo } from 'react';
import { MOCK_LRC, MOCK_LRC_EDGE } from '../../shared/mocks/mockData';
import { parseLRC } from '../../core/lyrics/parser';
import { createTimelineEntries, computeTimelineSnapshot } from '../../core/timeline/engine';
import { LyricsRenderer } from '../lyrics-view/LyricsRenderer';
import type { TimelineSnapshot } from '../../core/types/timeline';
import type { LyricLine } from '../../core/types/lyrics';
import './PlayerContainer.css';

export function PlayerContainer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [useEdgeMock, setUseEdgeMock] = useState(false);
  
  // Create entries whenever mock toggle changes
  const entries = useMemo(() => {
    const rawData = useEdgeMock ? MOCK_LRC_EDGE : MOCK_LRC;
    const parsed = parseLRC(rawData);
    return createTimelineEntries(
      parsed.lines,
      (line) => line.startTime,
      (_, index) => `lyric-${index}`
    );
  }, [useEdgeMock]);

  const [snapshot, setSnapshot] = useState<TimelineSnapshot<LyricLine>>({
    currentTime: 0,
    activeIndex: -1,
    previousIndex: -1,
    activeEntry: null,
    nextEntry: null,
    progress: 0,
    phase: 'idle'
  });

  const requestRef = useRef<number | undefined>(undefined);
  const lastTimeRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Generate snapshot whenever time or entries change
    setSnapshot((prev) => computeTimelineSnapshot(entries, currentTime, prev));
  }, [currentTime, entries]);

  // Audio mock simulation loop using requestAnimationFrame
  const playLoop = (timeNow: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timeNow;
    const delta = (timeNow - lastTimeRef.current) / 1000;
    
    setCurrentTime((prev) => {
      // Loop around to 0 when it reaches approx end of song (mocked as 60s for demo)
      const maxTime = useEdgeMock ? 25 : 60;
      const newTime = prev + delta;
      return newTime > maxTime ? 0 : newTime; 
    });
    
    lastTimeRef.current = timeNow;
    requestRef.current = requestAnimationFrame(playLoop);
  };

  useEffect(() => {
    if (isPlaying) {
      requestRef.current = requestAnimationFrame(playLoop);
    } else {
      lastTimeRef.current = undefined; // reset so delta doesn't jump on resume
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, useEdgeMock]);

  // Reset time cleanly when changing tracks
  const handleToggleMock = () => {
    setUseEdgeMock(!useEdgeMock);
    setCurrentTime(0);
  };

  return (
    <div className="player-container">
      <header className="player-header glass-panel">
        <div className="player-meta">
          <h1>LyraMotion Core</h1>
          <p>
             {useEdgeMock ? 'Edge Simulator' : 'Rick Astley'} • {currentTime.toFixed(2)}s [{snapshot.phase}]
          </p>
        </div>
        <div className="player-controls">
          <button className="toggle-btn" onClick={handleToggleMock}>
            Toggle Track
          </button>
          <button 
            className="play-btn" 
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button className="reset-btn" onClick={() => setCurrentTime(0)}>
            Reset
          </button>
        </div>
      </header>

      <main className="player-main">
        <LyricsRenderer entries={entries} snapshot={snapshot} onLineClick={setCurrentTime} />
      </main>
    </div>
  );
}
