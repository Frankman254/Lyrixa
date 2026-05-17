import type { LyricVisualStyle } from '../../core/types/render';
import type { TextFillConfig } from '../../core/types/texture';
import { DEFAULT_TEXT_FILL } from '../../core/types/texture';
import { putTextureAsset } from '../assets/textureAssetStorage';
import { Group } from './InspectorPrimitives';
import { toColorInput } from './inspectorUtils';

interface TextureInspectorProps {
  projectId: string;
  style: LyricVisualStyle;
  onPatchFill: (fill: TextFillConfig) => void;
}

/**
 * Edits the text fill model only. Texture image files are browser assets:
 * the persistent project stores metadata, while IndexedDB stores the blob.
 */
export function TextureInspector({
  projectId,
  style,
  onPatchFill
}: TextureInspectorProps) {
  const textureValue = style.textFill.imageTexture ?? {
    id: crypto.randomUUID(),
    opacity: 1,
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    fit: 'cover' as const,
    missing: true
  };

  const setFillType = (type: TextFillConfig['type']) => {
    if (type === 'solid') {
      onPatchFill({
        ...style.textFill,
        type,
        solidColor: style.textFill.solidColor ?? style.textColor
      });
      return;
    }

    if (type === 'gradient') {
      onPatchFill({
        ...style.textFill,
        type,
        gradient: style.textFill.gradient ?? DEFAULT_TEXT_FILL.gradient
      });
      return;
    }

    onPatchFill({
      ...style.textFill,
      type,
      imageTexture: textureValue
    });
  };

  const handleTextureFile = async (file: File | undefined) => {
    if (!file) return;
    const id = textureValue.id;
    await putTextureAsset(projectId, id, file, file.name);
    const objectUrl = URL.createObjectURL(file);
    onPatchFill({
      ...style.textFill,
      type: 'image-texture',
      imageTexture: {
        id,
        objectUrl,
        opacity: textureValue.opacity,
        scale: textureValue.scale,
        offsetX: textureValue.offsetX,
        offsetY: textureValue.offsetY,
        fit: textureValue.fit,
        fileName: file.name,
        missing: false
      }
    });
  };

  return (
    <section className="insp-stack">
      <Group title="Fill / Texture" open>
        <label>
          Fill type
          <select
            className="form-control form-select"
            value={style.textFill.type}
            onChange={(e) => setFillType(e.target.value as TextFillConfig['type'])}
          >
            <option value="solid">Solid</option>
            <option value="gradient">Gradient</option>
            <option value="image-texture">Image texture</option>
          </select>
        </label>

        {style.textFill.type === 'solid' && (
          <label>
            Solid color
            <input
              className="form-color"
              type="color"
              value={toColorInput(style.textFill.solidColor ?? style.textColor)}
              onChange={(e) => onPatchFill({ ...style.textFill, solidColor: e.target.value })}
            />
          </label>
        )}

        {style.textFill.type === 'gradient' && (
          <div className="inspector-grid">
            <label>
              Color A
              <input
                className="form-color"
                type="color"
                value={toColorInput(style.textFill.gradient?.colorA)}
                onChange={(e) => onPatchFill({
                  ...style.textFill,
                  gradient: { ...(style.textFill.gradient ?? DEFAULT_TEXT_FILL.gradient!), colorA: e.target.value }
                })}
              />
            </label>
            <label>
              Color B
              <input
                className="form-color"
                type="color"
                value={toColorInput(style.textFill.gradient?.colorB)}
                onChange={(e) => onPatchFill({
                  ...style.textFill,
                  gradient: { ...(style.textFill.gradient ?? DEFAULT_TEXT_FILL.gradient!), colorB: e.target.value }
                })}
              />
            </label>
            <label>
              Angle
              <input
                className="form-control form-input"
                type="number"
                value={style.textFill.gradient?.angle ?? 110}
                onChange={(e) => onPatchFill({
                  ...style.textFill,
                  gradient: { ...(style.textFill.gradient ?? DEFAULT_TEXT_FILL.gradient!), angle: parseFloat(e.target.value) || 0 }
                })}
              />
            </label>
          </div>
        )}

        {style.textFill.type === 'image-texture' && (
          <>
            {(textureValue.missing || !textureValue.objectUrl) && <div className="insp-warning">Reload texture image</div>}
            <label>
              Texture image
              <input
                className="form-control form-input"
                type="file"
                accept="image/*"
                onChange={(e) => void handleTextureFile(e.target.files?.[0])}
              />
            </label>
            <label>
              Opacity
              <input
                className="form-range"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={textureValue.opacity}
                onChange={(e) => onPatchFill({
                  ...style.textFill,
                  imageTexture: { ...textureValue, opacity: parseFloat(e.target.value) }
                })}
              />
            </label>
            <label>
              Scale
              <input
                className="form-range"
                type="range"
                min={0.25}
                max={4}
                step={0.05}
                value={textureValue.scale}
                onChange={(e) => onPatchFill({
                  ...style.textFill,
                  imageTexture: { ...textureValue, scale: parseFloat(e.target.value) }
                })}
              />
            </label>
            <label>
              Fit
              <select
                className="form-control form-select"
                value={textureValue.fit}
                onChange={(e) => onPatchFill({
                  ...style.textFill,
                  imageTexture: { ...textureValue, fit: e.target.value as 'cover' | 'contain' }
                })}
              >
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
              </select>
            </label>
            <div className="inspector-grid">
              <label>
                Offset X
                <input
                  className="form-control form-input"
                  type="number"
                  value={textureValue.offsetX}
                  onChange={(e) => onPatchFill({
                    ...style.textFill,
                    imageTexture: { ...textureValue, offsetX: parseFloat(e.target.value) || 0 }
                  })}
                />
              </label>
              <label>
                Offset Y
                <input
                  className="form-control form-input"
                  type="number"
                  value={textureValue.offsetY}
                  onChange={(e) => onPatchFill({
                    ...style.textFill,
                    imageTexture: { ...textureValue, offsetY: parseFloat(e.target.value) || 0 }
                  })}
                />
              </label>
            </div>
          </>
        )}
      </Group>
    </section>
  );
}
