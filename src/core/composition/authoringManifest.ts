import {
  VIBRIX_SLOT_FAMILIES,
  type VibrixAuthoringManifest,
  type VibrixManifestSlot,
  type VibrixSlotFamily
} from './types';

export type ManifestParseResult =
  | { ok: true; manifest: VibrixAuthoringManifest; errors: [] }
  | { ok: false; manifest: null; errors: string[] };

const FAMILY_SET = new Set<string>(VIBRIX_SLOT_FAMILIES);

/** Validate untrusted Vibrix JSON without relying on browser APIs. */
export function parseAuthoringManifest(input: unknown): ManifestParseResult {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { ok: false, manifest: null, errors: ['Manifest must be a JSON object.'] };
  }

  if (input.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
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

  if (errors.length > 0) return { ok: false, manifest: null, errors };
  return {
    ok: true,
    errors: [],
    manifest: {
      schemaVersion: 1,
      app: 'Vibrix',
      exportKind: 'vibrix-manifest',
      exportedAt: input.exportedAt as string,
      rendererVersion: input.rendererVersion as string,
      storePersistVersion: input.storePersistVersion as number,
      projectName: input.projectName as string,
      revision: input.revision as string,
      slots
    }
  };
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
    cueable: raw.cueable as boolean
  };
}

function requireString(value: Record<string, unknown>, key: string, errors: string[], prefix = 'manifest'): void {
  if (typeof value[key] !== 'string' || value[key].length === 0) {
    errors.push(`${prefix}.${key} must be a non-empty string.`);
  }
}

function requireNumber(value: Record<string, unknown>, key: string, errors: string[], prefix = 'manifest'): void {
  if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
    errors.push(`${prefix}.${key} must be a finite number.`);
  }
}

function requireBoolean(value: Record<string, unknown>, key: string, errors: string[], prefix = 'manifest'): void {
  if (typeof value[key] !== 'boolean') errors.push(`${prefix}.${key} must be a boolean.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
