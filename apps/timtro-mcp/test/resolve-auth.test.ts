import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const verifyAccessTokenMock = vi.fn();

vi.mock('../src/auth/access-token.js', async () => {
  const actual = await vi.importActual<typeof import('../src/auth/access-token.js')>(
    '../src/auth/access-token.js'
  );

  return {
    ...actual,
    verifyAccessToken: (...args: Parameters<typeof actual.verifyAccessToken>) =>
      verifyAccessTokenMock(...args)
  };
});

import { resolveAuth } from '../src/auth/resolve-auth.js';

function requestWithAuth(value?: string): Request {
  const headers = value ? { authorization: `Bearer ${value}` } : undefined;
  return new Request('http://localhost/mcp', { headers });
}

describe('resolveAuth', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    verifyAccessTokenMock.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns OAuth discovery 401 when Auth0 is configured and auth fails', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';
    process.env.MCP_API_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';
    verifyAccessTokenMock.mockResolvedValue(undefined);

    const result = await resolveAuth(requestWithAuth());

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      expect(result.response.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    }
  });

  it('returns AuthInfo for a valid JWT', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';
    verifyAccessTokenMock.mockResolvedValue({
      token: 'jwt-token',
      clientId: 'cursor-client',
      scopes: ['tool:get_areas']
    });

    const result = await resolveAuth(requestWithAuth('jwt-token'));

    expect(result).toEqual({
      ok: true,
      authInfo: {
        token: 'jwt-token',
        clientId: 'cursor-client',
        scopes: ['tool:get_areas']
      }
    });
  });

  it('falls back to API key when JWT verification fails', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';
    process.env.MCP_API_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';
    verifyAccessTokenMock.mockResolvedValue(undefined);

    const result = await resolveAuth(requestWithAuth('secret-key'));

    expect(result).toEqual({
      ok: true,
      authInfo: {
        token: 'secret-key',
        clientId: 'api-key',
        scopes: []
      }
    });
  });

  it('returns OAuth discovery 401 when JWT and API key both fail', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';
    process.env.MCP_API_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';
    verifyAccessTokenMock.mockResolvedValue(undefined);

    const result = await resolveAuth(requestWithAuth('wrong-token'));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    }
  });

  it('uses API key only when Auth0 is not configured', async () => {
    delete process.env.AUTH0_DOMAIN;
    delete process.env.MCP_SERVER_URL;
    process.env.MCP_API_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';

    const success = await resolveAuth(requestWithAuth('secret-key'));
    const failure = await resolveAuth(requestWithAuth());

    expect(success).toEqual({
      ok: true,
      authInfo: {
        token: 'secret-key',
        clientId: 'api-key',
        scopes: []
      }
    });
    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.response.status).toBe(401);
      expect(failure.response.headers.get('WWW-Authenticate')).toBeNull();
    }
  });

  it('allows dev bypass when neither Auth0 nor MCP_API_KEY is configured', async () => {
    delete process.env.AUTH0_DOMAIN;
    delete process.env.MCP_SERVER_URL;
    delete process.env.MCP_API_KEY;
    process.env.NODE_ENV = 'development';

    const result = await resolveAuth(requestWithAuth());

    expect(result).toEqual({
      ok: true,
      authInfo: {
        token: 'dev-bypass',
        clientId: 'local-dev',
        scopes: []
      }
    });
  });
});
