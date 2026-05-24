import { afterEach, describe, expect, it } from "vitest";

import { validateApiKey } from "../src/auth/api-key.js";

function requestWithAuth(value?: string): Request {
  const headers = value ? { authorization: `Bearer ${value}` } : undefined;
  return new Request("http://localhost/api/mcp", { headers });
}

describe("validateApiKey", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns AuthInfo when bearer token matches MCP_API_KEY", () => {
    process.env.MCP_API_KEY = "secret-key";
    process.env.NODE_ENV = "production";

    const authInfo = validateApiKey(requestWithAuth("secret-key"));

    expect(authInfo).toEqual({
      token: "secret-key",
      clientId: "api-key",
      scopes: []
    });
  });

  it("returns undefined when Authorization header is missing", () => {
    process.env.MCP_API_KEY = "secret-key";
    process.env.NODE_ENV = "production";

    expect(validateApiKey(requestWithAuth())).toBeUndefined();
  });

  it("returns undefined when bearer token is wrong", () => {
    process.env.MCP_API_KEY = "secret-key";
    process.env.NODE_ENV = "production";

    expect(validateApiKey(requestWithAuth("wrong-key"))).toBeUndefined();
  });

  it("allows dev bypass when MCP_API_KEY is unset outside production", () => {
    delete process.env.MCP_API_KEY;
    process.env.NODE_ENV = "development";

    expect(validateApiKey(requestWithAuth())).toEqual({
      token: "dev-bypass",
      clientId: "local-dev",
      scopes: []
    });
  });

  it("rejects all requests in production when MCP_API_KEY is unset", () => {
    delete process.env.MCP_API_KEY;
    process.env.NODE_ENV = "production";

    expect(validateApiKey(requestWithAuth("anything"))).toBeUndefined();
  });

  it("rejects all requests on Lambda when MCP_API_KEY is unset", () => {
    delete process.env.MCP_API_KEY;
    delete process.env.NODE_ENV;
    process.env.AWS_LAMBDA_FUNCTION_NAME = "timtro-mcp-dev";

    expect(validateApiKey(requestWithAuth("anything"))).toBeUndefined();
  });
});
