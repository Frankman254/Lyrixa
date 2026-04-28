import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { AudioEngine } from '../player/AudioEngine';
import type { AudioEngineRef } from '../player/AudioEngine';
import { TimelineEditor } from '../timeline-editor/TimelineEditor';
import { ClipLyricsRenderer } from '../lyrics-view/ClipLyricsRenderer';
import { LyricsImportPanel } from './LyricsImportPanel';
import { FloatingPreview } from './FloatingPreview';
import { FloatingPanel } from '../../shared/components/FloatingPanel';
import { useLyrixaProject } from './useLyrixaProject';
import type { SaveStatus } from './useLyrixaProject';
import type { AudioChannelRole, AudioBandMode } from '../../core/types/audio';
import type {
  ClipProgressIndicatorConfig,
  LyricActiveAnimationPreset,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricFxPreset,
  LyricTextFillMode,
  LyricVisualStyle
} from '../../core/types/render';
import { createProjectExportEnvelope, parseProjectExportEnvelope } from '../../core/project/serialization';
import { extractBandPeaksFromBlob } from './peakExtraction';
import './LyrixaEditorShell.css';

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: 'Saved',
  pending: 'Saving…',
  saved: 'Saved ✓'
};

export function LyrixaEditorShell() {
  const {
    project,
    saveStatus,
    audioNeedsReload,
    setProjectName,
    loadAudioFile,
    removeAudio,
    getAudioBlob,
    applyLyrics,
    regenerateFromVocals,
    setClips,
    setLayers,
    setStyleConfig,
    setAnimationConfig,
    setFxConfig,
    setProgressIndicatorConfig,
    setCurrentTime,
    setMasterDuration,
    importProject,
    resetProject
  } = useLyrixaProject();

  const audioEngineRef = useRef<AudioEngineRef>(null);
  const masterFileInputRef = useRef<HTMLInputElement>(null);
  const vocalsFileInputRef = useRef<HTMLInputElement>(null);
  const projectImportInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [transparentPreviewOpen, setTransparentPreviewOpen] = useState(false);
  const [floatingPreviewWidth, setFloatingPreviewWidth] = useState(() =>
    readStoredNumber('lyrixa_floating_preview_width', 420)
  );
  const [globalPanelOpen, setGlobalPanelOpen] = useState(false);
  const [miniPreviewVisible, setMiniPreviewVisible] = useState(true);
  const [nameEditing, setNameEditing] = useState(false);
  const [draftName, setDraftName] = useState(project.name);

  // Transient playback time. Updated at ~60fps via rAF while playing,
  // and by user-driven seeks otherwise. Never persisted on its own ticks.
  const [playbackTime, setPlaybackTime] = useState(project.currentTime ?? 0);
  const rafRef = useRef<number | null>(null);

  const masterChannel = project.audioTracks.master;
  const vocalsChannel = project.audioTracks.vocals;

  useEffect(() => {
    setDraftName(project.name);
  }, [project.name]);

  useEffect(() => {
    setPlaybackTime(project.currentTime ?? 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // rAF loop for the playhead.
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }
    const tick = () => {
      const t = audioEngineRef.current?.getCurrentTime() ?? 0;
      setPlaybackTime(t);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [isPlaying]);

  // Persist last position only on pause transitions.
  useEffect(() => {
    if (isPlaying) return;
    setCurrentTime(playbackTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  const openMasterPicker = () => masterFileInputRef.current?.click();
  const openVocalsPicker = () => vocalsFileInputRef.current?.click();
  const openProjectImportPicker = () => projectImportInputRef.current?.click();

  const handleAudioFileSelected = (role: AudioChannelRole) =>
    async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (!file) return;
      try {
        await loadAudioFile(file, role);
      } catch (err) {
        console.error(`[Lyrixa] Failed to load ${role} audio file:`, err);
      }
    };

  const handleSeek = useCallback((time: number) => {
    setPlaybackTime(time);
    setCurrentTime(time);
    audioEngineRef.current?.seekTo(time);
  }, [setCurrentTime]);

  const handlePlayToggle = () => {
    if (!masterChannel?.objectUrl) return;
    setIsPlaying(p => !p);
  };

  const commitName = () => {
    const trimmed = draftName.trim();
    if (trimmed.length > 0 && trimmed !== project.name) {
      setProjectName(trimmed);
    } else {
      setDraftName(project.name);
    }
    setNameEditing(false);
  };

  const extractBandPeaksForMode = useCallback(
    async (mode: AudioBandMode) => {
      const blob = getAudioBlob('master');
      if (!blob) return null;
      return extractBandPeaksFromBlob(blob, mode);
    },
    [getAudioBlob]
  );

  const handleExportProject = useCallback(() => {
    const envelope = createProjectExportEnvelope(project, {
      bandMode: safeGetLocalStorage('lyrixa_band_mode') ?? undefined
    });
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = project.name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '') || 'lyrixa-project';
    link.href = url;
    link.download = `${safeName}.lyrixa.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [project]);

  const handleProjectFileSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const envelope = JSON.parse(await file.text());
      const imported = parseProjectExportEnvelope(envelope);
      const bandMode = envelope?.project?.uiPreferences?.bandMode;
      if (typeof bandMode === 'string') {
        try { window.localStorage.setItem('lyrixa_band_mode', bandMode); } catch { /* ignore */ }
      }
      importProject(imported);
      setIsPlaying(false);
      setPlaybackTime(imported.currentTime ?? 0);
      setMiniPreviewVisible(true);
    } catch (err) {
      console.error('[Lyrixa] Failed to import project:', err);
      window.alert(err instanceof Error ? err.message : 'Could not import Lyrixa project.');
    }
  };

  const effectiveDuration = masterChannel?.duration ?? 60;
  const showMini = miniPreviewVisible && !previewOpen;
  const vocalsAnalysisReady = !!vocalsChannel?.vocalActivity?.length;
  const vocalsNeedsReload = !!vocalsChannel && !vocalsChannel.objectUrl;

  const handleFloatingPreviewSize = (width: number) => {
    const next = Math.max(320, Math.min(760, width));
    setFloatingPreviewWidth(next);
    try { window.localStorage.setItem('lyrixa_floating_preview_width', String(next)); } catch { /* ignore */ }
  };

  return (
    <div className="lyrixa-shell">
      <header className="ls-topbar">
        <div className="ls-topbar-section ls-brand">
          <span className="ls-logo">LYRIXA</span>
          {nameEditing ? (
            <input
              className="ls-name-input"
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                else if (e.key === 'Escape') {
                  setDraftName(project.name);
                  setNameEditing(false);
                }
              }}
            />
          ) : (
            <button
              className="ls-name"
              onClick={() => setNameEditing(true)}
              title="Rename project"
            >
              {project.name}
            </button>
          )}
        </div>

        <div className="ls-topbar-section ls-actions">
          <button
            className="ls-btn"
            onClick={openMasterPicker}
            title={masterChannel
              ? `Master track: ${masterChannel.fileName}`
              : 'Load the main audio file (MP3, WAV, etc.)'}
          >
            {masterChannel ? `↻ ${masterChannel.fileName}` : '＋ Load master track'}
          </button>
          <button
            className={`ls-btn ${vocalsChannel ? 'active' : ''}`}
            onClick={openVocalsPicker}
            title={vocalsChannel
              ? `Vocals stem loaded: ${vocalsChannel.fileName}. Used for timing assistance only — does not play separately.`
              : 'Load an isolated vocals stem to assist with lyric timing. This file is analyzed only, not played.'}
          >
            {vocalsChannel ? `↻ Vocals: ${vocalsChannel.fileName}` : '＋ Load vocals stem'}
          </button>
          {vocalsChannel && (
            <button
              className="ls-btn ghost small"
              onClick={() => removeAudio('vocals')}
              title="Remove vocals stem"
            >
              ✕
            </button>
          )}
          <input
            ref={masterFileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
            style={{ display: 'none' }}
            onChange={handleAudioFileSelected('master')}
          />
          <input
            ref={vocalsFileInputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
            style={{ display: 'none' }}
            onChange={handleAudioFileSelected('vocals')}
          />
          <input
            ref={projectImportInputRef}
            type="file"
            accept=".lyrixa.json,application/json"
            style={{ display: 'none' }}
            onChange={handleProjectFileSelected}
          />
          <button className="ls-btn" onClick={() => setImportOpen(true)}>
            Import lyrics
          </button>
          <button className="ls-btn" onClick={handleExportProject}>
            Export Project
          </button>
          <button className="ls-btn" onClick={openProjectImportPicker}>
            Import Project
          </button>
          <button
            className={`ls-btn ${globalPanelOpen ? 'active' : ''}`}
            onClick={() => setGlobalPanelOpen(value => !value)}
          >
            Global Style
          </button>
          {vocalsAnalysisReady && project.normalizedLyrics.length > 0 && (
            <button
              className="ls-btn primary"
              onClick={() => regenerateFromVocals()}
              title="Use detected vocal activity regions from the vocals stem to retime all lyric clips. You can still adjust manually after."
            >
              ⟲ Generate timings from vocals
            </button>
          )}
          <button
            className={`ls-btn ${previewOpen ? 'active' : ''}`}
            onClick={() => setPreviewOpen(p => !p)}
          >
            {previewOpen ? '✕ Close preview' : '◉ Preview'}
          </button>
          <button
            className={`ls-btn ${transparentPreviewOpen ? 'active' : ''}`}
            onClick={() => setTransparentPreviewOpen(true)}
            title="Transparent in-editor overlay. Real always-on-top over other apps requires a desktop wrapper."
          >
            ⧉ Overlay
          </button>
          {!miniPreviewVisible && !previewOpen && (
            <button className="ls-btn" onClick={() => setMiniPreviewVisible(true)}>
              ◳ Live preview
            </button>
          )}
        </div>

        <div className="ls-topbar-section ls-meta">
          {vocalsAnalysisReady && (
            <span
              className="ls-vocals-chip"
              title="Vocals stem is loaded and analyzed. Vocal activity regions are shown on the vocals waveform lane. Use 'Generate timings from vocals' to auto-time your lyrics."
            >
              ◐ Vocals stem active
            </span>
          )}
          {vocalsChannel && !vocalsAnalysisReady && (
            <span className="ls-vocals-chip" title="Analyzing vocals stem waveform…">
              ◌ Analyzing vocals…
            </span>
          )}
          <span className={`ls-save-chip ${saveStatus}`}>{SAVE_LABEL[saveStatus]}</span>
          <button
            className="ls-btn ghost danger"
            onClick={() => {
              if (window.confirm('Discard the current project and start a new one?')) {
                resetProject();
                setIsPlaying(false);
                setPlaybackTime(0);
              }
            }}
            title="Reset project"
          >
            New
          </button>
        </div>
      </header>

      {audioNeedsReload && masterChannel && !masterChannel.objectUrl && (
        <div className="ls-reload-banner">
          <span>
            Audio file needs to be reloaded:{' '}
            <strong>{masterChannel.fileName}</strong>. Your lyrics and clips are safe.
          </span>
          <div className="ls-reload-actions">
            <button className="ls-btn small" onClick={openMasterPicker}>Reload audio</button>
            <button className="ls-btn ghost small" onClick={() => removeAudio('master')}>Clear</button>
          </div>
        </div>
      )}

      {vocalsNeedsReload && (
        <div className="ls-reload-banner">
          <span>
            Vocals stem needs to be reloaded:{' '}
            <strong>{vocalsChannel.fileName}</strong>.
          </span>
          <div className="ls-reload-actions">
            <button className="ls-btn small" onClick={openVocalsPicker}>Reload vocals stem</button>
            <button className="ls-btn ghost small" onClick={() => removeAudio('vocals')}>Clear</button>
          </div>
        </div>
      )}

      {masterChannel?.objectUrl && (
        <AudioEngine
          ref={audioEngineRef}
          audioUrl={masterChannel.objectUrl}
          isPlaying={isPlaying}
          onDurationChange={setMasterDuration}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      <main className="ls-main">
        <TimelineEditor
          embedded
          clips={project.clips}
          layers={project.layers}
          currentTime={playbackTime}
          duration={effectiveDuration}
          isPlaying={isPlaying}
          trackName={masterChannel?.fileName ?? 'No audio loaded'}
          masterChannel={masterChannel}
          vocalsChannel={vocalsChannel}
          vocalsBandPeaks={vocalsChannel?.waveformPeaks}
          onExtractBandPeaks={extractBandPeaksForMode}
          onClipsChange={setClips}
          onLayersChange={setLayers}
          onSeek={handleSeek}
          onPlayToggle={handlePlayToggle}
        />

        {showMini && (
          <FloatingPreview
            clips={project.clips}
            layers={project.layers}
            currentTime={playbackTime}
            styleConfig={project.styleConfig}
            animationConfig={project.animationConfig}
            fxConfig={project.fxConfig}
            progressIndicatorConfig={project.progressIndicatorConfig}
            width={floatingPreviewWidth}
            onSizeChange={handleFloatingPreviewSize}
            onExpand={() => setPreviewOpen(true)}
            onClose={() => setMiniPreviewVisible(false)}
          />
        )}

        {!masterChannel && (
          <EmptyLaneHint
            icon="🎵"
            title="No audio loaded"
            description="Load an MP3, WAV, or other audio file to populate the audio lane."
            actionLabel="Load audio"
            onAction={openMasterPicker}
          />
        )}

        {project.clips.length === 0 && masterChannel && (
          <EmptyLaneHint
            icon="📝"
            title="No lyrics yet"
            description="Paste or import lyrics to create draggable text clips on the timeline."
            actionLabel="Import lyrics"
            onAction={() => setImportOpen(true)}
          />
        )}
      </main>

      <LyricsImportPanel
        open={importOpen}
        initialText={project.rawLyricsText}
        layers={project.layers}
        vocalsAvailable={vocalsAnalysisReady}
        onClose={() => setImportOpen(false)}
        onApply={applyLyrics}
      />

      {globalPanelOpen && (
        <FloatingPanel
          storageKey="lyrixa_global_style_panel_pos"
          defaultPosition={{ x: Math.max(24, window.innerWidth - 340), y: 96 }}
          width={310}
          title="Global style"
          onClose={() => setGlobalPanelOpen(false)}
        >
          <GlobalStylePanel
            styleConfig={project.styleConfig}
            animationConfig={project.animationConfig}
            fxConfig={project.fxConfig}
            progressIndicatorConfig={project.progressIndicatorConfig}
            onStyleChange={setStyleConfig}
            onAnimationChange={setAnimationConfig}
            onFxChange={setFxConfig}
            onProgressChange={setProgressIndicatorConfig}
          />
        </FloatingPanel>
      )}

      {previewOpen && (
        <div className="ls-preview-overlay" onClick={() => setPreviewOpen(false)}>
          <div className="ls-preview-stage" onClick={(e) => e.stopPropagation()}>
            <ClipLyricsRenderer
              clips={project.clips}
              layers={project.layers}
              currentTime={playbackTime}
              styleConfig={project.styleConfig}
              animationConfig={project.animationConfig}
              fxConfig={project.fxConfig}
              progressIndicatorConfig={project.progressIndicatorConfig}
            />
            <button
              className="ls-btn ghost ls-preview-close"
              onClick={() => setPreviewOpen(false)}
            >
              Close preview
            </button>
          </div>
        </div>
      )}

      {transparentPreviewOpen && (
        <div className="ls-transparent-preview" role="dialog" aria-label="Transparent preview overlay">
          <ClipLyricsRenderer
            clips={project.clips}
            layers={project.layers}
            currentTime={playbackTime}
            styleConfig={project.styleConfig}
            animationConfig={project.animationConfig}
            fxConfig={project.fxConfig}
            progressIndicatorConfig={project.progressIndicatorConfig}
          />
          <button
            className="ls-btn ghost ls-transparent-exit"
            onClick={() => setTransparentPreviewOpen(false)}
          >
            Exit overlay
          </button>
        </div>
      )}
    </div>
  );
}

interface EmptyLaneHintProps {
  icon: string;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

function EmptyLaneHint({ icon, title, description, actionLabel, onAction }: EmptyLaneHintProps) {
  return (
    <div className="ls-empty-hint" role="status">
      <span className="ls-empty-icon" aria-hidden>{icon}</span>
      <div className="ls-empty-text">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      <button className="ls-btn primary small" onClick={onAction}>{actionLabel}</button>
    </div>
  );
}

function GlobalStylePanel({
  styleConfig,
  animationConfig,
  fxConfig,
  progressIndicatorConfig,
  onStyleChange,
  onAnimationChange,
  onFxChange,
  onProgressChange
}: {
  styleConfig: LyricVisualStyle;
  animationConfig: LyricAnimationConfig;
  fxConfig: LyricFxConfig;
  progressIndicatorConfig: ClipProgressIndicatorConfig;
  onStyleChange: (next: LyricVisualStyle) => void;
  onAnimationChange: (next: LyricAnimationConfig) => void;
  onFxChange: (next: LyricFxConfig) => void;
  onProgressChange: (next: ClipProgressIndicatorConfig) => void;
}) {
  const handleTextureSelected = async (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    onStyleChange({
      ...styleConfig,
      textFillMode: 'texture',
      textTextureImage: dataUrl
    });
  };

  return (
    <div className="ls-global-panel">
      <details open className="inspector-section">
        <summary>Style</summary>
        <div className="inspector-section-body">
          <div className="inspector-grid">
            <label>Font size<input className="form-control form-input" type="number" step="0.1" min={0.5} value={parseFloat(styleConfig.fontSize) || 2.5} onChange={(e) => onStyleChange({ ...styleConfig, fontSize: `${e.target.value}rem` })} /></label>
            <label>Weight<input className="form-control form-input" type="number" step="100" min={100} max={1000} value={parseInt(String(styleConfig.fontWeight), 10) || 800} onChange={(e) => onStyleChange({ ...styleConfig, fontWeight: parseInt(e.target.value, 10) || 800 })} /></label>
            <label>Text color<input className="form-color" type="color" value={toColorInput(styleConfig.textColor)} onChange={(e) => onStyleChange({ ...styleConfig, textColor: e.target.value, activeTextColor: e.target.value })} /></label>
            <label>Stroke<input className="form-control form-input" type="number" min={0} max={12} step={0.5} value={styleConfig.strokeWidth} onChange={(e) => onStyleChange({ ...styleConfig, strokeWidth: parseFloat(e.target.value) || 0 })} /></label>
          </div>
          <label>Letter spacing<input className="form-control form-input" type="text" value={styleConfig.letterSpacing} onChange={(e) => onStyleChange({ ...styleConfig, letterSpacing: e.target.value })} /></label>
          <label>Fill mode<select className="form-control form-select" value={styleConfig.textFillMode ?? 'solid'} onChange={(e) => onStyleChange({ ...styleConfig, textFillMode: e.target.value as LyricTextFillMode })}><option value="solid">Solid color</option><option value="gradient">Gradient</option><option value="texture">Image texture</option></select></label>
          {(styleConfig.textFillMode ?? 'solid') === 'gradient' && (
            <label>Gradient<input className="form-control form-input" type="text" value={styleConfig.textGradient} onChange={(e) => onStyleChange({ ...styleConfig, textGradient: e.target.value })} /></label>
          )}
          {(styleConfig.textFillMode ?? 'solid') === 'texture' && (
            <>
              <label>Texture image<input className="form-control form-input" type="file" accept="image/*" onChange={(e) => void handleTextureSelected(e.target.files?.[0])} /></label>
              <label>Texture size<select className="form-control form-select" value={styleConfig.textTextureSize} onChange={(e) => onStyleChange({ ...styleConfig, textTextureSize: e.target.value })}><option value="cover">Cover</option><option value="contain">Contain</option><option value="auto">Original</option><option value="180px">Tiled small</option><option value="360px">Tiled large</option></select></label>
            </>
          )}
          <label>Opacity<input className="form-range" type="range" min={0} max={1} step={0.05} value={styleConfig.opacity} onChange={(e) => onStyleChange({ ...styleConfig, opacity: parseFloat(e.target.value) })} /></label>
          <label>Glow intensity<input className="form-range" type="range" min={0} max={2} step={0.05} value={styleConfig.glowIntensity} onChange={(e) => onStyleChange({ ...styleConfig, glowIntensity: parseFloat(e.target.value) })} /></label>
          <label>Blur amount<input className="form-range" type="range" min={0} max={16} step={0.5} value={styleConfig.blurAmount} onChange={(e) => onStyleChange({ ...styleConfig, blurAmount: parseFloat(e.target.value) })} /></label>
        </div>
      </details>
      <details className="inspector-section">
        <summary>Animation</summary>
        <div className="inspector-section-body">
          <label>Default active<select className="form-control form-select" value={animationConfig.activeAnimation} onChange={(e) => onAnimationChange({ ...animationConfig, activeAnimation: e.target.value as LyricActiveAnimationPreset })}>{['none', 'pulse', 'glow-pulse', 'breathing', 'shake-light', 'wave', 'flicker'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Exit linger<input className="form-control form-input" type="number" min={0} step={50} value={animationConfig.exitLingerMs} onChange={(e) => onAnimationChange({ ...animationConfig, exitLingerMs: parseInt(e.target.value, 10) || 0 })} /></label>
        </div>
      </details>
      <details className="inspector-section">
        <summary>FX</summary>
        <div className="inspector-section-body">
          <label>Default FX<select className="form-control form-select" value={fxConfig.preset} onChange={(e) => {
            const preset = e.target.value as LyricFxPreset;
            onFxChange({ ...fxConfig, preset, enabled: preset !== 'none' });
          }}>{['none', 'neon-glow', 'rgb-shift', 'glitch', 'scanline', 'blur-flicker', 'shadow-trail', 'energy-pulse'].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
          <label>Intensity<input className="form-range" type="range" min={0} max={2} step={0.05} value={fxConfig.intensity} onChange={(e) => onFxChange({ ...fxConfig, intensity: parseFloat(e.target.value), enabled: fxConfig.preset !== 'none' })} /></label>
          <label className="tl-inline-check"><input type="checkbox" checked={progressIndicatorConfig.enabled} onChange={(e) => onProgressChange({ ...progressIndicatorConfig, enabled: e.target.checked })} />Show progress dot by default</label>
        </div>
      </details>
    </div>
  );
}

function safeGetLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readStoredNumber(key: string, fallback: number): number {
  const raw = safeGetLocalStorage(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toColorInput(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return '#ffffff';
}
