import type { FieldDefinition, FieldType } from "./types.js";

/** HTML input type mapping */
export type HtmlInputType = "text" | "number" | "date" | "checkbox" | "select";

/**
 * Get the appropriate HTML input type for a field.
 *
 * ```tsx
 * <input type={inputType(field)} />
 * // or for enums:
 * if (inputType(field) === "select") {
 *   <select>{field.enumValues.map(v => <option>{v}</option>)}</select>
 * }
 * ```
 */
export function inputType(field: FieldDefinition): HtmlInputType {
  switch (field.type) {
    case "number":
      return "number";
    case "date":
      return "date";
    case "boolean":
      return "checkbox";
    case "enum":
      return "select";
    case "string":
    default:
      return "text";
  }
}

/**
 * Format a raw value for display based on field type.
 *
 * - `string` / `enum`: returns as-is (or `""` for nullish)
 * - `number`: locale-formatted via `toLocaleString()`
 * - `date`: formatted via `toLocaleDateString()` (accepts Date, ISO string, or timestamp)
 * - `boolean`: `"Yes"` / `"No"`
 *
 * Pass `locale` to control number/date formatting (defaults to user's locale).
 */
export function formatValue(
  field: FieldDefinition,
  value: unknown,
  options?: { locale?: string; dateOptions?: Intl.DateTimeFormatOptions },
): string {
  if (value == null) return "";

  switch (field.type) {
    case "string":
    case "enum":
      return String(value);

    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (Number.isNaN(num)) return String(value);
      return num.toLocaleString(options?.locale);
    }

    case "date": {
      const date =
        value instanceof Date
          ? value
          : new Date(value as string | number);
      if (Number.isNaN(date.getTime())) return String(value);
      return date.toLocaleDateString(options?.locale, options?.dateOptions);
    }

    case "boolean":
      return value ? "Yes" : "No";

    default:
      return String(value);
  }
}

/**
 * Parse a raw input string into the correct type for a field.
 * Use this to convert form input values before passing to mutations.
 *
 * - `string` / `enum`: returned as-is
 * - `number`: parsed via `Number()`
 * - `date`: returned as ISO string
 * - `boolean`: truthy check
 */
export function parseInput(field: FieldDefinition, raw: string | boolean): unknown {
  switch (field.type) {
    case "number": {
      const num = Number(raw);
      if (Number.isNaN(num)) {
        throw new Error(`Invalid number for field "${field.key}": ${raw}`);
      }
      return num;
    }
    case "boolean":
      return typeof raw === "boolean" ? raw : raw === "true";
    case "date":
      return String(raw);
    case "string":
    case "enum":
    default:
      return String(raw);
  }
}

/**
 * Check if a field is editable given a set of editable field keys.
 */
export function isEditable(
  field: FieldDefinition,
  editableKeys: Set<string>,
): boolean {
  return editableKeys.has(field.key);
}
