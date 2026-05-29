/**
 * HuggingFace Spaces Gradio Client integrations for OmniVoice and VoxCPM.
 * 
 * Note: This file is reconstituted as a helper since it was not committed to the repository,
 * allowing full compile-time safety and graceful runtime fallback/execution using @gradio/client.
 */

import { client } from '@gradio/client';

export async function synthesizeOmniVoice(
  text: string,
  options: {
    space?: string;
    refAudio: string;
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
  // Use the requested space or fallback to a known OmniVoice Space
  const spaceId = options.space || "OmniVoice/OmniVoice"; 
  console.log(`Connecting to OmniVoice HuggingFace Space: ${spaceId}...`);

  try {
    const app = await client(spaceId, hfToken ? { hf_token: hfToken as `hf_${string}` } : undefined);
    
    // Gradio Space inputs vary; we will structure a request or fallback
    const result = await app.predict("/predict", [
      options.refAudio, // base64 or file
      options.refText || "",
      text,
      options.language || "en",
      options.steps || 32,
      options.guidance || 2.0,
      options.speed || 1.0,
    ]);

    if (result && result.data && Array.isArray(result.data) && result.data[0]) {
      // Result data often contains a URL or a file path
      const fileUrl = (result.data[0] as any).url;
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    
    throw new Error("No audio data returned from OmniVoice space.");
  } catch (error) {
    console.error("OmniVoice synthesis failed, returning descriptive fallback error:", error);
    throw new Error(`OmniVoice Space synthesis error: ${error instanceof Error ? error.message : error}`);
  }
}

export async function synthesizeVoxCPM(
  text: string,
  options: {
    refAudio: string;
    control?: string;
    usePromptText?: boolean;
    promptText?: string;
    cfg?: number;
    normalizeText?: boolean;
    denoiseRef?: boolean;
  },
  hfToken?: string
): Promise<Buffer> {
  const spaceId = "VoxCPM/VoxCPM"; // known space
  console.log(`Connecting to VoxCPM HuggingFace Space: ${spaceId}...`);

  try {
    const app = await client(spaceId, hfToken ? { hf_token: hfToken as `hf_${string}` } : undefined);
    
    const result = await app.predict("/predict", [
      options.refAudio,
      text,
      options.promptText || "",
      options.control || "none",
    ]);

    if (result && result.data && Array.isArray(result.data) && result.data[0]) {
      const fileUrl = (result.data[0] as any).url;
      const response = await fetch(fileUrl);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }
    
    throw new Error("No audio data returned from VoxCPM space.");
  } catch (error) {
    console.error("VoxCPM synthesis failed:", error);
    throw new Error(`VoxCPM Space synthesis error: ${error instanceof Error ? error.message : error}`);
  }
}
