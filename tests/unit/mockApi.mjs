import assert from 'node:assert';
import JSZip from 'jszip';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Helpers are compiled to tests/.dist via the build:test script
const here = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(here, '..', '.dist', 'mockApi.js');
if (!fs.existsSync(distPath)) {
  throw new Error('Built helpers not found. Run `npm run build:test` before executing mockApi tests.');
}

const {
  normalizeXForTimeType,
  normalizeAxisStart,
  build1DFromCsv,
  parseZipArchive,
  parseRawBes3t,
} = await import(`file://${distPath}`);

// Helper to create a minimal metadata.json payload for a 1D time-domain spectrum
function makeMetadata(datasetName, points) {
  return {
    dataset_header: {
      dataset_name: datasetName,
    },
    axes: [
      { axis_id: 'X', points, name: 'Time', unit: 'ns' },
      { axis_id: 'Y', points: 1, name: 'Intensity', unit: 'a.u.' },
    ],
  };
}

async function testNormalizeHelpers() {
  const shifted = normalizeXForTimeType([5, 6, 7], 'T1', 'Time (ns)');
  assert.deepStrictEqual(shifted, [0, 1, 2], 'normalizeXForTimeType should shift min to zero for time-like axes');

  const axis = normalizeAxisStart([10, 15], { name: 'Time', unit: 'ns' });
  assert.deepStrictEqual(axis, [0, 5], 'normalizeAxisStart should zero the start of time axis');

  const built = build1DFromCsv([
    [0, 1],
    [1, 2],
    [2, 3],
  ]);
  assert.deepStrictEqual(built.xData, [0, 1, 2]);
  assert.deepStrictEqual(built.realData, [1, 2, 3]);
  assert.deepStrictEqual(built.imagData, [0, 0, 0]);
}

async function testParseZipArchiveNormalizesTimeAxis() {
  const zip = new JSZip();
  const metadata = makeMetadata('Sample_T1_dataset', 3);

  // Axes with non-zero start to ensure normalization kicks in
  zip.file('metadata.json', JSON.stringify(metadata, null, 2));
  zip.file('axes_x.csv', '10\n11\n12\n');
  zip.file('axes_y.csv', '0\n');
  // Simple 1D data: x,y
  zip.file('data.csv', '0,1\n1,2\n2,3\n');

  const buffer = await zip.generateAsync({ type: 'uint8array' });

  const result = await parseZipArchive(buffer);
  assert.strictEqual(result.files.length, 1, 'Should parse a single spectrum from archive');
  const spectrum = result.spectra.get(result.files[0].id);
  assert.ok(spectrum, 'Parsed spectrum should be stored by id');
  assert.deepStrictEqual(spectrum.xData.slice(0, 3), [0, 1, 2], 'Time axis should start at zero after normalization');
}

async function testParseRawBes3tNormalizesTimeAxis() {
  const zip = new JSZip();
  const dsc = `
TITL=Sample_T1_raw
XPTS=4
YPTS=1
BSEQ=LITTLE
IRFMT=F
XMIN=10
XWID=30
EXPT=PULSED
`;
  zip.file('sample.dsc', dsc.trim());

  const numbers = new Float32Array([1, 2, 3, 4]);
  zip.file('sample.dta', Buffer.from(numbers.buffer));

  const parsed = await parseRawBes3t(zip);
  assert.strictEqual(parsed.files.length, 1, 'Should parse one raw BES3T spectrum');
  const spectrum = parsed.spectra.get(parsed.files[0].id);
  assert.ok(spectrum, 'Spectrum should be present');
  assert.deepStrictEqual(spectrum.xData.slice(0, 4), [0, 10, 20, 30], 'BES3T time axis should be zeroed');
}

await testNormalizeHelpers();
await testParseZipArchiveNormalizesTimeAxis();
await testParseRawBes3tNormalizesTimeAxis();

console.log('mockApi parsing/normalization tests passed');
