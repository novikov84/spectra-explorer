import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { mockApi, SpectrumFile, SpectrumType } from '@/lib/mockApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, CheckSquare, Square, Cog, FileText } from 'lucide-react';
import { toast } from 'sonner';

const typeColors: Record<SpectrumType, string> = {
  CW: 'bg-chart-1/20 text-chart-1 border-chart-1/30',
  EDFS: 'bg-chart-2/20 text-chart-2 border-chart-2/30',
  T1: 'bg-chart-3/20 text-chart-3 border-chart-3/30',
  T2: 'bg-chart-4/20 text-chart-4 border-chart-4/30',
  Rabi: 'bg-chart-5/20 text-chart-5 border-chart-5/30',
  HYSCORE: 'bg-primary/20 text-primary border-primary/30',
  '2D': 'bg-accent-foreground/20 text-accent-foreground border-accent-foreground/30',
  Unknown: 'bg-muted-foreground/20 text-muted-foreground border-muted-foreground/30',
};

export default function ArchiveContents() {
  const { sampleId } = useParams<{ sampleId: string }>();
  const navigate = useNavigate();
  const [files, setFiles] = useState<SpectrumFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (sampleId) {
      loadFiles();
    }
  }, [sampleId]);

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const data = await mockApi.getArchiveFiles(sampleId!);
      setFiles(data);
    } catch (error) {
      toast.error('Failed to load archive contents');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleFile = (fileId: string) => {
    setFiles(prev =>
      prev.map(f =>
        f.id === fileId ? { ...f, selected: !f.selected } : f
      )
    );
  };

  const handleSelectAll = () => {
    setFiles(prev => prev.map(f => ({ ...f, selected: true })));
  };

  const handleDeselectAll = () => {
    setFiles(prev => prev.map(f => ({ ...f, selected: false })));
  };

  const handleProcess = async () => {
    const selectedFiles = files.filter(f => f.selected);
    if (selectedFiles.length === 0) {
      toast.error('Please select at least one file');
      return;
    }

    setIsProcessing(true);
    try {
      await mockApi.processFiles(sampleId!, selectedFiles.map(f => f.id));
      toast.success('Processing complete');
      navigate(`/viewer/${sampleId}`);
    } catch (error) {
      toast.error('Processing failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const selectedCount = files.filter(f => f.selected).length;

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
          <h1 className="text-xl font-semibold">Archive Contents</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Select Files to Process</CardTitle>
                <CardDescription>
                  {selectedCount} of {files.length} files selected
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                  <CheckSquare className="w-4 h-4 mr-2" />
                  Select All
                </Button>
                <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                  <Square className="w-4 h-4 mr-2" />
                  Deselect All
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : files.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No files found in archive</p>
              </div>
            ) : (
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={file.id}
                    className={`flex items-center justify-between p-4 rounded-lg transition-all animate-fade-in cursor-pointer ${
                      file.selected
                        ? 'bg-primary/5 border border-primary/20'
                        : 'bg-secondary/30 border border-transparent hover:bg-secondary/50'
                    }`}
                    style={{ animationDelay: `${index * 30}ms` }}
                    onClick={() => handleToggleFile(file.id)}
                  >
                    <div className="flex items-center gap-4">
                      <Checkbox
                        checked={file.selected}
                        onCheckedChange={() => handleToggleFile(file.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{file.filename}</span>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`font-mono text-xs ${typeColors[file.type]}`}
                    >
                      {file.type}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Process Button */}
            <div className="mt-8 flex justify-end">
              <Button
                onClick={handleProcess}
                disabled={isProcessing || selectedCount === 0}
                size="lg"
                variant={isProcessing ? 'glow' : 'default'}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Cog />
                    Process {selectedCount} File{selectedCount !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
