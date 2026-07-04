/**
 * NVIDIA Magpie TTS via integrate.api.nvidia.com OpenAI-compatible speech API.
 */
import {
  NVIDIA_MAGPIE_TTS_MODEL,
  NVIDIA_MAGPIE_VOICES,
  NVIDIA_ZEROSHOT_TTS_MODEL,
  NVIDIA_ZEROSHOT_VOICES,
  type NvidiaMagpieVoice,
} from '../nvidia-magpie-catalog';

export {
  NVIDIA_MAGPIE_TTS_MODEL,
  NVIDIA_MAGPIE_VOICES,
  NVIDIA_ZEROSHOT_TTS_MODEL,
  NVIDIA_ZEROSHOT_VOICES,
  type NvidiaMagpieVoice,
};

export type NvidiaTtsSynthesizeParams = {
  apiKey: string;
  text: string;
  voice?: string;
  model?: string;
  responseFormat?: 'mp3' | 'wav';
  /** Base64 audio (WAV/MP3) for Magpie zeroshot voice cloning */
  referenceAudioBase64?: string;
  languageCode?: string;
  zeroShotQuality?: number;
};

export async function synthesizeNvidiaMagpieTts(
  params: NvidiaTtsSynthesizeParams,
): Promise<{ buffer: Buffer; contentType: string }> {
  const model = params.model || NVIDIA_MAGPIE_TTS_MODEL;
  const isZeroshot = model.includes('zeroshot');
  const voice =
    params.voice ||
    (isZeroshot ? 'Magpie-ZeroShot.Female-1' : NVIDIA_MAGPIE_VOICES[0].id);

  const body: Record<string, unknown> = {
    model,
    input: params.text,
    voice,
    response_format: params.responseFormat || 'mp3',
  };

  if (params.referenceAudioBase64) {
    // OpenAI-style extension used by NVIDIA speech gateway (NemoClaw #1520)
    body.reference_audio = params.referenceAudioBase64;
    if (params.languageCode) body.language = params.languageCode;
    if (params.zeroShotQuality != null) body.zero_shot_quality = params.zeroShotQuality;
  }

  const response = await fetch('https://integrate.api.nvidia.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NVIDIA Magpie TTS error (${response.status}): ${errText}`);
  }

  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

/** Multipart fallback for zeroshot when JSON reference_audio is rejected */
export async function synthesizeNvidiaZeroshotMultipart(params: {
  apiKey: string;
  text: string;
  audioBuffer: Buffer;
  filename: string;
  languageCode?: string;
  quality?: number;
}): Promise<{ buffer: Buffer; contentType: string }> {
  const form = new FormData();
  form.append('model', NVIDIA_ZEROSHOT_TTS_MODEL);
  form.append('language', params.languageCode || 'en-US');
  form.append('text', params.text);
  form.append(
    'audio_prompt',
    new Blob([params.audioBuffer]),
    params.filename || 'prompt.wav',
  );
  if (params.quality != null) form.append('zero_shot_quality', String(params.quality));

  const response = await fetch('https://integrate.api.nvidia.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: form,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`NVIDIA zeroshot TTS error (${response.status}): ${errText}`);
  }

  const contentType = response.headers.get('content-type') || 'audio/wav';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

function stripAudioDataUrl(dataUrl: string): string {
  return dataUrl.replace(/^data:audio\/[^;]+;base64,/, '');
}

export type NvidiaTtsJobOptions = {
  apiKey: string;
  text: string;
  voice?: string;
  model?: string;
  refAudio?: string;
  nvidiaMode?: string;
  languageCode?: string;
  zeroShotQuality?: number;
};

/** Single entry for generate / synthesize / voice-sample routes */
export async function runNvidiaTtsJob(opts: NvidiaTtsJobOptions) {
  const clone = opts.nvidiaMode === 'zeroshot_clone' && opts.refAudio;

  if (clone) {
    const b64 = stripAudioDataUrl(opts.refAudio!);
    const audioBuffer = Buffer.from(b64, 'base64');
    try {
      return await synthesizeNvidiaMagpieTts({
        apiKey: opts.apiKey,
        text: opts.text,
        model: NVIDIA_ZEROSHOT_TTS_MODEL,
        referenceAudioBase64: b64,
        languageCode: opts.languageCode || 'en-US',
        zeroShotQuality: opts.zeroShotQuality,
      });
    } catch (jsonErr) {
      try {
        return await synthesizeNvidiaZeroshotMultipart({
          apiKey: opts.apiKey,
          text: opts.text,
          audioBuffer,
          filename: 'prompt.wav',
          languageCode: opts.languageCode,
          quality: opts.zeroShotQuality,
        });
      } catch {
        throw jsonErr;
      }
    }
  }

  const model =
    opts.model ||
    (opts.nvidiaMode === 'zeroshot_preset' ? NVIDIA_ZEROSHOT_TTS_MODEL : NVIDIA_MAGPIE_TTS_MODEL);

  return synthesizeNvidiaMagpieTts({
    apiKey: opts.apiKey,
    text: opts.text,
    voice: opts.voice,
    model,
  });
}