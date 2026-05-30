/**
 * LLM Script Enhancer
 * 
 * Takes raw text or a URL and rewrites it into high-quality, TTS-friendly content
 * using a strong system prompt (designed as a reusable "skill").
 */

import { GoogleGenAI } from '@google/genai';
import * as cheerio from 'cheerio';

export interface EnhanceRequest {
  provider: 'openai' | 'gemini' | 'openrouter' | 'xai' | 'cerebras';
  apiKey: string;
  input: string;           // raw text or URL
  model?: string;
}

export interface EnhanceResult {
  original: string;
  enhanced: string;
  wasUrl: boolean;
  provider: string;
  model: string;
}

/**
 * High-quality system prompt / "skill" for turning any content into excellent TTS script.
 * 
 * This is the core instruction set. Treat this like a reusable skill definition.
 */
const TTS_ENHANCER_SYSTEM_PROMPT = `You are an expert TTS script editor and speech writer.

Your job is to take any raw text, article, notes, or web content and transform it into a **highly optimized script for text-to-speech** (neural voices like ElevenLabs, Gemini, Mistral, etc.).

Follow these rules strictly:

1. **Natural speech flow** — Rewrite sentences so they sound good when spoken aloud. Break long sentences. Use shorter, clearer phrasing.
2. **Punctuation for prosody** — Use ellipses (...), em-dashes (—), and paragraph breaks to create natural pauses and rhythm.
3. **Remove visual-only elements** — Strip out URLs, markdown formatting, tables, image captions, footers, ads, navigation, etc. Replace them with spoken equivalents when useful.
4. **Handle links intelligently** — If the input contains a URL or is a URL, summarize the key content in natural spoken language instead of reading the raw link.
5. **Expand abbreviations** — Turn "e.g.", "i.e.", "vs.", "Dr.", numbers, dates, etc. into speakable forms when it improves clarity.
6. **Add light performance direction** (only when it genuinely helps):
   - Use [pause], [short pause], or ellipses for breathing room.
   - Occasionally use light tags like [emphasis] or [slowly] if the content benefits from it.
7. **Preserve meaning and voice** — Keep the original intent, tone, and information accurate. Do not add new opinions or facts.
8. **Structure for listening** — Use short paragraphs. Add subtle transitions ("Next...", "Moving on...", "Here's the key point...") only when they improve flow.
9. **Output only the enhanced script** — Do not include explanations, meta commentary, or the original text unless the user specifically asks for comparison.

Always aim for text that sounds natural, engaging, and professional when read by a high-quality neural voice.`;

/**
 * Fetches a URL and extracts the main readable text content.
 */
async function fetchAndExtractText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TTS-Script-Enhancer/1.0)',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch URL: ${res.status}`);
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove noise
    $('script, style, nav, footer, header, aside, .ad, .ads, .cookie, .newsletter').remove();

    // Try to get the main content
    let mainText = $('main').text() || $('article').text() || $('body').text();

    // Clean up whitespace
    mainText = mainText
      .replace(/\s+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // Limit length to avoid huge prompts
    if (mainText.length > 12000) {
      mainText = mainText.slice(0, 12000) + '\n\n[Content truncated for length]';
    }

    return mainText || 'No readable content could be extracted from the page.';
  } catch (err: any) {
    throw new Error(`URL fetch failed: ${err.message}`);
  }
}

/**
 * Main enhancement function.
 */
export async function enhanceTextForTTS(req: EnhanceRequest): Promise<EnhanceResult> {
  const { provider, apiKey, input, model } = req;

  // Note: The enhancer follows the same strict BYOK policy as TTS synthesis.
  // It receives the apiKey directly from the client and never reads server env vars
  // for any provider. This keeps the security model consistent.

  if (!input?.trim()) {
    throw new Error('Input text or URL is required');
  }

  let content = input.trim();
  let wasUrl = false;

  // Detect if input is a URL
  if (/^https?:\/\//i.test(content)) {
    wasUrl = true;
    content = await fetchAndExtractText(content);
  }

  let enhanced = '';

  if (provider === 'gemini') {
    const gemini = new GoogleGenAI({ apiKey });
    const response = await gemini.models.generateContent({
      model: model || 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: [{ text: TTS_ENHANCER_SYSTEM_PROMPT }] },
        { role: 'user', parts: [{ text: `Input:\n\n${content}` }] },
      ],
    });

    enhanced = response.text?.trim() || '';
  } 
  else if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: TTS_ENHANCER_SYSTEM_PROMPT },
          { role: 'user', content: content },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI error: ${err}`);
    }

    const data = await res.json();
    enhanced = data.choices?.[0]?.message?.content?.trim() || '';
  } 
  else if (provider === 'openrouter') {
    // OpenRouter is OpenAI-compatible for chat completions.
    // We send recommended attribution headers so the request shows up nicely in the user's OpenRouter dashboard.
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'TTS Voice Studio',
      },
      body: JSON.stringify({
        model: model || 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: TTS_ENHANCER_SYSTEM_PROMPT },
          { role: 'user', content: content },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenRouter error: ${err}`);
    }

    const data = await res.json();
    enhanced = data.choices?.[0]?.message?.content?.trim() || '';
  } 
  else if (provider === 'xai') {
    // xAI chat completions are OpenAI-compatible.
    // Supports both manual key and OAuth access token (passed in as apiKey by the caller).
    const res = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'grok-3-latest',
        messages: [
          { role: 'system', content: TTS_ENHANCER_SYSTEM_PROMPT },
          { role: 'user', content: content },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`xAI error: ${err}`);
    }

    const data = await res.json();
    enhanced = data.choices?.[0]?.message?.content?.trim() || '';
  } 
  else if (provider === 'cerebras') {
    // Cerebras is OpenAI-compatible and extremely fast for large models.
    // Excellent for the enhancer use case.
    const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b',
        messages: [
          { role: 'system', content: TTS_ENHANCER_SYSTEM_PROMPT },
          { role: 'user', content: content },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Cerebras error: ${err}`);
    }

    const data = await res.json();
    enhanced = data.choices?.[0]?.message?.content?.trim() || '';
  } 
  else {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  if (!enhanced) {
    throw new Error('LLM returned empty response');
  }

  return {
    original: input,
    enhanced,
    wasUrl,
    provider,
    model: model || (provider === 'gemini' ? 'gemini-2.5-flash' : provider === 'openrouter' ? 'openai/gpt-4o-mini' : provider === 'xai' ? 'grok-3-latest' : provider === 'cerebras' ? 'llama-3.3-70b' : 'gpt-4o-mini'),
  };
}
