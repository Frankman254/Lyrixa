import type { AudioLibraryAsset } from '../../core/types/audio';
import type { LyrixaProject } from '../../core/types/project';
import {
  createProjectExportEnvelope,
  parseProjectExportEnvelope,
  type LyrixaExportEnvelope
} from '../../core/project/serialization';
import {
  getLibraryAudio,
  putLibraryAudio,
  type StoredAudio
} from './audioBlobStorage';

const MAGIC = 'LYRIXA_PACKAGE_V1\n';
const HEADER_SCAN_BYTES = 2 * 1024 * 1024;

interface PackageAudioAsset extends AudioLibraryAsset {
  byteLength: number;
}

interface LyrixaPackageHeader {
  format: 'lyrixa-project-package';
  version: 1;
  project: LyrixaExportEnvelope;
  audioAssets: PackageAudioAsset[];
}

export async function createLyrixaProjectPackage(
  project: LyrixaProject,
  uiPreferences: LyrixaExportEnvelope['project']['uiPreferences'] = {}
): Promise<{
  blob: Blob;
  includedAudioCount: number;
  missingAudioCount: number;
}> {
  const references = collectProjectAudioReferences(project);
  const records: StoredAudio[] = [];
  let missingAudioCount = 0;

  for (const reference of references) {
    const stored = await getLibraryAudio(reference.fileKey);
    if (!stored) {
      missingAudioCount += 1;
      continue;
    }
    records.push(stored);
  }

  const header: LyrixaPackageHeader = {
    format: 'lyrixa-project-package',
    version: 1,
    project: createProjectExportEnvelope(project, uiPreferences),
    audioAssets: records.map(record => ({
      fileKey: record.fileKey!,
      fileName: record.fileName,
      duration: record.duration,
      sizeBytes: record.sizeBytes,
      lastModified: record.lastModified,
      mimeType: record.mimeType,
      byteLength: record.blob.size
    }))
  };

  return {
    blob: new Blob([
      MAGIC,
      JSON.stringify(header),
      '\n',
      ...records.map(record => record.blob)
    ], { type: 'application/x-lyrixa-project' }),
    includedAudioCount: records.length,
    missingAudioCount
  };
}

export async function importLyrixaProjectPackage(file: File): Promise<{
  project: LyrixaProject;
  envelope: LyrixaExportEnvelope;
}> {
  const scan = await file.slice(0, Math.min(file.size, HEADER_SCAN_BYTES)).text();
  if (!scan.startsWith(MAGIC)) throw new Error('Invalid Lyrixa project package.');
  const headerEnd = scan.indexOf('\n', MAGIC.length);
  if (headerEnd < 0) throw new Error('Lyrixa package header is incomplete.');

  const header = JSON.parse(scan.slice(MAGIC.length, headerEnd)) as Partial<LyrixaPackageHeader>;
  if (
    header.format !== 'lyrixa-project-package' ||
    header.version !== 1 ||
    !header.project ||
    !Array.isArray(header.audioAssets)
  ) {
    throw new Error('Unsupported Lyrixa project package.');
  }

  let offset = new Blob([MAGIC, scan.slice(MAGIC.length, headerEnd), '\n']).size;
  for (const asset of header.audioAssets) {
    if (!asset.fileKey || !asset.fileName || !Number.isFinite(asset.byteLength)) {
      throw new Error('Lyrixa package contains invalid audio metadata.');
    }
    const end = offset + asset.byteLength;
    if (end > file.size) throw new Error('Lyrixa package audio data is incomplete.');
    await putLibraryAudio({
      blob: file.slice(offset, end, asset.mimeType || 'application/octet-stream'),
      fileKey: asset.fileKey,
      fileName: asset.fileName,
      duration: asset.duration,
      sizeBytes: asset.sizeBytes,
      lastModified: asset.lastModified,
      mimeType: asset.mimeType,
      storedAt: Date.now()
    });
    offset = end;
  }

  return {
    project: parseProjectExportEnvelope(header.project),
    envelope: header.project
  };
}

export async function isLyrixaProjectPackage(file: File): Promise<boolean> {
  return (await file.slice(0, MAGIC.length).text()) === MAGIC;
}

function collectProjectAudioReferences(project: LyrixaProject): AudioLibraryAsset[] {
  const byKey = new Map(project.audioLibrary.map(asset => [asset.fileKey, asset]));
  const master = project.audioTracks.master;
  if (master?.fileKey && !byKey.has(master.fileKey)) {
    byKey.set(master.fileKey, {
      fileKey: master.fileKey,
      fileName: master.fileName,
      duration: master.duration,
      sizeBytes: master.sizeBytes,
      lastModified: master.lastModified,
      mimeType: master.mimeType
    });
  }
  return [...byKey.values()];
}
