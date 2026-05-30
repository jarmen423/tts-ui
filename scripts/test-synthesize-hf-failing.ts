/**
 * FAILING TEST CASE — Phase 4 of systematic debugging
 *
 * This script reproduces the CURRENT broken state for omnivoice / voxcpm
 * by calling the real /api/tts/synthesize endpoint exactly the way the
 * frontend currently does it.
 *
 * Run (with the dev server running on :3456):
 *   npx tsx scripts/test-synthesize-hf-failing.ts
 *
 * Expected today: 400 "requires ref_audio (base64)" for both providers.
 * Goal: After the fix, this test (or an improved version) should succeed.
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3456';
const REF_PATH = path.join(process.cwd(), 'tmp_test_ref.wav');

function fileToBase64(filePath: string): string {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
}

async function testProvider(provider: 'omnivoice' | 'voxcpm', hfToken: string) {
  console.log(`\n=== Testing ${provider} via /api/tts/synthesize (current broken client shape) ===`);

  if (!fs.existsSync(REF_PATH)) {
    console.error(`Missing reference audio at ${REF_PATH}`);
    return false;
  }

  const refBase64 = fileToBase64(REF_PATH);
  console.log(`Reference audio size: ${(refBase64.length / 1024 / 1024).toFixed(2)} MB (base64)`);

  // This is the EXACT shape the frontend currently sends for these providers
  // (see App.tsx handleSynthesize around line 875-918)
  const payload = {
    provider,
    text: "Hello world. This is a failing reproduction test for the HF Gradio providers.",
    voiceId: "default",           // ignored for HF providers
    apiKey: undefined,
    hfToken,
    config: {},                   // <-- currently empty. This is part of the bug.
  };

  try {
    const res = await fetch(`${BASE_URL}/api/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.log(`✗ Got expected failure: ${res.status} — ${data.error || JSON.stringify(data)}`);
      return false;
    }

    console.log(`✓ Unexpected success (size: ${data.size || 'unknown'})`);
    return true;
  } catch (err: any) {
    console.error(`Network / server error: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log('HF Synthesize Failing Reproduction Test');
  console.log('Make sure the dev server is running (npm run dev) on port 3456\n');

  const hfToken = process.env.HF_TOKEN || ''; // optional for public spaces

  const omniResult = await testProvider('omnivoice', hfToken);
  const voxResult = await testProvider('voxcpm', hfToken);

  console.log('\n=== RESULTS ===');
  console.log(`omnivoice (current broken path): ${omniResult ? 'PASS (unexpected)' : 'FAIL (as expected today)'}`);
  console.log(`voxcpm   (current broken path): ${voxResult ? 'PASS (unexpected)' : 'FAIL (as expected today)'}`);

  if (!omniResult && !voxResult) {
    console.log('\nThis is the expected failing test case. Now implement the fix.');
  }
}

main();
