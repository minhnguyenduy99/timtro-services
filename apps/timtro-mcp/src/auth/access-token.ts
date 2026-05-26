import { ApiClient } from '@auth0/auth0-api-js';
import type { AuthInfo } from '@modelcontextprotocol/server';

let cachedClient: ApiClient | undefined;
let cachedConfigKey: string | undefined;

function readAuth0Domain(): string | undefined {
  const domain = process.env.AUTH0_DOMAIN?.trim();
  return domain ? domain : undefined;
}

function readAuth0Audience(): string | undefined {
  const audience = process.env.AUTH0_AUDIENCE?.trim();
  return audience ? audience : undefined;
}

function getApiClient(): ApiClient | undefined {
  const domain = readAuth0Domain();
  const audience = readAuth0Audience();
  if (!domain || !audience) {
    return undefined;
  }

  const configKey = `${domain}:${audience}`;
  if (!cachedClient || cachedConfigKey !== configKey) {
    cachedClient = new ApiClient({ domain, audience });
    cachedConfigKey = configKey;
  }

  return cachedClient;
}

export function isJwtShaped(token: string): boolean {
  return token.split('.').length === 3;
}

export function parseBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get('authorization');
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }

  return token;
}

function readScopes(decoded: Record<string, unknown>): string[] {
  if (typeof decoded.scope === 'string') {
    return decoded.scope.split(' ').filter(Boolean);
  }

  if (Array.isArray(decoded.permissions)) {
    return decoded.permissions.filter((scope): scope is string => typeof scope === 'string');
  }

  return [];
}

function readClientId(decoded: Record<string, unknown>): string | undefined {
  if (typeof decoded.client_id === 'string' && decoded.client_id.length > 0) {
    return decoded.client_id;
  }

  if (typeof decoded.azp === 'string' && decoded.azp.length > 0) {
    return decoded.azp;
  }

  return undefined;
}

export async function verifyAccessToken(request: Request): Promise<AuthInfo | undefined> {
  const client = getApiClient();
  if (!client) {
    return undefined;
  }

  const token = parseBearerToken(request);
  if (!token || !isJwtShaped(token)) {
    return undefined;
  }

  try {
    const decoded = (await client.verifyAccessToken({ accessToken: token })) as Record<
      string,
      unknown
    >;
    const clientId = readClientId(decoded);
    if (!clientId) {
      return undefined;
    }

    return {
      token,
      clientId,
      scopes: readScopes(decoded),
      ...(typeof decoded.exp === 'number' ? { expiresAt: decoded.exp } : {})
    };
  } catch {
    return undefined;
  }
}

export function resetAccessTokenClientForTests(): void {
  cachedClient = undefined;
  cachedConfigKey = undefined;
}
