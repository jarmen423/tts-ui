#!/usr/bin/env tsx
/**
 * Simple integration test script for the TTS Voice Studio API routes.
 *
 * Run with:
 *   npm run test:api
 *
 * This follows the verification strategy in the approved gap-closure plan.
 *
 * It exercises the new/modified endpoints added for CLI parity and full BYOK coverage:
 *   - Mistral fidelity (correct Voxtral contract)
 *   - Gemini Multi-speaker
 *   - Voice Sample / Preview (all providers)
 *   - OpenRouter + xAI Grok Voice synthesis + voices + samples (BYOK)
 *   - LLM Script Enhancer (gemini, openai, openrouter, xai)
 *   - Unified /synthesize gateway for all supported providers
 *
 * The script is designed to be safe to run repeatedly.
 * It uses very short test texts and skips providers when keys are missing.
 */

import 'dotenv/config';
import { pickRequestedModel } from '../server/model-id';
import { readApiError } from '../src/utils/readApiError';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  message?: string;
  durationMs?: number;
}

const results: TestResult[] = [];

async function testEndpoint(
  name: string,
  fn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({
      name,
      status: 'PASS',
      durationMs: Date.now() - start,
    });
    console.log(`✅ PASS  ${name}`);
  } catch (err: any) {
    results.push({
      name,
      status: 'FAIL',
      message: err.message,
      durationMs: Date.now() - start,
    });
    console.error(`❌ FAIL  ${name}`);
    console.error(`   ${err.message}`);
  }
}

function skip(name: string, reason: string) {
  results.push({ name, status: 'SKIPPED' });
  console.log(`⏭️  SKIP  ${name}  (${reason})`);
}

async function fetchJson(url: string, body: any, headers: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  }

  // Some routes return audio (binary), others return JSON
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  // For audio routes we just check that we got bytes
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < 1000) {
    throw new Error(`Audio response too small (${buffer.length} bytes)`);
  }
  return { bytes: buffer.length, contentType };
}

async function main() {
  console.log('🧪 TTS API Integration Tests');
  console.log(`   Base URL: ${BASE_URL}\n`);

  const hasGemini = !!process.env.GEMINI_API_KEY;
  const hasEleven = !!process.env.ELEVENLABS_API_KEY;
  const hasMistral = !!process.env.MISTRAL_API_KEY;
  const hasOpenRouter = !!process.env.OPENROUTER_API_KEY;
  const hasXai = !!process.env.XAI_API_KEY;
  const hasFish = !!process.env.FISH_API_KEY;

  // ============================================
  // Typed model resolution (no upstream call)
  // ============================================

  await testEndpoint('pickRequestedModel prefers config.model over fallback', async () => {
    const got = pickRequestedModel(
      { config: { model: '  gemini-3.8-flash-tts  ' }, options: { model: 'ignored' } },
      'stale-hardcoded-id'
    );
    if (got !== 'gemini-3.8-flash-tts') {
      throw new Error(`expected typed model, got ${got}`);
    }
  });

  await testEndpoint('pickRequestedModel uses body.model (voice-sample shape)', async () => {
    const got = pickRequestedModel({ model: 'eleven_v3', config: {} }, 'eleven_flash_v1_5');
    if (got !== 'eleven_v3') throw new Error(`expected eleven_v3, got ${got}`);
  });

  await testEndpoint('pickRequestedModel falls back only when client sent nothing', async () => {
    const got = pickRequestedModel({ config: {}, options: {} }, 'tts-1');
    if (got !== 'tts-1') throw new Error(`expected fallback tts-1, got ${got}`);
  });

  await testEndpoint('readApiError surfaces HTML DOCTYPE as status + snippet', async () => {
    const res = new Response(
      '<!DOCTYPE html><html><title>Error</title><body><pre>Cannot POST /api/tts/foo</pre></body></html>',
      { status: 404, statusText: 'Not Found', headers: { 'content-type': 'text/html' } }
    );
    const msg = await readApiError(res, 'failed');
    if (/Unexpected token/.test(msg)) {
      throw new Error(`still leaked JSON.parse message: ${msg}`);
    }
    if (!/HTML/i.test(msg) || !/404/.test(msg)) {
      throw new Error(`expected HTML+404 message, got: ${msg}`);
    }
  });

  // ============================================
  // HTML-as-JSON crash guards (no API keys needed)
  // ============================================

  await testEndpoint('Unknown POST /api/tts/* returns JSON 404, not HTML', async () => {
    const res = await fetch(`${BASE_URL}/api/tts/definitely-not-a-route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', text: 'hi' }),
    });
    const ctype = res.headers.get('content-type') || '';
    const text = await res.text();
    if (res.status !== 404) throw new Error(`expected 404, got ${res.status}: ${text.slice(0, 200)}`);
    if (!ctype.includes('application/json')) {
      throw new Error(`expected JSON content-type, got ${ctype}: ${text.slice(0, 180)}`);
    }
    if (/<!DOCTYPE/i.test(text) || text.trim().startsWith('<')) {
      throw new Error(`API 404 returned HTML (the old DOCTYPE crash): ${text.slice(0, 180)}`);
    }
    const parsed = JSON.parse(text);
    if (!parsed.error) throw new Error('JSON 404 missing error field');
  });

  await testEndpoint('GET /api/tts/generate returns JSON 404, not SPA HTML', async () => {
    const res = await fetch(`${BASE_URL}/api/tts/generate`);
    const ctype = res.headers.get('content-type') || '';
    const text = await res.text();
    if (/<!DOCTYPE/i.test(text) || /<html/i.test(text)) {
      throw new Error(`GET generate returned HTML: ${text.slice(0, 180)}`);
    }
    if (!ctype.includes('application/json')) {
      throw new Error(`expected JSON, got ${ctype}`);
    }
    JSON.parse(text);
  });

  await testEndpoint('Generate with typed custom model + missing key is JSON', async () => {
    const res = await fetch(`${BASE_URL}/api/tts/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'openai',
        text: 'hello',
        voiceId: 'alloy',
        config: { model: 'gpt-4o-mini-tts-CUSTOM-TYPED' },
      }),
    });
    const text = await res.text();
    if (/<!DOCTYPE/i.test(text)) {
      throw new Error(`generate returned HTML: ${text.slice(0, 180)}`);
    }
    const parsed = JSON.parse(text);
    if (res.status !== 400) throw new Error(`expected 400 missing key, got ${res.status}: ${text}`);
    if (!/OpenAI API key/i.test(parsed.error || '')) {
      throw new Error(`unexpected error: ${parsed.error}`);
    }
  });

  await testEndpoint('Synthesize gemini-multi reads speakers from config (UI shape)', async () => {
    const res = await fetch(`${BASE_URL}/api/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'gemini-multi',
        text: 'Joe: Hi\nJane: Hello',
        config: {
          model: 'gemini-3.8-flash-lite-tts',
          speaker1: 'Joe',
          voice1: 'Kore',
          speaker2: 'Jane',
          voice2: 'Puck',
        },
      }),
    });
    const text = await res.text();
    if (/<!DOCTYPE/i.test(text)) {
      throw new Error(`synthesize returned HTML: ${text.slice(0, 180)}`);
    }
    const parsed = JSON.parse(text);
    if (res.status !== 400) throw new Error(`expected 400 missing Gemini key, got ${res.status}: ${text}`);
    if (!/Gemini API key/i.test(parsed.error || '')) {
      throw new Error(`unexpected error: ${parsed.error}`);
    }
  });

  // ============================================
  // Voice Sample Tests
  // ============================================

  if (hasEleven) {
    await testEndpoint('Voice Sample - ElevenLabs (Rachel)', async () => {
      const data = await fetchJson(`${BASE_URL}/api/tts/voice-sample`, {
        provider: 'elevenlabs',
        voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel
        apiKey: process.env.ELEVENLABS_API_KEY,
      });
      if (!data.bytes || data.bytes < 5000) {
        throw new Error('ElevenLabs preview returned very small audio');
      }
    });
  } else {
    skip('Voice Sample - ElevenLabs', 'ELEVENLABS_API_KEY not set');
  }

  if (hasMistral) {
    await testEndpoint('Voice Sample - Mistral (bellatrix)', async () => {
      await fetchJson(`${BASE_URL}/api/tts/voice-sample`, {
        provider: 'mistral',
        voiceId: 'bellatrix',
        apiKey: process.env.MISTRAL_API_KEY,
      });
    });
  } else {
    skip('Voice Sample - Mistral', 'MISTRAL_API_KEY not set');
  }

  if (hasGemini) {
    await testEndpoint('Voice Sample - Gemini (Kore)', async () => {
      await fetchJson(`${BASE_URL}/api/tts/voice-sample`, {
        provider: 'gemini',
        voiceId: 'Kore',
      });
    });
  } else {
    skip('Voice Sample - Gemini', 'GEMINI_API_KEY not set');
  }

  // ============================================
  // Gemini Multi-speaker
  // ============================================

  if (hasGemini) {
    await testEndpoint('Generate - Gemini Multi-speaker', async () => {
      const data = await fetchJson(`${BASE_URL}/api/tts/generate`, {
        provider: 'gemini-multi',
        text: 'Joe: Hello there!\nJane: Hi Joe, how are you doing today?',
        config: {
          speaker1: 'Joe',
          voice1: 'Kore',
          speaker2: 'Jane',
          voice2: 'Puck',
        },
      });
      if (!data.bytes || data.bytes < 3000) {
        throw new Error('Gemini multi-speaker returned very small audio');
      }
    });
  } else {
    skip('Generate - Gemini Multi-speaker', 'GEMINI_API_KEY not set');
  }

  // ============================================
  // Mistral Voices Listing (new proxy)
  // ============================================

  if (hasMistral) {
    await testEndpoint('Mistral Voices List', async () => {
      const data = await fetchJson(`${BASE_URL}/api/tts/mistral/voices`, {
        apiKey: process.env.MISTRAL_API_KEY,
      });
      if (!Array.isArray(data.voices)) {
        throw new Error('Expected voices array in response');
      }
    });
  } else {
    skip('Mistral Voices List', 'MISTRAL_API_KEY not set');
  }

  // ============================================
  // Regression: Basic Gemini single speaker still works
  // ============================================

  if (hasGemini) {
    await testEndpoint('Regression - Gemini Single Speaker', async () => {
      await fetchJson(`${BASE_URL}/api/tts/generate`, {
        provider: 'gemini',
        text: 'This is a quick regression test.',
        config: { emotion: 'default' },
      });
    });
  } else {
    skip('Regression - Gemini Single Speaker', 'GEMINI_API_KEY not set');
  }

  // ============================================
  // New Unified /synthesize endpoint (Phase 2)
  // ============================================

  if (hasGemini) {
    await testEndpoint('Unified Synthesize - Gemini (new endpoint)', async () => {
      await fetchJson(`${BASE_URL}/api/tts/synthesize`, {
        provider: 'gemini',
        text: 'Testing the new unified synthesize gateway.',
        options: { voice_id: 'Kore' },
      });
    });
  } else {
    skip('Unified Synthesize - Gemini', 'GEMINI_API_KEY not set');
  }

  if (hasMistral) {
    await testEndpoint('Unified Synthesize - Mistral (new endpoint)', async () => {
      await fetchJson(`${BASE_URL}/api/tts/synthesize`, {
        provider: 'mistral',
        text: 'Short test via the new library-style endpoint.',
        options: { voice_id: 'bellatrix' },
        apiKey: process.env.MISTRAL_API_KEY,
      });
    });
  } else {
    skip('Unified Synthesize - Mistral', 'MISTRAL_API_KEY not set');
  }

  if (hasOpenRouter) {
    await testEndpoint('Unified Synthesize - OpenRouter (new endpoint)', async () => {
      await fetchJson(`${BASE_URL}/api/tts/synthesize`, {
        provider: 'openrouter',
        text: 'Unified gateway test via OpenRouter.',
        options: { model: 'openai/gpt-4o-mini-tts-2025-12-15', voice: 'alloy' },
        apiKey: process.env.OPENROUTER_API_KEY,
      });
    });
  } else {
    skip('Unified Synthesize - OpenRouter', 'OPENROUTER_API_KEY not set');
  }

  if (hasXai) {
    await testEndpoint('Unified Synthesize - xAI Grok Voice (new endpoint)', async () => {
      await fetchJson(`${BASE_URL}/api/tts/synthesize`, {
        provider: 'xai',
        text: 'Unified gateway test via direct xAI.',
        options: { voice_id: 'ara', language: 'en' },
        apiKey: process.env.XAI_API_KEY,
      });
    });
  } else {
    skip('Unified Synthesize - xAI', 'XAI_API_KEY not set');
  }

  if (hasFish) {
    await testEndpoint('Unified Synthesize - Fish Audio (s2.1-pro-free)', async () => {
      await fetchJson(`${BASE_URL}/api/tts/synthesize`, {
        provider: 'fish',
        text: 'Unified gateway test via direct Fish Audio.',
        options: { model: 's2.1-pro-free' },
        apiKey: process.env.FISH_API_KEY,
      });
    });
  } else {
    skip('Unified Synthesize - Fish Audio', 'FISH_API_KEY not set');
  }

  // ============================================
  // OpenRouter (BYOK universal router)
  // ============================================

  if (hasOpenRouter) {
    await testEndpoint('Generate - OpenRouter (GPT-4o-mini TTS via router)', async () => {
      const data = await fetchJson(`${BASE_URL}/api/tts/generate`, {
        provider: 'openrouter',
        text: 'OpenRouter integration test. This sentence is synthesized through the unified BYOK proxy.',
        voiceId: 'alloy',
        apiKey: process.env.OPENROUTER_API_KEY,
        config: { model: 'openai/gpt-4o-mini-tts-2025-12-15' },
      });
      if (!data.bytes || data.bytes < 2000) {
        throw new Error('OpenRouter returned suspiciously small audio payload');
      }
    });

    await testEndpoint('Voice Sample - OpenRouter', async () => {
      await fetchJson(`${BASE_URL}/api/tts/voice-sample`, {
        provider: 'openrouter',
        voiceId: 'alloy',
        model: 'openai/gpt-4o-mini-tts-2025-12-15',
        apiKey: process.env.OPENROUTER_API_KEY,
      });
    });
  } else {
    skip('OpenRouter TTS + Voice Sample', 'OPENROUTER_API_KEY not set (add it to exercise the new BYOK provider)');
  }

  // ============================================
  // xAI Grok Voice (direct official API)
  // ============================================

  if (hasXai) {
    await testEndpoint('Generate - xAI Grok Voice (eve)', async () => {
      const data = await fetchJson(`${BASE_URL}/api/tts/generate`, {
        provider: 'xai',
        text: 'This is a direct xAI Grok Voice synthesis test. The quick brown fox jumps.',
        voiceId: 'eve',
        apiKey: process.env.XAI_API_KEY,
        config: { language: 'en' },
      });
      if (!data.bytes || data.bytes < 2000) {
        throw new Error('xAI returned suspiciously small audio');
      }
    });

    await testEndpoint('Voice Sample - xAI', async () => {
      await fetchJson(`${BASE_URL}/api/tts/voice-sample`, {
        provider: 'xai',
        voiceId: 'rex',
        language: 'en',
        apiKey: process.env.XAI_API_KEY,
      });
    });

    await testEndpoint('xAI Voices List (built-in + custom)', async () => {
      const data = await fetchJson(`${BASE_URL}/api/tts/xai/voices`, {
        apiKey: process.env.XAI_API_KEY,
      });
      if (!Array.isArray(data.voices)) {
        throw new Error('Expected voices array from xAI voices proxy');
      }
    });
  } else {
    skip('xAI Grok Voice + Voices List', 'XAI_API_KEY not set (highly recommended for testing the newest BYOK provider)');
  }

  // ============================================
  // Fish Audio (native TTS — free s2.1-pro-free model)
  // ============================================

  if (hasFish) {
    await testEndpoint('Generate - Fish Audio (s2.1-pro-free, default voice)', async () => {
      const data = await fetchJson(`${BASE_URL}/api/tts/generate`, {
        provider: 'fish',
        text: 'This is a Fish Audio synthesis test using the free s2.1 pro model.',
        voiceId: '', // empty = Fish's built-in default voice
        apiKey: process.env.FISH_API_KEY,
        config: { model: 's2.1-pro-free' },
      });
      if (!data.bytes || data.bytes < 2000) {
        throw new Error('Fish Audio returned suspiciously small audio');
      }
    });

    await testEndpoint('Voice Sample - Fish Audio (default voice)', async () => {
      await fetchJson(`${BASE_URL}/api/tts/voice-sample`, {
        provider: 'fish',
        voiceId: '', // default voice; the fish branch allows an empty voiceId
        apiKey: process.env.FISH_API_KEY,
        model: 's2.1-pro-free',
      });
    });

    await testEndpoint('Fish Audio Voices List (user models)', async () => {
      const data = await fetchJson(`${BASE_URL}/api/tts/fish/voices`, {
        apiKey: process.env.FISH_API_KEY,
      });
      if (!Array.isArray(data.voices)) {
        throw new Error('Expected voices array from Fish Audio voices proxy');
      }
    });

    await testEndpoint('Fish Audio Library Search (public voices, title query)', async () => {
      const data = await fetchJson(`${BASE_URL}/api/tts/fish/voices/search`, {
        apiKey: process.env.FISH_API_KEY,
        query: 'narrator',
      });
      if (!Array.isArray(data.voices)) {
        throw new Error('Expected voices array from Fish Audio library search');
      }
    });

    await testEndpoint('Fish Audio Library Search (model id lookup)', async () => {
      // A hex-looking query is resolved via GET /model/{id} first. We use a
      // well-known public voice id; if it 404s upstream the route falls back
      // to a title search, so we only assert the response shape.
      const data = await fetchJson(`${BASE_URL}/api/tts/fish/voices/search`, {
        apiKey: process.env.FISH_API_KEY,
        query: '77974fed34614080a505a797bb96357b',
      });
      if (!Array.isArray(data.voices)) {
        throw new Error('Expected voices array from Fish Audio model id lookup');
      }
    });

    // NOTE: Voice creation (/api/tts/fish/voices/create) requires an audio
    // sample upload and is async on Fish Audio's side, so it's intentionally
    // not exercised here to keep the test suite side-effect-free.
  } else {
    skip('Fish Audio Generate + Voices List', 'FISH_API_KEY not set (free model: s2.1-pro-free)');
  }

  // ============================================
  // LLM Script Enhancer (BYOK LLM providers)
  // ============================================

  const enhancerProviders = [
    { key: 'GEMINI_API_KEY', provider: 'gemini', label: 'Gemini' },
    { key: 'OPENAI_API_KEY', provider: 'openai', label: 'OpenAI' },
    { key: 'OPENROUTER_API_KEY', provider: 'openrouter', label: 'OpenRouter' },
    { key: 'XAI_API_KEY', provider: 'xai', label: 'xAI' },
  ];

  for (const ep of enhancerProviders) {
    const hasKey = !!process.env[ep.key];
    if (hasKey) {
      await testEndpoint(`LLM Enhancer - ${ep.label}`, async () => {
        const result = await fetchJson(`${BASE_URL}/api/llm/enhance-for-tts`, {
          provider: ep.provider,
          apiKey: process.env[ep.key],
          input: 'The quick brown fox jumps over the lazy dog. This is a test of the TTS script enhancer.',
        });
        if (!result.enhanced || result.enhanced.length < 20) {
          throw new Error(`${ep.label} enhancer returned empty or too-short result`);
        }
      });
    } else {
      skip(`LLM Enhancer - ${ep.label}`, `${ep.key} not set`);
    }
  }

  skip('Unified Synthesize - OmniVoice (HF Space)', 'requires real ref audio + HF_TOKEN');

  // ============================================
  // Summary
  // ============================================

  console.log('\n' + '='.repeat(50));
  console.log('Test Summary');
  console.log('='.repeat(50));

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const skipped = results.filter(r => r.status === 'SKIPPED').length;

  console.log(`Passed:  ${passed}`);
  console.log(`Failed:  ${failed}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Total:   ${results.length}`);

  if (failed > 0) {
    console.log('\n❌ Some tests failed. Please review the output above.');
    process.exit(1);
  } else {
    console.log('\n✅ All runnable tests passed!');
  }
}

main().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
