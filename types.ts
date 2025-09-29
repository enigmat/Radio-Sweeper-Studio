
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
