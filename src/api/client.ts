import type { components } from './schema';

type AuthResponse = components['schemas']['AuthResponse'];
type ImportJob = components['schemas']['Import'];
type Report = components['schemas']['Report'];
type ReportItem = components['schemas']['ReportItem'];
type ReportJob = components['schemas']['ReportJob'];
type Sample = components['schemas']['Sample'];
type Spectrum1D = components['schemas']['Spectrum1D'];
type Spectrum2D = components['schemas']['Spectrum2D'];
type SpectrumData = components['schemas']['SpectrumData'];
type SpectrumFile = {
  id: string;
  filename: string;
  type: string;
  selected: boolean;
};

const baseFromVite =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_BASE_URL : undefined;
const tokenFromVite =
  typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_API_FAKE_TOKEN : undefined;
const BASE_URL =
  baseFromVite ||
  (typeof process !== 'undefined' ? process.env.VITE_API_BASE_URL || process.env.API_BASE_URL : undefined) ||
  'http://localhost:8000';
const FAKE_TOKEN =
  tokenFromVite ||
  (typeof process !== 'undefined' ? process.env.VITE_API_FAKE_TOKEN || process.env.API_FAKE_TOKEN : undefined) ||
  'demo-token';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };
  // Add bearer token if not provided
  if (!headers.Authorization) {
    headers.Authorization = `Bearer ${FAKE_TOKEN}`;
  }
  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  },
  async guest(): Promise<AuthResponse> {
    return request<AuthResponse>('/auth/guest', { method: 'POST' });
  },

  // Imports
  async uploadImport(file: File): Promise<ImportJob> {
    const form = new FormData();
    form.append('file', file);
    return request<ImportJob>('/imports', { method: 'POST', body: form });
  },
  async getImport(id: string): Promise<ImportJob> {
    return request<ImportJob>(`/imports/${id}`);
  },

  // Samples
  async listSamples(): Promise<Sample[]> {
    return request<Sample[]>('/samples');
  },

  // Spectra
  async listSpectra(sampleId: string): Promise<(Spectrum1D | Spectrum2D)[]> {
    const res = await request<{ spectra: (Spectrum1D | Spectrum2D)[] }>(
      `/samples/${sampleId}/spectra`,
    );
    return res.spectra;
  },
  async listArchiveFiles(sampleId: string): Promise<SpectrumFile[]> {
    return request<SpectrumFile[]>(`/samples/${sampleId}/files`);
  },
  async processFiles(sampleId: string, fileIds: string[]): Promise<ImportJob> {
    return request<ImportJob>(`/samples/${sampleId}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileIds }),
    });
  },
  async getSpectrum(id: string): Promise<Spectrum1D | Spectrum2D> {
    return request<Spectrum1D | Spectrum2D>(`/spectra/${id}`);
  },
  async getSpectrumData(id: string): Promise<SpectrumData> {
    return request<SpectrumData>(`/spectra/${id}/data`);
  },

  // Reports
  async listReports(): Promise<Report[]> {
    return request<Report[]>('/reports');
  },
  async createReport(name: string, sampleId: string): Promise<Report> {
    return request<Report>('/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, sampleId }),
    });
  },
  async addReportItem(reportId: string, item: Omit<ReportItem, 'id'>): Promise<Report> {
    return request<Report>(`/reports/${reportId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
  },
  async removeReportItem(reportId: string, itemId: string): Promise<void> {
    await request<void>(`/reports/${reportId}/items/${itemId}`, { method: 'DELETE' });
  },
  async deleteReport(reportId: string): Promise<void> {
    await request<void>(`/reports/${reportId}`, { method: 'DELETE' });
  },
  async exportReport(reportId: string): Promise<ReportJob> {
    return request<ReportJob>(`/reports/${reportId}/export`, { method: 'POST' });
  },
  async getReportJob(reportId: string): Promise<ReportJob> {
    return request<ReportJob>(`/reports/${reportId}/export/status`);
  },
};
