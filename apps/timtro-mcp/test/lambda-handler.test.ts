import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { afterEach, describe, expect, it, vi } from 'vitest';

import * as mcpHttpHandler from '../src/mcp-http-handler.js';
import { handler } from '../src/lambda-handler.js';

function createApiGatewayEvent(
  method: string,
  options: {
    path?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {}
): APIGatewayProxyEventV2 {
  const path = options.path ?? '/mcp';

  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: options.headers ?? {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'id.execute-api.ap-southeast-1.amazonaws.com',
      domainPrefix: 'id',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest'
      },
      requestId: 'test-request-id',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '24/May/2026:00:00:00 +0000',
      timeEpoch: 1_748_044_800
    },
    body: options.body ?? undefined,
    isBase64Encoded: false
  };
}

const lambdaContext = {} as Context;

async function invokeHandler(event: APIGatewayProxyEventV2) {
  return handler(event as unknown as Parameters<typeof handler>[0], lambdaContext);
}

describe('lambda handler', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('routes POST /mcp to the MCP POST handler with a JSON response', async () => {
    const postSpy = vi.spyOn(mcpHttpHandler, 'POST').mockResolvedValue(
      Response.json({
        jsonrpc: '2.0',
        id: 1,
        result: { serverInfo: { name: 'timtro-mcp' } }
      })
    );

    const result = await invokeHandler(
      createApiGatewayEvent('POST', {
        headers: {
          authorization: 'Bearer secret-key',
          'content-type': 'application/json',
          accept: 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0.0' }
          }
        })
      })
    );

    expect(postSpy).toHaveBeenCalledOnce();
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['content-type']).toContain('application/json');
    expect(JSON.parse(result.body ?? '{}')).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: expect.objectContaining({
        serverInfo: expect.objectContaining({ name: 'timtro-mcp' })
      })
    });
  });

  it('routes GET and DELETE to the corresponding MCP handlers', async () => {
    const getSpy = vi.spyOn(mcpHttpHandler, 'GET').mockResolvedValue(new Response('get-ok'));
    const deleteSpy = vi.spyOn(mcpHttpHandler, 'DELETE').mockResolvedValue(new Response('delete-ok'));

    const getResult = await invokeHandler(createApiGatewayEvent('GET'));
    const deleteResult = await invokeHandler(createApiGatewayEvent('DELETE'));

    expect(getSpy).toHaveBeenCalledOnce();
    expect(deleteSpy).toHaveBeenCalledOnce();
    expect(getResult.statusCode).toBe(200);
    expect(deleteResult.statusCode).toBe(200);
    expect(getResult.body).toBe('get-ok');
    expect(deleteResult.body).toBe('delete-ok');
  });

  it('returns 401 when Authorization is missing in production', async () => {
    process.env.MCP_API_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';

    const result = await invokeHandler(createApiGatewayEvent('POST'));

    expect(result.statusCode).toBe(401);
    expect(result.body).toBe('Unauthorized');
  });

  it('returns OAuth discovery 401 when Auth0 is configured and auth is missing', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';
    process.env.MCP_API_KEY = 'secret-key';
    process.env.NODE_ENV = 'production';

    const result = await invokeHandler(createApiGatewayEvent('POST'));

    expect(result.statusCode).toBe(401);
    expect(result.headers?.['www-authenticate']).toContain('resource_metadata=');
    expect(JSON.parse(result.body ?? '{}')).toMatchObject({ error: 'unauthorized' });
  });

  it('routes protected resource metadata requests', async () => {
    process.env.AUTH0_DOMAIN = 'timtro.auth0.com';
    process.env.MCP_SERVER_URL = 'https://api.example.com/mcp';

    const result = await invokeHandler(
      createApiGatewayEvent('GET', {
        path: '/.well-known/oauth-protected-resource/mcp'
      })
    );

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '{}')).toMatchObject({
      resource: 'https://api.example.com/mcp',
      authorization_servers: ['https://timtro.auth0.com/']
    });
  });

  it('returns 500 when the underlying MCP handler throws', async () => {
    vi.spyOn(mcpHttpHandler, 'POST').mockRejectedValue(new Error('boom'));

    const result = await invokeHandler(createApiGatewayEvent('POST'));

    expect(result.statusCode).toBe(500);
  });

  it('forwards Authorization and content headers to the Web Request', async () => {
    const postSpy = vi.spyOn(mcpHttpHandler, 'POST').mockResolvedValue(new Response('ok'));

    await invokeHandler(
      createApiGatewayEvent('POST', {
        headers: {
          authorization: 'Bearer secret-key',
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream'
        },
        body: '{}'
      })
    );

    const request = postSpy.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    expect(request?.headers.get('authorization')).toBe('Bearer secret-key');
    expect(request?.headers.get('content-type')).toBe('application/json');
    expect(request?.headers.get('accept')).toBe('application/json, text/event-stream');
  });
});
