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
}

export function ProjectInspector({
  project,
  onProjectNameChange,
  onProgressChange,
  onImportLyrics,
  onExportProject,
  onImportProject,
  onHardResetProject
}: ProjectInspectorProps) {
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
          <p className="insp-muted">No lyrics sources yet.</p>
        ) : (
          <div className="insp-source-list">
            {[...project.lyricSources].sort((a, b) => a.order - b.order).map(source => (
              <div key={source.id} className="insp-source-row">
                <strong>{source.title}</strong>
                <span>{source.normalizedLines.length} lines</span>
              </div>
            ))}
          </div>
        )}
      </Group>

      <Group title="Danger zone">
        <button className="ls-btn small danger" onClick={onHardResetProject}>
          Hard Reset Project
        </button>
      </Group>
    </section>
  );
}
