import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { mockApi, Sample } from '@/lib/mockApi';
import { api } from '@/api/client';
import { isBackendAvailable } from '@/api/backendStatus';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FolderOpen, FlaskConical, LogOut, Loader2, Trash2, FileArchive } from 'lucide-react';
import { toast } from 'sonner';

export default function Samples() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isLoadingExample, setIsLoadingExample] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    loadSamples();
  }, []);

  const loadSamples = async () => {
    setIsLoading(true);
    try {
      const backendUp = await isBackendAvailable();
      if (backendUp) {
        const data = await api.listSamples();
        setSamples(data as Sample[]);
      } else {
        const data = await mockApi.getSamples();
        setSamples(data);
      }
    } catch (error) {
      toast.error('Failed to load samples');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.zip')) {
      toast.error('Please upload a .zip file');
      return;
    }

    setIsUploading(true);
    try {
      const backendUp = await isBackendAvailable();
      if (backendUp) {
        await api.uploadImport(file);
        const refreshed = await api.listSamples();
        setSamples(refreshed as Sample[]);
        toast.success('Import started via backend');
      } else {
        const sample = await mockApi.uploadSample(file);
        setSamples(prev => [...prev, sample]);
        toast.success(`Uploaded: ${sample.name}`);
      }
    } catch (error) {
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleLoadExample = async () => {
    setIsLoadingExample(true);
    try {
      const sample = await mockApi.loadExampleSample();
      setSamples(prev => [...prev, sample]);
      toast.success('Example dataset loaded');
    } catch (error) {
      toast.error('Failed to load example');
    } finally {
      setIsLoadingExample(false);
    }
  };

  const handleDeleteSample = async (sampleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await mockApi.deleteSample(sampleId);
      setSamples(prev => prev.filter(s => s.id !== sampleId));
      toast.success('Sample deleted');
    } catch (error) {
      toast.error('Failed to delete sample');
    }
  };

  const handleOpenSample = (sampleId: string) => {
    navigate(`/archive/${sampleId}`);
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">EPR Viewer</h1>
              <p className="text-xs text-muted-foreground">Spectrum Analysis</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <input
            type="file"
            accept=".zip"
            ref={fileInputRef}
            onChange={handleUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            size="lg"
            className="flex-1"
          >
            {isUploading ? (
              <>
                <Loader2 className="animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload />
                Upload Archive
              </>
            )}
          </Button>
          <Button
            onClick={handleLoadExample}
            disabled={isLoadingExample}
            variant="outline"
            size="lg"
            className="flex-1"
          >
            {isLoadingExample ? (
              <>
                <Loader2 className="animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <FlaskConical />
                Load Example
              </>
            )}
          </Button>
        </div>

        {/* Samples List */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-xl">My Samples</CardTitle>
            <CardDescription>
              {samples.length === 0
                ? 'No samples yet. Upload an archive or load an example.'
                : `${samples.length} sample${samples.length !== 1 ? 's' : ''}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : samples.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileArchive className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No samples uploaded</p>
                <p className="text-sm mt-1">Upload a .zip archive to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {samples.map((sample, index) => (
                  <div
                    key={sample.id}
                    className="group flex items-center justify-between p-4 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors animate-fade-in cursor-pointer"
                    style={{ animationDelay: `${index * 50}ms` }}
                    onClick={() => handleOpenSample(sample.id)}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <FileArchive className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{sample.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {sample.fileCount} files • {new Date(sample.uploadDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => handleDeleteSample(sample.id, e)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button variant="secondary" size="sm">
                        <FolderOpen className="w-4 h-4 mr-2" />
                        Open
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
