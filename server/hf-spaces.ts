/**
 * HuggingFace Spaces Gradio Client integrations for OmniVoice and VoxCPM.
 *
 * This is the corrected adapter that matches the working implementation in
 * the reference tool (d:\code\image_video_scripts\tts) + the live Gradio schemas.
 *
 * Key lessons from the reference + live inspection:
 * - Correct spaces: k2-fsa/OmniVoice and openbmb/VoxCPM-Demo
 * - Must use the named endpoints: /_clone_fn and /generate (NOT /predict)
 * - Argument order is critical and must match the live Gradio function signature
 * - Reference audio must be passed as a Blob (JS client) or file path (Python client)
 * - HF_TOKEN is only needed for private/gated spaces
 */

import { client } from '@gradio/client';

/**
 * Convert base64 (with or without data: prefix) into a Blob that @gradio/client can upload.
 */
function base64ToBlob(base64: string, mimeType = 'audio/wav'): Blob {
  const clean = base64.includes(',') ? base64.split(',')[1] : base64;
  const buffer = Buffer.from(clean, 'base64');
  return new Blob([buffer], { type: mimeType });
}

export async function synthesizeOmniVoice(
  text: string,
  options: {
    space?: string;
    refAudio: string;           // base64 (preferred from browser) or could be extended to support path
    refText?: string;
    instruct?: string;
    language?: string;
    steps?: number;
    guidance?: number;
    denoise?: boolean;
    speed?: number;
    duration?: number;
    preprocess?: boolean;
    postprocess?: boolean;
  },
  hfToken?: string
): Promise<Buffer> {
  // Correct live space (the original hardcoded name was dead)
  const spaceId = options.space || 'k2-fsa/OmniVoice';
  console.log(`[OmniVoice] Connecting to ${spaceId}...`);

  try {
    const app = await client(
      spaceId,
      hfToken ? { hf_token: hfToken as `hf_${string}` } : undefined
    );

    const refBlob = base64ToBlob(options.refAudio);

    // Exact order required by the live /_clone_fn endpoint (verified via view_api + working Python reference)
    const result = await app.predict('/_clone_fn', [
      text,
      options.language || 'Auto',
      refBlob,                           // ref_aud
      options.refText || '',
      options.instruct || '',
      options.steps ?? 32,
      options.guidance ?? 2.0,
      options.denoise ?? true,
      options.speed ?? 1.0,
      options.duration ?? null,
      options.preprocess ?? true,
      options.postprocess ?? true,
    ]);

    // Result shape is typically { data: [ audioOutput, statusString ] }
    const audioOutput = result.data?.[0];

    if (audioOutput?.url) {
      const response = await fetch(audioOutput.url);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    // Some responses may return the audio directly as a Blob-like object
    if (audioOutput instanceof Blob) {
      const arrayBuffer = await audioOutput.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    throw new Error('No usable audio data returned from OmniVoice space.');
  } catch (error) {
    console.error('[OmniVoice] synthesis failed:', error);
    throw new Error(
      `OmniVoice Space error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function synthesizeVoxCPM(
  text: string,
  options: {
    refAudio?: string;                    // Now optional - the space supports generation without it
    control?: string;
    usePromptText?: boolean;
    promptText?: string;
    cfg?: number;
    normalizeText?: boolean;
    denoiseRef?: boolean;
  },
  hfToken?: string
): Promise<Buffer> {
  const spaceId = 'openbmb/VoxCPM-Demo'; // correct live demo space
  console.log(`[VoxCPM] Connecting to ${spaceId}...`);

  try {
    const app = await client(
      spaceId,
      hfToken ? { hf_token: hfToken as `hf_${string}` } : undefined
    );

    // Reference audio is optional on this space.
    // When not provided, pass null so the model uses its default behavior.
    let refInput: Blob | null = null;
    if (options.refAudio) {
      refInput = base64ToBlob(options.refAudio);
    }

    // Exact order for /generate on the live space.
    // Passing null for reference_wav_path_input is valid upstream.
    const result = await app.predict('/generate', [
      text,
      options.control || '',
      refInput,                             // reference_wav_path_input (can be null)
      options.usePromptText ?? false,
      options.promptText || '',
      options.cfg ?? 2.0,
      options.normalizeText ?? false,
      options.denoiseRef ?? false,
    ]);

    const audioOutput = result.data?.[0];

    if (audioOutput?.url) {
      const response = await fetch(audioOutput.url);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    if (audioOutput instanceof Blob) {
      const arrayBuffer = await audioOutput.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    throw new Error('No usable audio data returned from VoxCPM space.');
  } catch (error) {
    console.error('[VoxCPM] synthesis failed:', error);
    throw new Error(
      `VoxCPM Space error: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
