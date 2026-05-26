import { createServer, type IncomingMessage } from 'node:http';

import { handleProtectedResourceMetadataRequest } from '../src/auth/protected-resource-metadata.js';
import { DELETE, GET, POST } from '../src/mcp-http-handler.js';

const PORT = Number(process.env.PORT ?? 3000);

async function readRequestBody(request: IncomingMessage): Promise<Uint8Array | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }

  return Buffer.concat(chunks);
}

function buildWebRequest(request: IncomingMessage, body?: Uint8Array): Request {
  const host = request.headers.host ?? `localhost:${PORT}`;
  const url = new URL(request.url ?? '/', `http://${host}`);
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }

  return new Request(url, {
    method: request.method,
    headers,
    body: body ? Buffer.from(body) : undefined
  });
}

async function dispatch(request: IncomingMessage, response: import('node:http').ServerResponse) {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${PORT}`}`);

  if (
    request.method === 'GET' &&
    (url.pathname === '/.well-known/oauth-protected-resource/mcp' ||
      url.pathname === '/.well-known/oauth-protected-resource')
  ) {
    const webResponse = handleProtectedResourceMetadataRequest();
    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
      response.setHeader(key, value);
    });
    response.end(Buffer.from(await webResponse.arrayBuffer()));
    return;
  }

  if (url.pathname !== '/mcp') {
    response.statusCode = 404;
    response.end('Not Found');
    return;
  }

  try {
    const body = await readRequestBody(request);
    const webRequest = buildWebRequest(request, body);
    const handler =
      request.method === 'GET' ? GET : request.method === 'DELETE' ? DELETE : POST;
    const webResponse = await handler(webRequest);

    response.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
      response.setHeader(key, value);
    });

    const responseBody = Buffer.from(await webResponse.arrayBuffer());
    response.end(responseBody);
  } catch (error) {
    console.error('[dev-http-server]', error);
    response.statusCode = 500;
    response.end('Internal Server Error');
  }
}

createServer((request, response) => {
  void dispatch(request, response);
}).listen(PORT, () => {
  console.log(`Timtro MCP dev server listening on http://localhost:${PORT}/mcp`);
});
