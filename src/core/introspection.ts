import type {
  DriftConfig,
  IntrospectionField,
  IntrospectionResult,
  IntrospectionType,
  MutationOperation,
} from "./types.js";
import { gqlFetch } from "./fetch.js";

const INTROSPECTION_QUERY = `
  query IntrospectType($typeName: String!) {
    __type(name: $typeName) {
      name
      fields {
        name
        type {
          name
          kind
          enumValues { name }
          ofType {
            name
            kind
            enumValues { name }
            ofType {
              name
              kind
              enumValues { name }
              ofType {
                name
                kind
                enumValues { name }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Unwrap NON_NULL and LIST wrappers to get the underlying type.
 */
export function unwrapType(t: IntrospectionType): IntrospectionType {
  let current = t;
  while (current.kind === "NON_NULL" || current.kind === "LIST") {
    if (!current.ofType) break;
    current = current.ofType;
  }
  return current;
}

/**
 * Introspect a single type from the GraphQL schema.
 */
export async function introspectType(
  typeName: string,
  config: DriftConfig,
): Promise<IntrospectionResult> {
  const data = (await gqlFetch(config, INTROSPECTION_QUERY, {
    typeName,
  })) as Record<string, unknown> | undefined;

  const type = data?.__type;
  if (!type) {
    throw new Error(
      `Type "${typeName}" not found in schema. Check that the type name is correct and introspection is enabled.`,
    );
  }

  return type as IntrospectionResult;
}

/**
 * Discover available mutations for a type by naming convention.
 * Checks for updateX, createX, deleteX in the Mutation root type.
 */
export async function discoverMutations(
  typeName: string,
  config: DriftConfig,
): Promise<Map<MutationOperation, string>> {
  let mutationRoot: IntrospectionResult;
  try {
    mutationRoot = await introspectType("Mutation", config);
  } catch {
    throw new Error(
      `Could not introspect Mutation type. Check that mutations are defined and introspection is enabled.`,
    );
  }

  const available = new Map<MutationOperation, string>();
  const operations: MutationOperation[] = ["update", "create", "delete"];

  for (const op of operations) {
    const name = `${op}${typeName}`;
    if (mutationRoot.fields.some((f: IntrospectionField) => f.name === name)) {
      available.set(op, name);
    }
  }

  return available;
}
