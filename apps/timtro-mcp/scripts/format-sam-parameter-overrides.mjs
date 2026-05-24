import { readFileSync } from "node:fs";

const TEMPLATE_PARAMETERS = new Set([
  "EnvironmentName",
  "RentalInfoTableName",
  "VercelTeamSlug",
  "VercelProjectName"
]);

const envFile = process.argv[2] ?? "env.example.json";
const { Parameters = {} } = JSON.parse(readFileSync(envFile, "utf8"));

process.stdout.write(
  Object.entries(Parameters)
    .filter(([key]) => TEMPLATE_PARAMETERS.has(key))
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")
);
