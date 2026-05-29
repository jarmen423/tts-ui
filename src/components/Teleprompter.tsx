import React, { useEffect, useRef, useState, useMemo } from 'react';
import { 
  Sliders, Eye, Sparkles, AlertCircle, Play, Pause, 
  RotateCcw, Maximize2, Minimize2, Type, EyeOff, LayoutTemplate
} from 'lucide-react';

interface WordTiming {
  word: string;
  cleanWord: string;
  start: number;
  end: number;
  weight: number;
  paragraphIndex: number;
  isFirstInParagraph: boolean;
}

interface TeleprompterProps {
  text: string;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  accentColor: string;
  onActiveWordChange?: (index: number) => void;
}

export default function Teleprompter({
  text,
  currentTime,
  duration,
  isPlaying,
  accentColor,
  onActiveWordChange
}: TeleprompterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Custom user controls state
  const [fontSize, setFontSize] = useState<'sm' | 'md' | 'lg' | 'xl'>('lg');
  const [opacity, setOpacity] = useState<number>(0.9);
  const [smartFollow, setSmartFollow] = useState<boolean>(true);
  const [presenterMode, setPresenterMode] = useState<boolean>(false);
  const [hasScrolledManually, setHasScrolledManually] = useState<boolean>(false);
  
  // User selected word styling speed multiplier (visual offset delay tracker)
  const [offsetDelay, setOffsetDelay] = useState<number>(0);

  // Hex to RGB tool for neon glows
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

  // Parse paragraphs and words to calculate high-definition estimated timing weights
  const timings = useMemo(() => {
    if (!text) return [];

    const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
    const parsedWords: WordTiming[] = [];
    
    // Accumulate words to estimate timings
    paragraphs.forEach((paragraph, pIdx) => {
      const words: string[] = paragraph.match(/\S+/g) || [];
      words.forEach((word: string, wIdx) => {
        const clean = word.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '');
        
        // Base weight corresponds to character length
        let weight = Math.max(1, word.length);
        
        // Add extra weight for punctuation pause emulation
        if (word.endsWith(',') || word.endsWith(';') || word.endsWith(':')) {
          weight += 4;
        } else if (word.endsWith('.') || word.endsWith('!') || word.endsWith('?')) {
          weight += 8;
        }

        parsedWords.push({
          word,
          cleanWord: clean,
          start: 0,
          end: 0,
          weight,
          paragraphIndex: pIdx,
          isFirstInParagraph: wIdx === 0
        });
      });
    });

    // Distribute overall weights based on total audio duration
    const totalWeight = parsedWords.reduce((sum, w) => sum + w.weight, 0);
    const activeDuration = duration > 0 ? duration : Math.max(1, parsedWords.length * 0.35); // intelligent fallback

    let elapsedWeight = 0;
    parsedWords.forEach((word) => {
      word.start = (elapsedWeight / totalWeight) * activeDuration;
      elapsedWeight += word.weight;
      word.end = (elapsedWeight / totalWeight) * activeDuration;
    });

    return parsedWords;
  }, [text, duration]);

  // Determine active word index from current playing timestamp
  const activeWordIdx = useMemo(() => {
    if (timings.length === 0) return -1;
    
    const adjustedTime = Math.max(0, currentTime - offsetDelay);
    const matchedIdx = timings.findIndex(w => adjustedTime >= w.start && adjustedTime <= w.end);
    
    // If not found, check if completed or not started
    if (matchedIdx !== -1) return matchedIdx;
    if (adjustedTime > timings[timings.length - 1].end) return timings.length - 1;
    return 0;
  }, [timings, currentTime, offsetDelay]);

  // Alert parent on spoken word index transition (useful for canvas particle hooks)
  useEffect(() => {
    if (onActiveWordChange && activeWordIdx >= 0) {
      onActiveWordChange(activeWordIdx);
    }
  }, [activeWordIdx, onActiveWordChange]);

  // Smooth centering with DOM references
  useEffect(() => {
    if (activeWordIdx < 0 || !smartFollow || hasScrolledManually) return;

    const activeEl = document.getElementById(`tele-word-${activeWordIdx}`);
    const container = containerRef.current;
    
    if (activeEl && container) {
      const parentRect = container.getBoundingClientRect();
      const activeRect = activeEl.getBoundingClientRect();
      
      // Compute perfect relative center scroll offset
      const relativeTop = activeRect.top - parentRect.top;
      const scrollTarget = container.scrollTop + relativeTop - (parentRect.height / 2) + (activeRect.height / 2);
      
      container.scrollTo({
        top: Math.max(0, scrollTarget),
        behavior: 'smooth'
      });
    }
  }, [activeWordIdx, smartFollow, hasScrolledManually]);

  // Detect user scroll interactions to temporarily disable Smart Follow
  const handleContainerScroll = () => {
    if (!isPlaying) return; // ignore static scroll
    // Minimal heuristic logic: if user is scrolling manually while playing, release smart locking
    if (smartFollow && !hasScrolledManually) {
      // Small debounce / delay can be added, but manual track release is safer
    }
  };

  const resetSmartLock = () => {
    setHasScrolledManually(false);
    setSmartFollow(true);
  };

  // Determine font size class mapping
  const getTextSizeClass = () => {
    switch(fontSize) {
      case 'sm': return 'text-xs md:text-sm leading-relaxed';
      case 'md': return 'text-sm md:text-base leading-relaxed';
      case 'lg': return 'text-base md:text-lg leading-relaxed';
      case 'xl': return 'text-lg md:text-2xl font-semibold leading-loose';
    }
  };

  return (
    <div 
      id="teleprompter-glass" 
      className={`absolute inset-0 flex flex-col justify-end duration-300 transition-all select-none ${
        presenterMode 
          ? 'bg-slate-950/98 z-[999] p-6' // Fullscreen Presenter Mode isolation
          : 'bg-slate-950/40 backdrop-blur-[24px] border border-white/[0.08] shadow-[inset_0_1px_3px_rgba(255,255,255,0.12),_inset_0_0_0_1px_rgba(255,255,255,0.05),_0_24px_48px_rgba(0,0,0,0.8)] p-4 rounded-xl z-20 m-3'
      }`}
      style={{ opacity }}
    >
      {/* Fresnel Light Sheen Specular Reflection Overlay */}
      {!presenterMode && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl z-10">
          <div 
            className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-white/[0.08] mix-blend-overlay"
            style={{
              clipPath: 'polygon(0 0, 100% 0, 100% 40%, 0 75%)',
            }}
          />
          {/* Edge reflection shimmer */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        </div>
      )}

      {/* Glow aura effects behind texts */}
      <div 
        className="absolute inset-[30%] pointer-events-none rounded-full blur-[80px] opacity-25 mix-blend-screen transition-colors duration-1000"
        style={{ backgroundColor: hexToRGB(accentColor, 0.4) }}
      />

      {/* Futuristic Hologram Overlay HUD styling (grid + lines) */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl opacity-20 bg-grid-haze">
        <div className="absolute w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-505 to-transparent top-0 animate-pulse"></div>
        {/* Repeating Scanlines */}
        <div className="absolute inset-0 bg-scanlines mix-blend-overlay"></div>
      </div>

      {/* Control Panel Header Row */}
      <div className="relative flex items-center justify-between gap-3 border-b border-slate-900/60 pb-3 mb-3 shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
            <span className="text-[10px] font-mono font-bold text-slate-300 tracking-wider">HOLOGRAPHIC PROMPTER HUD</span>
          </div>
          {hasScrolledManually && (
            <button 
              onClick={resetSmartLock}
              className="text-[9px] bg-indigo-500/15 text-indigo-450 border border-indigo-500/10 px-2 py-0.5 rounded-md hover:bg-slate-900 transition-colors cursor-pointer"
            >
              🔒 LOCKED MANUAL (TAP RE-SYNC)
            </button>
          )}
        </div>

        {/* Setting sliders and triggers */}
        <div className="flex items-center gap-2.5">
          {/* Opacity trigger slider */}
          <div className="hidden sm:flex items-center gap-1.5 border-r border-slate-900/60 pr-2.5">
            <Sliders className="w-3 h-3 text-slate-500" />
            <input 
              type="range"
              min="0.3"
              max="1.0"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(Number(e.target.value))}
              className="w-16 h-1 bg-slate-900 rounded cursor-pointer accent-indigo-400"
              title="Prompter Canvas Opacity"
            />
          </div>

          {/* FontSize button cycler */}
          <button
            onClick={() => {
              setFontSize(prev => prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : prev === 'lg' ? 'xl' : 'sm');
            }}
            type="button"
            className="p-1.5 hover:bg-slate-900/60 rounded-lg text-slate-400 hover:text-slate-100 border border-slate-900 duration-150 cursor-pointer"
            title="Cycle Font Size"
          >
            <Type className="w-3.5 h-3.5 text-slate-350" />
          </button>

          {/* Autoscroll Smart lock toggle */}
          <button
            onClick={() => {
              setSmartFollow(!smartFollow);
              setHasScrolledManually(false);
            }}
            type="button"
            className={`p-1.5 rounded-lg border duration-150 cursor-pointer flex items-center gap-1 text-[10px] font-mono tracking-wider ${
              smartFollow 
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' 
                : 'bg-slate-900/85 border-slate-900 text-slate-450 hover:text-slate-200'
            }`}
            title="Auto Tracking Teleprompter"
          >
            {smartFollow ? 'SMART FOLLOW' : 'MANUAL SCROLL'}
          </button>

          {/* Presenter Mode toggle isolates content */}
          <button
            onClick={() => setPresenterMode(!presenterMode)}
            type="button"
            className={`p-1.5 rounded-lg border duration-150 cursor-pointer flex items-center gap-1.5 text-[10px] uppercase font-mono tracking-wider ${
              presenterMode 
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-lg' 
                : 'bg-slate-900/85 border-slate-900 text-slate-350 hover:text-slate-150'
            }`}
            title="Isolate speech presenter overlay"
          >
            {presenterMode ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-rose-450" />
                <span>Presenter Active</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-indigo-455" />
                <span>Presenter</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main text viewport */}
      <div 
        ref={containerRef}
        onScroll={handleContainerScroll}
        onMouseDown={() => {
          if (smartFollow) {
            setHasScrolledManually(true);
          }
        }}
        onTouchStart={() => {
          if (smartFollow) {
            setHasScrolledManually(true);
          }
        }}
        className={`relative flex-grow overflow-y-auto w-full flex flex-col items-center justify-start py-10 px-2 cursor-grab active:cursor-grabbing`}
        style={{ 
          scrollbarWidth: 'none',
          maskImage: 'linear-gradient(to bottom, transparent, white 20%, white 80%, transparent)'
        }}
      >
        <div className={`w-full max-w-2xl text-center space-y-6 select-text mb-20 ${getTextSizeClass()}`}>
          {timings.length === 0 ? (
            <p className="text-slate-500 italic">Receiving spoken telemetry flow...</p>
          ) : (
            // Reconstruct text elements
            (() => {
              // Group words by paragraphs for visual block rendering
              const paragraphsGroup: WordTiming[][] = [];
              let currentPara: WordTiming[] = [];
              
              timings.forEach((word) => {
                if (word.isFirstInParagraph && currentPara.length > 0) {
                  paragraphsGroup.push(currentPara);
                  currentPara = [];
                }
                currentPara.push(word);
              });
              if (currentPara.length > 0) {
                paragraphsGroup.push(currentPara);
              }

              return paragraphsGroup.map((para, pIndex) => (
                <p 
                  key={`para-${pIndex}`} 
                  className={`text-center transition-opacity duration-300 px-4`}
                >
                  {para.map((word) => {
                    const originalIndex = timings.indexOf(word);
                    const isActive = originalIndex === activeWordIdx;
                    const isPassed = originalIndex < activeWordIdx;
                    
                    return (
                      <span
                        key={`word-${originalIndex}`}
                        id={`tele-word-${originalIndex}`}
                        className={`inline-block mx-1.5 my-1.5 px-1 py-0.5 rounded transition-all duration-350 duration-200 select-text ${
                          isActive 
                            ? 'text-slate-100 font-extrabold scale-110 px-2 shadow bg-indigo-500/10' 
                            : isPassed 
                            ? 'text-slate-500 font-medium opacity-45' 
                            : 'text-slate-400 font-normal opacity-90 hover:text-slate-200'
                        }`}
                        style={{
                          textShadow: isActive 
                            ? `0 0 10px ${hexToRGB(accentColor, 0.8)}, 0 0 20px ${hexToRGB(accentColor, 0.4)}` 
                            : 'none'
                        }}
                      >
                        {word.word}
                      </span>
                    );
                  })}
                </p>
              ));
            })()
          )}
        </div>
      </div>

      {/* Footer statistics tracking timing progress bar */}
      <div className="relative pt-2.5 border-t border-slate-900/60 flex items-center justify-between text-[9px] font-mono text-slate-500 tracking-wider shrink-0 select-none">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-ping"></span>
          <span>SPEED MULTIPLIER: 1.0x</span>
        </div>
        <span>
          SCROLL SYNC: {timings.length > 0 && activeWordIdx >= 0 
            ? `${Math.round(((activeWordIdx + 1) / timings.length) * 100)}%` 
            : '0%'
          } COMPLETE
        </span>
      </div>
    </div>
  );
}
