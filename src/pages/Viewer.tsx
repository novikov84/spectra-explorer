import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockApi, Spectrum1D, Spectrum2D, SpectrumType, is2DSpectrum } from '@/lib/mockApi';
import { api } from '@/api/client';
import { isBackendAvailable } from '@/api/backendStatus';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ArrowLeft, Loader2, LineChart, Trash2, BarChart3, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import SpectrumPlot1D from '@/components/SpectrumPlot1D';
import SpectrumPlot2D from '@/components/SpectrumPlot2D';
import SpectrumPlot2DSlices from '@/components/SpectrumPlot2DSlices';
import SpectrumPlotRabiCombined from '@/components/SpectrumPlotRabiCombined';
import { getSpectrumLabel, sortSpectra } from '@/lib/spectrumUtils';

// DnD Imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SortablePlotPanel } from '@/components/SortablePlotPanel';


const spectrumGroups: SpectrumType[] = ['CW', 'EDFS', 'T1', 'T2', 'Rabi', 'HYSCORE', '2D', 'Unknown'];

interface ViewOptions {
  normalize: boolean;
  offset: boolean;
  baseline: boolean;
  showImag: boolean;
}

interface PlotGroup {
  id: string;
  type: SpectrumType;
  spectra: (Spectrum1D | Spectrum2D)[];
  viewOptions: ViewOptions;
  twoDMode?: 'heatmap' | 'slices'; // Only for 2D
  isCollapsed?: boolean;
}

export default function Viewer() {
  const { sampleId } = useParams<{ sampleId: string }>();
  const navigate = useNavigate();
  const [spectra, setSpectra] = useState<(Spectrum1D | Spectrum2D)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Replaced single plottedSpectra with list of PlotGroups
  const [plotGroups, setPlotGroups] = useState<PlotGroup[]>([]);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (sampleId) {
      loadSpectra();
    }
  }, [sampleId]);

  const loadSpectra = async () => {
    setIsLoading(true);
    try {
      let data: (Spectrum1D | Spectrum2D)[] | undefined;
      const backendUp = await isBackendAvailable();
      if (backendUp) {
        try {
          data = await api.listSpectra(sampleId!);
        } catch (err) {
          data = undefined;
        }
      }
      if (!data) {
        data = await mockApi.getProcessedSpectra(sampleId!);
      }
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

    // Sort each group
    Object.keys(groups).forEach(key => {
      groups[key as SpectrumType].sort(sortSpectra);
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

  const getDefaultsForType = (type: string): ViewOptions => {
    // EDFS defaults: Normalized + Shifted
    if (type === 'EDFS') {
      return {
        normalize: true,
        offset: true,
        baseline: false,
        showImag: false,
      };
    }
    // T1/T2 defaults: Raw + Overlaid (offset=false)
    if (type === 'T1' || type === 'T2') {
      return {
        normalize: false,
        offset: false,
        baseline: false,
        showImag: false,
      };
    }
    // General Default (CW, etc.)
    return {
      normalize: true,
      offset: true,
      baseline: false,
      showImag: false,
    };
  };

  const handleCreatePlotGroup = (type: SpectrumType) => {
    // Filter selected IDs that match this type
    const selectedInGroup = groupedSpectra[type].filter(s => selectedIds.has(s.id));

    if (selectedInGroup.length === 0) {
      toast.error(`Please select at least one ${type} spectrum`);
      return;
    }

    const newGroup: PlotGroup = {
      id: crypto.randomUUID(),
      type: type,
      spectra: selectedInGroup,
      viewOptions: getDefaultsForType(type),
      twoDMode: 'heatmap',
      isCollapsed: false,
    };

    setPlotGroups(prev => [...prev, newGroup]);
    toast.success(`Created new ${type} plot panel with ${selectedInGroup.length} spectra`);
  };

  const handleRemoveGroup = (groupId: string) => {
    setPlotGroups(prev => prev.filter(g => g.id !== groupId));
  };

  const toggleGroupCollapse = (groupId: string) => {
    setPlotGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, isCollapsed: !g.isCollapsed };
    }));
  };

  const updateGroupOption = (groupId: string, key: keyof ViewOptions) => {
    setPlotGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return {
        ...g,
        viewOptions: {
          ...g.viewOptions,
          [key]: !g.viewOptions[key]
        }
      };
    }));
  };

  const updateGroup2DMode = (groupId: string, mode: 'heatmap' | 'slices') => {
    setPlotGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g;
      return { ...g, twoDMode: mode };
    }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPlotGroups((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleToggleGroup = (type: SpectrumType, select: boolean) => {
    const ids = groupedSpectra[type].map(s => s.id);
    setSelectedIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => {
        if (select) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

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
              {/*
                We removed the global "Plot Selected" button in favor of per-type plotting.
                Maybe keeping a "Clear All" is useful.
               */}
              {plotGroups.length > 0 && (
                <Button variant="outline" onClick={() => setPlotGroups([])}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All Plots
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

                      // Count selected in this group
                      const selectedInType = groupSpectra.filter(s => selectedIds.has(s.id)).length;

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
                            {/* Action Bar for Type */}
                            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-secondary/10">
                              <div className="text-xs text-muted-foreground">
                                {selectedInType} selected
                              </div>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs"
                                disabled={selectedInType === 0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCreatePlotGroup(type);
                                }}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                Plot
                              </Button>
                            </div>

                            <div className="flex justify-end gap-2 px-4 py-2 text-xs">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleGroup(type, true);
                                }}
                              >
                                Select all
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleGroup(type, false);
                                }}
                              >
                                Clear
                              </Button>
                            </div>
                            <div className="space-y-1 px-2 pb-2">
                              {groupSpectra.map((spectrum) => (
                                <TooltipProvider key={spectrum.id}>
                                  <Tooltip delayDuration={300}>
                                    <TooltipTrigger asChild>
                                      <div
                                        className={`flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors ${selectedIds.has(spectrum.id)
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
                                          {getSpectrumLabel(spectrum)}
                                        </span>
                                      </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="right">
                                      <p>{spectrum.filename}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
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
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={plotGroups.map(g => g.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {plotGroups.length === 0 ? (
                    <Card className="border-border/50 border-dashed">
                      <CardContent className="py-24 text-center text-muted-foreground">
                        <LineChart className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p className="text-lg mb-2">No active plots</p>
                        <p className="text-sm">
                          Select spectra on the left and click "Plot" to add a panel.
                        </p>
                      </CardContent>
                    </Card>
                  ) : (
                    plotGroups.map(group => {
                      const { id, type, spectra: groupSpectra, viewOptions, twoDMode, isCollapsed } = group;

                      // Determine component based on type
                      const isRabi = type === 'Rabi';
                      const is2D = type === '2D' || is2DSpectrum(groupSpectra[0]);

                      return (
                        <SortablePlotPanel key={id} id={id}>
                          <Card className="border-border/50 relative group">
                            <CardHeader className="py-3">
                              <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => toggleGroupCollapse(id)}
                                  >
                                    {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                                  </Button>
                                  <CardTitle className="text-base flex items-center gap-2">
                                    {type} Analysis
                                    {isRabi && <span className="text-xs font-normal text-muted-foreground">(Combined)</span>}
                                    {isCollapsed && <span className="text-xs font-normal text-muted-foreground ml-2">({groupSpectra.length} spectra)</span>}
                                  </CardTitle>
                                </div>

                                <div className="flex gap-2 items-center flex-wrap">
                                  {!isCollapsed && (
                                    <>
                                      {/* Controls for standard 1D */}
                                      {!isRabi && !is2D && (
                                        <>
                                          <Button
                                            variant={viewOptions.normalize ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => updateGroupOption(id, 'normalize')}
                                          >
                                            {viewOptions.normalize ? 'Norm' : 'Raw'}
                                          </Button>
                                          <Button
                                            variant={viewOptions.offset ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => updateGroupOption(id, 'offset')}
                                          >
                                            {viewOptions.offset ? 'Shift' : 'Overlay'}
                                          </Button>
                                          <Button
                                            variant={viewOptions.baseline ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => updateGroupOption(id, 'baseline')}
                                          >
                                            Base
                                          </Button>
                                          <Button
                                            variant={viewOptions.showImag ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => updateGroupOption(id, 'showImag')}
                                          >
                                            Imag
                                          </Button>
                                        </>
                                      )}

                                      {/* Controls for 2D */}
                                      {is2D && (
                                        <>
                                          <Button
                                            variant={twoDMode === 'heatmap' ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => updateGroup2DMode(id, 'heatmap')}
                                          >
                                            Map
                                          </Button>
                                          <Button
                                            variant={twoDMode === 'slices' ? 'default' : 'outline'}
                                            size="sm"
                                            className="h-7 text-xs"
                                            onClick={() => updateGroup2DMode(id, 'slices')}
                                          >
                                            Slice
                                          </Button>
                                        </>
                                      )}
                                    </>
                                  )}

                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => handleRemoveGroup(id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardHeader>
                            {!isCollapsed && (
                              <CardContent>
                                {isRabi ? (
                                  <SpectrumPlotRabiCombined spectra={groupSpectra as Spectrum1D[]} />
                                ) : is2D ? (
                                  twoDMode === 'heatmap' ? (
                                    groupSpectra.map(s => <SpectrumPlot2D key={s.id} spectrum={s as Spectrum2D} />)
                                  ) : (
                                    groupSpectra.map(s => <SpectrumPlot2DSlices key={s.id} spectrum={s as Spectrum2D} />)
                                  )
                                ) : (
                                  <SpectrumPlot1D
                                    spectra={groupSpectra as Spectrum1D[]}
                                    showImag={viewOptions.showImag}
                                    baselineCorrect={viewOptions.baseline}
                                    normalize={viewOptions.normalize}
                                    offset={viewOptions.offset}
                                  />
                                )}
                              </CardContent>
                            )}
                          </Card>
                        </SortablePlotPanel>
                      );
                    })
                  )}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        )
        }
      </main >
    </div >
  );
}
