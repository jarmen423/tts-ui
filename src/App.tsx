import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, Download, Trash2, Key, Info, 
  Settings, RotateCcw, Sliders, VolumeX, Volume2, 
  Sparkles, FileText, Upload, RefreshCw, AudioLines, 
  FileAudio, CheckCircle, ChevronDown, Award,
  Bookmark, Search, Maximize2, Minimize2, HelpCircle, Edit3
} from 'lucide-react';
import AudioVisualizer from './components/AudioVisualizer';
import { AudioDB } from './utils/audioDb';

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

interface RecordingMetadata {
  id: string;
  text: string;
  provider: string;
  voiceId: string;
  voiceName: string;
  timestamp: number;
  charCount: number;
  duration: number;
}

// Built-in presets to kickstart user testing immediately
const TEMPLATES = [
  {
    title: 'Professional Narrator',
    text: 'Welcome to the premium Text-to-Speech Voice Studio. This multi-provider console converts any raw text into a natural human voice. Try changing the visualizers below to see the spectrum dance in real-time!'
  },
  {
    title: 'Poetry & Atmosphere',
    text: 'And the night shall be filled with music, And the cares, that infest the day, Shall fold their tents, like the Arabs, And as silently steal away.'
  },
  {
    title: 'Meditation Breathing Guilds',
    text: 'Breathe in slowly through your nose... hold the focus... and breathe out gently. Feel the ambient glow around you, and let every tension melt away into the frequency.'
  }
];

// Available Theme Accents
const ACCENTS = [
  { id: 'indigo', name: 'Neoteric Violet', hex: '#6366f1' },
  { id: 'cyan', name: 'Electric Turquoise', hex: '#00f0ff' },
  { id: 'amber', name: 'Cyberpunk Gold', hex: '#f59e0b' },
  { id: 'rose', name: 'Sunset Crimson', hex: '#f43f5e' },
  { id: 'emerald', name: 'Aurora Emerald', hex: '#10b981' }
];

// Supported Voices Configurations
const GEMINI_VOICES = [
  { id: 'Kore', name: 'Kore (Balanced Male-Alto)', gender: 'Male' },
  { id: 'Puck', name: 'Puck (Cheerful Tenor)', gender: 'Male' },
  { id: 'Charon', name: 'Charon (Distinguished Narrator)', gender: 'Male' },
  { id: 'Fenrir', name: 'Fenrir (Deep Baritone)', gender: 'Male' },
  { id: 'Zephyr', name: 'Zephyr (Conversational Female)', gender: 'Female' }
];

const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy (Neutral Multipurpose)', gender: 'Neutral' },
  { id: 'echo', name: 'Echo (Resonant Narrative)', gender: 'Male' },
  { id: 'fable', name: 'Fable (Dynamic Character)', gender: 'Male' },
  { id: 'onyx', name: 'Onyx (Deep Narrating)', gender: 'Male' },
  { id: 'nova', name: 'Nova (Warm Conversational)', gender: 'Female' },
  { id: 'shimmer', name: 'Shimmer (Bright Crisp)', gender: 'Female' }
];

const DEFAULT_ELEVENLABS_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Warm Narration)', gender: 'Female' },
  { id: 'pNInz6Y7idYidbeM6j8U', name: 'Adam (Clear Professional)', gender: 'Male' },
  { id: 'EXAVITQu4vr4xnSDNYMa', name: 'Bella (Excited Storyteller)', gender: 'Female' },
  { id: 'ErXwobaYiN019vkySvjV', name: 'Antoni (Deep Voice Actor)', gender: 'Male' },
  { id: 'IKne3meq5aSn9XLyUdCD', name: 'Charlie (Energetic Conversational)', gender: 'Male' },
  { id: 'jBpfbpa2pco3hybZ8O7a', name: 'Glinda (Gentle Soft)', gender: 'Female' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi (Bright Explainer)', gender: 'Female' }
];

const MISTRAL_VOICES = [
  { id: 'bellatrix', name: 'Bellatrix (Sultry Female)', gender: 'Female' },
  { id: 'demeter', name: 'Demeter (Steady Male)', gender: 'Male' }
];

export default function App() {
  // Input fields
  const [text, setText] = useState<string>(TEMPLATES[0].text);
  const [provider, setProvider] = useState<string>('gemini'); // gemini, openai, elevenlabs
  const [voiceId, setVoiceId] = useState<string>('Kore');
  const [accentId, setAccentId] = useState<string>('cyan');
  const [visualStyle, setVisualStyle] = useState<string>('cosmic');

  // API Secrets (Securely saved locally in client’s localStorage)
  const [openaiKey, setOpenaiKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_oai_key') || '');
  const [elevenlabsKey, setElevenlabsKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_el_key') || '');
  const [mistralKey, setMistralKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_mistral_key') || '');
  const [hideOaiKey, setHideOaiKey] = useState<boolean>(true);
  const [hideElKey, setHideElKey] = useState<boolean>(true);
  const [hideMistralKey, setHideMistralKey] = useState<boolean>(true);

  // Advanced provider controls
  const [geminiEmotion, setGeminiEmotion] = useState<string>('default');
  const [openaiModel, setOpenaiModel] = useState<string>('tts-1');
  const [elevenlabsModel, setElevenlabsModel] = useState<string>('eleven_flash_v1_5');
  const [elStability, setElStability] = useState<number>(0.5);
  const [elSimilarity, setElSimilarity] = useState<number>(0.75);

  // Advanced voice customization options (Pitch, Rate, Intonation)
  const [voicePitch, setVoicePitch] = useState<number>(0);
  const [voiceRate, setVoiceRate] = useState<number>(1.0);
  const [voiceIntonation, setVoiceIntonation] = useState<number>(50);

  // Dynamic voices list fetched from ElevenLabs account
  const [elCustomVoices, setElCustomVoices] = useState<any[]>([]);
  const [isFetchingElVoices, setIsFetchingElVoices] = useState<boolean>(false);
  const [elVoicesStatus, setElVoicesStatus] = useState<string>('');

  // Audio Playback Player States
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string>('');
  const [currentAudioMetadata, setCurrentAudioMetadata] = useState<RecordingMetadata | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [ttsError, setTtsError] = useState<string>('');

  // History and User Library states
  const [bottomTab, setBottomTab] = useState<'history' | 'library'>('history');
  const [savedLibrary, setSavedLibrary] = useState<any[]>(() => {
    const raw = localStorage.getItem('tts_voicestudio_saved_library');
    return raw ? JSON.parse(raw) : [];
  });
  const [isSavingToLibrary, setIsSavingToLibrary] = useState<boolean>(false);
  const [saveToLibraryTitle, setSaveToLibraryTitle] = useState<string>('');
  const [currentPlaybackDoneAlert, setCurrentPlaybackDoneAlert] = useState<boolean>(false);

  // History states
  const [history, setHistory] = useState<RecordingMetadata[]>(() => {
    const raw = localStorage.getItem('tts_voicestudio_metadata_history');
    return raw ? JSON.parse(raw) : [];
  });
  const [currentlyPlayingHistoryId, setCurrentlyPlayingHistoryId] = useState<string | null>(null);

  // Drag and Drop State
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync state triggers
  const activeAccentHex = ACCENTS.find(a => a.id === accentId)?.hex || '#00f0ff';

  // Save keys when modified
  const updateOaiKey = (key: string) => {
    setOpenaiKey(key);
    localStorage.setItem('tts_voicestudio_oai_key', key);
  };
  const updateElKey = (key: string) => {
    setElevenlabsKey(key);
    localStorage.setItem('tts_voicestudio_el_key', key);
  };
  const updateMistralKey = (key: string) => {
    setMistralKey(key);
    localStorage.setItem('tts_voicestudio_mistral_key', key);
  };

  // Persist library items list
  const updateLibraryState = (newLib: any[]) => {
    setSavedLibrary(newLib);
    localStorage.setItem('tts_voicestudio_saved_library', JSON.stringify(newLib));
  };

  // Persist history metadata logs in LocalStorage (Blob inside IndexedDB)
  const updateHistoryState = (newHist: RecordingMetadata[]) => {
    setHistory(newHist);
    localStorage.setItem('tts_voicestudio_metadata_history', JSON.stringify(newHist));
  };

  // Adjust vocal defaults when the provider switches
  useEffect(() => {
    if (provider === 'gemini') {
      setVoiceId('Kore');
    } else if (provider === 'openai') {
      setVoiceId('alloy');
    } else if (provider === 'elevenlabs') {
      if (elCustomVoices.length > 0) {
        setVoiceId(elCustomVoices[0].id);
      } else {
        setVoiceId('21m00Tcm4TlvDq8ikWAM'); // Rachel
      }
    } else if (provider === 'mistral') {
      setVoiceId('bellatrix');
    }
  }, [provider]);

  // Dynamically apply human-like voice speaking rate fine tuning to current playback
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = voiceRate;
    }
  }, [currentAudioUrl, isPlaying, voiceRate]);

  // Fetch custom voices from ElevenLabs server
  const fetchElevenLabsVoices = async () => {
    if (!elevenlabsKey) {
      setElVoicesStatus('XI-API-Key is missing.');
      return;
    }
    setIsFetchingElVoices(true);
    setElVoicesStatus('Fetching...');
    try {
      const response = await fetch('/api/tts/voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: elevenlabsKey })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Server rejected voice listing request.');
      }

      const data = await response.json();
      if (data.voices && Array.isArray(data.voices)) {
        const formatted = data.voices.map((v: any) => ({
          id: v.voice_id,
          name: `${v.name} (${v.category || 'Custom'})`,
          gender: v.labels?.gender || 'Custom'
        }));
        setElCustomVoices(formatted);
        setElVoicesStatus('Loaded successfully!');
        if (formatted.length > 0) {
          setVoiceId(formatted[0].id);
        }
      } else {
        setElVoicesStatus('Zero voices returned.');
      }
    } catch (err: any) {
      console.error('ElevenLabs voices error:', err);
      setElVoicesStatus(`Failed: ${err.message || err}`);
    } finally {
      setIsFetchingElVoices(false);
    }
  };

  // Trigger TTS synthesis request
  const handleSynthesize = async () => {
    if (!text || !text.trim()) {
      setTtsError('Please provide a body of text to synthesize.');
      return;
    }
    setTtsError('');
    setIsSynthesizing(true);
    
    // API key check
    const currentApiKey = 
      provider === 'openai' ? openaiKey : 
      provider === 'elevenlabs' ? elevenlabsKey : 
      provider === 'mistral' ? mistralKey : undefined;

    if (provider !== 'gemini' && !currentApiKey) {
      setTtsError(`An API Key is required for calling the ${
        provider === 'openai' ? 'OpenAI' : 
        provider === 'elevenlabs' ? 'ElevenLabs' : 'Mistral'
      } engine.`);
      setIsSynthesizing(false);
      return;
    }

    // Assemble payload
    const selectedVoiceName = 
      provider === 'gemini' ? GEMINI_VOICES.find(v => v.id === voiceId)?.name :
      provider === 'openai' ? OPENAI_VOICES.find(v => v.id === voiceId)?.name :
      provider === 'mistral' ? MISTRAL_VOICES.find(v => v.id === voiceId)?.name :
      elCustomVoices.find(v => v.id === voiceId)?.name || DEFAULT_ELEVENLABS_VOICES.find(v => v.id === voiceId)?.name || 'ElevenLabs Voice';

    const ttsPayload = {
      provider,
      text,
      voiceId,
      apiKey: currentApiKey,
      config: provider === 'gemini' ? { emotion: geminiEmotion } :
              provider === 'openai' ? { model: openaiModel } : 
              provider === 'mistral' ? { model: 'mistral-cobalt-latest', pitch: voicePitch, intonation: voiceIntonation } : {
                model: elevenlabsModel,
                stability: elStability,
                similarityBoost: elSimilarity
              }
    };

    try {
      const response = await fetch('/api/tts/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ttsPayload)
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'The vocal synthesizer rejected the inputs.');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      // Create new Metadata log
      const newRec: RecordingMetadata = {
        id: `rec_${Date.now()}`,
        text: text, // hold full script text for prompter
        provider,
        voiceId,
        voiceName: selectedVoiceName || voiceId,
        timestamp: Date.now(),
        charCount: text.length,
        duration: 0 // Will auto calculate when metadata finishes loading
      };

      // Save binary to IndexedDB
      await AudioDB.saveAudio(newRec.id, audioBlob);

      // Save metadata to histories
      updateHistoryState([newRec, ...history]);

      // Focus player to this new audio track
      setCurrentAudioUrl(audioUrl);
      setCurrentAudioMetadata(newRec);
      setCurrentlyPlayingHistoryId(newRec.id);
      
      // Auto triggers audio reload, which updates the player hook
      if (audioRef.current) {
        audioRef.current.load();
        setTimeout(() => {
          audioRef.current?.play().then(() => setIsPlaying(true)).catch(e => console.log('Auto play suspended: ', e));
        }, 300);
      }

    } catch (error: any) {
      console.error(error);
      setTtsError(error.message || 'Error occurred while communicating with the synthesizer pipeline.');
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Manage history item playback
  const handlePlayFromHistory = async (rec: RecordingMetadata) => {
    if (currentlyPlayingHistoryId === rec.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
      return;
    }

    // Pull from IndexedDB audio cash safely
    try {
      const blob = await AudioDB.getAudio(rec.id);
      if (!blob) {
        setTtsError('Audio file binary was not found in local IndexedDB. It may have been cleared.');
        return;
      }

      const audioUrl = URL.createObjectURL(blob);
      
      // Revoke any dynamic old URL to conserve browser heap
      if (currentAudioUrl && currentAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioUrl);
      }

      setCurrentAudioUrl(audioUrl);
      setCurrentAudioMetadata(rec);
      setCurrentlyPlayingHistoryId(rec.id);

      // Flush player
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(e => console.log('Audio playback suspended: ', e));
        }
      }, 100);

    } catch (e: any) {
      console.error('Playback retrieval failed:', e);
      setTtsError('Failed to reconstruct original recording from IndexedDB store.');
    }
  };

  // Delete history recording
  const handleDeleteFromHistory = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await AudioDB.deleteAudio(id);
      const remaining = history.filter(h => h.id !== id);
      updateHistoryState(remaining);

      // If playing, reset player
      if (currentlyPlayingHistoryId === id) {
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
        setCurrentAudioUrl('');
        setCurrentAudioMetadata(null);
        setCurrentlyPlayingHistoryId(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Wipe whole database history
  const handleClearAllHistory = async () => {
    if (window.confirm('Wipe out all historic syntheses and audio archives from this browser? This action is irreversible.')) {
      try {
        await AudioDB.clearAll();
        updateHistoryState([]);
        
        if (audioRef.current) {
          audioRef.current.pause();
        }
        setIsPlaying(false);
        setCurrentAudioUrl('');
        setCurrentAudioMetadata(null);
        setCurrentlyPlayingHistoryId(null);
      } catch (err) {
        console.error(err);
      }
    }
  };

  // Save current playing track to custom User Library
  const handleSaveToLibrary = async (title: string) => {
    if (!currentAudioMetadata) return;
    const finalTitle = title.trim() || `Saved Recording - ${new Date().toLocaleDateString()}`;
    
    try {
      // 1. Fetch current blob from DB
      const originalBlob = await AudioDB.getAudio(currentAudioMetadata.id);
      if (!originalBlob) {
        setTtsError('Failed to save to library: original audio binary not found.');
        return;
      }

      // 2. Clone/Save blob with new library ID to ensure independence
      const libId = `lib_${Date.now()}`;
      await AudioDB.saveAudio(libId, originalBlob);

      // 3. Construct library item metadata
      const newLibItem = {
        id: libId,
        title: finalTitle,
        text: currentAudioMetadata.text,
        provider: currentAudioMetadata.provider,
        voiceId: currentAudioMetadata.voiceId,
        voiceName: currentAudioMetadata.voiceName,
        timestamp: Date.now(),
        charCount: currentAudioMetadata.charCount,
        duration: currentAudioMetadata.duration || 0
      };

      // 4. Update state & storage
      const updatedLib = [newLibItem, ...savedLibrary];
      updateLibraryState(updatedLib);

      // Hide save form and slide to library tab
      setIsSavingToLibrary(false);
      setBottomTab('library');
    } catch (err: any) {
      console.error('Error saving to library:', err);
      setTtsError(`Failed to save to library: ${err.message || err}`);
    }
  };

  // Delete from user library
  const handleDeleteFromLibrary = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Remove this saved audio from your personal library?')) {
      try {
        await AudioDB.deleteAudio(id);
        const filtered = savedLibrary.filter(item => item.id !== id);
        updateLibraryState(filtered);

        // If currently playing, clean up
        if (currentlyPlayingHistoryId === id) {
          if (audioRef.current) {
            audioRef.current.pause();
          }
          setIsPlaying(false);
          setCurrentAudioUrl('');
          setCurrentAudioMetadata(null);
          setCurrentlyPlayingHistoryId(null);
        }
      } catch (err) {
        console.error('Failed deleting from library:', err);
      }
    }
  };

  // Rename a saved library item
  const handleRenameLibraryItem = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newName = window.prompt('Enter new title for this audio file:', currentTitle);
    if (newName && newName.trim()) {
      const updated = savedLibrary.map(item => {
        if (item.id === id) {
          return { ...item, title: newName.trim() };
        }
        return item;
      });
      updateLibraryState(updated);
    }
  };

  // Play a library item
  const handlePlayFromLibrary = async (item: any) => {
    if (currentlyPlayingHistoryId === item.id) {
      if (isPlaying) {
        audioRef.current?.pause();
        setIsPlaying(true); // pause sets to false
        setIsPlaying(false);
      } else {
        audioRef.current?.play();
        setIsPlaying(true);
      }
      return;
    }

    try {
      const blob = await AudioDB.getAudio(item.id);
      if (!blob) {
        setTtsError('Audio file was not found in local cache.');
        return;
      }

      const audioUrl = URL.createObjectURL(blob);
      if (currentAudioUrl && currentAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentAudioUrl);
      }

      setCurrentAudioUrl(audioUrl);
      setCurrentAudioMetadata({
        id: item.id,
        text: item.text,
        provider: item.provider,
        voiceId: item.voiceId,
        voiceName: item.voiceName,
        timestamp: item.timestamp,
        charCount: item.charCount,
        duration: item.duration || 0
      });
      setCurrentlyPlayingHistoryId(item.id);

      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          audioRef.current.play().then(() => {
            setIsPlaying(true);
          }).catch(e => console.log('Audio playback suspended:', e));
        }
      }, 100);

    } catch (e: any) {
      console.error('Failed playing library item:', e);
      setTtsError('Failed to play saved library item.');
    }
  };

  // File Uploader Parser
  const loadFileContent = (file: File) => {
    if (!file) return;
    const isTxt = file.name.endsWith('.txt') || file.name.endsWith('.md');
    if (!isTxt) {
      alert('Unsupported file. Please upload plain text (.txt) or markdown (.md) documents.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result;
      if (typeof result === 'string') {
        setText(result);
      }
    };
    reader.readAsText(file);
  };

  // Drag listeners
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      loadFileContent(files[0]);
    }
  };

  // Player controls
  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error('Audio play failure:', err);
      });
    }
  };

  // Scrub progress
  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = value;
      setCurrentTime(value);
    }
  };

  // Adjust volume
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Number(e.target.value);
    setVolume(value);
    if (audioRef.current) {
      audioRef.current.volume = value;
    }
    if (value > 0 && isMuted) {
      setIsMuted(false);
    }
  };

  // Toggle Mute
  const toggleMute = () => {
    if (audioRef.current) {
      const nextMute = !isMuted;
      setIsMuted(nextMute);
      audioRef.current.muted = nextMute;
    }
  };

  // Download trigger
  const triggerAudioDownload = async (rec: RecordingMetadata) => {
    try {
      const blob = await AudioDB.getAudio(rec.id);
      if (!blob) {
        alert('Could not locate original recording stream binary inside IndexedDB.');
        return;
      }
      
      const fileExt = rec.provider === 'openai' || rec.provider === 'elevenlabs' ? 'mp3' : 'mp3';
      const cleanTitle = rec.text.trim().substring(0, 20).replace(/[^a-zA-Z0-9]/g, '_') || 'voc_synthesis';
      const filename = `${cleanTitle}_${rec.voiceName.split(' ')[0]}.${fileExt}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  // Time Formatter
  const stringifyTime = (seconds: number) => {
    if (isNaN(seconds) || seconds <= 0) return '0:00';
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans transition-all duration-300">
      
      {/* Header section with branding */}
      <header className="border-b border-slate-900 bg-slate-950/70 backdrop-blur-md sticky top-0 z-50">
        <div id="header-container" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-amber-400 shadow-md">
              <AudioLines className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-50 tracking-wide uppercase flex items-center gap-2">
                TTS Voice Studio
                <span className="text-[10px] font-mono tracking-normal bg-amber-500/10 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded-md uppercase">BYOK CONSOLE</span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Generative Vocal Studio & Audio Analyzer
              </p>
            </div>
          </div>

          {/* Quick theme accent triggers */}
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 border-r border-slate-900 pr-4">
              <span className="text-[10px] font-mono uppercase text-slate-500 tracking-wider">Accent:</span>
              <div className="flex items-center gap-1.5">
                {ACCENTS.map((acc) => (
                  <button
                    key={acc.id}
                    id={`accent-btn-${acc.id}`}
                    onClick={() => setAccentId(acc.id)}
                    type="button"
                    className={`w-4 h-4 rounded-full border transition-all duration-200 ${accentId === acc.id ? 'border-white scale-110 ring-2 ring-slate-800/80 shadow' : 'border-slate-800 hover:scale-105 opacity-60 hover:opacity-100'}`}
                    style={{ backgroundColor: acc.hex }}
                    title={acc.name}
                  />
                ))}
              </div>
            </div>

            {/* Platform indicator */}
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 border border-slate-800/70 py-1.5 px-3 rounded-xl shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span className="text-[11px] font-mono uppercase tracking-wider">Console Online</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main body area */}
      <main id="main-content-layout" className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
        
        {/* Alerts / Error HUD */}
        {ttsError && (
          <div className="bg-rose-500/10 border border-rose-500/25 p-4 rounded-2xl flex items-start gap-3 text-rose-300 shadow">
            <Info className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-grow text-xs leading-relaxed">
              <span className="font-semibold block text-slate-200">Synthesis Pipeline Notice</span>
              {ttsError}
            </div>
            <button
              onClick={() => setTtsError('')}
              type="button"
              className="text-rose-400 hover:text-rose-200 text-xs font-mono select-none px-1"
            >
              DISMISS
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* LEFT: Voice Settings & Typing Workstation */}
          <section className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Input Workspace Container */}
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h2 className="text-sm font-bold text-slate-100 tracking-wider">TEXT WORKSPACE</h2>
                </div>

                {/* Counter Stats */}
                <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                  <span>Chars: {text.length}</span>
                  <span className="w-1 h-1 rounded-full bg-slate-800"></span>
                  <span>Words: {text.trim() ? text.trim().split(/\s+/).length : 0}</span>
                </div>
              </div>

              {/* Template pills */}
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className="text-[10px] font-mono text-slate-500 uppercase">Load Preset:</span>
                {TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    id={`template-btn-${idx}`}
                    onClick={() => setText(tmpl.text)}
                    type="button"
                    className="text-[11px] bg-slate-900 hover:bg-slate-850 hover:text-slate-200 text-slate-400 py-1 px-2.5 rounded-lg border border-slate-800/80 transition-all duration-200"
                  >
                    {tmpl.title}
                  </button>
                ))}
              </div>

              {/* Textarea Element */}
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type or paste text content here to synthesize high-quality vocal outputs..."
                className="w-full h-48 bg-slate-900/60 text-slate-100 placeholder-slate-550 border border-slate-850 focus:border-slate-700/80 focus:ring-1 focus:ring-slate-700/50 rounded-xl p-4 text-sm leading-relaxed resize-none font-sans min-h-[160px] max-h-[400px]"
                maxLength={4000}
                style={{ scrollbarWidth: 'thin' }}
              />

              {/* Drag and Drop File Input Area */}
              <div 
                id="drop-zone"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`mt-4 border-2 border-dashed rounded-xl p-5 text-center transition-all duration-200 cursor-pointer ${
                  isDragging 
                    ? 'border-indigo-400 bg-indigo-500/10' 
                    : 'border-slate-800/70 bg-slate-900/12 hover:bg-slate-900/30'
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      loadFileContent(e.target.files[0]);
                    }
                  }}
                  accept=".txt,.md"
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center gap-1.5 pointer-events-none">
                  <Upload className="w-5 h-5 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-300">Drop your file or Click to upload</p>
                  <p className="text-[10px] text-slate-500">Supports text documents (.txt) and markdown (.md) format</p>
                </div>
              </div>
            </div>

            {/* BYOK Configuration Console */}
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow-sm flex flex-col gap-5">
              <div className="border-b border-slate-900 pb-4">
                <h2 className="text-sm font-bold text-slate-100 tracking-wider flex items-center gap-2">
                  <Key className="w-4 h-4 text-slate-400" />
                  TTS ENGINE PORTALS
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select provider & load custom key credentials
                </p>
              </div>

              {/* Card selectors for the Providers */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                
                {/* GEMINI CARD */}
                <button
                  id="provider-btn-gemini"
                  onClick={() => setProvider('gemini')}
                  type="button"
                  className={`flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'gemini'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span className="text-xs font-bold text-slate-100">Gemini Live</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Uses AI Studio default API key. Zero setup required!
                  </span>
                  <span className="text-[9px] font-semibold text-amber-400 mt-2 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/10 self-start">
                    FREE ENTRY
                  </span>
                </button>

                {/* OPENAI CARD */}
                <button
                  id="provider-btn-openai"
                  onClick={() => setProvider('openai')}
                  type="button"
                  className={`flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'openai'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileAudio className="w-4 h-4 text-sky-400" />
                    <span className="text-xs font-bold text-slate-100">OpenAI TTS</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Extremely realistic human voices with standard tts.
                  </span>
                  <span className="text-[9px] font-semibold text-sky-450 mt-2 bg-sky-505/10 px-1.5 py-0.5 rounded border border-sky-500/10 self-start">
                    BYOK SECURE
                  </span>
                </button>

                {/* ELEVENLABS CARD */}
                <button
                  id="provider-btn-elevenlabs"
                  onClick={() => setProvider('elevenlabs')}
                  type="button"
                  className={`flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'elevenlabs'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-slate-100">ElevenLabs</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Ultra premium custom voice clones & cloned files.
                  </span>
                  <span className="text-[9px] font-semibold text-emerald-450 mt-2 bg-emerald-505/10 px-1.5 py-0.5 rounded border border-emerald-500/10 self-start">
                    BYOK SECURE
                  </span>
                </button>

                {/* MISTRAL CARD */}
                <button
                  id="provider-btn-mistral"
                  onClick={() => setProvider('mistral')}
                  type="button"
                  className={`flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'mistral'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <AudioLines className="w-4 h-4 text-purple-400" />
                    <span className="text-xs font-bold text-slate-100">Mistral AI</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    High definition neural speaking model vocals.
                  </span>
                  <span className="text-[9px] font-semibold text-purple-450 mt-2 bg-purple-500/10 px-1.5 py-0.5 rounded border border-purple-500/10 self-start">
                    BYOK SECURE
                  </span>
                </button>
              </div>

              {/* Nested credentials based on chosen engine */}
              {provider === 'openai' && (
                <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      OPENAI API KEY
                    </label>
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-sky-400 hover:underline"
                    >
                      Get Key ↗
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type={hideOaiKey ? 'password' : 'text'}
                      value={openaiKey}
                      onChange={(e) => updateOaiKey(e.target.value)}
                      placeholder="sk-proj-..."
                      className="flex-grow bg-slate-950 border border-slate-850 focus:border-slate-750 text-xs text-slate-100 py-1.8 px-3 rounded-lg font-mono placeholder-slate-700"
                    />
                    <button
                      onClick={() => setHideOaiKey(!hideOaiKey)}
                      type="button"
                      className="bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 py-2 px-3 rounded-lg border border-slate-800"
                    >
                      {hideOaiKey ? 'SHOW' : 'HIDE'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Keys are kept 100% locally in your sandboxed browser LocalStorage and never stored in clear-text onto servers.
                  </p>
                </div>
              )}

              {provider === 'elevenlabs' && (
                <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-mono text-slate-400 uppercase tracking-widest">
                        ELEVENLABS API KEY
                      </label>
                      <a
                        href="https://elevenlabs.io/app/settings/api-keys"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-emerald-400 hover:underline"
                      >
                        Get Key ↗
                      </a>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type={hideElKey ? 'password' : 'text'}
                        value={elevenlabsKey}
                        onChange={(e) => updateElKey(e.target.value)}
                        placeholder="Enter ElevenLabs API Key..."
                        className="flex-grow bg-slate-950 border border-slate-850 focus:border-slate-750 text-xs text-slate-100 py-1.8 px-3 rounded-lg font-mono placeholder-slate-700"
                      />
                      <button
                        onClick={() => setHideElKey(!hideElKey)}
                        type="button"
                        className="bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 py-2 px-3 rounded-lg border border-slate-800"
                      >
                        {hideElKey ? 'SHOW' : 'HIDE'}
                      </button>
                    </div>
                  </div>

                  {/* Sync custom voices buttons */}
                  <div className="flex items-center gap-3">
                    <button
                      id="sync-el-btn"
                      onClick={fetchElevenLabsVoices}
                      disabled={isFetchingElVoices || !elevenlabsKey}
                      type="button"
                      className="flex items-center gap-1.5 text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-550 border border-emerald-550 py-1.5 px-3 rounded-lg text-white font-mono shrink-0 transition-colors disabled:opacity-40"
                    >
                      {isFetchingElVoices ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      SYNC CUSTOM CLONES
                    </button>
                    <span className="text-[10px] text-slate-400 italic">
                      {elVoicesStatus || 'Click to import your ElevenLabs personal clones.'}
                    </span>
                  </div>
                </div>
              )}

              {provider === 'mistral' && (
                <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      MISTRAL API KEY
                    </label>
                    <a
                      href="https://console.mistral.ai/api-keys/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-purple-400 hover:underline"
                    >
                      Get Key ↗
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type={hideMistralKey ? 'password' : 'text'}
                      value={mistralKey}
                      onChange={(e) => updateMistralKey(e.target.value)}
                      placeholder="Enter Mistral API Key..."
                      className="flex-grow bg-slate-950 border border-slate-850 focus:border-slate-750 text-xs text-slate-100 py-1.8 px-3 rounded-lg font-mono placeholder-slate-705"
                    />
                    <button
                      onClick={() => setHideMistralKey(!hideMistralKey)}
                      type="button"
                      className="bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 py-2 px-3 rounded-lg border border-slate-800"
                    >
                      {hideMistralKey ? 'SHOW' : 'HIDE'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Keys are kept 100% locally in your sandboxed browser LocalStorage and never stored in clear-text onto servers.
                  </p>
                </div>
              )}

              {/* VOICE MANAGER CONTROL */}
              <div className="flex flex-col gap-2 mt-2">
                <label className="text-[11px] font-mono text-slate-400 uppercase tracking-widest block">
                  SELECT VOCAL PROFILE
                </label>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {/* Real Rendering of Voices */}
                  {provider === 'gemini' && GEMINI_VOICES.map((v) => (
                    <button
                      key={v.id}
                      id={`voice-btn-${v.id}`}
                      onClick={() => setVoiceId(v.id)}
                      type="button"
                      className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                        voiceId === v.id
                          ? 'bg-slate-900 border-indigo-500/60 shadow text-slate-100'
                          : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                      }`}
                    >
                      <span className="text-xs font-bold truncate block">{v.id}</span>
                      <span className="text-[9px] mt-1 text-slate-500">{v.gender} • {v.id === 'Kore' ? 'Balanced' : v.id === 'Puck' ? 'High' : 'Deep'}</span>
                    </button>
                  ))}

                  {provider === 'openai' && OPENAI_VOICES.map((v) => (
                    <button
                      key={v.id}
                      id={`voice-btn-${v.id}`}
                      onClick={() => setVoiceId(v.id)}
                      type="button"
                      className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                        voiceId === v.id
                          ? 'bg-slate-900 border-sky-500/60 shadow text-slate-100'
                          : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                      }`}
                    >
                      <span className="text-xs font-bold truncate block">{v.id}</span>
                      <span className="text-[9px] mt-1 text-slate-500">{v.gender} • Profile</span>
                    </button>
                  ))}

                  {provider === 'elevenlabs' && (
                    // Show custom voices first, then preset defaults
                    <>
                      {elCustomVoices.map((v) => (
                        <button
                          key={v.id}
                          id={`voice-btn-${v.id}`}
                          onClick={() => setVoiceId(v.id)}
                          type="button"
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                            voiceId === v.id
                              ? 'bg-slate-900 border-emerald-500/60 shadow text-slate-100'
                              : 'bg-slate-900/15 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                          }`}
                        >
                          <span className="text-xs font-bold truncate block">{v.name.split(' ')[0]}</span>
                          <span className="text-[9px] mt-1 text-slate-500">{v.gender} • My Clone</span>
                        </button>
                      ))}
                      {DEFAULT_ELEVENLABS_VOICES.map((v) => (
                        <button
                          key={v.id}
                          id={`voice-btn-${v.id}`}
                          onClick={() => setVoiceId(v.id)}
                          type="button"
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                            voiceId === v.id
                              ? 'bg-slate-900 border-emerald-500/60 shadow text-slate-100'
                              : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                          }`}
                        >
                          <span className="text-xs font-bold truncate block">{v.name.split(' ')[0]}</span>
                          <span className="text-[9px] mt-1 text-slate-500">{v.gender} • Preset</span>
                        </button>
                      ))}
                    </>
                  )}

                  {provider === 'mistral' && MISTRAL_VOICES.map((v) => (
                    <button
                      key={v.id}
                      id={`voice-btn-${v.id}`}
                      onClick={() => setVoiceId(v.id)}
                      type="button"
                      className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                        voiceId === v.id
                          ? 'bg-slate-900 border-purple-500/60 shadow text-slate-100'
                          : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                      }`}
                    >
                      <span className="text-xs font-bold truncate block">{v.id}</span>
                      <span className="text-[9px] mt-1 text-slate-500">{v.gender} • Profile</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ACCORDION/EXPANDABLE PARAMETER SETTING TUBES */}
              <div className="bg-slate-900/20 border border-slate-900/80 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Settings className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-mono text-slate-300 uppercase tracking-widest">ADVANCED ENGINE MODIFIERS</span>
                </div>

                {provider === 'gemini' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Vocal Emotion/Tone Prefix</label>
                      <select
                        value={geminiEmotion}
                        onChange={(e) => setGeminiEmotion(e.target.value)}
                        className="bg-slate-950 border border-slate-850 hover:border-slate-750 text-xs py-1.5 px-3 rounded-lg text-slate-200 focus:outline-none"
                      >
                        <option value="default">Default Speaking Narrative</option>
                        <option value="cheerful">Cheerful Storytelling</option>
                        <option value="excited">Excited Speaker Pro</option>
                        <option value="professional">Direct Corporate Voice</option>
                        <option value="whisper">Hushed ASMR whisper</option>
                        <option value="serious">Calm Deep Serious</option>
                        <option value="sad">Slow Melancholic Drama</option>
                      </select>
                    </div>
                  </div>
                )}

                {provider === 'openai' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">OpenAI Speed Model</label>
                      <select
                        value={openaiModel}
                        onChange={(e) => setOpenaiModel(e.target.value)}
                        className="bg-slate-950 border border-slate-850 hover:border-slate-750 text-xs py-1.5 px-3 rounded-lg text-slate-200 focus:outline-none"
                      >
                        <option value="tts-1">tts-1 (Low-Latency Standard)</option>
                        <option value="tts-1-hd">tts-1-hd (High Definition Studio)</option>
                      </select>
                    </div>
                  </div>
                )}

                {provider === 'elevenlabs' && (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5 w-full">
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Synthesis Engine Model</label>
                      <select
                        value={elevenlabsModel}
                        onChange={(e) => setElevenlabsModel(e.target.value)}
                        className="bg-slate-950 border border-slate-850 hover:border-slate-750 text-xs py-1.5 px-3 rounded-lg text-slate-200 focus:outline-none"
                      >
                        <option value="eleven_flash_v1_5">eleven_flash_v1_5 (Fastest & Light)</option>
                        <option value="eleven_multilingual_v2">eleven_multilingual_v2 (Ultra High Quality)</option>
                        <option value="eleven_turbo_v2_5">eleven_turbo_v2_5 (Low-latency Realtime)</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-[10px] text-slate-400 font-mono uppercase">
                          <span>Stability</span>
                          <span>{elStability.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={elStability}
                          onChange={(e) => setElStability(Number(e.target.value))}
                          className="accent-emerald-500 h-1 bg-slate-950 rounded-lg cursor-pointer my-2"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between text-[10px] text-slate-400 font-mono uppercase">
                          <span>Clarity / Similarity Boost</span>
                          <span>{elSimilarity.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={elSimilarity}
                          onChange={(e) => setElSimilarity(Number(e.target.value))}
                          className="accent-emerald-500 h-1 bg-slate-950 rounded-lg cursor-pointer my-2"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* UNIVERSAL HUMAN-LIKE VOICE CONTROLS */}
                <div className="border-t border-slate-900 mt-4 pt-4 flex flex-col gap-3">
                  <div className="flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest">HUMAN-LIKE VOCAL TUNER (PITCH, SPEED, CONTOUR)</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Speaking Speed Rate */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] text-slate-400 font-mono uppercase">
                        <span>Speed (Rate)</span>
                        <span className="text-indigo-400">{voiceRate.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={voiceRate}
                        onChange={(e) => setVoiceRate(Number(e.target.value))}
                        className="accent-indigo-400 h-1 bg-slate-950 rounded-lg cursor-pointer my-1.5"
                      />
                      <div className="flex justify-between text-[8px] text-slate-600 font-mono">
                        <span>ASMR Slow</span>
                        <span>Natural</span>
                        <span>Rapid</span>
                      </div>
                    </div>

                    {/* Vocal Pitch Offset */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] text-slate-400 font-mono uppercase">
                        <span>Pitch Offset</span>
                        <span className="text-indigo-400">{voicePitch > 0 ? `+${voicePitch}` : voicePitch}</span>
                      </div>
                      <input
                        type="range"
                        min="-10"
                        max="10"
                        step="1"
                        value={voicePitch}
                        onChange={(e) => setVoicePitch(Number(e.target.value))}
                        className="accent-indigo-400 h-1 bg-slate-950 rounded-lg cursor-pointer my-1.5"
                      />
                      <div className="flex justify-between text-[8px] text-slate-600 font-mono">
                        <span>Baritone</span>
                        <span>Neutral</span>
                        <span>Soprano</span>
                      </div>
                    </div>

                    {/* Intonation & Bass Contour Boost */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between text-[9px] text-slate-400 font-mono uppercase">
                        <span>Intonation Contour</span>
                        <span className="text-indigo-400">{voiceIntonation}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={voiceIntonation}
                        onChange={(e) => setVoiceIntonation(Number(e.target.value))}
                        className="accent-indigo-400 h-1 bg-slate-950 rounded-lg cursor-pointer my-1.5"
                      />
                      <div className="flex justify-between text-[8px] text-slate-600 font-mono">
                        <span>Flat / Calm</span>
                        <span>Expressive</span>
                        <span>Resonance</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* GENERATE SUBMIT ROW */}
              <button
                id="synthesize-btn-main"
                onClick={handleSynthesize}
                disabled={isSynthesizing}
                type="button"
                className={`w-full py-3 px-6 rounded-xl font-bold transition-all duration-300 text-sm flex items-center justify-center gap-2 hover:scale-[1.01] hover:shadow-lg select-none disabled:opacity-40`}
                style={{ 
                  backgroundColor: isSynthesizing ? 'rgba(71,85,105,1)' : activeAccentHex,
                  boxShadow: isSynthesizing ? 'none' : `0 4px 20px ${hexToRGB(activeAccentHex, 0.25)}`
                }}
              >
                {isSynthesizing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    SYNTHESIZING VOCAL TEXTURES...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 animate-pulse text-white" />
                    GENERATE HIGH-QUALITY VOICE
                  </>
                )}
              </button>

            </div>

          </section>

          {/* RIGHT: Web Player & Dynamic Visual Reactive Canvas */}
          <section className="lg:col-span-5 flex flex-col gap-6 sticky lg:top-24">
            
            {/* Visualizer Frame */}
            <div className="h-[360px] md:h-[400px]">
              <AudioVisualizer
                audioRef={audioRef}
                isPlaying={isPlaying}
                visualStyle={visualStyle}
                setVisualStyle={setVisualStyle}
                accentColor={activeAccentHex}
                currentAudioMetadata={currentAudioMetadata}
                currentTime={currentTime}
                duration={duration}
              />
            </div>

            {/* Web Audio Element Interface Card */}
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-900 pb-3">
                <span className="text-xs font-bold text-slate-100 uppercase tracking-widest flex items-center gap-1.5">
                  <FileAudio className="w-4 h-4 text-emerald-400" />
                  MONITOR PLAYER
                </span>
                
                {/* Platform Badge */}
                {currentAudioMetadata && (
                  <span className="text-[10px] font-mono py-0.5 px-2 bg-slate-900 border border-slate-800 rounded text-slate-300">
                    {currentAudioMetadata.provider.toUpperCase()} • {currentAudioMetadata.voiceName.split(' ')[0]}
                  </span>
                )}
              </div>

              {/* Subtext info holding playing preview */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-3">
                {currentAudioMetadata ? (
                  <p className="text-xs text-slate-300 tracking-wide line-clamp-2 leading-relaxed italic">
                    "{currentAudioMetadata.text}"
                  </p>
                ) : (
                  <p className="text-xs text-slate-500 tracking-wide leading-relaxed">
                    No active recording stream playing. Synthesize a script or trigger a history recording to begin!
                  </p>
                )}
              </div>

              {/* Custom Scrubber progress bar */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                  <span>{stringifyTime(currentTime)}</span>
                  <span>{stringifyTime(duration)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleProgressChange}
                  disabled={!currentAudioUrl}
                  className="w-full h-1 bg-slate-905 cursor-pointer rounded-lg accent-indigo-400 disabled:opacity-30"
                />
              </div>

              {/* Functional Key Player Buttons */}
              <div className="flex items-center justify-between gap-4 mt-1">
                <div className="flex items-center gap-3">
                  
                  {/* Play & Pause Trigger */}
                  <button
                    id="player-play-btn"
                    onClick={togglePlayPause}
                    disabled={!currentAudioUrl}
                    type="button"
                    className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-900 hover:bg-slate-850 hover:text-white text-slate-200 border border-slate-800 transition-all duration-150 disabled:opacity-30 shadow-sm shrink-0"
                    title={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
                  </button>

                  {/* Volume Controller Mute */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleMute}
                      disabled={!currentAudioUrl}
                      type="button"
                      className="text-slate-400 hover:text-slate-200 focus:outline-none disabled:opacity-30"
                      title={isMuted ? 'Unmute' : 'Mute'}
                    >
                      {isMuted ? <VolumeX className="w-4 h-4 text-rose-450" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      disabled={!currentAudioUrl}
                      className="w-16 sm:w-20 md:w-24 h-1 bg-slate-905 cursor-pointer rounded-lg accent-slate-400 disabled:opacity-30"
                    />
                  </div>
                </div>

                {/* Actions row */}
                <div className="flex items-center gap-2">
                  {/* Save to Library button */}
                  <button
                    id="player-save-library-btn"
                    onClick={() => {
                      if (!currentAudioMetadata) return;
                      setSaveToLibraryTitle(`My Voice Recording - ${new Date().toLocaleDateString()}`);
                      setIsSavingToLibrary(!isSavingToLibrary);
                    }}
                    disabled={!currentAudioUrl}
                    type="button"
                    className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs py-2 px-3.5 rounded-lg text-slate-200 flex items-center gap-1.5 tracking-wide font-medium disabled:opacity-30 select-none transition-colors"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-indigo-450" />
                    SAVE TO LIBRARY
                  </button>

                  {/* Instant downloadable button */}
                  <button
                    id="player-download-btn"
                    onClick={() => currentAudioMetadata && triggerAudioDownload(currentAudioMetadata)}
                    disabled={!currentAudioMetadata}
                    type="button"
                    className="bg-slate-900 hover:bg-slate-850 border border-slate-800 text-xs py-2 px-3.5 rounded-lg text-slate-200 flex items-center gap-1.5 tracking-wide font-medium disabled:opacity-30 select-none transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    DOWNLOAD
                  </button>
                </div>
              </div>

              {/* Optional inline save metadata block */}
              {isSavingToLibrary && (
                <div className="bg-slate-900/60 border border-slate-800/80 p-4 rounded-xl flex flex-col gap-3 animate-fade">
                  <span className="text-[10px] font-mono text-slate-450 uppercase tracking-widest block font-bold">SAVE TRACK TO PERSONAL LIBRARY</span>
                  <div className="flex flex-col gap-1">
                    <input
                      type="text"
                      value={saveToLibraryTitle}
                      onChange={(e) => setSaveToLibraryTitle(e.target.value)}
                      placeholder="Enter custom title..."
                      className="bg-slate-950 border border-slate-850 focus:border-slate-755 text-xs text-slate-100 py-2.5 px-3 rounded-lg font-sans w-full"
                    />
                  </div>
                  <div className="flex items-center justify-end gap-2 mt-1">
                    <button
                      onClick={() => setIsSavingToLibrary(false)}
                      className="text-[10px] font-bold text-slate-400 hover:text-slate-300 py-1.5 px-3.5 rounded-lg border border-slate-800 cursor-pointer"
                    >
                      CANCEL
                    </button>
                    <button
                      onClick={() => handleSaveToLibrary(saveToLibraryTitle)}
                      className="text-[10px] font-bold text-white bg-indigo-600 hover:bg-indigo-550 py-1.5 px-3.5 rounded-lg shadow cursor-pointer transition-colors"
                    >
                      CONFIRM SAVE
                    </button>
                  </div>
                </div>
              )}

              {/* Alert Notification Invite to Fullscreen */}
              {currentPlaybackDoneAlert && (
                <div className="bg-gradient-to-r from-indigo-950/45 via-purple-950/40 to-slate-950/40 border border-indigo-500/20 p-3.5 rounded-xl flex items-center justify-between gap-3 animate-fade">
                  <div className="flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-indigo-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-slate-200">Playback Done!</p>
                      <p className="text-[10px] text-slate-400 leading-relaxed">
                        Excellent generation. Toggle the **Fullscreen button** on the visualizer for an immersive experience!
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentPlaybackDoneAlert(false)}
                    className="text-[10px] text-slate-500 hover:text-slate-350 underline uppercase tracking-wider font-mono shrink-0 select-none cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {/* Traditional Native Hidden HTML5 Audio Component */}
              <audio
                ref={audioRef}
                src={currentAudioUrl || undefined}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onTimeUpdate={() => audioRef.current && setCurrentTime(audioRef.current.currentTime)}
                onLoadedMetadata={() => audioRef.current && setDuration(audioRef.current.duration)}
                onEnded={() => {
                  setIsPlaying(false);
                  setCurrentTime(0);
                  setCurrentPlaybackDoneAlert(true);
                }}
                className="hidden"
                preload="auto"
              />

            </div>

          </section>

        </div>

        {/* BOTTOM: Syntheses History Library Panel (IndexedDB cache) */}
        <section className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow-sm">
          
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-900 pb-4 mb-5">
            <div>
              <div className="flex items-center gap-6">
                {/* Tab 1: History Log */}
                <button
                  onClick={() => setBottomTab('history')}
                  type="button"
                  className={`pb-2.5 text-sm font-bold tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                    bottomTab === 'history'
                      ? 'border-indigo-500 text-slate-100'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <AudioLines className="w-4 h-4 text-indigo-400" />
                  AUTOMATIC ARCHIVE HISTORY ({history.length})
                </button>

                {/* Tab 2: Saved Library */}
                <button
                  onClick={() => setBottomTab('library')}
                  type="button"
                  className={`pb-2.5 text-sm font-bold tracking-wider flex items-center gap-2 border-b-2 transition-all cursor-pointer ${
                    bottomTab === 'library'
                      ? 'border-indigo-400 text-slate-100'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Bookmark className="w-4 h-4 text-indigo-450" />
                  MY SAVED LIBRARY ({savedLibrary.length})
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                {bottomTab === 'history' 
                  ? 'All immediate syntheses in this session are saved here automatically (cached in IndexedDB).'
                  : 'Permanently saved, custom named audio tracks for quick streaming or downloading.'
                }
              </p>
            </div>

            {/* Wipe cache buttons */}
            {bottomTab === 'history' ? (
              history.length > 0 && (
                <button
                  onClick={handleClearAllHistory}
                  type="button"
                  className="text-xs text-rose-450 hover:text-rose-400 font-semibold flex items-center gap-1.5 px-3 py-1.8 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 rounded-lg transition-colors cursor-pointer select-none"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  CLEAR HISTORY
                </button>
              )
            ) : (
              savedLibrary.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Wipe out your entire Saved Library? This action is permanent and irreversible.')) {
                      savedLibrary.forEach(async (item) => {
                        try { await AudioDB.deleteAudio(item.id); } catch(e) {}
                      });
                      updateLibraryState([]);
                    }
                  }}
                  type="button"
                  className="text-xs text-rose-450 hover:text-rose-400 font-semibold flex items-center gap-1.5 px-3 py-1.8 bg-rose-500/5 hover:bg-rose-500/10 border border-rose-500/10 rounded-lg transition-colors cursor-pointer select-none"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  WIPE SAVED LIBRARY
                </button>
              )
            )}
          </div>

          {/* Conditional rendering based on active tab */}
          {bottomTab === 'history' ? (
            history.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/10 border border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center gap-2">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
                  <FileAudio className="w-6 h-6 text-slate-600 animate-pulse" />
                </div>
                <p className="text-xs font-semibold text-slate-400 mt-1">HISTORY IS EMPTY</p>
                <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                  Your synthesized audio sessions will appear here automatically. They are temporarily cached client-side in IndexedDB.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-[10px] font-mono text-slate-500 border-b border-slate-900 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Synthesis Text Summary</th>
                      <th className="py-2.5 px-3">vocalist profile</th>
                      <th className="py-2.5 px-3">specs</th>
                      <th className="py-2.5 px-3">TIMESTAMP</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 font-medium">
                    {history.map((rec) => {
                      const isCurrent = currentlyPlayingHistoryId === rec.id;
                      const isThisPlaying = isCurrent && isPlaying;

                      return (
                        <tr
                          key={rec.id}
                          id={`history-row-${rec.id}`}
                          onClick={() => handlePlayFromHistory(rec)}
                          className={`hover:bg-slate-900/40 cursor-pointer transition-colors ${
                            isCurrent ? 'bg-indigo-950/15 text-slate-100' : ''
                          }`}
                        >
                          {/* Play State icon inline toggle */}
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                                isThisPlaying 
                                  ? 'bg-amber-500/15 text-amber-400' 
                                  : isCurrent 
                                  ? 'bg-slate-900 text-slate-300' 
                                  : 'bg-slate-900/40 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {isThisPlaying ? (
                                <Pause className="w-3 h-3 fill-current animate-pulse" />
                              ) : (
                                <Play className="w-3 h-3 fill-current ml-0.5" />
                              )}
                            </button>
                          </td>

                          {/* Summary text info */}
                          <td className="py-3 px-3 max-w-xs md:max-w-md truncate">
                            <span className={`${isCurrent ? 'text-indigo-300' : 'text-slate-200'} font-semibold block`}>
                              {rec.text.substring(0, 75)}...
                            </span>
                          </td>

                          {/* Vocal Profile info */}
                          <td className="py-3 px-3 capitalize">
                            <span className={`inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md border text-[10px] uppercase ${
                              rec.provider === 'gemini' 
                                ? 'bg-indigo-500/5 text-indigo-450 border-indigo-505/10'
                                : rec.provider === 'openai'
                                ? 'bg-sky-505/5 text-sky-450 border-sky-505/10'
                                : rec.provider === 'mistral'
                                ? 'bg-purple-500/5 text-purple-400 border-purple-500/10'
                                : 'bg-emerald-500/5 text-emerald-450 border-emerald-505/10'
                            }`}>
                              {rec.provider}
                            </span>
                            <span className="text-xs text-slate-300 ml-2 block sm:inline font-semibold font-sans">
                              {rec.voiceName.split(' ')[0]}
                            </span>
                          </td>

                          {/* Parameters length metrics */}
                          <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">
                            {rec.charCount} Chars
                          </td>

                          {/* Timestamps */}
                          <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">
                            {new Date(rec.timestamp).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </td>

                          {/* Standard row specific actions */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              
                              {/* Download */}
                              <button
                                id={`dl-history-btn-${rec.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerAudioDownload(rec);
                                }}
                                type="button"
                                className="p-1.5 border border-slate-900 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 cursor-pointer"
                                title="Download track"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                id={`del-history-btn-${rec.id}`}
                                onClick={(e) => handleDeleteFromHistory(rec.id, e)}
                                type="button"
                                className="p-1.5 border border-slate-900 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-rose-450 cursor-pointer"
                                title="Delete from cache"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            savedLibrary.length === 0 ? (
              <div className="text-center py-12 bg-slate-900/10 border border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center gap-2 animate-fade">
                <div className="p-3 bg-slate-900 border border-slate-800 rounded-2xl">
                  <Bookmark className="w-6 h-6 text-indigo-400 animate-pulse" />
                </div>
                <p className="text-xs font-semibold text-slate-400 mt-1">LIBRARY IS EMPTY</p>
                <p className="text-[11px] text-slate-500 max-w-xs leading-relaxed">
                  You haven't saved any recording yet. Tap the **"Save to Library"** button in the monitor player above to store your favorite tracks with custom names!
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="text-[10px] font-mono text-slate-500 border-b border-slate-900 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Saved Audios Custom Name</th>
                      <th className="py-2.5 px-3 text-slate-450 font-bold">Transcription snippet</th>
                      <th className="py-2.5 px-3">Vocal Profile</th>
                      <th className="py-2.5 px-3">specs</th>
                      <th className="py-2.5 px-3">DATE SAVED</th>
                      <th className="py-2.5 px-3 text-right font-bold text-slate-450">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900/60 font-medium">
                    {savedLibrary.map((item) => {
                      const isCurrent = currentlyPlayingHistoryId === item.id;
                      const isThisPlaying = isCurrent && isPlaying;

                      return (
                        <tr
                          key={item.id}
                          id={`library-row-${item.id}`}
                          onClick={() => handlePlayFromLibrary(item)}
                          className={`hover:bg-slate-900/40 cursor-pointer transition-colors ${
                            isCurrent ? 'bg-indigo-950/20 text-slate-100' : ''
                          }`}
                        >
                          {/* Play Status icon inline trigger */}
                          <td className="py-3 px-3">
                            <button
                              type="button"
                              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                                isThisPlaying 
                                  ? 'bg-indigo-500/15 text-indigo-400' 
                                  : isCurrent 
                                  ? 'bg-slate-900 text-slate-300' 
                                  : 'bg-slate-900/40 text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              {isThisPlaying ? (
                                <Pause className="w-3 h-3 fill-current animate-pulse" />
                              ) : (
                                <Play className="w-3 h-3 fill-current ml-0.5" />
                              )}
                            </button>
                          </td>

                          {/* Saved Audio custom Title with Rename helper trigger */}
                          <td className="py-3 px-3 font-semibold text-slate-150 py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-100 md:text-sm">{item.title}</span>
                              <button
                                onClick={(e) => handleRenameLibraryItem(item.id, item.title, e)}
                                title="Rename Saved Audio"
                                className="text-slate-500 hover:text-indigo-400 p-1 rounded hover:bg-slate-900/60"
                              >
                                <Edit3 className="w-3 h-3" />
                              </button>
                            </div>
                          </td>

                          {/* Text summary snippet */}
                          <td className="py-3 px-3 max-w-[150px] md:max-w-xs truncate italic text-slate-400 text-[11px]">
                            "{item.text.substring(0, 60)}..."
                          </td>

                          {/* Vocal Profile info */}
                          <td className="py-3 px-3 capitalize">
                            <span className={`inline-flex items-center gap-1.5 py-0.5 px-2 rounded-md border text-[10px] uppercase ${
                              item.provider === 'gemini' 
                                ? 'bg-indigo-500/5 text-indigo-455 border-indigo-505/10'
                                : item.provider === 'openai'
                                ? 'bg-sky-505/5 text-sky-450 border-sky-550/10'
                                : item.provider === 'mistral'
                                ? 'bg-purple-500/5 text-purple-400 border-purple-500/10'
                                : 'bg-emerald-500/5 text-emerald-450 border-emerald-555/10'
                            }`}>
                              {item.provider}
                            </span>
                            <span className="text-xs text-slate-300 ml-2 block sm:inline font-semibold">
                              {item.voiceName.split(' ')[0]}
                            </span>
                          </td>

                          {/* specs character length */}
                          <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">
                            {item.charCount} Chars
                          </td>

                          {/* Date Saved */}
                          <td className="py-3 px-3 text-slate-400 font-mono text-[10px]">
                            {new Date(item.timestamp).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </td>

                          {/* Row Actions */}
                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              
                              {/* Download */}
                              <button
                                id={`dl-library-btn-${item.id}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerAudioDownload(item);
                                }}
                                type="button"
                                className="p-1.5 border border-slate-900 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-205 cursor-pointer"
                                title="Download Saved track"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete */}
                              <button
                                id={`del-library-btn-${item.id}`}
                                onClick={(e) => handleDeleteFromLibrary(item.id, e)}
                                type="button"
                                className="p-1.5 border border-slate-900 rounded bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-rose-450 cursor-pointer"
                                title="Remove from Library"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>

                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

        </section>

      </main>

      {/* Footer Branding section */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6">
        <div id="footer-container" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:flex sm:items-center sm:justify-between">
          <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600">
            TTS Voice Studio © {new Date().getFullYear()} • Bring Your Own Key Secure Pipeline
          </p>
          <p className="text-[10px] font-mono text-slate-500 mt-2 sm:mt-0">
            High performance Web Audio Analyser • Core nodes integrated
          </p>
        </div>
      </footer>

    </div>
  );
}
