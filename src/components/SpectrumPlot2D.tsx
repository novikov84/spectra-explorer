import { useMemo } from 'react';
import { Spectrum2D } from '@/lib/mockApi';

interface SpectrumPlot2DProps {
  spectrum: Spectrum2D;
}

export default function SpectrumPlot2D({ spectrum }: SpectrumPlot2DProps) {
  const { canvasWidth, canvasHeight, colorScale } = useMemo(() => {
    const width = 500;
    const height = 400;

    // Find min/max for color scaling
    let min = Infinity;
    let max = -Infinity;
    for (const row of spectrum.zData) {
      for (const val of row) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    return {
      canvasWidth: width,
      canvasHeight: height,
      colorScale: { min, max },
    };
  }, [spectrum]);

  const getColor = (value: number): string => {
    const normalized = (value - colorScale.min) / (colorScale.max - colorScale.min);

    // Viridis-like colormap
    if (normalized < 0.25) {
      const t = normalized * 4;
      return `rgb(${Math.round(68 + t * 30)}, ${Math.round(1 + t * 50)}, ${Math.round(84 + t * 30)})`;
    } else if (normalized < 0.5) {
      const t = (normalized - 0.25) * 4;
      return `rgb(${Math.round(98 - t * 30)}, ${Math.round(51 + t * 60)}, ${Math.round(114 - t * 30)})`;
    } else if (normalized < 0.75) {
      const t = (normalized - 0.5) * 4;
      return `rgb(${Math.round(68 + t * 120)}, ${Math.round(111 + t * 50)}, ${Math.round(84 - t * 50)})`;
    } else {
      const t = (normalized - 0.75) * 4;
      return `rgb(${Math.round(188 + t * 60)}, ${Math.round(161 + t * 60)}, ${Math.round(34 + t * 20)})`;
    }
  };

  const renderCanvas = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const xPoints = spectrum.zData[0].length;
    const yPoints = spectrum.zData.length;
    const cellWidth = canvasWidth / xPoints;
    const cellHeight = canvasHeight / yPoints;

    for (let j = 0; j < yPoints; j++) {
      for (let i = 0; i < xPoints; i++) {
        const value = spectrum.zData[yPoints - 1 - j][i]; // Flip Y axis
        ctx.fillStyle = getColor(value);
        ctx.fillRect(i * cellWidth, j * cellHeight, cellWidth + 1, cellHeight + 1);
      }
    }
  };

  return (
    <div className="bg-card/50 rounded-lg p-4 border border-border/50">
      <h4 className="font-mono text-sm mb-4 text-foreground">{spectrum.filename}</h4>

      <div className="relative">
        {/* Y-axis label */}
        <div className="absolute -left-8 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-muted-foreground font-mono whitespace-nowrap">
          {spectrum.yLabel}
        </div>

        {/* Canvas container */}
        <div className="ml-8">
          <canvas
            ref={renderCanvas}
            width={canvasWidth}
            height={canvasHeight}
            className="rounded border border-border/30"
          />

          {/* X-axis label */}
          <div className="text-center mt-2 text-xs text-muted-foreground font-mono">
            {spectrum.xLabel}
          </div>
        </div>

        {/* Color bar */}
        <div className="absolute -right-16 top-0 h-full w-4 flex flex-col">
          <div
            className="flex-1 rounded border border-border/30"
            style={{
              background: `linear-gradient(to bottom, 
                rgb(248, 221, 54), 
                rgb(188, 161, 34), 
                rgb(68, 111, 84), 
                rgb(68, 51, 114), 
                rgb(68, 1, 84)
              )`,
            }}
          />
          <div className="flex justify-between flex-col h-full absolute -right-10 top-0 text-[10px] text-muted-foreground font-mono">
            <span>{colorScale.max.toFixed(2)}</span>
            <span>{colorScale.min.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
