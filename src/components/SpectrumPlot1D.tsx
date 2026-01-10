import { Spectrum1D } from '@/lib/mockApi';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface SpectrumPlot1DProps {
  spectra: Spectrum1D[];
  showImag?: boolean;
  baselineCorrect?: boolean;
  normalize?: boolean;
  offset?: boolean;
}

export default function SpectrumPlot1D({
  spectra,
  showImag = false,
  baselineCorrect = false,
  normalize = true,
  offset = true,
}: SpectrumPlot1DProps) {
  if (spectra.length === 0) return null;

  const phaseCorrect = (real: number[], imag: number[]) => {
    let rr = 0;
    let ii = 0;
    let ri = 0;
    for (let i = 0; i < real.length; i++) {
      const r = real[i] ?? 0;
      const im = imag[i] ?? 0;
      rr += r * r;
      ii += im * im;
      ri += r * im;
    }
    const phi = 0.5 * Math.atan2(2 * ri, rr - ii);
    const c = Math.cos(phi);
    const s = Math.sin(phi);

    const realOut: number[] = [];
    const imagOut: number[] = [];
    for (let i = 0; i < real.length; i++) {
      const r = real[i] ?? 0;
      const im = imag[i] ?? 0;
      realOut.push(r * c - im * s);
      imagOut.push(r * s + im * c);
    }
    return { realOut, imagOut };
  };

  const spectraToPlot = spectra.map(s => {
    let real = s.realData;
    let imag = s.imagData;

    if (baselineCorrect) {
      const { realOut, imagOut } = phaseCorrect(real, imag);
      real = realOut;
      imag = imagOut;
    }

    if (normalize) {
      const maxAbs = Math.max(...real.map(v => Math.abs(v)), 1);
      real = real.map(v => v / maxAbs);
      imag = imag.map(v => v / maxAbs);
    }

    return { ...s, realData: real, imagData: imag };
  });

  const precision = 6;
  const keyFor = (x: number) =>
    Number.isFinite(x) ? x.toFixed(precision) : `${x}`;

  // Build per-spectrum maps to handle different x grids
  const pointMaps = spectraToPlot.map(spectrum => {
    const map = new Map<
      string,
      { x: number; real: number; imag: number }
    >();
    spectrum.xData.forEach((x, idx) => {
      map.set(keyFor(x), {
        x,
        real: spectrum.realData[idx] ?? 0,
        imag: spectrum.imagData[idx] ?? 0,
      });
    });
    return map;
  });

  // Union of all x positions
  const allKeys = Array.from(
    new Set(pointMaps.flatMap(m => Array.from(m.keys()))),
  ).sort((a, b) => parseFloat(a) - parseFloat(b));

  const spacing = 1;
  const data = allKeys.map(key => {
    const x = parseFloat(key);
    const point: Record<string, number | undefined> = { x };
    pointMaps.forEach((map, idx) => {
      const shift = offset ? spacing * (spectraToPlot.length - idx) : 0;
      const entry = map.get(key);
      if (entry) {
        point[`real_${idx}`] = entry.real + shift;
        point[`imag_${idx}`] = entry.imag + shift;
      }
    });
    return point;
  });

  const colors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
  ];

  const xLabel = spectra.length === 1 ? spectra[0].xLabel : 'X Axis';
  const yLabel = spectra.length === 1 ? spectra[0].yLabel : offset ? 'Intensity (shifted)' : 'Intensity (a.u.)';

  return (
    <div className="w-full h-[400px] bg-card/50 rounded-lg p-4 border border-border/50">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="x"
            type="number"
            domain={['auto', 'auto']}
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            label={{
              value: xLabel,
              position: 'bottom',
              offset: 20,
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 12,
            }}
          />
          <YAxis
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            label={{
              value: yLabel,
              angle: -90,
              position: 'insideLeft',
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 12,
            }}
          />
          <Tooltip cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }} />
          <Legend
            wrapperStyle={{
              paddingTop: '20px',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '11px',
            }}
          />
          {spectraToPlot.map((spectrum, idx) => (
            <Line
              key={`${spectrum.id}-real`}
              type="monotone"
              dataKey={`real_${idx}`}
              name={`${spectrum.filename} (Real)`}
              stroke={colors[idx % colors.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              activeDot={{ r: 3, fill: colors[idx % colors.length] }}
            />
          ))}
          {showImag &&
            spectraToPlot.map((spectrum, idx) => (
              <Line
                key={`${spectrum.id}-imag`}
                type="monotone"
                dataKey={`imag_${idx}`}
                name={`${spectrum.filename} (Imag)`}
                stroke={colors[idx % colors.length]}
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={false}
                opacity={0.6}
                connectNulls
              />
            ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
