import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, Pause, Download, Trash2, Key, Info, 
  Settings, RotateCcw, Sliders, VolumeX, Volume2, 
  Sparkles, FileText, Upload, RefreshCw, AudioLines, 
  FileAudio, CheckCircle, ChevronDown, Award,
  Bookmark, Search, Maximize2, Minimize2, HelpCircle, Edit3,
  Globe, Zap, User
} from 'lucide-react';
import AudioVisualizer from './components/AudioVisualizer';
import { AudioDB } from './utils/audioDb';
import {
  XAI_OAUTH,
  generatePKCEAsync,
  buildXaiAuthorizeUrl,
  exchangeCodeForTokens,
  refreshXaiAccessToken,
  isTokenExpired,
  getValidXaiAccessToken,
  loadXaiOAuthTokens,
  saveXaiOAuthTokens,
  type XaiOAuthTokens,
} from './utils/xaiOAuth';

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

const XAI_VOICES = [
  { id: 'eve', name: 'Eve (Energetic & Upbeat Female)', gender: 'Female' },
  { id: 'ara', name: 'Ara (Warm & Friendly Female)', gender: 'Female' },
  { id: 'rex', name: 'Rex (Confident & Clear Male)', gender: 'Male' },
  { id: 'sal', name: 'Sal (Smooth & Balanced Neutral)', gender: 'Neutral' },
  { id: 'leo', name: 'Leo (Authoritative & Strong Male)', gender: 'Male' },
];

export default function App() {
  // Input fields
  const [text, setText] = useState<string>(TEMPLATES[0].text);
  const [provider, setProvider] = useState<string>('gemini'); // gemini, openai, elevenlabs, mistral, openrouter, gemini-multi, omnivoice, voxcpm
  const [voiceId, setVoiceId] = useState<string>('Kore');
  const [accentId, setAccentId] = useState<string>('cyan');
  const [visualStyle, setVisualStyle] = useState<string>('cosmic');
  // Signal-counter: incremented after each successful synthesis to trigger the
  // visualizer's immersive overlay mode (large centered panel + teleprompter).
  const [immersiveTrigger, setImmersiveTrigger] = useState<number>(0);

  // API Secrets (Securely saved locally in client’s localStorage)
  const [openaiKey, setOpenaiKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_oai_key') || '');
  const [elevenlabsKey, setElevenlabsKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_el_key') || '');
  const [mistralKey, setMistralKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_mistral_key') || '');
  const [geminiKey, setGeminiKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_gemini_key') || '');
  const [openrouterKey, setOpenrouterKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_openrouter_key') || '');
  const [xaiKey, setXaiKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_xai_key') || '');
  const [fishKey, setFishKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_fish_key') || '');
  const [cerebrasKey, setCerebrasKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_cerebras_key') || '');
  const [nvidiaKey, setNvidiaKey] = useState<string>(() => localStorage.getItem('tts_voicestudio_nvidia_key') || '');
  const [hfToken, setHfToken] = useState<string>(() => localStorage.getItem('tts_voicestudio_hf_token') || '');
  // Reference audio for HF Gradio providers (OmniVoice / VoxCPM). Stored as base64.
  const [hfRefAudio, setHfRefAudio] = useState<string>('');
  const [hfRefAudioName, setHfRefAudioName] = useState<string>('');

  // OmniVoice mode: 'cloning' (requires ref) or 'design' (attribute-based, no ref)
  const [omniVoiceMode, setOmniVoiceMode] = useState<'cloning' | 'design'>('cloning');

  // Design mode controls for OmniVoice
  const [omniDesignGender, setOmniDesignGender] = useState<string>('Auto');
  const [omniDesignAge, setOmniDesignAge] = useState<string>('Auto');
  const [omniDesignPitch, setOmniDesignPitch] = useState<string>('Auto');
  const [omniDesignStyle, setOmniDesignStyle] = useState<string>('Auto');
  const [omniDesignEnglishAccent, setOmniDesignEnglishAccent] = useState<string>('Auto');
  const [omniDesignChineseDialect, setOmniDesignChineseDialect] = useState<string>('Auto');

  // Clear reference audio + reset mode when leaving OmniVoice
  useEffect(() => {
    if (provider !== 'omnivoice') {
      setHfRefAudio('');
      setHfRefAudioName('');
      setOmniVoiceMode('cloning');
    }
  }, [provider]);

  // Clear in-progress voice-creation upload when leaving Fish Audio.
  useEffect(() => {
    if (provider !== 'fish') {
      setFishCreateAudio('');
      setFishCreateAudioName('');
      setFishCreateName('');
      setFishCreateStatus('');
    }
  }, [provider]);

  // Check whether the deployer has provided a shared Fish Audio key pool
  // (FISH_API_KEYS env var on the server). When true, visitors can synthesize
  // and preview Fish Audio WITHOUT their own key — the headline "free" offer.
  // Fetched once on mount; the result is stable for the session lifetime.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/tts/fish/pool-status')
      .then(r => r.json())
      .then(data => { if (!cancelled) setFishPoolAvailable(!!data.available); })
      .catch(() => { /* server may not expose the route yet — default to BYOK */ });
    return () => { cancelled = true; };
  }, []);

  const [hideOaiKey, setHideOaiKey] = useState<boolean>(true);
  const [hideElKey, setHideElKey] = useState<boolean>(true);
  const [hideMistralKey, setHideMistralKey] = useState<boolean>(true);
  const [hideGeminiKey, setHideGeminiKey] = useState<boolean>(true);
  const [hideOrKey, setHideOrKey] = useState<boolean>(true);
  const [hideXaiKey, setHideXaiKey] = useState<boolean>(true);
  const [hideFishKey, setHideFishKey] = useState<boolean>(true);
  const [hideCerebrasKey, setHideCerebrasKey] = useState<boolean>(true);
  const [hideNvidiaKey, setHideNvidiaKey] = useState<boolean>(true);
  const [hideHfToken, setHideHfToken] = useState<boolean>(true);

  // xAI OAuth (SuperGrok / X Premium+) — alternative to pasting a raw API key.
  // When present and valid, this is preferred for all xAI operations.
  // Tokens are stored in localStorage (same trust model as manual keys).
  const [xaiOauthTokens, setXaiOauthTokens] = useState<XaiOAuthTokens | null>(() => loadXaiOAuthTokens());

  // Advanced provider controls
  const [geminiEmotion, setGeminiEmotion] = useState<string>('default');
  const [openaiModel, setOpenaiModel] = useState<string>('tts-1');
  const [elevenlabsModel, setElevenlabsModel] = useState<string>('eleven_flash_v1_5');
  // OpenRouter: model is the routed TTS engine (e.g. grok-voice, kokoro, gemini-tts, openai-tts etc.)
  // See https://openrouter.ai/models?output_modalities=speech for current list
  const [openrouterModel, setOpenrouterModel] = useState<string>('openai/gpt-4o-mini-tts-2025-12-15');
  const [openrouterSpeed, setOpenrouterSpeed] = useState<number | undefined>(undefined);

  // xAI Grok Voice specific
  const [xaiLanguage, setXaiLanguage] = useState<string>('en');
  const [xaiSpeed, setXaiSpeed] = useState<number>(1.0);

  // Fish Audio specific — model is the engine (free: s2.1-pro-free), voice is a
  // reference_id from /model. S2-Pro exposes temperature / top_p / prosody.speed.
  const [fishModel, setFishModel] = useState<string>('s2.1-pro-free');
  const [fishTemperature, setFishTemperature] = useState<number>(0.7);
  const [fishTopP, setFishTopP] = useState<number>(0.7);
  const [fishSpeed, setFishSpeed] = useState<number>(1.0);
  const [fishLatency, setFishLatency] = useState<string>('normal');

  const [elStability, setElStability] = useState<number>(0.5);
  const [elSimilarity, setElSimilarity] = useState<number>(0.75);

  // Gemini Multi-speaker specific state
  const [gmSpeaker1, setGmSpeaker1] = useState<string>('Joe');
  const [gmVoice1, setGmVoice1] = useState<string>('Kore');
  const [gmSpeaker2, setGmSpeaker2] = useState<string>('Jane');
  const [gmVoice2, setGmVoice2] = useState<string>('Puck');

  // Advanced voice customization options (Pitch, Rate, Intonation)
  const [voicePitch, setVoicePitch] = useState<number>(0);
  const [voiceRate, setVoiceRate] = useState<number>(1.0);
  const [voiceIntonation, setVoiceIntonation] = useState<number>(50);

  // Dynamic voices list fetched from ElevenLabs account
  const [elCustomVoices, setElCustomVoices] = useState<any[]>([]);
  const [isFetchingElVoices, setIsFetchingElVoices] = useState<boolean>(false);
  const [elVoicesStatus, setElVoicesStatus] = useState<string>('');

  // Dynamic voices list fetched from Mistral account (parity with CLI `voices` command)
  const [mistralCustomVoices, setMistralCustomVoices] = useState<any[]>([]);
  const [isFetchingMistralVoices, setIsFetchingMistralVoices] = useState<boolean>(false);
  const [mistralVoicesStatus, setMistralVoicesStatus] = useState<string>('');

  // Dynamic voices list fetched from xAI (built-ins + custom cloned voices via /v1/tts/voices)
  const [xaiCustomVoices, setXaiCustomVoices] = useState<any[]>([]);
  const [isFetchingXaiVoices, setIsFetchingXaiVoices] = useState<boolean>(false);
  const [xaiVoicesStatus, setXaiVoicesStatus] = useState<string>('');
  // Manual code paste support for the "stuck on redirect URL" flow.
  // When the popup redirects to 127.0.0.1:56121/callback and nothing is listening
  // (production or no loopback), the code ends up in the address bar. User copies it here.
  const [xaiManualPasteCode, setXaiManualPasteCode] = useState<string>('');

  // Dynamic voices list fetched from Fish Audio (the user's own /model list).
  // Fish Audio is a native TTS provider (model in a header, voice = reference_id).
  const [fishCustomVoices, setFishCustomVoices] = useState<any[]>([]);
  const [isFetchingFishVoices, setIsFetchingFishVoices] = useState<boolean>(false);
  const [fishVoicesStatus, setFishVoicesStatus] = useState<string>('');

  // Shared-key pool: when true, the deployer has provided FISH_API_KEYS on the
  // server, so visitors can synthesize WITHOUT their own Fish Audio key. The
  // Fish card then shows "FREE" instead of "BYOK", and the key-input gate is
  // skipped. Fetched once on mount from /api/tts/fish/pool-status.
  const [fishPoolAvailable, setFishPoolAvailable] = useState<boolean>(false);

  // In-app voice creation for Fish Audio (upload a clip → POST /model).
  // Upload mirrors OmniVoice's reference-audio pattern: stored as raw base64.
  const [fishCreateName, setFishCreateName] = useState<string>('');
  const [fishCreateAudio, setFishCreateAudio] = useState<string>('');
  const [fishCreateAudioName, setFishCreateAudioName] = useState<string>('');
  const [fishCreateAudioMime, setFishCreateAudioMime] = useState<string>('audio/wav');
  const [isCreatingFishVoice, setIsCreatingFishVoice] = useState<boolean>(false);
  const [fishCreateStatus, setFishCreateStatus] = useState<string>('');

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

  // Voice preview state
  const [isPreviewing, setIsPreviewing] = useState<boolean>(false);

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

  // Global API Keys Settings Modal
  const [showApiSettings, setShowApiSettings] = useState<boolean>(false);

  // LLM Script Enhancer state
  const [enhancerInput, setEnhancerInput] = useState<string>('');
  const [enhancerIsUrl, setEnhancerIsUrl] = useState<boolean>(false);
  const [enhancerProvider, setEnhancerProvider] = useState<'gemini' | 'openai' | 'openrouter' | 'xai' | 'cerebras' | 'nvidia'>('gemini');
  const [enhancerModel, setEnhancerModel] = useState<string>('');
  const [enhancerResult, setEnhancerResult] = useState<string>('');
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  // Audio tags mode: when on, the enhancer prompt tells the LLM to insert
  // provider-specific delivery tags ([laugh], <whisper>, etc.) into the script.
  // auto-tracks the selected TTS provider so the right tag syntax is used.
  const [enhancerAudioTags, setEnhancerAudioTags] = useState<boolean>(false);

  // Helper: Check if the required key(s) for a provider are configured
  const hasKeyForProvider = (p: string): boolean => {
    if (p === 'gemini' || p === 'gemini-multi') return !!geminiKey?.trim();
    if (p === 'openai') return !!openaiKey?.trim();
    if (p === 'elevenlabs') return !!elevenlabsKey?.trim();
    if (p === 'mistral') return !!mistralKey?.trim();
    if (p === 'openrouter') return !!openrouterKey?.trim();
    if (p === 'fish') return !!fishKey?.trim();
    if (p === 'xai') {
      // OAuth tokens (preferred) or manual API key both count as "configured"
      const hasOauth = !!xaiOauthTokens?.accessToken;
      const hasManual = !!xaiKey?.trim();
      return hasOauth || hasManual;
    }
    if (p === 'omnivoice' || p === 'voxcpm') {
      // HF Token is optional for public demo spaces, required only for private ones
      return true;
    }
    if (p === 'nvidia') return !!nvidiaKey?.trim();
    return true; // fallback for any future providers
  };

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

  const updateOpenrouterKey = (key: string) => {
    setOpenrouterKey(key);
    localStorage.setItem('tts_voicestudio_openrouter_key', key);
  };

  const updateXaiKey = (key: string) => {
    setXaiKey(key);
    localStorage.setItem('tts_voicestudio_xai_key', key);
  };

  const updateFishKey = (key: string) => {
    setFishKey(key);
    localStorage.setItem('tts_voicestudio_fish_key', key);
  };

  const updateNvidiaKey = (key: string) => {
    setNvidiaKey(key);
    localStorage.setItem('tts_voicestudio_nvidia_key', key);
  };

  // Updates the xAI OAuth token bundle (from successful login or refresh).
  // Persists to localStorage via the helper and updates React state.
  const updateXaiOauthTokens = (tokens: XaiOAuthTokens | null) => {
    setXaiOauthTokens(tokens);
    saveXaiOAuthTokens(tokens);
  };

  // --------------------------------------------------------------------------
  // xAI OAUTH FLOW (client-side PKCE + popup)
  // --------------------------------------------------------------------------
  // This is the heart of the new "Sign in with xAI" experience.
  //
  // High-level steps when the user clicks "Connect with xAI":
  // 1. We generate fresh PKCE verifier + S256 challenge (never sent over wire).
  // 2. We build the authorize URL pointing at auth.x.ai using the public client.
  // 3. We open a popup window with that URL.
  // 4. User completes login + consent on xAI's site.
  // 5. xAI redirects the *popup* to our /oauth/xai/callback page.
  // 6. That tiny page does window.opener.postMessage({ type: 'xai-oauth-callback', code, state }).
  // 7. Our message listener receives it, validates state, then calls the token endpoint
  //    directly from the browser (with the code_verifier) to exchange for tokens.
  // 8. On success we persist via updateXaiOauthTokens() and close the popup.
  //
  // Security notes:
  // - PKCE guarantees only the browser that started the flow can finish it.
  // - state/nonce protect against CSRF and mix-up attacks.
  // - No client secret is ever used (public client).
  // - The resulting access_token is what actually gets sent to xAI's TTS endpoints.
  //   xAI attributes the usage to the authenticated user's subscription.
  // --------------------------------------------------------------------------

  const XAI_OAUTH_REDIRECT_URI = XAI_OAUTH.REDIRECT_URI;

  // Returns the credential string we should actually send to the backend for xAI calls.
  // Prefers a fresh OAuth access token when available. Falls back to manual key.
  // Call sites (synthesize, voices, enhancer, sample) should use this.
  const getEffectiveXaiCredential = async (): Promise<{ credential: string | null; isOauth: boolean }> => {
    // Prefer OAuth if we have tokens
    if (xaiOauthTokens?.accessToken) {
      const valid = await getValidXaiAccessToken(xaiOauthTokens, async (fresh) => {
        // Auto-persist refreshed tokens so the user doesn't have to reconnect
        updateXaiOauthTokens(fresh);
      });

      if (valid) {
        return { credential: valid, isOauth: true };
      }
      // If refresh failed, fall through to manual key (if any)
    }

    const manual = xaiKey?.trim() || null;
    return { credential: manual, isOauth: false };
  };

  // Disconnect OAuth (clears tokens from state + localStorage).
  // Does NOT touch the manual xaiKey.
  const disconnectXaiOAuth = () => {
    updateXaiOauthTokens(null);
    setXaiVoicesStatus(''); // clear any previous sync status
  };

  // Helper: extract the authorization code whether user pastes the raw code
  // or the full stuck redirect URL (http://127.0.0.1:56121/callback?code=...&state=...)
  const extractXaiCode = (input: string): string => {
    const trimmed = input.trim();
    if (!trimmed) return '';
    // If it looks like a URL or contains query params, try to parse
    if (trimmed.includes('code=')) {
      try {
        const urlStr = trimmed.includes('://') ? trimmed : `http://dummy?${trimmed.split('?').pop() || trimmed}`;
        const u = new URL(urlStr);
        const c = u.searchParams.get('code');
        if (c) return c;
      } catch {}
    }
    // Assume they pasted just the code value
    return trimmed;
  };

  // Manual code paste flow (the m26pipeline-style "paste from address bar").
  // Works in production where the loopback is unreachable.
  const submitManualXaiCode = async () => {
    const code = extractXaiCode(xaiManualPasteCode);
    if (!code) {
      setXaiVoicesStatus('Please paste the code (or the full redirect URL) from the address bar.');
      return;
    }

    const savedVerifier = sessionStorage.getItem('xai_oauth_verifier');
    const savedState = sessionStorage.getItem('xai_oauth_state');

    if (!savedVerifier) {
      setXaiVoicesStatus('No pending login session. Click "Sign in with xAI" again first.');
      setXaiManualPasteCode('');
      return;
    }

    // We don't strictly require state here (user may have copied only the code),
    // but if we have it we can validate.
    // The main protection is the one-time PKCE verifier.

    try {
      setXaiVoicesStatus('Exchanging code for tokens…');
      const tokens = await exchangeCodeForTokens({
        code,
        codeVerifier: savedVerifier,
        redirectUri: XAI_OAUTH_REDIRECT_URI,
      });

      updateXaiOauthTokens(tokens);
      setXaiVoicesStatus('Connected via manual code! You can now Sync Voices or generate.');
      setXaiManualPasteCode('');

      // Clear the one-time PKCE material
      sessionStorage.removeItem('xai_oauth_verifier');
      sessionStorage.removeItem('xai_oauth_state');

      setTimeout(() => {
        fetchXaiVoices();
      }, 450);
    } catch (err: any) {
      console.error('Manual xAI code exchange error:', err);
      setXaiVoicesStatus(`Token exchange failed: ${err.message || err}`);
    }
  };

  // The main "Sign in with xAI" entry point.
  // Opens the popup (or new tab) with the fixed Grok-CLI redirect URI.
  // Two paths to completion:
  //   1. Dev: loopback server on 127.0.0.1:56121 receives the redirect and postMessages the code.
  //   2. Production / stuck popup: user copies the ?code= value from the address bar and pastes it
  //      into the manual paste box below the button (same pattern as EA auth in m26pipeline).
  // The PKCE verifier is always stored in sessionStorage, so either path can complete the exchange.
  const connectWithXaiOAuth = async () => {
    setXaiManualPasteCode('');
    setXaiVoicesStatus('Opening xAI login…');

    // Open the popup synchronously on click. Browsers block window.open() if any
    // await runs first (user-gesture chain is broken) — that looked like "nothing happens".
    const popupWidth = 520;
    const popupHeight = 680;
    const left = window.screenX + (window.outerWidth - popupWidth) / 2;
    const top = window.screenY + (window.outerHeight - popupHeight) / 2;
    const popupFeatures = `width=${popupWidth},height=${popupHeight},left=${left},top=${top},popup=1`;

    const popup = window.open('about:blank', 'xai-oauth', popupFeatures);

    if (!popup) {
      setXaiVoicesStatus(
        'Popup blocked. Allow popups for this site and try again, or use the manual code paste box below.'
      );
      return;
    }

    try {
      try {
        popup.document.title = 'xAI sign-in';
        popup.document.body.innerHTML =
          '<p style="font-family:system-ui,sans-serif;padding:24px;color:#111">Loading xAI sign-in…</p>';
      } catch {
        // ignore if the blank document is not writable in some browsers
      }

      // 1. Fresh PKCE pair for this attempt (async is OK after popup is open)
      const { codeVerifier, codeChallenge } = await generatePKCEAsync();

      // 2. Anti-CSRF / replay values (store them so the message handler can validate)
      const state = crypto.randomUUID();
      const nonce = crypto.randomUUID();

      sessionStorage.setItem('xai_oauth_verifier', codeVerifier);
      sessionStorage.setItem('xai_oauth_state', state);

      // 3. Build the URL the popup will load
      const authUrl = buildXaiAuthorizeUrl({
        redirectUri: XAI_OAUTH_REDIRECT_URI,
        codeChallenge,
        state,
        nonce,
      });

      popup.location.href = authUrl;

      setXaiVoicesStatus('Waiting for xAI authorization… (if popup gets stuck, paste the code below)');

      // 5. One-time message listener for the callback page
      const handleMessage = async (event: MessageEvent) => {
        // Only accept messages from our own origin (the callback page is same-origin)
        // Accept from our own origin OR the xAI loopback callback (127.0.0.1:56121)
        const allowedOrigins = [window.location.origin, 'http://127.0.0.1:56121'];
        if (!allowedOrigins.includes(event.origin)) return;
        if (!event.data || event.data.type !== 'xai-oauth-callback') return;

        // Clean up listener immediately
        window.removeEventListener('message', handleMessage);

        const { code, state: returnedState, error, errorDescription } = event.data;

        // Always clear the one-time PKCE material
        const savedVerifier = sessionStorage.getItem('xai_oauth_verifier');
        const savedState = sessionStorage.getItem('xai_oauth_state');
        sessionStorage.removeItem('xai_oauth_verifier');
        sessionStorage.removeItem('xai_oauth_state');

        if (error) {
          setXaiVoicesStatus(`xAI login error: ${errorDescription || error}`);
          try { popup.close(); } catch {}
          return;
        }

        if (!code) {
          setXaiVoicesStatus('No authorization code returned from xAI.');
          try { popup.close(); } catch {}
          return;
        }

        // Validate state to prevent CSRF / mix-up attacks
        if (!savedState || returnedState !== savedState) {
          setXaiVoicesStatus('Security check failed (state mismatch). Please try again.');
          try { popup.close(); } catch {}
          return;
        }

        if (!savedVerifier) {
          setXaiVoicesStatus('PKCE verifier missing. Please try again.');
          try { popup.close(); } catch {}
          return;
        }

        // 6. Exchange the code for tokens (client-side, using PKCE)
        try {
          setXaiVoicesStatus('Exchanging code for tokens…');

          const tokens = await exchangeCodeForTokens({
            code,
            codeVerifier: savedVerifier,
            redirectUri: XAI_OAUTH_REDIRECT_URI,
          });

          updateXaiOauthTokens(tokens);
          setXaiVoicesStatus('Connected! You can now Sync Voices or generate with your xAI subscription.');
          setXaiManualPasteCode('');

          // Close the popup if it's still open
          try { popup.close(); } catch {}

          // Optional: auto-fetch voices for the user as a nice onboarding touch.
          // We call fetchXaiVoices directly (it already calls getEffectiveXaiCredential internally).
          setTimeout(() => {
            fetchXaiVoices();
          }, 450);
        } catch (exchangeErr: any) {
          console.error('xAI token exchange error:', exchangeErr);
          setXaiVoicesStatus(`Token exchange failed: ${exchangeErr.message || exchangeErr}`);
          try { popup.close(); } catch {}
        }
      };

      window.addEventListener('message', handleMessage, { once: true });

      // Safety: if the user closes the popup manually, clean up after a while
      const safetyInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(safetyInterval);
          window.removeEventListener('message', handleMessage);
          const stillWaiting = sessionStorage.getItem('xai_oauth_verifier');
          if (stillWaiting) {
            setXaiVoicesStatus('Login window was closed. Click Connect again if you want to retry.');
            sessionStorage.removeItem('xai_oauth_verifier');
            sessionStorage.removeItem('xai_oauth_state');
          }
        }
      }, 800);
    } catch (err: any) {
      console.error('connectWithXaiOAuth error:', err);
      setXaiVoicesStatus(`Failed to start xAI login: ${err.message || err}`);
      sessionStorage.removeItem('xai_oauth_verifier');
      sessionStorage.removeItem('xai_oauth_state');
    }
  };

  const updateCerebrasKey = (key: string) => {
    setCerebrasKey(key);
    localStorage.setItem('tts_voicestudio_cerebras_key', key);
  };

  const updateGeminiKey = (key: string) => {
    setGeminiKey(key);
    localStorage.setItem('tts_voicestudio_gemini_key', key);
  };

  const updateHfToken = (token: string) => {
    setHfToken(token);
    localStorage.setItem('tts_voicestudio_hf_token', token);
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
    } else if (provider === 'gemini-multi') {
      // For multi-speaker we don't use the single voiceId the same way
      setVoiceId('Kore'); // harmless default
    } else if (provider === 'openai') {
      setVoiceId('alloy');
    } else if (provider === 'elevenlabs') {
      if (elCustomVoices.length > 0) {
        setVoiceId(elCustomVoices[0].id);
      } else {
        setVoiceId('21m00Tcm4TlvDq8ikWAM'); // Rachel
      }
    } else if (provider === 'mistral') {
      if (mistralCustomVoices.length > 0) {
        setVoiceId(mistralCustomVoices[0].id);
      } else {
        setVoiceId('bellatrix'); // safe fallback until user syncs
      }
    } else if (provider === 'openrouter') {
      // Reasonable defaults for the current openrouterModel (will be overridden by user in Advanced)
      setVoiceId('alloy');
      // If user has never touched the model, keep the initial good default; otherwise leave their choice
    } else if (provider === 'xai') {
      setVoiceId('eve'); // default Grok voice
    } else if (provider === 'fish') {
      // Empty voiceId = Fish Audio's built-in default voice. If the user has
      // already synced custom voices, prefer the first one instead.
      setVoiceId(fishCustomVoices.length > 0 ? fishCustomVoices[0].id : '');
    } else if (provider === 'nvidia') {
      setVoiceId('default'); // NVIDIA parakeet-seamless TTS uses a single default voice
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

  // Fetch saved Mistral voices (uses the new /api/tts/mistral/voices proxy)
  const fetchMistralVoices = async () => {
    if (!mistralKey) {
      setMistralVoicesStatus('MISTRAL_API_KEY is missing.');
      return;
    }
    setIsFetchingMistralVoices(true);
    setMistralVoicesStatus('Fetching...');
    try {
      const response = await fetch('/api/tts/mistral/voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: mistralKey })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Server rejected Mistral voices request.');
      }

      const data = await response.json();
      if (data.voices && Array.isArray(data.voices)) {
        const formatted = data.voices.map((v: any) => ({
          id: v.voice_id,
          name: v.name || v.voice_id,
          gender: v.labels?.gender || 'Custom'
        }));
        setMistralCustomVoices(formatted);
        setMistralVoicesStatus('Loaded successfully!');
        if (formatted.length > 0) {
          setVoiceId(formatted[0].id);
        }
      } else {
        setMistralVoicesStatus('Zero voices returned (or check account).');
      }
    } catch (err: any) {
      console.error('Mistral voices error:', err);
      setMistralVoicesStatus(`Failed: ${err.message || err}`);
    } finally {
      setIsFetchingMistralVoices(false);
    }
  };

  // Fetch xAI voices (built-in + custom cloned voices)
  // Updated xAI voices fetcher — supports both manual keys and active OAuth sessions.
  // Uses getEffectiveXaiCredential() which prefers a fresh OAuth access token.
  const fetchXaiVoices = async () => {
    const { credential, isOauth } = await getEffectiveXaiCredential();

    if (!credential) {
      setXaiVoicesStatus('No xAI credential. Connect with OAuth or paste an API key first.');
      return;
    }

    setIsFetchingXaiVoices(true);
    setXaiVoicesStatus('Fetching...');

    try {
      // Send both fields. The server will prefer xaiAccessToken when present.
      const payload: any = {};
      if (isOauth) {
        payload.xaiAccessToken = credential;
      } else {
        payload.apiKey = credential;
      }

      const response = await fetch('/api/tts/xai/voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Server rejected xAI voices request.');
      }

      const data = await response.json();
      if (data.voices && Array.isArray(data.voices)) {
        const formatted = data.voices.map((v: any) => ({
          id: v.voice_id,
          name: v.name || v.voice_id,
          gender: v.labels?.gender || (v.category === 'Custom' ? 'Custom' : '—')
        }));
        setXaiCustomVoices(formatted);
        setXaiVoicesStatus(
          isOauth
            ? 'Loaded from your xAI subscription (OAuth).'
            : 'Loaded successfully!'
        );
        if (formatted.length > 0 && !XAI_VOICES.some(v => v.id === voiceId)) {
          setVoiceId(formatted[0].id);
        }
      } else {
        setXaiVoicesStatus('Zero voices returned (or check account / subscription).');
      }
    } catch (err: any) {
      console.error('xAI voices error:', err);
      setXaiVoicesStatus(`Failed: ${err.message || err}`);
    } finally {
      setIsFetchingXaiVoices(false);
    }
  };

  // Fetch the user's own Fish Audio voice models via GET /model (proxied).
  // Mirrors the simpler ElevenLabs/Mistral pattern (manual key only, no OAuth).
  const fetchFishVoices = async () => {
    if (!fishKey?.trim()) {
      setFishVoicesStatus('Paste your Fish Audio API key first.');
      return;
    }

    setIsFetchingFishVoices(true);
    setFishVoicesStatus('Fetching...');

    try {
      const response = await fetch('/api/tts/fish/voices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: fishKey }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Server rejected Fish Audio voices request.');
      }

      const data = await response.json();
      if (data.voices && Array.isArray(data.voices)) {
        const formatted = data.voices.map((v: any) => ({
          id: v.voice_id,
          name: v.name || v.voice_id,
          gender: v.labels?.languages || 'Custom',
        }));
        setFishCustomVoices(formatted);
        setFishVoicesStatus(
          formatted.length > 0
            ? `Loaded ${formatted.length} voice${formatted.length === 1 ? '' : 's'}.`
            : 'No voice models found — create one below or at fish.audio.'
        );
        // Auto-select the first synced voice only if the user hasn't picked one.
        if (formatted.length > 0 && !voiceId) {
          setVoiceId(formatted[0].id);
        }
      } else {
        setFishVoicesStatus('Unexpected response shape from server.');
      }
    } catch (err: any) {
      console.error('Fish Audio voices error:', err);
      setFishVoicesStatus(`Failed: ${err.message || err}`);
    } finally {
      setIsFetchingFishVoices(false);
    }
  };

  // Create a new Fish Audio voice model from an uploaded audio sample.
  // The server re-wraps the base64 as multipart/form-data for POST /model.
  // Training is async on Fish Audio's side — we surface the new id + state.
  const createFishVoice = async () => {
    if (!fishKey?.trim()) {
      setFishCreateStatus('Paste your Fish Audio API key first.');
      return;
    }
    if (!fishCreateName.trim()) {
      setFishCreateStatus('Give your voice a name first.');
      return;
    }
    if (!fishCreateAudio) {
      setFishCreateStatus('Upload a short audio sample (10–30s of clean speech).');
      return;
    }

    setIsCreatingFishVoice(true);
    setFishCreateStatus('Creating... (training happens async on Fish Audio)');

    try {
      const response = await fetch('/api/tts/fish/voices/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: fishKey,
          title: fishCreateName.trim(),
          audioBase64: fishCreateAudio,
          audioMimeType: fishCreateAudioMime,
          visibility: 'private',
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Server rejected Fish Audio voice creation.');
      }

      const created = await response.json();
      setFishCreateStatus(
        `Voice "${created.title || fishCreateName.trim()}" created — state: ${created.state || 'created'}. ` +
        'Training runs in the background; click "Sync Voices" again in ~30s to use it.'
      );
      // Clear the upload so the user can create another.
      setFishCreateAudio('');
      setFishCreateAudioName('');
      setFishCreateName('');
      // Best-effort: immediately refresh the list so the new voice appears
      // (it'll show as state=training until ready).
      void fetchFishVoices();
    } catch (err: any) {
      console.error('Fish Audio voice creation error:', err);
      setFishCreateStatus(`Failed: ${err.message || err}`);
    } finally {
      setIsCreatingFishVoice(false);
    }
  };

  // LLM Script Enhancer handler
  const handleEnhanceForTTS = async () => {
    if (!enhancerInput.trim()) {
      setTtsError('Please paste some text or a link to enhance.');
      return;
    }

    // Get the appropriate credential for the chosen enhancer provider.
    // For xAI we prefer a valid OAuth session over a manual key.
    let llmKey = '';
    let enhancerXaiAccessToken: string | null = null;

    if (enhancerProvider === 'xai') {
      if (xaiOauthTokens?.accessToken && !isTokenExpired(xaiOauthTokens.expiresAt)) {
        llmKey = xaiOauthTokens.accessToken;
        enhancerXaiAccessToken = xaiOauthTokens.accessToken;
      } else {
        llmKey = xaiKey?.trim() || '';
      }
    } else {
      llmKey = 
        enhancerProvider === 'gemini' ? geminiKey : 
        enhancerProvider === 'openai' ? openaiKey : 
        enhancerProvider === 'openrouter' ? openrouterKey : 
        enhancerProvider === 'cerebras' ? cerebrasKey : 
        enhancerProvider === 'nvidia' ? nvidiaKey : '';
    }

    if (!llmKey) {
      const label = 
        enhancerProvider === 'gemini' ? 'Gemini' : 
        enhancerProvider === 'openai' ? 'OpenAI' : 
        enhancerProvider === 'openrouter' ? 'OpenRouter' : 
        enhancerProvider === 'xai' ? 'xAI' : 
        enhancerProvider === 'nvidia' ? 'NVIDIA' : 'Cerebras';
      setTtsError(`Please add a ${label} API key (or connect via OAuth for xAI) in Settings.`);
      setShowApiSettings(true);
      return;
    }

    setIsEnhancing(true);
    setTtsError('');
    setEnhancerResult('');

    try {
      const response = await fetch('/api/llm/enhance-for-tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: enhancerProvider,
          apiKey: llmKey,
          ...(enhancerXaiAccessToken ? { xaiAccessToken: enhancerXaiAccessToken } : {}),
          input: enhancerInput.trim(),
          model: enhancerModel || undefined,
          audioTagsMode: enhancerAudioTags,
          ttsProvider: provider,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Enhancement failed');
      }

      const data = await response.json();
      setEnhancerResult(data.enhanced);

    } catch (error: any) {
      console.error(error);
      setTtsError(error.message || 'Failed to enhance text with LLM.');
    } finally {
      setIsEnhancing(false);
    }
  };

  const acceptEnhancedText = () => {
    if (enhancerResult) {
      setText(enhancerResult);
      setEnhancerResult('');
      setEnhancerInput('');
      // Optional: scroll to main text area
    }
  };

  // Play a short voice preview / sample (parity with CLI voice-sample)
  const playVoiceSample = async (targetVoiceId?: string) => {
    const previewVoiceId = targetVoiceId || voiceId;
    // Fish Audio allows an empty voiceId (the built-in default voice), so we
    // only require a selection for the other providers.
    if (!previewVoiceId && provider !== 'fish') {
      setTtsError('Please select a voice first.');
      return;
    }

    setIsPreviewing(true);
    setTtsError('');

    const currentApiKey =
      provider === 'elevenlabs' ? elevenlabsKey :
      provider === 'mistral' ? mistralKey :
      provider === 'openrouter' ? openrouterKey :
      provider === 'fish' ? fishKey :
      provider === 'xai' ? (xaiOauthTokens?.accessToken || xaiKey) : undefined;

    try {
      const response = await fetch('/api/tts/voice-sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider === 'gemini-multi' ? 'gemini' : provider,
          voiceId: previewVoiceId,
          apiKey: currentApiKey,
          // Pass current OpenRouter model when previewing so server knows which TTS engine to hit
          ...(provider === 'openrouter' ? { model: openrouterModel } : {}),
          ...(provider === 'xai' ? { language: xaiLanguage } : {}),
          // Fish Audio: pass the selected engine model (defaults to free s2.1-pro-free server-side)
          ...(provider === 'fish' ? { model: fishModel } : {}),
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate voice preview.');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      const previewAudio = new Audio(audioUrl);
      previewAudio.play().catch(e => {
        console.error('Preview playback failed:', e);
        setTtsError('Could not play voice preview.');
      });

      // Clean up object URL after playback ends
      previewAudio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };

    } catch (error: any) {
      console.error('Voice preview error:', error);
      setTtsError(error.message || 'Failed to preview voice.');
    } finally {
      setIsPreviewing(false);
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
    
    // API key / credential check.
    // For xAI we compute an effective credential (OAuth preferred) asynchronously a bit later
    // because getEffectiveXaiCredential is async (it may refresh).
    let currentApiKey =
      provider === 'openai' ? openaiKey :
      provider === 'elevenlabs' ? elevenlabsKey :
      provider === 'mistral' ? mistralKey :
      provider === 'openrouter' ? openrouterKey :
      (provider === 'gemini' || provider === 'gemini-multi') ? geminiKey :
      provider === 'fish' ? fishKey :
      provider === 'nvidia' ? nvidiaKey :
      provider === 'xai' ? (xaiOauthTokens?.accessToken || xaiKey) :
      undefined;

    // HF providers (OmniVoice / VoxCPM) use HF_TOKEN, not regular API keys
    const needsRegularKey = ['openai', 'elevenlabs', 'mistral', 'openrouter', 'fish', 'xai', 'gemini', 'gemini-multi', 'nvidia'].includes(provider);
    if (needsRegularKey && !currentApiKey) {
      const providerName =
        provider === 'openai' ? 'OpenAI' :
        provider === 'elevenlabs' ? 'ElevenLabs' :
        provider === 'mistral' ? 'Mistral' :
        provider === 'openrouter' ? 'OpenRouter' :
        provider === 'fish' ? 'Fish Audio' :
        provider === 'nvidia' ? 'NVIDIA NIM' :
        provider === 'xai' ? 'xAI' : 'Gemini';
      setTtsError(`An API Key is required for calling the ${providerName} engine.`);
      setIsSynthesizing(false);
      return;
    }

    // OmniVoice cloning mode requires reference audio.
    // Design mode does not.
    if (provider === 'omnivoice' && omniVoiceMode === 'cloning' && !hfRefAudio) {
      setTtsError('Reference audio is required for OmniVoice cloning mode. Please upload a short voice clip above.');
      setIsSynthesizing(false);
      return;
    }

    // Assemble payload
    const selectedVoiceName = 
      provider === 'gemini' ? GEMINI_VOICES.find(v => v.id === voiceId)?.name :
      provider === 'openai' ? OPENAI_VOICES.find(v => v.id === voiceId)?.name :
      provider === 'mistral' ? (mistralCustomVoices.find(v => v.id === voiceId)?.name || MISTRAL_VOICES.find(v => v.id === voiceId)?.name) :
      provider === 'openrouter' ? `${openrouterModel} / ${voiceId}` :
      provider === 'fish' ? `Fish Audio ${fishCustomVoices.find(v => v.id === voiceId)?.name || voiceId || 'Default'}` :
      provider === 'nvidia' ? `NVIDIA NIM ${voiceId}` :
      provider === 'xai' ? `xAI ${voiceId}` :
      elCustomVoices.find(v => v.id === voiceId)?.name || DEFAULT_ELEVENLABS_VOICES.find(v => v.id === voiceId)?.name || 'ElevenLabs Voice';

    const ttsPayload = {
      provider,
      text,
      voiceId,
      apiKey: currentApiKey,
      hfToken: (provider === 'omnivoice' || provider === 'voxcpm') ? hfToken : undefined,
      config: provider === 'gemini' ? { emotion: geminiEmotion } :
              provider === 'gemini-multi' ? {
                speaker1: gmSpeaker1,
                voice1: gmVoice1,
                speaker2: gmSpeaker2,
                voice2: gmVoice2,
              } :
              provider === 'openai' ? { model: openaiModel } : 
              provider === 'mistral' ? { 
                model: 'voxtral-mini-tts-2603', 
                format: 'mp3' 
              } : 
              provider === 'openrouter' ? { 
                model: openrouterModel,
                speed: openrouterSpeed
              } : 
              provider === 'xai' ? {
                language: xaiLanguage,
                speed: xaiSpeed
              } :
              provider === 'nvidia' ? {
                model: 'nvidia/parakeet-seamless-1.0',
              } :
              provider === 'fish' ? {
                model: fishModel,
                temperature: fishTemperature,
                top_p: fishTopP,
                speed: fishSpeed,
                latency: fishLatency,
              } :
              (provider === 'omnivoice' || provider === 'voxcpm') ? {
                mode: provider === 'omnivoice' ? omniVoiceMode : undefined,
                refAudio: hfRefAudio || undefined,
                // Design mode controls (only used when mode === 'design')
                ...(provider === 'omnivoice' && omniVoiceMode === 'design' ? {
                  language: 'Auto',
                  steps: 32,
                  guidance: 2.0,
                  denoise: true,
                  speed: 1.0,
                  gender: omniDesignGender,
                  age: omniDesignAge,
                  pitch: omniDesignPitch,
                  style: omniDesignStyle,
                  englishAccent: omniDesignEnglishAccent,
                  chineseDialect: omniDesignChineseDialect,
                } : {}),
              } : {
                model: elevenlabsModel,
                stability: elStability,
                similarityBoost: elSimilarity
              }
    };

    // Use the new unified synthesize gateway for the advanced / HF providers
    const useUnified = ['omnivoice', 'voxcpm', 'gemini-multi'].includes(provider);
    const endpoint = useUnified ? '/api/tts/synthesize' : '/api/tts/generate';

    try {
      const response = await fetch(endpoint, {
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

      // Trigger the immersive visualizer overlay now that audio is loaded.
      // Only fires for full synthesis — not voice previews (which use a
      // separate new Audio() and don't touch this state path).
      setImmersiveTrigger(prev => prev + 1);

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

      // Trigger the immersive visualizer overlay for history playback too —
      // same premium experience as fresh synthesis. Only fires when a NEW track
      // is loaded (the play/pause toggle on the same track returns early above).
      setImmersiveTrigger(prev => prev + 1);

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

  // Skip forward/backward by a delta (used by immersive overlay controls)
  const handleSkip = (deltaSeconds: number) => {
    if (audioRef.current) {
      const newTime = Math.max(0, Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + deltaSeconds));
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
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
      <header className="border-b sticky top-0 z-50 backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.6)] transition-all duration-300"
        style={{
          borderColor: hexToRGB(activeAccentHex, 0.18),
          backgroundImage: `linear-gradient(to right, rgba(2, 6, 23, 0.9), ${hexToRGB(activeAccentHex, 0.04)} 50%, rgba(2, 6, 23, 0.9))`
        }}
      >
        <div id="header-container" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-18 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl border shadow-inner transition-all duration-300"
              style={{
                backgroundColor: hexToRGB(activeAccentHex, 0.1),
                borderColor: hexToRGB(activeAccentHex, 0.25),
                color: activeAccentHex
              }}
            >
              <AudioLines className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-base font-extrabold text-slate-50 tracking-[1.5px] uppercase flex items-center gap-2">
                  TTS Voice Studio
                </h1>
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-950/80 border text-[10px] font-mono shadow-inner transition-colors duration-300"
                  style={{ borderColor: hexToRGB(activeAccentHex, 0.2) }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: activeAccentHex }}></span>
                    <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: activeAccentHex }}></span>
                  </span>
                  <span className="text-slate-500 font-medium">PROVIDER:</span>
                  <span className="font-bold uppercase tracking-wider transition-colors duration-300" style={{ color: activeAccentHex }}>
                    {provider === 'gemini' ? 'Gemini Speech' :
                     provider === 'gemini-multi' ? 'Gemini Multi' :
                     provider === 'openai' ? 'OpenAI TTS' :
                     provider === 'elevenlabs' ? 'ElevenLabs' :
                     provider === 'mistral' ? 'Mistral' :
                     provider === 'openrouter' ? 'OpenRouter' :
                     provider === 'xai' ? 'xAI Grok' :
                     provider === 'fish' ? 'Fish Audio' :
                     provider === 'omnivoice' ? 'OmniVoice' :
                     provider === 'voxcpm' ? 'VoxCPM' : provider}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-xs">
                <p className="text-slate-400">
                  Generative Vocal Studio & Audio Analyzer
                </p>
                <span className="text-slate-700 hidden sm:inline">•</span>
                <span className="text-[11px] text-slate-500">
                  hosted by <a 
                    href="https://agentmemorylabs.com/?utm_source=tts-ui&utm_medium=header&utm_campaign=studio" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-slate-400 hover:text-cyan-400 hover:underline transition-colors font-medium decoration-dashed decoration-1"
                  >
                    agentmemorylabs.com
                  </a>
                </span>
              </div>
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

            {/* Global API Keys Settings Button */}
            <button
              onClick={() => setShowApiSettings(true)}
              type="button"
              className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 hover:bg-slate-800 border border-slate-800/70 hover:border-slate-700 py-1.5 px-3 rounded-xl shadow-sm transition-colors"
              title="Manage API Keys (BYOK)"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="text-[11px] font-mono uppercase tracking-wider">API Keys</span>
            </button>
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
            
            {/* LLM Script Enhancer Panel */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-400" />
                  <span className="text-sm font-bold text-slate-200 tracking-wider">LLM SCRIPT ENHANCER</span>
                </div>
                <div className="flex items-center gap-2 text-[10px]">
                  <select
                    value={enhancerProvider}
                    onChange={(e) => {
                      const newProvider = e.target.value as 'gemini' | 'openai' | 'openrouter' | 'xai' | 'cerebras';
                      setEnhancerProvider(newProvider);
                      // Set sensible default model when switching providers
                      if (!enhancerModel) {
                        if (newProvider === 'gemini') setEnhancerModel('gemini-2.5-flash');
                        else if (newProvider === 'openai') setEnhancerModel('gpt-4o-mini');
                        else if (newProvider === 'openrouter') setEnhancerModel('openai/gpt-4o-mini');
                        else if (newProvider === 'xai') setEnhancerModel('grok-3-latest');
                        else if (newProvider === 'cerebras') setEnhancerModel('llama-3.3-70b');
                      }
                    }}
                    className="bg-slate-900 border border-slate-800 text-[10px] px-2 py-0.5 rounded text-slate-300"
                  >
                    <option value="gemini">Gemini</option>
                    <option value="openai">OpenAI</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="xai">xAI Grok</option>
                    <option value="cerebras">Cerebras</option>
                    <option value="nvidia">NVIDIA NIM</option>
                  </select>
                  <select
                    value={enhancerModel}
                    onChange={(e) => setEnhancerModel(e.target.value)}
                    className="bg-slate-900 border border-slate-800 text-[10px] px-2 py-0.5 rounded text-slate-300 w-40 font-mono"
                  >
                    {enhancerProvider === 'gemini' && (
                      <>
                        <option value="">auto (gemini-2.5-flash)</option>
                        <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                        <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                        <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                      </>
                    )}
                    {enhancerProvider === 'openai' && (
                      <>
                        <option value="">auto (gpt-4o-mini)</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="gpt-4.1">gpt-4.1</option>
                        <option value="gpt-4.1-mini">gpt-4.1-mini</option>
                        <option value="gpt-4.1-nano">gpt-4.1-nano</option>
                      </>
                    )}
                    {enhancerProvider === 'openrouter' && (
                      <>
                        <option value="">auto (openai/gpt-4o-mini)</option>
                        <option value="openai/gpt-4o-mini">openai/gpt-4o-mini</option>
                        <option value="openai/gpt-4o">openai/gpt-4o</option>
                        <option value="anthropic/claude-sonnet-4">anthropic/claude-sonnet-4</option>
                        <option value="google/gemini-2.5-flash">google/gemini-2.5-flash</option>
                        <option value="x-ai/grok-3-latest">x-ai/grok-3-latest</option>
                      </>
                    )}
                    {enhancerProvider === 'xai' && (
                      <>
                        <option value="">auto (grok-3-latest)</option>
                        <option value="grok-3-latest">grok-3-latest</option>
                        <option value="grok-2-latest">grok-2-latest</option>
                        <option value="grok-3-mini-latest">grok-3-mini-latest</option>
                      </>
                    )}
                    {enhancerProvider === 'cerebras' && (
                      <>
                        <option value="">auto (llama-3.3-70b)</option>
                        <option value="llama-3.3-70b">llama-3.3-70b</option>
                        <option value="llama-3.1-8b">llama-3.1-8b</option>
                      </>
                    )}
                    {enhancerProvider === 'nvidia' && (
                      <>
                        <option value="">auto (nvidia/llama-3.1-nemotron-70b)</option>
                        <option value="nvidia/llama-3.1-nemotron-70b-instruct">llama-nemotron-70b</option>
                        <option value="mistralai/mistral-7b-instruct-v0.3">mistral-7b</option>
                        <option value="meta/llama-3.1-8b-instruct">llama-3.1-8b</option>
                      </>
                    )}
                  </select>
                  <button
                    onClick={() => setShowApiSettings(true)}
                    className="text-violet-400 hover:text-violet-300 text-[10px] underline"
                  >
                    Manage Key
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <textarea
                  value={enhancerInput}
                  onChange={(e) => setEnhancerInput(e.target.value)}
                  placeholder="Paste raw text, notes, or a URL here..."
                  className="w-full h-20 bg-slate-900/60 text-sm border border-slate-800 rounded-xl p-3 resize-y"
                />

                {/* Audio Tags Mode toggle — appends provider-specific delivery tags
                    (e.g. ElevenLabs v3 <whisper>, Fish S2 [happy], xAI [laugh]) to the
                    enhanced script so the LLM knows the TTS engine's tag syntax. */}
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setEnhancerAudioTags(!enhancerAudioTags)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-colors font-mono ${
                      enhancerAudioTags
                        ? 'bg-violet-600/30 border-violet-500/60 text-violet-200'
                        : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
                    }`}
                    title="When ON, the enhancer inserts inline delivery tags the selected TTS provider understands (e.g. [laugh], <whisper>, [happy])."
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${enhancerAudioTags ? 'bg-violet-400' : 'bg-slate-600'}`} />
                    AUDIO TAGS {enhancerAudioTags ? 'ON' : 'OFF'}
                  </button>
                  <span className="text-slate-500 italic">
                    {enhancerAudioTags
                      ? `Tags for: ${provider} — delivery markers like [pause], <whisper> will be injected`
                      : 'Turn on to inject provider-specific delivery tags into the script'}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleEnhanceForTTS}
                    disabled={isEnhancing || !enhancerInput.trim()}
                    className="flex-1 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-500 disabled:bg-slate-700 rounded-xl transition-colors"
                  >
                    {isEnhancing ? 'Enhancing...' : 'Enhance for TTS'}
                  </button>

                  {enhancerResult && (
                    <button
                      onClick={acceptEnhancedText}
                      className="px-4 py-2 text-sm font-semibold bg-emerald-600 hover:bg-emerald-500 rounded-xl"
                    >
                      Use Enhanced Text
                    </button>
                  )}
                </div>

                {enhancerResult && (
                  <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-sm max-h-40 overflow-auto whitespace-pre-wrap text-slate-200">
                    {enhancerResult}
                  </div>
                )}
              </div>
            </div>

            {/* Input Workspace Container */}
            <div className="bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-900 pb-4 mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <h2 className="text-sm font-bold text-slate-100 tracking-wider">SCRIPT EDITOR & SYNTHESIS</h2>
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
                className="w-full h-48 bg-slate-900/60 text-slate-100 placeholder-slate-550 border border-slate-850 focus:border-slate-700/80 focus:ring-1 focus:ring-slate-700/50 rounded-xl p-4 text-sm leading-relaxed resize-y font-sans min-h-[160px] max-h-[600px]"
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
                  SELECT TTS PROVIDER
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
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'gemini'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('gemini') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('gemini') ? 'Gemini key configured' : 'No Gemini key set'}
                  />
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 animate-pulse" />
                    <span className="text-xs font-bold text-slate-100">Gemini Live</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Requires your own Gemini API key (BYOK).
                  </span>
                  <span className="text-[9px] font-semibold text-amber-400 mt-2 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/10 self-start">
                    BYOK
                  </span>
                </button>

                {/* GEMINI MULTI-SPEAKER CARD */}
                <button
                  id="provider-btn-gemini-multi"
                  onClick={() => setProvider('gemini-multi')}
                  type="button"
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'gemini-multi'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('gemini-multi') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('gemini-multi') ? 'Gemini key configured' : 'No Gemini key set'}
                  />
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="text-xs font-bold text-slate-100">Gemini Multi</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Two-speaker dialogue. Requires your own Gemini API key (BYOK).
                  </span>
                  <span className="text-[9px] font-semibold text-amber-400 mt-2 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/10 self-start">
                    BYOK
                  </span>
                </button>

                {/* OPENAI CARD */}
                <button
                  id="provider-btn-openai"
                  onClick={() => setProvider('openai')}
                  type="button"
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'openai'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('openai') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('openai') ? 'OpenAI key configured' : 'No OpenAI key set'}
                  />
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
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'elevenlabs'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('elevenlabs') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('elevenlabs') ? 'ElevenLabs key configured' : 'No ElevenLabs key set'}
                  />
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
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'mistral'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('mistral') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('mistral') ? 'Mistral key configured' : 'No Mistral key set'}
                  />
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

                {/* OPENROUTER CARD - Universal BYOK router for many TTS models */}
                <button
                  id="provider-btn-openrouter"
                  onClick={() => setProvider('openrouter')}
                  type="button"
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'openrouter'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('openrouter') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('openrouter') ? 'OpenRouter key configured' : 'No OpenRouter key set'}
                  />
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold text-slate-100">OpenRouter</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Route to 100+ TTS models (Grok, Gemini, Kokoro, Voxtral...). One key.
                  </span>
                  <span className="text-[9px] font-semibold text-indigo-400 mt-2 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/10 self-start">
                    BYOK SECURE
                  </span>
                </button>

                {/* xAI GROK VOICE CARD */}
                <button
                  id="provider-btn-xai"
                  onClick={() => setProvider('xai')}
                  type="button"
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'xai'
                      ? 'bg-slate-900/90 border-yellow-300 ring-2 ring-yellow-300/40 shadow-[0_0_8px_#fde04725]'
                      : 'bg-slate-900/20 border-2 border-yellow-400 hover:border-yellow-300 hover:shadow-[0_0_15px_#fde04740] hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('xai') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('xai') ? 'xAI key configured' : 'No xAI key set'}
                  />
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-black" />
                    <span className="text-xs font-bold text-slate-100">xAI Grok Voice</span>
                    {/* OAuth capability badge */}
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gradient-to-r from-yellow-300/40 via-amber-300/25 to-yellow-300/40 text-yellow-200 border border-yellow-300 font-semibold shadow-[0_0_10px_#fde04750]">
                      OAUTH
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Official Grok voices (Eve, Ara, Rex, Leo, Sal) + your custom clones. Rich speech tags.
                  </span>
                  <span className="text-[9px] font-semibold text-yellow-200 mt-2 bg-gradient-to-r from-yellow-300/30 via-amber-300/20 to-yellow-300/30 px-1.5 py-0.5 rounded border border-yellow-300/70 self-start shadow-[0_0_10px_#fde04740]">
                    OAUTH + BYOK
                  </span>
                </button>

                {/* FISH AUDIO CARD */}
                {/* Native TTS provider (not OpenAI-compatible). Free s2.1-pro-free
                    model with no hard usage cap during the preview period. */}
                <button
                  id="provider-btn-fish"
                  onClick={() => setProvider('fish')}
                  type="button"
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'fish'
                      ? 'bg-slate-900/90 border-teal-300 ring-2 ring-teal-300/40 shadow-[0_0_8px_#5eead425]'
                      : 'bg-slate-900/20 border-2 border-teal-400 hover:border-teal-300 hover:shadow-[0_0_15px_#5eead440] hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('fish') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('fish') ? 'Fish Audio key configured' : 'No Fish Audio key set'}
                  />
                  <div className="flex items-center gap-2">
                    <AudioLines className="w-4 h-4 text-teal-300" />
                    <span className="text-xs font-bold text-slate-100">Fish Audio</span>
                    {/* FREE badge — the headline feature */}
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gradient-to-r from-teal-300/40 via-cyan-300/25 to-teal-300/40 text-teal-100 border border-teal-300 font-semibold shadow-[0_0_10px_#5eead450]">
                      FREE
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    S2.1 Pro state-of-the-art model · 83 languages · free during preview · in-app voice cloning.
                  </span>
                  <span className="text-[9px] font-semibold text-teal-100 mt-2 bg-gradient-to-r from-teal-300/30 via-cyan-300/20 to-teal-300/30 px-1.5 py-0.5 rounded border border-teal-300/70 self-start shadow-[0_0_10px_#5eead440]">
                    BYOK
                  </span>
                </button>

                {/* NVIDIA NIM CARD */}
                <button
                  id="provider-btn-nvidia"
                  onClick={() => setProvider('nvidia')}
                  type="button"
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'nvidia'
                      ? 'bg-slate-900/90 border-green-400/80 ring-2 ring-green-400/30 shadow-[0_0_8px_#4ade8025]'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('nvidia') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('nvidia') ? 'NVIDIA NIM key configured' : 'No NVIDIA key set'}
                  />
                  <div className="flex items-center gap-2">
                    <AudioLines className="w-4 h-4 text-green-400" />
                    <span className="text-xs font-bold text-slate-100">NVIDIA NIM</span>
                    {/* FREE badge */}
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-gradient-to-r from-green-400/40 via-emerald-300/25 to-green-400/40 text-green-100 border border-green-400 font-semibold shadow-[0_0_10px_#4ade8050]">
                      FREE
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    OpenAI-compatible TTS + LLM. Free inference API with $200 new user credits.
                  </span>
                  <span className="text-[9px] font-semibold text-green-100 mt-2 bg-gradient-to-r from-green-400/30 via-emerald-300/20 to-green-400/30 px-1.5 py-0.5 rounded border border-green-400/70 self-start shadow-[0_0_10px_#4ade8040]">
                    BYOK
                  </span>
                </button>

                {/* OMNIVOICE HF CARD */}
                <button
                  id="provider-btn-omnivoice"
                  onClick={() => setProvider('omnivoice')}
                  type="button"
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'omnivoice'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('omnivoice') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('omnivoice') ? 'HF Token configured' : 'No HF Token set'}
                  />
                  <div className="flex items-center gap-2">
                    <AudioLines className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-bold text-slate-100">OmniVoice (HF)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Zero-shot cloning via /_clone_fn. (Design mode without ref also exists upstream.)
                  </span>
                  <span className="text-[9px] font-semibold text-orange-400 mt-2 bg-orange-500/10 px-1.5 py-0.5 rounded border border-orange-500/10 self-start">
                    REF AUDIO REQUIRED
                  </span>
                </button>

                {/* VOXCPM HF CARD */}
                <button
                  id="provider-btn-voxcpm"
                  onClick={() => setProvider('voxcpm')}
                  type="button"
                  className={`relative flex flex-col text-left p-4 rounded-xl border transition-all duration-200 ${
                    provider === 'voxcpm'
                      ? 'bg-slate-900/90 border-slate-700/80 ring-1 ring-slate-800/50'
                      : 'bg-slate-900/20 border-slate-900 hover:border-slate-800/80 hover:bg-slate-900/30'
                  }`}
                >
                  {/* Key indicator dot */}
                  <div 
                    className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full border border-slate-950 ${hasKeyForProvider('voxcpm') ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    title={hasKeyForProvider('voxcpm') ? 'HF Token configured' : 'No HF Token set'}
                  />
                  <div className="flex items-center gap-2">
                    <AudioLines className="w-4 h-4 text-pink-400" />
                    <span className="text-xs font-bold text-slate-100">VoxCPM (HF)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    High-quality TTS. Reference audio is optional (default voice supported).
                  </span>
                  <span className="text-[9px] font-semibold text-pink-400 mt-2 bg-pink-500/10 px-1.5 py-0.5 rounded border border-pink-500/10 self-start">
                    REF AUDIO OPTIONAL
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

                  {/* Sync saved Mistral voices (parity with CLI `voices` + audio.voices.list) */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      id="sync-mistral-voices-btn"
                      onClick={fetchMistralVoices}
                      disabled={isFetchingMistralVoices || !mistralKey}
                      type="button"
                      className="flex items-center gap-1.5 text-[11px] font-semibold bg-purple-600 hover:bg-purple-550 border border-purple-550 py-1.5 px-3 rounded-lg text-white font-mono shrink-0 transition-colors disabled:opacity-40"
                    >
                      {isFetchingMistralVoices ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      SYNC SAVED VOICES
                    </button>
                    <span className="text-[10px] text-slate-400 italic">
                      {mistralVoicesStatus || 'Loads your Mistral Voxtral saved voices for selection.'}
                    </span>
                  </div>
                </div>
              )}

              {provider === 'openrouter' && (
                <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      OPENROUTER API KEY
                    </label>
                    <a
                      href="https://openrouter.ai/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-400 hover:underline"
                    >
                      Get Key ↗
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type={hideOrKey ? 'password' : 'text'}
                      value={openrouterKey}
                      onChange={(e) => updateOpenrouterKey(e.target.value)}
                      placeholder="sk-or-..."
                      className="flex-grow bg-slate-950 border border-slate-850 focus:border-slate-750 text-xs text-slate-100 py-1.8 px-3 rounded-lg font-mono placeholder-slate-700"
                    />
                    <button
                      onClick={() => setHideOrKey(!hideOrKey)}
                      type="button"
                      className="bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 py-2 px-3 rounded-lg border border-slate-800"
                    >
                      {hideOrKey ? 'SHOW' : 'HIDE'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    One key unlocks dozens of TTS models (Grok Voice, Kokoro, Gemini, OpenAI, Mistral, Zonos...). Configure the exact model in Advanced Engine Modifiers.
                  </p>
                  <p className="text-[9px] text-indigo-400/80">
                    Recommended: start with <span className="font-mono">openai/gpt-4o-mini-tts-2025-12-15</span> or <span className="font-mono">x-ai/grok-voice-tts-1.0</span>
                  </p>
                </div>
              )}

              {provider === 'xai' && (
                <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                  {/* OAuth Connect Section */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-amber-300 uppercase tracking-widest">xAI OAUTH (Recommended)</span>
                    </div>

                    {!xaiOauthTokens ? (
                      <button
                        onClick={connectWithXaiOAuth}
                        type="button"
                        className="mx-auto w-full max-w-[320px] flex items-center justify-center gap-2 text-sm font-semibold 
                                   bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 
                                   hover:from-amber-200 hover:via-yellow-300 hover:to-amber-200 
                                   text-black py-2.5 px-6 rounded-xl transition-all active:scale-[0.985] shadow-md"
                      >
                        <User className="w-4 h-4" />
                        Sign in with xAI (SuperGrok / X Premium+)
                      </button>
                    ) : (
                      <div className="flex items-center justify-between bg-slate-950 border border-amber-400/60 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="w-2 h-2 rounded-full bg-emerald-400" />
                          <span className="text-amber-300 font-medium">Connected via OAuth</span>
                          <span className="text-slate-400 text-xs">— using your xAI subscription</span>
                        </div>
                        <button
                          onClick={disconnectXaiOAuth}
                          type="button"
                          className="text-[10px] px-2 py-1 rounded-md border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-slate-200"
                        >
                          DISCONNECT
                        </button>
                      </div>
                    )}

                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Sign in with your xAI account to use Grok Voice on your SuperGrok or X Premium+ subscription (no separate API key needed).
                    </p>

                    {xaiVoicesStatus ? (
                      <p
                        role="status"
                        className="text-[11px] text-amber-200/95 font-medium text-center px-2 py-1.5 rounded-lg bg-amber-400/10 border border-amber-400/25"
                      >
                        {xaiVoicesStatus}
                      </p>
                    ) : null}

                    {/* Manual code paste fallback — exactly like the EA flow in m26pipeline.
                        After xAI redirects the browser to the loopback URL, if nothing listens
                        the user sees the code in the address bar and pastes it here. */}
                    <div className="mt-2 border border-slate-800 rounded-lg p-3 bg-slate-950/60">
                      <div className="text-[10px] text-amber-300 font-mono mb-1.5">
                        POPUP GOT STUCK? PASTE THE CODE FROM YOUR BROWSER ADDRESS BAR
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={xaiManualPasteCode}
                          onChange={(e) => setXaiManualPasteCode(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitManualXaiCode(); }}
                          placeholder="http://127.0.0.1:56121/callback?code=XXXX... or just the code"
                          className="flex-1 bg-slate-900 border border-slate-700 text-xs font-mono px-3 py-1.5 rounded-md text-slate-100 placeholder:text-slate-600"
                        />
                        <button
                          onClick={submitManualXaiCode}
                          type="button"
                          className="px-4 text-xs font-semibold bg-amber-300 hover:bg-amber-200 text-black rounded-md transition-colors"
                        >
                          SUBMIT
                        </button>
                      </div>
                      <div className="text-[9px] text-slate-500 mt-1.5 leading-snug">
                        Copy the full URL (or the <span className="font-mono">code=...</span> value) after xAI login and paste it above. Works in production.
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-slate-800 my-1" />

                  {/* Manual API Key (fallback) */}
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-slate-400 uppercase tracking-widest flex items-center gap-1">
                      xAI API KEY (Fallback)
                    </label>
                    <a
                      href="https://console.x.ai/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-white hover:underline"
                    >
                      Get Key ↗
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type={hideXaiKey ? 'password' : 'text'}
                      value={xaiKey}
                      onChange={(e) => updateXaiKey(e.target.value)}
                      placeholder="xai-..."
                      className="flex-grow bg-slate-950 border border-slate-850 focus:border-slate-750 text-xs text-slate-100 py-1.8 px-3 rounded-lg font-mono placeholder-slate-700"
                    />
                    <button
                      onClick={() => setHideXaiKey(!hideXaiKey)}
                      type="button"
                      className="bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 py-2 px-3 rounded-lg border border-slate-800"
                    >
                      {hideXaiKey ? 'SHOW' : 'HIDE'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Direct access to official Grok Voice models. Supports custom voice cloning in the xAI console and rich expressive tags ([laugh], &lt;whisper&gt;, etc).
                  </p>
                  <p className="text-[9px] text-white/70">
                    Built-in voices: eve (default), ara, rex, sal, leo. Use "Sync Voices" to load custom clones.
                  </p>

                  {/* Sync custom xAI voices */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      id="sync-xai-voices-btn"
                      onClick={fetchXaiVoices}
                      disabled={isFetchingXaiVoices || (!xaiKey && !xaiOauthTokens)}
                      type="button"
                      className="flex items-center gap-1.5 text-[11px] font-semibold bg-white hover:bg-white/90 border border-white/70 py-1.5 px-3 rounded-lg text-black font-mono shrink-0 transition-colors disabled:opacity-40"
                    >
                      {isFetchingXaiVoices ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      SYNC VOICES
                    </button>
                    <span className="text-[10px] text-slate-400 italic">
                      {xaiVoicesStatus || 'Loads your custom cloned voices from xAI.'}
                    </span>
                  </div>
                </div>
              )}

              {/* FISH AUDIO API KEY + SYNC */}
              {provider === 'fish' && (
                <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-teal-300 uppercase tracking-widest flex items-center gap-1">
                      FISH AUDIO API KEY
                    </label>
                    <a
                      href="https://fish.audio/app/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-white hover:underline"
                    >
                      Get Key ↗
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type={hideFishKey ? 'password' : 'text'}
                      value={fishKey}
                      onChange={(e) => updateFishKey(e.target.value)}
                      placeholder="paste your fish.audio key"
                      className="flex-grow bg-slate-950 border border-slate-850 focus:border-slate-750 text-xs text-slate-100 py-1.8 px-3 rounded-lg font-mono placeholder-slate-700"
                    />
                    <button
                      onClick={() => setHideFishKey(!hideFishKey)}
                      type="button"
                      className="bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 py-2 px-3 rounded-lg border border-slate-800"
                    >
                      {hideFishKey ? 'SHOW' : 'HIDE'}
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Free <code className="text-teal-300">s2.1-pro-free</code> model — state-of-the-art voice, 83 languages, no hard usage cap during the preview period.
                    Keys entered here are used per-request (strict BYOK).
                  </p>
                  <p className="text-[9px] text-white/70">
                    No voice selected = Fish Audio's built-in default voice. Use "Sync Voices" to load your custom models from fish.audio.
                  </p>

                  {/* Sync custom Fish Audio voices */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      id="sync-fish-voices-btn"
                      onClick={fetchFishVoices}
                      disabled={isFetchingFishVoices || !fishKey}
                      type="button"
                      className="flex items-center gap-1.5 text-[11px] font-semibold bg-white hover:bg-white/90 border border-white/70 py-1.5 px-3 rounded-lg text-black font-mono shrink-0 transition-colors disabled:opacity-40"
                    >
                      {isFetchingFishVoices ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      SYNC VOICES
                    </button>
                    <span className="text-[10px] text-slate-400 italic">
                      {fishVoicesStatus || 'Loads your custom voice models from Fish Audio.'}
                    </span>
                  </div>
                </div>
              )}

              {/* NVIDIA NIM API KEY */}
              {provider === 'nvidia' && (
                <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-mono text-green-400 uppercase tracking-widest flex items-center gap-1">
                      NVIDIA NIM API KEY
                    </label>
                    <a
                      href="https://build.nvidia.com/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-white hover:underline"
                    >
                      Get Key ↗
                    </a>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type={hideNvidiaKey ? 'password' : 'text'}
                      value={nvidiaKey}
                      onChange={(e) => updateNvidiaKey(e.target.value)}
                      placeholder="nvapi-..."
                      className="flex-grow bg-slate-950 border border-slate-850 focus:border-slate-750 text-xs text-slate-100 py-1.8 px-3 rounded-lg font-mono placeholder-slate-700"
                    />
                    <button
                      onClick={() => setHideNvidiaKey(!hideNvidiaKey)}
                      type="button"
                      className="bg-slate-850 hover:bg-slate-800 text-[10px] text-slate-300 py-2 px-3 rounded-lg border border-slate-800"
                    >
                      {hideNvidiaKey ? 'SHOW' : 'HIDE'}
                    </button>
                  </div>

                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    OpenAI-compatible TTS at <code className="text-green-300">https://integrate.api.nvidia.com/v1</code>. 
                    $200 free credits for new users — no hard usage cap on many models.
                  </p>
                  <p className="text-[9px] text-white/70">
                    TTS model: <code className="text-green-300">nvidia/parakeet-seamless-1.0</code>. Also powers the LLM Script Enhancer.
                  </p>
                </div>
              )}

              {/* Keys are now managed globally via the Settings button in the header */}

              {/* VOICE MANAGER CONTROL */}
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-mono text-slate-400 uppercase tracking-widest block">
                    SELECT VOCAL PROFILE
                  </label>
                  <button
                    onClick={() => playVoiceSample()}
                    disabled={isPreviewing || (!voiceId && provider !== 'fish' && provider !== 'nvidia') || (provider !== 'elevenlabs' && provider !== 'mistral' && provider !== 'gemini' && provider !== 'gemini-multi' && provider !== 'openrouter' && provider !== 'xai' && provider !== 'fish' && provider !== 'nvidia')}
                    type="button"
                    className="flex items-center gap-1.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 border border-slate-700 py-1 px-2.5 rounded-lg text-slate-300 font-mono transition-colors disabled:opacity-40"
                    title="Play short voice sample (like CLI voice-sample)"
                  >
                    {isPreviewing ? 'Previewing…' : '▶ Preview Voice'}
                  </button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {/* Real Rendering of Voices — hidden for multi-speaker (configured in Advanced Modifiers) */}
                  {provider === 'gemini' && provider !== 'gemini-multi' && GEMINI_VOICES.map((v) => (
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

                  {/* OpenRouter: model-driven. Show quick presets that set both the routed model and a compatible voice. */}
                  {provider === 'openrouter' && (
                    <div className="col-span-2 sm:col-span-3 text-[10px] text-slate-400 bg-slate-900/60 border border-slate-800 rounded-xl p-3">
                      <div className="font-semibold text-indigo-300 mb-1.5">OpenRouter TTS Presets (model + voice)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { label: 'GPT-4o Mini', model: 'openai/gpt-4o-mini-tts-2025-12-15', voice: 'alloy' },
                          { label: 'Grok Voice', model: 'x-ai/grok-voice-tts-1.0', voice: 'Eve' },
                          { label: 'Gemini Flash (OR)', model: 'google/gemini-3.1-flash-tts-preview', voice: 'Kore' },
                          { label: 'Voxtral (OR)', model: 'mistralai/voxtral-mini-tts-2603', voice: 'bellatrix' },
                          { label: 'Kokoro 82M', model: 'hexgrad/kokoro-82m', voice: 'af_bella' },
                        ].map((p, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setOpenrouterModel(p.model);
                              setVoiceId(p.voice);
                            }}
                            className={`px-2 py-0.5 rounded border text-[10px] transition ${openrouterModel === p.model ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'}`}
                            title={`${p.model} + voice=${p.voice}`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                      <div className="mt-2 text-[9px] text-slate-500">
                        Current model: <span className="font-mono text-indigo-300">{openrouterModel}</span> • voice: <span className="font-mono">{voiceId}</span>. Edit full model in Advanced.
                      </div>
                    </div>
                  )}

                  {/* xAI Grok Voice voices - built-in 5 + synced custom clones */}
                  {provider === 'xai' && (
                    <>
                      {XAI_VOICES.map((v) => (
                        <button
                          key={v.id}
                          id={`voice-btn-${v.id}`}
                          onClick={() => setVoiceId(v.id)}
                          type="button"
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                            voiceId === v.id
                              ? 'bg-slate-900 border-white/60 shadow text-slate-100'
                              : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                          }`}
                        >
                          <span className="text-xs font-bold truncate block">{v.id}</span>
                          <span className="text-[9px] mt-1 text-slate-500">{v.gender}</span>
                        </button>
                      ))}
                      {xaiCustomVoices.map((v) => (
                        <button
                          key={v.id}
                          id={`voice-btn-${v.id}`}
                          onClick={() => setVoiceId(v.id)}
                          type="button"
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                            voiceId === v.id
                              ? 'bg-slate-900 border-white/60 shadow text-slate-100'
                              : 'bg-slate-900/15 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                          }`}
                        >
                          <span className="text-xs font-bold truncate block">{v.name.split(' ')[0]}</span>
                          <span className="text-[9px] mt-1 text-slate-500">Custom</span>
                        </button>
                      ))}
                    </>
                  )}

                  {/* Fish Audio voices — built-in Default tile + synced custom models */}
                  {provider === 'fish' && (
                    <>
                      {/* Default voice tile (empty voiceId) */}
                      <button
                        key="__fish_default"
                        id="voice-btn-__fish_default"
                        onClick={() => setVoiceId('')}
                        type="button"
                        className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                          voiceId === ''
                            ? 'bg-slate-900 border-teal-400/60 shadow text-slate-100'
                            : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                        }`}
                      >
                        <span className="text-xs font-bold truncate block">Default</span>
                        <span className="text-[9px] mt-1 text-slate-500">Built-in</span>
                      </button>
                      {fishCustomVoices.map((v) => (
                        <button
                          key={v.id}
                          id={`voice-btn-${v.id}`}
                          onClick={() => setVoiceId(v.id)}
                          type="button"
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                            voiceId === v.id
                              ? 'bg-slate-900 border-teal-400/60 shadow text-slate-100'
                              : 'bg-slate-900/15 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                          }`}
                        >
                          <span className="text-xs font-bold truncate block">{v.name.split(' ')[0]}</span>
                          <span className="text-[9px] mt-1 text-slate-500 truncate" title={String(v.gender)}>{v.gender}</span>
                        </button>
                      ))}
                      {fishCustomVoices.length === 0 && (
                        <span className="text-[10px] text-slate-500 italic col-span-2 self-center">
                          Click "Sync Voices" above to load your Fish Audio voice models, or create one below.
                        </span>
                      )}
                    </>
                  )}

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

                  {/* NVIDIA NIM — single TTS voice (parakeet-seamless) */}
                  {provider === 'nvidia' && (
                    <button
                      key="nvidia-default"
                      id="voice-btn-nvidia-default"
                      onClick={() => setVoiceId('default')}
                      type="button"
                      className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                        voiceId === 'default' || !voiceId
                          ? 'bg-slate-900 border-green-500/60 shadow text-slate-100'
                          : 'bg-slate-900/30 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                      }`}
                    >
                      <span className="text-xs font-bold truncate block">Default</span>
                      <span className="text-[9px] mt-1 text-slate-500">Neutral • Parakeet</span>
                    </button>
                  )}

                  {provider === 'mistral' && (
                    <>
                      {/* Dynamically loaded saved voices (preferred when user has clicked Sync) */}
                      {mistralCustomVoices.map((v) => (
                        <button
                          key={v.id}
                          id={`voice-btn-${v.id}`}
                          onClick={() => setVoiceId(v.id)}
                          type="button"
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all duration-150 ${
                            voiceId === v.id
                              ? 'bg-slate-900 border-purple-500/60 shadow text-slate-100'
                              : 'bg-slate-900/15 border-slate-900 hover:border-slate-800 text-slate-400 hover:text-slate-350'
                          }`}
                        >
                          <span className="text-xs font-bold truncate block">{v.name?.split(' ')[0] || v.id}</span>
                          <span className="text-[9px] mt-1 text-slate-500">{v.gender} • My Voice</span>
                        </button>
                      ))}
                      {/* Static fallback profiles (used until Sync is clicked) */}
                      {mistralCustomVoices.length === 0 && MISTRAL_VOICES.map((v) => (
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
                    </>
                  )}
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

                {provider === 'gemini-multi' && (
                  <div className="space-y-4">
                    <div className="text-[10px] text-amber-400 font-mono uppercase tracking-wider mb-2">
                      Two-Speaker Dialogue — Speaker names in your script must match exactly
                    </div>

                    {/* Speaker 1 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Speaker 1 Name</label>
                        <input
                          type="text"
                          value={gmSpeaker1}
                          onChange={(e) => setGmSpeaker1(e.target.value)}
                          placeholder="Joe"
                          className="bg-slate-950 border border-slate-850 text-xs py-1.5 px-3 rounded-lg text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Speaker 1 Voice</label>
                        <select
                          value={gmVoice1}
                          onChange={(e) => setGmVoice1(e.target.value)}
                          className="bg-slate-950 border border-slate-850 hover:border-slate-750 text-xs py-1.5 px-3 rounded-lg text-slate-200 focus:outline-none"
                        >
                          {GEMINI_VOICES.map(v => (
                            <option key={v.id} value={v.id}>{v.id} — {v.name.split('(')[1]?.replace(')', '') || ''}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Speaker 2 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Speaker 2 Name</label>
                        <input
                          type="text"
                          value={gmSpeaker2}
                          onChange={(e) => setGmSpeaker2(e.target.value)}
                          placeholder="Jane"
                          className="bg-slate-950 border border-slate-850 text-xs py-1.5 px-3 rounded-lg text-slate-200 focus:outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">Speaker 2 Voice</label>
                        <select
                          value={gmVoice2}
                          onChange={(e) => setGmVoice2(e.target.value)}
                          className="bg-slate-950 border border-slate-850 hover:border-slate-750 text-xs py-1.5 px-3 rounded-lg text-slate-200 focus:outline-none"
                        >
                          {GEMINI_VOICES.map(v => (
                            <option key={v.id} value={v.id}>{v.id} — {v.name.split('(')[1]?.replace(')', '') || ''}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="text-[9px] text-slate-500 italic mt-1">
                      Example script: <span className="font-mono text-amber-300">Joe: Hello there! Jane: Hi Joe, how are you today?</span>
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

                {/* OpenRouter advanced: free-form model slug + optional speed override */}
                {provider === 'openrouter' && (
                  <div className="flex flex-col gap-3">
                    <div>
                      <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Routed TTS Model (OpenRouter slug)</label>
                      <input
                        type="text"
                        value={openrouterModel}
                        onChange={(e) => setOpenrouterModel(e.target.value.trim())}
                        placeholder="openai/gpt-4o-mini-tts-2025-12-15 or x-ai/grok-voice-tts-1.0"
                        className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 text-xs py-1.5 px-3 rounded-lg text-slate-200 font-mono"
                      />
                      <p className="text-[9px] text-slate-500 mt-1">Full list: openrouter.ai/models?output_modalities=speech. Many support extra params via future UI.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Voice (model specific)</label>
                        <input
                          type="text"
                          value={voiceId}
                          onChange={(e) => setVoiceId(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 text-xs py-1.5 px-3 rounded-lg text-slate-200 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Speed (0.25–4.0, optional)</label>
                        <input
                          type="number"
                          step="0.1"
                          min="0.25"
                          max="4"
                          value={openrouterSpeed ?? ''}
                          onChange={(e) => setOpenrouterSpeed(e.target.value ? Number(e.target.value) : undefined)}
                          placeholder="1.0"
                          className="w-full bg-slate-950 border border-slate-850 focus:border-indigo-500 text-xs py-1.5 px-3 rounded-lg text-slate-200 font-mono"
                        />
                        <div className="text-[9px] text-slate-500 mt-0.5">Leave blank for model default.</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* xAI Grok Voice advanced controls */}
                {provider === 'xai' && (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Language</label>
                        <select
                          value={xaiLanguage}
                          onChange={(e) => setXaiLanguage(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-white text-xs py-1.5 px-3 rounded-lg text-slate-200"
                        >
                          <option value="en">en — English</option>
                          <option value="auto">auto — Detect</option>
                          <option value="zh">zh — Chinese</option>
                          <option value="es-ES">es-ES — Spanish (Spain)</option>
                          <option value="es-MX">es-MX — Spanish (Mexico)</option>
                          <option value="fr">fr — French</option>
                          <option value="de">de — German</option>
                          <option value="ja">ja — Japanese</option>
                          <option value="ko">ko — Korean</option>
                          <option value="pt-BR">pt-BR — Portuguese (Brazil)</option>
                          <option value="ru">ru — Russian</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Speed ({xaiSpeed.toFixed(1)}×)</label>
                        <input
                          type="range"
                          min="0.7"
                          max="1.5"
                          step="0.05"
                          value={xaiSpeed}
                          onChange={(e) => setXaiSpeed(Number(e.target.value))}
                          className="w-full accent-white"
                        />
                        <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
                          <span>Slower</span>
                          <span>Faster</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-500">
                      xAI supports rich expressive tags in text: [laugh], [pause], &lt;whisper&gt;, &lt;emphasis&gt;, etc.
                    </p>
                  </div>
                )}

                {/* Fish Audio advanced controls */}
                {provider === 'fish' && (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Engine model selector — free s2.1-pro-free is the default */}
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Engine Model</label>
                        <select
                          value={fishModel}
                          onChange={(e) => setFishModel(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-white text-xs py-1.5 px-3 rounded-lg text-slate-200"
                        >
                          <option value="s2.1-pro-free">s2.1-pro-free — FREE (state-of-the-art)</option>
                          <option value="s2-pro">s2-pro — Paid (SLA + latency guarantees)</option>
                          <option value="s1">s1 — Legacy</option>
                        </select>
                      </div>
                      {/* Latency tier */}
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Latency Tier</label>
                        <select
                          value={fishLatency}
                          onChange={(e) => setFishLatency(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 focus:border-white text-xs py-1.5 px-3 rounded-lg text-slate-200"
                        >
                          <option value="normal">normal — Best quality</option>
                          <option value="balanced">balanced — Quality/speed tradeoff</option>
                          <option value="low">low — Lowest latency</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Temperature — expressiveness */}
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Temperature ({fishTemperature.toFixed(2)})</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={fishTemperature}
                          onChange={(e) => setFishTemperature(Number(e.target.value))}
                          className="w-full accent-teal-400"
                        />
                        <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
                          <span>Calm</span>
                          <span>Expressive</span>
                        </div>
                      </div>
                      {/* Top P — nucleus sampling */}
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Top P ({fishTopP.toFixed(2)})</label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={fishTopP}
                          onChange={(e) => setFishTopP(Number(e.target.value))}
                          className="w-full accent-teal-400"
                        />
                        <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
                          <span>Focused</span>
                          <span>Diverse</span>
                        </div>
                      </div>
                      {/* Prosody speed */}
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Speed ({fishSpeed.toFixed(1)}×)</label>
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.1"
                          value={fishSpeed}
                          onChange={(e) => setFishSpeed(Number(e.target.value))}
                          className="w-full accent-teal-400"
                        />
                        <div className="flex justify-between text-[9px] text-slate-500 mt-0.5">
                          <span>Slower</span>
                          <span>Faster</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-[9px] text-slate-500">
                      S2-Pro supports free-form <code className="text-teal-300">[bracket]</code> emotion tags in text,
                      e.g. <code>[whispering]</code> or <code>[slightly sarcastic, rising tone]</code>. Model goes in a request header (like xAI).
                    </p>
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

                {/* HF PROVIDERS — REFERENCE AUDIO + OMNIVOICE MODES (placed here for layout consistency with other providers) */}
                {(provider === 'omnivoice' || provider === 'voxcpm') && (
                  <div className="border-t border-slate-900 mt-4 pt-4 flex flex-col gap-4">

                    {/* OmniVoice Mode Switcher + Design Controls */}
                    {provider === 'omnivoice' && (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-400 uppercase tracking-widest">OmniVoice Mode</span>
                          <div className="inline-flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() => setOmniVoiceMode('cloning')}
                              className={`px-3 py-1 rounded-md transition-all ${omniVoiceMode === 'cloning' 
                                ? 'bg-orange-500/90 text-white font-semibold' 
                                : 'text-slate-300 hover:bg-slate-900'}`}
                            >
                              Cloning
                            </button>
                            <button
                              type="button"
                              onClick={() => setOmniVoiceMode('design')}
                              className={`px-3 py-1 rounded-md transition-all ${omniVoiceMode === 'design' 
                                ? 'bg-orange-500/90 text-white font-semibold' 
                                : 'text-slate-300 hover:bg-slate-900'}`}
                            >
                              Design
                            </button>
                          </div>
                          <span className="text-[10px] text-slate-500">
                            {omniVoiceMode === 'cloning' ? 'Reference audio required' : 'Attribute-based generation'}
                          </span>
                        </div>

                        {/* Design Mode Controls */}
                        {omniVoiceMode === 'design' && (
                          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
                            <div className="text-[10px] font-semibold text-orange-300 mb-2">Design Mode Controls</div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                              <div>
                                <label className="block text-slate-400 mb-1">Gender</label>
                                <select value={omniDesignGender} onChange={e => setOmniDesignGender(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs">
                                  <option>Auto</option><option>Male / 男</option><option>Female / 女</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-slate-400 mb-1">Age</label>
                                <select value={omniDesignAge} onChange={e => setOmniDesignAge(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs">
                                  <option>Auto</option><option>Child / 儿童</option><option>Teenager / 少年</option><option>Young Adult / 青年</option><option>Middle-aged / 中年</option><option>Elderly / 老年</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-slate-400 mb-1">Pitch</label>
                                <select value={omniDesignPitch} onChange={e => setOmniDesignPitch(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs">
                                  <option>Auto</option><option>Very Low Pitch</option><option>Low Pitch</option><option>Moderate Pitch</option><option>High Pitch</option><option>Very High Pitch</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-slate-400 mb-1">Style</label>
                                <select value={omniDesignStyle} onChange={e => setOmniDesignStyle(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs">
                                  <option>Auto</option><option>Whisper</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-slate-400 mb-1">English Accent</label>
                                <select value={omniDesignEnglishAccent} onChange={e => setOmniDesignEnglishAccent(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs">
                                  <option>Auto</option><option>American</option><option>British</option><option>Chinese</option><option>Indian</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-slate-400 mb-1">Chinese Dialect</label>
                                <select value={omniDesignChineseDialect} onChange={e => setOmniDesignChineseDialect(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs">
                                  <option>Auto</option><option>Henan</option><option>Sichuan</option><option>Northeast</option>
                                </select>
                              </div>
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* Reference Audio (for OmniVoice cloning or VoxCPM) */}
                    {((provider === 'omnivoice' && omniVoiceMode === 'cloning') || provider === 'voxcpm') && (
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <AudioLines className="w-3.5 h-3.5 text-orange-400" />
                          <span className="text-[10px] font-mono text-orange-300 uppercase tracking-widest">
                            {provider === 'omnivoice' ? 'Reference Audio (Required)' : 'Reference Audio (Optional)'}
                          </span>
                        </div>

                        {!hfRefAudio ? (
                          <label className="flex flex-col items-center justify-center border-2 border-dashed border-orange-500/40 hover:border-orange-400/60 rounded-lg p-3 cursor-pointer bg-slate-950/40 text-center">
                            <input
                              type="file"
                              accept="audio/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const result = reader.result as string;
                                  const base64 = result.includes(',') ? result.split(',')[1] : result;
                                  setHfRefAudio(base64);
                                  setHfRefAudioName(file.name);
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                            <Upload className="w-4 h-4 text-orange-400 mb-1" />
                            <span className="text-xs text-orange-200">Upload reference clip (.wav / .mp3)</span>
                            <span className="text-[9px] text-orange-400/70 mt-0.5">
                              {provider === 'omnivoice' ? 'Required for cloning' : 'For voice cloning (or leave empty)'}
                            </span>
                          </label>
                        ) : (
                          <div className="flex items-center justify-between bg-slate-950 border border-orange-500/30 rounded px-3 py-1.5 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <AudioLines className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" />
                              <span className="font-mono text-orange-200 truncate">{hfRefAudioName}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => { setHfRefAudio(''); setHfRefAudioName(''); }}
                              className="text-orange-400 hover:text-orange-200 px-2"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* FISH AUDIO — CREATE A VOICE MODEL FROM AN AUDIO SAMPLE */}
                {/* Uploads a clip via /api/tts/fish/voices/create (server re-wraps as
                    multipart POST /model). Training is async on Fish Audio's side. */}
                {provider === 'fish' && (
                  <div className="border-t border-slate-900 mt-4 pt-4 flex flex-col gap-3">
                    <div className="flex items-center gap-1.5">
                      <AudioLines className="w-3.5 h-3.5 text-teal-400" />
                      <span className="text-[9px] font-mono text-teal-300 uppercase tracking-widest">CREATE A VOICE MODEL</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Voice name */}
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Voice Name</label>
                        <input
                          type="text"
                          value={fishCreateName}
                          onChange={(e) => setFishCreateName(e.target.value)}
                          placeholder="e.g. Narrator (Warm)"
                          className="w-full bg-slate-950 border border-slate-850 focus:border-teal-500 text-xs text-slate-100 py-1.5 px-3 rounded-lg placeholder-slate-700"
                        />
                      </div>

                      {/* Audio sample upload (mirrors OmniVoice reference-audio pattern) */}
                      <div>
                        <label className="text-[10px] text-slate-400 uppercase tracking-wider font-mono block mb-1">Audio Sample</label>
                        {!fishCreateAudio ? (
                          <label className="flex items-center justify-center gap-2 border-2 border-dashed border-teal-500/40 hover:border-teal-400/60 rounded-lg py-1.5 px-3 cursor-pointer bg-slate-950/40 text-center">
                            <input
                              type="file"
                              accept="audio/*"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const result = reader.result as string;
                                  const base64 = result.includes(',') ? result.split(',')[1] : result;
                                  setFishCreateAudio(base64);
                                  setFishCreateAudioName(file.name);
                                  setFishCreateAudioMime(file.type || 'audio/wav');
                                };
                                reader.readAsDataURL(file);
                              }}
                            />
                            <Upload className="w-3.5 h-3.5 text-teal-400" />
                            <span className="text-[11px] text-teal-200">Upload clip (.wav / .mp3)</span>
                          </label>
                        ) : (
                          <div className="flex items-center justify-between bg-slate-950 border border-teal-500/30 rounded px-3 py-1.5 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <AudioLines className="w-3.5 h-3.5 text-teal-400 flex-shrink-0" />
                              <span className="font-mono text-teal-200 truncate">{fishCreateAudioName}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => { setFishCreateAudio(''); setFishCreateAudioName(''); }}
                              className="text-teal-400 hover:text-teal-200 px-2"
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        id="create-fish-voice-btn"
                        onClick={createFishVoice}
                        disabled={isCreatingFishVoice || !fishKey || !fishCreateName.trim() || !fishCreateAudio}
                        type="button"
                        className="flex items-center gap-1.5 text-[11px] font-semibold bg-teal-500 hover:bg-teal-400 border border-teal-400 py-1.5 px-3 rounded-lg text-black font-mono shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isCreatingFishVoice ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        CREATE VOICE
                      </button>
                      <span className="text-[10px] text-slate-400 italic">
                        {fishCreateStatus || '10–30s of clean speech works best. Voices train async on Fish Audio.'}
                      </span>
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
                disabled={
                  isSynthesizing ||
                  (provider === 'omnivoice' && omniVoiceMode === 'cloning' && !hfRefAudio)
                }
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
                    SYNTHESIZE SPEECH
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
                immersiveTrigger={immersiveTrigger}
                onTogglePlayPause={togglePlayPause}
                onSeek={(t) => { if (audioRef.current) { audioRef.current.currentTime = t; setCurrentTime(t); } }}
                onSkip={handleSkip}
                onToggleMute={toggleMute}
                onVolumeChange={handleVolumeChange}
                isMuted={isMuted}
                volume={volume}
                playbackRate={voiceRate}
                onPlaybackRateChange={setVoiceRate}
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
                                : rec.provider === 'fish'
                                ? 'bg-teal-500/5 text-teal-400 border-teal-500/10'
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
                                : item.provider === 'fish'
                                ? 'bg-teal-500/5 text-teal-400 border-teal-500/10'
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

      {/* Global API Keys Settings Modal */}
      {showApiSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl w-full max-w-2xl mx-4 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-slate-400" />
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">API Keys &amp; Credentials</h2>
                  <p className="text-xs text-slate-500">All keys are stored locally in your browser (localStorage)</p>
                </div>
              </div>
              <button
                onClick={() => setShowApiSettings(false)}
                className="text-slate-400 hover:text-slate-200 p-2 rounded-lg hover:bg-slate-900"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">

              {/* Gemini */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">Gemini API Key</label>
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-xs text-amber-400 hover:underline">Get Key ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideGeminiKey ? 'password' : 'text'}
                    value={geminiKey}
                    onChange={(e) => updateGeminiKey(e.target.value)}
                    placeholder="AIza..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideGeminiKey(!hideGeminiKey)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideGeminiKey ? 'Show' : 'Hide'}
                  </button>
                </div>
              </div>

              {/* OpenAI */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">OpenAI API Key</label>
                  <a href="https://platform.openai.com/api-keys" target="_blank" className="text-xs text-sky-400 hover:underline">Get Key ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideOaiKey ? 'password' : 'text'}
                    value={openaiKey}
                    onChange={(e) => updateOaiKey(e.target.value)}
                    placeholder="sk-..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideOaiKey(!hideOaiKey)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideOaiKey ? 'Show' : 'Hide'}
                  </button>
                </div>
              </div>

              {/* ElevenLabs */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">ElevenLabs API Key</label>
                  <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" className="text-xs text-emerald-400 hover:underline">Get Key ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideElKey ? 'password' : 'text'}
                    value={elevenlabsKey}
                    onChange={(e) => updateElKey(e.target.value)}
                    placeholder="sk_..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideElKey(!hideElKey)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideElKey ? 'Show' : 'Hide'}
                  </button>
                </div>
              </div>

              {/* Mistral */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">Mistral API Key</label>
                  <a href="https://console.mistral.ai/api-keys/" target="_blank" className="text-xs text-purple-400 hover:underline">Get Key ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideMistralKey ? 'password' : 'text'}
                    value={mistralKey}
                    onChange={(e) => updateMistralKey(e.target.value)}
                    placeholder="..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideMistralKey(!hideMistralKey)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideMistralKey ? 'Show' : 'Hide'}
                  </button>
                </div>
              </div>

              {/* OpenRouter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">OpenRouter API Key</label>
                  <a href="https://openrouter.ai/keys" target="_blank" className="text-xs text-indigo-400 hover:underline">Get Key ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideOrKey ? 'password' : 'text'}
                    value={openrouterKey}
                    onChange={(e) => updateOpenrouterKey(e.target.value)}
                    placeholder="sk-or-..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideOrKey(!hideOrKey)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideOrKey ? 'Show' : 'Hide'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Unified access to Grok Voice, Gemini TTS, Kokoro, many others via one key.</p>
              </div>

              {/* xAI */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">xAI API Key (Grok Voice)</label>
                  <a href="https://console.x.ai/" target="_blank" className="text-xs text-white hover:underline">Get Key ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideXaiKey ? 'password' : 'text'}
                    value={xaiKey}
                    onChange={(e) => updateXaiKey(e.target.value)}
                    placeholder="xai-..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideXaiKey(!hideXaiKey)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideXaiKey ? 'Show' : 'Hide'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Official Grok Voice + custom cloned voices. Supports expressive speech tags.</p>
              </div>

              {/* Fish Audio */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">Fish Audio API Key</label>
                  <a href="https://fish.audio/app/api-keys" target="_blank" className="text-xs text-white hover:underline">Get Key ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideFishKey ? 'password' : 'text'}
                    value={fishKey}
                    onChange={(e) => updateFishKey(e.target.value)}
                    placeholder="paste your fish.audio key"
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideFishKey(!hideFishKey)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideFishKey ? 'Show' : 'Hide'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Free S2.1 Pro model · 83 languages · in-app voice cloning. Free during the preview period (no hard usage cap).</p>
              </div>

              {/* NVIDIA NIM */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">NVIDIA NIM API Key (TTS + LLM Enhancer)</label>
                  <a href="https://build.nvidia.com/" target="_blank" className="text-xs text-green-400 hover:underline">Get Key ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideNvidiaKey ? 'password' : 'text'}
                    value={nvidiaKey}
                    onChange={(e) => updateNvidiaKey(e.target.value)}
                    placeholder="nvapi-..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideNvidiaKey(!hideNvidiaKey)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideNvidiaKey ? 'Show' : 'Hide'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Free inference via NVIDIA NIM. OpenAI-compatible TTS at api.nvidia.com. $200 credits for new users. Also powers the LLM Script Enhancer.</p>
              </div>

              {/* Cerebras (for LLM Enhancer) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">Cerebras API Key (LLM Enhancer)</label>
                  <a href="https://cloud.cerebras.ai/" target="_blank" className="text-xs text-rose-400 hover:underline">Get Key ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideCerebrasKey ? 'password' : 'text'}
                    value={cerebrasKey}
                    onChange={(e) => updateCerebrasKey(e.target.value)}
                    placeholder="csk-..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideCerebrasKey(!hideCerebrasKey)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideCerebrasKey ? 'Show' : 'Hide'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Extremely fast inference. Great for the script enhancer (e.g. llama-3.3-70b).</p>
              </div>

              {/* Hugging Face Token */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-slate-200">Hugging Face Token (HF_TOKEN)</label>
                  <a href="https://huggingface.co/settings/tokens" target="_blank" className="text-xs text-orange-400 hover:underline">Get Token ↗</a>
                </div>
                <div className="flex gap-2">
                  <input
                    type={hideHfToken ? 'password' : 'text'}
                    value={hfToken}
                    onChange={(e) => updateHfToken(e.target.value)}
                    placeholder="hf_..."
                    className="flex-1 bg-slate-900 border border-slate-800 text-sm px-3 py-2 rounded-lg font-mono"
                  />
                  <button onClick={() => setHideHfToken(!hideHfToken)} className="px-3 py-2 bg-slate-800 rounded-lg text-xs border border-slate-700">
                    {hideHfToken ? 'Show' : 'Hide'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-500">Optional for public spaces (OmniVoice, VoxCPM). Required only for private/gated spaces.</p>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-800 px-6 py-4 flex justify-end">
              <button
                onClick={() => setShowApiSettings(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-sm font-medium"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Branding section */}
      {/* SEO + GEO Optimized FAQ Section */}
      <section aria-labelledby="faq-heading" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 mb-6">
        <h2 id="faq-heading" className="text-xl font-bold tracking-wider text-slate-200 mb-6 flex items-center gap-3">
          <span className="text-cyan-400">?</span> FREQUENTLY ASKED QUESTIONS
        </h2>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          {[
            ["What providers does TTS Voice Studio support?", "Gemini (single & multi-speaker), OpenAI TTS, ElevenLabs (with voice cloning), Mistral Voxtral, OpenRouter (100+ models), native xAI Grok Voice, and Fish Audio (free S2.1 Pro model + in-app voice cloning)."],
            ["Is this a BYOK (Bring Your Own Key) app?", "Yes. All paid providers use strict BYOK. Your API keys never leave your browser except when explicitly sent for a synthesis request. No server-side fallback keys."],
            ["Can I use my custom cloned voices?", "Yes. ElevenLabs, Mistral, xAI Grok Voice, and Fish Audio all support syncing your custom cloned voices directly in the app. Fish Audio also lets you create a new cloned voice from an audio clip right inside the app."],
            ["What makes the visualizers special?", "They use a shared Web Audio API singleton with real-time beat detection and five distinct visual styles that react to the actual synthesized audio."],
            ["How does this help with AI agents?", "Use it as your always-on voice layer. Feed agent output, tool results, memory summaries, or reasoning traces into TTS Voice Studio to turn them into natural speech with visual feedback — perfect for monitoring, debugging, or presenting what your agents are thinking."],
            ["Does xAI Grok Voice support OAuth login?", "Yes. TTS Voice Studio has full xAI OAuth support (with PKCE). You can sign in with your xAI account to use Grok Voice and sync your custom cloned voices without manually managing API keys."],
          ].map(([q, a], i) => (
            <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl p-5">
              <p className="font-semibold text-slate-100 mb-2">{q}</p>
              <p className="text-slate-400 leading-relaxed">{a}</p>
            </div>
          ))}
        </div>
      </section>
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
