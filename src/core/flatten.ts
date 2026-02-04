import type { FieldDefinition } from "./types.js";

/**
 * Flatten a nested GraphQL response object into flat key-value pairs
 * using the field definitions' graphqlPath mappings.
 *
 * { shippingAddress: { city: "Berlin" } } -> { shippingAddressCity: "Berlin" }
 *
 * Always preserves `id`.
 */
export function flatten(
  data: Record<string, unknown>,
  fields: FieldDefinition[],
): Record<string, unknown> {
  const row: Record<string, unknown> = {};

  if ("id" in data) {
    row.id = data.id;
  }

  for (const field of fields) {
    const parts = field.graphqlPath.split(".");
    let value: unknown = data;
    for (const part of parts) {
      if (value == null) {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[part];
    }
    row[field.key] = value;
  }

  return row;
}

/**
 * Unflatten a flat key-value object back into a nested structure
 * using the field definitions' graphqlPath mappings.
 *
 * { shippingAddressCity: "Berlin" } -> { shippingAddress: { city: "Berlin" } }
 *
 * Only includes keys present in flatData (for sparse/dirty updates).
 */
export function unflatten(
  flatData: Record<string, unknown>,
  fields: FieldDefinition[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const field of fields) {
    if (!(field.key in flatData)) continue;

    const dot = field.graphqlPath.indexOf(".");
    if (dot === -1) {
      // Top-level field
      result[field.graphqlPath] = flatData[field.key];
    } else {
      // Nested field: reconstruct the object
      const parent = field.graphqlPath.slice(0, dot);
      const child = field.graphqlPath.slice(dot + 1);
      result[parent] ??= {};
      (result[parent] as Record<string, unknown>)[child] = flatData[field.key];
    }
  }

  return result;
}
