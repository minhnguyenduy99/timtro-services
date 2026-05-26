import { afterEach, describe, expect, it } from 'vitest';

import {
  buildProtectedResourceMetadata,
  buildUnauthorizedResponse,
  getCanonicalResourceUrl,
  getProtectedResourceMetadataUrl,
  handleProtectedResourceMetadataRequest,
  MCP_TOOL_SCOPES
} from '../src/auth/protected-resource-metadata.js';

describe('protected resource metadata', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns PRM JSON with Auth0 authorization server', () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';

    const metadata = buildProtectedResourceMetadata();

    expect(metadata.resource).toBe('https://api.example.com/mcp');
    expect(metadata.authorization_servers).toEqual(['https://timtro.auth0.com/']);
    expect(metadata.scopes_supported).toEqual([...MCP_TOOL_SCOPES]);
    expect(metadata.bearer_methods_supported).toEqual(['header']);
    expect(metadata.jwks_uri).toBe('https://timtro.auth0.com/.well-known/jwks.json');
  });

  it('serves metadata from the well-known handler', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';

    const response = handleProtectedResourceMetadataRequest();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authorization_servers).toEqual(['https://timtro.auth0.com/']);
  });

  it('builds metadata URLs for /mcp and fallback paths', () => {
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';

    expect(getProtectedResourceMetadataUrl()).toBe(
      'https://api.example.com/.well-known/oauth-protected-resource/mcp'
    );
    expect(getProtectedResourceMetadataUrl('https://api.example.com/mcp')).toBe(
      'https://api.example.com/.well-known/oauth-protected-resource/mcp'
    );
  });

  it('normalizes MCP_SERVER_URL without trailing slash', () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp/';

    expect(getCanonicalResourceUrl()).toBe('https://api.example.com/mcp');
  });

  it('returns 401 with WWW-Authenticate challenge', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';

    const response = buildUnauthorizedResponse();

    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toContain('resource_metadata=');
    expect(response.headers.get('WWW-Authenticate')).toContain(
      'https://api.example.com/.well-known/oauth-protected-resource/mcp'
    );
    expect(await response.json()).toEqual({
      error: 'unauthorized',
      error_description: 'Authentication required'
    });
  });

  it('returns 500 when Auth0 env is missing', async () => {
    delete process.env.AUTH0_DOMAIN;
    delete process.env.MCP_SERVER_URL;

    const response = handleProtectedResourceMetadataRequest();

    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: 'server_error'
    });
  });
});
