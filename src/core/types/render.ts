export type RenderMode = 'player' | 'editor' | 'overlay-preview' | 'sync-recorder' | 'timeline-editor';

export interface LyricVisualStyle {
  textColor: string;
  activeTextColor: string;
  secondaryTextColor: string;
  glowColor: string;
  shadowIntensity: number; // e.g., 0 to 1
  blurAmount: number; // in pixels
  fontSize: string;
  fontWeight: string | number;
  letterSpacing: string;
  lineSpacing: string;
  alignment: 'left' | 'center' | 'right';
  backgroundEmphasis: boolean;
}

export const DEFAULT_LYRIC_STYLE: LyricVisualStyle = {
  textColor: 'rgba(255, 255, 255, 0.4)',
  activeTextColor: '#ffffff',
  secondaryTextColor: 'rgba(255, 255, 255, 0.2)',
  glowColor: 'rgba(255, 255, 255, 0.5)',
  shadowIntensity: 0.5,
  blurAmount: 2,
  fontSize: '2.5rem',
  fontWeight: '800',
  letterSpacing: '-1px',
  lineSpacing: '1.2',
  alignment: 'center',
  backgroundEmphasis: false
};
