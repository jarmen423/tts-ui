# AGENTS.md — TTS Voice Studio

This document helps future agents (and humans) work effectively in the TTS Voice Studio codebase.

## Project Intent

**TTS Voice Studio** is a high-fidelity, visually rich Text-to-Speech workbench. It exists to:

1. Provide a single beautiful surface over six TTS surfaces (Gemini, OpenAI, ElevenLabs, Mistral Voxtral, OpenRouter universal router, + direct xAI Grok Voice with custom voice cloning support).
2. Demonstrate advanced browser-native audio techniques (Web Audio API singletons, real-time analysis, beat detection).
3. Serve as a reference implementation of a "BYOK + secure proxy" pattern for generative audio tools.
4. Act as a **teaching surface** — the code is intentionally readable, heavily commented in key areas, and structured so a motivated beginner can understand the full stack by reading the files.

The project values **clarity and craft** over minimalism. The visualizers and teleprompter are first-class features, not afterthoughts.

---

## High-Level Architecture

```
src/
  App.tsx                 # The entire application state + UI (monolithic by design for teachability)
  components/
    AudioVisualizer.tsx   # Web Audio + Canvas rendering engine (5 styles)
    Teleprompter.tsx      # Heuristic word timing + holographic HUD
  utils/
    audioDb.ts            # Tiny IndexedDB wrapper (AudioDB class)

server.ts                 # Express + Vite middleware dev server
                          # All /api/tts/* proxy routes live here

vite.config.ts            # Tailwind v4 plugin + deliberate HMR disable support
```

Key principle: **Most application logic lives in one file (`App.tsx`) on purpose.** This makes the data flow and state transitions easy to trace when teaching or debugging.

---

## Critical Technical Patterns

### 1. Web Audio API Singleton (Most Important Gotcha)

**File:** `src/components/AudioVisualizer.tsx:16-19`

```ts
let sharedAudioCtx: AudioContext | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let sharedSource: MediaElementAudioSourceNode | null = null;
```

- The graph is created **once** at module scope.
- `initializeWebAudio()` is idempotent and safe to call on every render/click.
- This survives React 19 StrictMode double-mounts, provider switches, and hot reloads.
- Never create a new `AudioContext` per playback or you will leak nodes and get the dreaded "AudioContext was not allowed to start" errors.

**Rule:** If you touch audio routing, touch the shared nodes.

### 2. IndexedDB Audio Blob Storage

**File:** `src/utils/audioDb.ts`

- Stores full `Blob` objects (not data URLs).
- Keys are synthetic (`rec_172...` for history, `lib_172...` for library).
- The manifest (title, provider, voice, timestamp, charCount) lives in localStorage.
- This split keeps the localStorage small while giving true offline replay.

**Cleanup note:** There is no automatic garbage collection. `handleClearAllHistory` and library wipe buttons are the only way to reclaim space.

### 3. Teleprompter Timing Model

**File:** `src/components/Teleprompter.tsx:59-105`

The timing engine is **purely heuristic**:

- Splits on paragraphs (`\n+`)
- Assigns weight = `word.length + punctuation bonus`
- Distributes total weight across `duration`
- No external forced-alignment model (Whisper, etc.)

This is intentional for zero-dependency operation. If you need sub-word accuracy, you will need to integrate a real aligner.

The `onActiveWordChange` callback is the bridge to the visualizer (particle explosions on spoken words).

### 4. Provider Abstraction (Not Fully Extracted — On Purpose)

All provider-specific logic (payload shaping, emotion prefixes, multi-speaker config, voice lists) lives inside `App.tsx` in large `if (provider === 'xxx')` blocks and the big `handleSynthesize` function.

**Why?** For a teaching codebase, colocation beats premature abstraction. A future refactor could extract a `providers/` directory with adapter objects, but only when a 6th provider is added.

**OpenRouter (added 2026)** is the canonical "universal BYOK router". It appears as `provider === 'openrouter'`. 
- Fully OpenAI-compatible for both TTS (`/audio/speech`) and chat (enhancer).
- One key unlocks many models (Grok Voice, Gemini TTS, Kokoro, Voxtral, etc.).
- Model is passed in `config.model`; voice is model-specific.

**xAI Grok Voice (added 2026)** is a direct integration (`provider === 'xai'`). 
- Uses the **native** `POST https://api.x.ai/v1/tts` (not OpenAI-compatible shape for TTS).
- `language` (BCP-47 or `"auto"`) is **mandatory**.
- Supports rich inline speech tags (`[laugh]`, `<whisper>`, `[pause]`, etc.).
- First-class custom voice cloning support via the new `/api/tts/xai/voices` proxy + "Sync Voices" button.
- Also available as an enhancer provider (uses the OpenAI-compatible chat endpoint at `api.x.ai/v1/chat/completions`).

**Fish Audio (added 2026)** is a direct integration (`provider === 'fish'`).
- Uses the **native** `POST https://api.fish.audio/v1/tts` (not OpenAI-compatible).
- Like xAI, the **model goes in a request header** (`model: s2.1-pro-free`), but for Fish the model is the *engine* (s2.1-pro-free / s2-pro / s1), and the *voice* is a `reference_id` (a voice model id from `GET /model`). Empty `reference_id` = Fish's built-in default voice. The engine model and the voice are INDEPENDENT — a cloned voice works fine on `s2.1-pro-free`, and the default voice works fine on `s2-pro`. The UI's "Engine Model" selector drives the header.
- The free model `s2.1-pro-free` has **no hard usage cap** under Fair Use through the end of July 2026 (Fish Audio extended the window in June 2026 — see https://fish.audio/blog/s2-1-pro-free-api/). It's the headline feature, surfaced as a "FREE" badge on the provider card. API credit (separate from any subscription credit) is required to make API calls at all; see https://fish.audio/app/developers.
- S2-Pro exposes `temperature`, `top_p`, and `prosody.speed`; supports free-form `[bracket]` emotion tags in text.
- First-class custom voice support: a "Sync Voices" button (`/api/tts/fish/voices` → `GET /model?self=true`) **plus** in-app voice **creation** from an uploaded audio sample (`/api/tts/fish/voices/create` → re-wraps base64 as multipart `POST /model`). Voice training is async on Fish Audio's side.
- **No LLM enhancer** — Fish Audio is TTS-only. Do not add it to `EnhanceRequest`.

**Important Lesson**: Not all TTS providers are OpenAI-compatible. xAI was the first non-compatible one added; Fish Audio is the second. Two recurring patterns for native providers: (1) the model may need to live in a **header** rather than the body, and (2) "voice" may be a model id (`reference_id`) rather than a named preset. Always check the exact request/response contract when adding a new provider.

**Security / Deployment Policy (Strict BYOK)**:
- The application is deliberately designed as **strict BYOK for all providers**, including Gemini.
- **No** server-side environment variables are ever used as fallbacks for any provider.
- This policy exists specifically to make the app safe to deploy publicly (e.g. as a Hugging Face Space) without any risk of the deployer being charged.
- When modifying server key handling logic, preserve this strict separation. Never re-introduce fallbacks.
- Server routes hit `https://openrouter.ai/api/v1/audio/speech` (and chat/completions for the enhancer).
- Frontend provides a curated preset bar + free-text model slug + voice field because each routed model has its own voice vocabulary.
- Also wired into LLM Script Enhancer, voice preview, and the unified `/synthesize` path.
- Environment fallback key: `OPENROUTER_API_KEY`.

### 5. Server Proxy Design

All synthesis and voice listing goes through `/api/tts/*` routes in `server.ts`.

- Gemini calls use the server-injected `GEMINI_API_KEY` (never sent from client).
- Paid providers accept a per-request `apiKey` from the client (the key the user typed in the UI).
- Server keys in `.env` are only fallbacks.

This pattern is documented in the README. Do not bypass it.

---

## Common Tasks & Where to Edit

| Task                                      | Primary File(s)                          | Notes |
|-------------------------------------------|------------------------------------------|-------|
| Add a new TTS provider                    | `server.ts` + `App.tsx` (provider cards + payload) | See the **Provider Addition Checklist** below. OpenRouter (universal router), xAI (native Grok Voice + custom voices), and Fish Audio (free s2.1-pro-free + in-app voice cloning) were added as BYOK providers in 2026. |
| Tweak a visualizer style                  | `AudioVisualizer.tsx` (the big `if (visualStyle === 'xxx')` block) | Keep the shared particle system in sync |
| Change teleprompter behavior              | `Teleprompter.tsx`                       | Timing weights or scroll logic |
| Add a new advanced control (e.g. "seed")  | `App.tsx` (state + UI section + payload) | Keep it inside the existing "Advanced Engine Modifiers" accordion |
| Modify IndexedDB schema                   | `audioDb.ts` + bump `VERSION`            | Write a migration if you touch structure |
| Add a new API route                       | `server.ts`                              | Keep the pattern of accepting `apiKey` in body for BYOK providers |
| Change default Gemini voice / emotion     | `App.tsx` constants + `handleSynthesize` | |
| Improve error messages shown to users     | `App.tsx` (the `ttsError` state surface) | |

### Provider Addition Checklist (2026)

When adding a new TTS provider, you must touch **many** places. Use this as a checklist:

**Backend (`server.ts`)**
- Add branch in `/api/tts/generate`
- Add branch in `/api/tts/synthesize` (unified gateway)
- Add branch in `/api/tts/voice-sample` (for preview)
- (If the provider supports voice listing/custom voices) Add a `POST /api/tts/{provider}/voices` proxy
- (If the provider supports creating voices from audio) Add a `POST /api/tts/{provider}/voices/create` route. Pattern: accept base64 audio in JSON, re-wrap as multipart `FormData` (Node global `Blob`+`FormData`, no extra deps) for the upstream. See `fish/voices/create` for the reference implementation.
- Update error messages and any fallback key logic

**LLM Enhancer (`server/llm-enhancer.ts`)**
- Extend the `EnhanceRequest` type
- Add implementation branch (many new providers are OpenAI-compatible for chat)
- Update default model logic

**Frontend (`src/App.tsx`) — biggest surface**
- Add key state + `localStorage` persistence + `updateXxxKey` function
- Add to `hasKeyForProvider()`
- Add provider card in the grid (with key status dot)
- Add key input section (visible when selected) + full Settings panel row
- Wire into `handleSynthesize` (key selection, `needsRegularKey`, payload `config`, metadata)
- Update provider switch `useEffect` for sensible defaults
- Add to voice grid rendering (built-in voices + custom voices support)
- Add fetch function + "Sync Voices" button pattern if the provider supports custom voices (see xAI and Mistral)
- Add section in Advanced Engine Modifiers accordion
- Update preview button disabled condition
- Update enhancer provider type + select + key lookup
- Update any history/library badge styling fallbacks

**Testing**
- Add blocks in `scripts/test-tts-api.ts` for:
  - `/generate`
  - `/synthesize` (unified)
  - Voice sample
  - Voices listing (if applicable)
  - LLM enhancer
- Update `TESTING.md`

**Documentation**
- Update `AGENTS.md` (especially this checklist and provider notes)
- Update `README.md` (features list, env table, architecture diagram text)
- Update `TESTING.md` table

**Key Architectural Lessons**
- OpenRouter is the easiest to add (pure OpenAI-compatible for both TTS and chat).
- xAI required the most care because its TTS endpoint is native (`POST /v1/tts`) and requires `language` as a mandatory field.
- Fish Audio introduced two new patterns: (1) the **model lives in a request header** (like xAI) but is the *engine*, while the *voice* is a `reference_id`; (2) **in-app voice creation** via a base64→multipart `voices/create` route. An empty `reference_id` is valid (uses the provider's default voice), so the frontend's preview guard and provider-switch `useEffect` must treat empty `voiceId` as a real selection for `fish`.
- Custom voice cloning support (xAI, ElevenLabs, Mistral, Fish Audio) is a major UX differentiator — always implement the voices proxy + Sync button when the backend offers it. When the backend also lets you *create* voices (Fish Audio), add the `voices/create` route + upload UI too.
- The LLM enhancer is now also a first-class BYOK surface (currently 4 providers). Fish Audio is TTS-only and is deliberately **not** an enhancer provider.

### xAI OAuth Implementation (2026)
- Uses the shared public Grok CLI client_id (`b1a00492-073a-47ea-816f-4c329264a828`).
- Redirect URI is **hardcoded** to `http://127.0.0.1:56121/callback` — this is the only URI xAI has registered for this client.
- A small loopback Express server is started on port 56121 inside `server.ts` (see "xAI OAUTH LOOPBACK CALLBACK SERVER").
- In development the loopback + postMessage path works automatically.
- In production the primary path is **manual code paste** (user copies `?code=` from the stuck redirect URL in the address bar and pastes it into the UI box). This matches the EA OAuth paste flow the user built for m26pipeline.
- PKCE verifier + state are stored in `sessionStorage` for the duration of the flow.
- No server-side secrets; everything is BYOK + client-side token exchange.
- The loopback server is harmless to start in production (binds only to 127.0.0.1).

See README.md → "xAI OAuth Flow (Subscription Billing)" for the user-facing explanation.



---

## Testing Strategy

- `npm run lint` = type check only (no ESLint configured).
- `npm run test:api` runs the integration test in `scripts/test-tts-api.ts`.
  - It is deliberately safe to run repeatedly.
  - It skips providers without keys in the environment.
  - It exercises the newest parity paths: Mistral voices, voice-sample, Gemini multi-speaker.

When adding a new provider or route, add a corresponding test block in the script.

---

## Style & Documentation Expectations

This repo follows the "Teach Through Code" philosophy (see user's global Claude.md):

- Non-trivial functions and modules should have clear purpose statements.
- Complex algorithms (Web Audio graph, timing distribution, beat detection) have inline comments explaining *why*, not just *what*.
- State that has surprising lifetime (the shared audio nodes, the manual scroll lock in the teleprompter) is heavily annotated.

When you make material changes:

1. Update the relevant section in this `AGENTS.md`.
2. Add or update a docstring / block comment near the changed logic.
3. If the change affects the visual or audio experience, consider whether a one-line user-facing note in the UI or README is warranted.

---

## Known Rough Edges (Honest Inventory)

- Package name in `package.json` is still the default `react-example`.
- `index.html` title is still "My Google AI Studio App".
- The main `App.tsx` is large (~2245 lines). This is acceptable for now because the file tells a single coherent story.
- No real unit tests for the frontend (only the API integration script).
- Voice timing in the teleprompter is "good enough" for narration but will drift on very fast or very slow speech.
- Pitch and intonation sliders are client-side playback only (they do not affect the actual synthesis for any provider today).

These are not bugs — they are explicit trade-offs documented here so agents don't waste time "fixing" intentional design choices.

---

## Future Work Signals in Code

Search for these comments/phrases to find future intent:

- `Phase 2 (HF Gradio Spaces)`
- `// Matches the CLI `gemini-multi` command + `ivs_tts` engine`
- `// parity with CLI `voices` command`
- `// Correct Voxtral model + format`

The server routes were deliberately shaped to stay in sync with an external CLI tool (`tts_cli.py` / `ivs_tts`). When in doubt, look at how the CLI calls the same underlying services.

---

## Working Effectively With This Codebase

1. **Start here when exploring:**
   - `README.md` for user-facing overview
   - `server.ts:225` (the `/api/tts/generate` router) — this is the heart of the backend
   - `App.tsx:375` (`handleSynthesize`) — the heart of the frontend

2. **When debugging audio issues:**
   - Check whether `sharedAudioCtx` was created (click the visualizer viewport to force init).
   - Check browser console for "The AudioContext was not allowed to start" — almost always a singleton lifecycle problem.

3. **When the visualizer looks frozen:**
   - The canvas is sized from its parent. Fullscreen mode forces a resize event.
   - The render loop is a single `requestAnimationFrame` — killing it (unmount without cleanup) is a common source of "multiple loops" bugs.

4. **When adding features that touch audio playback:**
   - Always go through the existing `<audio ref={audioRef}>` element and the `AudioDB` class.
   - Never store audio as base64 strings in localStorage.

---

## One-Sentence Summary for Future Agents

TTS Voice Studio is a deliberately crafted, visually ambitious, single-file-state React application that demonstrates how to build a production-grade multi-provider TTS console while keeping the entire data and rendering story easy to read and teach.

---

*Last updated: 2026-05 (initial agent documentation)*