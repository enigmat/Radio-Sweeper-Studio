
export enum Voice {
  Zephyr = 'Zephyr',
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Luna = 'Luna',
  Nova = 'Nova',
  Stella = 'Stella',
  Orion = 'Orion',
  Sol = 'Sol',
}

export enum EffectPreset {
  None = 'None',
  RadioBooth = 'Radio Booth',
  ConcertHall = 'Concert Hall',
  CosmicDelay = 'Cosmic Delay',
  Telephone = 'Telephone EQ',
  RobotVoice = 'Robot Voice',
  PitchShiftUp = 'Pitch Shift (Up)',
  PitchShiftDown = 'Pitch Shift (Down)',
}

export enum BackgroundTrackPreset {
    None = 'None',
    AmbientPad = 'Ambient Pad',
    EnergeticBeat = 'Energetic Beat',
    ChillLoFi = 'Chill Lo-Fi',
}

export enum DJ {
    None = 'None (Neutral Announcer)',
    HypeMan = 'Hype Man',
    SmoothVibes = 'Smooth Vibes',
    RockGod = 'Rock God',
    MorningHost = 'Morning Host',
}

export enum SfxPreset {
    None = 'None',
    LaserZap = 'Laser Zap',
    AirHorn = 'Air Horn',
    RecordScratch = 'Record Scratch',
    Explosion = 'Explosion',
}

export interface AppliedSfx {
    id: string;
    preset: SfxPreset;
    volume: number;
    timing: 'start' | 'middle' | 'end';
}

export interface TakeResult {
    // Source
    originalBlob: Blob;
    originalUrl: string;

    // After vocal effect
    processedBlob: Blob;
    processedUrl: string;
    
    // Final mixed output
    finalBlob: Blob;
    finalUrl: string;

    // UI State
    isProcessing: boolean;
    selectedEffect: EffectPreset;
    selectedTrack: BackgroundTrackPreset | 'custom';
    customTrackFile: File | null;
    mixVolume: number; // 0 to 1
    appliedSfx: AppliedSfx[];

    // Video Generation State
    isGeneratingVideo?: boolean;
    videoUrl?: string;
    videoError?: string;
}

export interface GenerationResult {
    script: string;
    takes: TakeResult[];
}