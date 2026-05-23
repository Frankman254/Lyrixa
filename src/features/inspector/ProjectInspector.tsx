import { useState } from 'react';
import type { ClipProgressIndicatorConfig } from '../../core/types/render';
import type { LyrixaProject } from '../../core/types/project';
import { Group } from './InspectorPrimitives';

interface ProjectInspectorProps {
  project: LyrixaProject;
  onProjectNameChange: (name: string) => void;
  onProgressChange: (next: ClipProgressIndicatorConfig) => void;
  onImportLyrics: () => void;
  onExportProject: () => void;
  onImportProject: () => void;
  onHardResetProject: () => void;
  onRenameLyricSource: (id: string, title: string) => void;
  onRemoveLyricSource: (id: string) => void;
}

export function ProjectInspector({
  project,
  onProjectNameChange,
  onProgressChange,
  onImportLyrics,
  onExportProject,
  onImportProject,
  onHardResetProject,
  onRenameLyricSource,
  onRemoveLyricSource
}: ProjectInspectorProps) {
  // Local edit buffer so the user can type without re-rendering the entire list
  // and losing focus on every keystroke.
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const commitTitle = (id: string, fallback: string) => {
    const draft = drafts[id];
    if (draft === undefined) return;
    const trimmed = draft.trim();
    setDrafts(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (trimmed && trimmed !== fallback) onRenameLyricSource(id, trimmed);
  };
  return (
    <section className="insp-stack">
      <Group title="Basic" open>
        <label>
          Project name
          <input
            className="form-control form-input"
            value={project.name}
            onChange={(e) => onProjectNameChange(e.target.value)}
          />
        </label>
        <div className="insp-button-row">
          <button className="ls-btn small" onClick={onImportLyrics}>Import lyrics</button>
          <button className="ls-btn small" onClick={onExportProject}>Export project</button>
          <button className="ls-btn small" onClick={onImportProject}>Import project</button>
        </div>
      </Group>

      <Group title="Preview settings">
        <label className="tl-inline-check">
          <input
            type="checkbox"
            checked={project.progressIndicatorConfig.enabled}
            onChange={(e) => onProgressChange({ ...project.progressIndicatorConfig, enabled: e.target.checked })}
          />
          Show progress dot by default
        </label>
      </Group>

      <Group title="Lyrics sources">
        {project.lyricSources.length === 0 ? (
          <p className="insp-muted">No lyrics sources yet. Use Import lyrics above to add one.</p>
        ) : (
          <div className="insp-source-list">
            {[...project.lyricSources].sort((a, b) => a.order - b.order).map(source => {
              const draft = drafts[source.id];
              const value = draft ?? source.title;
              return (
                <div key={source.id} className="insp-source-row">
                  <input
                    className="form-control form-input"
                    value={value}
                    onChange={(e) => setDrafts(prev => ({ ...prev, [source.id]: e.target.value }))}
                    onBlur={() => commitTitle(source.id, source.title)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      else if (e.key === 'Escape') setDrafts(prev => {
                        const next = { ...prev };
                        delete next[source.id];
                        return next;
                      });
                    }}
                  />
                  <span className="insp-muted">{source.normalizedLines.length} lines</span>
                  <button
                    type="button"
                    className="ls-btn small danger"
                    title="Delete this lyric source. Clips already placed on layers are kept."
                    onClick={() => {
                      const ok = window.confirm(
                        `Delete lyric source "${source.title}"? Clips already placed on layers stay; only the lyric text is removed.`
                      );
                      if (ok) onRemoveLyricSource(source.id);
                    }}
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <p className="insp-muted" style={{ marginTop: 4 }}>
              Deleting a source removes only the lyric text. Clips already placed on layers via Sync stay intact.
            </p>
          </div>
        )}
      </Group>

      <Group title="Danger zone" open>
        <button className="ls-btn small danger" onClick={onHardResetProject}>
          Delete whole project
        </button>
      </Group>
    </section>
  );
}
