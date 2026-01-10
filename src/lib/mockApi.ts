import JSZip from 'jszip';

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
  parsedParams?: ParsedParams;
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
  parsedParams?: ParsedParams;
  xData: number[];
  yData: number[];
  zData: number[][];
}

export interface ParsedParams {
  sampleName: string;
  temperatureK?: number;
  fieldG?: number;
  amplifierDb?: number;
  pulseWidth?: number;
  spectralWidth?: number;
  tokens: string[];
}

type StoredSample = {
  sample: Sample;
  files: SpectrumFile[];
  spectra: Map<string, Spectrum1D | Spectrum2D>;
  processed: Set<string>;
};

// In-memory storage to mimic API behaviour
const sampleStore = new Map<string, StoredSample>();
let sampleList: Sample[] = [];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const uid = (prefix: string) =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? (crypto as Crypto).randomUUID()
    : `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const parseCsv = (text: string): number[][] => {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line =>
      line
        .split(',')
        .map(part => Number(part.trim()))
        .filter(n => Number.isFinite(n)),
    )
    .filter(row => row.length > 0);
};

const readTextIfExists = async (zip: JSZip, path: string): Promise<string | null> => {
  const file = zip.file(path);
  if (!file) return null;
  return file.async('string');
};

const buildAxis = (values: number[] | null, points?: number): number[] | null => {
  if (values && values.length > 0) {
    if (points && points > 0 && values.length !== points) {
      return Array.from({ length: points }, (_, i) => i);
    }
    return values;
  }
  if (points && points > 0) {
    return Array.from({ length: points }, (_, i) => i);
  }
  return null;
};

const axisLabel = (axis: any, fallback: string): string => {
  if (!axis) return fallback;
  const name = axis.name || fallback;
  const unit = axis.unit ? ` (${axis.unit})` : '';
  return `${name}${unit}`;
};

const isTimeAxis = (axisMeta: any): boolean => {
  const name = (axisMeta?.name || '').toString().toLowerCase();
  const unit = (axisMeta?.unit || '').toString().toLowerCase();
  return (
    unit === 's' ||
    unit === 'ms' ||
    unit === 'us' ||
    unit === 'µs' ||
    unit === 'ns' ||
    name.includes('time') ||
    name.includes('tau')
  );
};

const normalizeAxisStart = (axis: number[] | null, axisMeta: any): number[] | null => {
  if (!axis || axis.length < 1) return axis;
  if (!isTimeAxis(axisMeta)) return axis;
  const start = axis[0];
  if (!Number.isFinite(start) || start === 0) return axis;
  return axis.map(v => v - start);
};

const normalizeXForTimeType = (
  x: number[],
  type: SpectrumType,
  xLabel: string,
): number[] => {
  const timeTypes: SpectrumType[] = ['T1', 'T2', 'Rabi', 'EDFS'];
  if (!timeTypes.includes(type) && !xLabel.toLowerCase().includes('time')) {
    return x;
  }
  if (x.length === 0) return x;
  const min = Math.min(...x);
  if (!Number.isFinite(min) || min === 0) return x;
  return x.map(v => v - min);
};

const inferSpectrumType = (datasetName: string, metadata: any, is2D: boolean): SpectrumType => {
  const name = (datasetName || '').toLowerCase();
  if (name.includes('edfs')) return 'EDFS';
  if (name.includes('rabi')) return 'Rabi';
  if (name.includes('t1')) return 'T1';
  if (name.includes('t2')) return 'T2';
  if (name.includes('hyscore')) return 'HYSCORE';
  if (name.includes('2d')) return '2D';
  if (name.includes('cw')) return 'CW';

  const family = metadata?.classification?.experiment_family || '';
  if (family.includes('CW')) return is2D ? '2D' : 'CW';
  if (family.includes('PULSED')) return is2D ? '2D' : 'T1';

  return is2D ? '2D' : 'Unknown';
};

const toFolder = (path: string): string => {
  const clean = path.replace(/\\/g, '/');
  const idx = clean.lastIndexOf('/');
  return idx === -1 ? '' : clean.slice(0, idx);
};

function parseParamsFromName(rawName: string): ParsedParams {
  const base = rawName.replace(/\.[^.]+$/, '');
  const tokens = base.split('_').filter(Boolean);
  const sampleName = tokens[0] || base;

  let temperatureK: number | undefined;
  let fieldG: number | undefined;
  let amplifierDb: number | undefined;
  let pulseWidth: number | undefined;
  let spectralWidth: number | undefined;

  for (const tok of tokens) {
    const lower = tok.toLowerCase();

    // Support 'p' as decimal separator (e.g. 3p6k -> 3.6k)
    // Regex: digit(s), optionally followed by [p.] and digit(s), then unit

    const tempMatch = lower.match(/(\d+(?:[p.]\d+)?)k/);
    if (tempMatch) {
      temperatureK = Number(tempMatch[1].replace('p', '.'));
    }

    const fieldMatch = lower.match(/(\d+(?:[p.]\d+)?)g/);
    if (fieldMatch) {
      fieldG = Number(fieldMatch[1].replace('p', '.'));
    }

    const ampMatch = lower.match(/hpa(\d+(?:[p.]\d+)?)db/);
    if (ampMatch) {
      amplifierDb = Number(ampMatch[1].replace('p', '.'));
    }

    const pulseMatch = lower.match(/p(\d+(?:[p.]\d+)?)/);
    if (pulseMatch) {
      pulseWidth = Number(pulseMatch[1].replace('p', '.'));
    }

    const swMatch = lower.match(/sw(\d+(?:[p.]\d+)?)/);
    if (swMatch) {
      spectralWidth = Number(swMatch[1].replace('p', '.'));
    }
  }

  return {
    sampleName,
    temperatureK,
    fieldG,
    amplifierDb,
    pulseWidth,
    spectralWidth,
    tokens,
  };
}

async function readAxisCsv(zip: JSZip, folder: string, axisName: string, points?: number) {
  const prefix = folder ? folder.replace(/\/?$/, '/') : '';
  const txt = await readTextIfExists(zip, `${prefix}axes_${axisName}.csv`);
  if (!txt) return buildAxis(null, points);
  const rows = parseCsv(txt);
  const values = rows.flat();
  return buildAxis(values, points);
}

function build1DFromCsv(rows: number[][]) {
  const xData: number[] = [];
  const realData: number[] = [];
  const imagData: number[] = [];

  rows.forEach((row, idx) => {
    if (row.length === 1) {
      xData.push(idx);
      realData.push(row[0]);
      imagData.push(0);
    } else if (row.length === 2) {
      xData.push(row[0]);
      realData.push(row[1]);
      imagData.push(0);
    } else {
      xData.push(row[0]);
      realData.push(row[1]);
      imagData.push(row[2] ?? 0);
    }
  });

  return { xData, realData, imagData };
}

async function parseSpectrumFromFolder(zip: JSZip, folder: string, metadata: any) {
  const datasetName =
    metadata?.dataset_header?.dataset_name ||
    folder.split('/').filter(Boolean).pop() ||
    'dataset';
  const parsedParams = parseParamsFromName(datasetName);
  const prefix = folder ? `${folder}/` : '';

  const axisList = Array.isArray(metadata?.axes) ? metadata.axes : [];
  const xAxisMeta =
    axisList.find((ax: any) => (ax.axis_id || '').toUpperCase() === 'X') || axisList[0];
  const yAxisMeta =
    axisList.find((ax: any) => (ax.axis_id || '').toUpperCase() === 'Y') || axisList[1];

  let xAxis = await readAxisCsv(zip, prefix, 'x', xAxisMeta?.points);
  let yAxis = await readAxisCsv(zip, prefix, 'y', yAxisMeta?.points);

  xAxis = normalizeAxisStart(xAxis, xAxisMeta);
  yAxis = normalizeAxisStart(yAxis, yAxisMeta);

  // 1D path first (data.csv)
  const dataCsv = await readTextIfExists(zip, `${prefix}data.csv`);
  const spectrumType1D = inferSpectrumType(datasetName, metadata, false);
  if (dataCsv) {
    const rows = parseCsv(dataCsv);
    const { xData, realData, imagData } = build1DFromCsv(rows);
    const resolvedX = xAxis && xAxis.length === realData.length ? xAxis : xData;
    const timeAdjustedX = normalizeXForTimeType(
      resolvedX,
      spectrumType1D,
      axisLabel(xAxisMeta, 'X'),
    );
    const spectrum: Spectrum1D = {
      id: '',
      filename: datasetName,
      type: spectrumType1D,
      parsedParams,
      xLabel: axisLabel(xAxisMeta, 'X'),
      yLabel: 'Intensity (a.u.)',
      xData: timeAdjustedX,
      realData,
      imagData,
    };
    return { spectrum, is2D: false };
  }

  // Matrix path
  const realTxt = await readTextIfExists(zip, `${prefix}data_real.csv`);
  if (!realTxt) {
    throw new Error(`No data.csv or data_real.csv found in ${folder}`);
  }
  const realMatrix = parseCsv(realTxt);
  if (realMatrix.length === 0) {
    throw new Error(`Empty data in ${folder}`);
  }

  const looks2D =
    (yAxisMeta && (yAxisMeta.points || 0) > 1) ||
    (realMatrix.length > 1 && realMatrix[0].length > 2);

  if (!looks2D && realMatrix[0].length <= 2) {
    // Treat as 1D (x, real)
    const { xData, realData, imagData } = build1DFromCsv(realMatrix);
    const resolvedX = xAxis && xAxis.length === realData.length ? xAxis : xData;
    const timeAdjustedX = normalizeXForTimeType(
      resolvedX,
      spectrumType1D,
      axisLabel(xAxisMeta, 'X'),
    );
    const spectrum: Spectrum1D = {
      id: '',
      filename: datasetName,
      type: spectrumType1D,
      parsedParams,
      xLabel: axisLabel(xAxisMeta, 'X'),
      yLabel: 'Intensity (a.u.)',
      xData: timeAdjustedX,
      realData,
      imagData,
    };
    return { spectrum, is2D: false };
  }

  const xPoints = realMatrix[0]?.length || 0;
  const yPoints = realMatrix.length;
  const xData = buildAxis(xAxis, xPoints) || [];
  const yData = buildAxis(yAxis, yPoints) || [];

  const spectrum: Spectrum2D = {
    id: '',
    filename: datasetName,
    type: inferSpectrumType(datasetName, metadata, true),
    parsedParams,
    xLabel: axisLabel(xAxisMeta, 'X'),
    yLabel: axisLabel(yAxisMeta, 'Y'),
    xData,
    yData,
    zData: realMatrix,
  };

  return { spectrum, is2D: true };
}

async function parseZipArchive(file: File | Blob | ArrayBuffer | Uint8Array) {
  console.info('[mockApi] parseZipArchive: start');
  const zip = await JSZip.loadAsync(file);
  const metaEntries = zip
    .file(/metadata\.json$/i)
    .filter(entry => !entry.name.toLowerCase().endsWith('metadata_dsc_raw.json'));

  if (metaEntries.length === 0) {
    console.info('[mockApi] parseZipArchive: no metadata.json found, falling back to raw BES3T parse');
    return parseRawBes3t(zip);
  }

  console.info(`[mockApi] parseZipArchive: found ${metaEntries.length} metadata.json file(s)`);

  const files: SpectrumFile[] = [];
  const spectra = new Map<string, Spectrum1D | Spectrum2D>();

  const sortedEntries = [...metaEntries].sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of sortedEntries) {
    const folder = toFolder(entry.name);
    try {
      const metadata = JSON.parse(await entry.async('string'));
      const { spectrum } = await parseSpectrumFromFolder(zip, folder, metadata);
      const id = uid('file');
      const file: SpectrumFile = {
        id,
        filename: metadata?.dataset_header?.dataset_name || spectrum.filename,
        type: spectrum.type,
        selected: true,
      };

      spectrum.id = id;
      spectra.set(id, spectrum);
      files.push(file);
    } catch (err) {
      console.warn(`Skipping ${folder}:`, err);
    }
  }

  if (files.length === 0) {
    throw new Error('Archive parsed, but no spectra were recognized.');
  }

  return { files, spectra };
}

async function loadExampleZip(): Promise<File> {
  const response = await fetch('/Export.zip');
  if (!response.ok) {
    throw new Error('Example archive /Export.zip not found. Please place it in /public.');
  }
  const blob = await response.blob();
  return new File([blob], 'Export.zip', { type: 'application/zip' });
}

type AxisGuess = { name: string; unit: string; points: number; min?: number; width?: number; start?: number; stop?: number };

function parseDscText(text: string): Record<string, string> {
  const meta: Record<string, string> = {};
  text.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('*')) return;

    // "=" separated
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim().toUpperCase();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (key) meta[key] = value;
      return;
    }

    // Whitespace separated (tab or spaces)
    const parts = trimmed.split(/\s+/, 2);
    if (parts.length === 2) {
      const [k, v] = parts;
      if (k) {
        meta[k.trim().toUpperCase()] = v.trim();
      }
    }
  });
  return meta;
}

const getInt = (meta: Record<string, string>, key: string, fallback = 0) => {
  const v = meta[key.toUpperCase()];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const getFloat = (meta: Record<string, string>, key: string, fallback?: number) => {
  const v = meta[key.toUpperCase()];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const getStr = (meta: Record<string, string>, key: string, fallback = '') => {
  const v = meta[key.toUpperCase()];
  return v !== undefined ? v : fallback;
};

const endianFromBseq = (meta: Record<string, string>) => {
  const bseq = getStr(meta, 'BSEQ', '').toUpperCase();
  if (bseq.startsWith('BIG')) return 'BE';
  if (bseq.startsWith('LIT') || bseq.startsWith('LITTLE')) return 'LE';
  return 'LE';
};

const dtypeFromIrfmt = (irfmt: string) => {
  const code = (irfmt || '').trim().toUpperCase();
  if (code === 'D') return { size: 8, reader: 'f64' as const };
  if (code === 'I') return { size: 4, reader: 'i32' as const };
  return { size: 4, reader: 'f32' as const };
};

const isComplex = (meta: Record<string, string>) => {
  const ikkf = getStr(meta, 'IKKF', '').toUpperCase();
  if (ikkf.includes('CPLX')) return true;
  if ('IIFMT' in meta) return true;
  return false;
};

const axisGuess = (meta: Record<string, string>, axis: 'X' | 'Y', points: number): AxisGuess => {
  const name = getStr(meta, `${axis}NAM`, '');
  const unit = getStr(meta, `${axis}UNI`, '');
  const min = getFloat(meta, `${axis}MIN`);
  const width = getFloat(meta, `${axis}WID`);
  const start = getFloat(meta, `${axis}STRT`);
  const stop = getFloat(meta, `${axis}STOP`);
  return { name, unit, points, min, width, start, stop };
};

const axisVector = (ax: AxisGuess) => {
  if (Number.isFinite(ax.min) && Number.isFinite(ax.width)) {
    return Array.from({ length: ax.points }, (_, i) => (ax.min as number) + ((ax.width as number) * i) / (ax.points - 1 || 1));
  }
  if (Number.isFinite(ax.start) && Number.isFinite(ax.stop)) {
    return Array.from({ length: ax.points }, (_, i) => {
      const t = ax.points === 1 ? 0 : i / (ax.points - 1);
      return (ax.start as number) + t * ((ax.stop as number) - (ax.start as number));
    });
  }
  return Array.from({ length: ax.points }, (_, i) => i);
};

const readBinary = (buffer: ArrayBuffer, dtype: { size: number; reader: 'f32' | 'f64' | 'i32' }, endian: 'LE' | 'BE') => {
  const view = new DataView(buffer);
  const length = buffer.byteLength / dtype.size;
  const out: number[] = [];
  for (let i = 0; i < length; i++) {
    const offset = i * dtype.size;
    if (dtype.reader === 'f32') out.push(view.getFloat32(offset, endian === 'LE'));
    else if (dtype.reader === 'f64') out.push(view.getFloat64(offset, endian === 'LE'));
    else out.push(view.getInt32(offset, endian === 'LE'));
  }
  return out;
};

async function parseRawBes3t(zip: JSZip) {
  console.info('[mockApi] parseRawBes3t: scanning for .DSC');
  const dscEntries = zip.file(/\.dsc$/i);
  if (!dscEntries.length) throw new Error('No metadata.json files and no .dsc files found in archive.');

  const files: SpectrumFile[] = [];
  const spectra = new Map<string, Spectrum1D | Spectrum2D>();

  const dtaLookup = (dir: string, base: string) => {
    const dirPrefix = dir ? `${dir.replace(/\\/g, '/')}/` : '';
    const candidates = zip
      .file(/\.dta$/i)
      .filter(f => f.name.toLowerCase().endsWith(`${base.toLowerCase()}.dta`) && toFolder(f.name) === dir);
    if (candidates.length > 0) return candidates[0];
    // last resort: any file with same basename
    return zip
      .file(/\.dta$/i)
      .find(f => f.name.toLowerCase().endsWith(`${base.toLowerCase()}.dta`));
  };

  for (const entry of dscEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const dscText = await entry.async('string');
      const meta = parseDscText(dscText);
      const dir = toFolder(entry.name);
      const base = entry.name.split('/').pop()?.replace(/\.dsc$/i, '') || 'dataset';
      const parsedParams = parseParamsFromName(base);
      const dtaEntry = dtaLookup(dir, base);
      if (!dtaEntry) {
        console.warn(`[mockApi] No DTA found for ${entry.name}`);
        continue;
      }

      const xpts = getInt(meta, 'XPTS', 0);
      const ypts = getInt(meta, 'YPTS', 1);
      if (xpts <= 0) {
        console.warn(`[mockApi] Invalid XPTS for ${entry.name}`);
        continue;
      }

      const endian = endianFromBseq(meta);
      const dtype = dtypeFromIrfmt(getStr(meta, 'IRFMT', 'F'));
      const complexFlag = isComplex(meta);
      const npts = xpts * ypts;

      const buffer = await dtaEntry.async('arraybuffer');
      const numbers = readBinary(buffer, dtype, endian as 'LE' | 'BE');
      const expected = npts * (complexFlag ? 2 : 1);
      if (numbers.length !== expected) {
        console.warn(`[mockApi] Size mismatch for ${entry.name}: expected ${expected}, got ${numbers.length}`);
        continue;
      }

      const real: number[] = [];
      const imag: number[] = [];
      if (complexFlag) {
        for (let i = 0; i < npts; i++) {
          real.push(numbers[i * 2]);
          imag.push(numbers[i * 2 + 1]);
        }
      } else {
        real.push(...numbers);
        imag.push(...Array.from({ length: npts }, () => 0));
      }

      const id = uid('file');
      const filename = getStr(meta, 'TITL', `${base}.dsc`);
      const type = inferSpectrumType(
        filename,
        { classification: { experiment_family: getStr(meta, 'EXPT', '') } },
        ypts > 1,
      );
      const xAxisMeta = axisGuess(meta, 'X', xpts);
      const yAxisMeta = axisGuess(meta, 'Y', ypts > 0 ? ypts : 1);
      const xVectorRaw = normalizeAxisStart(axisVector(xAxisMeta), xAxisMeta) || [];
      const xVector = normalizeXForTimeType(xVectorRaw, type, axisLabel(xAxisMeta, 'X'));
      const yVectorRaw = ypts > 1 ? axisVector(yAxisMeta) : null;
      const yVector = normalizeAxisStart(yVectorRaw, yAxisMeta);

      if (ypts > 1) {
        const zData: number[][] = [];
        for (let row = 0; row < ypts; row++) {
          const start = row * xpts;
          zData.push(real.slice(start, start + xpts));
        }
        const spectrum: Spectrum2D = {
          id,
          filename,
          type,
          parsedParams,
          xLabel: axisLabel(xAxisMeta, 'X'),
          yLabel: axisLabel(yAxisMeta, 'Y'),
          xData: xVector,
          yData: yVector || Array.from({ length: ypts }, (_, i) => i),
          zData,
        };
        files.push({ id, filename, type, selected: true });
        spectra.set(id, spectrum);
      } else {
        const spectrum: Spectrum1D = {
          id,
          filename,
          type,
          parsedParams,
          xLabel: axisLabel(xAxisMeta, 'X'),
          yLabel: 'Intensity (a.u.)',
          xData: xVector,
          realData: real,
          imagData: imag,
        };
        files.push({ id, filename, type, selected: true });
        spectra.set(id, spectrum);
      }
    } catch (err) {
      console.warn(`[mockApi] Failed to parse ${entry.name}:`, err);
    }
  }

  if (!files.length) throw new Error('Archive parsed, but no spectra were recognized.');
  return { files, spectra };
}

export const mockApi = {
  // Authentication
  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    await delay(400);
    if (email && password.length >= 4) {
      return { success: true };
    }
    return { success: false, error: 'Invalid credentials' };
  },

  // Samples
  async getSamples(): Promise<Sample[]> {
    await delay(200);
    return sampleList;
  },

  async uploadSample(file: File): Promise<Sample> {
    await delay(300);
    console.info(`[mockApi] uploadSample: parsing ${file.name}`);
    const parsed = await parseZipArchive(file);
    console.info(`[mockApi] uploadSample: parsed ${parsed.files.length} file(s)`);
    const sample: Sample = {
      id: uid('sample'),
      name: file.name.replace(/\.zip$/i, ''),
      uploadDate: new Date().toISOString(),
      fileCount: parsed.files.length,
    };

    sampleList = [...sampleList, sample];
    sampleStore.set(sample.id, {
      sample,
      files: parsed.files,
      spectra: parsed.spectra,
      processed: new Set(parsed.files.filter(f => f.selected).map(f => f.id)),
    });

    return sample;
  },

  async loadExampleSample(): Promise<Sample> {
    await delay(300);
    console.info('[mockApi] loadExampleSample: fetching /Export.zip');
    const file = await loadExampleZip();
    return this.uploadSample(file);
  },

  async deleteSample(sampleId: string): Promise<void> {
    await delay(150);
    sampleList = sampleList.filter(s => s.id !== sampleId);
    sampleStore.delete(sampleId);
  },

  // Archive contents
  async getArchiveFiles(sampleId: string): Promise<SpectrumFile[]> {
    await delay(200);
    const stored = sampleStore.get(sampleId);
    return stored ? stored.files.map(f => ({ ...f })) : [];
  },

  async updateFileSelection(sampleId: string, fileId: string, selected: boolean): Promise<void> {
    const stored = sampleStore.get(sampleId);
    if (!stored) return;
    stored.files = stored.files.map(f => (f.id === fileId ? { ...f, selected } : f));
  },

  // Processing
  async processFiles(sampleId: string, fileIds: string[]): Promise<void> {
    await delay(400);
    const stored = sampleStore.get(sampleId);
    if (!stored) return;
    stored.processed = new Set(fileIds);
    stored.files = stored.files.map(f => ({ ...f, selected: fileIds.includes(f.id) }));
  },

  // Viewer
  async getProcessedSpectra(sampleId: string): Promise<(Spectrum1D | Spectrum2D)[]> {
    await delay(200);
    const stored = sampleStore.get(sampleId);
    if (!stored) return [];
    const spectra: (Spectrum1D | Spectrum2D)[] = [];
    for (const id of stored.processed) {
      const spectrum = stored.spectra.get(id);
      if (spectrum) {
        spectra.push(spectrum);
      }
    }
    return spectra;
  },
};

export function is2DSpectrum(spectrum: Spectrum1D | Spectrum2D): spectrum is Spectrum2D {
  return 'zData' in spectrum;
}

// Export selected helpers for tests
export {
  parseZipArchive,
  parseRawBes3t,
  parseDscText,
  build1DFromCsv,
  normalizeAxisStart,
  normalizeXForTimeType,
  inferSpectrumType,
};
