import { Spectrum1D, Spectrum2D, ParsedParams } from './mockApi';

/**
 * Generates a concise label for a spectrum based on its metadata.
 * - T1/T2: "[Temp]K [Field]G"
 * - EDFS: "[Temp]K SW=[Width]G"
 * - Default: Filename
 * 
 * @param spectrum The spectrum object
 * @param showSuffix If true, appends (Real)/(Imag) based on context (handled by caller usually, but helper can support extensions)
 * @returns formatted string
 */
export function getSpectrumLabel(spectrum: Spectrum1D | Spectrum2D): string {
    const { type, parsedParams, filename } = spectrum;

    if (!parsedParams) return filename;

    if (type === 'T1' || type === 'T2') {
        const parts = [];
        if (parsedParams.temperatureK) parts.push(`${parsedParams.temperatureK}K`);
        if (parsedParams.fieldG) parts.push(`${parsedParams.fieldG}G`);

        if (parts.length > 0) return parts.join(' ');
        return filename;
    }

    if (type === 'EDFS') {
        const parts = [];
        if (parsedParams.temperatureK) parts.push(`${parsedParams.temperatureK}K`);
        if (parsedParams.spectralWidth) parts.push(`SW=${parsedParams.spectralWidth}G`);

        if (parts.length > 0) return parts.join(' ');
        // Fallback to filename if no params found
        return filename;
    }

    if (type === 'Rabi') {
        const parts = [];
        if (parsedParams.amplifierDb !== undefined && parsedParams.amplifierDb !== null) {
            parts.push(`${parsedParams.amplifierDb} dB`);
        }
        if (parsedParams.pulseWidth !== undefined && parsedParams.pulseWidth !== null) {
            parts.push(`${parsedParams.pulseWidth} ns`);
        }
        if (parts.length > 0) return parts.join(' ');
        return filename;
    }

    // Fallback for types without special formatting logic yet
    return filename;
}

/**
 * Comparator for sorting spectra.
 * Order:
 * 1. Temperature (Low -> High). Nulls/Undefined at end.
 * 2. Secondary Parameter (Field / Pulse Width / Spectral Width) (Low -> High).
 * 3. Filename (A -> Z).
 */
export function sortSpectra(a: Spectrum1D | Spectrum2D, b: Spectrum1D | Spectrum2D): number {
    const pA = a.parsedParams;
    const pB = b.parsedParams;

    // 1. Temperature
    const tA = pA.temperatureK ?? Infinity;
    const tB = pB.temperatureK ?? Infinity;
    if (tA !== tB) return tA - tB;

    // 2. Secondary Parameter
    // Priority: FieldG (T1/T2), PulseWidth (Rabi), SpectralWidth (EDFS/2D?)

    // T1/T2 -> fieldG
    if ((a.type === 'T1' || a.type === 'T2') && (b.type === 'T1' || b.type === 'T2')) {
        const fA = pA.fieldG ?? Infinity;
        const fB = pB.fieldG ?? Infinity;
        if (fA !== fB) return fA - fB;
    }

    // EDFS -> spectralWidth
    if (a.type === 'EDFS' && b.type === 'EDFS') {
        const swA = pA.spectralWidth ?? Infinity;
        const swB = pB.spectralWidth ?? Infinity;
        if (swA !== swB) return swA - swB;
    }

    // Rabi -> amplifierDb, then pulseWidth
    if (a.type === 'Rabi' && b.type === 'Rabi') {
        const dbA = pA.amplifierDb ?? Infinity;
        const dbB = pB.amplifierDb ?? Infinity;
        if (dbA !== dbB) return dbA - dbB;

        const pwA = pA.pulseWidth ?? Infinity;
        const pwB = pB.pulseWidth ?? Infinity;
        if (pwA !== pwB) return pwA - pwB;
    }

    // 3. Filename Fallback
    return a.filename.localeCompare(b.filename);
}
