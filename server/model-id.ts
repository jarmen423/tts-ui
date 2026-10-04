/**
 * Resolve the TTS model id the caller actually asked for.
 *
 * Rule: a typed / request-supplied model ALWAYS wins. Hardcoded ids are only
 * used when the client sent nothing, so a new provider model never requires a
 * server change — the UI free-text field is the source of truth.
 *
 * Lookups (first non-empty string wins):
 *   1. body.model          — voice-sample and some library clients
 *   2. config.model        — App.tsx /generate payload
 *   3. options.model       — unified /synthesize library-style payload
 */

export function firstNonEmpty(...values: unknown[]): string | undefined {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return undefined;
}

export function pickRequestedModel(body: any, fallback?: string): string {
  const config = body?.config && typeof body.config === 'object' ? body.config : {};
  const options = body?.options && typeof body.options === 'object' ? body.options : {};
  return (
    firstNonEmpty(body?.model, config.model, options.model, fallback) || ''
  );
}

/**
 * Merge UI `config` with library-style `options` so /synthesize does not ignore
 * fields the frontend actually sends (speakers, model, space, etc.).
 * Explicit `options.*` still wins over `config.*` for the Python-library shape.
 */
export function mergeTtsOptions(body: any): Record<string, any> {
  const config = body?.config && typeof body.config === 'object' ? body.config : {};
  const options = body?.options && typeof body.options === 'object' ? body.options : {};
  return { ...config, ...options };
}
