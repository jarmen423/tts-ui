---
title: TTS Anything (BYOK)
emoji: 🎙️
colorFrom: purple
colorTo: indigo
sdk: docker
sdk_version: latest
app_port: 7860
pinned: false
---

# TTS Voice Studio

> A beautiful, full-featured Text-to-Speech console with real-time reactive visualizations, multi-provider support, and persistent local audio archiving.

**TTS Voice Studio** is a modern web application for high-quality voice synthesis. It provides a unified interface over Google Gemini, OpenAI, ElevenLabs, and Mistral Voxtral, with a stunning Web Audio API-driven visual layer and a holographic teleprompter.

---

## Features

### Multi-Provider TTS Engine
- **Gemini** (gemini-3.1-flash-tts-preview) — Zero-config entry point + emotion prefixes
- **Gemini Multi-Speaker** — Natural two-speaker dialogue with labeled turns (`Joe: Hello...`)
- **OpenAI TTS** — `tts-1` (low-latency) and `tts-1-hd` (studio quality)
- **ElevenLabs** — Flash, Turbo, Multilingual v2 + full custom voice clone sync
- **Mistral Voxtral** — `voxtral-mini-tts-2603` + saved voices + reference-audio cloning (BYOK)
- **OpenRouter** — Universal BYOK router. One key unlocks 100+ TTS models (Grok Voice, Gemini TTS, Kokoro, Voxtral, etc.)
- **xAI Grok Voice** — Official direct integration. 5 expressive built-in voices + full support for user custom cloned voices. Rich speech tags (`[laugh]`, `<whisper>`, etc.)

All paid providers use a **secure server-side proxy**. Your keys never leave the browser except when you explicitly send them for a request.

### Stunning Real-Time Visualizers
Five distinct Web Audio API-driven visualization modes with beat detection and accent theming:
- **Cosmic Glow Spectrum** — Mirrored frequency bars + floating peaks
- **Neon Ripple Wave** — Oscilloscope ribbon with sonar pulses
- **Cyberpunk Circular Ring** — Rotating spiked boundary + particle shedding
- **Vaporwave Hyperspace Starfield** — 3D warp-speed starfield + retro grid
- **Aura Nebula Orb** — Breathing liquid particle system

Visualizer runs in fullscreen, survives tab switches, and uses a shared singleton `AudioContext`/`AnalyserNode` graph.

### Holographic Teleprompter
- Word-level timing estimation (character + punctuation weighted)
- Smart-follow autoscroll with manual override detection
- Presenter isolation mode
- Triggers particle explosions on the visualizer when words are spoken
- Fully client-side (no external alignment model required)

### Persistent Audio Library
- Full audio blobs stored in **IndexedDB** (survives page refresh / browser restart)
- Automatic synthesis history + manually curated "My Library"
- Per-item rename, download, and delete
- Clean separation: history = ephemeral cache, library = user-saved artifacts

### Workflow Polish
- Drag & drop `.txt` / `.md` import
- Live character/word counters
- Voice preview samples (ElevenLabs preview_url + real short synthesis for others)
- Per-provider advanced controls (stability, similarity, models, emotions)
- Client-side playback rate, pitch offset, and intonation contour
- Five beautiful theme accents

---

## Quick Start

### 1. Install & Run (Development)

```bash
npm install
npm run dev
```

The dev server starts on `http://localhost:3000` and uses Vite middleware + Express.

### 2. Configure API Keys

- **Gemini**: Works out of the box in many AI Studio / Cloud Run environments (key injected server-side via `GEMINI_API_KEY`).
- **OpenAI / ElevenLabs / Mistral / OpenRouter / xAI**: **Strict BYOK**. 
  Paste your own keys directly in the UI. They are stored **only** in your browser's `localStorage`.

  **Important**: Server environment variables are **never used** as fallbacks for any paid provider. This design ensures that when the app is deployed publicly (e.g. as a Hugging Face Space), no one can accidentally consume the deployer's API keys.

**OpenRouter** and **xAI** are especially powerful BYOK options:
- OpenRouter gives access to many different TTS models through a single key.
- xAI gives official Grok Voice + the ability to use voices you have cloned in the xAI console.

**All providers are strictly BYOK.** No server-side API keys are ever used as fallbacks. This design makes the app safe to deploy publicly without risking the deployer's billing.

### 3. Synthesize

1. Select a provider card.
2. (Optional) Sync custom voices for ElevenLabs, Mistral, or xAI (very useful if you have cloned voices in the xAI console).
3. Type or paste text (or drop a `.txt`/`.md` file).
4. Choose voice + tweak advanced controls.
5. Click **Generate High-Quality Voice**.

Audio appears instantly in the player and is archived in History.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   App.tsx    │  │ AudioVisualizer│  │   Teleprompter   │  │
│  │ (State + UI) │  │ (Web Audio)  │  │  (Word timing)   │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
│            │                 │                 │            │
│            └─────────────────┴─────────────────┘            │
│                              │                              │
│                    IndexedDB (audio blobs)                  │
│                    localStorage (keys + metadata)           │
└──────────────────────────────┼──────────────────────────────┘
                               │  POST /api/tts/*
┌──────────────────────────────▼──────────────────────────────┐
│                       Express Server                         │
│  • /api/tts/generate     (all providers)                     │
│  • /api/tts/voices       (ElevenLabs)                        │
│  • /api/tts/mistral/voices                                   │
│  • /api/tts/xai/voices   (xAI built-in + custom clones)      │
│  • /api/tts/voice-sample (preview clips)                     │
│  • /api/llm/enhance-for-tts (gemini, openai, openrouter, xai)│
│  • Gemini client (server-only key)                           │
└──────────────────────────────────────────────────────────────┘
```

### Why a Server Proxy?

- Gemini TTS requires a server-side API key in many environments.
- ElevenLabs and Mistral voice listing / synthesis calls are cleaner and more stable when proxied.
- Consistent error handling and future rate-limiting / logging surface.

---

## Environment Variables

See [.env.example](.env.example).

| Variable             | Purpose                                      | Required          |
|----------------------|----------------------------------------------|-------------------|
| `GEMINI_API_KEY`      | **Ignored** (strict BYOK for all providers)                | Never used        |
| `OPENAI_API_KEY`      | **Ignored** (strict BYOK for all providers)                | Never used        |
| `ELEVENLABS_API_KEY`  | **Ignored** (strict BYOK for all providers)                | Never used        |
| `MISTRAL_API_KEY`     | **Ignored** (strict BYOK for all providers)                | Never used        |
| `OPENROUTER_API_KEY`  | **Ignored** (strict BYOK for all providers)                | Never used        |
| `XAI_API_KEY`         | **Ignored** (strict BYOK for all providers)                | Never used        |
| `HF_TOKEN`            | For private Hugging Face Gradio Spaces                     | Optional          |

User-provided keys in the UI always take precedence over server fallbacks.

---

## NPM Scripts

| Command          | Description                                      |
|------------------|--------------------------------------------------|
| `npm run dev`    | Start full-stack dev server (tsx + Vite)         |
| `npm run build`  | Build client (`dist/`) + bundle server (`dist/server.cjs`) |
| `npm run start`  | Run production server from `dist/server.cjs`     |
| `npm run lint`   | Type-check only (`tsc --noEmit`)                 |
| `npm run test:api` | Run integration tests against local server     |

The test script now provides good coverage for **all BYOK providers** (including OpenRouter and xAI), voice listing, voice samples, the unified synthesize gateway, and the LLM enhancer. It gracefully skips providers without keys.

---

## Storage Model

- **IndexedDB** (`TTSVoiceStudioDB` → `synthesized_audios`): Stores raw `Blob` objects keyed by synthetic IDs (`rec_*` or `lib_*`).
- **localStorage**:
  - API keys (prefixed `tts_voicestudio_*_key`)
  - Synthesis metadata history
  - Saved library manifest (lightweight JSON)
  - UI preferences

This design gives near-native persistence without a backend database.

---

## Development Notes

- The project was originally scaffolded as an "AI Studio" applet. Many legacy strings (`My Google AI Studio App`, package name `react-example`) remain.
- HMR can be disabled via `DISABLE_HMR=true` for heavy agent editing sessions (see `vite.config.ts`).
- Web Audio graph is deliberately module-scoped and lazily initialized to survive React StrictMode double-mounts and provider switches.
- The teleprompter timing model is heuristic (character weight + punctuation pauses). It is intentionally zero-dependency.

---

## Future / Phase 2

Comments in the codebase reference upcoming work:
- Hugging Face Gradio Spaces integration (`@gradio/client`)
- Additional reference-audio cloning flows
- Deeper Mistral SDK usage

---

## License

Private / internal tooling. Not currently published.

---

**Enjoy creating voices.** The visual layer and teleprompter make long-form synthesis genuinely pleasant to review.