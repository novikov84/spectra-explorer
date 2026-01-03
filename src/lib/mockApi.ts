// Mock API for EPR spectrum viewer

export type SpectrumType = 'CW' | 'EDFS' | 'T1' | 'T2' | 'Rabi' | 'HYSCORE' | '2D' | 'Unknown';

export interface SpectrumFile {
  id: string;
  filename: string;
  type: SpectrumType;
  selected: boolean;
}

export interface Sample {
  id: string;
  name: string;
  uploadDate: string;
  fileCount: number;
}

export interface Spectrum1D {
  id: string;
  filename: string;
  type: SpectrumType;
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
  xLabel: string;
  yLabel: string;
  xData: number[];
  yData: number[];
  zData: number[][];
}

// Generate mock 1D spectrum data
function generateMock1DData(type: SpectrumType): { xData: number[]; realData: number[]; imagData: number[] } {
  const points = 512;
  const xData: number[] = [];
  const realData: number[] = [];
  const imagData: number[] = [];

  for (let i = 0; i < points; i++) {
    const x = (i / points) * 100;
    xData.push(x);

    let real = 0;
    let imag = 0;

    switch (type) {
      case 'CW':
        // Derivative Lorentzian
        const center = 50;
        const width = 5;
        const t = (x - center) / width;
        real = -2 * t / (1 + t * t) ** 2;
        imag = (1 - t * t) / (1 + t * t) ** 2;
        break;
      case 'EDFS':
        // Echo decay
        real = Math.exp(-x / 30) * Math.cos(x * 0.5);
        imag = Math.exp(-x / 30) * Math.sin(x * 0.5);
        break;
      case 'T1':
        // Inversion recovery
        real = 1 - 2 * Math.exp(-x / 20);
        imag = 0.1 * Math.sin(x * 0.1);
        break;
      case 'T2':
        // Spin echo decay
        real = Math.exp(-Math.pow(x / 25, 2));
        imag = 0.05 * Math.exp(-Math.pow(x / 25, 2)) * Math.sin(x * 0.2);
        break;
      case 'Rabi':
        // Rabi oscillation
        real = Math.cos(x * 0.3) * Math.exp(-x / 50);
        imag = Math.sin(x * 0.3) * Math.exp(-x / 50);
        break;
      default:
        real = Math.sin(x * 0.1) * Math.exp(-x / 40) + (Math.random() - 0.5) * 0.1;
        imag = Math.cos(x * 0.1) * Math.exp(-x / 40) + (Math.random() - 0.5) * 0.1;
    }

    // Add some noise
    real += (Math.random() - 0.5) * 0.02;
    imag += (Math.random() - 0.5) * 0.02;

    realData.push(real);
    imagData.push(imag);
  }

  return { xData, realData, imagData };
}

// Generate mock 2D spectrum data
function generateMock2DData(type: SpectrumType): { xData: number[]; yData: number[]; zData: number[][] } {
  const xPoints = 64;
  const yPoints = 64;
  const xData: number[] = [];
  const yData: number[] = [];
  const zData: number[][] = [];

  for (let i = 0; i < xPoints; i++) {
    xData.push((i / xPoints) * 20 - 10);
  }
  for (let j = 0; j < yPoints; j++) {
    yData.push((j / yPoints) * 20 - 10);
  }

  for (let j = 0; j < yPoints; j++) {
    const row: number[] = [];
    for (let i = 0; i < xPoints; i++) {
      const x = xData[i];
      const y = yData[j];
      let z = 0;

      if (type === 'HYSCORE') {
        // HYSCORE pattern with ridges
        const r1 = Math.sqrt((x - 3) ** 2 + (y - 3) ** 2);
        const r2 = Math.sqrt((x + 3) ** 2 + (y + 3) ** 2);
        const r3 = Math.sqrt((x - 3) ** 2 + (y + 3) ** 2);
        const r4 = Math.sqrt((x + 3) ** 2 + (y - 3) ** 2);
        z = Math.exp(-Math.pow(r1, 2) / 4) + Math.exp(-Math.pow(r2, 2) / 4);
        z += 0.5 * Math.exp(-Math.pow(r3, 2) / 6) + 0.5 * Math.exp(-Math.pow(r4, 2) / 6);
        // Add diagonal ridge
        z += 0.3 * Math.exp(-((x - y) ** 2) / 2);
      } else {
        // Generic 2D pattern
        z = Math.exp(-(x ** 2 + y ** 2) / 20) * Math.cos(Math.sqrt(x ** 2 + y ** 2) * 0.5);
        z += 0.3 * Math.exp(-((x - 4) ** 2 + (y - 2) ** 2) / 8);
        z += 0.2 * Math.exp(-((x + 3) ** 2 + (y + 4) ** 2) / 10);
      }

      // Add noise
      z += (Math.random() - 0.5) * 0.05;
      row.push(z);
    }
    zData.push(row);
  }

  return { xData, yData, zData };
}

// Mock samples storage
let mockSamples: Sample[] = [];
let mockFiles: Map<string, SpectrumFile[]> = new Map();
let mockSpectra: Map<string, Spectrum1D | Spectrum2D> = new Map();

// Simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const mockApi = {
  // Authentication
  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    await delay(800);
    if (email && password.length >= 4) {
      return { success: true };
    }
    return { success: false, error: 'Invalid credentials' };
  },

  // Samples
  async getSamples(): Promise<Sample[]> {
    await delay(300);
    return mockSamples;
  },

  async uploadSample(file: File): Promise<Sample> {
    await delay(1500);
    const sample: Sample = {
      id: `sample-${Date.now()}`,
      name: file.name.replace('.zip', ''),
      uploadDate: new Date().toISOString(),
      fileCount: Math.floor(Math.random() * 10) + 5,
    };
    mockSamples.push(sample);

    // Generate mock files for this sample
    const types: SpectrumType[] = ['CW', 'EDFS', 'T1', 'T2', 'Rabi', 'HYSCORE', '2D', 'Unknown'];
    const files: SpectrumFile[] = [];
    for (let i = 0; i < sample.fileCount; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      files.push({
        id: `file-${sample.id}-${i}`,
        filename: `spectrum_${type.toLowerCase()}_${i + 1}.dat`,
        type,
        selected: true,
      });
    }
    mockFiles.set(sample.id, files);

    return sample;
  },

  async loadExampleSample(): Promise<Sample> {
    await delay(1000);
    const sample: Sample = {
      id: `example-${Date.now()}`,
      name: 'Example Dataset',
      uploadDate: new Date().toISOString(),
      fileCount: 12,
    };
    mockSamples.push(sample);

    // Generate comprehensive example files
    const exampleFiles: SpectrumFile[] = [
      { id: `file-${sample.id}-0`, filename: 'cw_nitroxide_rt.dat', type: 'CW', selected: true },
      { id: `file-${sample.id}-1`, filename: 'cw_nitroxide_77k.dat', type: 'CW', selected: true },
      { id: `file-${sample.id}-2`, filename: 'edfs_fid.dat', type: 'EDFS', selected: true },
      { id: `file-${sample.id}-3`, filename: 'edfs_echo.dat', type: 'EDFS', selected: true },
      { id: `file-${sample.id}-4`, filename: 't1_invrec.dat', type: 'T1', selected: true },
      { id: `file-${sample.id}-5`, filename: 't2_hahn.dat', type: 'T2', selected: true },
      { id: `file-${sample.id}-6`, filename: 't2_cpmg.dat', type: 'T2', selected: true },
      { id: `file-${sample.id}-7`, filename: 'rabi_nutation.dat', type: 'Rabi', selected: true },
      { id: `file-${sample.id}-8`, filename: 'hyscore_14n.dat', type: 'HYSCORE', selected: true },
      { id: `file-${sample.id}-9`, filename: 'hyscore_1h.dat', type: 'HYSCORE', selected: true },
      { id: `file-${sample.id}-10`, filename: '2d_eldor.dat', type: '2D', selected: true },
      { id: `file-${sample.id}-11`, filename: 'unknown_exp.dat', type: 'Unknown', selected: true },
    ];
    mockFiles.set(sample.id, exampleFiles);

    return sample;
  },

  async deleteSample(sampleId: string): Promise<void> {
    await delay(300);
    mockSamples = mockSamples.filter(s => s.id !== sampleId);
    mockFiles.delete(sampleId);
  },

  // Archive contents
  async getArchiveFiles(sampleId: string): Promise<SpectrumFile[]> {
    await delay(400);
    return mockFiles.get(sampleId) || [];
  },

  async updateFileSelection(sampleId: string, fileId: string, selected: boolean): Promise<void> {
    const files = mockFiles.get(sampleId);
    if (files) {
      const file = files.find(f => f.id === fileId);
      if (file) {
        file.selected = selected;
      }
    }
  },

  // Processing
  async processFiles(sampleId: string, fileIds: string[]): Promise<void> {
    await delay(2000);

    const files = mockFiles.get(sampleId) || [];
    const selectedFiles = files.filter(f => fileIds.includes(f.id));

    for (const file of selectedFiles) {
      const is2D = file.type === 'HYSCORE' || file.type === '2D';

      if (is2D) {
        const data = generateMock2DData(file.type);
        const spectrum: Spectrum2D = {
          id: file.id,
          filename: file.filename,
          type: file.type,
          xLabel: file.type === 'HYSCORE' ? 'ν₁ (MHz)' : 'τ₁ (μs)',
          yLabel: file.type === 'HYSCORE' ? 'ν₂ (MHz)' : 'τ₂ (μs)',
          ...data,
        };
        mockSpectra.set(file.id, spectrum);
      } else {
        const data = generateMock1DData(file.type);
        const spectrum: Spectrum1D = {
          id: file.id,
          filename: file.filename,
          type: file.type,
          xLabel: getXLabel(file.type),
          yLabel: 'Intensity (a.u.)',
          ...data,
        };
        mockSpectra.set(file.id, spectrum);
      }
    }
  },

  // Viewer
  async getProcessedSpectra(sampleId: string): Promise<(Spectrum1D | Spectrum2D)[]> {
    await delay(300);
    const files = mockFiles.get(sampleId) || [];
    const spectra: (Spectrum1D | Spectrum2D)[] = [];

    for (const file of files) {
      const spectrum = mockSpectra.get(file.id);
      if (spectrum) {
        spectra.push(spectrum);
      }
    }

    return spectra;
  },
};

function getXLabel(type: SpectrumType): string {
  switch (type) {
    case 'CW':
      return 'Magnetic Field (mT)';
    case 'EDFS':
      return 'Magnetic Field (mT)';
    case 'T1':
      return 'Recovery Time (μs)';
    case 'T2':
      return 'Echo Time (μs)';
    case 'Rabi':
      return 'Pulse Length (ns)';
    default:
      return 'X';
  }
}

export function is2DSpectrum(spectrum: Spectrum1D | Spectrum2D): spectrum is Spectrum2D {
  return 'zData' in spectrum;
}
