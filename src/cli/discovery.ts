import { gqlFetch } from "../core/fetch.js";
import type { DriftConfig } from "../core/types.js";

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

/**
 * Match a type name against a simple glob pattern.
 * Only `*` is supported as a wildcard (zero or more characters).
 */
export function matchPattern(name: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexStr = "^" + escaped.replace(/\*/g, ".*") + "$";
  return new RegExp(regexStr).test(name);
}

/**
 * Check whether a type name matches any of the given patterns.
 */
export function matchesAny(name: string, patterns: string[]): boolean {
  return patterns.some((p) => matchPattern(name, p));
}

/**
 * Filter type names, removing any that match exclude patterns.
 */
export function filterTypeNames(typeNames: string[], exclude: string[]): string[] {
  if (exclude.length === 0) return typeNames;
  return typeNames.filter((name) => !matchesAny(name, exclude));
}

// ---------------------------------------------------------------------------
// Endpoint discovery
// ---------------------------------------------------------------------------

const SCHEMA_TYPES_QUERY = `
  query {
    __schema {
      types {
        name
        kind
      }
      queryType { name }
      mutationType { name }
      subscriptionType { name }
    }
  }
`;

interface SchemaTypesResponse {
  __schema?: {
    types: { name: string; kind: string }[];
    queryType: { name: string } | null;
    mutationType: { name: string } | null;
    subscriptionType: { name: string } | null;
  };
}

/**
 * Discover all OBJECT type names from a GraphQL endpoint via introspection.
 * Excludes built-in types (__*), root operation types, and non-OBJECT types.
 */
export async function discoverTypesFromEndpoint(config: DriftConfig): Promise<string[]> {
  const data = (await gqlFetch(config, SCHEMA_TYPES_QUERY)) as SchemaTypesResponse;

  const schemaInfo = data.__schema;
  if (!schemaInfo) {
    throw new Error(
      "Introspection did not return __schema. Ensure introspection is enabled on the endpoint.",
    );
  }

  const rootTypeNames = new Set<string>();
  if (schemaInfo.queryType?.name) rootTypeNames.add(schemaInfo.queryType.name);
  if (schemaInfo.mutationType?.name) rootTypeNames.add(schemaInfo.mutationType.name);
  if (schemaInfo.subscriptionType?.name) rootTypeNames.add(schemaInfo.subscriptionType.name);

  return schemaInfo.types
    .filter((t) => {
      if (t.kind !== "OBJECT") return false;
      if (t.name.startsWith("__")) return false;
      if (rootTypeNames.has(t.name)) return false;
      return true;
    })
    .map((t) => t.name)
    .sort((a, b) => a.localeCompare(b));
}
