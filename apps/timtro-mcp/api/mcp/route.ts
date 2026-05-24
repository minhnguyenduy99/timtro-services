import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';

import { validateApiKey } from '../../src/auth/api-key';
import { createTimtroMcpServer } from '../../src/create-mcp-server';

const server = createTimtroMcpServer();
const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
  enableJsonResponse: true
});

const ready = server.connect(transport);

async function handleMcpRequest(request: Request): Promise<Response> {
  await ready;

  const authInfo = validateApiKey(request);
  if (!authInfo) {
    return new Response('Unauthorized', { status: 401 });
  }

  return transport.handleRequest(request, { authInfo });
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
