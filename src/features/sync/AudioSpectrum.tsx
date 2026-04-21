import { useEffect, useRef } from 'react';
import './AudioSpectrum.css';

interface AudioSpectrumProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

export function AudioSpectrum({ analyser, isPlaying }: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Resize canvas responsively
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && canvasRef.current.parentElement) {
        canvasRef.current.width = canvasRef.current.parentElement.clientWidth;
        canvasRef.current.height = canvasRef.current.parentElement.clientHeight;
      }
    };
    
    handleResize(); // Initial size
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const bufferLength = analyser.frequencyBinCount;
    // Arrays for frequency data
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      // Pedir siempre el frame para animación suave
      animationId = requestAnimationFrame(draw);

      if (!ctx || !canvas) return;

      // Extract physical frequencies if playing
      if (isPlaying) {
        analyser.getByteFrequencyData(dataArray);
      } else {
        // Decay to 0 when paused
        for(let i=0; i < dataArray.length; i++) {
          dataArray[i] = Math.max(0, dataArray[i] - 5);
        }
      }

      // Draw Background with trails (motion blur effect)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // We only draw a slice of the bins to avoid high-freq noise on right side
      const visualBins = Math.floor(bufferLength * 0.7); 
      const barWidth = (canvas.width / visualBins) - 1;
      let x = 0;

      for (let i = 0; i < visualBins; i++) {
        // Escalar la altura relativa al canvas
        const barHeight = (dataArray[i] / 255) * canvas.height;

        // Colors (Cyberpunk / FL Studio vibe)
        const hue = i * (360 / visualBins) + 180; // Shifted roughly into cyan/purple
        ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
        ctx.shadowBlur = 15;
        ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;

        // Draw from bottom up
        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

        x += barWidth + 1;
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [analyser, isPlaying]);

  return <canvas ref={canvasRef} className="audio-spectrum-canvas" />;
}
