import { describe, it, expect } from "vitest";
import { buildResultSchema, buildInputSchema } from "../../src/zod/index.js";
import type { FieldDefinition } from "../../src/core/types.js";

const fields: FieldDefinition[] = [
  { key: "orderNumber", label: "Order Number", graphqlPath: "orderNumber", type: "string" },
  { key: "total", label: "Total", graphqlPath: "total", type: "number" },
  { key: "createdAt", label: "Created At", graphqlPath: "createdAt", type: "date" },
  { key: "isActive", label: "Is Active", graphqlPath: "isActive", type: "boolean" },
];

describe("buildResultSchema", () => {
  it("creates a schema that validates correct data", () => {
    const schema = buildResultSchema(fields);
    const valid = {
      id: "1",
      orderNumber: "ORD-001",
      total: 99.99,
      createdAt: "2024-01-01",
      isActive: true,
    };

    expect(() => schema.parse(valid)).not.toThrow();
  });

  it("always includes id field", () => {
    const schema = buildResultSchema([]);
    expect(() => schema.parse({ id: "1" })).not.toThrow();
    expect(() => schema.parse({})).toThrow();
  });

  it("rejects data with wrong types", () => {
    const schema = buildResultSchema(fields);
    const invalid = {
      id: "1",
      orderNumber: 123, // should be string
      total: 99.99,
      createdAt: "2024-01-01",
      isActive: true,
    };

    expect(() => schema.parse(invalid)).toThrow();
  });

  it("rejects data with missing required fields", () => {
    const schema = buildResultSchema(fields);
    expect(() => schema.parse({ id: "1" })).toThrow();
  });
});

describe("buildInputSchema", () => {
  it("creates a schema without automatic id field", () => {
    const schema = buildInputSchema(fields);
    const valid = {
      orderNumber: "ORD-001",
      total: 99.99,
      createdAt: "2024-01-01",
      isActive: true,
    };

    expect(() => schema.parse(valid)).not.toThrow();
  });

  it("does not require id", () => {
    const schema = buildInputSchema(fields);
    const valid = {
      orderNumber: "ORD-001",
      total: 99.99,
      createdAt: "2024-01-01",
      isActive: false,
    };
    // Should pass without id
    expect(() => schema.parse(valid)).not.toThrow();
  });

  it("validates types correctly", () => {
    const schema = buildInputSchema(fields);
    const invalid = {
      orderNumber: "ORD-001",
      total: "not a number",
      createdAt: "2024-01-01",
      isActive: true,
    };

    expect(() => schema.parse(invalid)).toThrow();
  });

  it("maps date type to z.string()", () => {
    const schema = buildInputSchema([
      { key: "createdAt", label: "Created", graphqlPath: "createdAt", type: "date" },
    ]);
    // date fields accept strings
    expect(() => schema.parse({ createdAt: "2024-01-01T00:00:00Z" })).not.toThrow();
    expect(() => schema.parse({ createdAt: 12345 })).toThrow();
  });

  it("validates enum fields with z.enum()", () => {
    const enumFields: FieldDefinition[] = [
      {
        key: "status",
        label: "Status",
        graphqlPath: "status",
        type: "enum",
        enumValues: ["PENDING", "SHIPPED", "DELIVERED"],
      },
    ];
    const schema = buildInputSchema(enumFields);
    expect(() => schema.parse({ status: "PENDING" })).not.toThrow();
    expect(() => schema.parse({ status: "SHIPPED" })).not.toThrow();
    expect(() => schema.parse({ status: "INVALID" })).toThrow();
  });

  it("falls back to z.string() for enum without enumValues", () => {
    const enumFields: FieldDefinition[] = [
      {
        key: "status",
        label: "Status",
        graphqlPath: "status",
        type: "enum",
        enumValues: [],
      },
    ];
    const schema = buildInputSchema(enumFields);
    // Falls back to z.string(), accepts any string
    expect(() => schema.parse({ status: "anything" })).not.toThrow();
    expect(() => schema.parse({ status: 123 })).toThrow();
  });

  it("falls back to z.string() for unknown field types", () => {
    const unknownFields: FieldDefinition[] = [
      {
        key: "data",
        label: "Data",
        graphqlPath: "data",
        type: "unknown" as any,
      },
    ];
    const schema = buildInputSchema(unknownFields);
    expect(() => schema.parse({ data: "some string" })).not.toThrow();
    expect(() => schema.parse({ data: 123 })).toThrow();
  });
});
