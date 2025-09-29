

import React, { useState, useEffect, useCallback } from 'react';
import { generateSweeper, generateScriptSuggestion, generateSingleTake } from './services/geminiService';
import { applyEffect, mixAudio } from './services/audioEffectsService';
import { getTrackBlob } from './services/backgroundTrackService';
import { getSfxBlob } from './services/sfxService';
import { EffectPreset, BackgroundTrackPreset, DJ, SfxPreset, AppliedSfx, VOCAL_PROFILES, VocalDrop, AppliedVocalDrop } from './types';
import { Spinner } from './components/Spinner';
import { AddIcon, DownloadIcon, MusicNoteIcon, RemoveIcon, SoundWaveIcon, SparklesIcon, UploadIcon, SfxIcon, MicrophoneIcon } from './components/Icons';
import AudioVisualizer from './components/AudioVisualizer';

interface TakeResult {
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
    appliedVocalDrops: AppliedVocalDrop[];
}

interface GenerationResult {
    script: string;
    takes: TakeResult[];
}

const App: React.FC = () => {
  const [scripts, setScripts] = useState<string[]>(["You're tuned into the number one hit music station... Gemini FM!"]);
  const [stationStyle, setStationStyle] = useState<string>('Top 40 Hits');
  const [selectedProfileId, setSelectedProfileId] = useState<string>(VOCAL_PROFILES[0].id);
  const [selectedDJ, setSelectedDJ] = useState<DJ>(DJ.None);
  const [numberOfTakes, setNumberOfTakes] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generationResults, setGenerationResults] = useState<GenerationResult[]>([]);
  const [generationProgress, setGenerationProgress] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState<boolean>(false);
  const [vocalDrops, setVocalDrops] = useState<VocalDrop[]>([]);
  const [newDropScript, setNewDropScript] = useState<string>('Gemini FM!');
  const [newDropProfileId, setNewDropProfileId] = useState<string>(VOCAL_PROFILES[2].id);


  useEffect(() => {
    if (!process.env.API_KEY) {
      setApiKeyMissing(true);
    }
    
    return () => {
      generationResults.forEach(result => {
        result.takes.forEach(take => {
            URL.revokeObjectURL(take.originalUrl);
            URL.revokeObjectURL(take.processedUrl);
            if (take.processedUrl !== take.finalUrl) {
                URL.revokeObjectURL(take.finalUrl);
            }
        });
      });
      vocalDrops.forEach(drop => {
        if(drop.url) URL.revokeObjectURL(drop.url);
      });
    };
  }, [generationResults, vocalDrops]);
  
  const processAudioForTake = useCallback(async (take: TakeResult): Promise<Partial<TakeResult>> => {
      try {
        // Step 1: Apply vocal effect
        const processedBlob = await applyEffect(take.originalBlob, take.selectedEffect);

        // Step 2: Prepare background track for mixing
        let backgroundTrack: { blob: Blob; volume: number } | undefined = undefined;
        if (take.selectedTrack === 'custom' && take.customTrackFile) {
            backgroundTrack = { blob: take.customTrackFile, volume: take.mixVolume };
        } else if (take.selectedTrack !== BackgroundTrackPreset.None && take.selectedTrack !== 'custom') {
            const blob = await getTrackBlob(take.selectedTrack as BackgroundTrackPreset);
            backgroundTrack = { blob, volume: take.mixVolume };
        }
  
        // Step 3: Prepare SFX for mixing
        const sfxToApply = await Promise.all(
            take.appliedSfx
                .filter(sfx => sfx.preset !== SfxPreset.None)
                .map(async (sfx) => {
                    const blob = await getSfxBlob(sfx.preset);
                    return { blob, volume: sfx.volume, timing: sfx.timing };
                })
        );
        
        // Step 4: Prepare Vocal Drops for mixing
        const vocalDropsToApply = take.appliedVocalDrops
            .map(appliedDrop => {
                const drop = vocalDrops.find(d => d.id === appliedDrop.dropId);
                if (drop && drop.blob) {
                    return { blob: drop.blob, volume: appliedDrop.volume, timing: appliedDrop.timing };
                }
                return null;
            })
            .filter((d): d is { blob: Blob; volume: number; timing: 'start' | 'middle' | 'end'; } => d !== null);


        // Step 5: Mix everything together
        const finalBlob = await mixAudio(processedBlob, backgroundTrack, sfxToApply, vocalDropsToApply);
        
        return { processedBlob, finalBlob };

      } catch (err) {
          console.error("Failed to process audio:", err);
          setError("Failed to apply audio changes.");
          return {};
      }
  }, [vocalDrops]);

  const updateTakeState = useCallback(async (resultIndex: number, takeIndex: number, newTakeSettings: Partial<Omit<TakeResult, 'appliedSfx' | 'appliedVocalDrops'>> & { appliedSfx?: AppliedSfx[], appliedVocalDrops?: AppliedVocalDrop[] }) => {
    const newResults = [...generationResults];
    const take = newResults[resultIndex].takes[takeIndex];

    // Update settings and set processing state
    Object.assign(take, { ...newTakeSettings, isProcessing: true });
    setGenerationResults(newResults);

    const processedResult = await processAudioForTake(take);

    // Final state update after processing is complete
    setGenerationResults(prevResults => {
        const finalResults = [...prevResults];
        const finalTake = finalResults[resultIndex].takes[takeIndex];
        
        // Revoke old URLs before creating new ones
        if (finalTake.processedUrl !== finalTake.originalUrl) URL.revokeObjectURL(finalTake.processedUrl);
        if (finalTake.finalUrl !== finalTake.processedUrl) URL.revokeObjectURL(finalTake.finalUrl);

        if (processedResult.processedBlob) {
            finalTake.processedBlob = processedResult.processedBlob;
            finalTake.processedUrl = URL.createObjectURL(processedResult.processedBlob);
        }
        if (processedResult.finalBlob) {
            finalTake.finalBlob = processedResult.finalBlob;
            finalTake.finalUrl = URL.createObjectURL(processedResult.finalBlob);
        }
        finalTake.isProcessing = false;

        return finalResults;
    });
  }, [generationResults, processAudioForTake]);

  const handleSuggestScript = useCallback(async () => {
    setIsGeneratingScript(true);
    setError(null);
    try {
        const suggestion = await generateScriptSuggestion(stationStyle, selectedDJ);
        setScripts(prev => [...prev, suggestion]);
    } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to suggest a script.");
    } finally {
        setIsGeneratingScript(false);
    }
  }, [stationStyle, selectedDJ]);
  
  const handleScriptChange = (index: number, value: string) => {
    const newScripts = [...scripts];
    newScripts[index] = value;
    setScripts(newScripts);
  };

  const addScript = () => {
    setScripts([...scripts, ""]);
  };

  const removeScript = (index: number) => {
    if (scripts.length > 1) {
        setScripts(scripts.filter((_, i) => i !== index));
    }
  };

  const handleGenerateDrop = useCallback(async () => {
    const script = newDropScript.trim();
    if (!script) {
        setError("Vocal drop script cannot be empty.");
        return;
    }
    const profile = VOCAL_PROFILES.find(p => p.id === newDropProfileId);
    if (!profile) {
        setError("Invalid vocal profile selected for drop.");
        return;
    }

    const dropId = crypto.randomUUID();
    const newDrop: VocalDrop = {
        id: dropId,
        script,
        vocalProfileId: newDropProfileId,
        blob: null,
        url: null,
        isGenerating: true,
    };
    setVocalDrops(prev => [newDrop, ...prev]);

    try {
        const blob = await generateSingleTake(script, profile.voice, profile.deliveryStyle, DJ.None);
        const url = URL.createObjectURL(blob);
        setVocalDrops(prev => prev.map(d => d.id === dropId ? { ...d, blob, url, isGenerating: false } : d));
    } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate vocal drop.");
        setVocalDrops(prev => prev.filter(d => d.id !== dropId));
    }
  }, [newDropScript, newDropProfileId]);

  const removeDrop = (id: string) => {
    const dropToRemove = vocalDrops.find(d => d.id === id);
    if (dropToRemove?.url) {
        URL.revokeObjectURL(dropToRemove.url);
    }
    setVocalDrops(prev => prev.filter(d => d.id !== id));
  }

  const handleGenerateClick = useCallback(async () => {
    const validScripts = scripts.filter(s => s.trim() !== '');
    if (validScripts.length === 0) {
      setError("Please enter at least one script.");
      return;
    }
    
    const selectedProfile = VOCAL_PROFILES.find(p => p.id === selectedProfileId);
    if (!selectedProfile) {
        setError("Please select a valid vocal profile.");
        return;
    }

    setIsLoading(true);
    setError(null);
    if (generationResults.length) {
       generationResults.forEach(result => result.takes.forEach(take => {
         URL.revokeObjectURL(take.originalUrl);
         URL.revokeObjectURL(take.processedUrl);
         if(take.processedUrl !== take.finalUrl) URL.revokeObjectURL(take.finalUrl);
       }));
      setGenerationResults([]);
    }

    try {
      const allResults: GenerationResult[] = [];
      for (let i = 0; i < validScripts.length; i++) {
        const script = validScripts[i];
        setGenerationProgress(`Generating ${i + 1} of ${validScripts.length}: "${script.substring(0, 20)}..."`);
        const audioBlobs = await generateSweeper(script, selectedProfile.voice, selectedProfile.deliveryStyle, numberOfTakes, selectedDJ);
        
        const takes: TakeResult[] = audioBlobs.map(blob => {
          const url = URL.createObjectURL(blob);
          return {
            originalBlob: blob,
            originalUrl: url,
            processedBlob: blob,
            processedUrl: url,
            finalBlob: blob,
            finalUrl: url,
            isProcessing: false,
            selectedEffect: EffectPreset.None,
            selectedTrack: BackgroundTrackPreset.None,
            customTrackFile: null,
            mixVolume: 0.5,
            appliedSfx: [],
            appliedVocalDrops: [],
          };
        });

        allResults.push({ script, takes });
        setGenerationResults([...allResults]);
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "An unknown error occurred during generation.");
    } finally {
      setIsLoading(false);
      setGenerationProgress(null);
    }
  }, [scripts, selectedProfileId, numberOfTakes, generationResults, selectedDJ]);

  const anyLoading = isLoading || isGeneratingScript || vocalDrops.some(d => d.isGenerating);
  const totalGenerations = scripts.filter(s => s.trim() !== '').length * numberOfTakes;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900/40 to-gray-900 text-gray-200 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="font-orbitron text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">
            Radio Sweeper Studio
          </h1>
          <p className="mt-2 text-gray-400">AI-Powered Audio Generation, Effects & Mixing</p>
        </header>

        {apiKeyMissing && (
          <div className="bg-red-800/50 border border-red-600 text-red-200 px-4 py-3 rounded-lg relative mb-6" role="alert">
            <strong className="font-bold">API Key Missing!</strong>
            <span className="block sm:inline"> Please set the API_KEY environment variable to use this application.</span>
          </div>
        )}

        <main className="bg-gray-800/50 rounded-xl shadow-2xl shadow-purple-500/10 backdrop-blur-sm border border-gray-700/50">
          <div className="p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Input Section */}
            <div className="space-y-6">
               <div>
                <label htmlFor="stationStyle" className="block text-sm font-medium text-cyan-400 mb-2">Station Style (for script ideas)</label>
                <input
                  type="text"
                  id="stationStyle"
                  className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-200 p-3 transition duration-200"
                  placeholder="e.g., Classic Rock, Late Night Jazz"
                  value={stationStyle}
                  onChange={(e) => setStationStyle(e.target.value)}
                  disabled={anyLoading || apiKeyMissing}
                />
              </div>
              <div>
                 <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-cyan-400">Sweeper Scripts</label>
                    <button
                        onClick={handleSuggestScript}
                        disabled={anyLoading || apiKeyMissing}
                        className="inline-flex items-center text-sm text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Suggest a new script and add it to the list"
                    >
                        {isGeneratingScript ? <Spinner size="h-4 w-4" /> : <SparklesIcon className="h-4 w-4" />}
                        <span className="ml-2">{isGeneratingScript ? 'Thinking...' : 'Suggest Script'}</span>
                    </button>
                </div>
                <div className="space-y-3">
                    {scripts.map((script, index) => (
                        <div key={index} className="flex items-start space-x-2">
                            <textarea
                              rows={2}
                              className="flex-grow bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-200 p-3 transition duration-200"
                              placeholder={`Script ${index + 1}...`}
                              value={script}
                              onChange={(e) => handleScriptChange(index, e.target.value)}
                              disabled={anyLoading || apiKeyMissing}
                            />
                            <button 
                                onClick={() => removeScript(index)}
                                disabled={scripts.length <= 1 || anyLoading || apiKeyMissing}
                                className="p-2 text-gray-500 hover:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors mt-2"
                                title="Remove script"
                            >
                                <RemoveIcon />
                            </button>
                        </div>
                    ))}
                </div>
                <button
                    onClick={addScript}
                    disabled={anyLoading || apiKeyMissing}
                    className="mt-3 inline-flex items-center text-sm text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                    <AddIcon />
                    <span className="ml-2">Add Script</span>
                </button>
              </div>

              {/* Vocal Drops Library */}
              <div className="space-y-4 p-4 bg-gray-900/30 rounded-lg border border-gray-700/50">
                  <h3 className="text-sm font-medium text-cyan-400 flex items-center"><MicrophoneIcon className="mr-2 h-5 w-5"/> Vocal Drops Library</h3>
                  <div className="space-y-2">
                    <input
                        type="text"
                        placeholder="Drop script (e.g., DJ Name)"
                        value={newDropScript}
                        onChange={(e) => setNewDropScript(e.target.value)}
                        className="w-full bg-gray-900/70 border border-gray-600 rounded-md p-2 text-sm"
                        disabled={anyLoading || apiKeyMissing}
                    />
                    <div className="flex gap-2">
                        <select
                            value={newDropProfileId}
                            onChange={(e) => setNewDropProfileId(e.target.value)}
                            className="flex-grow bg-gray-900/70 border border-gray-600 rounded-md p-2 text-sm"
                            disabled={anyLoading || apiKeyMissing}
                        >
                            {VOCAL_PROFILES.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <button onClick={handleGenerateDrop} disabled={anyLoading || apiKeyMissing || !newDropScript.trim()} className="px-3 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-md text-sm font-semibold disabled:opacity-50 flex items-center justify-center">
                            <AddIcon/> <span className="ml-1">Generate Drop</span>
                        </button>
                    </div>
                  </div>
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                    {vocalDrops.map(drop => (
                        <div key={drop.id} className="flex items-center justify-between p-2 bg-gray-800/50 rounded-md">
                            <span className="text-sm italic flex-shrink-0 mr-2">"{drop.script}"</span>
                            <div className="flex items-center space-x-2">
                               {drop.isGenerating && <Spinner size="h-4 w-4"/>}
                               {drop.url && <audio src={drop.url} controls className="h-8 w-48"/>}
                               <button onClick={() => removeDrop(drop.id)} className="text-gray-500 hover:text-red-400" disabled={anyLoading}>
                                 <RemoveIcon className="h-5 w-5"/>
                               </button>
                            </div>
                        </div>
                    ))}
                  </div>
              </div>


              <div className="grid grid-cols-2 gap-4">
                 <div>
                  <label htmlFor="djPersona" className="block text-sm font-medium text-cyan-400 mb-2">DJ Persona</label>
                  <select
                    id="djPersona"
                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-200 p-3 transition duration-200"
                    value={selectedDJ}
                    onChange={(e) => setSelectedDJ(e.target.value as DJ)}
                    disabled={anyLoading || apiKeyMissing}
                  >
                    {Object.values(DJ).map((dj) => (
                      <option key={dj} value={dj}>{dj}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="vocalProfile" className="block text-sm font-medium text-cyan-400 mb-2">Vocal Profile</label>
                  <select
                    id="vocalProfile"
                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-200 p-3 transition duration-200"
                    value={selectedProfileId}
                    onChange={(e) => setSelectedProfileId(e.target.value)}
                    disabled={anyLoading || apiKeyMissing}
                  >
                    {VOCAL_PROFILES.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </div>
                 <div>
                  <label htmlFor="takes" className="block text-sm font-medium text-cyan-400 mb-2">Takes Per Script</label>
                  <select
                    id="takes"
                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-200 p-3 transition duration-200"
                    value={numberOfTakes}
                    onChange={(e) => setNumberOfTakes(Number(e.target.value))}
                    disabled={anyLoading || apiKeyMissing}
                  >
                    <option value={1}>1</option>
                    <option value={2}>2</option>
                    <option value={3}>3</option>
                  </select>
                </div>
              </div>
              <button
                onClick={handleGenerateClick}
                disabled={anyLoading || apiKeyMissing || totalGenerations === 0}
                className="w-full font-orbitron inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-lg text-white bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
              >
                {isLoading ? <Spinner /> : <SoundWaveIcon />}
                <span className="ml-3">{isLoading ? 'Generating...' : `Generate ${totalGenerations} Sweeper(s)`}</span>
              </button>
            </div>

            {/* Output Section */}
            <div className="bg-gray-900/50 rounded-lg p-6 flex flex-col justify-start border border-gray-700/50 min-h-[300px] max-h-[80vh] overflow-y-auto space-y-4">
              {isLoading && (
                 <div className="text-center text-gray-400 p-4">
                    <Spinner size="h-8 w-8" />
                    <p className="mt-4 animate-pulse">Generating audio...</p>
                    {generationProgress && <p className="text-sm mt-1">{generationProgress}</p>}
                 </div>
              )}
              {error && (
                <div className="text-center text-red-400">
                  <p className="font-bold">Operation Failed</p>
                  <p className="text-sm mt-1">{error}</p>
                </div>
              )}
              {!anyLoading && !error && generationResults.length > 0 && (
                <div className="w-full animate-fade-in space-y-6">
                    <h3 className="text-lg font-semibold text-cyan-400 text-center">Your Sweepers are Ready!</h3>
                    {generationResults.map((result, resultIndex) => (
                      <div key={resultIndex} className="p-4 bg-gray-800/60 rounded-lg border border-gray-700">
                        <p className="text-sm font-semibold text-gray-300 mb-3 italic border-l-2 border-cyan-500 pl-2">"{result.script}"</p>
                        <div className="space-y-4">
                        {result.takes.map((take, takeIndex) => (
                          <div key={take.originalUrl} className="p-3 bg-gray-900/50 rounded-md border border-gray-700/70 relative">
                             {take.isProcessing && <div className="absolute inset-0 bg-gray-900/70 flex items-center justify-center z-10 rounded-md"><Spinner /></div>}
                            <p className="text-xs font-medium text-gray-400 mb-2">Take {takeIndex + 1}</p>
                            <div className="mb-3">
                                <AudioVisualizer src={take.finalUrl} />
                            </div>
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3 p-3 bg-gray-900/40 rounded-md border border-gray-700/50">
                                     <label className="block text-xs font-medium text-cyan-400">Vocal Effect</label>
                                     <div className="flex items-center space-x-2">
                                        <SparklesIcon className="text-cyan-500 h-5 w-5"/>
                                        <select
                                            id={`effect-${resultIndex}-${takeIndex}`}
                                            className="flex-grow bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-200 p-2 text-sm transition duration-200"
                                            value={take.selectedEffect}
                                            onChange={(e) => updateTakeState(resultIndex, takeIndex, { selectedEffect: e.target.value as EffectPreset })}
                                            disabled={take.isProcessing}
                                        >
                                            {Object.values(EffectPreset).map((preset) => (
                                                <option key={preset} value={preset}>{preset}</option>
                                            ))}
                                        </select>
                                     </div>
                                </div>
                                <div className="space-y-3 p-3 bg-gray-900/40 rounded-md border border-gray-700/50">
                                    <label className="block text-xs font-medium text-purple-400">Background Track</label>
                                    <div className="flex items-center space-x-2">
                                        <MusicNoteIcon className="text-purple-400 h-5 w-5" />
                                         <select
                                            id={`track-${resultIndex}-${takeIndex}`}
                                            className="flex-grow bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-gray-200 p-2 text-sm transition duration-200"
                                            value={take.selectedTrack}
                                            onChange={(e) => updateTakeState(resultIndex, takeIndex, { selectedTrack: e.target.value as BackgroundTrackPreset | 'custom', customTrackFile: null })}
                                            disabled={take.isProcessing}
                                        >
                                            {Object.values(BackgroundTrackPreset).map((preset) => (
                                                <option key={preset} value={preset}>{preset}</option>
                                            ))}
                                            <option value="custom">Upload Custom</option>
                                        </select>
                                    </div>
                                    {take.selectedTrack === 'custom' && (
                                        <div className="relative">
                                            <input
                                                type="file"
                                                id={`upload-${resultIndex}-${takeIndex}`}
                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                accept="audio/*"
                                                onChange={(e) => e.target.files && updateTakeState(resultIndex, takeIndex, { customTrackFile: e.target.files[0] })}
                                                disabled={take.isProcessing}
                                            />
                                            <label htmlFor={`upload-${resultIndex}-${takeIndex}`} className="flex items-center justify-center space-x-2 w-full text-center px-2 py-1 border border-gray-600 text-xs rounded-md text-gray-400 hover:bg-gray-700 hover:text-white cursor-pointer transition-colors">
                                                <UploadIcon />
                                                <span>{take.customTrackFile ? take.customTrackFile.name.substring(0, 20) : 'Choose file...'}</span>
                                            </label>
                                        </div>
                                    )}
                                    <div className="flex items-center space-x-2">
                                        <label htmlFor={`volume-${resultIndex}-${takeIndex}`} className="text-xs text-gray-400">Vol:</label>
                                        <input
                                            id={`volume-${resultIndex}-${takeIndex}`}
                                            type="range"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            value={take.mixVolume}
                                            onChange={(e) => updateTakeState(resultIndex, takeIndex, { mixVolume: Number(e.target.value) })}
                                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            disabled={take.isProcessing || take.selectedTrack === BackgroundTrackPreset.None}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-3 p-3 bg-gray-900/40 rounded-md border border-gray-700/50">
                                    <div className="flex justify-between items-center">
                                      <label className="block text-xs font-medium text-yellow-400">Sound Effects</label>
                                      <button 
                                        onClick={() => {
                                            const newSfx: AppliedSfx = { id: crypto.randomUUID(), preset: SfxPreset.LaserZap, volume: 0.7, timing: 'start' };
                                            updateTakeState(resultIndex, takeIndex, { appliedSfx: [...take.appliedSfx, newSfx] })
                                        }}
                                        disabled={take.isProcessing}
                                        className="text-yellow-400 hover:text-yellow-300 disabled:opacity-50"
                                        title="Add Sound Effect"
                                      >
                                        <AddIcon />
                                      </button>
                                    </div>
                                    <div className="space-y-2 max-h-24 overflow-y-auto">
                                      {take.appliedSfx.map((sfx) => (
                                        <div key={sfx.id} className="p-2 bg-gray-800/50 rounded border border-gray-700 space-y-2">
                                          <div className="flex items-center space-x-2">
                                            <SfxIcon className="text-yellow-400 h-5 w-5 flex-shrink-0" />
                                            <select
                                                className="flex-grow bg-gray-900/70 border border-gray-600 rounded-md focus:ring-yellow-500 focus:border-yellow-500 text-gray-200 p-1 text-xs"
                                                value={sfx.preset}
                                                disabled={take.isProcessing}
                                                onChange={(e) => {
                                                    const newAppliedSfx = take.appliedSfx.map(item => 
                                                        item.id === sfx.id ? { ...item, preset: e.target.value as SfxPreset } : item
                                                    );
                                                    updateTakeState(resultIndex, takeIndex, { appliedSfx: newAppliedSfx });
                                                }}
                                            >
                                                {Object.values(SfxPreset).map((preset) => <option key={preset} value={preset}>{preset}</option>)}
                                            </select>
                                            <button onClick={() => {
                                                const newAppliedSfx = take.appliedSfx.filter(item => item.id !== sfx.id);
                                                updateTakeState(resultIndex, takeIndex, { appliedSfx: newAppliedSfx });
                                            }}
                                            className="text-gray-500 hover:text-red-400"
                                            disabled={take.isProcessing}
                                            >
                                              <RemoveIcon className="h-5 w-5"/>
                                            </button>
                                          </div>
                                           <div className="flex items-center space-x-2">
                                                <select
                                                    className="flex-grow bg-gray-900/70 border border-gray-600 rounded-md focus:ring-yellow-500 focus:border-yellow-500 text-gray-200 p-1 text-xs"
                                                    value={sfx.timing}
                                                    disabled={take.isProcessing}
                                                    onChange={(e) => {
                                                        const newAppliedSfx = take.appliedSfx.map(item => 
                                                            item.id === sfx.id ? { ...item, timing: e.target.value as 'start' | 'middle' | 'end' } : item
                                                        );
                                                        updateTakeState(resultIndex, takeIndex, { appliedSfx: newAppliedSfx });
                                                    }}
                                                >
                                                    <option value="start">Start</option>
                                                    <option value="middle">Middle</option>
                                                    <option value="end">End</option>
                                                </select>
                                                <input
                                                    type="range"
                                                    min="0" max="1" step="0.05"
                                                    value={sfx.volume}
                                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                                                    disabled={take.isProcessing || sfx.preset === SfxPreset.None}
                                                    onChange={(e) => {
                                                        const newAppliedSfx = take.appliedSfx.map(item => 
                                                            item.id === sfx.id ? { ...item, volume: Number(e.target.value) } : item
                                                        );
                                                        updateTakeState(resultIndex, takeIndex, { appliedSfx: newAppliedSfx });
                                                    }}
                                                />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                </div>
                                 <div className="space-y-3 p-3 bg-gray-900/40 rounded-md border border-gray-700/50">
                                    <div className="flex justify-between items-center">
                                      <label className="block text-xs font-medium text-blue-400">Vocal Drops</label>
                                      <button 
                                        onClick={() => {
                                            const newDrop: AppliedVocalDrop = { id: crypto.randomUUID(), dropId: '', volume: 0.8, timing: 'end' };
                                            updateTakeState(resultIndex, takeIndex, { appliedVocalDrops: [...take.appliedVocalDrops, newDrop] })
                                        }}
                                        disabled={take.isProcessing || vocalDrops.length === 0}
                                        className="text-blue-400 hover:text-blue-300 disabled:opacity-50"
                                        title="Add Vocal Drop"
                                      >
                                        <AddIcon />
                                      </button>
                                    </div>
                                    <div className="space-y-2 max-h-24 overflow-y-auto">
                                      {take.appliedVocalDrops.map((drop) => (
                                        <div key={drop.id} className="p-2 bg-gray-800/50 rounded border border-gray-700 space-y-2">
                                          <div className="flex items-center space-x-2">
                                            <MicrophoneIcon className="text-blue-400 h-5 w-5 flex-shrink-0" />
                                            <select
                                                className="flex-grow bg-gray-900/70 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-200 p-1 text-xs"
                                                value={drop.dropId}
                                                disabled={take.isProcessing}
                                                onChange={(e) => {
                                                    const newAppliedDrops = take.appliedVocalDrops.map(item => 
                                                        item.id === drop.id ? { ...item, dropId: e.target.value } : item
                                                    );
                                                    updateTakeState(resultIndex, takeIndex, { appliedVocalDrops: newAppliedDrops });
                                                }}
                                            >
                                                <option value="">- Select Drop -</option>
                                                {vocalDrops.filter(d => d.blob).map((d) => <option key={d.id} value={d.id}>{d.script}</option>)}
                                            </select>
                                            <button onClick={() => {
                                                const newAppliedDrops = take.appliedVocalDrops.filter(item => item.id !== drop.id);
                                                updateTakeState(resultIndex, takeIndex, { appliedVocalDrops: newAppliedDrops });
                                            }}
                                            className="text-gray-500 hover:text-red-400"
                                            disabled={take.isProcessing}
                                            >
                                              <RemoveIcon className="h-5 w-5"/>
                                            </button>
                                          </div>
                                           <div className="flex items-center space-x-2">
                                                <select
                                                    className="flex-grow bg-gray-900/70 border border-gray-600 rounded-md focus:ring-blue-500 focus:border-blue-500 text-gray-200 p-1 text-xs"
                                                    value={drop.timing}
                                                    disabled={take.isProcessing}
                                                    onChange={(e) => {
                                                        const newAppliedDrops = take.appliedVocalDrops.map(item => 
                                                            item.id === drop.id ? { ...item, timing: e.target.value as 'start' | 'middle' | 'end' } : item
                                                        );
                                                        updateTakeState(resultIndex, takeIndex, { appliedVocalDrops: newAppliedDrops });
                                                    }}
                                                >
                                                    <option value="start">Start</option>
                                                    <option value="middle">Middle</option>
                                                    <option value="end">End</option>
                                                </select>
                                                <input
                                                    type="range"
                                                    min="0" max="1" step="0.05"
                                                    value={drop.volume}
                                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                    disabled={take.isProcessing || !drop.dropId}
                                                    onChange={(e) => {
                                                        const newAppliedDrops = take.appliedVocalDrops.map(item => 
                                                            item.id === drop.id ? { ...item, volume: Number(e.target.value) } : item
                                                        );
                                                        updateTakeState(resultIndex, takeIndex, { appliedVocalDrops: newAppliedDrops });
                                                    }}
                                                />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                </div>
                             </div>
                             <a
                                href={take.finalUrl}
                                download={`sweeper-${result.script.substring(0,10).replace(/ /g,'_')}-take-${takeIndex + 1}.wav`}
                                className="w-full font-orbitron mt-4 inline-flex items-center justify-center px-4 py-2 border border-cyan-500 text-sm font-medium rounded-md text-cyan-400 hover:bg-cyan-500 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-cyan-500 transition-all duration-300"
                            >
                                <DownloadIcon />
                                <span className="ml-2">Download Final Mix</span>
                            </a>
                          </div>
                        ))}
                        </div>
                      </div>
                    ))}
                </div>
              )}
               {!anyLoading && !error && generationResults.length === 0 && (
                <div className="text-center text-gray-500 pt-16">
                    <SoundWaveIcon className="mx-auto h-12 w-12" />
                    <p className="mt-4">Your generated audio will appear here.</p>
                </div>
               )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;