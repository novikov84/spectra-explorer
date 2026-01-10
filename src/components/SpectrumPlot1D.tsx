import { Spectrum1D } from '@/lib/mockApi';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { useMemo, useState, useEffect } from 'react';

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
  // --- Zoom State ---
  const [left, setLeft] = useState<number | string | null>(null);
  const [right, setRight] = useState<number | string | null>(null);
  const [refAreaLeft, setRefAreaLeft] = useState<number | string | null>(null);
  const [refAreaRight, setRefAreaRight] = useState<number | string | null>(null);
  const [top, setTop] = useState<number | string | null>(null);
  const [bottom, setBottom] = useState<number | string | null>(null);

  // domains: ['auto', 'auto'] or [min, max]
  const [xDomain, setXDomain] = useState<[number | string, number | string]>(['auto', 'auto']);
  const [yDomain, setYDomain] = useState<[number | string, number | string]>(['auto', 'auto']);

  const colors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(var(--primary))',
  ];

  const processedData = useMemo(() => {
    if (!spectra || spectra.length === 0) return [];

    return spectra.map((spectrum) => {
      let yReal = [...spectrum.realData];
      let yImag = [...spectrum.imagData];

      // 1. Baseline Correction (simple average subtraction)
      if (baselineCorrect) {
        const avgReal =
          yReal.reduce((a, b) => a + b, 0) / (yReal.length || 1);
        yReal = yReal.map((v) => v - avgReal);

        const avgImag =
          yImag.reduce((a, b) => a + b, 0) / (yImag.length || 1);
        yImag = yImag.map((v) => v - avgImag);
      }

      // 2. Normalization (max abs value)
      if (normalize) {
        const maxReal = Math.max(...yReal.map(Math.abs)) || 1;
        yReal = yReal.map((v) => v / maxReal);

        const maxImag = Math.max(...yImag.map(Math.abs)) || 1;
        yImag = yImag.map((v) => v / maxImag);
      }

      return {
        ...spectrum,
        processedReal: yReal,
        processedImag: yImag,
      };
    });
  }, [spectra, baselineCorrect, normalize]);

  // Merge datasets for plotting
  const mergedData = useMemo(() => {
    if (processedData.length === 0) return [];

    // Collect all unique X values from all spectra
    const allX = new Set<number>();
    processedData.forEach((s) => s.xData.forEach((x) => allX.add(x)));
    const sortedX = Array.from(allX).sort((a, b) => a - b);

    // Create map for fast lookup
    const dataMap = new Map<number, any>();
    sortedX.forEach((x) => dataMap.set(x, { x }));

    processedData.forEach((s, sIdx) => {
      const offsetVal = offset ? sIdx * (normalize ? 0.5 : Math.max(...s.realData) * 0.5) : 0;
      s.xData.forEach((x, i) => {
        const pt = dataMap.get(x);
        pt[`real_${sIdx}`] = s.processedReal[i] + offsetVal;
        if (showImag) {
          pt[`imag_${sIdx}`] = s.processedImag[i] + offsetVal;
        }
      });
    });

    return Array.from(dataMap.values());
  }, [processedData, offset, showImag, normalize]);

  if (spectra.length === 0) {
    return (
      <Card className="h-[400px] flex items-center justify-center text-muted-foreground">
        No Data
      </Card>
    );
  }

  const xLabel = spectra[0].xLabel;
  const yLabel = spectra[0].yLabel;

  // Zoom Handlers
  const zoom = () => {
    if (refAreaLeft === refAreaRight || refAreaRight === null) {
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    // Ensure logic: left < right
    let lower = refAreaLeft as number;
    let upper = refAreaRight as number;

    // Check if dragging backwards (Right -> Left)
    if (lower > upper) {
      // RESET ZOOM
      setXDomain(['auto', 'auto']);
      setYDomain(['auto', 'auto']);
      setRefAreaLeft(null);
      setRefAreaRight(null);
      return;
    }

    // Set new domain
    setXDomain([lower, upper]);
    setRefAreaLeft(null);
    setRefAreaRight(null);
  };

  // Handle global mouse up to catch drags ending outside chart
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (refAreaLeft !== null) {
        zoom();
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [refAreaLeft, refAreaRight]); // Dependencies ensure zoom sees current state

  const chartMargin = { top: 10, right: 30, left: 20, bottom: 40 };

  return (
    <div
      className="w-full h-[400px] select-none"
      onMouseDown={(e) => {
        // Robust margin click handling using container coordinates
        // Recharts events can be inconsistent in margins, so we use the wrapper.
        // Data usually starts after margin.left (20) + YAxis width (~60) = ~80px.
        const marginThreshold = 90;
        const x = e.nativeEvent.offsetX;

        if (x < marginThreshold && mergedData.length > 0) {
          const visibleMin = xDomain[0] === 'auto' ? mergedData[0].x : Number(xDomain[0]);
          setRefAreaLeft(visibleMin);
          setRefAreaRight(visibleMin); // Initialize right to match left so selection exists immediately
        }
      }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={mergedData}
          margin={chartMargin}
          onMouseDown={(e) => {
            if (e && e.activeLabel !== undefined && e.activeLabel !== null) {
              setRefAreaLeft(e.activeLabel);
            }
          }}
          onMouseMove={(e) => {
            if (refAreaLeft !== null && e) {
              if (e.activeLabel !== undefined && e.activeLabel !== null) {
                setRefAreaRight(e.activeLabel);
              }
            }
          }}
          onMouseUp={zoom}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
          <XAxis
            dataKey="x"
            type="number"
            domain={xDomain}
            allowDataOverflow
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
            width={60}
            label={{
              value: yLabel,
              angle: -90,
              position: 'insideLeft',
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 12,
            }}
          />
          {/* Tooltip Removed per user request */}
          <Legend
            wrapperStyle={{
              paddingTop: '20px',
            }}
          />

          {processedData.map((spectrum, idx) => (
            <Line
              key={`${spectrum.id}-real`}
              type="step"
              dataKey={`real_${idx}`}
              name={`${spectrum.filename} (Real)`}
              stroke={colors[idx % colors.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          ))}

          {showImag &&
            processedData.map((spectrum, idx) => (
              <Line
                key={`${spectrum.id}-imag`}
                type="step"
                dataKey={`imag_${idx}`}
                name={`${spectrum.filename} (Imag)`}
                stroke={colors[idx % colors.length]}
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}

          {refAreaLeft !== null && refAreaRight !== null ? (
            <ReferenceArea
              x1={refAreaLeft}
              x2={refAreaRight}
              strokeOpacity={0.3}
              fill="hsl(var(--primary))"
              fillOpacity={0.1}
            />
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

