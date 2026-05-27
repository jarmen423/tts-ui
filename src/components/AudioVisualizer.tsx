import React, { useEffect, useRef, useState } from 'react';
import { Volume2, Sparkles, Flame, Eye, Shuffle, Maximize2, Minimize2, Subtitles } from 'lucide-react';
import Teleprompter from './Teleprompter';

interface AudioVisualizerProps {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  isPlaying: boolean;
  visualStyle: string;
  setVisualStyle: (style: string) => void;
  accentColor: string;
  currentAudioMetadata?: { text: string } | null;
  currentTime?: number;
  duration?: number;
}

// Module-scoped globals to ensure Web Audio graph is only created ONCE across mounts/re-renders
let sharedAudioCtx: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let sharedSource: MediaElementAudioSourceNode | null = null;
let bassHistory: number[] = [];

// Particle definition for Circular Ring and Vaporwave Starfield styles
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  color: string;
  decay: number;
  angle?: number;
  speedMultiplier?: number;
  z?: number; // for starfield
}

export default function AudioVisualizer({
  audioRef,
  isPlaying,
  visualStyle,
  setVisualStyle,
  accentColor,
  currentAudioMetadata,
  currentTime = 0,
  duration = 0,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const starfieldRef = useRef<Particle[]>([]);
  const [pulseScale, setPulseScale] = useState<number>(1);
  const [loudness, setLoudness] = useState<number>(0);
  const [isBeatTriggered, setIsBeatTriggered] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [showTeleprompter, setShowTeleprompter] = useState<boolean>(false);

  // Esc keyboard key listener to exit fullscreen gracefully
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFullscreen(false);
      }
    };
    if (isFullscreen) {
      window.addEventListener('keydown', handleEsc);
    }
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isFullscreen]);

  // Available visualization themes
  const visualStyles = [
    { id: 'cosmic', name: 'Cosmic Glow Spectrum', icon: Sparkles, desc: 'Pulsing dual neon-frequency spectrum bars with decaying peaks.' },
    { id: 'neon', name: 'Neon Ripple Wave', icon: Volume2, desc: 'Electric oscilloscope ribbon backed by sonar pulses.' },
    { id: 'cyberpunk', name: 'Cyberpunk circular Audio-Ring', icon: Flame, desc: 'Radial spiked energetic boundary shedding starry particles.' },
    { id: 'vaporwave', name: 'Vaporwave Hyperspace Starfield', icon: Shuffle, desc: '3D starfield warp drive shifting speed in real-time.' },
    { id: 'aura', name: 'Aura Nebula Orb', icon: Eye, desc: 'Liquid, breathing ambient particle orb morphing to vocals.' },
  ];

  // Hex to RGB utility helper
  const hexToRGB = (hex: string, alpha: number = 1): string => {
    let raw = hex.replace('#', '');
    if (raw.length === 3) {
      raw = raw.split('').map(x => x + x).join('');
    }
    const r = parseInt(raw.substring(0, 2), 16) || 120;
    const g = parseInt(raw.substring(2, 4), 16) || 119;
    const b = parseInt(raw.substring(4, 6), 16) || 246;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const handleWordSpoken = (index: number) => {
    // This is called instantly when a new word is highlighted!
    // Spawns gorgeous visualizer explosions that drift outward!
    if (index >= 0 && isPlaying) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const width = canvas.width;
      const height = canvas.height;
      const themeColor = accentColor;
      
      const pCount = 14;
      for (let p = 0; p < pCount; p++) {
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 4 + 2.5;
        particlesRef.current.push({
          x: width / 2,
          y: height / 2,
          vx: Math.cos(angle) * velocity,
          vy: Math.sin(angle) * velocity,
          radius: Math.random() * 3 + 1,
          alpha: 1.0,
          color: Math.random() > 0.4 ? themeColor : '#cbd5e1',
          decay: Math.random() * 0.02 + 0.012,
        });
      }
    }
  };

  const getAccentGlowUrl = () => {
    return hexToRGB(accentColor, 0.4);
  };

  // Initialize Web Audio API safely from module-scoped nodes
  const initializeWebAudio = () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (!sharedAudioCtx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        sharedAudioCtx = new AudioContextClass();
        
        sharedAnalyser = sharedAudioCtx.createAnalyser();
        sharedAnalyser.fftSize = 256; // 128 frequency bins

        sharedSource = sharedAudioCtx.createMediaElementSource(audioEl);
        sharedSource.connect(sharedAnalyser);
        sharedAnalyser.connect(sharedAudioCtx.destination);
      } catch (err) {
        console.error('Web Audio API hook failure:', err);
      }
    }

    if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume();
    }
  };

  // Setup Starfield first time
  const initStarfield = (width: number, height: number) => {
    if (starfieldRef.current.length > 0) return;
    const arr: Particle[] = [];
    for (let i = 0; i < 200; i++) {
      arr.push({
        x: (Math.random() - 0.5) * width,
        y: (Math.random() - 0.5) * height,
        z: Math.random() * width,
        vx: 0,
        vy: 0,
        radius: Math.random() * 1.5 + 0.5,
        alpha: 1,
        color: i % 2 === 0 ? '#ff007f' : i % 3 === 0 ? '#00f0ff' : accentColor,
        decay: 0,
      });
    }
    starfieldRef.current = arr;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle canvas resizing correctly
    const handleResize = () => {
      if (!canvas.parentElement) return;
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight || 320;
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const fData = new Uint8Array(sharedAnalyser ? sharedAnalyser.frequencyBinCount : 128);
    const tData = new Uint8Array(sharedAnalyser ? sharedAnalyser.frequencyBinCount : 128);

    // Peak levels for Cosmic Glow style
    const peakLevels = new Array(128).fill(0);
    let beatTimeout = 0;

    // Rotation angle for Cyberpunk circular style
    let rotationAngle = 0;

    // Drawing loop
    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Ensure Starfield is ready
      initStarfield(width, height);

      // Clears the canvas with a slight opacity fade to create trailing glowing trace effects
      ctx.fillStyle = 'rgba(10, 10, 15, 0.22)';
      ctx.fillRect(0, 0, width, height);

      let currentLoudness = 0;
      let isBeat = false;

      // Fetch dynamic frequencies
      if (sharedAnalyser && isPlaying) {
        sharedAnalyser.getByteFrequencyData(fData);
        sharedAnalyser.getByteTimeDomainData(tData);

        // Compute average volume / loudness
        let total = 0;
        for (let i = 0; i < fData.length; i++) {
          total += fData[i];
        }
        currentLoudness = total / fData.length;
        setLoudness(currentLoudness);

        // Intelligent Beat / Rhythm Detection
        let bassSum = 0;
        const bBins = Math.min(8, fData.length);
        for (let i = 0; i < bBins; i++) {
          bassSum += fData[i];
        }
        const currentBass = bassSum / bBins;
        
        bassHistory.push(currentBass);
        if (bassHistory.length > 50) bassHistory.shift();
        const avgBass = bassHistory.reduce((a, b) => a + b, 0) / (bassHistory.length || 1);
        
        isBeat = currentBass > avgBass * 1.35 && currentBass > 45;
        if (isBeat) {
          setPulseScale(1.15);
          setIsBeatTriggered(true);
          clearTimeout(beatTimeout);
          beatTimeout = window.setTimeout(() => setIsBeatTriggered(false), 120);
        } else {
          setPulseScale(prev => prev + (1 - prev) * 0.1);
        }
      } else {
        // Mock peaceful wave idle state when not playing
        const now = Date.now() * 0.003;
        for (let i = 0; i < fData.length; i++) {
          const s = Math.sin(i * 0.15 - now) * Math.cos(i * 0.05 + now);
          fData[i] = Math.max(0, s * 45 + 15);
          tData[i] = 128 + Math.sin(i * 0.1 - now * 1.5) * 12;
        }
        setPulseScale(1.0);
        setLoudness(10);
      }

      const activeAccent = accentColor;
      const activeAccentGlow = hexToRGB(activeAccent, 0.6);

      // Draw styles
      if (visualStyle === 'cosmic') {
        const barCount = Math.min(60, fData.length);
        const spacing = 4;
        const totalGapWidth = (barCount - 1) * spacing;
        const barWidth = Math.max(2, (width - totalGapWidth) / barCount);
        const startX = (width - (barCount * barWidth + totalGapWidth)) / 2;

        // Visual backdrop grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
        ctx.lineWidth = 1;
        for (let x = 0; x < width; x += 30) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, height);
          ctx.stroke();
        }

        // Draw double mirroring frequency bars (bottom-up and subtle top-down)
        for (let i = 0; i < barCount; i++) {
          const val = fData[i];
          const barHeight = (val / 255) * (height * 0.72) + 2;
          const x = startX + i * (barWidth + spacing);
          
          // Gradients representing warm-glow frequencies
          const grad = ctx.createLinearGradient(x, height, x, height - barHeight);
          grad.addColorStop(0, hexToRGB(activeAccent, 0.22));
          grad.addColorStop(0.5, activeAccent);
          grad.addColorStop(1, '#00f0ff');

          ctx.fillStyle = grad;
          ctx.shadowColor = activeAccent;
          ctx.shadowBlur = isBeat ? 15 : 6;
          
          // Main bar
          ctx.fillRect(x, height - barHeight, barWidth, barHeight);

          // Top mirror reflections
          ctx.fillStyle = hexToRGB(activeAccent, 0.1);
          ctx.fillRect(x, 0, barWidth, barHeight * 0.2);

          // Floating peak level tracker calculation
          if (barHeight > peakLevels[i]) {
            peakLevels[i] = barHeight;
          } else {
            peakLevels[i] -= 1.6; // Decay velocity
          }
          if (peakLevels[i] < 0) peakLevels[i] = 0;

          // Draw the floating peak indicator dot
          ctx.fillStyle = '#ffffff';
          ctx.shadowBlur = 4;
          ctx.shadowColor = '#00f0ff';
          ctx.fillRect(x, Math.max(0, height - peakLevels[i] - 4), barWidth, 2);
        }
        ctx.shadowBlur = 0;

      } else if (visualStyle === 'neon') {
        // Sonar backdrop pulses triggered on beats
        if (isBeat) {
          ctx.beginPath();
          ctx.arc(width / 2, height / 2, Math.max(30, currentLoudness * 2), 0, Math.PI * 2);
          ctx.strokeStyle = hexToRGB(activeAccent, 0.3);
          ctx.lineWidth = 3;
          ctx.stroke();
        }

        // Concentric ambient layers
        ctx.beginPath();
        ctx.arc(width / 2, height / 2, 70 * pulseScale, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.stroke();

        // High frequency neon audio wave ribbon
        ctx.shadowColor = activeAccent;
        ctx.shadowBlur = isBeat ? 20 : 8;
        ctx.lineWidth = isBeat ? 4 : 2.5;

        // Central neon stream
        ctx.beginPath();
        const sliceWidth = width / tData.length;
        for (let i = 0; i < tData.length; i++) {
          const v = tData[i] / 128.0;
          const y = (v * height) / 2;
          const x = i * sliceWidth;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        const streamGrad = ctx.createLinearGradient(0, 0, width, 0);
        streamGrad.addColorStop(0, '#00f0ff');
        streamGrad.addColorStop(0.5, activeAccent);
        streamGrad.addColorStop(1, '#ff007f');
        ctx.strokeStyle = streamGrad;
        ctx.stroke();

        // Subtly offset reflective helper wave
        ctx.shadowBlur = 0;
        ctx.beginPath();
        for (let i = 0; i < tData.length; i++) {
          const v = tData[tData.length - i - 1] / 128.0;
          const y = (v * height) / 2 + 10 * Math.sin(Date.now() * 0.002);
          const x = i * sliceWidth;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.stroke();

      } else if (visualStyle === 'cyberpunk') {
        const cx = width / 2;
        const cy = height / 2;
        const baseRadius = Math.min(width, height) * 0.24 * pulseScale;

        // Slow rotate effect
        rotationAngle += isPlaying ? 0.004 + (currentLoudness * 0.0001) : 0.002;

        // Spawn interactive boundary spark-particles on beats
        if (isBeat && isPlaying) {
          for (let p = 0; p < 8; p++) {
            const angle = Math.random() * Math.PI * 2;
            const velocity = Math.random() * 4 + 2;
            particlesRef.current.push({
              x: cx + Math.cos(angle) * baseRadius,
              y: cy + Math.sin(angle) * baseRadius,
              vx: Math.cos(angle) * velocity + (Math.random() - 0.5) * 1.5,
              vy: Math.sin(angle) * velocity + (Math.random() - 0.5) * 1.5,
              radius: Math.random() * 3 + 1,
              alpha: 1,
              color: Math.random() > 0.4 ? activeAccent : '#ff007f',
              decay: Math.random() * 0.03 + 0.01,
            });
          }
        }

        // Draw and update spawned star spark particles
        const parts = particlesRef.current;
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= p.decay;
          if (p.alpha <= 0) {
            parts.splice(i, 1);
            continue;
          }
          ctx.fillStyle = hexToRGB(p.color, p.alpha);
          ctx.shadowBlur = 8;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Draw central radial spiked circle
        const numPoints = Math.min(128, fData.length);
        ctx.beginPath();
        for (let i = 0; i < numPoints; i++) {
          const index = Math.floor((i / numPoints) * fData.length);
          const val = fData[index];
          const spikeHeight = (val / 255) * (baseRadius * 0.85);
          const totalRad = baseRadius + spikeHeight;
          const angle = (i / numPoints) * Math.PI * 2 + rotationAngle;
          
          const rx = cx + Math.cos(angle) * totalRad;
          const ry = cy + Math.sin(angle) * totalRad;
          
          if (i === 0) {
            ctx.moveTo(rx, ry);
          } else {
            ctx.lineTo(rx, ry);
          }
        }
        ctx.closePath();
        ctx.strokeStyle = activeAccent;
        ctx.shadowBlur = 15;
        ctx.shadowColor = activeAccent;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner glowing core
        ctx.beginPath();
        ctx.arc(cx, cy, baseRadius * 0.78, 0, Math.PI * 2);
        ctx.fillStyle = ctx.createRadialGradient(cx, cy, 2, cx, cy, baseRadius * 0.8);
        ctx.fillStyle.addColorStop(0, hexToRGB(activeAccent, 0.4));
        ctx.fillStyle.addColorStop(1, 'rgba(10, 10, 15, 0)');
        ctx.fill();
        ctx.shadowBlur = 0;

      } else if (visualStyle === 'vaporwave') {
        const cx = width / 2;
        const cy = height / 2;

        // Grid floor in 3D perspective
        ctx.strokeStyle = 'rgba(255, 0, 127, 0.08)';
        ctx.lineWidth = 1.5;
        const gridHorizon = height * 0.4;
        const numSlices = 15;
        for (let idx = 0; idx <= numSlices; idx++) {
          const ratio = idx / numSlices;
          const px = (cx - width) + (ratio * width * 2);
          ctx.beginPath();
          ctx.moveTo(cx, gridHorizon);
          ctx.lineTo(px, height);
          ctx.stroke();
        }

        // Horizontal retro grid lines moving downwards
        const speedFactor = isPlaying ? (currentLoudness * 0.15) + 1 : 0.8;
        const gridOffset = (Date.now() * 0.05 * speedFactor) % 40;
        for (let y = gridHorizon; y < height; y += 22) {
          const actualY = y + (gridOffset * (y - gridHorizon) * 0.02);
          if (actualY > height) continue;
          ctx.beginPath();
          ctx.moveTo(0, actualY);
          ctx.lineTo(width, actualY);
          ctx.strokeStyle = `rgba(0, 240, 255, ${0.03 + (actualY - gridHorizon) / (height - gridHorizon) * 0.1})`;
          ctx.stroke();
        }

        // Vaporwave warp-speed stars flying forward
        const stars = starfieldRef.current;
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          s.z -= currentLoudness > 50 ? (currentLoudness * 0.06) + 4 : 2;
          if (s.z <= 0) {
            s.z = width;
            s.x = (Math.random() - 0.5) * width;
            s.y = (Math.random() - 0.5) * height;
          }

          // Projection onto 2D viewport
          const px = (s.x / s.z) * width + cx;
          const py = (s.y / s.z) * height + cy;

          if (px >= 0 && px < width && py >= 0 && py < height) {
            const r = (1 - s.z / width) * 2.5 + 0.5;
            const alpha = (1 - s.z / width);
            ctx.fillStyle = hexToRGB(s.color, alpha);
            ctx.beginPath();
            ctx.arc(px, py, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        // Concentric audio visual equalizer rings mirroring the voice peaks
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 10;
        ctx.strokeStyle = activeAccent;
        ctx.lineWidth = 2.5;
        
        ctx.beginPath();
        const numEqua = 6;
        for (let j = 0; j < numEqua; j++) {
          const size = Math.max(10, (fData[j * 8] / 255) * (height * 0.3) + 20);
          ctx.arc(cx, cy, size, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

      } else if (visualStyle === 'aura') {
        const cx = width / 2;
        const cy = height / 2;
        const systemRadius = Math.min(width, height) * 0.25;

        // Smooth breathing fluid glow orb with rotating vocal frequency nodes
        const ringGrad = ctx.createRadialGradient(cx, cy, 5, cx, cy, systemRadius * 2 * pulseScale);
        ringGrad.addColorStop(0, hexToRGB(activeAccent, 0.45));
        ringGrad.addColorStop(0.4, hexToRGB('#00f0ff', 0.2));
        ringGrad.addColorStop(0.7, hexToRGB('#ff007f', 0.05));
        ringGrad.addColorStop(1, 'rgba(10, 10, 15, 0)');

        ctx.fillStyle = ringGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, systemRadius * 1.5 * pulseScale, 0, Math.PI * 2);
        ctx.fill();

        // High frequency neon dynamic dust floating around
        rotationAngle -= 0.003;
        const totalAuraNodes = 40;
        ctx.beginPath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ffffff';

        for (let i = 0; i < totalAuraNodes; i++) {
          const freqVal = fData[Math.min(i * 3, fData.length - 1)];
          const nodeDist = systemRadius + (freqVal / 255) * 55;
          const angle = (i / totalAuraNodes) * Math.PI * 2 + rotationAngle;
          const nx = cx + Math.cos(angle) * nodeDist;
          const ny = cy + Math.sin(angle) * nodeDist;

          if (i === 0) {
            ctx.moveTo(nx, ny);
          } else {
            ctx.lineTo(nx, ny);
          }
          
          // Small twinkling nodes
          if (i % 5 === 0) {
            ctx.fillStyle = '#00f0ff';
            ctx.beginPath();
            ctx.arc(nx, ny, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw and update spawned star spark particles globally across all modes
      if (visualStyle !== 'cyberpunk') {
        const parts = particlesRef.current;
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= p.decay;
          if (p.alpha <= 0) {
            parts.splice(i, 1);
            continue;
          }
          ctx.fillStyle = hexToRGB(p.color, p.alpha);
          ctx.shadowBlur = 8;
          ctx.shadowColor = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;
      }

      // Loop frame
      animationRef.current = requestAnimationFrame(render);
    };

    // Begin looping
    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      clearTimeout(beatTimeout);
    };
  }, [visualStyle, isPlaying, accentColor]);

  // Trigger artificial resize event when fullscreen mode changes to immediately snap canvas resolution
  useEffect(() => {
    const timer = setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);
    return () => clearTimeout(timer);
  }, [isFullscreen]);

  return (
    <div 
      id="visualizer-container" 
      className={`flex flex-col bg-slate-950 p-5 duration-200 transition-all ${
        isFullscreen 
          ? 'fixed inset-0 z-[99999] w-screen h-screen' 
          : 'h-full w-full rounded-2xl border border-slate-800/80 shadow-2xl backdrop-blur-md overflow-hidden'
      }`}
    >
      {/* Top Banner & Status Panel */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-4 mb-4 select-none">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isPlaying ? 'bg-emerald-400' : 'bg-amber-400'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isPlaying ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            AUDIO REACTIVE CANVAS {isFullscreen && <span className="text-[10px] text-indigo-400 ml-1 font-mono uppercase tracking-widest">[FULLSCREEN ACTIVE - ESC TO EXIT]</span>}
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Web Audio API dynamic frequency analysis
          </p>
        </div>

        {/* Selected Accent Display and Full Screen Trigger Row */}
        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/60 px-2.5 py-1 rounded-full text-[11px] font-mono text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full border border-slate-700" style={{ backgroundColor: accentColor }}></span>
            <span>Gain: {loudness > 0 ? (loudness / 2.55).toFixed(0) : 0}%</span>
          </div>

          <button
            onClick={() => setShowTeleprompter(!showTeleprompter)}
            type="button"
            className={`p-1.5 rounded-lg border flex items-center gap-1.5 cursor-pointer transition-all duration-200 shadow ${
              showTeleprompter 
                ? 'bg-indigo-505/15 border-indigo-500/30 text-indigo-400' 
                : 'bg-slate-900 hover:bg-slate-850 border-slate-800 text-slate-450 hover:text-slate-200'
            }`}
            title="Toggle Holographic Speech Teleprompter"
          >
            <Subtitles className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase font-mono tracking-wider font-semibold">Prompter</span>
          </button>

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            type="button"
            className="p-1.5 bg-slate-900 hover:bg-slate-850 rounded-lg text-slate-400 hover:text-slate-200 border border-slate-800 flex items-center gap-1.5 cursor-pointer transition-all duration-200 shadow"
            title={isFullscreen ? "Exit Fullscreen (ESC)" : "Go Fullscreen"}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-rose-450" />
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold">Exit</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[10px] uppercase font-mono tracking-wider font-semibold">Fullscreen</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Visual Canvas Viewport */}
      <div 
        className="relative w-full flex-grow bg-slate-950 rounded-xl overflow-hidden border border-slate-900 shadow-inner group" 
        onClick={initializeWebAudio}
        title="Click viewport to initialize audio nodes"
      >
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full block"
        />

        {showTeleprompter && (
          currentAudioMetadata ? (
            <Teleprompter
              text={currentAudioMetadata.text}
              currentTime={currentTime}
              duration={duration}
              isPlaying={isPlaying}
              accentColor={accentColor}
              onActiveWordChange={handleWordSpoken}
            />
          ) : (
            <div className="absolute inset-0 m-3 p-6 bg-slate-950/85 backdrop-blur-xl border border-slate-900/45 rounded-xl flex flex-col items-center justify-center text-center gap-3">
              <div className="p-3 bg-slate-900/80 border border-slate-800 rounded-2xl">
                <Subtitles className="w-6 h-6 text-indigo-450 animate-pulse" />
              </div>
              <h4 className="text-xs font-bold text-slate-200 tracking-wider font-mono">STANDBY PROMPTER</h4>
              <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                Holographic captions are active! Type or paste a script below and click <span className="text-indigo-400 font-bold">"Generate"</span> to begin scanning.
              </p>
              <button 
                onClick={() => setShowTeleprompter(false)}
                className="text-[10px] text-slate-500 hover:text-slate-300 underline font-mono tracking-wider uppercase"
              >
                Close Prompter
              </button>
            </div>
          )
        )}

        {/* Ambient Overlay Layer when Idle */}
        {!isPlaying && !showTeleprompter && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/45 backdrop-blur-[1px] pointer-events-none transition-all duration-300 group-hover:bg-slate-950/20">
            <div className="p-3 bg-slate-900/90 border border-slate-800/80 rounded-2xl mb-3 shadow-lg transform transition-transform duration-300 group-hover:scale-105">
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <h4 className="text-xs font-semibold text-slate-200 tracking-wider">VISUALIZER STANDBY</h4>
            <p className="text-[10px] text-slate-400 max-w-[200px] mt-1 line-clamp-2">
              Generate TTS speech, play output, or select a different style below.
            </p>
          </div>
        )}

        {/* Dynamic Beat HUD Indicator overlay */}
        {isPlaying && isBeatTriggered && (
          <div className="absolute top-4 right-4 animate-ping bg-indigo-500/20 w-3 h-3 rounded-full pointer-events-none"></div>
        )}
      </div>

      {/* Style selector chips with descriptive labels */}
      <div className="mt-4 pt-1 select-none">
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
          {visualStyles.map((item) => {
            const Icon = item.icon;
            const isActive = visualStyle === item.id;
            return (
              <button
                key={item.id}
                id={`vis-btn-${item.id}`}
                onClick={() => setVisualStyle(item.id)}
                type="button"
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition-all duration-200 text-center cursor-pointer ${
                  isActive
                    ? 'bg-slate-900 border border-slate-700/80 shadow-md text-slate-100 scale-[1.01]'
                    : 'bg-slate-900/40 border border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-300 hover:bg-slate-900/60'
                }`}
                title={item.desc}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-405 scale-110' : 'text-slate-400'}`} />
                <span className="text-[10px] font-medium tracking-wide uppercase truncate max-w-full">
                  {item.id === 'cosmic' ? 'Cosmic' : item.id === 'neon' ? 'Neon Wave' : item.id === 'cyberpunk' ? 'Cyber Ring' : item.id === 'vaporwave' ? 'Starfield' : 'Aura Orb'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
