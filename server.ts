import express from 'express';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { synthesizeOmniVoice, synthesizeOmniVoiceDesign, synthesizeVoxCPM } from './server/hf-spaces';
import { enhanceTextForTTS } from './server/llm-enhancer';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json({ limit: '50mb' }));

// Raw request logger — this runs for EVERY request before anything else.
// If you don't see this when you load the page, the request isn't even reaching our Express app.
app.use((req, res, next) => {
  console.log('[RAW] Incoming request:', req.method, req.url, 'from', req.ip || req.connection?.remoteAddress);
  next();
});

// Note: We deliberately do NOT initialize any global clients from process.env API keys.
// The app is designed as strict BYOK for all providers (including Gemini).
// Users must always provide their own API key via the UI.

// Safety check at startup
const paidKeys = ['OPENAI_API_KEY', 'ELEVENLABS_API_KEY', 'MISTRAL_API_KEY', 'OPENROUTER_API_KEY', 'XAI_API_KEY', 'GEMINI_API_KEY', 'FISH_API_KEY'];
const detectedKeys = paidKeys.filter(k => process.env[k]);
if (detectedKeys.length > 0) {
  console.warn(
    '\n[SECURITY WARNING] The following API keys were detected in the environment:\n' +
    detectedKeys.map(k => `  - ${k}`).join('\n') +
    '\nThese keys will be IGNORED. This app enforces strict BYOK for all providers.\n'
  );
}

// Ensure output folders are defined (just in case)
const isProd = process.env.NODE_ENV === 'production';

// DIAGNOSTIC ROUTE - hits very early, completely bypasses Vite and all our complex handlers.
// Use this to test if Express itself can respond at all.
app.get('/ping', (req, res) => {
  console.log('[DIAG] /ping request received — basic Express is alive');
  res.type('text/plain').send('pong — basic Express route works, Vite not involved');
});

// ============================================================================
// xAI OAUTH LOOPBACK CALLBACK SERVER
// ============================================================================
// xAI's shared Grok CLI client only has ONE redirect URI registered:
// http://127.0.0.1:56121/callback. We MUST use this exact URI — xAI rejects
// anything else. So we spin up a tiny HTTP server on port 56121 that catches
// the OAuth callback, serves an HTML page that postMessages the auth code back
// to the main app window (the opener), then auto-closes.
//
// The main app (localhost:3456 or production domain) opens the xAI authorize
// URL in a popup. After the user consents, xAI redirects the popup to our
// loopback server at 127.0.0.1:56121. The served page uses postMessage to
// relay the code back to the opener (which may be on a different origin).
// ============================================================================

const XAI_OAUTH_CALLBACK_PORT = 56121;
const xaiLoopbackApp = express();

// Minimal, safe, self-contained callback page. It relays the OAuth code+state
// to the main app window via postMessage. Because the popup is at 127.0.0.1:56121
// and the opener may be at a different origin, we use '*' as the postMessage
// target origin (safe — the code is useless without the PKCE verifier which
// only exists in the opener's sessionStorage).
xaiLoopbackApp.get('/callback', (req, res) => {
  const { code, state, error, error_description } = req.query as Record<string, string>;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>xAI OAuth • TTS Voice Studio</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background:#0a0a0a; color:#ddd; margin:0; display:flex; align-items:center; justify-content:center; min-height:100vh; }
    .card { background:#111; border:1px solid #222; border-radius:12px; padding:32px 28px; max-width:420px; text-align:center; box-shadow:0 10px 30px rgba(0,0,0,.6); }
    .success { color:#22c55e; }
    .error { color:#f87171; }
    .muted { color:#888; font-size:13px; margin-top:12px; }
    button { margin-top:16px; background:#1f2937; color:#ddd; border:1px solid #374151; padding:8px 18px; border-radius:8px; cursor:pointer; font-size:14px; }
    button:hover { background:#374151; }
  </style>
</head>
<body>
  <div class="card">
    ${error ? `
      <h2 class="error">Authorization Failed</h2>
      <p style="margin:12px 0 0;">${error_description || error}</p>
      <p class="muted">You can close this window and try again from the main app.</p>
      <button onclick="window.close()">Close Window</button>
    ` : code ? `
      <h2 class="success">✓ Connected to xAI</h2>
      <p style="margin:12px 0 0;">Authorization successful.</p>
      <p class="muted">This window will close automatically and return you to TTS Voice Studio.</p>
      <button onclick="window.close()">Close Window</button>
    ` : `
      <h2>Invalid Callback</h2>
      <p class="muted">Missing authorization code. Please close this window and try again.</p>
      <button onclick="window.close()">Close Window</button>
    `}
  </div>

  <script>
    (function() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const state = params.get('state');
      const err = params.get('error');
      const errDesc = params.get('error_description');

      if (window.opener) {
        // Relay the result back to the main application window.
        // The main app will validate the state and exchange the code for tokens.
        // We use '*' because the popup (127.0.0.1:56121) and opener (localhost:3456
        // or production domain) are different origins. The code alone is useless
        // without the PKCE verifier stored in the opener's sessionStorage.
        window.opener.postMessage({
          type: 'xai-oauth-callback',
          code: code || null,
          state: state || null,
          error: err || null,
          errorDescription: errDesc || null,
        }, '*');
      }

      // Auto-close after a short delay on success.
      if (code && !err) {
        setTimeout(() => {
          try { window.close(); } catch (e) {}
        }, 1400);
      }
    })();
  </script>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.send(html);
});

// Start the loopback server. EADDRINUSE is non-fatal — if the port is already
// in use (e.g. another instance is running, or Hermes Agent is using it), we
// just log a warning. The OAuth flow will still work as long as whichever
// server is listening on 56121 serves the /callback page.
const xaiLoopback = createServer(xaiLoopbackApp);
xaiLoopback.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[xAI OAuth] Port ${XAI_OAUTH_CALLBACK_PORT} already in use — assuming another instance is handling the callback.`);
  } else {
    console.error(`[xAI OAuth] Loopback server error:`, err);
  }
});
xaiLoopback.listen(XAI_OAUTH_CALLBACK_PORT, '127.0.0.1', () => {
  console.log(`[xAI OAuth] Loopback callback server listening on http://127.0.0.1:${XAI_OAUTH_CALLBACK_PORT}`);
});

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
//
// Accepts either a classic API key (apiKey) or an OAuth access token (xaiAccessToken).
// When both are present we prefer the OAuth token (user's own subscription billing).
app.post('/api/tts/xai/voices', async (req, res) => {
  const { apiKey, xaiAccessToken } = req.body;
  const effectiveKey = xaiAccessToken || apiKey;

  if (!effectiveKey) {
    return res.status(400).json({ error: 'xAI credential is required (API key or active OAuth session)' });
  }

  try {
    const response = await fetch('https://api.x.ai/v1/tts/voices', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${effectiveKey}`,
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

// ============================================================================
// FISH AUDIO (s2.1-pro-free) — native TTS provider (not OpenAI-compatible)
// ============================================================================
// Fish Audio's TTS endpoint takes the model in a REQUEST HEADER (like xAI),
// but unlike xAI the model is the *engine* (s2.1-pro-free / s2-pro / s1), and
// the voice is selected via `reference_id` (a voice model id from /model).
// Docs: https://docs.fish.audio  |  Free model: s2.1-pro-free
// ----------------------------------------------------------------------------

// API: List Fish Audio voice models (the user's own custom/cloned voices).
// Proxies GET https://api.fish.audio/model?self=true so credentials stay server-side.
// Returns normalized shape { voices: [{ voice_id, name, category, labels }] }
// matching the contract the UI grid uses for ElevenLabs / Mistral / xAI.
app.post('/api/tts/fish/voices', async (req, res) => {
  const { apiKey } = req.body;
  if (!apiKey) {
    return res.status(400).json({ error: 'Fish Audio API key is required' });
  }

  try {
    // self=true restricts to the user's own models — these are the ones they
    // can actually use for synthesis (public marketplace models would need a
    // different flow). page_size=50 covers most libraries in one round-trip.
    const response = await fetch('https://api.fish.audio/model?self=true&page_size=50&page_number=1', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Fish Audio Voices API error: ${errText}` });
    }

    const data: any = await response.json();
    // Fish Audio /model returns { total, items: ModelEntity[] }.
    // ModelEntity has { _id, title, type, state, languages, visibility, ... }
    const items: any[] = Array.isArray(data?.items) ? data.items : [];
    const voices = items
      .filter((m: any) => m && (m.type === 'tts' || !m.type)) // only TTS models
      .map((m: any) => {
        const langs = Array.isArray(m.languages) ? m.languages.join(', ') : (m.languages || '—');
        return {
          voice_id: m._id,
          name: m.title || m._id,
          category: 'Custom',
          labels: {
            gender: '—', // Fish Audio doesn't return gender
            languages: langs,
            state: m.state, // 'created' | 'training' | 'trained' | 'failed'
          },
        };
      });

    return res.json({ voices });
  } catch (error: any) {
    console.error('Error fetching Fish Audio voices:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
});

// API: Create a Fish Audio voice model from an uploaded audio sample.
// Mirrors the upstream POST /model (multipart/form-data) but accepts the audio
// as base64 in JSON so the frontend can reuse the existing upload UI pattern
// (same approach OmniVoice uses for its reference audio). No new deps — we use
// the global FormData + Blob available in Node 18+.
//
// Request body: { apiKey, title, audioBase64, audioMimeType, visibility?, description? }
// Training is async on Fish Audio's side; we return the new model id + state so
// the UI can tell the user to re-sync once training finishes.
app.post('/api/tts/fish/voices/create', async (req, res) => {
  const { apiKey, title, audioBase64, audioMimeType, visibility, description } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: 'Fish Audio API key is required' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'A voice title is required' });
  }
  if (!audioBase64) {
    return res.status(400).json({ error: 'Audio sample is required (upload a 10–30s clip)' });
  }

  try {
    const audioBytes = Buffer.from(audioBase64, 'base64');
    const mimeType = audioMimeType || 'audio/wav';
    const ext = mimeType.split('/')[1] || 'wav';
    const blob = new Blob([audioBytes], { type: mimeType });

    const form = new FormData();
    form.append('type', 'tts');
    form.append('train_mode', 'fast');
    form.append('title', title.trim());
    form.append('visibility', visibility || 'private');
    if (description && description.trim()) {
      form.append('description', description.trim());
    }
    // Upstream field is `voices` (one or more audio uploads). One sample is enough
    // for the fast train_mode; send a reasonable filename so Fish Audio detects format.
    form.append('voices', blob, `sample.${ext}`);

    const response = await fetch('https://api.fish.audio/model', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: `Fish Audio voice creation error: ${errText}` });
    }

    const created: any = await response.json();
    return res.json({
      _id: created?._id,
      title: created?.title || title.trim(),
      state: created?.state || 'created',
    });
  } catch (error: any) {
    console.error('Error creating Fish Audio voice:', error);
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
    // Strict BYOK: Server environment variables are NEVER used for paid providers.
    if (provider === 'elevenlabs') {
      if (!apiKey) {
        return res.status(400).json({ error: 'ElevenLabs API key is required for voice preview.' });
      }
      const elApiKey = apiKey;

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
    // Strict BYOK: Server environment variables are NEVER used for paid providers.
    if (provider === 'mistral') {
      if (!apiKey) {
        return res.status(400).json({ error: 'Mistral API key is required for voice preview.' });
      }
      const mistralKey = apiKey;

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
      if (!apiKey) {
        return res.status(400).json({ error: 'Gemini API key is required for voice preview.' });
      }
      const geminiClient = new GoogleGenAI({ apiKey });

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
    // Strict BYOK: Server environment variables are NEVER used for paid providers.
    if (provider === 'openrouter') {
      if (!apiKey) {
        return res.status(400).json({ error: 'OpenRouter API key is required for voice preview.' });
      }
      const orKey = apiKey;

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
    // Accepts either classic apiKey or xaiAccessToken (OAuth). Prefers OAuth when present.
    if (provider === 'xai') {
      const effectiveKey = (req.body as any).xaiAccessToken || apiKey;
      if (!effectiveKey) {
        return res.status(400).json({ error: 'xAI credential is required for voice preview (key or active OAuth session).' });
      }
      const xaiCred = effectiveKey;

      const voice = voiceId || 'eve';
      const lang = (req.body as any).language || 'en';

      const response = await fetch('https://api.x.ai/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${xaiCred}`,
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

    // ----------------- FISH AUDIO (real short synthesis) -----------------
    // Fish Audio has no free preview endpoint, so we synthesize a short clip
    // using the same /v1/tts path. The model goes in a header (like xAI's chat
    // uses a header). Default voice = omit reference_id (uses Fish's default).
    if (provider === 'fish') {
      if (!apiKey) {
        return res.status(400).json({ error: 'Fish Audio API key is required for voice preview.' });
      }
      // voiceId may be '' (default voice) or a real model id from /model.
      const payload: any = {
        text: textToUse,
        format: 'mp3',
        mp3_bitrate: 128,
        latency: 'normal',
      };
      if (voiceId) payload.reference_id = voiceId;

      const response = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'model': (req.body as any).model || 's2.1-pro-free',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Fish Audio preview error: ${errText}` });
      }

      const ab = await response.arrayBuffer();
      const buf = Buffer.from(ab);
      res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
      return res.send(buf);
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
  const { provider, text, options = {}, config = {}, apiKey, hfToken: bodyHfToken } = req.body;
  const hfToken = bodyHfToken || process.env.HF_TOKEN;

  if (!provider) {
    return res.status(400).json({ error: 'provider is required' });
  }
  if (!text || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    // ========================================================================
    // SECURITY MODEL: STRICT BYOK FOR PAID PROVIDERS
    // ========================================================================
    // See the comment in the /api/tts/generate handler for the full policy.
    // Only Gemini is allowed to use server-side fallback keys.
    // ========================================================================

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
      if (!apiKey && !options.apiKey) {
        return res.status(400).json({ error: 'Gemini API key is required. Bring Your Own Key.' });
      }
      const requestGeminiKey = apiKey || options.apiKey;
      const geminiClient = new GoogleGenAI({ apiKey: requestGeminiKey });

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
      if (!apiKey && !options.apiKey) {
        return res.status(400).json({ error: 'Gemini API key is required. Bring Your Own Key.' });
      }
      const requestGeminiKey = apiKey || options.apiKey;
      const geminiClient = new GoogleGenAI({ apiKey: requestGeminiKey });

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
    // Strict BYOK: Server environment variables are NEVER used for paid providers.
    if (provider === 'openai') {
      if (!apiKey) return res.status(400).json({ error: 'OpenAI API key is required. Bring Your Own Key.' });
      const openAiKey = apiKey;

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
    // Supports two modes:
    // - "cloning" (default): uses /_clone_fn + reference audio
    // - "design": uses /_design_fn with attribute controls (no reference audio)
    if (provider === 'omnivoice') {
      const mode = options.mode || config.mode || 'cloning';

      if (mode === 'design') {
        const audioBuffer = await synthesizeOmniVoiceDesign(
          text,
          {
            space: options.space || config.space,
            language: options.language || config.language,
            steps: options.steps || config.steps,
            guidance: options.guidance || config.guidance,
            denoise: options.denoise ?? config.denoise,
            speed: options.speed || config.speed,
            duration: options.duration || config.duration,
            preprocess: options.preprocess ?? config.preprocess,
            postprocess: options.postprocess ?? config.postprocess,
            gender: options.gender || config.gender,
            age: options.age || config.age,
            pitch: options.pitch || config.pitch,
            style: options.style || config.style,
            englishAccent: options.englishAccent || config.englishAccent,
            chineseDialect: options.chineseDialect || config.chineseDialect,
          },
          hfToken
        );

        res.set('Content-Type', 'audio/wav');
        return res.send(audioBuffer);
      }

      // Default: cloning mode (requires reference audio)
      const ref =
        options.ref_audio ||
        options.ref ||
        options.refAudio ||
        config.refAudio ||
        config.ref_audio;

      if (!ref) {
        return res.status(400).json({
          error: 'omnivoice cloning mode requires reference audio (ref_audio base64).',
        });
      }

      const audioBuffer = await synthesizeOmniVoice(
        text,
        {
          space: options.space || config.space,
          refAudio: ref,
          refText: options.ref_text || config.refText,
          instruct: options.instruct || config.instruct,
          language: options.language || config.language || 'Auto',
          steps: options.steps || config.steps,
          guidance: options.guidance || config.guidance,
          denoise: options.denoise ?? config.denoise,
          speed: options.speed || config.speed,
          duration: options.duration || config.duration,
          preprocess: options.preprocess ?? config.preprocess,
          postprocess: options.postprocess ?? config.postprocess,
        },
        hfToken
      );

      res.set('Content-Type', 'audio/wav');
      return res.send(audioBuffer);
    }

    // --- VOXCPM (HF Gradio) ---
    // Reference audio is OPTIONAL on the upstream space.
    // When omitted, the model uses its default voice + control instructions.
    if (provider === 'voxcpm') {
      const ref =
        options.ref_audio ||
        options.ref ||
        options.refAudio ||
        config.refAudio ||
        config.ref_audio ||
        null; // explicitly allow missing

      const audioBuffer = await synthesizeVoxCPM(
        text,
        {
          refAudio: ref || undefined,
          control: options.control || config.control,
          usePromptText: options.use_prompt_text ?? config.usePromptText,
          promptText: options.prompt_text || config.promptText,
          cfg: options.cfg || config.cfg,
          normalizeText: options.normalize_text ?? config.normalizeText,
          denoiseRef: options.denoise_ref ?? config.denoiseRef,
        },
        hfToken
      );

      res.set('Content-Type', 'audio/wav');
      return res.send(audioBuffer);
    }

    // --- OPENROUTER (BYOK) ---
    // Strict BYOK: Server environment variables are NEVER used for paid providers.
    if (provider === 'openrouter') {
      if (!apiKey) return res.status(400).json({ error: 'OpenRouter API key is required. Bring Your Own Key.' });
      const orKey = apiKey;

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
    // Supports manual key or xaiAccessToken (OAuth). Prefers OAuth token.
    if (provider === 'xai') {
      const effectiveKey = options.xaiAccessToken || apiKey;
      if (!effectiveKey) return res.status(400).json({ error: 'xAI credential required (OAuth or API key).' });
      const xaiCred = effectiveKey;

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
          'Authorization': `Bearer ${xaiCred}`,
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

    // --- FISH AUDIO (BYOK) ---
    // Native Fish Audio /v1/tts. Model is a HEADER (not body). Voice is selected
    // via reference_id (a voice model id from /model). Reading knobs from `options`
    // per the unified-gateway convention; behavior mirrors the /generate branch.
    if (provider === 'fish') {
      if (!apiKey) return res.status(400).json({ error: 'Fish Audio API key is required.' });

      const voice = options.voice_id || options.voiceId || options.voice || '';

      const payload: any = {
        text,
        format: 'mp3',
        mp3_bitrate: 128,
        latency: options.latency || 'normal',
      };
      if (voice) payload.reference_id = voice;
      if (options.temperature !== undefined) payload.temperature = Number(options.temperature);
      if (options.top_p !== undefined) payload.top_p = Number(options.top_p);
      if (options.speed !== undefined) payload.prosody = { speed: Number(options.speed) };

      const response = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'model': options.model || 's2.1-pro-free',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Fish Audio error: ${errText}` });
      }
      const buf = Buffer.from(await response.arrayBuffer());
      res.set('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
      return res.send(buf);
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
  const { provider, apiKey, xaiAccessToken, input, model, audioTagsMode, ttsProvider } = req.body;

  // For xAI we allow either a classic key or an OAuth access token
  const effectiveKey = (provider === 'xai' && xaiAccessToken) ? xaiAccessToken : apiKey;

  if (!provider || !effectiveKey || !input) {
    return res.status(400).json({ error: 'provider, apiKey (or xaiAccessToken), and input are required' });
  }

  try {
    const result = await enhanceTextForTTS({
      provider,
      apiKey: effectiveKey,
      input,
      model,
      audioTagsMode,
      ttsProvider,
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
    // ========================================================================
    // SECURITY MODEL: STRICT BYOK FOR ALL PROVIDERS
    // ========================================================================
    // The app is designed so that **every user must bring their own API key**
    // for every provider, including Gemini.
    //
    // Server-side environment variables are deliberately ignored for all providers.
    // This makes the app safe to deploy publicly (e.g. as a Hugging Face Space)
    // without any risk of the deployer being charged.
    // ========================================================================

    // ----------------- GEMINI PROVIDER -----------------
    if (provider === 'gemini') {
      if (!apiKey && !config.apiKey) {
        return res.status(400).json({ 
          error: 'Gemini API key is required. Bring Your Own Key.' 
        });
      }
      const requestGeminiKey = apiKey || config.apiKey;
      const geminiClient = new GoogleGenAI({ apiKey: requestGeminiKey });

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
      if (!apiKey && !config.apiKey) {
        return res.status(400).json({ 
          error: 'Gemini API key is required. Bring Your Own Key.' 
        });
      }
      const requestGeminiKey = apiKey || config.apiKey;
      const geminiClient = new GoogleGenAI({ apiKey: requestGeminiKey });

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
    // Strict BYOK: Server environment variables are NEVER used for paid providers.
    // This ensures users must always provide their own key.
    if (provider === 'openai') {
      if (!apiKey) {
        return res.status(400).json({ error: 'OpenAI API key is required. Bring Your Own Key.' });
      }
      const openAiKey = apiKey;

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
    // Strict BYOK: Server environment variables are NEVER used for paid providers.
    if (provider === 'elevenlabs') {
      if (!apiKey) {
        return res.status(400).json({ error: 'ElevenLabs API key is required. Bring Your Own Key.' });
      }
      const elApiKey = apiKey;

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
    //
    // Strict BYOK: Server environment variables are NEVER used for paid providers.
    if (provider === 'mistral') {
      if (!apiKey) {
        return res.status(400).json({ error: 'Mistral API key is required. Bring Your Own Key.' });
      }
      const mistralKey = apiKey;

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
    //
    // Strict BYOK: Server environment variables are NEVER used for paid providers.
    if (provider === 'openrouter') {
      if (!apiKey) {
        return res.status(400).json({ error: 'OpenRouter API key is required. Bring Your Own Key.' });
      }
      const orKey = apiKey;

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
    //
    // Supports both manual API keys and xAI OAuth access tokens (the latter bills the
    // user's own SuperGrok / X Premium+ subscription).
    if (provider === 'xai') {
      const effectiveKey = config.xaiAccessToken || apiKey;
      if (!effectiveKey) {
        return res.status(400).json({ error: 'xAI credential is required. Use OAuth or paste an API key.' });
      }
      const xaiCred = effectiveKey;

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
          'Authorization': `Bearer ${xaiCred}`,
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

    // ----------------- FISH AUDIO PROVIDER -----------------
    // Native Fish Audio /v1/tts (not OpenAI-compatible).
    // Key difference from xAI: the model (s2.1-pro-free / s2-pro / s1) is passed
    // in a REQUEST HEADER, and the voice is a `reference_id` (a model id from
    // GET /model). Empty reference_id = Fish's built-in default voice.
    // Docs: https://docs.fish.audio  |  Free model: s2.1-pro-free
    if (provider === 'fish') {
      if (!apiKey) {
        return res.status(400).json({ error: 'Fish Audio API key is required.' });
      }

      const payload: any = {
        text,
        format: 'mp3',
        mp3_bitrate: 128,
        latency: config.latency || 'normal',
      };
      if (voiceId) payload.reference_id = voiceId;
      // Optional S2-Pro params — only sent when the user explicitly sets them.
      if (config.temperature !== undefined) payload.temperature = Number(config.temperature);
      if (config.top_p !== undefined) payload.top_p = Number(config.top_p);
      if (config.speed !== undefined) payload.prosody = { speed: Number(config.speed) };

      const response = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'model': config.model || 's2.1-pro-free',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: `Fish Audio TTS Error: ${errText}` });
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
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
      console.log('[DIAG] Catch-all * handler received request:', req.method, url);

      // Only handle GET requests for the SPA shell. Let other methods fall through.
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        console.log('[DIAG] Non-GET request, passing through');
        return next();
      }

      try {
        let template = fs.readFileSync(path.resolve('.', 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        console.error('[Dev Server] Failed to serve index.html for', url, e);

        // Always send a real response on error — never rely on next(e) alone,
        // as missing error middleware can cause ERR_EMPTY_RESPONSE.
        if (!res.headersSent) {
          res.status(500).send(
            `<!doctype html><html><body style="font-family:system-ui;background:#111;color:#ddd;padding:40px;">
              <h1>Dev Server Error</h1>
              <p>Failed to transform index.html. See terminal for details.</p>
              <pre style="background:#1a1a1a;padding:16px;overflow:auto;">${(e as Error).stack || e}</pre>
            </body></html>`
          );
        }
      }
    });
  } else {
    // Serve static frontend in production
    app.use(express.static(path.resolve('.', 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve('.', 'dist', 'index.html'));
    });
  }

  // Final error handler — guarantees we never send ERR_EMPTY_RESPONSE
  // when something goes wrong in a route or middleware.
  app.use((err: any, req: any, res: any, next: any) => {
    console.error('[Dev Server] Unhandled error for', req.method, req.originalUrl, err);

    if (res.headersSent) {
      return next(err);
    }

    res.status(500).send(
      `<!doctype html><html><body style="font-family:system-ui;background:#111;color:#ddd;padding:40px;">
        <h1>Dev Server Error</h1>
        <p>Something went wrong while handling this request.</p>
        <pre style="background:#1a1a1a;padding:16px;overflow:auto;">${err?.stack || err}</pre>
      </body></html>`
    );
  });

  // Port can be overridden with PORT=xxxx npm run dev
  // We default to 3456 because Cursor IDE frequently occupies port 3000 on Windows.
  const port = Number(process.env.PORT) || 3456;

  // NOTE: We intentionally do NOT bind to '0.0.0.0' here.
  // On Windows (and sometimes macOS), binding to '0.0.0.0' while the browser
  // resolves "localhost" as IPv6 can cause the connection to be accepted
  // at TCP level but then immediately dropped → ERR_EMPTY_RESPONSE with
  // zero logs in the app. Using no host (or 127.0.0.1) is much more reliable
  // for local development.
  app.listen(port, () => {
    console.log(`[TTS Voice Studio] Running at http://localhost:${port}`);
    if (port === 3000) {
      console.log(`[NOTE] Port 3000 is commonly used by Cursor/VS Code extensions on Windows.`);
      console.log(`       If you have trouble, run with: PORT=3456 npm run dev`);
    }
  });
}

start().catch((err) => {
  console.error('Fatal dev server starting failure:', err);
});
