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

  // HF Spaces (these will only work if the server has HF_TOKEN + @gradio/client installed)
  await testEndpoint('Unified Synthesize - OmniVoice (HF Space - may fail without setup)', async () => {
    // This is a "surprise" test — it will likely skip or fail until ref audio + HF_TOKEN is provided
    throw new Error('HF Space test skipped in automated run (requires real ref audio + HF_TOKEN)');
  });

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
