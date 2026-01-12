import type { components } from './schema';

// Export types for use in components
export type AuthResponse = components['schemas']['AuthResponse'];
// Extended/Fixed types
export interface ParsedParams {
  sampleName: string;
  temperatureK?: number;
  fieldG?: number;
  amplifierDb?: number;
  pulseWidth?: number;
  spectralWidth?: number; // Added missing field
  tokens: string[];
}

export type ImportJob = components['schemas']['Import'];
export type Report = components['schemas']['Report'];
export type ReportItem = components['schemas']['ReportItem'];
export type ReportJob = components['schemas']['ReportJob'];
export type Sample = components['schemas']['Sample'];
// Override Spectrum types to use our ParsedParams? 
// Typescript is structural, so if we just cast it's fine. 
// For now, let's just export components['schemas']['Spectrum1D'] but we might need to patch it if we want mapped usage.
// Actually, spectrumUtils imports ParsedParams. 
export type Spectrum1D = Omit<components['schemas']['Spectrum1D'], 'parsedParams'> & { parsedParams?: ParsedParams };
export type Spectrum2D = Omit<components['schemas']['Spectrum2D'], 'parsedParams'> & { parsedParams?: ParsedParams };

export type SpectrumData = components['schemas']['SpectrumData'];
export type SpectrumType = components['schemas']['SpectrumType'];
export type SpectrumFile = {
  id: string;
  filename: string;
  type: string;
  selected: boolean;
};

const BASE_URL = '/api/spectra';
const FAKE_TOKEN = 'demo-token'; // Fallback if no token in storage? Ideally remove.

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  // Add bearer token if provided in localStorage (managing token in client isn't explicit here yet)
  // Current implementation relies on FAKE_TOKEN. 
  // Let's rely on localStorage 'spectra_token' managed by AuthContext or here.
  const token = localStorage.getItem('spectra_token');
  if (token && !headers.Authorization) {
    headers.Authorization = `Bearer ${token}`;
  }

  // Fix: Headers must be created correctly if Body is FormData (browser sets boundary)
  if (options.body instanceof FormData && headers['Content-Type'] === 'application/json') {
    delete headers['Content-Type'];
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const json = JSON.parse(text);
      if (json.detail) msg = json.detail;
    } catch (e) { }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  setToken(token: string | null) {
    if (token) localStorage.setItem('spectra_token', token);
    else localStorage.removeItem('spectra_token');
  },

  getToken() {
    return localStorage.getItem('spectra_token');
  },

  logout() {
    this.setToken(null);
  },

  async login(username: string, password: string): Promise<AuthResponse> {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    // The backend uses OAuth2PasswordRequestForm which expects form-data, not JSON
    const res = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    this.setToken(res.accessToken);
    return res;
  },

  async register(username: string, password: string): Promise<void> {
    await request<void>('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
  },

  async guestLogin(): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/auth/guest', { method: 'POST' });
    this.setToken(res.accessToken);
    return res;
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
  async deleteSample(id: string): Promise<void> {
    return request<void>(`/samples/${id}`, { method: 'DELETE' });
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
