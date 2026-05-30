/**
 * ONE-OFF DIAGNOSTIC SCRIPT
 * 
 * Purpose: Minimal validation that the CORRECT Gradio client calls
 * work against the live OmniVoice and VoxCPM spaces using the JS
 * @gradio/client (exactly as needed for tts-ui).
 * 
 * This is a temporary test file created during systematic debugging (Phase 3).
 * It should NOT be treated as production code.
 * 
 * Run with:
 *   npx tsx scripts/test-hf-gradio-direct.ts
 * 
 * Expected outcome: Both calls succeed and produce real audio files.
 */

import { client } from '@gradio/client';
import fs from 'fs';
import path from 'path';

const REF_AUDIO_PATH = path.join(process.cwd(), 'tmp_test_ref.wav');

async function fetchAsBlob(filePath: string): Promise<Blob> {
  const buffer = fs.readFileSync(filePath);
  return new Blob([buffer], { type: 'audio/wav' });
}

async function testOmniVoice() {
  console.log('\n=== Testing OmniVoice (k2-fsa/OmniVoice) ===');
  const start = Date.now();

  try {
    const app = await client('k2-fsa/OmniVoice');
    const refBlob = await fetchAsBlob(REF_AUDIO_PATH);

    // Exact order verified from live schema + working Python reference
    const result = await app.predict('/_clone_fn', [
      'Hello world. This is a minimal diagnostic test of the OmniVoice integration.',
      'Auto',           // language
      refBlob,          // ref_aud (reference audio)
      '',               // ref_txt
      '',               // instruct
      8,                // ns / steps (low for fast test)
      1.5,              // gs / guidance
      true,             // dn / denoise
      1.0,              // sp / speed
      null,             // du / duration
      true,             // pp / preprocess
      true,             // po / postprocess
    ]);

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✓ Connected and predicted successfully in ${duration}s`);

    // Result shape: { data: [ audioOutput, statusString ] }
    const audioOutput = result.data?.[0];

    if (audioOutput && audioOutput.url) {
      const audioResponse = await fetch(audioOutput.url);
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      const outPath = path.join(process.cwd(), 'tmp_omnivoice_out.wav');
      fs.writeFileSync(outPath, audioBuffer);
      console.log(`✓ Saved output to: ${outPath} (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
      return true;
    } else {
      console.log('Result data:', JSON.stringify(result.data, null, 2).slice(0, 500));
      throw new Error('Unexpected result shape from OmniVoice');
    }
  } catch (err: any) {
    console.error('✗ OmniVoice test FAILED:', err?.message || err);
    return false;
  }
}

async function testVoxCPM() {
  console.log('\n=== Testing VoxCPM (openbmb/VoxCPM-Demo) ===');
  const start = Date.now();

  try {
    const app = await client('openbmb/VoxCPM-Demo');
    const refBlob = await fetchAsBlob(REF_AUDIO_PATH);

    // Exact order from live schema for /generate
    const result = await app.predict('/generate', [
      'Hello world. This is a minimal diagnostic test of the VoxCPM integration from the TTS UI project.',
      '',           // control_instruction
      refBlob,      // reference_wav_path_input
      false,        // use_prompt_text
      '',           // prompt_text_input
      2.0,          // cfg_value_input
      false,        // do_normalize
      false,        // denoise
    ]);

    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`✓ Connected and predicted successfully in ${duration}s`);

    const audioOutput = result.data?.[0];

    if (audioOutput && audioOutput.url) {
      const audioResponse = await fetch(audioOutput.url);
      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      const outPath = path.join(process.cwd(), 'tmp_voxcpm_out.wav');
      fs.writeFileSync(outPath, audioBuffer);
      console.log(`✓ Saved output to: ${outPath} (${(audioBuffer.length / 1024).toFixed(1)} KB)`);
      return true;
    } else {
      console.log('Result data sample:', JSON.stringify(result.data?.[0] || result.data, null, 2).slice(0, 400));
      throw new Error('Unexpected result shape from VoxCPM');
    }
  } catch (err: any) {
    console.error('✗ VoxCPM test FAILED:', err?.message || err);
    return false;
  }
}

async function main() {
  console.log('HF Gradio Direct Diagnostic (temporary Phase 3 validation script)');
  console.log('Reference audio:', REF_AUDIO_PATH, `(${fs.statSync(REF_AUDIO_PATH).size} bytes)`);

  if (!fs.existsSync(REF_AUDIO_PATH)) {
    console.error('Missing reference audio file. Run the download step first.');
    process.exit(1);
  }

  const omniOk = await testOmniVoice();
  const voxOk = await testVoxCPM();

  console.log('\n=== SUMMARY ===');
  console.log(`OmniVoice: ${omniOk ? 'PASS' : 'FAIL'}`);
  console.log(`VoxCPM:    ${voxOk ? 'PASS' : 'FAIL'}`);

  if (omniOk && voxOk) {
    console.log('\n✓ Both spaces are reachable and the correct call pattern works with @gradio/client.');
    console.log('  This confirms the root cause was in the tts-ui port (wrong IDs, wrong endpoints, wrong arg order, and missing ref audio wiring).');
  } else {
    console.log('\nSome tests failed. See logs above.');
  }

  // Optional cleanup of temp outputs (keep them for manual inspection)
  // fs.unlinkSync('tmp_omnivoice_out.wav'); etc.
}

main().catch((e) => {
  console.error('Fatal error in diagnostic:', e);
  process.exit(1);
});
