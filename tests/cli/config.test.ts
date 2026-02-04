import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadConfigFile, mergeConfig, type DriftCliConfig } from "../../src/cli/config.js";

describe("mergeConfig", () => {
  it("returns defaults when both inputs are empty", () => {
    const result = mergeConfig(null, {});
    expect(result).toEqual({
      endpoint: undefined,
      schema: undefined,
      types: [],
      out: "src/generated",
      depth: 1,
      headers: {},
    });
  });

  it("uses file config values as defaults", () => {
    const fileConfig: Partial<DriftCliConfig> = {
      endpoint: "http://localhost:4000/graphql",
      types: ["Order", "Customer"],
      out: "src/gen",
      depth: 2,
      headers: { Authorization: "Bearer token" },
    };

    const result = mergeConfig(fileConfig, {});
    expect(result.endpoint).toBe("http://localhost:4000/graphql");
    expect(result.types).toEqual(["Order", "Customer"]);
    expect(result.out).toBe("src/gen");
    expect(result.depth).toBe(2);
    expect(result.headers).toEqual({ Authorization: "Bearer token" });
  });

  it("cli args override file config", () => {
    const fileConfig: Partial<DriftCliConfig> = {
      endpoint: "http://file-endpoint/graphql",
      types: ["Order"],
      out: "src/gen",
      depth: 2,
    };

    const cliArgs: Partial<DriftCliConfig> = {
      endpoint: "http://cli-endpoint/graphql",
      types: ["Customer"],
      depth: 3,
    };

    const result = mergeConfig(fileConfig, cliArgs);
    expect(result.endpoint).toBe("http://cli-endpoint/graphql");
    expect(result.types).toEqual(["Customer"]);
    expect(result.depth).toBe(3);
    // out falls back to file config
    expect(result.out).toBe("src/gen");
  });

  it("merges headers from both sources", () => {
    const fileConfig: Partial<DriftCliConfig> = {
      headers: { Authorization: "Bearer file" },
    };

    const cliArgs: Partial<DriftCliConfig> = {
      headers: { "X-Custom": "value" },
    };

    const result = mergeConfig(fileConfig, cliArgs);
    expect(result.headers).toEqual({
      Authorization: "Bearer file",
      "X-Custom": "value",
    });
  });

  it("cli headers override file headers with same key", () => {
    const fileConfig: Partial<DriftCliConfig> = {
      headers: { Authorization: "Bearer file" },
    };

    const cliArgs: Partial<DriftCliConfig> = {
      headers: { Authorization: "Bearer cli" },
    };

    const result = mergeConfig(fileConfig, cliArgs);
    expect(result.headers).toEqual({ Authorization: "Bearer cli" });
  });

  it("schema path from cli overrides file config", () => {
    const fileConfig: Partial<DriftCliConfig> = {
      schema: "./schema-file.graphql",
    };

    const cliArgs: Partial<DriftCliConfig> = {
      schema: "./schema-cli.graphql",
    };

    const result = mergeConfig(fileConfig, cliArgs);
    expect(result.schema).toBe("./schema-cli.graphql");
  });

  it("supports types as wildcard string '*'", () => {
    const fileConfig: Partial<DriftCliConfig> = {
      types: "*",
    };
    const result = mergeConfig(fileConfig, {});
    expect(result.types).toBe("*");
  });

  it("cli types '*' overrides file config array", () => {
    const fileConfig: Partial<DriftCliConfig> = {
      types: ["Order", "Customer"],
    };
    const cliArgs: Partial<DriftCliConfig> = {
      types: "*",
    };
    const result = mergeConfig(fileConfig, cliArgs);
    expect(result.types).toBe("*");
  });

  it("merges exclude from file config", () => {
    const fileConfig: Partial<DriftCliConfig> = {
      exclude: ["__*", "*Connection"],
    };
    const result = mergeConfig(fileConfig, {});
    expect(result.exclude).toEqual(["__*", "*Connection"]);
  });

  it("cli exclude overrides file config exclude", () => {
    const fileConfig: Partial<DriftCliConfig> = {
      exclude: ["__*"],
    };
    const cliArgs: Partial<DriftCliConfig> = {
      exclude: ["*Connection", "*Edge"],
    };
    const result = mergeConfig(fileConfig, cliArgs);
    expect(result.exclude).toEqual(["*Connection", "*Edge"]);
  });

  it("exclude is undefined when not set", () => {
    const result = mergeConfig(null, {});
    expect(result.exclude).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// loadConfigFile
// ---------------------------------------------------------------------------

const TMP_DIR = resolve(__dirname, "__tmp_config_test__");

describe("loadConfigFile", () => {
  beforeAll(() => {
    mkdirSync(TMP_DIR, { recursive: true });
  });

  afterAll(() => {
    rmSync(TMP_DIR, { recursive: true, force: true });
  });

  it("returns null when no config file exists", async () => {
    const emptyDir = resolve(TMP_DIR, "empty");
    mkdirSync(emptyDir, { recursive: true });
    const result = await loadConfigFile(emptyDir);
    expect(result).toBeNull();
  });

  it("loads gql-drift.config.json", async () => {
    const dir = resolve(TMP_DIR, "json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "gql-drift.config.json"),
      JSON.stringify({ endpoint: "http://test/graphql", types: ["Order"] }),
    );

    const result = await loadConfigFile(dir);
    expect(result).toEqual({ endpoint: "http://test/graphql", types: ["Order"] });
  });

  it("throws on invalid JSON", async () => {
    const dir = resolve(TMP_DIR, "bad-json");
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "gql-drift.config.json"), "{ invalid json }");

    await expect(loadConfigFile(dir)).rejects.toThrow("Failed to parse");
  });

  it("loads gql-drift.config.js with default export", async () => {
    const dir = resolve(TMP_DIR, "js-default");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "gql-drift.config.js"),
      `export default { endpoint: "http://js/graphql", types: ["Customer"] };`,
    );

    const result = await loadConfigFile(dir);
    expect(result).toEqual({ endpoint: "http://js/graphql", types: ["Customer"] });
  });

  it("loads gql-drift.config.js without default export", async () => {
    const dir = resolve(TMP_DIR, "js-named");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "gql-drift.config.js"),
      `export const endpoint = "http://named/graphql"; export const types = ["Item"];`,
    );

    const result = await loadConfigFile(dir);
    expect(result).toHaveProperty("endpoint", "http://named/graphql");
  });

  it("prefers JSON over JS when both exist", async () => {
    const dir = resolve(TMP_DIR, "both");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      resolve(dir, "gql-drift.config.json"),
      JSON.stringify({ endpoint: "http://json/graphql" }),
    );
    writeFileSync(
      resolve(dir, "gql-drift.config.js"),
      `export default { endpoint: "http://js/graphql" };`,
    );

    const result = await loadConfigFile(dir);
    expect(result).toEqual({ endpoint: "http://json/graphql" });
  });
});
