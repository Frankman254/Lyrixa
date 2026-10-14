export const VIBRIX_SLOT_FAMILIES = [
  'scene', 'spectrum', 'spectrum-second', 'looks', 'particles', 'rain',
  'lights', 'camera-fx', 'logo', 'track-title', 'background-zoom', 'intro-window'
] as const;

export type VibrixSlotFamily = (typeof VIBRIX_SLOT_FAMILIES)[number];

export const VIBRIX_CUEABLE_SLOT_FAMILIES = [
  'scene', 'spectrum', 'spectrum-second', 'looks', 'particles', 'rain',
  'lights', 'camera-fx', 'logo', 'track-title', 'background-zoom'
] as const;

export type VibrixCueableSlotFamily = (typeof VIBRIX_CUEABLE_SLOT_FAMILIES)[number];

export const VIBRIX_GRANULAR_FAMILIES = [
  'spectrum', 'spectrum-second', 'looks', 'particles', 'rain',
  'lights', 'camera-fx', 'logo', 'track-title', 'background-zoom'
] as const;

export type VibrixGranularFamily = (typeof VIBRIX_GRANULAR_FAMILIES)[number];
export type VibrixTimelineKind = VibrixCueableSlotFamily | 'image';

export interface VibrixManifestSlot {
  id: string;
  family: VibrixSlotFamily;
  name: string;
  revision: string;
  bindings?: Partial<Record<VibrixSlotFamily, string | 'off'>>;
  sceneBindable: boolean;
  cueable: boolean;
}

interface VibrixAuthoringManifestBase {
  app: 'Vibrix';
  exportKind: 'vibrix-manifest';
  exportedAt: string;
  rendererVersion: string;
  storePersistVersion: number;
  projectName: string;
  revision: string;
  slots: VibrixManifestSlot[];
}

export interface VibrixAuthoringManifestV1 extends VibrixAuthoringManifestBase {
  schemaVersion: 1;
}

export interface VibrixManifestImage {
  id: string;
  kind: 'image';
  name: string;
  revision: string;
  enabled: boolean;
  sceneSlotId: string | null;
  thumbnailDataUrl?: string;
}

export interface VibrixAuthoringManifestV2 extends VibrixAuthoringManifestBase {
  schemaVersion: 2;
  images: VibrixManifestImage[];
}

export type VibrixAuthoringManifest =
  | VibrixAuthoringManifestV1
  | VibrixAuthoringManifestV2;

export interface VibrixAuthoringSlotSnapshot {
  kind: 'slot';
  id: string;
  family: VibrixSlotFamily;
  name: string;
  revision: string;
  values: unknown;
}

export interface VibrixAuthoringImageSnapshot {
  kind: 'image';
  id: string;
  name: string;
  revision: string;
  values: unknown;
}

export type VibrixAuthoringSnapshot =
  | VibrixAuthoringSlotSnapshot
  | VibrixAuthoringImageSnapshot;

export interface VibrixAuthoringPackage {
  format: 'vibrix-authoring';
  packageVersion: 1;
  exportedAt: string;
  manifest: VibrixAuthoringManifestV2;
  snapshots: VibrixAuthoringSnapshot[];
}

export type VibrixAuthoringSource =
  | { kind: 'manifest'; manifest: VibrixAuthoringManifest }
  | { kind: 'package'; package: VibrixAuthoringPackage };

interface CompositionTrackBase {
  id: string;
  name: string;
  order: number;
  enabled: boolean;
  locked: boolean;
}

export interface CompositionTrackV1 extends CompositionTrackBase {
  kind: VibrixSlotFamily;
}

export interface CompositionTrackV2 extends CompositionTrackBase {
  kind: VibrixTimelineKind;
}

export type CompositionTrack = CompositionTrackV1 | CompositionTrackV2;

export type CompositionTransitionType = 'cut' | 'crossfade' | 'morph';
export type CompositionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out';

export interface CompositionCueV1 {
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

export type CompositionTargetV2 =
  | { kind: 'scene'; family: 'scene'; id: string; revision: string }
  | { kind: 'feature-slot'; family: VibrixGranularFamily; id: string; revision: string }
  | { kind: 'image'; family: 'image'; id: string; revision: string }
  | { kind: 'inherit'; family: VibrixGranularFamily };

export interface CompositionCueV2 {
  id: string;
  trackId: string;
  startTimeMs: number;
  target: CompositionTargetV2;
  priority: number;
  enabled: boolean;
}

export type CompositionCue = CompositionCueV1 | CompositionCueV2;

export interface StoredCompositionV1 {
  schemaVersion: 1;
  tracks: CompositionTrackV1[];
  cues: CompositionCueV1[];
}

export interface StoredCompositionV2 {
  schemaVersion: 2;
  tracks: CompositionTrackV2[];
  cues: CompositionCueV2[];
}

export type CompositionScore = StoredCompositionV1 | StoredCompositionV2;

export const DEFAULT_COMPOSITION_SCORE: StoredCompositionV2 = {
  schemaVersion: 2,
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

export const DEFAULT_COMPOSITION_SCORE_V1: StoredCompositionV1 = {
  schemaVersion: 1,
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
