# Testing the TTS API

This document describes how to verify the TTS Voice Studio endpoints, especially the new functionality added for parity with the Python CLI (`tts_cli.py` + `ivs_tts`).

## Running the API Integration Tests

A simple, self-contained test script is provided:

```bash
npm run test:api
```

### What it tests

The script (`scripts/test-tts-api.ts`) provides integration coverage for all BYOK providers and parity paths:

| Test | Endpoint | Providers | Notes |
|------|----------|-----------|-------|
| Voice Sample | `POST /api/tts/voice-sample` | All (incl. openrouter, xai) | Real short synthesis or official previews |
| Gemini Multi-speaker | `POST /api/tts/generate` | `gemini-multi` | Validates the `multiSpeakerVoiceConfig` path |
| Voices Listing | `POST /api/tts/{mistral,xai}/voices` | Mistral, xAI | Includes custom/cloned voices |
| OpenRouter / xAI Synthesis | `POST /api/tts/generate` + `/synthesize` | openrouter, xai | Full BYOK router + native xAI `/v1/tts` |
| LLM Script Enhancer | `POST /api/llm/enhance-for-tts` | gemini, openai, openrouter, xai | All current BYOK LLM backends |
| Unified Gateway | `POST /api/tts/synthesize` | All supported | Library-style parity path |
| Regression | `POST /api/tts/generate` | Gemini (single) | Ensures we didn't break existing behavior |

### Environment

The script automatically loads `.env` (via `dotenv`).

It will **skip** providers gracefully when the corresponding API key is missing:

- `GEMINI_API_KEY`
- `ELEVENLABS_API_KEY`
- `MISTRAL_API_KEY`
- `OPENROUTER_API_KEY`
- `XAI_API_KEY`

For **full coverage** (recommended after adding new providers), include as many as possible:

```env
GEMINI_API_KEY=...
ELEVENLABS_API_KEY=...
MISTRAL_API_KEY=...
OPENROUTER_API_KEY=...
XAI_API_KEY=...
```

### Manual Testing (curl)

You can also test individual routes quickly:

**Voice preview (ElevenLabs):**
```bash
curl -X POST http://localhost:3000/api/tts/voice-sample \
  -H "Content-Type: application/json" \
  -d '{"provider":"elevenlabs","voiceId":"21m00Tcm4TlvDq8ikWAM"}'
```

**Gemini Multi-speaker:**
```bash
curl -X POST http://localhost:3000/api/tts/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "gemini-multi",
    "text": "Joe: Hello!\nJane: Hi there!",
    "config": {
      "speaker1": "Joe",
      "voice1": "Kore",
      "speaker2": "Jane",
      "voice2": "Puck"
    }
  }' \
  --output /tmp/test_multi.mp3
```

## Future Improvements

- Add Vitest + supertest for proper unit/integration tests of the Express routes (currently only the tsx smoke script exists).
- Add Playwright or React Testing Library tests for the frontend voice studio UI.
- Add a CI workflow that runs `npm run test:api` (with secrets via GitHub Actions).

The integration script now gives good coverage for all BYOK synthesis, voice listing, samples, unified gateway, and LLM enhancer paths.

See also the "Verification Strategy" section in the gap-closure plan for the original requirements.
