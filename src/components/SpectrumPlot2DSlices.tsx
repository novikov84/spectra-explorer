import { Spectrum2D } from '@/api/client';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ScrollArea } from '@/components/ui/scroll-area';

interface SpectrumPlot2DSlicesProps {
  spectrum: Spectrum2D;
}

export default function SpectrumPlot2DSlices({ spectrum }: SpectrumPlot2DSlicesProps) {
  const slices = spectrum.zData.map((row, idx) => {
    const yLabel = spectrum.yData?.[idx];
    const data = row.map((val, xIdx) => ({
      x: spectrum.xData[xIdx] ?? xIdx,
      value: val,
    }));

    return {
      idx,
      yLabel,
      data,
    };
  });

  return (
    <div className="bg-card/50 rounded-lg p-4 border border-border/50 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h4 className="font-mono text-sm text-foreground">{spectrum.filename}</h4>
        <div className="text-xs text-muted-foreground">
          {slices.length} slices along {spectrum.yLabel}
        </div>
      </div>

      <ScrollArea className="h-[420px] pr-4">
        <div className="space-y-6">
          {slices.map(slice => (
            <div key={`${spectrum.id}-slice-${slice.idx}`} className="space-y-2">
              <div className="text-xs text-muted-foreground font-mono">
                {spectrum.yLabel}: {slice.yLabel !== undefined ? slice.yLabel : slice.idx}
              </div>
              <div className="h-[180px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={slice.data} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                    <XAxis
                      dataKey="x"
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={10}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--popover-foreground))',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: '11px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="hsl(var(--chart-4))"
                      strokeWidth={1.5}
                      dot={false}
                      activeDot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
