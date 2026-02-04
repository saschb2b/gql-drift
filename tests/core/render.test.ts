import { describe, it, expect } from "vitest";
import { formatValue, inputType, parseInput, isEditable } from "../../src/core/render.js";
import type { FieldDefinition } from "../../src/core/types.js";

const stringField: FieldDefinition = {
  key: "name", label: "Name", graphqlPath: "name", type: "string",
};
const numberField: FieldDefinition = {
  key: "total", label: "Total", graphqlPath: "total", type: "number",
};
const dateField: FieldDefinition = {
  key: "createdAt", label: "Created", graphqlPath: "createdAt", type: "date",
};
const boolField: FieldDefinition = {
  key: "isActive", label: "Active", graphqlPath: "isActive", type: "boolean",
};
const enumField: FieldDefinition = {
  key: "status", label: "Status", graphqlPath: "status", type: "enum",
  enumValues: ["PENDING", "SHIPPED", "DELIVERED"],
};

describe("inputType", () => {
  it("returns text for string fields", () => {
    expect(inputType(stringField)).toBe("text");
  });

  it("returns number for number fields", () => {
    expect(inputType(numberField)).toBe("number");
  });

  it("returns date for date fields", () => {
    expect(inputType(dateField)).toBe("date");
  });

  it("returns checkbox for boolean fields", () => {
    expect(inputType(boolField)).toBe("checkbox");
  });

  it("returns select for enum fields", () => {
    expect(inputType(enumField)).toBe("select");
  });
});

describe("formatValue", () => {
  it("formats strings", () => {
    expect(formatValue(stringField, "hello")).toBe("hello");
  });

  it("formats null as empty string", () => {
    expect(formatValue(stringField, null)).toBe("");
    expect(formatValue(numberField, undefined)).toBe("");
  });

  it("formats numbers with locale", () => {
    const result = formatValue(numberField, 1234.5, { locale: "en-US" });
    expect(result).toBe("1,234.5");
  });

  it("formats booleans as Yes/No", () => {
    expect(formatValue(boolField, true)).toBe("Yes");
    expect(formatValue(boolField, false)).toBe("No");
  });

  it("formats enum values as strings", () => {
    expect(formatValue(enumField, "SHIPPED")).toBe("SHIPPED");
  });

  it("formats dates from ISO strings", () => {
    const result = formatValue(dateField, "2024-06-15T00:00:00Z", { locale: "en-US" });
    // Just check it doesn't crash and returns something reasonable
    expect(result).toBeTruthy();
    expect(result).not.toBe("");
  });

  it("returns raw string for invalid dates", () => {
    expect(formatValue(dateField, "not-a-date")).toBe("not-a-date");
  });

  it("returns raw string for NaN numbers", () => {
    expect(formatValue(numberField, "abc")).toBe("abc");
  });
});

describe("parseInput", () => {
  it("parses string input as-is", () => {
    expect(parseInput(stringField, "hello")).toBe("hello");
  });

  it("parses number input", () => {
    expect(parseInput(numberField, "42.5")).toBe(42.5);
  });

  it("throws on invalid number input", () => {
    expect(() => parseInput(numberField, "abc")).toThrow("Invalid number");
  });

  it("parses boolean from string", () => {
    expect(parseInput(boolField, "true")).toBe(true);
    expect(parseInput(boolField, "false")).toBe(false);
  });

  it("parses boolean from boolean", () => {
    expect(parseInput(boolField, true)).toBe(true);
    expect(parseInput(boolField, false)).toBe(false);
  });

  it("parses date as string passthrough", () => {
    expect(parseInput(dateField, "2024-06-15")).toBe("2024-06-15");
  });

  it("parses enum as string passthrough", () => {
    expect(parseInput(enumField, "SHIPPED")).toBe("SHIPPED");
  });
});

describe("isEditable", () => {
  it("returns true when field is in editable set", () => {
    const editableKeys = new Set(["status", "total"]);
    expect(isEditable(enumField, editableKeys)).toBe(true);
    expect(isEditable(numberField, editableKeys)).toBe(true);
  });

  it("returns false when field is not in editable set", () => {
    const editableKeys = new Set(["status"]);
    expect(isEditable(stringField, editableKeys)).toBe(false);
  });
});
