import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyAccessTokenMock = vi.fn();

vi.mock('@auth0/auth0-api-js', () => ({
  ApiClient: class {
    verifyAccessToken = verifyAccessTokenMock;
  }
}));

import {
  isJwtShaped,
  parseBearerToken,
  resetAccessTokenClientForTests,
  verifyAccessToken
} from '../src/auth/access-token.js';

function requestWithAuth(value?: string): Request {
  const headers = value ? { authorization: `Bearer ${value}` } : undefined;
  return new Request('http://localhost/mcp', { headers });
}

describe('verifyAccessToken', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    verifyAccessTokenMock.mockReset();
    resetAccessTokenClientForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    resetAccessTokenClientForTests();
  });

  it('returns AuthInfo for a valid JWT', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.AUTH0_AUDIENCE = 'https://api.example.com/mcp';
    verifyAccessTokenMock.mockResolvedValue({
      sub: 'auth0|user',
      client_id: 'cursor-client',
      scope: 'tool:get_areas tool:search_rentals',
      exp: 1_900_000_000
    });

    const authInfo = await verifyAccessToken(
      requestWithAuth('header.payload.signature')
    );

    expect(authInfo).toEqual({
      token: 'header.payload.signature',
      clientId: 'cursor-client',
      scopes: ['tool:get_areas', 'tool:search_rentals'],
      expiresAt: 1_900_000_000
    });
  });

  it('accepts audience arrays and azp client id', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.AUTH0_AUDIENCE = 'https://api.example.com/mcp';
    verifyAccessTokenMock.mockResolvedValue({
      sub: 'auth0|user',
      azp: 'registered-client',
      permissions: ['tool:search_rentals']
    });

    const authInfo = await verifyAccessToken(
      requestWithAuth('one.two.three')
    );

    expect(authInfo).toEqual({
      token: 'one.two.three',
      clientId: 'registered-client',
      scopes: ['tool:search_rentals']
    });
  });

  it('returns undefined for expired or invalid tokens', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.AUTH0_AUDIENCE = 'https://api.example.com/mcp';
    verifyAccessTokenMock.mockRejectedValue(new Error('expired'));

    await expect(verifyAccessToken(requestWithAuth('bad.jwt.token'))).resolves.toBeUndefined();
  });

  it('returns undefined when Authorization header is missing or malformed', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.AUTH0_AUDIENCE = 'https://api.example.com/mcp';

    await expect(verifyAccessToken(requestWithAuth())).resolves.toBeUndefined();
    await expect(
      verifyAccessToken(new Request('http://localhost/mcp', { headers: { authorization: 'Basic abc' } }))
    ).resolves.toBeUndefined();
  });

  it('returns undefined for non-JWT bearer tokens', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.AUTH0_AUDIENCE = 'https://api.example.com/mcp';

    await expect(verifyAccessToken(requestWithAuth('plain-api-key'))).resolves.toBeUndefined();
    expect(verifyAccessTokenMock).not.toHaveBeenCalled();
  });

  it('parses bearer tokens and detects JWT shape', () => {
    expect(parseBearerToken(requestWithAuth('abc.def.ghi'))).toBe('abc.def.ghi');
    expect(isJwtShaped('abc.def.ghi')).toBe(true);
    expect(isJwtShaped('not-a-jwt')).toBe(false);
  });
});
