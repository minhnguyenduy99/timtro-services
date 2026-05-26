import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

import { resolveAuth } from './auth/resolve-auth';
import { createTimtroMcpServer } from './create-mcp-server';

const server = createTimtroMcpServer();
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
  enableJsonResponse: true
});

const ready = server.connect(transport);

async function handleMcpRequest(request: Request): Promise<Response> {
  await ready;

  const authResult = await resolveAuth(request);
  if (!authResult.ok) {
    return authResult.response;
  }

  return transport.handleRequest(request, { authInfo: authResult.authInfo });
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
