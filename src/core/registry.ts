import { introspectType, unwrapType } from "./introspection.js";
import type { DriftConfig, FieldDefinition, FieldType, IntrospectionResult } from "./types.js";

/** Default mapping from GraphQL scalar names to simplified types */
export const DEFAULT_SCALAR_MAP: Record<string, FieldType> = {
  String: "string",
  Int: "number",
  Float: "number",
  Boolean: "boolean",
  DateTime: "date",
  ID: "string",
};

/** Capitalize the first character of a string */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Convert camelCase field name to a human-readable label */
export function formatLabel(fieldName: string): string {
  return fieldName.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (s) => s.toUpperCase());
}

export interface BuildRegistryConfig {
  maxDepth?: number;
  scalarMap?: Record<string, FieldType>;
  /**
   * Map of type name -> IntrospectionResult for resolving nested OBJECT types
   * without making network requests. Pass pre-fetched nested types here.
   */
  nestedTypes?: Record<string, IntrospectionResult>;
  /**
   * Override auto-generated labels. Keys are field keys (e.g. "shippingAddressCity"),
   * values are the desired labels.
   */
  labels?: Record<string, string>;
}

/**
 * Build a flat field registry from an introspection result.
 *
 * Transforms raw introspection into FieldDefinition[], handling nested OBJECT
 * fields by recursing up to maxDepth levels. ENUM fields preserve their possible
 * values in `enumValues`.
 *
 * ```ts
 * const fields = buildRegistry(orderType, {
 *   nestedTypes: { Address: addressType },
 *   labels: { shippingAddressCity: "Ship. City" },
 * });
 * ```
 */
export function buildRegistry(
  introspection: IntrospectionResult,
  config?: BuildRegistryConfig,
): FieldDefinition[] {
  const maxDepth = config?.maxDepth ?? 1;
  const scalarMap = { ...DEFAULT_SCALAR_MAP, ...config?.scalarMap };
  const nestedTypes = config?.nestedTypes ?? {};
  const labels = config?.labels ?? {};

  const fields = buildRegistrySync(introspection, scalarMap, nestedTypes, maxDepth, 0, "", "");

  // Apply label overrides
  if (Object.keys(labels).length > 0) {
    for (const field of fields) {
      if (labels[field.key]) {
        field.label = labels[field.key];
      }
    }
  }

  return fields;
}

function buildRegistrySync(
  introspection: IntrospectionResult,
  scalarMap: Record<string, FieldType>,
  nestedTypes: Record<string, IntrospectionResult>,
  maxDepth: number,
  depth: number,
  prefix: string,
  pathPrefix: string,
): FieldDefinition[] {
  const fields: FieldDefinition[] = [];

  for (const field of introspection.fields) {
    if (field.name === "id") continue;

    const unwrapped = unwrapType(field.type);
    const graphqlPath = pathPrefix ? `${pathPrefix}.${field.name}` : field.name;
    const key = prefix ? `${prefix}${capitalize(field.name)}` : field.name;

    const resolved = resolveField(unwrapped, key, field.name, graphqlPath, scalarMap);
    if (resolved !== null) {
      fields.push(resolved);
    } else if (
      unwrapped.kind === "OBJECT" &&
      depth < maxDepth &&
      unwrapped.name &&
      unwrapped.name in nestedTypes
    ) {
      const nestedFields = buildRegistrySync(
        nestedTypes[unwrapped.name],
        scalarMap,
        nestedTypes,
        maxDepth,
        depth + 1,
        key,
        graphqlPath,
      );
      fields.push(...nestedFields);
    }
  }

  return fields;
}

/** Resolve a single field from its unwrapped type info. Returns null for unresolvable types. */
function resolveField(
  unwrapped: ReturnType<typeof unwrapType>,
  key: string,
  name: string,
  graphqlPath: string,
  scalarMap: Record<string, FieldType>,
): FieldDefinition | null {
  if (unwrapped.kind === "ENUM") {
    const enumValues = unwrapped.enumValues?.map((v) => v.name) ?? [];
    return { key, label: formatLabel(name), graphqlPath, type: "enum", enumValues };
  }
  if (unwrapped.kind === "SCALAR" && unwrapped.name && unwrapped.name in scalarMap) {
    return { key, label: formatLabel(name), graphqlPath, type: scalarMap[unwrapped.name] };
  }
  return null;
}

/**
 * Build a field registry with nested type resolution via introspection.
 * This async variant resolves nested OBJECT types by querying the schema.
 */
export async function buildRegistryAsync(
  typeName: string,
  config: DriftConfig,
  options?: { labels?: Record<string, string> },
): Promise<FieldDefinition[]> {
  const introspection = await introspectType(typeName, config);
  const scalarMap = { ...DEFAULT_SCALAR_MAP, ...config.scalarMap };
  const maxDepth = config.maxDepth ?? 1;
  const labels = options?.labels ?? {};

  const fields = await buildRegistryRecursive(
    introspection,
    config,
    scalarMap,
    maxDepth,
    0,
    "",
    "",
  );

  if (Object.keys(labels).length > 0) {
    for (const field of fields) {
      if (labels[field.key]) {
        field.label = labels[field.key];
      }
    }
  }

  return fields;
}

async function buildRegistryRecursive(
  introspection: IntrospectionResult,
  config: DriftConfig,
  scalarMap: Record<string, FieldType>,
  maxDepth: number,
  depth: number,
  prefix: string,
  pathPrefix: string,
): Promise<FieldDefinition[]> {
  const fields: FieldDefinition[] = [];

  for (const field of introspection.fields) {
    if (field.name === "id") continue;

    const unwrapped = unwrapType(field.type);
    const graphqlPath = pathPrefix ? `${pathPrefix}.${field.name}` : field.name;
    const key = prefix ? `${prefix}${capitalize(field.name)}` : field.name;

    const resolved = resolveField(unwrapped, key, field.name, graphqlPath, scalarMap);
    if (resolved !== null) {
      fields.push(resolved);
    } else if (unwrapped.kind === "OBJECT" && depth < maxDepth && unwrapped.name) {
      const nestedType = await introspectType(unwrapped.name, config);
      const nestedFields = await buildRegistryRecursive(
        nestedType,
        config,
        scalarMap,
        maxDepth,
        depth + 1,
        key,
        graphqlPath,
      );
      fields.push(...nestedFields);
    }
  }

  return fields;
}

/**
 * Build an input field registry by introspecting the input type.
 * Derives input type name via convention: Update{TypeName}Input.
 */
export async function buildInputRegistry(
  typeName: string,
  config: DriftConfig,
): Promise<FieldDefinition[]> {
  const inputTypeName = `Update${typeName}Input`;
  let inputType: IntrospectionResult;

  try {
    inputType = await introspectType(inputTypeName, config);
  } catch {
    throw new Error(
      `Input type "${inputTypeName}" not found in schema. ` +
        `Expected an input type following the convention Update{TypeName}Input.`,
    );
  }

  return buildRegistry(inputType, {
    maxDepth: config.maxDepth,
    scalarMap: config.scalarMap,
  });
}

/**
 * Get fields that are both readable (in query registry) and writable (in input registry).
 * These are the fields that should get edit affordances in the UI.
 */
export function getEditableFields(
  queryFields: FieldDefinition[],
  inputFields: FieldDefinition[],
): FieldDefinition[] {
  const inputKeys = new Set(inputFields.map((f) => f.key));
  return queryFields.filter((f) => inputKeys.has(f.key));
}

/**
 * Apply label overrides to an existing field registry.
 * Returns a new array (does not mutate).
 */
export function withLabels(
  fields: FieldDefinition[],
  labels: Record<string, string>,
): FieldDefinition[] {
  return fields.map((f) => (labels[f.key] ? { ...f, label: labels[f.key] } : f));
}
