import { readFileSync } from "node:fs";

const TEMPLATE_PARAMETERS = new Set([
  "EnvironmentName",
  "ApifyActorId",
  "FacebookGroupUrls",
  "ApifyToken",
  "GeminiApiKey",
  "GeminiModel",
  "TimtroUseFakeProviders"
]);

const envFile = process.argv[2] ?? "env.dev.json";
const { Parameters = {} } = JSON.parse(readFileSync(envFile, "utf8"));

process.stdout.write(
  Object.entries(Parameters)
    .filter(([key]) => TEMPLATE_PARAMETERS.has(key))
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")
);
