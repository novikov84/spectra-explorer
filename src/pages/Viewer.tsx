import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockApi, Spectrum1D, Spectrum2D, SpectrumType, is2DSpectrum } from '@/lib/mockApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { ArrowLeft, Loader2, LineChart, Trash2, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import SpectrumPlot1D from '@/components/SpectrumPlot1D';
import SpectrumPlot2D from '@/components/SpectrumPlot2D';
import SpectrumPlot2DSlices from '@/components/SpectrumPlot2DSlices';

const spectrumGroups: SpectrumType[] = ['CW', 'EDFS', 'T1', 'T2', 'Rabi', 'HYSCORE', '2D', 'Unknown'];

export default function Viewer() {
  const { sampleId } = useParams<{ sampleId: string }>();
  const navigate = useNavigate();
  const [spectra, setSpectra] = useState<(Spectrum1D | Spectrum2D)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [plottedSpectra, setPlottedSpectra] = useState<(Spectrum1D | Spectrum2D)[]>([]);
  const [twoDMode, setTwoDMode] = useState<'heatmap' | 'slices'>('heatmap');
  const [showImag, setShowImag] = useState(false);
  const [baselineCorrect, setBaselineCorrect] = useState(false);

  useEffect(() => {
    if (sampleId) {
      loadSpectra();
    }
  }, [sampleId]);

  const loadSpectra = async () => {
    setIsLoading(true);
    try {
      const data = await mockApi.getProcessedSpectra(sampleId!);
      setSpectra(data);
    } catch (error) {
      toast.error('Failed to load spectra');
    } finally {
      setIsLoading(false);
    }
  };

  const groupedSpectra = useMemo(() => {
    const groups: Record<SpectrumType, (Spectrum1D | Spectrum2D)[]> = {
      CW: [],
      EDFS: [],
      T1: [],
      T2: [],
      Rabi: [],
      HYSCORE: [],
      '2D': [],
      Unknown: [],
    };

    spectra.forEach((spectrum) => {
      groups[spectrum.type].push(spectrum);
    });

    return groups;
  }, [spectra]);

  const handleToggleSpectrum = (spectrumId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(spectrumId)) {
        next.delete(spectrumId);
      } else {
        next.add(spectrumId);
      }
      return next;
    });
  };

  const handlePlotSelected = () => {
    const selected = spectra.filter((s) => selectedIds.has(s.id));
    if (selected.length === 0) {
      toast.error('Please select spectra to plot');
      return;
    }
    setPlottedSpectra(selected);
    toast.success(`Plotting ${selected.length} spectrum/spectra`);
  };

  const handleClearPlot = () => {
    setPlottedSpectra([]);
    setSelectedIds(new Set());
  };

  const plotted1D = plottedSpectra.filter((s): s is Spectrum1D => !is2DSpectrum(s));
  const plotted2D = plottedSpectra.filter((s): s is Spectrum2D => is2DSpectrum(s));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/samples')}
            className="mb-2"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Samples
          </Button>
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Spectrum Viewer</h1>
            <div className="flex gap-2">
              <Button onClick={handlePlotSelected} disabled={selectedIds.size === 0}>
                <LineChart className="w-4 h-4 mr-2" />
                Plot Selected ({selectedIds.size})
              </Button>
              {plottedSpectra.length > 0 && (
                <Button variant="outline" onClick={handleClearPlot}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear Plot
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Spectrum List */}
            <div className="lg:col-span-1">
              <Card className="border-border/50 sticky top-24">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    Spectra by Type
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Accordion type="multiple" defaultValue={spectrumGroups} className="w-full">
                    {spectrumGroups.map((type) => {
                      const groupSpectra = groupedSpectra[type];
                      if (groupSpectra.length === 0) return null;

                      return (
                        <AccordionItem key={type} value={type} className="border-border/50">
                          <AccordionTrigger className="px-4 hover:no-underline hover:bg-secondary/30">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{type}</span>
                              <span className="text-xs text-muted-foreground">
                                ({groupSpectra.length})
                              </span>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="pb-0">
                            <div className="space-y-1 px-2 pb-2">
                              {groupSpectra.map((spectrum) => (
                                <div
                                  key={spectrum.id}
                                  className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${
                                    selectedIds.has(spectrum.id)
                                      ? 'bg-primary/10'
                                      : 'hover:bg-secondary/30'
                                  }`}
                                  onClick={() => handleToggleSpectrum(spectrum.id)}
                                >
                                  <Checkbox
                                    checked={selectedIds.has(spectrum.id)}
                                    onCheckedChange={() => handleToggleSpectrum(spectrum.id)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span className="font-mono text-xs truncate">
                                    {spectrum.filename}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </CardContent>
              </Card>
            </div>

            {/* Plot Area */}
            <div className="lg:col-span-2 space-y-6">
              {plottedSpectra.length === 0 ? (
                <Card className="border-border/50 border-dashed">
                  <CardContent className="py-24 text-center text-muted-foreground">
                    <LineChart className="w-16 h-16 mx-auto mb-4 opacity-30" />
                    <p className="text-lg mb-2">No spectra plotted</p>
                    <p className="text-sm">
                      Select spectra from the list and click "Plot Selected"
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* 1D Plots */}
                  {plotted1D.length > 0 && (
                    <Card className="border-border/50">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-4">
                          <CardTitle className="text-lg">1D Spectra</CardTitle>
                          <div className="flex gap-2">
                            <Button
                              variant={baselineCorrect ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setBaselineCorrect(v => !v)}
                            >
                              {baselineCorrect ? 'Baseline On' : 'Baseline Off'}
                            </Button>
                            <Button
                              variant={showImag ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setShowImag(v => !v)}
                            >
                              {showImag ? 'Hide Imag' : 'Show Imag'}
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <SpectrumPlot1D spectra={plotted1D} showImag={showImag} baselineCorrect={baselineCorrect} />
                      </CardContent>
                    </Card>
                  )}

                  {/* 2D Plots */}
                  {plotted2D.length > 0 && (
                    <Card className="border-border/50">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-4">
                          <CardTitle className="text-lg">2D Spectra</CardTitle>
                          <div className="flex gap-2">
                            <Button
                              variant={twoDMode === 'heatmap' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setTwoDMode('heatmap')}
                            >
                              Heatmap
                            </Button>
                            <Button
                              variant={twoDMode === 'slices' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => setTwoDMode('slices')}
                            >
                              1D Slices
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {twoDMode === 'heatmap'
                          ? plotted2D.map((spectrum) => (
                              <SpectrumPlot2D key={spectrum.id} spectrum={spectrum} />
                            ))
                          : plotted2D.map((spectrum) => (
                              <SpectrumPlot2DSlices key={spectrum.id} spectrum={spectrum} />
                            ))}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
