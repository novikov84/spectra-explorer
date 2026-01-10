// Pre-generated types approximating openapi-typescript output for the current draft spec.
// When openapi-typescript is available, run `npm run openapi:gen` to regenerate schema.ts
// and swap imports in client.ts to the generated file.

export type SpectrumType = 'CW' | 'EDFS' | 'T1' | 'T2' | 'Rabi' | 'HYSCORE' | '2D' | 'Unknown';

export interface ParsedParams {
  sampleName: string;
  temperatureK?: number;
  fieldG?: number;
  amplifierDb?: number;
  pulseWidth?: number;
  tokens: string[];
}

export interface Spectrum1D {
  id: string;
  filename: string;
  type: SpectrumType;
  parsedParams?: ParsedParams;
  xLabel: string;
  yLabel: string;
  xData: number[];
  realData: number[];
  imagData: number[];
}

export interface Spectrum2D {
  id: string;
  filename: string;
  type: SpectrumType;
  parsedParams?: ParsedParams;
  xLabel: string;
  yLabel: string;
  xData: number[];
  yData: number[];
  zData: number[][];
}

export interface Sample {
  id: string;
  name: string;
  uploadDate?: string;
  fileCount: number;
  spectraByType?: Record<string, number>;
}

export type ImportStatus = 'uploaded' | 'processing' | 'ready' | 'failed';
export interface ImportJob {
  id: string;
  status: ImportStatus;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
  logs?: string[];
}

export interface ReportItem {
  id: string;
  spectrumId: string;
  view: string; // e.g., '1d', 'rabi-trace', 'rabi-fft', 'rabi-scatter'
  params?: Record<string, unknown>;
}

export interface Report {
  id: string;
  name: string;
  sampleId: string;
  items: ReportItem[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ReportJob {
  id: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  error?: string;
  artifactUrl?: string;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
}

export interface SpectrumData {
  xData?: number[];
  realData?: number[];
  imagData?: number[];
  yData?: number[];
  zData?: number[][];
}
