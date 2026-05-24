/**
 * Gọi thử timtro MCP qua Streamable HTTP (initialize → initialized → tools/call).
 * Chạy: pnpm smoke
 *
 * Env:
 * - MCP_URL (default http://localhost:3000/mcp)
 * - MCP_API_KEY (optional locally when dev bypass is active)
 * - SKIP_SEARCH_RENTALS=1 — bỏ qua search_rentals khi chưa có AWS
 */
const MCP_URL = process.env.MCP_URL ?? "http://localhost:3000/mcp";
const MCP_API_KEY = process.env.MCP_API_KEY;
const SKIP_SEARCH = process.env.SKIP_SEARCH_RENTALS === "1";

function authHeaders() {
  return MCP_API_KEY ? { authorization: `Bearer ${MCP_API_KEY}` } : {};
}

async function postJsonRpc(body) {
  const response = await fetch(MCP_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...authHeaders()
    },
    body: JSON.stringify(body)
  });

  if (response.status === 401) {
    throw new Error("HTTP 401 Unauthorized — kiểm tra MCP_API_KEY");
  }

  if (response.status === 202 || response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  const raw = await response.text();

  if (!raw) {
    return null;
  }

  if (contentType.includes("application/json")) {
    return JSON.parse(raw);
  }

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("data:")) {
      return JSON.parse(trimmed.slice(5).trim());
    }
  }

  throw new Error(`Unexpected MCP response (${response.status}): ${raw.slice(0, 200)}`);
}

async function main() {
  console.log(`Smoke target: ${MCP_URL}`);

  const initialize = await postJsonRpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "smoke-http", version: "1.0.0" }
    }
  });

  if (initialize.error) {
    throw new Error(`initialize failed: ${JSON.stringify(initialize.error)}`);
  }

  console.log("✓ initialize", initialize.result?.serverInfo?.name ?? initialize.result);

  await postJsonRpc({
    jsonrpc: "2.0",
    method: "notifications/initialized"
  });

  const getAreas = await postJsonRpc({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "get_areas",
      arguments: {}
    }
  });

  if (getAreas.error) {
    throw new Error(`get_areas failed: ${JSON.stringify(getAreas.error)}`);
  }

  console.log("✓ get_areas", JSON.stringify(getAreas.result?.structuredContent ?? getAreas.result, null, 2));

  if (SKIP_SEARCH) {
    console.log("(skipped search_rentals — SKIP_SEARCH_RENTALS=1)");
    return;
  }

  const searchRentals = await postJsonRpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "search_rentals",
      arguments: {
        city: "ho_chi_minh",
        district: "binh_thanh",
        max_price_vnd: 3_000_000,
        limit: 5,
        sort: "price|asc"
      }
    }
  });

  if (searchRentals.error) {
    console.warn("⚠ search_rentals returned tool error (AWS có thể chưa cấu hình):", searchRentals.error);
    return;
  }

  console.log("✓ search_rentals", JSON.stringify(searchRentals.result?.structuredContent ?? searchRentals.result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
