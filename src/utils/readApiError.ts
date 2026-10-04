/**
 * Safe parsing of fetch() error bodies.
 *
 * Synthesis (and several other /api/* calls) used `response.json()` on failure.
 * When a proxy, SPA fallback, Express default 404, or upstream gateway returns
 * an HTML document (`<!DOCTYPE html>...`), JSON.parse throws:
 *   Unexpected token '<', "<!DOCTYPE "... is not valid JSON
 * and that SyntaxError is what the "Synthesis Pipeline Notice" HUD showed.
 *
 * Always read as text first. Prefer a JSON `error`/`message` field when present;
 * otherwise surface HTTP status plus a short snippet so the user can actually
 * debug (login wall, 404 page, Cloudflare challenge, etc.).
 */

export function describeNonJsonBody(response: Response, raw: string): string {
  const status = `${response.status} ${response.statusText || ''}`.trim();
  const trimmed = (raw || '').trim();
  if (!trimmed) {
    return `Request failed (HTTP ${status}, empty body).`;
  }

  const looksHtml = /^\s*</.test(trimmed) || /<!DOCTYPE/i.test(trimmed);
  const title = trimmed.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const pre = trimmed.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1]?.trim();
  const snippet = (title || pre || trimmed).replace(/\s+/g, ' ').slice(0, 220);

  if (looksHtml) {
    return `Server returned HTML instead of JSON (HTTP ${status}). ${snippet}`;
  }
  return `Request failed (HTTP ${status}): ${snippet}`;
}

function messageFromJson(parsed: any): string | undefined {
  if (!parsed || typeof parsed !== 'object') return undefined;
  const err = parsed.error ?? parsed.message ?? parsed.detail ?? parsed.msg;
  if (typeof err === 'string' && err.trim()) return err.trim();
  if (err && typeof err === 'object') {
    const nested = err.message || err.status || err.code;
    if (typeof nested === 'string' && nested.trim()) return nested.trim();
    try {
      return JSON.stringify(err);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** Read a failed fetch response and return a user-facing error string. Never throws on parse. */
export async function readApiError(response: Response, fallback = 'Request failed'): Promise<string> {
  let raw = '';
  try {
    raw = await response.text();
  } catch {
    return `${fallback} (HTTP ${response.status} ${response.statusText || ''}`.trim() + ')';
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return `${fallback} (HTTP ${response.status} ${response.statusText || ''}`.trim() + ', empty body)';
  }

  try {
    const parsed = JSON.parse(trimmed);
    return messageFromJson(parsed) || `${fallback} (HTTP ${response.status})`;
  } catch {
    return describeNonJsonBody(response, raw);
  }
}

/** Parse a JSON body; if the payload is HTML/plain text, throw a readable error. */
export async function readJsonBody(response: Response): Promise<any> {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(describeNonJsonBody(response, raw));
  }
}
