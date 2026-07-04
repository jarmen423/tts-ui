/**
 * Fetch chat-capable model IDs for the LLM Script Enhancer, proxied server-side (CORS + BYOK).
 */

export type EnhancerProvider =
  | 'gemini'
  | 'openai'
  | 'openrouter'
  | 'xai'
  | 'cerebras'
  | 'nvidia';

const MAX_MODELS = 250;

function sortAndCap(ids: string[]): string[] {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  unique.sort((a, b) => a.localeCompare(b));
  return unique.slice(0, MAX_MODELS);
}

async function fetchJson(url: string, headers: Record<string, string> = {}) {
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text.slice(0, 500) || `HTTP ${res.status}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON from models endpoint');
  }
}

export async function listEnhancerModels(
  provider: EnhancerProvider,
  apiKey: string
): Promise<{ models: string[]; defaultModel: string }> {
  if (!apiKey?.trim()) {
    throw new Error('API key is required to list models');
  }

  const key = apiKey.trim();

  if (provider === 'openai') {
    const data = await fetchJson('https://api.openai.com/v1/models', {
      Authorization: `Bearer ${key}`,
    });
    const models = sortAndCap(
      (data.data || [])
        .map((m: { id?: string }) => m.id || '')
        .filter((id: string) => /^(gpt-|o[0-9]|chatgpt)/i.test(id))
    );
    return { models, defaultModel: 'gpt-4o-mini' };
  }

  if (provider === 'openrouter') {
    const data = await fetchJson('https://openrouter.ai/api/v1/models', {
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'TTS Voice Studio',
    });
    const models = sortAndCap(
      (data.data || [])
        .filter((m: { architecture?: { output_modalities?: string[] } }) => {
          const out = m.architecture?.output_modalities || [];
          return out.includes('text');
        })
        .map((m: { id?: string }) => m.id || '')
    );
    return { models, defaultModel: 'openai/gpt-4o-mini' };
  }

  if (provider === 'xai') {
    const data = await fetchJson('https://api.x.ai/v1/models', {
      Authorization: `Bearer ${key}`,
    });
    const models = sortAndCap(
      (data.data || []).map((m: { id?: string }) => m.id || '')
    );
    return { models, defaultModel: 'grok-3-latest' };
  }

  if (provider === 'cerebras') {
    const data = await fetchJson('https://api.cerebras.ai/v1/models', {
      Authorization: `Bearer ${key}`,
    });
    const models = sortAndCap(
      (data.data || []).map((m: { id?: string }) => m.id || '')
    );
    return { models, defaultModel: 'llama-3.3-70b' };
  }

  if (provider === 'nvidia') {
    const data = await fetchJson('https://integrate.api.nvidia.com/v1/models', {
      Authorization: `Bearer ${key}`,
    });
    // integrate.api lists speech/ASR/TTS next to chat LLMs — keep enhancer-safe IDs only.
    const blockSpeechAsr = /parakeet|seamless|asr|whisper|embed|embedding|rerank|tts|speech|magpie|fastpitch|hifigan|riva-|nemo-asr|voicechat/i;
    const models = sortAndCap(
      (data.data || [])
        .map((m: { id?: string }) => m.id || '')
        .filter((id: string) => id && !blockSpeechAsr.test(id))
    );
    return { models, defaultModel: 'meta/llama-3.1-70b-instruct' };
  }

  if (provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=100`;
    const data = await fetchJson(url);
    const models = sortAndCap(
      (data.models || [])
        .filter((m: { name?: string; supportedGenerationMethods?: string[] }) => {
          const methods = m.supportedGenerationMethods || [];
          const name = m.name || '';
          return (
            methods.includes('generateContent') &&
            /gemini/i.test(name) &&
            !/embedding|tts|image|vision-only/i.test(name)
          );
        })
        .map((m: { name?: string }) => (m.name || '').replace(/^models\//, ''))
    );
    return { models, defaultModel: 'gemini-2.5-flash' };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}