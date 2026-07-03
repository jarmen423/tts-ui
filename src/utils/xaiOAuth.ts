/**
 * xaiOAuth.ts
 *
 * Client-side OAuth 2.0 Authorization Code + PKCE support for xAI (Grok).
 *
 * This module exists so users of TTS Voice Studio can connect their xAI account
 * (SuperGrok or linked X Premium+) instead of pasting a raw API key. When
 * connected, all xAI TTS synthesis, voice listing, samples, and the LLM enhancer
 * are billed against the user's own subscription quota — not against a separate
 * developer API key.
 *
 * WHY THIS EXISTS (architectural context)
 * --------------------------------------
 * The entire application follows a strict "Bring Your Own Key" (BYOK) model.
 * Every provider (including Gemini) requires the user to supply credentials.
 * xAI's new OAuth flow (launched ~May 2026) is a first-class exception that
 * still respects the same principle: the user authenticates, and usage is
 * attributed to *their* account/subscription.
 *
 * We deliberately perform the entire OAuth dance (PKCE, token exchange,
 * refresh) in the browser. There is no server-side session or database.
 * This keeps the security model consistent with the rest of the app:
 *   - Secrets (tokens, keys) never live on the server.
 *   - The server remains a thin, stateless proxy.
 *   - The app can be deployed publicly without any risk of the deployer
 *     being charged for xAI usage.
 *
 * This pattern is the same one used by mature open-source agent tools
 * (Hermes Agent, Kilo Code, OpenClaw, etc.) that integrated xAI OAuth.
 *
 * PUBLIC CLIENT + PKCE
 * --------------------
 * We use the widely-shared public client_id that many tools already use.
 * Because it is a public client, we MUST use PKCE (Proof Key for Code Exchange)
 * with S256. There is no client secret involved at any point.
 *
 * The token exchange and refresh happen directly from the browser to
 * https://auth.x.ai/oauth2/token. This is safe and standard when PKCE is used.
 *
 * TOKEN LIFECYCLE
 * ---------------
 * - access_token: short-lived (typically ~1 hour)
 * - refresh_token: long-lived (weeks/months), used to obtain new access tokens
 * - We store both + an expires_at timestamp in localStorage.
 * - Before every xAI call we check expiry with a small leeway.
 * - On 401 from xAI we attempt a one-time refresh + retry automatically.
 *
 * FALLBACK
 * --------
 * The manual xAI API key input remains fully supported. When both an OAuth
 * session and a manual key exist, the OAuth access token is preferred.
 *
 * References
 * - Official OIDC discovery: https://auth.x.ai/.well-known/openid-configuration
 * - Scopes and client patterns observed in Hermes Agent (NousResearch) and Kilo.
 */

export const XAI_OAUTH = {
  // Shared public Grok CLI client_id. xAI's auth server does NOT offer
  // self-serve OAuth app registration — this is the only client_id that
  // works with auth.x.ai, and it is reused by many third-party tools
  // (Hermes Agent, OpenCode, OpenClaw, etc.).
  // Because it is a public client, PKCE (S256) is mandatory.
  // The redirect URI is fixed to http://127.0.0.1:56121/callback — xAI
  // rejects any other redirect URI for this client_id.
  CLIENT_ID: 'b1a00492-073a-47ea-816f-4c329264a828',

  // Fixed redirect URI — must match what xAI has registered for the Grok
  // CLI client. Our loopback server (server.ts) listens on this exact port.
  REDIRECT_URI: 'http://127.0.0.1:56121/callback',

  // Standard OIDC/OAuth2 endpoints (from discovery document)
  AUTHORIZE_URL: 'https://auth.x.ai/oauth2/authorize',
  TOKEN_URL: 'https://auth.x.ai/oauth2/token',

  // Recommended scopes for Grok API access + refresh capability.
  // "offline_access" is critical — without it you will not receive a refresh_token.
  SCOPE: 'openid profile email offline_access grok-cli:access api:access',

  // Extra parameters observed in real-world integrations.
  // "plan=generic" appears to be a compatibility hint; "referrer" is cosmetic.
  EXTRA_PARAMS: {
    plan: 'generic',
    referrer: 'tts-voice-studio',
  },
} as const;

export interface XaiOAuthTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number; // epoch milliseconds
  tokenType?: string;
  scope?: string;
  idToken?: string;
}

/**
 * Generates a cryptographically random PKCE code_verifier and its S256 challenge.
 *
 * The verifier must be stored (in sessionStorage) for the duration of the flow.
 * The challenge is sent in the authorize URL. The verifier is sent later during
 * the token exchange. This proves the same browser that started the flow is the
 * one completing it.
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  // 43–128 characters is the allowed range for code_verifier.
  // 32 bytes → 43 chars after base64url encoding is a common safe choice.
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);

  // Base64url encoding (no padding, - and _ instead of + and /)
  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // SHA-256 the verifier, then base64url the digest → code_challenge
  // We cannot do this synchronously in the browser without SubtleCrypto.
  // The caller is expected to await the async version below in practice.
  // For simplicity in this teaching module we provide both sync (for very small demos)
  // and the proper async version that everything should actually use.
  // In real usage we always call the async generatePKCEAsync().
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  // Note: this sync path is only here for illustration. Real code uses the async one.
  // We will compute the real challenge in generatePKCEAsync.
  return {
    codeVerifier,
    codeChallenge: '', // placeholder – real value computed asynchronously
  };
}

/**
 * Async PKCE helper — the one you should actually call.
 * Uses SubtleCrypto to compute the S256 challenge properly.
 */
export async function generatePKCEAsync(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);

  const codeVerifier = btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);

  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return { codeVerifier, codeChallenge };
}

/**
 * Builds the full xAI authorization URL the popup will navigate to.
 *
 * redirectUri must exactly match what you will later pass to the token endpoint.
 * For this app in development it is typically:
 *   http://localhost:3456/oauth/xai/callback (or whatever port the dev server is on)
 *
 * state and nonce are anti-CSRF / anti-replay values you should generate with
 * crypto.randomUUID() or similar and store in sessionStorage for later validation.
 */
export function buildXaiAuthorizeUrl(params: {
  redirectUri: string;
  codeChallenge: string;
  state: string;
  nonce?: string;
}): string {
  const { redirectUri, codeChallenge, state, nonce } = params;

  const search = new URLSearchParams({
    response_type: 'code',
    client_id: XAI_OAUTH.CLIENT_ID,
    redirect_uri: redirectUri,
    scope: XAI_OAUTH.SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    ...(nonce ? { nonce } : {}),
    ...XAI_OAUTH.EXTRA_PARAMS,
  });

  return `${XAI_OAUTH.AUTHORIZE_URL}?${search.toString()}`;
}

/**
 * Exchanges the authorization code + PKCE verifier for tokens.
 * This runs entirely in the browser after the popup posts the code back.
 */
export async function exchangeCodeForTokens(params: {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<XaiOAuthTokens> {
  const { code, codeVerifier, redirectUri } = params;

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: XAI_OAUTH.CLIENT_ID,
    code_verifier: codeVerifier,
  });

  const response = await fetch(XAI_OAUTH.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`xAI token exchange failed (${response.status}): ${text || response.statusText}`);
  }

  const json = await response.json();

  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  const expiresAt = Date.now() + expiresIn * 1000 - 30_000; // 30s leeway

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt,
    tokenType: json.token_type,
    scope: json.scope,
    idToken: json.id_token,
  };
}

/**
 * Uses a refresh_token to obtain a new access_token (and possibly a new refresh_token).
 * xAI may or may not rotate the refresh token; we handle both cases.
 */
export async function refreshXaiAccessToken(refreshToken: string): Promise<XaiOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: XAI_OAUTH.CLIENT_ID,
  });

  const response = await fetch(XAI_OAUTH.TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`xAI token refresh failed (${response.status}): ${text || response.statusText}`);
  }

  const json = await response.json();

  const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
  const expiresAt = Date.now() + expiresIn * 1000 - 30_000;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? refreshToken, // keep old one if server didn't rotate
    expiresAt,
    tokenType: json.token_type,
    scope: json.scope,
    idToken: json.id_token,
  };
}

/**
 * Returns true if the access token is expired (or will expire within leewaySeconds).
 */
export function isTokenExpired(expiresAt: number, leewaySeconds = 60): boolean {
  return Date.now() > expiresAt - leewaySeconds * 1000;
}

/**
 * Convenience helper: given a token bundle, return a valid access token.
 * If the current one is expired (or nearly) and a refresh token exists,
 * this function will perform the refresh and return the *new* access token.
 *
 * Important: the caller is responsible for persisting the refreshed tokens.
 * This function does NOT update localStorage itself.
 *
 * Returns null if no valid token can be obtained.
 */
export async function getValidXaiAccessToken(
  tokens: XaiOAuthTokens | null,
  onRefreshed?: (newTokens: XaiOAuthTokens) => void | Promise<void>
): Promise<string | null> {
  if (!tokens?.accessToken) return null;

  if (!isTokenExpired(tokens.expiresAt)) {
    return tokens.accessToken;
  }

  if (!tokens.refreshToken) {
    // Expired and no way to refresh — caller should force re-login.
    return null;
  }

  try {
    const fresh = await refreshXaiAccessToken(tokens.refreshToken);
    if (onRefreshed) {
      await onRefreshed(fresh);
    }
    return fresh.accessToken;
  } catch (err) {
    console.warn('[xaiOAuth] Auto-refresh failed:', err);
    return null;
  }
}

/**
 * Storage helpers (optional but convenient).
 * The app is free to store the token object under any localStorage key it likes.
 */
export const XAI_OAUTH_STORAGE_KEY = 'tts_voicestudio_xai_oauth';

export function saveXaiOAuthTokens(tokens: XaiOAuthTokens | null): void {
  if (!tokens) {
    localStorage.removeItem(XAI_OAUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(XAI_OAUTH_STORAGE_KEY, JSON.stringify(tokens));
}

export function loadXaiOAuthTokens(): XaiOAuthTokens | null {
  try {
    const raw = localStorage.getItem(XAI_OAUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as XaiOAuthTokens;
    // Basic shape validation
    if (parsed && typeof parsed.accessToken === 'string' && typeof parsed.expiresAt === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
