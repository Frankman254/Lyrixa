export const VIBRIX_SLOT_FAMILIES = [
  'scene', 'spectrum', 'spectrum-second', 'looks', 'particles', 'rain',
  'lights', 'camera-fx', 'logo', 'track-title', 'background-zoom', 'intro-window'
] as const;

export type VibrixSlotFamily = (typeof VIBRIX_SLOT_FAMILIES)[number];

export interface VibrixManifestSlot {
  id: string;
  family: VibrixSlotFamily;
  name: string;
  revision: string;
  bindings?: Partial<Record<VibrixSlotFamily, string | 'off'>>;
  sceneBindable: boolean;
  cueable: boolean;
}

export interface VibrixAuthoringManifest {
  schemaVersion: 1;
  app: 'Vibrix';
  exportKind: 'vibrix-manifest';
  exportedAt: string;
  rendererVersion: string;
  storePersistVersion: number;
  projectName: string;
  revision: string;
  slots: VibrixManifestSlot[];
}

export interface CompositionTrack {
  id: string;
  name: string;
  kind: VibrixSlotFamily;
  order: number;
  enabled: boolean;
  locked: boolean;
}

export type CompositionTransitionType = 'cut' | 'crossfade' | 'morph';
export type CompositionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface CompositionCue {
  id: string;
  trackId: string;
  startTimeMs: number;
  endTimeMs: number;
  target: {
    kind: 'scene' | 'feature-slot';
    family?: VibrixSlotFamily;
    slotId: string;
    slotRevision: string;
  };
  transition?: {
    type: CompositionTransitionType;
    durationMs: number;
    easing: CompositionEasing;
  };
  priority: number;
  enabled: boolean;
}

export interface CompositionScore {
  tracks: CompositionTrack[];
  cues: CompositionCue[];
}

export const DEFAULT_COMPOSITION_SCORE: CompositionScore = {
  tracks: [{
    id: 'composition-scene',
    name: 'Scene',
    kind: 'scene',
    order: 0,
    enabled: true,
    locked: false
  }],
  cues: []
};
