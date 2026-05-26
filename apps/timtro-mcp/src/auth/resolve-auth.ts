import { verifyAccessToken } from './access-token';
import { validateApiKey } from './api-key';
import { buildUnauthorizedResponse, isAuth0Configured } from './protected-resource-metadata';
import type { AuthInfo } from '@modelcontextprotocol/server';

export type AuthResolution =
  | { ok: true; authInfo: AuthInfo }
  | { ok: false; response: Response };

export async function resolveAuth(request: Request): Promise<AuthResolution> {
  if (isAuth0Configured()) {
    const jwtAuthInfo = await verifyAccessToken(request);
    if (jwtAuthInfo) {
      return { ok: true, authInfo: jwtAuthInfo };
    }

    const apiKeyAuthInfo = validateApiKey(request);
    if (apiKeyAuthInfo) {
      return { ok: true, authInfo: apiKeyAuthInfo };
    }

    return { ok: false, response: buildUnauthorizedResponse() };
  }

  const apiKeyAuthInfo = validateApiKey(request);
  if (apiKeyAuthInfo) {
    return { ok: true, authInfo: apiKeyAuthInfo };
  }

  return {
    ok: false,
    response: new Response('Unauthorized', { status: 401 })
  };
}
