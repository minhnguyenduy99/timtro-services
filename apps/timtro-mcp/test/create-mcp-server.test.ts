import { describe, expect, it } from "vitest";

import { createTimtroMcpServer, TIMTRO_MCP_INSTRUCTIONS } from "../src/create-mcp-server.js";

describe("createTimtroMcpServer", () => {
  it("returns an McpServer configured with timtro instructions", () => {
    const server = createTimtroMcpServer();

    expect(server).toBeDefined();
    expect(TIMTRO_MCP_INSTRUCTIONS).toContain("get_areas");
    expect(TIMTRO_MCP_INSTRUCTIONS).toContain("search_rentals");
  });
});
