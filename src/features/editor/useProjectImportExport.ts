import { useCallback, useRef } from 'react';
import type { ChangeEvent } from 'react';
import type { LyrixaProject } from '../../core/types/project';
import {
  parseProjectExportEnvelope
} from '../../core/project/serialization';
import {
  createLyricsBundleEnvelope,
  mergeLyricsBundleIntoProject,
  parseLyricsBundleEnvelope
} from '../../core/project/lyricsBundle';
import {
  createLyrixaProjectPackage,
  importLyrixaProjectPackage,
  isLyrixaProjectPackage
} from './projectPackage';

interface UseProjectImportExportArgs {
  project: LyrixaProject;
  importProject: (next: LyrixaProject) => void;
  onProjectImported: (project: LyrixaProject) => void;
}

export function useProjectImportExport({
  project,
  importProject,
  onProjectImported
}: UseProjectImportExportArgs) {
  const projectImportInputRef = useRef<HTMLInputElement>(null);
  const lyricsBundleImportInputRef = useRef<HTMLInputElement>(null);

  const openProjectImportPicker = () => projectImportInputRef.current?.click();
  const openLyricsBundleImportPicker = () => lyricsBundleImportInputRef.current?.click();

  const handleExportProject = useCallback(async () => {
    try {
      const { blob, includedAudioCount, missingAudioCount } =
        await createLyrixaProjectPackage(project, {
          bandMode: safeGetLocalStorage('lyrixa_band_mode') ?? undefined
        });
      downloadBlob(blob, `${sanitizeFileName(project.name) || 'lyrixa-project'}.lyrixa-package`);
      if (missingAudioCount > 0) {
        window.alert(
          `Project exported with ${includedAudioCount} audio file(s). ${missingAudioCount} referenced audio file(s) were missing from this device and could not be bundled.`
        );
      }
    } catch (err) {
      console.error('[Lyrixa] Failed to export project package:', err);
      window.alert(err instanceof Error ? err.message : 'Could not export Lyrixa project package.');
    }
  }, [project]);

  const handleExportLyricsBundle = useCallback(() => {
    const envelope = createLyricsBundleEnvelope(project);
    const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const safeName = sanitizeFileName(project.name) || 'lyrixa-lyrics';
    link.href = url;
    link.download = `${safeName}.lyrixa-lyrics.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, [project]);

  const handleProjectFileSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const packageFile = await isLyrixaProjectPackage(file);
      const packageImport = packageFile ? await importLyrixaProjectPackage(file) : null;
      const envelope = packageImport?.envelope ?? JSON.parse(await file.text());
      const imported = packageImport?.project ?? parseProjectExportEnvelope(envelope);
      const bandMode = envelope?.project?.uiPreferences?.bandMode;
      if (typeof bandMode === 'string') {
        try { window.localStorage.setItem('lyrixa_band_mode', bandMode); } catch { /* ignore */ }
      }
      importProject(imported);
      onProjectImported(imported);
    } catch (err) {
      console.error('[Lyrixa] Failed to import project:', err);
      window.alert(err instanceof Error ? err.message : 'Could not import Lyrixa project.');
    }
  }, [importProject, onProjectImported]);

  const handleLyricsBundleFileSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const envelope = JSON.parse(await file.text());
      const parsed = parseLyricsBundleEnvelope(envelope);
      const merged = mergeLyricsBundleIntoProject(project, parsed);
      importProject(merged);
      onProjectImported(merged);
    } catch (err) {
      console.error('[Lyrixa] Failed to import lyrics bundle:', err);
      window.alert(err instanceof Error ? err.message : 'Could not import Lyrixa lyrics bundle.');
    }
  }, [importProject, onProjectImported, project]);

  return {
    projectImportInputRef,
    lyricsBundleImportInputRef,
    openProjectImportPicker,
    openLyricsBundleImportPicker,
    handleExportProject,
    handleExportLyricsBundle,
    handleProjectFileSelected,
    handleLyricsBundleFileSelected
  };
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeGetLocalStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
