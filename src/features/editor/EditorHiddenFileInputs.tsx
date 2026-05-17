import type { ChangeEvent, RefObject } from 'react';
import type { AudioChannelRole } from '../../core/types/audio';

interface EditorHiddenFileInputsProps {
  masterFileInputRef: RefObject<HTMLInputElement | null>;
  vocalsFileInputRef: RefObject<HTMLInputElement | null>;
  projectImportInputRef: RefObject<HTMLInputElement | null>;
  lyricsBundleImportInputRef: RefObject<HTMLInputElement | null>;
  onAudioFileSelected: (role: AudioChannelRole) => (e: ChangeEvent<HTMLInputElement>) => void;
  onProjectFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
  onLyricsBundleFileSelected: (e: ChangeEvent<HTMLInputElement>) => void;
}

export function EditorHiddenFileInputs({
  masterFileInputRef,
  vocalsFileInputRef,
  projectImportInputRef,
  lyricsBundleImportInputRef,
  onAudioFileSelected,
  onProjectFileSelected,
  onLyricsBundleFileSelected
}: EditorHiddenFileInputsProps) {
  return (
    <>
      <input
        ref={masterFileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
        style={{ display: 'none' }}
        onChange={onAudioFileSelected('master')}
      />
      <input
        ref={vocalsFileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
        style={{ display: 'none' }}
        onChange={onAudioFileSelected('vocals')}
      />
      <input
        ref={projectImportInputRef}
        type="file"
        accept=".lyrixa.json,application/json"
        style={{ display: 'none' }}
        onChange={onProjectFileSelected}
      />
      <input
        ref={lyricsBundleImportInputRef}
        type="file"
        accept=".lyrixa-lyrics.json,application/json"
        style={{ display: 'none' }}
        onChange={onLyricsBundleFileSelected}
      />
    </>
  );
}
