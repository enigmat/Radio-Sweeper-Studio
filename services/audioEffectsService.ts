
import { EffectPreset } from '../types';

// Helper to convert an AudioBuffer to a WAV Blob.
// This is necessary to create a downloadable file from the processed audio data.
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44; // 2 bytes per sample
    const bufferArray = new ArrayBuffer(length);
    const view = new DataView(bufferArray);
    const channels = [];
    let i, sample;
    let offset = 0;
    let pos = 0;

    const setUint16 = (data: number) => {
        view.setUint16(pos, data, true);
        pos += 2;
    };

    const setUint32 = (data: number) => {
        view.setUint32(pos, data, true);
        pos += 4;
    };

    // RIFF header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    // "fmt " sub-chunk
    setUint32(0x20746d66); // "fmt "
    setUint32(16); // chunk size
    setUint16(1); // format = 1 (PCM)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
    setUint16(numOfChan * 2); // block align
    setUint16(16); // bits per sample

    // "data" sub-chunk
    setUint32(0x61746164); // "data"
    setUint32(length - pos - 4);

    // Get raw channel data
    for (i = 0; i < buffer.numberOfChannels; i++) {
        channels.push(buffer.getChannelData(i));
    }

    // Interleave channel data and write to buffer
    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            sample = Math.max(-1, Math.min(1, channels[i][offset])); // Clamp
            sample = (sample < 0 ? sample * 32768 : sample * 32767); // Scale to 16-bit signed int
            view.setInt16(pos, sample, true);
            pos += 2;
        }
        offset++;
    }

    return new Blob([view], { type: 'audio/wav' });
}


// Applies a selected audio effect to an audio blob using the Web Audio API.
export async function applyEffect(
    audioBlob: Blob,
    preset: EffectPreset
): Promise<Blob> {
    if (preset === EffectPreset.None) {
        return audioBlob;
    }

    // Use a temporary AudioContext to decode the data
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const decodedBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();

    const PITCH_UP_RATE = 1.25;
    const PITCH_DOWN_RATE = 0.8;

    let renderLength = decodedBuffer.length;
    if (preset === EffectPreset.PitchShiftUp) {
        renderLength = Math.ceil(decodedBuffer.length / PITCH_UP_RATE);
    } else if (preset === EffectPreset.PitchShiftDown) {
        renderLength = Math.ceil(decodedBuffer.length / PITCH_DOWN_RATE);
    }


    // Use an OfflineAudioContext for processing to get a final buffer
    const offlineContext = new OfflineAudioContext(
        decodedBuffer.numberOfChannels,
        renderLength,
        decodedBuffer.sampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = decodedBuffer;
    
    let lastNode: AudioNode = source;

    // Setup audio graph based on the selected preset
    switch (preset) {
        case EffectPreset.RadioBooth: {
            const convolver = offlineContext.createConvolver();
            const sampleRate = offlineContext.sampleRate;
            const duration = 0.4;
            const decay = 1.5;
            const length = sampleRate * duration;
            const impulse = offlineContext.createBuffer(2, length, sampleRate);
            for (let channel = 0; channel < 2; channel++) {
                const impulseChannel = impulse.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    impulseChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
                }
            }
            convolver.buffer = impulse;
            lastNode.connect(convolver);
            lastNode = convolver;
            break;
        }
        case EffectPreset.ConcertHall: {
            const convolver = offlineContext.createConvolver();
            const sampleRate = offlineContext.sampleRate;
            const duration = 2.0;
            const decay = 2.0;
            const length = sampleRate * duration;
            const impulse = offlineContext.createBuffer(2, length, sampleRate);
            for (let channel = 0; channel < 2; channel++) {
                const impulseChannel = impulse.getChannelData(channel);
                for (let i = 0; i < length; i++) {
                    impulseChannel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
                }
            }
            convolver.buffer = impulse;
            lastNode.connect(convolver);
            lastNode = convolver;
            break;
        }
        case EffectPreset.CosmicDelay: {
            const delay = offlineContext.createDelay(1.0);
            delay.delayTime.value = 0.5;
            const feedback = offlineContext.createGain();
            feedback.gain.value = 0.4;
            
            lastNode.connect(delay);
            delay.connect(feedback);
            feedback.connect(delay);
            
            // Connect both dry and wet signals to destination
            lastNode.connect(offlineContext.destination);
            delay.connect(offlineContext.destination);
            lastNode = null; // Signal path manually handled
            break;
        }
        case EffectPreset.Telephone: {
            const lowpass = offlineContext.createBiquadFilter();
            lowpass.type = "lowpass";
            lowpass.frequency.value = 3500;
            const highpass = offlineContext.createBiquadFilter();
            highpass.type = "highpass";
            highpass.frequency.value = 300;
            
            lastNode.connect(highpass);
            highpass.connect(lowpass);
            lastNode = lowpass;
            break;
        }
        case EffectPreset.RobotVoice: {
            const carrier = offlineContext.createOscillator();
            carrier.type = 'sine';
            carrier.frequency.value = 50; // Classic sci-fi robot frequency

            const modulator = offlineContext.createGain();
            modulator.gain.value = 1; // This will be controlled by the carrier

            // Use the carrier oscillator's output to control the gain of the modulator
            carrier.connect(modulator.gain);
            
            // Connect the audio source into the modulator
            lastNode.connect(modulator);

            // The output of the modulator is our processed signal
            lastNode = modulator;

            carrier.start(0);
            break;
        }
        case EffectPreset.PitchShiftUp: {
            source.playbackRate.value = PITCH_UP_RATE;
            break;
        }
        case EffectPreset.PitchShiftDown: {
            source.playbackRate.value = PITCH_DOWN_RATE;
            break;
        }
    }
    
    if (lastNode) {
        lastNode.connect(offlineContext.destination);
    }
    source.start(0);

    const renderedBuffer = await offlineContext.startRendering();
    return audioBufferToWavBlob(renderedBuffer);
}

export async function mixAudio(
    voiceBlob: Blob,
    backgroundTrack?: { blob: Blob; volume: number },
    sfxToApply?: { blob: Blob; volume: number; timing: 'start' | 'middle' | 'end' }[],
    vocalDropsToApply?: { blob: Blob; volume: number; timing: 'start' | 'middle' | 'end' }[]
): Promise<Blob> {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Decode voice first to get duration for the offline context
    const voiceBuffer = await audioContext.decodeAudioData(await voiceBlob.arrayBuffer());

    const offlineContext = new OfflineAudioContext(
        voiceBuffer.numberOfChannels,
        voiceBuffer.length,
        voiceBuffer.sampleRate
    );

    // Voice source
    const voiceSource = offlineContext.createBufferSource();
    voiceSource.buffer = voiceBuffer;
    voiceSource.connect(offlineContext.destination);

    // Background source
    if (backgroundTrack) {
        try {
            const backgroundBuffer = await audioContext.decodeAudioData(await backgroundTrack.blob.arrayBuffer());
            const backgroundSource = offlineContext.createBufferSource();
            backgroundSource.buffer = backgroundBuffer;
            backgroundSource.loop = true;
            const backgroundGain = offlineContext.createGain();
            backgroundGain.gain.value = backgroundTrack.volume;
            backgroundSource.connect(backgroundGain);
            backgroundGain.connect(offlineContext.destination);
            backgroundSource.start(0);
        } catch (e) {
            console.error("Could not process background track:", e);
            // Fail gracefully and continue mixing without it
        }
    }
    
    // SFX sources
    if (sfxToApply) {
        for (const sfx of sfxToApply) {
             try {
                const sfxBuffer = await audioContext.decodeAudioData(await sfx.blob.arrayBuffer());
                const sfxSource = offlineContext.createBufferSource();
                sfxSource.buffer = sfxBuffer;
                
                const sfxGain = offlineContext.createGain();
                sfxGain.gain.value = sfx.volume;
                
                sfxSource.connect(sfxGain);
                sfxGain.connect(offlineContext.destination);
                
                let startTime = 0;
                switch (sfx.timing) {
                    case 'start':
                        startTime = 0;
                        break;
                    case 'middle':
                        startTime = (voiceBuffer.duration / 2) - (sfxBuffer.duration / 2);
                        break;
                    case 'end':
                        startTime = voiceBuffer.duration - sfxBuffer.duration;
                        break;
                }
                // Ensure start time is not negative
                sfxSource.start(Math.max(0, startTime));
             } catch (e) {
                 console.error(`Could not process SFX:`, e);
             }
        }
    }

     // Vocal Drop sources
    if (vocalDropsToApply) {
        for (const drop of vocalDropsToApply) {
             try {
                const dropBuffer = await audioContext.decodeAudioData(await drop.blob.arrayBuffer());
                const dropSource = offlineContext.createBufferSource();
                dropSource.buffer = dropBuffer;
                
                const dropGain = offlineContext.createGain();
                dropGain.gain.value = drop.volume;
                
                dropSource.connect(dropGain);
                dropGain.connect(offlineContext.destination);
                
                let startTime = 0;
                switch (drop.timing) {
                    case 'start':
                        startTime = 0;
                        break;
                    case 'middle':
                        startTime = (voiceBuffer.duration / 2) - (dropBuffer.duration / 2);
                        break;
                    case 'end':
                        startTime = voiceBuffer.duration - dropBuffer.duration;
                        break;
                }
                // Ensure start time is not negative
                dropSource.start(Math.max(0, startTime));
             } catch (e) {
                 console.error(`Could not process Vocal Drop:`, e);
             }
        }
    }

    // Start voice source
    voiceSource.start(0);
    
    const renderedBuffer = await offlineContext.startRendering();
    await audioContext.close();

    return audioBufferToWavBlob(renderedBuffer);
}