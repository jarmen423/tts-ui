import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

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
      if (!ai) {
        return res.status(503).json({ 
          error: 'Gemini API is currently not available. Add GEMINI_API_KEY in Settings > Secrets.' 
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

      const response = await ai.models.generateContent({
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

    // ----------------- MISTRAL PROVIDER -----------------
    if (provider === 'mistral') {
      const mistralKey = apiKey || process.env.MISTRAL_API_KEY;
      if (!mistralKey) {
        return res.status(400).json({ error: 'Mistral API key is required. Bring Your Own Key.' });
      }

      const mModel = config.model || 'mistral-cobalt-latest';
      const mVoice = voiceId || 'bellatrix';

      const response = await fetch('https://api.mistral.ai/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: mModel,
          input: text,
          voice: mVoice,
        }),
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
