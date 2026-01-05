import { useMemo, useState, useEffect, useRef } from 'react';
import { Spectrum1D } from '@/lib/mockApi';
// Shared helper from tests/unit/reportState.cjs
function computeMasterState(children: boolean[]) {
  const allOn = children.length > 0 && children.every(Boolean);
  const allOff = children.length > 0 && children.every(v => !v);
  return {
    masterChecked: allOn,
    masterIndeterminate: !allOn && !allOff,
  };
}
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceArea,
  ComposedChart,
} from 'recharts';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface SpectrumPlotRabiCombinedProps {
  spectra: Spectrum1D[];
}

type RabiAnalysis = {
  label: string;
  dbValue?: number;
  timeNs: number[];
  signalShifted: number[];
  freqMHz: number[];
  magnitudeShifted: number[];
  rabiFreqMHz?: number;
  nutationFreqMHz?: number;
};

const shiftAmount = 1;

const parseDb = (s: Spectrum1D): number | undefined => {
  if (s.parsedParams?.amplifierDb !== undefined) return s.parsedParams.amplifierDb;
  const match = s.filename.match(/HPA(\d+(?:\.\d+)?)dB/i);
  if (match) return Number(match[1]);
  return undefined;
};

type AnalysisOptions = {
  maskRange?: { low?: number; high?: number };
  useHamming: boolean;
  hammingAlpha: number;
};

const analyze = (
  spectrum: Spectrum1D,
  { maskRange, useHamming, hammingAlpha }: AnalysisOptions,
): RabiAnalysis | null => {
  const db = parseDb(spectrum);
  const label = db !== undefined ? `${db.toFixed(1)} dB` : spectrum.filename;

  const x = spectrum.xData;
  const y = spectrum.realData;
  if (x.length !== y.length || x.length < 4) return null;

  // Normalize and baseline-correct
  const maxAbs = Math.max(...y.map(v => Math.abs(v)), 1);
  let signal = y.map(v => v / maxAbs);

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = signal.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * signal[i], 0);
  const sumXX = x.reduce((a, b) => a + b * b, 0);
  const denom = n * sumXX - sumX * sumX || 1;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  signal = signal.map((v, i) => v - (slope * x[i] + intercept));

  // Zero-pad: 2^(ceil(log2(N)) + 1) for a modest amount of zero filling
  const target = 2 ** (Math.ceil(Math.log2(signal.length)) + 1);
  const padded = [...signal, ...Array(target - signal.length).fill(0)];

  const dtNs = x[1] - x[0];
  if (!Number.isFinite(dtNs) || dtNs <= 0) return null;
  const Fs = 1e9 / dtNs; // Hz
  const freqMHz = Array.from({ length: target / 2 + 1 }, (_, i) => (Fs * i) / target / 1e6);

  // Window
  const alphaExp = 0.0001;
  const window =
    useHamming && hammingAlpha >= 0 && hammingAlpha <= 1
      ? Array.from({ length: target }, (_, i) => hammingAlpha + (1 - hammingAlpha) * Math.cos(Math.PI * i / (target - 1 || 1)))
      : Array.from({ length: target }, (_, i) => Math.exp(-alphaExp * i));
  const windowed = padded.map((v, i) => v * window[i]);

  // Naive FFT (target is small)
  const magnitude: number[] = [];
  for (let k = 0; k <= target / 2; k++) {
    let r = 0;
    let im = 0;
    for (let nIdx = 0; nIdx < target; nIdx++) {
      const angle = (-2 * Math.PI * k * nIdx) / target;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const v = windowed[nIdx];
      r += v * c;
      im += v * s;
    }
    magnitude.push(Math.sqrt(r * r + im * im));
  }

  // Normalize magnitude for plotting
  const maxMag = Math.max(...magnitude, 1);
  const magnitudeNorm = magnitude.map(v => v / maxMag);

  // Peak detection (exclude DC-ish)
  const peakCandidates = magnitudeNorm
    .map((v, idx) => ({ v, f: freqMHz[idx] }))
    .filter(p => p.f > 0.5)
    .sort((a, b) => b.v - a.v);

  // Apply mask for peak search only
  const maskedCandidates = peakCandidates.filter(p => {
    if (maskRange?.low !== undefined && maskRange?.high !== undefined && maskRange.low < maskRange.high) {
      return p.f < maskRange.low || p.f > maskRange.high;
    }
    return true;
  });

  let rabiFreqMHz: number | undefined;
  if (maskedCandidates.length) {
    rabiFreqMHz = maskedCandidates[0].f;
    if (rabiFreqMHz >= 14 && rabiFreqMHz <= 15 && maskedCandidates[1]) {
      rabiFreqMHz = maskedCandidates[1].f;
    }
  }

  const nutationFreqMHz = db !== undefined ? 44 * Math.pow(2, -db / 6) : undefined;

  return {
    label,
    dbValue: db,
    timeNs: x,
    signalShifted: signal, // shift applied later
    freqMHz,
    magnitudeShifted: magnitudeNorm, // shift applied later
    rabiFreqMHz,
    nutationFreqMHz,
  };
};

const toMergedDataset = (
  series: { x: number[]; y: number[]; key: string }[],
  offset = 0,
) => {
  const precision = 6;
  const keyFor = (x: number) => (Number.isFinite(x) ? x.toFixed(precision) : `${x}`);
  const maps = series.map(s => {
    const m = new Map<string, { x: number; y: number }>();
    s.x.forEach((val, i) => m.set(keyFor(val), { x: val, y: s.y[i] }));
    return { key: s.key, map: m };
  });
  const allKeys = Array.from(new Set(maps.flatMap(m => Array.from(m.map.keys())))).sort(
    (a, b) => parseFloat(a) - parseFloat(b),
  );
  return allKeys.map(k => {
    const x = parseFloat(k);
    const point: Record<string, number | undefined> = { x };
    maps.forEach(m => {
      const entry = m.map.get(k);
      if (entry) {
        point[m.key] = entry.y + offset;
      }
    });
    return point;
  });
};

export default function SpectrumPlotRabiCombined({ spectra }: SpectrumPlotRabiCombinedProps) {
  const [maskLow, setMaskLow] = useState<string>('');
  const [maskHigh, setMaskHigh] = useState<string>('');
  const [refAreaLeft, setRefAreaLeft] = useState<number | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | null>(null);
  const [useHamming, setUseHamming] = useState(true);
  const [hammingAlpha, setHammingAlpha] = useState(0.54);
  const [showFit, setShowFit] = useState(true);
  const [reportTime, setReportTime] = useState(false);
  const [reportFft, setReportFft] = useState(false);
  const [reportScatter, setReportScatter] = useState(false);
  const masterRef = useRef<HTMLInputElement | null>(null);

  const maskRange = useMemo(() => {
    const low = maskLow === '' ? undefined : Number(maskLow);
    const high = maskHigh === '' ? undefined : Number(maskHigh);
    return { low: Number.isFinite(low) ? low : undefined, high: Number.isFinite(high) ? high : undefined };
  }, [maskLow, maskHigh]);

  const commitSelectionToMask = () => {
    if (refAreaLeft === null || refAreaRight === null) return;
    const [low, high] = [refAreaLeft, refAreaRight].sort((a, b) => a - b);
    setMaskLow(low.toFixed(1));
    setMaskHigh(high.toFixed(1));
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  const toggleAllReports = (checked: boolean) => {
    setReportTime(checked);
    setReportFft(checked);
    setReportScatter(checked);
  };

  const { masterChecked, masterIndeterminate } = computeMasterState([
    reportTime,
    reportFft,
    reportScatter,
  ]);

  useEffect(() => {
    if (masterRef.current) {
      masterRef.current.indeterminate = masterIndeterminate;
    }
  }, [masterIndeterminate]);

  const analyses = useMemo(() => {
    const processed = spectra
      .map(s =>
        analyze(s, {
          maskRange,
          useHamming,
          hammingAlpha,
        }),
      )
      .filter((v): v is RabiAnalysis => v !== null)
      .sort((a, b) => {
        const ad = Number.isFinite(a.dbValue) ? (a.dbValue as number) : Infinity;
        const bd = Number.isFinite(b.dbValue) ? (b.dbValue as number) : Infinity;
        if (ad !== bd) return ad - bd; // ascending power
        return a.label.localeCompare(b.label);
      });

    return processed;
  }, [spectra, maskRange, useHamming, hammingAlpha]);

  if (analyses.length === 0) return null;

  const timeSeries = analyses.map((a, idx) => ({
    x: a.timeNs,
    y: a.signalShifted.map(v => v + shiftAmount * (analyses.length - idx)),
    key: `rabi_${idx}`,
  }));

  const freqSeries = analyses.map((a, idx) => ({
    x: a.freqMHz,
    y: a.magnitudeShifted.map(v => v + shiftAmount * (analyses.length - idx)),
    key: `fft_${idx}`,
  }));

  const timeData = toMergedDataset(timeSeries);
  const freqData = toMergedDataset(freqSeries);

  const colors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(var(--chart-6, var(--chart-1)))',
    'hsl(var(--chart-7, var(--chart-2)))',
  ];

  // Scatter data and regression
  const points = analyses
    .map(a =>
      a.nutationFreqMHz !== undefined && a.rabiFreqMHz !== undefined
        ? { x: a.nutationFreqMHz, y: a.rabiFreqMHz, label: a.label }
        : null,
    )
    .filter((p): p is { x: number; y: number; label: string } => p !== null);

  let fitLine: { x: number; y: number }[] = [];
  if (points.length >= 2) {
    const n = points.length;
    const sumX = points.reduce((acc, p) => acc + p.x, 0);
    const sumY = points.reduce((acc, p) => acc + p.y, 0);
    const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0);
    const sumXX = points.reduce((acc, p) => acc + p.x * p.x, 0);
    const denom = n * sumXX - sumX * sumX || 1;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    const xs = [
      Math.min(...points.map(p => p.x)),
      Math.max(...points.map(p => p.x)),
    ];
    fitLine = xs.map(x => ({ x, y: slope * x + intercept }));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="flex items-center justify-end gap-2 lg:col-span-2 pr-2">
        <label
          className="flex items-center gap-2 text-sm text-muted-foreground px-2 py-1 rounded-md border border-border/60 bg-card/80 shadow-sm cursor-pointer select-none z-10"
          style={{ pointerEvents: 'auto' }}
          onClick={() => toggleAllReports(!(masterIndeterminate || masterChecked))}
        >
          <input
            ref={masterRef}
            type="checkbox"
            checked={masterChecked}
            aria-checked={masterIndeterminate ? 'mixed' : masterChecked}
            className="h-4 w-4"
            onChange={e => toggleAllReports(e.target.checked)}
          />
          Report
        </label>
      </div>
      {/* Top-left: Rabi oscillations */}
      <div className="w-full h-[320px] bg-card/50 rounded-lg p-4 border border-border/50 relative">
        <label
          className="absolute top-2 right-2 flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded-md border border-border/60 bg-card/80 shadow-sm cursor-pointer select-none z-10"
          style={{ pointerEvents: 'auto' }}
        >
          <input
            type="checkbox"
            checked={reportTime}
            className="h-4 w-4"
            onChange={e => setReportTime(e.target.checked)}
          />
          Report
        </label>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeData} margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis
              dataKey="x"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              label={{
                value: 'Time (ns)',
                position: 'bottom',
                offset: 15,
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
              }}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              label={{
                value: 'Signal (normalized, shifted)',
                angle: -90,
                position: 'insideLeft',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
              }}
            />
            <Tooltip cursor={false} content={() => null} />
            {analyses.map((a, idx) => (
              <Line
                key={`rabi-${idx}`}
                type="monotone"
                dataKey={`rabi_${idx}`}
                name={a.label}
                stroke={colors[idx % colors.length]}
                strokeWidth={1.4}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Top-right: Control panel + legend */}
      <div className="w-full h-[320px] bg-card/50 rounded-lg p-4 border border-border/50 flex flex-col justify-between">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-muted-foreground">Mask:</span>
            <Input
              type="number"
              placeholder="low"
              value={maskLow}
              onChange={e => setMaskLow(e.target.value)}
              step={0.1}
              min={0}
              max={100}
              inputMode="decimal"
              pattern="\\d+(\\.\\d)?"
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">to</span>
            <Input
              type="number"
              placeholder="high"
              value={maskHigh}
              onChange={e => setMaskHigh(e.target.value)}
              step={0.1}
              min={0}
              max={100}
              inputMode="decimal"
              pattern="\\d+(\\.\\d)?"
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">MHz</span>
            {maskLow !== '' || maskHigh !== '' ? (
              <Button variant="ghost" size="sm" onClick={() => { setMaskLow(''); setMaskHigh(''); }}>
                clear
              </Button>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant={useHamming ? 'default' : 'outline'}
                size="sm"
                onClick={() => setUseHamming(v => !v)}
              >
                {useHamming ? 'Hamming On' : 'Hamming Off'}
              </Button>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={hammingAlpha}
                  onChange={e => setHammingAlpha(Number(e.target.value))}
                  className="w-20"
                />
                <span className="text-xs text-muted-foreground">α</span>
              </div>
            </div>
          </div>

          <div>
            <Button
              variant={showFit ? 'default' : 'outline'}
              size="sm"
              onClick={() => setShowFit(v => !v)}
            >
              {showFit ? 'Hide fit' : 'Show fit'}
            </Button>
          </div>
        </div>
        <div className="flex-1" />
      </div>

      {/* Bottom-left: FFTs */}
      <div className="w-full h-[320px] bg-card/50 rounded-lg p-4 border border-border/50 relative">
        <label
          className="absolute top-2 right-2 flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded-md border border-border/60 bg-card/80 shadow-sm cursor-pointer select-none z-10"
          style={{ pointerEvents: 'auto' }}
        >
          <input
            type="checkbox"
            checked={reportFft}
            className="h-4 w-4"
            onChange={e => setReportFft(e.target.checked)}
          />
          Report
        </label>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={freqData}
            margin={{ top: 10, right: 20, left: 10, bottom: 30 }}
            onMouseDown={state => {
              if (state && state.activeLabel !== undefined) {
                setRefAreaLeft(state.activeLabel as number);
                setRefAreaRight(state.activeLabel as number);
              }
            }}
            onMouseMove={state => {
              if (refAreaLeft !== null && state && state.activeLabel !== undefined) {
                setRefAreaRight(state.activeLabel as number);
              }
            }}
            onMouseUp={commitSelectionToMask}
            onMouseLeave={() => {
              setRefAreaLeft(null);
              setRefAreaRight(null);
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            {maskRange.low !== undefined &&
              maskRange.high !== undefined &&
              maskRange.low < maskRange.high && (
                <ReferenceArea
                  x1={maskRange.low}
                  x2={maskRange.high}
                  fill="hsl(var(--destructive))"
                  fillOpacity={0.1}
                  stroke="hsl(var(--destructive))"
                  strokeOpacity={0.2}
                />
              )}
            {refAreaLeft !== null && refAreaRight !== null && (
              <ReferenceArea
                x1={refAreaLeft}
                x2={refAreaRight}
                fill="hsl(var(--chart-4))"
                fillOpacity={0.1}
                stroke="hsl(var(--chart-4))"
                strokeOpacity={0.3}
              />
            )}
            <XAxis
              type="number"
              dataKey="x"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              domain={[0, 40]}
              allowDataOverflow={true}
              ticks={[0, 10, 20, 30, 40]}
              scale="linear"
              label={{
                value: 'Frequency (MHz)',
                position: 'bottom',
                offset: 15,
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
              }}
            />
            <YAxis
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              label={{
                value: 'Magnitude (norm, shifted)',
                angle: -90,
                position: 'insideLeft',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
              }}
            />
            <Tooltip cursor={false} content={() => null} />
            {analyses.map((a, idx) => (
              <Line
                key={`fft-${idx}`}
                type="monotone"
                dataKey={`fft_${idx}`}
                name={a.label}
                stroke={colors[idx % colors.length]}
                strokeWidth={1.4}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom-right: Rabi vs Nutation */}
      <div className="w-full h-[320px] bg-card/50 rounded-lg p-4 border border-border/50 relative">
        <label
          className="absolute top-2 right-2 flex items-center gap-1 text-xs text-muted-foreground px-2 py-1 rounded-md border border-border/60 bg-card/80 shadow-sm cursor-pointer select-none z-10"
          style={{ pointerEvents: 'auto' }}
        >
          <input
            type="checkbox"
            checked={reportScatter}
            className="h-4 w-4"
            onChange={e => setReportScatter(e.target.checked)}
          />
          Report
        </label>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart margin={{ top: 10, right: 20, left: 10, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
            <XAxis
              type="number"
              dataKey="x"
              name="Nutation"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              label={{
                value: 'Nutation Frequency (MHz)',
                position: 'bottom',
                offset: 15,
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
              }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name="Rabi"
              stroke="hsl(var(--muted-foreground))"
              fontSize={11}
              tickLine={false}
              label={{
                value: 'Rabi Frequency (MHz)',
                angle: -90,
                position: 'insideLeft',
                fill: 'hsl(var(--muted-foreground))',
                fontSize: 12,
              }}
            />
            <ZAxis type="category" dataKey="label" name="label" />
            <Tooltip cursor={false} content={() => null} />
            <Scatter name="Rabi vs Nutation" data={points} fill="hsl(var(--chart-3))" />
            {showFit && fitLine.length === 2 && (
              <Line
                type="linear"
                dataKey="y"
                data={fitLine}
                name="Fit"
                stroke="hsl(var(--chart-5))"
                strokeDasharray="4 4"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
