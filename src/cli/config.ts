import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface DriftCliConfig {
  /** GraphQL endpoint URL (for runtime introspection) */
  endpoint?: string;
  /** Path to a local .graphql schema file (alternative to endpoint) */
  schema?: string;
  /** Type names to generate */
  types: string[];
  /** Output directory (default: src/generated) */
  out: string;
  /** Max nesting depth (default: 1) */
  depth: number;
  /** HTTP headers for endpoint introspection */
  headers: Record<string, string>;
}

const CONFIG_FILES = [
  "gql-drift.config.ts",
  "gql-drift.config.js",
  "gql-drift.config.json",
];

/**
 * Attempt to load a config file from the current directory.
 * Returns null if none found.
 */
export async function loadConfigFile(cwd: string): Promise<Partial<DriftCliConfig> | null> {
  // Try JSON first (no import needed)
  const jsonPath = resolve(cwd, "gql-drift.config.json");
  if (existsSync(jsonPath)) {
    try {
      const raw = readFileSync(jsonPath, "utf-8");
      return JSON.parse(raw) as Partial<DriftCliConfig>;
    } catch (err) {
      throw new Error(`Failed to parse ${jsonPath}: ${(err as Error).message}`);
    }
  }

  // Try TS/JS via dynamic import
  for (const filename of ["gql-drift.config.ts", "gql-drift.config.js"]) {
    const filePath = resolve(cwd, filename);
    if (existsSync(filePath)) {
      try {
        // Use file:// URL for cross-platform compatibility
        const fileUrl = `file://${filePath.replace(/\\/g, "/")}`;
        const mod = await import(fileUrl);
        return (mod.default ?? mod) as Partial<DriftCliConfig>;
      } catch (err) {
        throw new Error(`Failed to load ${filePath}: ${(err as Error).message}`);
      }
    }
  }

  return null;
}

/**
 * Merge CLI args on top of config file defaults.
 */
export function mergeConfig(
  fileConfig: Partial<DriftCliConfig> | null,
  cliArgs: Partial<DriftCliConfig>,
): DriftCliConfig {
  return {
    endpoint: cliArgs.endpoint ?? fileConfig?.endpoint,
    schema: cliArgs.schema ?? fileConfig?.schema,
    types: cliArgs.types ?? fileConfig?.types ?? [],
    out: cliArgs.out ?? fileConfig?.out ?? "src/generated",
    depth: cliArgs.depth ?? fileConfig?.depth ?? 1,
    headers: { ...fileConfig?.headers, ...cliArgs.headers },
  };
}
