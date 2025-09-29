

export enum Voice {
  Zephyr = 'Zephyr',
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
}

export interface VocalProfile {
  id: string;
  name: string;
  voice: Voice;
  deliveryStyle: string;
}

export const VOCAL_PROFILES: VocalProfile[] = [
    { id: 'zephyr-energetic', name: 'Zephyr (Energetic)', voice: Voice.Zephyr, deliveryStyle: 'energetic, clear, and upbeat' },
    { id: 'zephyr-warm', name: 'Zephyr (Warm Announcer)', voice: Voice.Zephyr, deliveryStyle: 'warm, friendly, and inviting' },
    { id: 'puck-deep', name: 'Puck (Deep & Authoritative)', voice: Voice.Puck, deliveryStyle: 'deep, authoritative, and resonant' },
    { id: 'puck-mysterious', name: 'Puck (Mysterious Narrator)', voice: Voice.Puck, deliveryStyle: 'slow, mysterious, with a deep tone' },
    { id: 'charon-smooth', name: 'Charon (Smooth & Calm)', voice: Voice.Charon, deliveryStyle: 'smooth, calm, and relaxing' },
    { id: 'kore-bright', name: 'Kore (Bright & Youthful)', voice: Voice.Kore, deliveryStyle: 'bright, youthful, and cheerful' },
    { id: 'fenrir-powerful', name: 'Fenrir (Powerful & Epic)', voice: Voice.Fenrir, deliveryStyle: 'powerful, epic, and dramatic' },
];

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
    SynthWhoosh = 'Synth Whoosh',
    NewsJingle = 'News Jingle',
    RockRiff = 'Rock Riff',
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

export interface VocalDrop {
    id: string;
    script: string;
    vocalProfileId: string;
    blob: Blob | null;
    url: string | null;
    isGenerating: boolean;
}

export interface AppliedVocalDrop {
    id: string;
    dropId: string; // references a VocalDrop's id
    volume: number;
    timing: 'start' | 'middle' | 'end';
}