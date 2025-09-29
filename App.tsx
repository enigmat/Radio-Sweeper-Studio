
import React, { useState, useEffect, useCallback } from 'react';
import { generateSweeper, generateScriptSuggestion } from './services/geminiService';
import { applyEffect, mixAudio } from './services/audioEffectsService';
import { getTrackBlob } from './services/backgroundTrackService';
import { getSfxBlob } from './services/sfxService';
import { EffectPreset, Voice, BackgroundTrackPreset, DJ, SfxPreset, AppliedSfx } from './types';
import { Spinner } from './components/Spinner';
import { AddIcon, DownloadIcon, MusicNoteIcon, RemoveIcon, SoundWaveIcon, SparklesIcon, UploadIcon, SfxIcon } from './components/Icons';

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
}

interface GenerationResult {
    script: string;
    takes: TakeResult[];
}

const App: React.FC = () => {
  const [scripts, setScripts] = useState<string[]>(["You're tuned into the number one hit music station... Gemini FM!"]);
  const [stationStyle, setStationStyle] = useState<string>('Top 40 Hits');
  const [deliveryStyle, setDeliveryStyle] = useState<string>('Energetic and clear');
  const [selectedVoice, setSelectedVoice] = useState<Voice>(Voice.Zephyr);
  const [selectedDJ, setSelectedDJ] = useState<DJ>(DJ.None);
  const [numberOfTakes, setNumberOfTakes] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isGeneratingScript, setIsGeneratingScript] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generationResults, setGenerationResults] = useState<GenerationResult[]>([]);
  const [generationProgress, setGenerationProgress] = useState<string | null>(null);
  const [apiKeyMissing, setApiKeyMissing] = useState<boolean>(false);

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
    };
  }, [generationResults]);
  
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
        
        // Step 4: Mix everything together
        const finalBlob = await mixAudio(processedBlob, backgroundTrack, sfxToApply);
        
        return { processedBlob, finalBlob };

      } catch (err) {
          console.error("Failed to process audio:", err);
          setError("Failed to apply audio changes.");
          return {};
      }
  }, []);

  const updateTakeState = useCallback(async (resultIndex: number, takeIndex: number, newTakeSettings: Partial<TakeResult>) => {
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

  const handleGenerateClick = useCallback(async () => {
    const validScripts = scripts.filter(s => s.trim() !== '');
    if (validScripts.length === 0) {
      setError("Please enter at least one script.");
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
        const audioBlobs = await generateSweeper(script, selectedVoice, deliveryStyle, numberOfTakes, selectedDJ);
        
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
  }, [scripts, selectedVoice, deliveryStyle, numberOfTakes, generationResults, selectedDJ]);

  const anyLoading = isLoading || isGeneratingScript;
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
                              rows={3}
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
                  <label htmlFor="voice" className="block text-sm font-medium text-cyan-400 mb-2">Voice Model</label>
                  <select
                    id="voice"
                    className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-200 p-3 transition duration-200"
                    value={selectedVoice}
                    onChange={(e) => setSelectedVoice(e.target.value as Voice)}
                    disabled={anyLoading || apiKeyMissing}
                  >
                    {Object.values(Voice).map((v) => (
                      <option key={v} value={v}>{v}</option>
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
              <div>
                <label htmlFor="deliveryStyle" className="block text-sm font-medium text-cyan-400 mb-2">Delivery Style</label>
                <input
                  type="text"
                  id="deliveryStyle"
                  className="w-full bg-gray-900/70 border border-gray-600 rounded-md shadow-sm focus:ring-cyan-500 focus:border-cyan-500 text-gray-200 p-3 transition duration-200"
                  placeholder="e.g., Hype, Calm, Mysterious"
                  value={deliveryStyle}
                  onChange={(e) => setDeliveryStyle(e.target.value)}
                  disabled={anyLoading || apiKeyMissing}
                />
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
                            <audio controls src={take.finalUrl} className="w-full mb-3">
                                Your browser does not support the audio element.
                            </audio>
                             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
