import {
  type OAuthProtectedResourceMetadata,
  resourceUrlFromServerUrl
} from '@modelcontextprotocol/server';

export const MCP_TOOL_SCOPES = ['tool:get_areas', 'tool:search_rentals'] as const;

function readAuth0Domain(): string | undefined {
  const domain = process.env.AUTH0_DOMAIN?.trim();
  return domain ? domain : undefined;
}

function readMcpServerUrl(): string | undefined {
  const url = process.env.MCP_SERVER_URL?.trim();
  return url ? url : undefined;
}

export function isAuth0Configured(): boolean {
  return Boolean(readAuth0Domain() && readMcpServerUrl());
}

export function getCanonicalResourceUrl(): string {
  const configuredUrl = readMcpServerUrl();
  if (!configuredUrl) {
    throw new Error('MCP_SERVER_URL is required when Auth0 OAuth is configured');
  }

  const resourceUrl = resourceUrlFromServerUrl(configuredUrl);
  resourceUrl.pathname = resourceUrl.pathname.replace(/\/$/, '') || '/';

  return resourceUrl.toString();
}

export function getProtectedResourceMetadataUrl(serverUrl?: string): string {
  const baseUrl = new URL(serverUrl ?? readMcpServerUrl() ?? 'http://localhost:3000/mcp');
  const resourcePath = baseUrl.pathname.replace(/\/$/, '') || '/';

  baseUrl.pathname =
    resourcePath === '/'
      ? '/.well-known/oauth-protected-resource'
      : `/.well-known/oauth-protected-resource${resourcePath}`;
  baseUrl.search = '';
  baseUrl.hash = '';

  return baseUrl.toString();
}

export function buildProtectedResourceMetadata(): OAuthProtectedResourceMetadata {
  const auth0Domain = readAuth0Domain();
  if (!auth0Domain) {
    throw new Error('AUTH0_DOMAIN is required to build protected resource metadata');
  }

  const resource = getCanonicalResourceUrl();

  return {
    resource,
    authorization_servers: [`https://${auth0Domain}/`],
    scopes_supported: [...MCP_TOOL_SCOPES],
    bearer_methods_supported: ['header'],
    jwks_uri: `https://${auth0Domain}/.well-known/jwks.json`
  };
}

export function buildUnauthorizedResponse(): Response {
  const metadataUrl = getProtectedResourceMetadataUrl();
  const scope = MCP_TOOL_SCOPES.join(' ');
  const wwwAuthenticate = `Bearer resource_metadata="${metadataUrl}", scope="${scope}"`;

  return Response.json(
    {
      error: 'unauthorized',
      error_description: 'Authentication required'
    },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': wwwAuthenticate
      }
    }
  );
}

export function handleProtectedResourceMetadataRequest(): Response {
  try {
    return Response.json(buildProtectedResourceMetadata(), {
      headers: {
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    return Response.json(
      {
        error: 'server_error',
        error_description: error instanceof Error ? error.message : 'OAuth metadata unavailable'
      },
      { status: 500 }
    );
  }
}
