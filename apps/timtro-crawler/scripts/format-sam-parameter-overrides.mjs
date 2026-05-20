import { readFileSync } from "node:fs";

const envFile = process.argv[2] ?? "env.dev.json";
const { Parameters } = JSON.parse(readFileSync(envFile, "utf8"));

process.stdout.write(
  Object.entries(Parameters)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ")
);
