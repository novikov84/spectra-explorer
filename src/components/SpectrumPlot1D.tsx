import { Spectrum1D } from '@/api/client';
import { getSpectrumLabel } from '@/lib/spectrumUtils';
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
import { useMemo, useState, useEffect, useRef } from 'react';

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

  // --- Legend & Layout State ---
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [containerWidth, setContainerWidth] = useState<number>(800);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const colors = [
    'hsl(var(--chart-1))',
    'hsl(var(--chart-2))',
    'hsl(var(--chart-3))',
    'hsl(var(--chart-4))',
    'hsl(var(--chart-5))',
    'hsl(var(--primary))',
  ];

  // --- Dynamic Time Scaling ---
  const { timeScale, timeUnit, xLabel } = useMemo(() => {
    if (!spectra || spectra.length === 0) {
      return { timeScale: 1, timeUnit: '', xLabel: '' };
    }

    const firstLabel = spectra[0].xLabel || '';
    const isTime = firstLabel.toLowerCase().includes('time') ||
      ['T1', 'T2', 'Rabi', 'EDFS'].includes(spectra[0].type);

    if (!isTime) {
      return { timeScale: 1, timeUnit: '', xLabel: firstLabel };
    }

    // Find global max X to determine scale
    let maxX = 0;
    spectra.forEach(s => {
      const localMax = Math.max(...s.xData);
      if (localMax > maxX) maxX = localMax;
    });

    let scale = 1;
    let unit = 'ns';

    if (maxX > 2000000) { // > 2000 us -> ms
      scale = 1e-6;
      unit = 'ms';
    } else if (maxX > 2000) { // > 2000 ns -> us
      scale = 1e-3;
      unit = 'µs';
    }

    // Only change label if we detected a unit change or generic time
    let newLabel = firstLabel;

    // Remove any existing parenthesis unit if present (e.g. "Time (ns)" -> "Time")
    newLabel = newLabel.replace(/\s*\(.*?\)/, '');

    // Append the correct unit
    newLabel = `${newLabel} (${unit})`;

    return { timeScale: scale, timeUnit: unit, xLabel: newLabel };
  }, [spectra]);

  // --- Dynamic Y Scaling (User Request: max 3 digits) ---
  const { yScale, yMultiplierLabel } = useMemo(() => {
    if (!spectra || spectra.length === 0) return { yScale: 1, yMultiplierLabel: '' };

    // Find global max Y (absolute value) to determine scale
    let maxY = 0;
    spectra.forEach(s => {
      const maxR = Math.max(...s.realData.map(Math.abs));
      const maxI = showImag ? Math.max(...s.imagData.map(Math.abs)) : 0;
      maxY = Math.max(maxY, maxR, maxI);
    });

    // If we are validating against normalized data (which is 0-1), we don't scale.
    // BUT, the normalization step happens *per spectrum* below. 
    // If the user wants "normalized" view, inputs are already 0-1 range approx.
    // If "raw", they can be huge.
    // However, the logic below applies normalization *after* this scale if we aren't careful.
    // Actually, processedData below handles normalization. 
    // We should compute the "Raw Max" here.

    if (normalize) return { yScale: 1, yMultiplierLabel: '' }; // Normalized is always 0-1

    let scale = 1;
    let label = '';

    if (maxY >= 1e9) {
      scale = 1e-9;
      label = ' (x10⁹)';
    } else if (maxY >= 1e6) {
      scale = 1e-6;
      label = ' (x10⁶)';
    } else if (maxY >= 1000) {
      scale = 1e-3;
      label = ' (x10³)';
    }

    return { yScale: scale, yMultiplierLabel: label };
  }, [spectra, normalize, showImag]);

  const processedData = useMemo(() => {
    if (!spectra || spectra.length === 0) return [];

    return spectra.map((spectrum) => {
      let yReal = [...spectrum.realData];
      let yImag = [...spectrum.imagData];

      // Apply Dynamic Y Scale (only if not normalizing, handled by check above)
      if (yScale !== 1) {
        yReal = yReal.map(v => v * yScale);
        yImag = yImag.map(v => v * yScale);
      }

      // Scale X data
      let xData = spectrum.xData.map(x => x * timeScale);

      // ... rest of processing (Baseline, Norm) ...
      // Note: If Normalize is checked, yScale is 1, so this block is skipped, 
      // and then Normalization later scales to 0-1.

      // 1. Baseline Correction
      if (baselineCorrect) {
        // ... (existing baseline logic)
        const avgReal = yReal.reduce((a, b) => a + b, 0) / (yReal.length || 1);
        yReal = yReal.map((v) => v - avgReal);
        const avgImag = yImag.reduce((a, b) => a + b, 0) / (yImag.length || 1);
        yImag = yImag.map((v) => v - avgImag);
      }

      // 2. Normalization
      if (normalize) {
        const maxReal = Math.max(...yReal.map(Math.abs)) || 1;
        yReal = yReal.map((v) => v / maxReal);
        yImag = yImag.map((v) => v / maxReal);
      }

      return {
        ...spectrum,
        xData,
        processedReal: yReal,
        processedImag: yImag
      };
    });
  }, [spectra, baselineCorrect, normalize, timeScale, yScale]);

  // Update Label
  const effectiveYLabel = (spectra.length > 0 ? spectra[0].yLabel : '') + yMultiplierLabel;

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

  // Responsive Margins
  const chartMargin = useMemo(() => {
    const base = { top: 10, right: 30, left: 20, bottom: 40 };
    if (containerWidth < 600) {
      // Increase bottom margin to avoid legend overlapping axis label
      return { ...base, bottom: 100 };
    }
    return base;
  }, [containerWidth]);

  // Helper to generate legend label
  const getLegendLabel = (s: Spectrum1D) => {
    const base = getSpectrumLabel(s);
    return base;
  };

  // Dynamic Legend Postioning based on Spectrum Type & Width
  // T1 -> Bottom Right (if wide)
  // T2 -> Top Right (if wide)
  // Narrow -> Bottom Center
  const legendProps = useMemo(() => {
    // Handler for Legend Click
    const handleLegendClick = (e: any) => {
      const { dataKey } = e; // dataKey is like "real_0" or "imag_0"
      if (!dataKey) return;

      setHiddenSeries((prev) => {
        const next = new Set(prev);
        if (next.has(dataKey)) {
          next.delete(dataKey);
        } else {
          next.add(dataKey);
        }
        return next;
      });
    };

    const commonProps = {
      onClick: handleLegendClick,
      cursor: 'pointer',
      wrapperStyle: { cursor: 'pointer' }
    };

    if (!spectra || spectra.length === 0) return { ...commonProps };

    // Responsive: Move to bottom if narrow
    if (containerWidth < 600) {
      return {
        ...commonProps,
        layout: 'horizontal' as const,
        verticalAlign: 'bottom' as const,
        align: 'center' as const,
        wrapperStyle: {
          paddingTop: '40px', // Push legend down further
          cursor: 'pointer'
        }
      };
    }

    const type = spectra[0].type;

    // Common styles for overlaid legend
    const overlayStyle = {
      backgroundColor: 'hsl(var(--card) / 0.9)',
      padding: '10px',
      border: '1px solid hsl(var(--border))',
      borderRadius: '6px',
      position: 'absolute' as const,
      zIndex: 10,
      fontSize: '12px',
      cursor: 'pointer',
    };

    if (type === 'T1') {
      return {
        ...commonProps,
        layout: 'vertical' as const,
        verticalAlign: 'bottom' as const,
        align: 'right' as const,
        wrapperStyle: {
          ...overlayStyle,
          bottom: 50,
          right: 20,
          left: 'auto',
          top: 'auto'
        }
      };
    }
    if (type === 'T2' || type === 'EDFS') {
      return {
        ...commonProps,
        layout: 'vertical' as const,
        verticalAlign: 'top' as const,
        align: 'right' as const,
        wrapperStyle: {
          ...overlayStyle,
          top: 10,
          right: 20,
          left: 'auto',
          bottom: 'auto'
        }
      };
    }
    // Default
    return {
      ...commonProps,
      wrapperStyle: { paddingTop: '20px', cursor: 'pointer' }
    };
  }, [spectra, containerWidth]);

  return (
    <div
      ref={containerRef}
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
            tickFormatter={(value: number) => {
              return new Intl.NumberFormat('en-US', {
                maximumSignificantDigits: 6,
                useGrouping: false,
              }).format(value);
            }}
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
              value: effectiveYLabel,
              angle: -90,
              position: 'insideLeft',
              fill: 'hsl(var(--muted-foreground))',
              fontSize: 12,
            }}
          />
          {/* Tooltip Removed per user request */}
          <Legend {...legendProps} />

          {processedData.map((spectrum, idx) => (
            <Line
              key={`${spectrum.id}-real`}
              type="monotone"
              dataKey={`real_${idx}`}
              name={`${getLegendLabel(spectrum)}${showImag ? ' (Real)' : ''}`}
              stroke={colors[idx % colors.length]}
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
              hide={hiddenSeries.has(`real_${idx}`)}
            />
          ))}

          {showImag &&
            processedData.map((spectrum, idx) => (
              <Line
                key={`${spectrum.id}-imag`}
                type="monotone"
                dataKey={`imag_${idx}`}
                name={`${getLegendLabel(spectrum)} (Imag)`}
                stroke={colors[idx % colors.length]}
                strokeWidth={1}
                strokeDasharray="5 5"
                dot={false}
                connectNulls
                isAnimationActive={false}
                hide={hiddenSeries.has(`imag_${idx}`)}
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

