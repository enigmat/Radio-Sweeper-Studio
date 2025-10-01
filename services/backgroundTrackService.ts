import { BackgroundTrackPreset } from "../types";

// Base64 encoded WAV files for presets
// NOTE: These are silent placeholders.
const PRESET_TRACKS: Record<BackgroundTrackPreset, string> = {
    [BackgroundTrackPreset.None]: '',
    [BackgroundTrackPreset.AmbientPad]: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAVFYAAFRWAAABAAgAZGF0YQAAAAA=',
    [BackgroundTrackPreset.EnergeticBeat]: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAVFYAAFRWAAABAAgAZGF0YQAAAAA=',
    [BackgroundTrackPreset.ChillLoFi]: 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAVFYAAFRWAAABAAgAZGF0YQAAAAA=',
};

const blobCache: Partial<Record<BackgroundTrackPreset, Blob>> = {};

// Helper to decode Base64 strings to Blob
async function base64ToBlob(base64: string, type: string): Promise<Blob> {
    const res = await fetch(`data:${type};base64,${base64}`);
    return await res.blob();
}

export async function getTrackBlob(preset: BackgroundTrackPreset): Promise<Blob> {
    if (blobCache[preset]) {
        return blobCache[preset]!;
    }
    
    const base64String = PRESET_TRACKS[preset];
    if (!base64String) {
        throw new Error(`Preset track not found: ${preset}`);
    }

    const blob = await base64ToBlob(base64String, 'audio/wav');
    blobCache[preset] = blob;
    return blob;
}