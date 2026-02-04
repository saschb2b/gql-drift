import { readFileSync } from "node:fs";
import { buildSchema, graphqlSync, type GraphQLSchema } from "graphql";
import type { IntrospectionResult, IntrospectionField, MutationOperation } from "../core/types.js";

/**
 * Build a GraphQL schema from an SDL file path.
 */
export function loadSchemaFromFile(path: string): GraphQLSchema {
  const sdl = readFileSync(path, "utf-8");
  try {
    return buildSchema(sdl);
  } catch (err) {
    throw new Error(`Failed to parse schema file "${path}": ${(err as Error).message}`);
  }
}

const TYPE_INTROSPECTION_QUERY = `
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
 * Introspect a type from a local GraphQL schema (no network request needed).
 */
export function introspectTypeFromSchema(
  typeName: string,
  schema: GraphQLSchema,
): IntrospectionResult {
  const result = graphqlSync({
    schema,
    source: TYPE_INTROSPECTION_QUERY,
    variableValues: { typeName },
  });

  if (result.errors?.length) {
    throw new Error(
      `Schema introspection errors: ${result.errors.map((e) => e.message).join(", ")}`,
    );
  }

  const type = (result.data as Record<string, unknown> | undefined)?.__type;
  if (!type) {
    throw new Error(
      `Type "${typeName}" not found in schema. Available types can be viewed with a schema explorer.`,
    );
  }

  return type as IntrospectionResult;
}

/**
 * Discover mutations from a local schema by naming convention.
 */
export function discoverMutationsFromSchema(
  typeName: string,
  schema: GraphQLSchema,
): Map<MutationOperation, string> {
  const available = new Map<MutationOperation, string>();

  let mutationRoot: IntrospectionResult;
  try {
    mutationRoot = introspectTypeFromSchema("Mutation", schema);
  } catch {
    return available;
  }

  const operations: MutationOperation[] = ["update", "create", "delete"];
  for (const op of operations) {
    const name = `${op}${typeName}`;
    if (mutationRoot.fields.some((f: IntrospectionField) => f.name === name)) {
      available.set(op, name);
    }
  }

  return available;
}
