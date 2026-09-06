/**
 * Short, stable fingerprint of a lyric line.
 *
 * Used to tell whether a derived line (a translation, a romanization) still
 * corresponds to the primary text it was produced from. It compares *meaning-
 * bearing* text only: leading/trailing space and runs of whitespace are
 * normalized away, because re-wrapping a line in the editor does not make its
 * translation wrong.
 *
 * Not a security hash. djb2 is chosen for being deterministic across runs and
 * cheap enough to call per clip on every render pass.
 */
export function hashLyricText(text: string): string {
  const normalized = text.trim().replace(/\s+/g, ' ');
  let hash = 5381;
  for (let i = 0; i < normalized.length; i += 1) {
    hash = ((hash << 5) + hash) ^ normalized.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}
