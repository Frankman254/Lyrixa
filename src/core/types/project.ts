import type { LyricClip } from './clip';
import type { LyricLayer } from './layer';
import type {
  ClipProgressIndicatorConfig,
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle,
  RenderMode
} from './render';
import type { AudioPeak, ProjectAudioTracks } from './audio';

/**
 * Legacy single-track shape. Older projects persisted this as `track`.
 * New code reads `project.audioTracks.master` instead — `LyrixaTrack`
 * stays exported only so the persistence migration can keep typing it.
 *
 * @deprecated Use `LyrixaProject.audioTracks.master`.
 */
export interface LyrixaTrack {
  fileName: string;
  objectUrl?: string;
  duration: number;
  waveformPeaks?: AudioPeak[];
}

/**
 * The single source of truth for the editor experience. Every feature
 * reads from and writes to this project via `useLyrixaProject`.
 */
export interface LyricSource {
  id: string;
  title: string;
  rawText: string;
  normalizedLines: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface LyrixaProject {
  id: string;
  name: string;
  /** Audio channels bound to this project. `master` is the track that plays. */
  audioTracks: ProjectAudioTracks;
  /** Raw paste from the user, kept verbatim for re-normalization. */
  rawLyricsText: string;
  /** The normalized lines derived from rawLyricsText. */
  normalizedLyrics: string[];
  /** Ordered lyric sets for long mixes, medleys, and multi-song sessions. */
  lyricSources: LyricSource[];
  /** Source currently edited/imported by the lyrics workflow. */
  activeLyricSourceId?: string;
  layers: LyricLayer[];
  clips: LyricClip[];
  styleConfig: LyricVisualStyle;
  animationConfig: LyricAnimationConfig;
  fxConfig: LyricFxConfig;
  progressIndicatorConfig: ClipProgressIndicatorConfig;
  currentTime: number;
  renderMode: RenderMode;
}
