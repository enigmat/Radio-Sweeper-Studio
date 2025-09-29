
import { SfxPreset } from "../types";

// Base64 encoded WAV files for SFX presets
// These are short, silent placeholders for demonstration purposes.
const PRESET_SFX: Record<SfxPreset, string> = {
    [SfxPreset.None]: '',
    [SfxPreset.LaserZap]: 'UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABgAZGF0YQIAAAB/fw==',
    [SfxPreset.AirHorn]: 'UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABgAZGF0YQIAAAB/fw==',
    [SfxPreset.RecordScratch]: 'UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABgAZGF0YQIAAAB/fw==',
    [SfxPreset.Explosion]: 'UklGRiYAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABgAZGF0YQIAAAB/fw==',
};

const blobCache: Partial<Record<SfxPreset, Blob>> = {};

// Helper to decode Base64 strings to Blob
async function base64ToBlob(base64: string, type: string): Promise<Blob> {
    if (!base64) {
        return new Blob([], { type });
    }
    const res = await fetch(`data:${type};base64,${base64}`);
    return await res.blob();
}

export async function getSfxBlob(preset: SfxPreset): Promise<Blob> {
    if (blobCache[preset]) {
        return blobCache[preset]!;
    }
    
    const base64String = PRESET_SFX[preset];
    if (typeof base64String === 'undefined') {
        throw new Error(`Preset SFX not found: ${preset}`);
    }

    const blob = await base64ToBlob(base64String, 'audio/wav');
    blobCache[preset] = blob;
    return blob;
}
