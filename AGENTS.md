# AGENTS.md — TTS Voice Studio

This document helps future agents (and humans) work effectively in the TTS Voice Studio codebase.

## Project Intent

**TTS Voice Studio** is a high-fidelity, visually rich Text-to-Speech workbench. It exists to:

1. Provide a single beautiful surface over four very different TTS APIs (Gemini, OpenAI, ElevenLabs, Mistral Voxtral).
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

**Why?** For a teaching codebase, colocation beats premature abstraction. A future refactor could extract a `providers/` directory with adapter objects, but only when a 5th provider is added.

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
| Add a new TTS provider                    | `server.ts` + `App.tsx` (provider cards + payload) | Add card UI + one branch in `/generate` |
| Tweak a visualizer style                  | `AudioVisualizer.tsx` (the big `if (visualStyle === 'xxx')` block) | Keep the shared particle system in sync |
| Change teleprompter behavior              | `Teleprompter.tsx`                       | Timing weights or scroll logic |
| Add a new advanced control (e.g. "seed")  | `App.tsx` (state + UI section + payload) | Keep it inside the existing "Advanced Engine Modifiers" accordion |
| Modify IndexedDB schema                   | `audioDb.ts` + bump `VERSION`            | Write a migration if you touch structure |
| Add a new API route                       | `server.ts`                              | Keep the pattern of accepting `apiKey` in body for BYOK providers |
| Change default Gemini voice / emotion     | `App.tsx` constants + `handleSynthesize` | |
| Improve error messages shown to users     | `App.tsx` (the `ttsError` state surface) | |

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