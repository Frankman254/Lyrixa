import type {
  LyricAnimationConfig,
  LyricFxConfig,
  LyricVisualStyle
} from '../types/render';

/**
 * Curated visual presets the user can apply to project defaults, a layer's
 * defaults, or a single clip's overrides. Each preset is a partial bundle that
 * gets merged on top of the existing values, so users keep the rest of their
 * configuration when they switch presets.
 */

export type LyricVisualPresetGroup =
  | 'Karaoke'
  | 'Neon'
  | 'Anime'
  | 'Ambient'
  | 'Glitch'
  | 'Retro'
  | 'Accent';

export interface LyricVisualPreset {
  id: string;
  name: string;
  description: string;
  group: LyricVisualPresetGroup;
  style?: Partial<LyricVisualStyle>;
  animation?: Partial<LyricAnimationConfig>;
  fx?: Partial<LyricFxConfig>;
}

export const VISUAL_PRESETS: LyricVisualPreset[] = [
  {
    id: 'clean-karaoke',
    name: 'Clean Karaoke',
    description: 'Solid white text with a soft glow. The neutral default for sing-along videos.',
    group: 'Karaoke',
    style: {
      textColor: '#ffffff',
      activeTextColor: '#ffffff',
      secondaryTextColor: 'rgba(255,255,255,0.25)',
      glowColor: 'rgba(255,255,255,0.45)',
      glowIntensity: 0.55,
      shadowIntensity: 0.6,
      blurAmount: 0,
      strokeColor: 'rgba(0,0,0,0.55)',
      strokeWidth: 1,
      fontWeight: '800',
      letterSpacing: '0px',
      opacity: 1
    },
    animation: {
      transitionIn: 'fade',
      transitionOut: 'fade',
      activeAnimation: 'none',
      intensity: 0.4,
      durationMs: 300,
      exitLingerMs: 120,
      easing: 'cubic-bezier(0.22, 1, 0.36, 1)'
    },
    fx: {
      enabled: false,
      preset: 'none',
      intensity: 0
    }
  },
  {
    id: 'soft-neon',
    name: 'Soft Neon',
    description: 'Aqua glow with a gentle pulse. Best for chill / synthwave moods.',
    group: 'Neon',
    style: {
      textColor: '#dff8ff',
      activeTextColor: '#ffffff',
      glowColor: '#5ee0ff',
      glowIntensity: 1.1,
      shadowIntensity: 0.4,
      blurAmount: 1,
      strokeColor: 'rgba(94, 224, 255, 0.7)',
      strokeWidth: 1,
      letterSpacing: '0.02em'
    },
    animation: {
      transitionIn: 'glow-pop',
      transitionOut: 'fade',
      activeAnimation: 'glow-pulse',
      intensity: 0.55,
      durationMs: 380,
      speed: 2.2
    },
    fx: {
      enabled: true,
      preset: 'neon-glow',
      intensity: 0.55,
      opacity: 0.7,
      blur: 0.5,
      blendMode: 'screen',
      colorA: '#5ee0ff',
      colorB: '#9b5dff'
    }
  },
  {
    id: 'anime-glow',
    name: 'Anime Glow',
    description: 'Bold magenta-cyan gradient with a snappy entrance — anime opening vibes.',
    group: 'Anime',
    style: {
      textColor: '#ffffff',
      activeTextColor: '#ffffff',
      glowColor: '#ff6cd9',
      glowIntensity: 1.2,
      shadowIntensity: 0.55,
      blurAmount: 0,
      strokeColor: 'rgba(0,0,0,0.7)',
      strokeWidth: 2,
      fontWeight: '900',
      letterSpacing: '0.01em'
    },
    animation: {
      transitionIn: 'scale-in',
      transitionOut: 'scale-out',
      activeAnimation: 'pulse',
      intensity: 0.7,
      durationMs: 280,
      easing: 'cubic-bezier(0.16, 1.2, 0.3, 1)',
      speed: 1.6
    },
    fx: {
      enabled: true,
      preset: 'energy-pulse',
      intensity: 0.6,
      opacity: 0.7,
      colorA: '#ff6cd9',
      colorB: '#5ee0ff',
      blendMode: 'screen'
    }
  },
  {
    id: 'dream-blur',
    name: 'Dream Blur',
    description: 'Soft, dreamy text with breathing motion and a bloomy halo.',
    group: 'Ambient',
    style: {
      textColor: 'rgba(255,255,255,0.92)',
      activeTextColor: '#ffffff',
      glowColor: 'rgba(213, 224, 255, 0.75)',
      glowIntensity: 0.85,
      shadowIntensity: 0.3,
      blurAmount: 1.5,
      strokeWidth: 0,
      opacity: 0.96,
      letterSpacing: '0.03em',
      fontWeight: '600'
    },
    animation: {
      transitionIn: 'blur-in',
      transitionOut: 'blur-out',
      activeAnimation: 'breathing',
      intensity: 0.4,
      durationMs: 520,
      exitLingerMs: 320,
      speed: 4
    },
    fx: {
      enabled: true,
      preset: 'soft-bloom',
      intensity: 0.5,
      opacity: 0.55,
      blur: 6,
      blendMode: 'screen',
      colorA: '#d5e0ff',
      colorB: '#ffffff'
    }
  },
  {
    id: 'glitch-hit',
    name: 'Glitch Hit',
    description: 'Hard-edged, chromatic glitch entrance — punchy for hip-hop and electronic drops.',
    group: 'Glitch',
    style: {
      textColor: '#ffffff',
      activeTextColor: '#ffffff',
      glowColor: '#ff3a6a',
      glowIntensity: 0.6,
      shadowIntensity: 0.7,
      blurAmount: 0,
      strokeColor: 'rgba(0,0,0,0.85)',
      strokeWidth: 1,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: '0.05em'
    },
    animation: {
      transitionIn: 'glitch-in',
      transitionOut: 'glitch-out',
      activeAnimation: 'shake-light',
      intensity: 0.85,
      durationMs: 220,
      exitLingerMs: 160,
      speed: 1.2
    },
    fx: {
      enabled: true,
      preset: 'rgb-shift',
      intensity: 0.7,
      opacity: 0.85,
      blur: 0,
      blendMode: 'plus-lighter',
      colorA: '#ff3a6a',
      colorB: '#3affe1'
    }
  },
  {
    id: 'retro-scanline',
    name: 'Retro Scanline',
    description: 'CRT-style scanlines over warm amber text. Old-school monitor energy.',
    group: 'Retro',
    style: {
      textColor: '#ffd29c',
      activeTextColor: '#ffe9c2',
      glowColor: '#ff9d45',
      glowIntensity: 0.7,
      shadowIntensity: 0.4,
      blurAmount: 0,
      strokeWidth: 0,
      fontFamily: 'var(--font-mono, monospace)',
      letterSpacing: '0.04em',
      fontWeight: '700'
    },
    animation: {
      transitionIn: 'fade',
      transitionOut: 'fade',
      activeAnimation: 'flicker',
      intensity: 0.45,
      durationMs: 240,
      speed: 0.9
    },
    fx: {
      enabled: true,
      preset: 'scanline',
      intensity: 0.55,
      opacity: 0.6,
      blendMode: 'overlay',
      colorA: '#ffb45a',
      colorB: '#3a1e00'
    }
  },
  {
    id: 'backing-whisper',
    name: 'Backing Whisper',
    description: 'Low-opacity, slightly blurred text — designed for backing vocal layers.',
    group: 'Ambient',
    style: {
      textColor: 'rgba(220, 230, 255, 0.7)',
      activeTextColor: 'rgba(255,255,255,0.9)',
      glowColor: 'rgba(180, 200, 255, 0.5)',
      glowIntensity: 0.4,
      shadowIntensity: 0.2,
      blurAmount: 0.5,
      opacity: 0.7,
      fontSize: '1.55rem',
      fontWeight: '600',
      letterSpacing: '0.03em',
      strokeWidth: 0
    },
    animation: {
      transitionIn: 'fade',
      transitionOut: 'fade-out',
      activeAnimation: 'breathing',
      intensity: 0.3,
      durationMs: 420,
      exitLingerMs: 260,
      speed: 5
    },
    fx: {
      enabled: false,
      preset: 'none',
      intensity: 0
    }
  },
  {
    id: 'vocal-echo',
    name: 'Vocal Echo',
    description: 'Soft trailing shadow that echoes the active line — great for ad-lib layers.',
    group: 'Accent',
    style: {
      textColor: '#ffffff',
      activeTextColor: '#ffffff',
      glowColor: 'rgba(255, 210, 156, 0.7)',
      glowIntensity: 0.65,
      shadowIntensity: 0.55,
      blurAmount: 0,
      letterSpacing: '0.02em',
      fontWeight: '800'
    },
    animation: {
      transitionIn: 'slide-up',
      transitionOut: 'fade-out',
      activeAnimation: 'wave',
      intensity: 0.55,
      durationMs: 320,
      exitLingerMs: 360,
      speed: 2.5
    },
    fx: {
      enabled: true,
      preset: 'shadow-trail',
      intensity: 0.55,
      opacity: 0.6,
      blur: 4,
      blendMode: 'plus-lighter',
      colorA: '#ffd29c',
      colorB: '#ff8a3c'
    }
  }
];

export const VISUAL_PRESETS_BY_ID: Record<string, LyricVisualPreset> =
  Object.fromEntries(VISUAL_PRESETS.map(preset => [preset.id, preset]));
