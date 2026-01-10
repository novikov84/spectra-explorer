import { Spectrum1D, Spectrum2D } from './mockApi';

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

    // Fallback for types without special formatting logic yet
    return filename;
}
