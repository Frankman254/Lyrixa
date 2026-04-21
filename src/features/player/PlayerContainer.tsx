import { useState, useEffect, useMemo, useRef } from 'react';
import { MOCK_LRC, MOCK_LRC_EDGE } from '../../shared/mocks/mockData';
import { parseLRC } from '../../core/lyrics/parser';
import { createTimelineEntries, computeTimelineSnapshot } from '../../core/timeline/engine';
import { LyricsRenderer } from '../lyrics-view/LyricsRenderer';
import { EditorControls } from './EditorControls';
import { TrackTimeline } from '../../shared/components/TrackTimeline';
import { SetupScreen } from './SetupScreen';
import { SyncRecorder } from '../sync/SyncRecorder';
import { AudioEngine } from './AudioEngine';
import type { AudioEngineRef } from './AudioEngine';

import type { TimelineSnapshot, TimelineEntry } from '../../core/types/timeline';
import type { LyricLine } from '../../core/types/lyrics';
import type { RenderMode, LyricVisualStyle } from '../../core/types/render';
import { DEFAULT_LYRIC_STYLE } from '../../core/types/render';
import type { SyncSession } from '../../core/types/sync';

import './PlayerContainer.css';

export function PlayerContainer() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  
  // Modes & UI
  const [renderMode, setRenderMode] = useState<RenderMode>('editor');
  const [styleConfig, setStyleConfig] = useState<LyricVisualStyle>(DEFAULT_LYRIC_STYLE);
  
  // Data Flow
  const [useEdgeMock, setUseEdgeMock] = useState(false);
  const [syncSession, setSyncSession] = useState<SyncSession | null>(null);

  const audioEngineRef = useRef<AudioEngineRef>(null);

  // MOCK Fallback Generation (RequestAnimationFrame)
  const lastTimeRef = useRef<number | undefined>(undefined);
  const requestRef = useRef<number | undefined>(undefined);

  const playMockLoop = (timeNow: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timeNow;
    const delta = (timeNow - lastTimeRef.current) / 1000;
    
    setCurrentTime((prev) => {
      const maxTime = duration > 0 ? duration : 60;
      const newTime = prev + delta;
      return newTime > maxTime ? 0 : newTime; 
    });
    
    lastTimeRef.current = timeNow;
    requestRef.current = requestAnimationFrame(playMockLoop);
  };

  useEffect(() => {
    if (useEdgeMock && isPlaying) {
      requestRef.current = requestAnimationFrame(playMockLoop);
    } else {
      lastTimeRef.current = undefined;
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isPlaying, useEdgeMock, duration]);

  // Derive Timeline Entries depending on source
  const entries: TimelineEntry<LyricLine>[] = useMemo(() => {
    if (syncSession) {
      // Create entries from user-programmed timestamps
      const lines: LyricLine[] = syncSession.syncedLines.map(sl => ({
        text: sl.text,
        startTime: sl.startTime
      }));
      return createTimelineEntries(lines, (l) => l.startTime, (_, i) => `synced-${i}`);
    } else if (useEdgeMock) {
      // Mock data
      const parsed = parseLRC(useEdgeMock ? MOCK_LRC_EDGE : MOCK_LRC);
      return createTimelineEntries(parsed.lines, (l) => l.startTime, (_, i) => `lyric-${i}`);
    }
    return [];
  }, [useEdgeMock, syncSession]);

  // If using Mock, calculate dynamic duration
  useEffect(() => {
    if (useEdgeMock && entries.length > 0) {
      setDuration(entries[entries.length - 1].startTime + 10);
    }
  }, [useEdgeMock, entries]);

  const [snapshot, setSnapshot] = useState<TimelineSnapshot<LyricLine>>({
    currentTime: 0,
    activeIndex: -1,
    previousIndex: -1,
    activeEntry: null,
    nextEntry: null,
    progress: 0,
    phase: 'idle'
  });

  useEffect(() => {
    setSnapshot((prev) => computeTimelineSnapshot(entries, currentTime, prev));
  }, [currentTime, entries]);

  // Handlers
  const handleToggleMock = () => {
    // If we click 'Mock' to turn it ON inside the editor
    setUseEdgeMock(true);
    setSyncSession(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setRenderMode('editor');
  };

  const handleStartSyncSession = (session: SyncSession) => {
    setSyncSession(session);
    setUseEdgeMock(false);
    setRenderMode('sync-recorder');
    setCurrentTime(0);
    setIsPlaying(false);
  };

  const stampNextLine = (time: number) => {
    if (!syncSession) return;
    const pendingLine = syncSession.rawLines[syncSession.pendingLineIndex];
    if (pendingLine === undefined) return;

    setSyncSession(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        syncedLines: [...prev.syncedLines, { text: pendingLine, startTime: time }],
        pendingLineIndex: prev.pendingLineIndex + 1
      };
    });
  };

  const undoLastStamp = () => {
    setSyncSession(prev => {
      if (!prev || prev.syncedLines.length === 0) return prev;
      return {
        ...prev,
        syncedLines: prev.syncedLines.slice(0, -1),
        pendingLineIndex: prev.pendingLineIndex - 1
      };
    });
  };

  const seekTime = (time: number) => {
    setCurrentTime(time);
    if (syncSession && syncSession.audioUrl) {
      audioEngineRef.current?.seekTo(time);
    }
  };


  // --- Render Branches ---

  if (!syncSession && !useEdgeMock) {
    return (
      <SetupScreen 
        onSessionReady={handleStartSyncSession} 
        onUseMock={handleToggleMock} 
      />
    );
  }

  const isOverlayPreview = renderMode === 'overlay-preview';
  const showControls = renderMode === 'editor' || renderMode === 'player';

  return (
    <div className={`player-container ${renderMode}`}>
      
      {/* Hidden Audio Engine explicitly controlling physical track output */}
      {syncSession?.audioUrl && (
        <AudioEngine 
          ref={audioEngineRef}
          audioUrl={syncSession.audioUrl}
          isPlaying={isPlaying}
          onTimeUpdate={setCurrentTime}
          onDurationChange={setDuration}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {showControls && (
        <EditorControls 
          styleConfig={styleConfig}
          onStyleChange={setStyleConfig}
          renderMode={renderMode}
          onRenderModeChange={setRenderMode}
          isPlaying={isPlaying}
          onPlayToggle={() => setIsPlaying(!isPlaying)}
          onReset={() => seekTime(0)}
          onToggleTrack={handleToggleMock}
          trackName={syncSession ? syncSession.trackName : 'Demo Mock'}
        />
      )}

      <main className="player-main">
        {showControls && (
          <div className="player-timeline-layer">
            <TrackTimeline 
              entries={entries}
              currentTime={currentTime}
              duration={duration}
              onSeek={seekTime}
            />
          </div>
        )}

        <div className="player-text-layer">
          {renderMode === 'sync-recorder' && syncSession ? (
            <SyncRecorder 
              session={syncSession}
              audioTime={currentTime}
              isPlaying={isPlaying}
              onStampLine={stampNextLine}
              onUndoLast={undoLastStamp}
              onExitSync={() => setRenderMode('editor')}
            />
          ) : (
            <LyricsRenderer 
              entries={entries} 
              snapshot={snapshot} 
              styleConfig={styleConfig}
              onLineClick={showControls ? seekTime : undefined} 
            />
          )}
        </div>
      </main>

      {isOverlayPreview && (
        <button 
          className="exit-overlay-btn glass-panel" 
          onClick={() => setRenderMode('editor')}
        >
          Exit Preview
        </button>
      )}

    </div>
  );
}
