import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { synthesizeOmniVoice, synthesizeVoxCPM } from './server/hf-spaces';
import { enhanceTextForTTS } from './server/llm-enhancer';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

// Initializing AI client for Server-Side Gemini API
// Make sure Gemini API Key is loaded
const geminiApiKey = process.env.GEMINI_API_KEY || '';
let ai: GoogleGenAI | null = null;

if (geminiApiKey) {
  ai = new GoogleGenAI({
    apiKey: geminiApiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Ensure output folders are defined (just in case)
const isProd = process.env.NODE_ENV === 'production';

// API: List ElevenLabs Voices utilizing client's api key (CORS safe proxy)
app.post('/api/tts/voices', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'XI-API-Key is required' });
  }

  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'xi-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `ElevenLabs API error: ${errText}` });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error: any) {
    console.error('Error fetching ElevenLabs voices:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// API: List saved Mistral voices (parity with CLI `voices` command + audio.voices.list)
// Uses the official Mistral Voxtral Voices API. Returns items compatible with the UI voice grid.
app.post('/api/tts/mistral/voices', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'MISTRAL_API_KEY is required' });
  }

  try {
    // The Mistral voices endpoint supports pagination. Fetch the first page (50 is plenty for most users).
    const response = await fetch('https://api.mistral.ai/v1/audio/voices', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Mistral Voices API error: ${errText}` });
    }

    const data = await response.json();
    // Normalize to a shape the UI already understands from the ElevenLabs voices response
    const voices = (data.items || data.voices || []).map((v: any) => ({
      voice_id: v.id || v.voice_id,
      name: v.name,
      category: v.category || 'Saved',
      labels: {
        gender: v.gender || 'Unknown',
        languages: Array.isArray(v.languages) ? v.languages.join(', ') : (v.languages || ''),
      },
    }));

    return res.json({ voices });
  } catch (error: any) {
    console.error('Error fetching Mistral voices:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// API: List xAI / Grok voices (built-in + user's custom cloned voices)
// Uses the official xAI GET /v1/tts/voices. Returns normalized shape for the UI grid.
app.post('/api/tts/xai/voices', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'XAI_API_KEY is required' });
  }

  try {
    const response = await fetch('https://api.x.ai/v1/tts/voices', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `xAI Voices API error: ${errText}` });
    }

    const data = await response.json();
    // Normalize to the same shape the UI uses for ElevenLabs / Mistral
    const voices = (data.voices || []).map((v: any) => ({
      voice_id: v.voice_id,
      name: v.name || v.voice_id,
      category: v.custom ? 'Custom' : 'xAI Built-in',
      labels: {
        gender: '—', // xAI doesn't return gender in the list endpoint
        languages: v.language || 'en',
      },
    }));

    return res.json({ voices });
  } catch (error: any) {
    console.error('Error fetching xAI voices:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// API: Voice Sample / Preview (parity with CLI `voice-sample` command)
// Supports quick audition of voices before full synthesis.
// - ElevenLabs: Uses the voice's official preview_url (fast, no synthesis cost)
// - Mistral: Generates a short real TTS sample via Voxtral
// - Gemini: Generates a short real TTS sample
app.post('/api/tts/voice-sample', async (req, res) => {
  const { provider, voiceId, apiKey, sampleText } = req.body;

  if (!provider || !voiceId) {
    return res.status(400).json({ error: 'provider and voiceId are required' });
  }

  const _DEFAULT_SAMPLE_TEXT = 
    "Hello! This is a sample of this voice. The quick brown fox jumps over the lazy dog.";

  const textToUse = sampleText || _DEFAULT_SAMPLE_TEXT;

  try {
    // ----------------- ELEVENLABS -----------------
    if (provider === 'elevenlabs') {
      const elApiKey = apiKey || process.env.ELEVENLABS_API_KEY;
      if (!elApiKey) {
        return res.status(400).json({ error: 'ElevenLabs API key is required for voice preview.' });
      }

      // First, get the voice details to find the preview_url
      const voiceResp = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
        headers: { 'xi-api-key': elApiKey },
      });

      if (!voiceResp.ok) {
        const err = await voiceResp.text();
        return res.status(voiceResp.status).json({ error: `Failed to fetch voice details: ${err}` });
      }

      const voiceData = await voiceResp.json();
      const previewUrl = voiceData.preview_url;

      if (!previewUrl) {
        return res.status(404).json({ error: 'No preview available for this ElevenLabs voice.' });
      }

      // Fetch the preview audio
      const audioResp = await fetch(previewUrl);
      if (!audioResp.ok) {
        return res.status(500).json({ error: 'Failed to download voice preview.' });
      }

      const arrayBuffer = await audioResp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- MISTRAL (real short synthesis) -----------------
    if (provider === 'mistral') {
      const mistralKey = apiKey || process.env.MISTRAL_API_KEY;
      if (!mistralKey) {
        return res.status(400).json({ error: 'Mistral API key is required for voice preview.' });
      }

      const response = await fetch('https://api.mistral.ai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'voxtral-mini-tts-2603',
          input: textToUse,
          voice_id: voiceId,
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Mistral preview error: ${errText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- GEMINI (real short synthesis) -----------------
    if (provider === 'gemini' || provider === 'gemini-multi') {
      const requestGeminiKey = apiKey;
      const geminiClient = requestGeminiKey 
        ? new GoogleGenAI({ apiKey: requestGeminiKey })
        : ai;

      if (!geminiClient) {
        return res.status(503).json({ error: 'Gemini API is currently not available.' });
      }

      const response = await geminiClient.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: textToUse }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceId },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(500).json({ error: 'Failed to generate Gemini voice sample.' });
      }

      const buffer = Buffer.from(base64Audio, 'base64');
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- OPENROUTER (real short synthesis via router) -----------------
    if (provider === 'openrouter') {
      const orKey = apiKey || process.env.OPENROUTER_API_KEY;
      if (!orKey) {
        return res.status(400).json({ error: 'OpenRouter API key is required for voice preview.' });
      }

      // model may be passed in body for preview; fall back to a reliable cheap TTS model
      const orModel = (req.body as any).model || 'openai/gpt-4o-mini-tts-2025-12-15';
      const orVoice = voiceId || 'alloy';

      const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'TTS Voice Studio',
        },
        body: JSON.stringify({
          model: orModel,
          input: textToUse,
          voice: orVoice,
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `OpenRouter preview error: ${errText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- xAI GROK VOICE (real short synthesis) -----------------
    if (provider === 'xai') {
      const xaiKey = apiKey || process.env.XAI_API_KEY;
      if (!xaiKey) {
        return res.status(400).json({ error: 'xAI API key is required for voice preview.' });
      }

      const voice = voiceId || 'eve';
      const lang = (req.body as any).language || 'en';

      const response = await fetch('https://api.x.ai/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${xaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: textToUse,
          voice_id: voice,
          language: lang,
          output_format: { codec: 'mp3', sample_rate: 24000 },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `xAI preview error: ${errText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    return res.status(400).json({ error: `Voice preview not supported for provider: ${provider}` });

  } catch (error: any) {
    console.error('Voice sample error:', error);
    return res.status(500).json({ error: error.message || 'Error generating voice sample.' });
  }
});

// ============================================================================
// UNIFIED SYNTHESIZE ENDPOINT (Phase 2 - Library Surface)
// This is the new recommended "universal TTS gateway" endpoint.
// It is designed to closely mirror the contract of `ivs_tts.synthesize_to_file`.
// ============================================================================
app.post('/api/tts/synthesize', async (req, res) => {
  const { provider, text, options = {}, apiKey, hfToken: bodyHfToken } = req.body;
  const hfToken = bodyHfToken || process.env.HF_TOKEN;

  if (!provider) {
    return res.status(400).json({ error: 'provider is required' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    // Normalize some common option names coming from the Python library style.
    // Each provider branch below reads what it needs from `options`.
    // We'll pass through to the existing provider handlers for now.

    // For cleanliness in Phase 2, we delegate to the same logic as /generate
    // but with a cleaner options shape. Over time we can fully extract the handlers.

    // --- ELEVENLABS ---
    if (provider === 'elevenlabs') {
      const elApiKey = apiKey || process.env.ELEVENLABS_API_KEY;
      if (!elApiKey) return res.status(400).json({ error: 'ElevenLabs API key required' });

      const targetVoice = options.voice_id || options.voiceId || '21m00Tcm4TlvDq8ikWAM';
      const elModel = options.model || 'eleven_flash_v1_5';

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}`, {
        method: 'POST',
        headers: { 'xi-api-key': elApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: elModel,
          voice_settings: {
            stability: options.stability ?? 0.5,
            similarity_boost: options.similarity_boost ?? options.similarityBoost ?? 0.75,
            style: options.style ?? 0.0,
            use_speaker_boost: options.speaker_boost ?? options.speakerBoost ?? true,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `ElevenLabs error: ${errText}` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // --- MISTRAL ---
    if (provider === 'mistral') {
      const mistralKey = apiKey || process.env.MISTRAL_API_KEY;
      if (!mistralKey) return res.status(400).json({ error: 'Mistral API key required' });

      const payload: any = {
        model: options.model || 'voxtral-mini-tts-2603',
        input: text,
        response_format: options.format || 'mp3',
      };
      if (options.ref_audio || options.ref) {
        let b64 = options.ref_audio || options.ref;
        if (typeof b64 === 'string' && b64.startsWith('data:')) b64 = b64.split(',')[1];
        payload.ref_audio = b64;
      } else if (options.voice_id || options.voiceId) {
        payload.voice_id = options.voice_id || options.voiceId;
      }

      const response = await fetch('https://api.mistral.ai/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${mistralKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Mistral error: ${errText}` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // --- GEMINI (single) ---
    if (provider === 'gemini') {
      const requestGeminiKey = apiKey || options.apiKey;
      const geminiClient = requestGeminiKey 
        ? new GoogleGenAI({ apiKey: requestGeminiKey })
        : ai;

      if (!geminiClient) return res.status(503).json({ error: 'Gemini API not available (provide key in UI or set on server)' });

      const emotion = options.emotion || 'default';
      let promptText = text;
      if (emotion === 'cheerful') promptText = `Say cheerfully: ${text}`;
      // ... (we can expand the emotion prefixes later)

      const response = await geminiClient.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: options.voice_id || options.voiceId || 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) return res.status(500).json({ error: 'No audio from Gemini' });

      const buffer = Buffer.from(base64Audio, 'base64');
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // --- GEMINI MULTI ---
    if (provider === 'gemini-multi') {
      const requestGeminiKey = apiKey || options.apiKey;
      const geminiClient = requestGeminiKey 
        ? new GoogleGenAI({ apiKey: requestGeminiKey })
        : ai;

      if (!geminiClient) return res.status(503).json({ error: 'Gemini API not available (provide key in UI or set on server)' });

      const s1 = options.speaker1 || 'Joe';
      const v1 = options.voice1 || 'Kore';
      const s2 = options.speaker2 || 'Jane';
      const v2 = options.voice2 || 'Puck';

      const response = await geminiClient.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                { speaker: s1, voiceConfig: { prebuiltVoiceConfig: { voiceName: v1 } } },
                { speaker: s2, voiceConfig: { prebuiltVoiceConfig: { voiceName: v2 } } },
              ],
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) return res.status(500).json({ error: 'No audio from Gemini Multi' });

      const buffer = Buffer.from(base64Audio, 'base64');
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // --- OPENAI ---
    if (provider === 'openai') {
      const openAiKey = apiKey || process.env.OPENAI_API_KEY;
      if (!openAiKey) return res.status(400).json({ error: 'OpenAI API key required' });

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${openAiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model || 'tts-1',
          input: text,
          voice: options.voice_id || options.voiceId || 'alloy',
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `OpenAI error: ${errText}` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // --- OMNIVOICE (HF Gradio) ---
    if (provider === 'omnivoice') {
      const ref = options.ref_audio || options.ref;
      if (!ref) {
        return res.status(400).json({ error: 'omnivoice requires ref_audio (base64)' });
      }

      const audioBuffer = await synthesizeOmniVoice(text, {
        space: options.space,
        refAudio: ref,
        refText: options.ref_text,
        instruct: options.instruct,
        language: options.language,
        steps: options.steps,
        guidance: options.guidance,
        denoise: options.denoise,
        speed: options.speed,
        duration: options.duration,
        preprocess: options.preprocess,
        postprocess: options.postprocess,
      }, hfToken);

      res.set('Content-Type', 'audio/wav');
      return res.send(audioBuffer);
    }

    // --- VOXCPM (HF Gradio) ---
    if (provider === 'voxcpm') {
      const ref = options.ref_audio || options.ref;
      if (!ref) {
        return res.status(400).json({ error: 'voxcpm requires ref_audio (base64)' });
      }

      const audioBuffer = await synthesizeVoxCPM(text, {
        refAudio: ref,
        control: options.control,
        usePromptText: options.use_prompt_text,
        promptText: options.prompt_text,
        cfg: options.cfg,
        normalizeText: options.normalize_text,
        denoiseRef: options.denoise_ref,
      }, hfToken);

      res.set('Content-Type', 'audio/wav');
      return res.send(audioBuffer);
    }

    // --- OPENROUTER (BYOK) ---
    if (provider === 'openrouter') {
      const orKey = apiKey || process.env.OPENROUTER_API_KEY;
      if (!orKey) return res.status(400).json({ error: 'OpenRouter API key required' });

      const orModel = options.model || 'openai/gpt-4o-mini-tts-2025-12-15';
      const orVoice = options.voice_id || options.voiceId || options.voice || 'alloy';

      const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'TTS Voice Studio',
        },
        body: JSON.stringify({
          model: orModel,
          input: text,
          voice: orVoice,
          response_format: options.format || 'mp3',
          speed: options.speed,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `OpenRouter error: ${errText}` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // --- xAI GROK VOICE (BYOK) ---
    if (provider === 'xai') {
      const xaiKey = apiKey || process.env.XAI_API_KEY;
      if (!xaiKey) return res.status(400).json({ error: 'xAI API key required' });

      const voice = options.voice_id || options.voiceId || options.voice || 'eve';
      const lang = options.language || 'en';

      const payload: any = {
        text,
        voice_id: voice,
        language: lang,
      };
      if (options.speed !== undefined) payload.speed = Number(options.speed);
      if (options.output_format) payload.output_format = options.output_format;

      const response = await fetch('https://api.x.ai/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${xaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `xAI error: ${errText}` });
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    return res.status(400).json({ error: `Unknown provider in unified synthesize: ${provider}` });

  } catch (error: any) {
    console.error('Unified synthesize error:', error);
    return res.status(500).json({ error: error.message || 'Synthesis failed' });
  }
});

// ============================================================================
// LLM SCRIPT ENHANCER (New Feature)
// Takes raw text or a URL and rewrites it into high-quality TTS-friendly content.
// ============================================================================
app.post('/api/llm/enhance-for-tts', async (req, res) => {
  const { provider, apiKey, input, model } = req.body;

  if (!provider || !apiKey || !input) {
    return res.status(400).json({ error: 'provider, apiKey, and input are required' });
  }

  try {
    const result = await enhanceTextForTTS({
      provider,
      apiKey,
      input,
      model,
    });

    return res.json(result);
  } catch (error: any) {
    console.error('LLM enhance error:', error);
    return res.status(500).json({ error: error.message || 'Failed to enhance text' });
  }
});

// API: TTS Generation Proxy Router
app.post('/api/tts/generate', async (req, res) => {
  const { provider, text, voiceId, apiKey, config = {} } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'Text body is required' });
  }

  if (!provider) {
    return res.status(400).json({ error: 'Provider is required' });
  }

  try {
    // ----------------- GEMINI PROVIDER -----------------
    if (provider === 'gemini') {
      // Support BYOK: use per-request apiKey if provided, otherwise fall back to server env
      const requestGeminiKey = apiKey || config.apiKey;
      const geminiClient = requestGeminiKey 
        ? new GoogleGenAI({ apiKey: requestGeminiKey })
        : ai;

      if (!geminiClient) {
        return res.status(503).json({ 
          error: 'Gemini API is currently not available. Provide a Gemini API key in the UI or set GEMINI_API_KEY on the server.' 
        });
      }

      // Voice emotion prefix injection
      const emotion = config.emotion || 'default';
      let promptText = text;
      
      if (emotion === 'cheerful') {
        promptText = `Say cheerfully: ${text}`;
      } else if (emotion === 'professional') {
        promptText = `Say professionally and directly: ${text}`;
      } else if (emotion === 'whisper') {
        promptText = `Say softly in a hushed whisper: ${text}`;
      } else if (emotion === 'excited') {
        promptText = `Say with intense excitement and energy: ${text}`;
      } else if (emotion === 'serious') {
        promptText = `Say in a serious, calm narrator tone: ${text}`;
      } else if (emotion === 'sad') {
        promptText = `Say in a slow, sad and melancholy tone: ${text}`;
      }

      const response = await geminiClient.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: promptText }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voiceId || 'Kore' },
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(500).json({ error: 'Failed to extract audio from Gemini model response.' });
      }

      const buffer = Buffer.from(base64Audio, 'base64');
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- GEMINI MULTI-SPEAKER PROVIDER -----------------
    // Matches the CLI `gemini-multi` command + `ivs_tts` engine.
    // The prompt text MUST contain speaker labels that match the configured speaker names,
    // e.g. "Joe: Hello there!\nJane: Hi Joe, how are you?"
    if (provider === 'gemini-multi') {
      const requestGeminiKey = apiKey || config.apiKey;
      const geminiClient = requestGeminiKey 
        ? new GoogleGenAI({ apiKey: requestGeminiKey })
        : ai;

      if (!geminiClient) {
        return res.status(503).json({ 
          error: 'Gemini API is currently not available. Provide a Gemini API key in the UI or set GEMINI_API_KEY on the server.' 
        });
      }

      const speaker1 = config.speaker1 || 'Joe';
      const voice1 = config.voice1 || 'Kore';
      const speaker2 = config.speaker2 || 'Jane';
      const voice2 = config.voice2 || 'Puck';

      const response = await geminiClient.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: speaker1,
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice1 },
                  },
                },
                {
                  speaker: speaker2,
                  voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: voice2 },
                  },
                },
              ],
            },
          },
        },
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        return res.status(500).json({ error: 'Failed to extract audio from Gemini multi-speaker response.' });
      }

      const buffer = Buffer.from(base64Audio, 'base64');
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- OPENAI PROVIDER -----------------
    if (provider === 'openai') {
      const openAiKey = apiKey || process.env.OPENAI_API_KEY;
      if (!openAiKey) {
        return res.status(400).json({ error: 'OpenAI API key is required. Bring Your Own Key.' });
      }

      const oaiModel = config.model || 'tts-1';

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: oaiModel,
          input: text,
          voice: voiceId || 'alloy',
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `OpenAI TTS Error: ${errText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- ELEVENLABS PROVIDER -----------------
    if (provider === 'elevenlabs') {
      const elApiKey = apiKey || process.env.ELEVENLABS_API_KEY;
      if (!elApiKey) {
        return res.status(400).json({ error: 'ElevenLabs API key is required. Bring Your Own Key.' });
      }

      const targetVoice = voiceId || '21m00Tcm4TlvDq8ikWAM'; // Rachel fallback
      const elModel = config.model || 'eleven_flash_v1_5';

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          model_id: elModel,
          voice_settings: {
            stability: config.stability !== undefined ? Number(config.stability) : 0.5,
            similarity_boost: config.similarityBoost !== undefined ? Number(config.similarityBoost) : 0.75,
            style: config.style !== undefined ? Number(config.style) : 0.0,
            use_speaker_boost: config.speakerBoost !== undefined ? Boolean(config.speakerBoost) : true,
          }
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `ElevenLabs TTS Error: ${errText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- MISTRAL PROVIDER (Voxtral API - parity with CLI) -----------------
    // Matches the contract used by `tts_cli.py:cmd_mistral` + `ivs_tts` engine:
    // - voice_id (saved library voice from audio.voices.list)
    // - OR ref_audio (base64-encoded reference clip for on-the-fly cloning)
    // Official Python SDK path: client.audio.speech.complete(..., voice_id or ref_audio, response_format)
    // See CLI lines 888-901 for the exact shape.
    if (provider === 'mistral') {
      const mistralKey = apiKey || process.env.MISTRAL_API_KEY;
      if (!mistralKey) {
        return res.status(400).json({ error: 'Mistral API key is required. Bring Your Own Key.' });
      }

      // Default model matches the CLI / ivs_tts default (voxtral-mini-tts-2603)
      const mModel = config.model || 'voxtral-mini-tts-2603';
      const responseFormat = config.format || 'mp3';

      const payload: Record<string, any> = {
        model: mModel,
        input: text,
        response_format: responseFormat,
      };

      // Priority: explicit ref_audio (base64) for cloning > voiceId for saved library voice
      if (config.refAudio) {
        // Accept either raw base64 string or data URL
        let b64 = String(config.refAudio);
        if (b64.startsWith('data:')) {
          b64 = b64.split(',')[1] || b64;
        }
        payload.ref_audio = b64;
      } else if (voiceId) {
        payload.voice_id = voiceId;
      } else {
        // Fallback (kept for backward compatibility with old UI payloads)
        payload.voice_id = 'bellatrix';
      }

      const response = await fetch('https://api.mistral.ai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Mistral TTS Error: ${errText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- OPENROUTER PROVIDER (BYOK unified router for 100+ models) -----------------
    // OpenRouter exposes an OpenAI-compatible /audio/speech endpoint.
    // Supports many TTS backends: Grok Voice, Gemini TTS, OpenAI, Mistral Voxtral, Kokoro, etc.
    // Model slugs are passed in config.model (e.g. "x-ai/grok-voice-tts-1.0" or "hexgrad/kokoro-82m").
    // Voice names are model-specific (e.g. "alloy", "Eve", "male1", etc). See https://openrouter.ai/tts
    if (provider === 'openrouter') {
      const orKey = apiKey || process.env.OPENROUTER_API_KEY;
      if (!orKey) {
        return res.status(400).json({ error: 'OpenRouter API key is required. Bring Your Own Key.' });
      }

      const orModel = config.model || 'openai/gpt-4o-mini-tts-2025-12-15';
      const orVoice = voiceId || 'alloy';

      const response = await fetch('https://openrouter.ai/api/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${orKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'TTS Voice Studio',
        },
        body: JSON.stringify({
          model: orModel,
          input: text,
          voice: orVoice,
          response_format: config.format || 'mp3',
          speed: config.speed !== undefined ? Number(config.speed) : undefined,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `OpenRouter TTS Error: ${errText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.set('Content-Type', 'audio/mpeg');
      return res.send(buffer);
    }

    // ----------------- xAI (Grok Voice) PROVIDER -----------------
    // Official xAI TTS endpoint (not OpenAI compatible shape).
    // Requires language (BCP-47 or "auto"). Supports rich speech tags + custom voices.
    // Docs: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech
    if (provider === 'xai') {
      const xaiKey = apiKey || process.env.XAI_API_KEY;
      if (!xaiKey) {
        return res.status(400).json({ error: 'xAI API key is required. Bring Your Own Key.' });
      }

      const voice = voiceId || 'eve';
      const lang = config.language || 'en';

      const payload: any = {
        text,
        voice_id: voice,
        language: lang,
      };

      if (config.speed !== undefined) payload.speed = Number(config.speed);
      if (config.output_format) {
        payload.output_format = config.output_format;
      } else {
        payload.output_format = { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 };
      }
      if (config.text_normalization !== undefined) {
        payload.text_normalization = !!config.text_normalization;
      }

      const response = await fetch('https://api.x.ai/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${xaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `xAI TTS Error: ${errText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      // xAI returns the format requested; default to mpeg for browser compatibility
      const contentType = response.headers.get('content-type') || 'audio/mpeg';
      res.set('Content-Type', contentType);
      return res.send(buffer);
    }

    return res.status(400).json({ error: `Unknown TTS provider: ${provider}` });
  } catch (error: any) {
    console.error('Error generating speech:', error);
    return res.status(500).json({ error: error.message || 'Error occurred during synthesis.' });
  }
});

// Configure Vite middleware in development or serve built files in production
async function start() {
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve('.', 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Serve static frontend in production
    app.use(express.static(path.resolve('.', 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('.', 'dist', 'index.html'));
    });
  }

  const port = 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`[TTS Voice Studio] Full-stack application running at http://localhost:${port}`);
  });
}

start().catch((err) => {
  console.error('Fatal dev server starting failure:', err);
});
