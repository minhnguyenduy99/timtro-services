import { timingSafeEqual } from 'node:crypto';

import type { AuthInfo } from '@modelcontextprotocol/server';

function readConfiguredApiKey(): string | undefined {
  const key = process.env.MCP_API_KEY?.trim();
  return key ? key : undefined;
}

function isProduction(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME?.trim())
  );
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseBearerToken(request: Request): string | undefined {
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

export function validateApiKey(request: Request): AuthInfo | undefined {
  const configuredKey = readConfiguredApiKey();

  if (!configuredKey) {
    if (!isProduction()) {
      return {
        token: 'dev-bypass',
        clientId: 'local-dev',
        scopes: []
      };
    }

    return undefined;
  }

  const bearerToken = parseBearerToken(request);
  if (!bearerToken || !constantTimeEqual(bearerToken, configuredKey)) {
    return undefined;
  }

  return {
    token: bearerToken,
    clientId: 'api-key',
    scopes: []
  };
}
