export type TextFillType = 'solid' | 'gradient' | 'image-texture';

export interface TextGradientFill {
  colorA: string;
  colorB: string;
  angle: number;
}

export interface TextImageTextureFill {
  id: string;
  /** Transient runtime URL. It must not be persisted in project JSON. */
  objectUrl?: string;
  opacity: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  fit: 'cover' | 'contain';
  missing?: boolean;
  fileName?: string;
}

export interface TextFillConfig {
  type: TextFillType;
  solidColor?: string;
  gradient?: TextGradientFill;
  imageTexture?: TextImageTextureFill;
}

export const DEFAULT_TEXT_FILL: TextFillConfig = {
  type: 'solid',
  solidColor: '#ffffff',
  gradient: {
    colorA: '#ffffff',
    colorB: '#80eaff',
    angle: 110
  }
};
