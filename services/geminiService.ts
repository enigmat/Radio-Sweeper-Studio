
import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { Voice, DJ } from "../types";

export async function generateScriptSuggestion(stationStyle: string, dj: DJ): Promise<string> {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const djInstruction = dj !== DJ.None 
        ? `Your task is to write a script for a radio DJ with a '${dj}' persona.` 
        : 'Your task is to write a script for a standard radio announcer.';

    const prompt = `You are a creative copywriter for a radio station. ${djInstruction}
The station's name or style is: "${stationStyle || 'any popular radio station'}".
The script should be one or two sentences long. Be creative and energetic.
Examples: 
- "The hits just keep on coming, on Gemini FM!"
- "You're locked in to the number one for hip-hop and R&B."
- "Your home for classic rock, all day long."`;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });
        return response.text.trim();
    } catch (error) {
        console.error("Error generating script suggestion:", error);
        throw new Error("Failed to generate script suggestion.");
    }
}


// Helper to decode Base64 strings to Uint8Array
function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper to create a WAV file Blob from raw PCM data
function createWavBlob(pcmData: Uint8Array, sampleRate: number, numChannels: number, bitsPerSample: number): Blob {
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const fileSize = 36 + dataSize;
    
    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    // RIFF header
    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, fileSize, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"

    // fmt chunk
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Subchunk1Size for PCM
    view.setUint16(20, 1, true); // AudioFormat 1 for PCM
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true);

    return new Blob([view.buffer, pcmData], { type: 'audio/wav' });
}

async function generateSingleTake(script: string, voice: Voice, deliveryStyle: string, ai: GoogleGenAI, dj: DJ): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const audioChunks: Uint8Array[] = [];
        
        const djPersonaInstruction = dj !== DJ.None ? ` with a '${dj}' persona` : '';
        const systemInstruction = `You are a professional radio announcer${djPersonaInstruction}. Read the provided script with a ${deliveryStyle || 'standard'} style, suitable for a radio sweeper.`;

        const sessionPromise = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    sessionPromise.then((session) => {
                        session.sendRealtimeInput({ text: script });
                    }).catch(reject);
                },
                onmessage: (message: LiveServerMessage) => {
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio) {
                        audioChunks.push(decode(base64Audio));
                    }

                    if (message.serverContent?.turnComplete) {
                        sessionPromise.then(session => session.close()).catch(console.error);
                        
                        if (audioChunks.length === 0) {
                           reject(new Error("No audio data received from the API."));
                           return;
                        }

                        const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                        const fullPcmData = new Uint8Array(totalLength);
                        
                        let offset = 0;
                        for (const chunk of audioChunks) {
                            fullPcmData.set(chunk, offset);
                            offset += chunk.length;
                        }

                        const wavBlob = createWavBlob(fullPcmData, 24000, 1, 16);
                        resolve(wavBlob);
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Session error:', e);
                    reject(new Error(`Session error: ${e.message}`));
                },
                onclose: (e: CloseEvent) => {
                   // Session closed, normal completion
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
                },
                systemInstruction: systemInstruction,
            },
        });
    });
}


export async function generateSweeper(script: string, voice: Voice, deliveryStyle: string, numberOfTakes: number, dj: DJ): Promise<Blob[]> {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const generationPromises: Promise<Blob>[] = [];

    for (let i = 0; i < numberOfTakes; i++) {
        generationPromises.push(generateSingleTake(script, voice, deliveryStyle, ai, dj));
    }

    return Promise.all(generationPromises);
}

export async function generateVisualizerVideo(script: string): Promise<string> {
    if (!process.env.API_KEY) {
        throw new Error("API_KEY environment variable not set.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const prompt = `Create a short, abstract, energetic motion graphics video visualizer. The video should be visually exciting and suitable for a modern radio station's branding. It should sync with the energy of a radio sweeper that says: "${script}". Do not include any text in the video. Focus on dynamic shapes, light effects, and fast-paced transitions.`;

    try {
        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: prompt,
            config: {
                numberOfVideos: 1
            }
        });

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
            operation = await ai.operations.getVideosOperation({ operation: operation });
        }

        if (operation.error) {
            throw new Error(`Video generation failed: ${operation.error.message}`);
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) {
            throw new Error("Video generation completed but no download link was found.");
        }

        const response = await fetch(`${downloadLink}&key=${process.env.API_KEY}`);
        
        if (!response.ok) {
            throw new Error(`Failed to download video file: ${response.statusText}`);
        }

        const videoBlob = await response.blob();
        return URL.createObjectURL(videoBlob);

    } catch (error) {
        console.error("Error generating visualizer video:", error);
        if (error instanceof Error) {
            throw new Error(`Failed to generate video: ${error.message}`);
        }
        throw new Error("An unknown error occurred during video generation.");
    }
}
