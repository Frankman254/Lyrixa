import { useEffect, useMemo, useState } from 'react';
import type { AudioBandMode, AudioChannel, AudioPeak } from '../../core/types/audio';

interface UseTimelineBandPeaksArgs {
  bandMode: AudioBandMode;
  masterChannel?: AudioChannel | null;
  fallbackPeaks?: AudioPeak[];
  onExtractBandPeaks?: (mode: AudioBandMode) => Promise<AudioPeak[] | null>;
}

/**
 * Keeps waveform band extraction out of TimelineEditor.
 *
 * The hook decides which peak array should be displayed for the current band
 * mode and caches async extraction results per master track. All bands are
 * derived from the master track via frequency filtering.
 */
export function useTimelineBandPeaks({
  bandMode,
  masterChannel,
  fallbackPeaks,
  onExtractBandPeaks
}: UseTimelineBandPeaksArgs) {
  const masterPeaks = masterChannel?.waveformPeaks ?? fallbackPeaks;
  const [bandPeaks, setBandPeaks] = useState<AudioPeak[] | null>(null);
  const [bandPeaksLoading, setBandPeaksLoading] = useState(false);
  const [bandPeaksSource, setBandPeaksSource] = useState<'master' | 'estimated'>('master');

  useEffect(() => {
    if (bandMode === 'auto' || bandMode === 'full-mix') {
      setBandPeaks(null);
      setBandPeaksSource('master');
      setBandPeaksLoading(false);
      return;
    }

    if (!onExtractBandPeaks) {
      setBandPeaks(null);
      setBandPeaksLoading(false);
      return;
    }

    let cancelled = false;
    setBandPeaksLoading(true);
    onExtractBandPeaks(bandMode)
      .then(extracted => {
        if (cancelled) return;
        setBandPeaks(extracted ?? null);
        const isEstimated = bandMode === 'vocals' || bandMode === 'instrumental';
        setBandPeaksSource(isEstimated ? 'estimated' : 'master');
      })
      .catch(() => { if (!cancelled) setBandPeaks(null); })
      .finally(() => { if (!cancelled) setBandPeaksLoading(false); });

    return () => { cancelled = true; };
  }, [bandMode, masterChannel?.fileName, masterPeaks, onExtractBandPeaks]);

  return useMemo(() => {
    const displayPeaks = (bandMode === 'auto' || bandMode === 'full-mix')
      ? masterPeaks
      : (bandPeaks ?? masterPeaks);

    return {
      masterPeaks,
      displayPeaks,
      bandPeaks,
      bandPeaksLoading,
      bandPeaksSource,
      masterIsMock: !masterPeaks || masterPeaks.length === 0
    };
  }, [bandMode, bandPeaks, bandPeaksLoading, bandPeaksSource, masterPeaks]);
}
