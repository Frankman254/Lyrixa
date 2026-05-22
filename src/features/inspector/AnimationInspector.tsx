import type { LyricAnimationConfig } from '../../core/types/render';
import { Group } from './InspectorPrimitives';

const ACTIVE_ANIMATION_OPTIONS: LyricAnimationConfig['activeAnimation'][] = [
  'none',
  'pulse',
  'glow-pulse',
  'breathing',
  'shake-light',
  'wave',
  'flicker'
];

const TRANSITION_OPTIONS: LyricAnimationConfig['transitionIn'][] = [
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'scale-in',
  'scale-out',
  'blur-in',
  'blur-out',
  'glow-pop',
  'glitch-in',
  'glitch-out'
];

interface AnimationInspectorProps {
  animation: LyricAnimationConfig;
  onPatchAnimation: (patch: Partial<LyricAnimationConfig>) => void;
}

export function AnimationInspector({
  animation,
  onPatchAnimation
}: AnimationInspectorProps) {
  return (
    <section className="insp-stack">
      <Group title="Animation" open>
        <label>
          Enter
          <select
            className="form-control form-select"
            value={animation.transitionIn}
            onChange={(e) => onPatchAnimation({
              transitionIn: e.target.value as LyricAnimationConfig['transitionIn']
            })}
          >
            {TRANSITION_OPTIONS.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Exit
          <select
            className="form-control form-select"
            value={animation.transitionOut}
            onChange={(e) => onPatchAnimation({
              transitionOut: e.target.value as LyricAnimationConfig['transitionOut']
            })}
          >
            {TRANSITION_OPTIONS.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Active
          <select
            className="form-control form-select"
            value={animation.activeAnimation}
            onChange={(e) => onPatchAnimation({
              activeAnimation: e.target.value as LyricAnimationConfig['activeAnimation']
            })}
          >
            {ACTIVE_ANIMATION_OPTIONS.map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          Intensity
          <input
            className="form-range"
            type="range"
            min={0}
            max={2.5}
            step={0.05}
            value={animation.intensity}
            onChange={(e) => onPatchAnimation({ intensity: parseFloat(e.target.value) })}
          />
        </label>
        <label>
          Speed
          <input
            className="form-range"
            type="range"
            min={0.25}
            max={4}
            step={0.05}
            value={animation.speed}
            onChange={(e) => onPatchAnimation({ speed: parseFloat(e.target.value) })}
          />
        </label>
      </Group>
    </section>
  );
}
