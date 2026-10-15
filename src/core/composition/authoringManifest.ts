import {
  VIBRIX_SLOT_FAMILIES,
  type VibrixAuthoringImageSnapshot,
  type VibrixAuthoringManifest,
  type VibrixAuthoringManifestV2,
  type VibrixAuthoringPackage,
  type VibrixAuthoringSlotSnapshot,
  type VibrixAuthoringSnapshot,
  type VibrixAuthoringSource,
  type VibrixManifestImage,
  type VibrixManifestSlot,
  type VibrixSlotFamily
} from './types';

export type ManifestParseResult =
  | { ok: true; manifest: VibrixAuthoringManifest; errors: [] }
  | { ok: false; manifest: null; errors: string[] };

export type AuthoringPackageParseResult =
  | { ok: true; package: VibrixAuthoringPackage; errors: [] }
  | { ok: false; package: null; errors: string[] };

export type AuthoringSourceParseResult =
  | { ok: true; source: VibrixAuthoringSource; errors: [] }
  | { ok: false; source: null; errors: string[] };

const FAMILY_SET = new Set<string>(VIBRIX_SLOT_FAMILIES);

/** Validate an untrusted loose Vibrix manifest without browser APIs. */
export function parseAuthoringManifest(input: unknown): ManifestParseResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, manifest: null, errors: ['Manifest must be a JSON object.'] };
  }

  const schemaVersion = input.schemaVersion;
  if (schemaVersion !== 1 && schemaVersion !== 2) {
    errors.push('schemaVersion must be 1 or 2.');
  }
  if (input.app !== 'Vibrix') errors.push('app must be "Vibrix".');
  if (input.exportKind !== 'vibrix-manifest') errors.push('exportKind must be "vibrix-manifest".');
  requireString(input, 'exportedAt', errors);
  requireString(input, 'rendererVersion', errors);
  requireNumber(input, 'storePersistVersion', errors);
  requireString(input, 'projectName', errors);
  requireString(input, 'revision', errors);

  const slots: VibrixManifestSlot[] = [];
  if (!Array.isArray(input.slots)) {
    errors.push('slots must be an array.');
  } else {
    const ids = new Set<string>();
    input.slots.forEach((raw, index) => {
      const slot = parseSlot(raw, index, errors);
      if (!slot) return;
      if (ids.has(slot.id)) {
        errors.push(`slots[${index}].id duplicates "${slot.id}".`);
        return;
      }
      ids.add(slot.id);
      slots.push(slot);
    });
    validateSceneBindings(slots, errors);
  }

  const images: VibrixManifestImage[] = [];
  if (schemaVersion === 2) {
    if (!Array.isArray(input.images)) {
      errors.push('images must be an array for schemaVersion 2.');
    } else {
      const ids = new Set<string>();
      input.images.forEach((raw, index) => {
        const image = parseImage(raw, index, errors);
        if (!image) return;
        if (ids.has(image.id)) {
          errors.push(`images[${index}].id duplicates "${image.id}".`);
          return;
        }
        ids.add(image.id);
        images.push(image);
      });
    }
  }

  if (errors.length > 0 || (schemaVersion !== 1 && schemaVersion !== 2)) {
    return { ok: false, manifest: null, errors };
  }

  const common = {
    app: 'Vibrix' as const,
    exportKind: 'vibrix-manifest' as const,
    exportedAt: input.exportedAt as string,
    rendererVersion: input.rendererVersion as string,
    storePersistVersion: input.storePersistVersion as number,
    projectName: input.projectName as string,
    revision: input.revision as string,
    slots
  };
  return schemaVersion === 2
    ? { ok: true, errors: [], manifest: { ...common, schemaVersion: 2, images } }
    : { ok: true, errors: [], manifest: { ...common, schemaVersion: 1 } };
}

/** Validate the self-contained JSON hand-off exported by Vibrix. */
export function parseAuthoringPackage(input: unknown): AuthoringPackageParseResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, package: null, errors: ['Authoring package must be a JSON object.'] };
  }
  if (input.format !== 'vibrix-authoring') errors.push('format must be "vibrix-authoring".');
  if (input.packageVersion !== 1) errors.push('packageVersion must be 1.');
  requireString(input, 'exportedAt', errors, 'package');

  const parsedManifest = parseAuthoringManifest(input.manifest);
  if (!parsedManifest.ok) {
    errors.push(...parsedManifest.errors.map(error => `manifest.${error}`));
  } else if (parsedManifest.manifest.schemaVersion !== 2) {
    errors.push('manifest.schemaVersion must be 2 inside a package.');
  } else if (input.exportedAt !== parsedManifest.manifest.exportedAt) {
    errors.push('package.exportedAt must match manifest.exportedAt.');
  }

  const snapshots: VibrixAuthoringSnapshot[] = [];
  if (!Array.isArray(input.snapshots)) {
    errors.push('package.snapshots must be an array.');
  } else {
    const keys = new Set<string>();
    input.snapshots.forEach((raw, index) => {
      const rawKey = isRecord(raw) && (raw.kind === 'slot' || raw.kind === 'image') &&
        typeof raw.id === 'string' && raw.id.length > 0
        ? snapshotKey(raw.kind, raw.id)
        : null;
      const duplicate = rawKey ? keys.has(rawKey) : false;
      if (duplicate) {
        errors.push(`snapshots[${index}] duplicates (${raw.kind}, "${raw.id}").`);
      } else if (rawKey) {
        keys.add(rawKey);
      }
      const snapshot = parseSnapshot(raw, index, errors);
      if (!snapshot || duplicate) return;
      const key = snapshotKey(snapshot.kind, snapshot.id);
      if (!rawKey) keys.add(key);
      snapshots.push(snapshot);
    });
  }

  if (parsedManifest.ok && parsedManifest.manifest.schemaVersion === 2) {
    validateSnapshots(parsedManifest.manifest, snapshots, errors);
  }

  if (errors.length > 0 || !parsedManifest.ok || parsedManifest.manifest.schemaVersion !== 2) {
    return { ok: false, package: null, errors };
  }
  return {
    ok: true,
    errors: [],
    package: {
      format: 'vibrix-authoring',
      packageVersion: 1,
      exportedAt: input.exportedAt as string,
      manifest: parsedManifest.manifest,
      snapshots
    }
  };
}

/** Detect and parse either the package or the legacy loose-manifest input. */
export function parseAuthoringSource(input: unknown): AuthoringSourceParseResult {
  if (isRecord(input) && input.format === 'vibrix-authoring') {
    const parsed = parseAuthoringPackage(input);
    return parsed.ok
      ? { ok: true, source: { kind: 'package', package: parsed.package }, errors: [] }
      : { ok: false, source: null, errors: parsed.errors };
  }
  const parsed = parseAuthoringManifest(input);
  return parsed.ok
    ? { ok: true, source: { kind: 'manifest', manifest: parsed.manifest }, errors: [] }
    : { ok: false, source: null, errors: parsed.errors };
}

export function manifestFromAuthoringSource(source: VibrixAuthoringSource): VibrixAuthoringManifest {
  return source.kind === 'package' ? source.package.manifest : source.manifest;
}

export function isManifestSlotDraggable(slot: VibrixManifestSlot): boolean {
  return slot.cueable && slot.revision !== 'empty';
}

function parseSlot(raw: unknown, index: number, errors: string[]): VibrixManifestSlot | null {
  const path = `slots[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  const before = errors.length;
  requireString(raw, 'id', errors, path);
  requireString(raw, 'name', errors, path);
  requireString(raw, 'revision', errors, path);
  requireBoolean(raw, 'sceneBindable', errors, path);
  requireBoolean(raw, 'cueable', errors, path);
  if (typeof raw.family !== 'string' || !FAMILY_SET.has(raw.family)) {
    errors.push(`${path}.family is not a supported Vibrix slot family.`);
  }
  if (raw.thumbnailDataUrl !== undefined && !isTransportableImageDataUrl(raw.thumbnailDataUrl)) {
    errors.push(`${path}.thumbnailDataUrl must be a transportable image data URL.`);
  }

  let bindings: VibrixManifestSlot['bindings'];
  if (raw.bindings !== undefined) {
    if (!isRecord(raw.bindings)) {
      errors.push(`${path}.bindings must be an object when present.`);
    } else {
      bindings = {};
      for (const [family, target] of Object.entries(raw.bindings)) {
        if (!FAMILY_SET.has(family)) {
          errors.push(`${path}.bindings contains unsupported family "${family}".`);
        } else if (typeof target !== 'string' || target.length === 0) {
          errors.push(`${path}.bindings.${family} must be a slot id or "off".`);
        } else {
          bindings[family as VibrixSlotFamily] = target;
        }
      }
    }
  }

  if (errors.length !== before) return null;
  return {
    id: raw.id as string,
    family: raw.family as VibrixSlotFamily,
    name: raw.name as string,
    revision: raw.revision as string,
    ...(bindings ? { bindings } : {}),
    sceneBindable: raw.sceneBindable as boolean,
    cueable: raw.cueable as boolean,
    ...(typeof raw.thumbnailDataUrl === 'string'
      ? { thumbnailDataUrl: raw.thumbnailDataUrl }
      : {})
  };
}

function parseImage(raw: unknown, index: number, errors: string[]): VibrixManifestImage | null {
  const path = `images[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  const before = errors.length;
  requireString(raw, 'id', errors, path);
  requireString(raw, 'name', errors, path);
  requireString(raw, 'revision', errors, path);
  requireBoolean(raw, 'enabled', errors, path);
  if (raw.kind !== 'image') errors.push(`${path}.kind must be "image".`);
  if (raw.sceneSlotId !== null && typeof raw.sceneSlotId !== 'string') {
    errors.push(`${path}.sceneSlotId must be a string or null.`);
  }
  if (raw.thumbnailDataUrl !== undefined && !isTransportableImageDataUrl(raw.thumbnailDataUrl)) {
    errors.push(`${path}.thumbnailDataUrl must be a transportable image data URL.`);
  }
  if (errors.length !== before) return null;
  return {
    id: raw.id as string,
    kind: 'image',
    name: raw.name as string,
    revision: raw.revision as string,
    enabled: raw.enabled as boolean,
    sceneSlotId: raw.sceneSlotId as string | null,
    ...(typeof raw.thumbnailDataUrl === 'string'
      ? { thumbnailDataUrl: raw.thumbnailDataUrl }
      : {})
  };
}

function parseSnapshot(raw: unknown, index: number, errors: string[]): VibrixAuthoringSnapshot | null {
  const path = `snapshots[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  const before = errors.length;
  requireString(raw, 'id', errors, path);
  requireString(raw, 'name', errors, path);
  requireString(raw, 'revision', errors, path);
  if (raw.kind !== 'slot' && raw.kind !== 'image') {
    errors.push(`${path}.kind must be "slot" or "image".`);
  }
  if (!Object.hasOwn(raw, 'values')) errors.push(`${path}.values is required.`);
  if (containsNonTransportableUrl(raw.values)) {
    errors.push(`${path}.values contains a non-transportable URL or local path.`);
  }
  if (raw.kind === 'slot' && (typeof raw.family !== 'string' || !FAMILY_SET.has(raw.family))) {
    errors.push(`${path}.family is not a supported Vibrix slot family.`);
  }
  if (errors.length !== before) return null;
  const common = {
    id: raw.id as string,
    name: raw.name as string,
    revision: raw.revision as string,
    values: raw.values
  };
  return raw.kind === 'slot'
    ? { ...common, kind: 'slot', family: raw.family as VibrixSlotFamily } satisfies VibrixAuthoringSlotSnapshot
    : { ...common, kind: 'image' } satisfies VibrixAuthoringImageSnapshot;
}

function validateSceneBindings(slots: VibrixManifestSlot[], errors: string[]): void {
  const byId = new Map(slots.map(slot => [slot.id, slot]));
  for (const scene of slots.filter(slot => slot.family === 'scene')) {
    for (const [family, targetId] of Object.entries(scene.bindings ?? {})) {
      if (targetId === 'off') continue;
      const target = byId.get(targetId);
      if (!target) {
        errors.push(`Scene "${scene.id}" binding ${family} references missing slot "${targetId}".`);
      } else if (target.family !== family) {
        errors.push(`Scene "${scene.id}" binding ${family} references a ${target.family} slot.`);
      } else if (!target.sceneBindable) {
        errors.push(`Scene "${scene.id}" cannot bind slot "${targetId}" because sceneBindable is false.`);
      }
    }
  }
}

function validateSnapshots(
  manifest: VibrixAuthoringManifestV2,
  snapshots: VibrixAuthoringSnapshot[],
  errors: string[]
): void {
  const expected = new Map<string, VibrixManifestSlot | VibrixManifestImage>();
  manifest.slots.forEach(slot => expected.set(snapshotKey('slot', slot.id), slot));
  manifest.images.forEach(image => expected.set(snapshotKey('image', image.id), image));
  const actual = new Map(snapshots.map(snapshot => [snapshotKey(snapshot.kind, snapshot.id), snapshot]));

  for (const [key, item] of expected) {
    const snapshot = actual.get(key);
    if (!snapshot) {
      errors.push(`Missing ${key} snapshot.`);
      continue;
    }
    if (snapshot.revision !== item.revision) {
      errors.push(`${key} snapshot revision does not match the manifest.`);
    }
    if (snapshot.kind === 'slot' && 'family' in item && snapshot.family !== item.family) {
      errors.push(`${key} snapshot family does not match the manifest.`);
    }
  }
  for (const [key] of actual) {
    if (!expected.has(key)) errors.push(`Orphan ${key} snapshot.`);
  }
}

export function snapshotKey(kind: 'slot' | 'image', id: string): string {
  return `${kind}:${id}`;
}

function isTransportableImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('data:image/') && value.includes(',');
}

function containsNonTransportableUrl(value: unknown): boolean {
  if (typeof value === 'string') {
    return /^(?:blob:|https?:|file:|\/Users\/|\/home\/|[A-Za-z]:\\)/.test(value);
  }
  if (Array.isArray(value)) return value.some(containsNonTransportableUrl);
  if (isRecord(value)) return Object.values(value).some(containsNonTransportableUrl);
  return false;
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  errors: string[],
  prefix = 'manifest'
): void {
  if (typeof value[key] !== 'string' || value[key].length === 0) {
    errors.push(`${prefix}.${key} must be a non-empty string.`);
  }
}

function requireNumber(
  value: Record<string, unknown>,
  key: string,
  errors: string[],
  prefix = 'manifest'
): void {
  if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
    errors.push(`${prefix}.${key} must be a finite number.`);
  }
}

function requireBoolean(
  value: Record<string, unknown>,
  key: string,
  errors: string[],
  prefix = 'manifest'
): void {
  if (typeof value[key] !== 'boolean') errors.push(`${prefix}.${key} must be a boolean.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
