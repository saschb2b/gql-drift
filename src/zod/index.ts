import { z } from "zod";
import type { FieldDefinition } from "../core/types.js";

function zodTypeForField(field: FieldDefinition): z.ZodType {
  switch (field.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "date":
      return z.string();
    case "boolean":
      return z.boolean();
    case "enum":
      if (field.enumValues && field.enumValues.length > 0) {
        return z.enum(field.enumValues as [string, ...string[]]);
      }
      return z.string();
    default:
      return z.string();
  }
}

/**
 * Build a Zod schema for validating flattened query results.
 * Always includes `id: z.string()`.
 * Enum fields get `z.enum()` with their possible values.
 *
 * Validate AFTER flattening so the schema matches the flat shape your UI consumes.
 */
export function buildResultSchema(
  fields: FieldDefinition[],
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = { id: z.string() };
  for (const field of fields) {
    shape[field.key] = zodTypeForField(field);
  }
  return z.object(shape);
}

/**
 * Build a Zod schema for validating user input before building mutation variables.
 * Does NOT include an automatic `id` field.
 * Enum fields get `z.enum()` with their possible values.
 *
 * Validate BEFORE unflattening so the schema matches the flat input shape.
 */
export function buildInputSchema(
  fields: FieldDefinition[],
): z.ZodObject<Record<string, z.ZodType>> {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fields) {
    shape[field.key] = zodTypeForField(field);
  }
  return z.object(shape);
}
