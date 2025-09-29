import React, { useRef, useEffect } from 'react';

interface AudioVisualizerProps {
  src: string;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ src }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const animationFrameIdRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    const setupAudioContext = () => {
      // Setup only once
      if (audioContextRef.current) return;
      
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContext();
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      sourceRef.current = audioContextRef.current.createMediaElementSource(audioEl);
      sourceRef.current.connect(analyserRef.current);
      analyserRef.current.connect(audioContextRef.current.destination);
      
      const bufferLength = analyserRef.current.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);
    };
    
    const draw = () => {
      animationFrameIdRef.current = requestAnimationFrame(draw);

      const canvasEl = canvasRef.current;
      const analyser = analyserRef.current;
      const dataArray = dataArrayRef.current;

      if (!canvasEl || !analyser || !dataArray) return;
      const canvasCtx = canvasEl.getContext('2d');
      if (!canvasCtx) return;

      analyser.getByteFrequencyData(dataArray);
      
      canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      
      const bufferLength = analyser.frequencyBinCount;
      const barWidth = (canvasEl.width / bufferLength);
      let barHeight;
      let x = 0;
      
      const gradient = canvasCtx.createLinearGradient(0, 0, 0, canvasEl.height);
      gradient.addColorStop(0, '#06b6d4'); // cyan-500
      gradient.addColorStop(0.5, '#8b5cf6'); // purple-500
      gradient.addColorStop(1, '#ec4899'); // pink-500
      canvasCtx.fillStyle = gradient;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * canvasEl.height;
        canvasCtx.fillRect(x, canvasEl.height - barHeight, barWidth, barHeight);
        x += barWidth;
      }
    };

    const startVisualization = () => {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume();
      }
      if (animationFrameIdRef.current === null) {
        draw();
      }
    };

    const stopVisualization = () => {
      if (animationFrameIdRef.current !== null) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
        
        const canvasEl = canvasRef.current;
        if (canvasEl) {
            const canvasCtx = canvasEl.getContext('2d');
            canvasCtx?.clearRect(0, 0, canvasEl.width, canvasEl.height);
        }
      }
    };
    
    audioEl.addEventListener('play', setupAudioContext, { once: true }); // Setup only on the very first play
    audioEl.addEventListener('play', startVisualization);
    audioEl.addEventListener('pause', stopVisualization);
    audioEl.addEventListener('ended', stopVisualization);

    // Handle canvas resizing
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const { width, height } = entry.contentRect;
            canvasEl.width = width;
            canvasEl.height = height;
        }
    });
    resizeObserver.observe(canvasEl);

    return () => {
      audioEl.removeEventListener('play', startVisualization);
      audioEl.removeEventListener('pause', stopVisualization);
      audioEl.removeEventListener('ended', stopVisualization);
      
      stopVisualization();
      
      sourceRef.current?.disconnect();
      analyserRef.current?.disconnect();

      if (canvasEl) {
          resizeObserver.unobserve(canvasEl);
      }
    };
  }, []);

  useEffect(() => {
    const audioEl = audioRef.current;
    if (audioEl && audioEl.src !== src) {
      audioEl.src = src;
    }
  }, [src]);

  return (
    <div className="w-full">
      <canvas ref={canvasRef} height="60" className="w-full h-[60px] rounded-t-md bg-gray-900/50 border border-b-0 border-gray-700/70"></canvas>
      <audio ref={audioRef} src={src} controls className="w-full rounded-b-md">
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default AudioVisualizer;
