#!/usr/bin/env node

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { discoverMutations, unwrapType } from "../core/introspection.js";
import { getInputTypeName } from "../core/mutation-builder.js";
import {
  buildRegistryAsync,
  buildInputRegistry,
  getEditableFields,
  buildRegistry,
} from "../core/registry.js";
import { loadConfigFile, mergeConfig, type DriftCliConfig } from "./config.js";
import type {
  DriftConfig,
  MutationOperation,
  FieldDefinition,
  IntrospectionResult,
} from "../core/types.js";

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

function printUsage() {
  console.log(`
gql-drift - Dynamic GraphQL query and mutation generation

Commands:
  gql-drift init                  Create a gql-drift.config.json file
  gql-drift generate [options]    Generate field registries from schema

Generate Options:
  --endpoint <url>     GraphQL endpoint URL
  --schema <path>      Path to a local .graphql SDL file (alternative to --endpoint)
  --types <names>      Comma-separated type names
  --out <path>         Output directory (default: src/generated)
  --depth <n>          Max nesting depth (default: 1)
  --header <value>     HTTP header as "Key: Value" (repeatable)
  -h, --help           Show this help message

Config File:
  If a gql-drift.config.json (or .ts/.js) exists, its values are used as defaults.
  CLI flags override config file values.

Examples:
  gql-drift init
  gql-drift generate
  gql-drift generate --endpoint http://localhost:4000/graphql --types Order,Customer
  gql-drift generate --schema ./schema.graphql --types Order
`);
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs(args: string[]): Partial<DriftCliConfig> & { command?: string } {
  const parsed: Partial<DriftCliConfig> & { command?: string } = {
    headers: {},
  };

  const iter = args[Symbol.iterator]();
  for (const arg of iter) {
    if (arg === "init" || arg === "generate") {
      parsed.command = arg;
      continue;
    }

    switch (arg) {
      case "--endpoint":
        parsed.endpoint = iter.next().value;
        break;
      case "--schema":
        parsed.schema = iter.next().value;
        break;
      case "--types":
        parsed.types = iter
          .next()
          .value?.split(",")
          .map((s) => s.trim());
        break;
      case "--out":
        parsed.out = iter.next().value;
        break;
      case "--depth":
        parsed.depth = Number.parseInt(String(iter.next().value), 10);
        break;
      case "--header": {
        const val = iter.next().value;
        const colon = val?.indexOf(":");
        if (colon != null && colon > 0 && val) {
          parsed.headers ??= {};
          parsed.headers[val.slice(0, colon).trim()] = val.slice(colon + 1).trim();
        }
        break;
      }
      case "-h":
      case "--help":
        printUsage();
        process.exit(0);
    }
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// Init command
// ---------------------------------------------------------------------------

function runInit() {
  const configPath = resolve(process.cwd(), "gql-drift.config.json");

  if (existsSync(configPath)) {
    console.log("gql-drift.config.json already exists.");
    return;
  }

  const template = {
    endpoint: "http://localhost:4000/graphql",
    types: ["Order"],
    out: "src/generated",
    depth: 1,
  };

  writeFileSync(configPath, JSON.stringify(template, null, 2) + "\n");
  console.log("Created gql-drift.config.json");
  console.log("");
  console.log("Next steps:");
  console.log("  1. Edit the config file with your endpoint and type names");
  console.log("  2. Run: pnpm gql-drift generate");
}

// ---------------------------------------------------------------------------
// Field serializer
// ---------------------------------------------------------------------------

function serializeFields(fields: FieldDefinition[], indent: number): string {
  const pad = " ".repeat(indent);
  const lines = fields.map((f) => {
    const parts = [
      `key: ${JSON.stringify(f.key)}`,
      `label: ${JSON.stringify(f.label)}`,
      `graphqlPath: ${JSON.stringify(f.graphqlPath)}`,
      `type: ${JSON.stringify(f.type)}`,
    ];
    if (f.enumValues && f.enumValues.length > 0) {
      parts.push(`enumValues: ${JSON.stringify(f.enumValues)}`);
    }
    return `${pad}  { ${parts.join(", ")} }`;
  });
  return `[\n${lines.join(",\n")}\n${pad}]`;
}

// ---------------------------------------------------------------------------
// Code output builder
// ---------------------------------------------------------------------------

function buildOutputFile(
  typeName: string,
  fields: FieldDefinition[],
  inputFields: FieldDefinition[],
  editableFields: FieldDefinition[],
  mutationInfo: {
    operation: MutationOperation;
    mutationName: string;
    inputTypeName: string;
  }[],
): string {
  const constName = typeName.toUpperCase();

  let output = `// AUTO-GENERATED by gql-drift - do not edit manually
// Source type: ${typeName}
// Regenerate: gql-drift generate

import type { FieldDefinition, MutationOperation, DriftConfig } from "gql-drift";
import { defineDriftType } from "gql-drift";
import {
  driftQueryOptions,
  driftUpdateMutation,
  driftCreateMutation,
  driftQueryKey,
} from "gql-drift/react";
import type {
  DriftQueryOptionsParams,
  DriftUpdateMutationParams,
  DriftCreateMutationParams,
  DriftQueryKeyParams,
} from "gql-drift/react";

export const ${constName}_FIELDS: FieldDefinition[] = ${serializeFields(fields, 0)};
`;

  if (inputFields.length > 0) {
    output += `
export const ${constName}_INPUT_FIELDS: FieldDefinition[] = ${serializeFields(inputFields, 0)};

export const ${constName}_EDITABLE_FIELDS: FieldDefinition[] = ${serializeFields(editableFields, 0)};
`;
  }

  const lcName = typeName.toLowerCase();
  const qName = typeName.charAt(0).toLowerCase() + typeName.slice(1) + "s";

  output += `
export const ${constName}_MUTATIONS: { operation: MutationOperation; mutationName: string; inputTypeName: string }[] = ${JSON.stringify(mutationInfo, null, 2)};

export const ${lcName}Type = defineDriftType({
  typeName: ${JSON.stringify(typeName)},
  fields: ${constName}_FIELDS,
  mutations: ${constName}_MUTATIONS,${inputFields.length > 0 ? `\n  inputFields: ${constName}_INPUT_FIELDS,\n  editableFields: ${constName}_EDITABLE_FIELDS,` : ""}
});

// ---------------------------------------------------------------------------
// TanStack Query options factories
// Spread into useQuery() / useMutation() from @tanstack/react-query.
// ---------------------------------------------------------------------------

/**
 * Query options for ${typeName}. Spread into \`useQuery()\`.
 *
 * \`\`\`tsx
 * const { data } = useQuery({ ...${lcName}QueryOptions({ config }) });
 * \`\`\`
 */
export function ${lcName}QueryOptions(
  params: Omit<DriftQueryOptionsParams, "type"> & { type?: never },
) {
  return driftQueryOptions({ ...params, type: ${lcName}Type, queryName: params.queryName ?? ${JSON.stringify(qName)} });
}
`;

  // Only generate mutation factories if mutations exist
  const hasUpdate = mutationInfo.some((m) => m.operation === "update");
  const hasCreate = mutationInfo.some((m) => m.operation === "create");

  if (hasUpdate) {
    output += `
/**
 * Mutation options for updating a ${typeName}. Spread into \`useMutation()\`.
 *
 * \`\`\`tsx
 * const { mutate } = useMutation({
 *   ...update${typeName}Mutation({ config }),
 *   onSuccess: () => queryClient.invalidateQueries({ queryKey: ${lcName}QueryKey() }),
 * });
 * \`\`\`
 */
export function update${typeName}Mutation(
  params: Omit<DriftUpdateMutationParams, "type"> & { type?: never },
) {
  return driftUpdateMutation({ ...params, type: ${lcName}Type });
}
`;
  }

  if (hasCreate) {
    output += `
/**
 * Mutation options for creating a ${typeName}. Spread into \`useMutation()\`.
 *
 * \`\`\`tsx
 * const { mutate } = useMutation({
 *   ...create${typeName}Mutation({ config }),
 *   onSuccess: () => queryClient.invalidateQueries({ queryKey: ${lcName}QueryKey() }),
 * });
 * \`\`\`
 */
export function create${typeName}Mutation(
  params: Omit<DriftCreateMutationParams, "type"> & { type?: never },
) {
  return driftCreateMutation({ ...params, type: ${lcName}Type });
}
`;
  }

  output += `
/**
 * Query key for ${typeName} queries. Use for cache invalidation.
 *
 * \`\`\`tsx
 * queryClient.invalidateQueries({ queryKey: ${lcName}QueryKey() });
 * \`\`\`
 */
export function ${lcName}QueryKey(
  params?: Omit<DriftQueryKeyParams, "type"> & { type?: never },
) {
  return driftQueryKey({ ...params, type: ${lcName}Type, queryName: params?.queryName ?? ${JSON.stringify(qName)} });
}
`;

  return output;
}

// ---------------------------------------------------------------------------
// Generate: endpoint mode
// ---------------------------------------------------------------------------

async function generateFromEndpoint(
  typeName: string,
  config: DriftConfig,
): Promise<{
  fields: FieldDefinition[];
  inputFields: FieldDefinition[];
  editableFields: FieldDefinition[];
  mutations: Map<MutationOperation, string>;
}> {
  const fields = await buildRegistryAsync(typeName, config);

  let mutations: Map<MutationOperation, string>;
  try {
    mutations = await discoverMutations(typeName, config);
  } catch {
    mutations = new Map();
  }

  let inputFields: FieldDefinition[] = [];
  let editableFields: FieldDefinition[] = [];
  try {
    inputFields = await buildInputRegistry(typeName, config);
    editableFields = getEditableFields(fields, inputFields);
  } catch {
    // No input type
  }

  return { fields, inputFields, editableFields, mutations };
}

// ---------------------------------------------------------------------------
// Generate: schema file mode
// ---------------------------------------------------------------------------

async function generateFromSchema(
  typeName: string,
  schemaPath: string,
  depth: number,
): Promise<{
  fields: FieldDefinition[];
  inputFields: FieldDefinition[];
  editableFields: FieldDefinition[];
  mutations: Map<MutationOperation, string>;
}> {
  // Dynamic import so graphql isn't required unless --schema is used
  const { loadSchemaFromFile, introspectTypeFromSchema, discoverMutationsFromSchema } =
    await import("./schema.js");
  const schema = loadSchemaFromFile(schemaPath);

  const introspection = introspectTypeFromSchema(typeName, schema);

  // Resolve nested objects
  const nestedTypes: Record<string, IntrospectionResult> = {};
  if (depth > 0) {
    for (const field of introspection.fields) {
      const unwrapped = unwrapType(field.type);
      if (unwrapped.kind === "OBJECT" && unwrapped.name && unwrapped.name !== typeName) {
        try {
          nestedTypes[unwrapped.name] = introspectTypeFromSchema(unwrapped.name, schema);
        } catch {
          // Skip unresolvable nested types
        }
      }
    }
  }

  const fields = buildRegistry(introspection, { maxDepth: depth, nestedTypes });

  const mutations = discoverMutationsFromSchema(typeName, schema);

  // Try input type
  let inputFields: FieldDefinition[] = [];
  let editableFields: FieldDefinition[] = [];
  try {
    const inputTypeName = `Update${typeName}Input`;
    const inputIntrospection = introspectTypeFromSchema(inputTypeName, schema);
    inputFields = buildRegistry(inputIntrospection, { maxDepth: depth });
    editableFields = getEditableFields(fields, inputFields);
  } catch {
    // No input type
  }

  return { fields, inputFields, editableFields, mutations };
}

// ---------------------------------------------------------------------------
// Main generate command
// ---------------------------------------------------------------------------

async function runGenerate(config: DriftCliConfig) {
  if (!config.endpoint && !config.schema) {
    console.error("Error: either --endpoint or --schema is required (or set in config file)");
    printUsage();
    process.exit(1);
  }

  if (!config.types.length) {
    console.error("Error: --types is required (or set in config file)");
    printUsage();
    process.exit(1);
  }

  const outDir = resolve(process.cwd(), config.out);
  mkdirSync(outDir, { recursive: true });

  const mode = config.schema ? "schema" : "endpoint";
  console.log(`Source: ${mode === "schema" ? config.schema : config.endpoint}`);
  console.log("");

  for (const typeName of config.types) {
    console.log(`${typeName}:`);

    try {
      let result;
      if (config.schema) {
        result = await generateFromSchema(
          typeName,
          resolve(process.cwd(), config.schema),
          config.depth,
        );
      } else {
        const driftConfig: DriftConfig = {
          endpoint: config.endpoint ?? "",
          headers: config.headers,
          maxDepth: config.depth,
        };
        result = await generateFromEndpoint(typeName, driftConfig);
      }

      const { fields, inputFields, editableFields, mutations } = result;

      const mutationInfo = [...mutations.entries()].map(([op, name]) => ({
        operation: op,
        mutationName: name,
        inputTypeName: getInputTypeName(typeName, op),
      }));

      const output = buildOutputFile(typeName, fields, inputFields, editableFields, mutationInfo);

      const filePath = resolve(outDir, `${typeName.toLowerCase()}.ts`);
      writeFileSync(filePath, output);
      console.log(`  ${fields.length} fields -> ${filePath}`);

      if (editableFields.length > 0) {
        console.log(
          `  ${editableFields.length} editable: ${editableFields.map((f) => f.key).join(", ")}`,
        );
      }

      if (mutations.size > 0) {
        console.log(`  mutations: ${[...mutations.values()].join(", ")}`);
      }
    } catch (err) {
      console.error(`  Error: ${(err as Error).message}`);
      process.exit(1);
    }
  }

  console.log("");
  console.log("Done.");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);

  if (!parsed.command) {
    // If args look like flags, assume "generate"
    if (args.length > 0 && args[0]?.startsWith("--")) {
      parsed.command = "generate";
    } else if (args.length === 0) {
      // Try to load config and generate
      const fileConfig = await loadConfigFile(process.cwd());
      if (fileConfig) {
        parsed.command = "generate";
      } else {
        printUsage();
        process.exit(0);
      }
    } else {
      printUsage();
      process.exit(1);
    }
  }

  if (parsed.command === "init") {
    runInit();
    return;
  }

  if (parsed.command === "generate") {
    const fileConfig = await loadConfigFile(process.cwd());
    const config = mergeConfig(fileConfig, parsed);
    await runGenerate(config);
    return;
  }

  printUsage();
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error("Fatal error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
